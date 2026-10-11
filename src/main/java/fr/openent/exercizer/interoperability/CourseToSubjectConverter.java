package fr.openent.exercizer.interoperability;

import fr.tech.openent.interoperability.model.Activity;
import fr.tech.openent.interoperability.model.ActivityType;
import fr.tech.openent.interoperability.model.Answer;
import fr.tech.openent.interoperability.model.ConversionReport;
import fr.tech.openent.interoperability.model.Course;
import fr.tech.openent.interoperability.model.Question;
import fr.tech.openent.interoperability.model.QuestionType;
import fr.tech.openent.interoperability.model.Section;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Projette un cours du modèle neutre vers la charge utile de {@code POST /subject/import}.
 *
 * La charge utile produite est exactement celle qu'attend
 * {@code SubjectServiceSqlImpl#persistSubjectGrains} : {@code {subject:{…}, grains:[…]}}, chaque
 * grain portant {@code grain_type_id}, {@code order_by} et {@code grain_data}. Passer par cette
 * route plutôt que d'écrire en base nous évite de dupliquer la logique de création d'un sujet.
 *
 * La table de correspondance reproduit celle de l'importeur Moodle XML historique
 * ({@code public/ts/app/services/ImportService.ts}), avec une correction assumée, signalée à sa
 * ligne : cet importeur ne renseigne jamais {@code multipleAnswers}, qui vaut donc {@code false}
 * par défaut — un QCM à plusieurs bonnes réponses y arrivait présenté comme un choix unique.
 *
 * Rien n'est converti de force : un contenu sans équivalent laisse une notice au rapport, que
 * l'enseignant voit avant de valider.
 */
public class CourseToSubjectConverter {

    /**
     * Marqueur d'un trou dans le contenu d'un texte à trous.
     *
     * La directive AngularJS est {@code <fill-zone zone-id="N">} ; tout ce qu'elle contient à
     * l'écran (classes {@code ng-scope}, commentaires {@code ngIf}, champ de saisie) est produit
     * par la compilation Angular, pas lu depuis le contenu. L'importeur historique recopiait une
     * capture du DOM rendu — y compris un {@code </span>} orphelin — là où l'élément nu suffit.
     */
    private static final String FILL_ZONE = "<fill-zone zone-id=\"%d\"></fill-zone>&nbsp;";

    private final ConversionReport report;

    public CourseToSubjectConverter(ConversionReport report) {
        this.report = report == null ? new ConversionReport() : report;
    }

    public ConversionReport report() {
        return report;
    }

    /**
     * @return la charge utile d'import, ou {@code null} si le cours ne produit aucun grain —
     *         {@code POST /subject/import} exige au moins un grain, et un sujet vide n'a de toute
     *         façon aucun intérêt pour l'enseignant.
     */
    public JsonObject toImportPayload(Course course) {
        List<JsonObject> grains = new ArrayList<JsonObject>();

        for (Section section : course.sections()) {
            appendSection(section, grains, course);
        }

        if (grains.isEmpty()) {
            report.error("exercizer.import.empty",
                    "Aucun contenu convertible en grain : le sujet ne serait pas créé.", null);
            return null;
        }

        JsonObject subject = new JsonObject()
                .put("title", title(course))
                .put("folder_id", (Long) null);
        if (course.descriptionHtml() != null && !course.descriptionHtml().isEmpty()) {
            subject.put("description", course.descriptionHtml());
        }

        JsonArray array = new JsonArray();
        int order = 0;
        for (JsonObject grain : grains) {
            array.add(grain.put("order_by", order++));
        }
        return new JsonObject().put("subject", subject).put("grains", array);
    }

    private void appendSection(Section section, List<JsonObject> grains, Course course) {
        // Le titre d'une section n'a pas de porteur propre dans un sujet : il devient un énoncé,
        // ce qui préserve le découpage visible du cours d'origine.
        StringBuilder heading = new StringBuilder();
        if (section.title() != null && !section.title().isEmpty()) {
            heading.append("<h2>").append(escape(section.title())).append("</h2>");
        }
        if (section.summaryHtml() != null && !section.summaryHtml().isEmpty()) {
            heading.append(section.summaryHtml());
        }
        if (heading.length() > 0) {
            grains.add(statementGrain(section.title(), heading.toString()));
        }

        for (Activity activity : section.activities()) {
            appendActivity(activity, grains, course);
        }
    }

    private void appendActivity(Activity activity, List<JsonObject> grains, Course course) {
        String location = activity.title() == null ? "activité" : "« " + activity.title() + " »";

        if (activity.type() == ActivityType.SCORM) {
            // Un SCO est du contenu exécutable : il lui faut un lecteur, pas un grain. Tant que
            // celui-ci n'existe pas, mieux vaut le dire que produire un grain qui n'affiche rien.
            report.dropped("exercizer.scorm.not.supported",
                    "L'activité " + location + " est un module SCORM exécutable : elle exige un "
                            + "lecteur et n'est pas convertible en questions.", activity.id());
            return;
        }

        if (activity.type() == ActivityType.UNSUPPORTED) {
            report.dropped("exercizer.activity.unsupported",
                    "L'activité " + location + " (type « " + activity.sourceType() + " ») n'a pas "
                            + "d'équivalent et n'est pas reprise.", activity.id());
            return;
        }

        StringBuilder body = new StringBuilder();
        if (activity.title() != null && !activity.title().isEmpty()) {
            body.append("<h3>").append(escape(activity.title())).append("</h3>");
        }
        if (activity.contentHtml() != null && !activity.contentHtml().isEmpty()) {
            body.append(activity.contentHtml());
        }
        if (activity.type() == ActivityType.URL && activity.url() != null) {
            body.append("<p><a href=\"").append(escapeAttribute(activity.url())).append("\">")
                    .append(escape(activity.url())).append("</a></p>");
        }

        // Un contenu sans question devient un énoncé ; avec des questions, il sert de chapeau.
        if (body.length() > 0) {
            grains.add(statementGrain(activity.title(), body.toString()));
        }

        for (Question question : activity.questions()) {
            JsonObject grain = toGrain(question, location);
            if (grain != null) {
                grains.add(grain);
            }
        }

        if (activity.type() == ActivityType.FILE && !activity.assetRefs().isEmpty()) {
            report.degraded("exercizer.files.not.attached",
                    "L'activité " + location + " porte " + activity.assetRefs().size()
                            + " fichier(s) : ils ne sont pas rattachés au sujet, seul le texte "
                            + "est repris.", activity.id());
        }
    }

    private JsonObject toGrain(Question question, String location) {
        switch (question.type()) {
            case STATEMENT:
                return statementGrain(question.title(), question.promptHtml());
            case SINGLE_CHOICE:
            case MULTIPLE_CHOICE:
            case TRUE_FALSE:
                return qcmGrain(question);
            case SHORT_ANSWER:
            case NUMERICAL:
                return shortAnswerGrain(question);
            case ESSAY:
                return openAnswerGrain(question);
            case MATCHING:
                return associationGrain(question);
            case ORDERING:
                return orderingGrain(question);
            case CLOZE:
                return clozeGrain(question, location);
            default:
                report.dropped("exercizer.question.unsupported",
                        "Question de type " + question.type() + " sans équivalent dans "
                                + location + ".", question.id());
                return null;
        }
    }

    // ------------------------------------------------------------------ fabriques de grains

    private JsonObject statementGrain(String title, String html) {
        JsonObject data = new JsonObject();
        if (title != null && !title.isEmpty()) {
            data.put("title", title);
        }
        // Piège du modèle : pour un grain de type 3, l'énoncé vit dans custom_data.statement et
        // NON dans grain_data.statement. S'y tromper produit un grain qui n'affiche rien.
        data.put("custom_data", new JsonObject().put("statement", html == null ? "" : html));
        return grain(GrainType.STATEMENT, data);
    }

    private JsonObject qcmGrain(Question question) {
        JsonArray answers = new JsonArray();
        int correct = 0;
        for (Answer answer : question.answers()) {
            boolean isCorrect = answer.isCorrect();
            if (isCorrect) {
                correct++;
            }
            answers.add(new JsonObject()
                    .put("text", plainText(answer.textHtml()))
                    .put("isChecked", isCorrect));
        }
        JsonObject customData = new JsonObject()
                .put("correct_answer_list", answers)
                // Correction par rapport à l'importeur Moodle XML historique, qui ne renseigne
                // jamais ce champ : il vaut alors false, et un QCM à plusieurs bonnes réponses
                // arrive présenté comme un choix unique. Le modèle neutre connaît la cardinalité.
                .put("multipleAnswers", correct > 1)
                .put("no_error_allowed", correct == 1);
        return grain(GrainType.QCM, data(question, customData, correct));
    }

    private JsonObject shortAnswerGrain(Question question) {
        List<Answer> correct = correctAnswers(question);
        if (correct.size() <= 1) {
            String expected = correct.isEmpty() ? "" : plainText(correct.get(0).textHtml());
            JsonObject customData = new JsonObject().put("correct_answer", expected);
            return grain(GrainType.SIMPLE_ANSWER, data(question, customData, 1));
        }
        JsonArray list = new JsonArray();
        for (Answer answer : correct) {
            list.add(new JsonObject().put("text", plainText(answer.textHtml())));
        }
        JsonObject customData = new JsonObject()
                .put("correct_answer_list", list)
                .put("no_error_allowed", false);
        return grain(GrainType.MULTIPLE_ANSWERS, data(question, customData, correct.size()));
    }

    private JsonObject openAnswerGrain(Question question) {
        return grain(GrainType.OPEN_ANSWER, data(question, null, 1));
    }

    private JsonObject associationGrain(Question question) {
        JsonArray pairs = new JsonArray();
        for (Answer answer : question.answers()) {
            pairs.add(new JsonObject()
                    .put("text_left", plainText(answer.textHtml()))
                    .put("text_right", plainText(answer.matchHtml())));
        }
        JsonObject customData = new JsonObject()
                .put("correct_answer_list", pairs)
                // Aucun des formats sources ne transporte ces deux réglages : on reprend les
                // valeurs par défaut de l'importeur historique plutôt que d'en inventer.
                .put("show_left_column", true)
                .put("no_error_allowed", false);
        return grain(GrainType.ASSOCIATION, data(question, customData, pairs.size()));
    }

    private JsonObject orderingGrain(Question question) {
        JsonArray items = new JsonArray();
        int rank = 1;
        for (Answer answer : question.answers()) {
            items.add(new JsonObject()
                    .put("text", plainText(answer.textHtml()))
                    .put("order_by", answer.order() > 0 ? answer.order() : rank));
            rank++;
        }
        JsonObject customData = new JsonObject()
                .put("correct_answer_list", items)
                .put("no_error_allowed", false);
        return grain(GrainType.ORDER_BY, data(question, customData, items.size()));
    }

    /**
     * Texte à trous.
     *
     * Le modèle neutre marque les trous par {@code [[n]]} dans l'énoncé et rattache chaque
     * proposition à son trou. exercizer attend l'inverse : un contenu HTML où chaque trou est une
     * balise {@code <fill-zone zone-id="N">}, et une liste de zones portant la bonne réponse et
     * ses leurres.
     */
    private JsonObject clozeGrain(Question question, String location) {
        String html = question.promptHtml() == null ? "" : question.promptHtml();
        JsonArray zones = new JsonArray();
        int zoneIndex = 0;

        for (Answer answer : question.answers()) {
            if (answer.gap() <= 0) {
                continue;
            }
            String marker = "[[" + answer.gap() + "]]";
            if (!html.contains(marker)) {
                // La proposition désigne un trou que l'énoncé ne contient pas : la placer
                // arbitrairement changerait l'exercice.
                report.degraded("exercizer.cloze.gap.missing",
                        "Le texte à trous de " + location + " cite un trou numéro " + answer.gap()
                                + " absent de son énoncé : cette proposition est ignorée.",
                        question.id());
                continue;
            }
            JsonArray options = new JsonArray().add(plainText(answer.textHtml()));
            zones.add(new JsonObject()
                    .put("id", zoneIndex)
                    .put("answer", plainText(answer.textHtml()))
                    .put("options", options));
            html = html.replace(marker, String.format(FILL_ZONE, zoneIndex));
            zoneIndex++;
        }

        if (zones.isEmpty()) {
            report.dropped("exercizer.cloze.no.gap",
                    "Le texte à trous de " + location + " n'a aucun trou exploitable : il n'est "
                            + "pas repris.", question.id());
            return null;
        }

        JsonObject customData = new JsonObject()
                .put("htmlContent", html)
                .put("zones", zones)
                .put("options", new JsonArray())
                // « list » : le trou propose une liste déroulante. « drag » exige des leurres
                // communs que nos sources ne distinguent pas toujours.
                .put("answersType", "list");
        JsonObject data = data(question, customData, zones.size());
        // Pour ce type, l'énoncé vit dans custom_data.htmlContent : le laisser aussi dans
        // grain_data.statement l'afficherait deux fois.
        data.remove("statement");
        return grain(GrainType.TEXT_TO_FILL, data);
    }

    // ------------------------------------------------------------------ utilitaires

    private JsonObject data(Question question, JsonObject customData, int fallbackScore) {
        JsonObject data = new JsonObject();
        if (question.title() != null && !question.title().isEmpty()) {
            data.put("title", question.title());
        }
        data.put("statement", question.promptHtml() == null ? "" : question.promptHtml());
        data.put("max_score", question.defaultMark() > 0d
                ? question.defaultMark() : (double) Math.max(fallbackScore, 1));
        if (question.generalFeedbackHtml() != null && !question.generalFeedbackHtml().isEmpty()) {
            data.put("answer_explanation", question.generalFeedbackHtml());
        }
        if (customData != null) {
            data.put("custom_data", customData);
        }
        return data;
    }

    private JsonObject grain(long typeId, JsonObject data) {
        return new JsonObject()
                .put("grain_type_id", typeId)
                .put("grain_data", data);
    }

    private List<Answer> correctAnswers(Question question) {
        List<Answer> correct = new ArrayList<Answer>();
        for (Answer answer : question.answers()) {
            if (answer.isCorrect()) {
                correct.add(answer);
            }
        }
        return correct;
    }

    private String title(Course course) {
        if (course.title() != null && !course.title().trim().isEmpty()) {
            return course.title().trim();
        }
        return "Cours importé";
    }

    /**
     * Une proposition de réponse est affichée en texte brut par exercizer : y laisser du balisage
     * l'afficherait littéralement.
     */
    private static String plainText(String html) {
        if (html == null) {
            return "";
        }
        return html.replaceAll("<[^>]*>", "").trim();
    }

    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String escapeAttribute(String value) {
        return escape(value).replace("\"", "&quot;");
    }
}
