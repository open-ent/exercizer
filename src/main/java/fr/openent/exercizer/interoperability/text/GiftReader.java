package fr.openent.exercizer.interoperability.text;

import fr.tech.openent.interoperability.model.Activity;
import fr.tech.openent.interoperability.model.ActivityType;
import fr.tech.openent.interoperability.model.Answer;
import fr.tech.openent.interoperability.model.ConversionReport;
import fr.tech.openent.interoperability.model.Course;
import fr.tech.openent.interoperability.model.Question;
import fr.tech.openent.interoperability.model.QuestionType;
import fr.tech.openent.interoperability.model.Section;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lecture du format texte GIFT de Moodle vers le modèle de cours neutre.
 *
 * <p>GIFT n'est pas lu par la bibliothèque d'interopérabilité, et c'est pourtant le format que
 * les enseignants écrivent à la main ou échangent par courriel. Le projeter vers le modèle neutre
 * plutôt que directement vers des grains garde une seule table de correspondance vers exercizer :
 * celle de {@code CourseToSubjectConverter}.</p>
 *
 * <p>Ce qui est reconnu (documentation Moodle « GIFT format ») : titre {@code ::…::}, préfixe de
 * format {@code [html]}/{@code [plain]}/{@code [markdown]}/{@code [moodle]}, catégories
 * {@code $CATEGORY:}, commentaires {@code //}, échappements {@code \~ \= \# \{ \} \:} ;
 * vrai/faux, choix unique, choix multiple pondéré, réponse courte, appariement, numérique
 * (valeur:tolérance, intervalle min..max, réponses multiples), rédaction ({@code {}}), mot
 * manquant (accolades au milieu de la phrase) et description (pas d'accolades).</p>
 */
public final class GiftReader {

    /** Une ligne qui ne porte qu'une catégorie : elle ouvre une nouvelle partie du sujet. */
    private static final Pattern CATEGORY = Pattern.compile("^\\$CATEGORY:\\s*(.*)$");
    private static final Pattern WEIGHT = Pattern.compile("^%(-?\\d+(?:[.,]\\d+)?)%");
    private static final Pattern FORMAT = Pattern.compile("^\\[(html|plain|markdown|moodle)\\]",
            Pattern.CASE_INSENSITIVE);

    private final ConversionReport report;

    public GiftReader(ConversionReport report) {
        this.report = report == null ? new ConversionReport() : report;
    }

    /**
     * Le texte ressemble-t-il à du GIFT ? Au moins un bloc porte une paire d'accolades non
     * échappées, ou un titre {@code ::…::}. Un texte sans aucune de ces marques n'est pas du GIFT
     * (ce serait, au mieux, une suite de descriptions).
     */
    public static boolean looksLikeGift(String text) {
        for (String block : blocks(text)) {
            if (block.startsWith("$CATEGORY:")) {
                continue;
            }
            int open = indexOfUnescaped(block, '{', 0);
            if (open >= 0 && indexOfUnescaped(block, '}', open) > open) {
                return true;
            }
            if (block.startsWith("::") && indexOfUnescaped(block, ':', 2) > 0
                    && block.indexOf("::", 2) > 0) {
                return true;
            }
        }
        return false;
    }

    public Course read(String text, String fallbackTitle) {
        Course course = new Course().title(fallbackTitle).sourceSystem("GIFT");
        Section section = newSection(null, 0);
        Activity activity = newActivity(section);
        int sectionOrder = 0;
        int questionIndex = 0;

        for (String block : blocks(text)) {
            Matcher category = CATEGORY.matcher(block);
            if (category.matches()) {
                // Une catégorie vide ne change rien ; sinon elle ouvre une partie titrée — la
                // dernière portion du chemin ($course$/Top/Chapitre 1 → « Chapitre 1 »).
                String path = category.group(1).trim();
                if (path.isEmpty()) {
                    continue;
                }
                if (!activity.questions().isEmpty()) {
                    course.addSection(section);
                    sectionOrder++;
                }
                String[] parts = path.split("/");
                section = newSection(parts[parts.length - 1].trim(), sectionOrder);
                activity = newActivity(section);
                continue;
            }
            questionIndex++;
            Question question = parseQuestion(block, questionIndex);
            if (question != null) {
                activity.addQuestion(question);
            }
        }
        if (!activity.questions().isEmpty()) {
            course.addSection(section);
        }
        return course;
    }

    // ------------------------------------------------------------------ découpage

    /**
     * Découpe en blocs : les questions sont séparées par au moins une ligne vide ; les lignes de
     * commentaire ({@code //} en tête) sont retirées, une catégorie forme un bloc à elle seule.
     */
    static List<String> blocks(String text) {
        List<String> blocks = new ArrayList<String>();
        if (text == null) {
            return blocks;
        }
        String normalized = text.replace("﻿", "").replace("\r\n", "\n").replace('\r', '\n');
        StringBuilder current = new StringBuilder();
        for (String line : normalized.split("\n", -1)) {
            String trimmed = line.trim();
            if (trimmed.startsWith("//")) {
                continue;
            }
            if (trimmed.startsWith("$CATEGORY:")) {
                flush(blocks, current);
                blocks.add(trimmed);
                continue;
            }
            if (trimmed.isEmpty()) {
                flush(blocks, current);
                continue;
            }
            if (current.length() > 0) {
                current.append('\n');
            }
            current.append(line);
        }
        flush(blocks, current);
        return blocks;
    }

    private static void flush(List<String> blocks, StringBuilder current) {
        String block = current.toString().trim();
        if (!block.isEmpty()) {
            blocks.add(block);
        }
        current.setLength(0);
    }

    // ------------------------------------------------------------------ une question

    private Question parseQuestion(String block, int index) {
        String location = "question " + index;
        String rest = block;
        String title = null;

        if (rest.startsWith("::")) {
            int end = rest.indexOf("::", 2);
            while (end > 0 && rest.charAt(end - 1) == '\\') {
                end = rest.indexOf("::", end + 2);
            }
            if (end > 0) {
                title = unescape(rest.substring(2, end)).trim();
                rest = rest.substring(end + 2).trim();
                location = "« " + title + " »";
            }
        }

        boolean html = false;
        Matcher format = FORMAT.matcher(rest);
        if (format.find()) {
            html = "html".equalsIgnoreCase(format.group(1)) || "moodle".equalsIgnoreCase(format.group(1));
            rest = rest.substring(format.end());
        }

        int open = indexOfUnescaped(rest, '{', 0);
        int close = open < 0 ? -1 : indexOfUnescaped(rest, '}', open + 1);
        if (open < 0 || close < 0) {
            if (open >= 0) {
                report.degraded("gift.braces.unclosed",
                        "La " + location + " ouvre une accolade sans la fermer : elle est reprise "
                                + "comme simple texte.", null);
            }
            return new Question().id("gift-" + index).type(QuestionType.STATEMENT)
                    .title(title).promptHtml(toHtml(rest, html)).defaultMark(0d)
                    .sourceType("description");
        }

        String before = rest.substring(0, open).trim();
        String inside = rest.substring(open + 1, close).trim();
        String after = rest.substring(close + 1).trim();
        Question question = new Question().id("gift-" + index).title(title);

        // Le format de la réponse peut lui aussi porter un préfixe : il ne change pas le type.
        Matcher innerFormat = FORMAT.matcher(inside);
        if (innerFormat.find()) {
            inside = inside.substring(innerFormat.end()).trim();
        }

        // Rétroaction générale : « #### texte » en fin de bloc de réponses.
        int general = inside.indexOf("####");
        if (general >= 0) {
            question.generalFeedbackHtml(toHtml(inside.substring(general + 4).trim(), html));
            inside = inside.substring(0, general).trim();
        }

        boolean missingWord = !after.isEmpty() && !before.isEmpty();
        String prompt = missingWord
                ? toHtml(before, html) + " [[1]] " + toHtml(after, html)
                : toHtml(before + (after.isEmpty() ? "" : " " + after), html);
        question.promptHtml(prompt);

        if (inside.isEmpty()) {
            if (missingWord) {
                report.dropped("gift.missingword.empty",
                        "La " + location + " a un trou sans réponse : elle n'est pas reprise.", null);
                return null;
            }
            return question.type(QuestionType.ESSAY).sourceType("essay");
        }

        if (inside.startsWith("#")) {
            return numerical(question, inside.substring(1).trim(), location, missingWord);
        }

        String upper = inside.split("#", 2)[0].trim().toUpperCase();
        if (upper.equals("T") || upper.equals("TRUE") || upper.equals("F") || upper.equals("FALSE")) {
            boolean truth = upper.startsWith("T");
            return question.type(QuestionType.TRUE_FALSE).sourceType("truefalse")
                    .addAnswer(new Answer().id("true").textHtml("Vrai").fraction(truth ? 1d : 0d))
                    .addAnswer(new Answer().id("false").textHtml("Faux").fraction(truth ? 0d : 1d));
        }

        List<Item> items = items(inside);
        if (items.isEmpty()) {
            report.dropped("gift.answers.unreadable",
                    "Les réponses de la " + location + " sont illisibles : elle n'est pas reprise.", null);
            return null;
        }

        boolean matching = true;
        boolean anyWrong = false;
        for (Item item : items) {
            if (!item.correct) {
                anyWrong = true;
            }
            if (!item.correct || indexOfArrow(item.text) < 0) {
                matching = false;
            }
        }

        if (matching && !missingWord) {
            question.type(QuestionType.MATCHING).sourceType("matching");
            int order = 0;
            for (Item item : items) {
                int arrow = indexOfArrow(item.text);
                String left = item.text.substring(0, arrow).trim();
                String right = item.text.substring(arrow + 2).trim();
                if (left.isEmpty()) {
                    // GIFT admet une proposition de droite sans gauche (un leurre) : exercizer
                    // n'a pas de leurre dans une association, elle est écartée.
                    report.degraded("gift.matching.distractor",
                            "Un leurre de l'appariement de la " + location + " (« " + right
                                    + " ») n'a pas d'équivalent : il est ignoré.", null);
                    continue;
                }
                question.addAnswer(new Answer().id("m" + order).order(++order)
                        .textHtml(toHtml(left, html)).matchHtml(toHtml(right, html)).fraction(1d));
            }
            return question;
        }

        if (missingWord) {
            question.type(QuestionType.CLOZE).sourceType(anyWrong ? "missingword-choice" : "missingword");
            int order = 0;
            for (Item item : items) {
                question.addAnswer(new Answer().id("g" + order).order(++order).gap(1)
                        .textHtml(toHtml(item.text, html)).fraction(item.fraction)
                        .feedbackHtml(item.feedback == null ? null : toHtml(item.feedback, html)));
            }
            return question;
        }

        if (!anyWrong) {
            // Que des « = » : réponse courte, chaque forme acceptée.
            question.type(QuestionType.SHORT_ANSWER).sourceType("shortanswer");
        } else {
            int correct = 0;
            for (Item item : items) {
                if (item.fraction > 0d) {
                    correct++;
                }
            }
            question.type(correct > 1 ? QuestionType.MULTIPLE_CHOICE : QuestionType.SINGLE_CHOICE)
                    .multiple(correct > 1).sourceType("multichoice");
            boolean partial = false;
            for (Item item : items) {
                if (item.fraction > 0d && item.fraction < 1d && correct == 1) {
                    partial = true;
                }
            }
            if (partial) {
                report.degraded("gift.partial.credit",
                        "La " + location + " accorde un crédit partiel : exercizer note un QCM "
                                + "tout ou rien.", null);
            }
        }
        int order = 0;
        for (Item item : items) {
            question.addAnswer(new Answer().id("a" + order).order(++order)
                    .textHtml(toHtml(item.text, html)).fraction(item.fraction)
                    .feedbackHtml(item.feedback == null ? null : toHtml(item.feedback, html)));
        }
        return question;
    }

    private Question numerical(Question question, String body, String location, boolean missingWord) {
        question.type(QuestionType.NUMERICAL).sourceType("numerical");
        List<String> forms = new ArrayList<String>();
        if (body.startsWith("=")) {
            for (Item item : items(body)) {
                if (item.correct) {
                    forms.add(item.text);
                }
            }
        } else {
            forms.add(body.split("#", 2)[0].trim());
        }
        int order = 0;
        for (String form : forms) {
            String value = form.trim();
            double tolerance = 0d;
            int range = value.indexOf("..");
            int colon = value.indexOf(':');
            try {
                if (range > 0) {
                    double min = Double.parseDouble(value.substring(0, range).trim().replace(',', '.'));
                    double max = Double.parseDouble(value.substring(range + 2).trim().replace(',', '.'));
                    double mid = (min + max) / 2d;
                    tolerance = Math.abs(max - min) / 2d;
                    value = format(mid);
                } else if (colon > 0) {
                    tolerance = Math.abs(Double.parseDouble(value.substring(colon + 1).trim().replace(',', '.')));
                    value = format(Double.parseDouble(value.substring(0, colon).trim().replace(',', '.')));
                } else {
                    value = format(Double.parseDouble(value.replace(',', '.')));
                }
            } catch (NumberFormatException e) {
                report.dropped("gift.numerical.unreadable",
                        "La valeur numérique « " + form + " » de la " + location + " est illisible.", null);
                continue;
            }
            question.addAnswer(new Answer().id("n" + order).order(++order).textHtml(value)
                    .tolerance(tolerance).fraction(1d).gap(missingWord ? 1 : 0));
        }
        if (question.answers().isEmpty()) {
            return null;
        }
        if (missingWord) {
            question.type(QuestionType.CLOZE);
        }
        return question;
    }

    /** Un entier reste un entier : « 1492 » et non « 1492.0 », que l'élève ne taperait jamais. */
    private static String format(double value) {
        if (value == Math.rint(value) && !Double.isInfinite(value)) {
            return String.valueOf((long) value);
        }
        return String.valueOf(value);
    }

    // ------------------------------------------------------------------ réponses

    private static final class Item {
        boolean correct;
        double fraction;
        String text;
        String feedback;
    }

    /** Découpe le contenu des accolades en propositions, chacune ouverte par un « = » ou un « ~ » non échappé. */
    private static List<Item> items(String inside) {
        List<Item> items = new ArrayList<Item>();
        List<Integer> starts = new ArrayList<Integer>();
        for (int i = 0; i < inside.length(); i++) {
            char c = inside.charAt(i);
            if ((c == '=' || c == '~') && !escaped(inside, i)) {
                starts.add(i);
            }
        }
        for (int k = 0; k < starts.size(); k++) {
            int start = starts.get(k);
            int end = k + 1 < starts.size() ? starts.get(k + 1) : inside.length();
            String raw = inside.substring(start + 1, end).trim();
            Item item = new Item();
            item.correct = inside.charAt(start) == '=';
            item.fraction = item.correct ? 1d : 0d;
            Matcher weight = WEIGHT.matcher(raw);
            if (weight.find()) {
                double percent = Double.parseDouble(weight.group(1).replace(',', '.'));
                item.fraction = Math.max(0d, percent / 100d);
                raw = raw.substring(weight.end()).trim();
            }
            int hash = indexOfUnescaped(raw, '#', 0);
            if (hash >= 0) {
                item.feedback = raw.substring(hash + 1).trim();
                raw = raw.substring(0, hash).trim();
            }
            // Texte laissé échappé : toHtml() le déséchappe une seule fois, au moment de l'écrire.
            item.text = raw;
            items.add(item);
        }
        return items;
    }

    private static int indexOfArrow(String text) {
        return text.indexOf("->");
    }

    // ------------------------------------------------------------------ texte

    static int indexOfUnescaped(String text, char target, int from) {
        for (int i = Math.max(0, from); i < text.length(); i++) {
            if (text.charAt(i) == target && !escaped(text, i)) {
                return i;
            }
        }
        return -1;
    }

    private static boolean escaped(String text, int index) {
        int backslashes = 0;
        for (int i = index - 1; i >= 0 && text.charAt(i) == '\\'; i--) {
            backslashes++;
        }
        return backslashes % 2 == 1;
    }

    static String unescape(String text) {
        return text.replace("\\n", "\n").replaceAll("\\\\([~=#{}:\\\\])", "$1");
    }

    /**
     * En texte brut, l'enseignant a écrit du texte : on l'échappe et les sauts de ligne
     * deviennent des {@code <br>}. En HTML, on le reprend tel quel.
     */
    private static String toHtml(String text, boolean html) {
        String value = unescape(text == null ? "" : text.trim());
        if (html) {
            return value;
        }
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\n", "<br>");
    }

    private static Section newSection(String title, int order) {
        return new Section().id("gift-section-" + order).title(title).order(order).visible(true);
    }

    private static Activity newActivity(Section section) {
        Activity activity = new Activity().id(section.id() + "-quiz").type(ActivityType.QUIZ)
                .order(0).visible(true);
        section.addActivity(activity);
        return activity;
    }
}
