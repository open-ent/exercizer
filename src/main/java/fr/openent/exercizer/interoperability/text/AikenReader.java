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
 * Lecture du format texte Aiken (Moodle) : des QCM à une seule bonne réponse.
 *
 * <pre>
 * Quelle est la capitale de l'Italie ?
 * A. Milan
 * B) Rome
 * ANSWER: B
 * </pre>
 *
 * La question peut courir sur plusieurs lignes ; chaque proposition commence par une lettre
 * majuscule suivie d'un point ou d'une parenthèse ; la ligne {@code ANSWER:} clôt la question.
 */
public final class AikenReader {

    private static final Pattern OPTION = Pattern.compile("^([A-Z])[.)]\\s+(.+)$");
    private static final Pattern ANSWER = Pattern.compile("^ANSWER:\\s*([A-Z])\\s*$");

    private final ConversionReport report;

    public AikenReader(ConversionReport report) {
        this.report = report == null ? new ConversionReport() : report;
    }

    /** Au moins une question complète : une ligne de réponse précédée d'au moins deux propositions. */
    public static boolean looksLikeAiken(String text) {
        int options = 0;
        for (String line : lines(text)) {
            String trimmed = line.trim();
            if (OPTION.matcher(trimmed).matches()) {
                options++;
            } else if (ANSWER.matcher(trimmed).matches()) {
                return options >= 2;
            }
        }
        return false;
    }

    public Course read(String text, String fallbackTitle) {
        Course course = new Course().title(fallbackTitle).sourceSystem("Aiken");
        Section section = new Section().id("aiken-section").order(0).visible(true);
        Activity activity = new Activity().id("aiken-quiz").type(ActivityType.QUIZ).order(0).visible(true);
        section.addActivity(activity);

        StringBuilder prompt = new StringBuilder();
        List<String[]> options = new ArrayList<String[]>();
        int index = 0;
        for (String line : lines(text)) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            Matcher answer = ANSWER.matcher(trimmed);
            if (answer.matches()) {
                index++;
                Question question = build(prompt.toString(), options, answer.group(1), index);
                if (question != null) {
                    activity.addQuestion(question);
                }
                prompt.setLength(0);
                options.clear();
                continue;
            }
            Matcher option = OPTION.matcher(trimmed);
            if (option.matches() && prompt.length() > 0) {
                options.add(new String[] {option.group(1), option.group(2).trim()});
                continue;
            }
            if (!options.isEmpty()) {
                // Une ligne de texte après des propositions, sans ANSWER : question mal formée.
                report.dropped("aiken.answer.missing",
                        "La question « " + shorten(prompt.toString()) + " » n'a pas de ligne ANSWER : "
                                + "elle n'est pas reprise.", null);
                prompt.setLength(0);
                options.clear();
            }
            if (prompt.length() > 0) {
                prompt.append('\n');
            }
            prompt.append(trimmed);
        }
        if (prompt.length() > 0) {
            report.dropped("aiken.answer.missing",
                    "La question « " + shorten(prompt.toString()) + " » n'a pas de ligne ANSWER : "
                            + "elle n'est pas reprise.", null);
        }
        if (!activity.questions().isEmpty()) {
            course.addSection(section);
        }
        return course;
    }

    private Question build(String prompt, List<String[]> options, String letter, int index) {
        if (prompt.trim().isEmpty() || options.size() < 2) {
            report.dropped("aiken.question.incomplete",
                    "La question " + index + " n'a pas d'énoncé ou moins de deux propositions : "
                            + "elle n'est pas reprise.", null);
            return null;
        }
        Question question = new Question().id("aiken-" + index).type(QuestionType.SINGLE_CHOICE)
                .promptHtml("<p>" + escape(prompt).replace("\n", "<br>") + "</p>")
                .sourceType("aiken");
        boolean found = false;
        int order = 0;
        for (String[] option : options) {
            boolean correct = option[0].equals(letter);
            found |= correct;
            question.addAnswer(new Answer().id("a" + order).order(++order)
                    .textHtml(escape(option[1])).fraction(correct ? 1d : 0d));
        }
        if (!found) {
            report.dropped("aiken.answer.unknown",
                    "La réponse « " + letter + " » de la question " + index + " ne désigne aucune "
                            + "proposition : la question n'est pas reprise.", null);
            return null;
        }
        return question;
    }

    private static List<String> lines(String text) {
        List<String> lines = new ArrayList<String>();
        if (text == null) {
            return lines;
        }
        for (String line : text.replace("﻿", "").replace("\r\n", "\n").replace('\r', '\n')
                .split("\n", -1)) {
            lines.add(line);
        }
        return lines;
    }

    private static String shorten(String text) {
        String flat = text.replace('\n', ' ').trim();
        return flat.length() > 60 ? flat.substring(0, 57) + "…" : flat;
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
