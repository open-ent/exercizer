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

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Projette un sujet exercizer vers le modèle de cours neutre, pour l'exporter.
 *
 * Chemin inverse de {@link CourseToSubjectConverter}. L'entrée est celle que produit déjà
 * {@code GrainServiceSqlImpl#getGrainsForExport} — une liste de {@code {name, grain_data}}
 * ordonnée par {@code order_by} — afin de n'ajouter aucune requête.
 *
 * Un sujet n'a pas de sections : tous ses grains forment une activité unique. C'est volontaire,
 * le découpage n'existant pas dans le modèle d'exercizer ; en inventer un à l'export produirait
 * une structure que l'enseignant n'a pas créée.
 */
public class SubjectToCourseConverter {

    /** Les trois types « à zones » ne sont pas convertibles ; leurs identifiants sont 11 et 12. */
    private static final String AREA_SELECT = "area_select";
    private static final String AREA_SELECT_IMAGE = "area_select_image";

    /** Un trou dans le contenu d'un texte à trous, tel que l'écrit exercizer. */
    private static final Pattern FILL_ZONE =
            Pattern.compile("<fill-zone[^>]*zone-id=\"(\\d+)\"[^>]*>(?:.*?</fill-zone>)?",
                    Pattern.DOTALL);

    private final ConversionReport report;

    public SubjectToCourseConverter(ConversionReport report) {
        this.report = report == null ? new ConversionReport() : report;
    }

    public ConversionReport report() {
        return report;
    }

    /**
     * @param grains lignes {@code {name, grain_data}} dans l'ordre du sujet
     */
    public Course convert(JsonObject subject, JsonArray grains) {
        Course course = new Course()
                .id(subject.getValue("id") == null ? null : String.valueOf(subject.getValue("id")))
                .title(subject.getString("title"))
                .descriptionHtml(subject.getString("description"))
                .language("fr");

        Activity activity = new Activity()
                .id("subject")
                .type(ActivityType.QUIZ)
                .title(subject.getString("title"))
                .sourceType("exercizer-subject");

        for (int i = 0; i < grains.size(); i++) {
            Object raw = grains.getValue(i);
            if (!(raw instanceof JsonObject)) {
                continue;
            }
            JsonObject grain = (JsonObject) raw;
            Question question = toQuestion(grain, i + 1);
            if (question != null) {
                activity.addQuestion(question);
            }
        }

        if (activity.questions().isEmpty()) {
            report.error("exercizer.export.empty",
                    "Le sujet ne contient aucun grain exportable.", null);
        }

        course.addSection(new Section()
                .id("subject")
                .title(subject.getString("title"))
                .order(0)
                .addActivity(activity));
        return course;
    }

    private Question toQuestion(JsonObject grain, int rank) {
        String type = grain.getString("name");
        JsonObject data = grainData(grain);
        JsonObject customData = data.getJsonObject("custom_data", new JsonObject());
        String location = "grain #" + rank + (type == null ? "" : " (" + type + ")");

        if (AREA_SELECT.equals(type) || AREA_SELECT_IMAGE.equals(type)) {
            // Les zones à cliquer reposent sur des coordonnées dans une image : aucun des formats
            // cibles ne sait les représenter, et les aplatir en liste changerait l'exercice.
            report.dropped("exercizer.area.not.exportable",
                    "Le grain à zones de " + location + " n'a d'équivalent dans aucun format "
                            + "cible : il n'est pas exporté.", location);
            return null;
        }

        Question question = new Question()
                .id(String.valueOf(rank))
                .title(data.getString("title"))
                .sourceType(type)
                .defaultMark(readDouble(data.getValue("max_score"), 1d))
                .generalFeedbackHtml(data.getString("answer_explanation"));

        if ("statement".equals(type)) {
            // Piège du modèle : pour un énoncé, le texte vit dans custom_data.statement.
            return question.type(QuestionType.STATEMENT)
                    .promptHtml(customData.getString("statement", data.getString("statement", "")));
        }

        question.promptHtml(data.getString("statement", ""));

        if ("qcm".equals(type)) {
            return fillQcm(question, customData);
        }
        if ("simple_answer".equals(type)) {
            return question.type(QuestionType.SHORT_ANSWER)
                    .addAnswer(new Answer()
                            .textHtml(customData.getString("correct_answer", ""))
                            .fraction(1d));
        }
        if ("multiple_answers".equals(type)) {
            return fillMultipleAnswers(question, customData);
        }
        if ("open_answer".equals(type)) {
            return question.type(QuestionType.ESSAY);
        }
        if ("association".equals(type)) {
            return fillAssociation(question, customData);
        }
        if ("order_by".equals(type)) {
            return fillOrdering(question, customData);
        }
        if ("text_to_fill".equals(type)) {
            return fillCloze(question, customData, location);
        }

        report.dropped("exercizer.grain.unsupported",
                "Le grain de type « " + type + " » (" + location + ") n'est pas exporté.",
                location);
        return null;
    }

    private Question fillQcm(Question question, JsonObject customData) {
        JsonArray answers = customData.getJsonArray("correct_answer_list", new JsonArray());
        int correct = 0;
        for (int i = 0; i < answers.size(); i++) {
            if (answers.getJsonObject(i).getBoolean("isChecked", false)) {
                correct++;
            }
        }
        for (int i = 0; i < answers.size(); i++) {
            JsonObject answer = answers.getJsonObject(i);
            boolean checked = answer.getBoolean("isChecked", false);
            question.addAnswer(new Answer()
                    .textHtml(answer.getString("text", ""))
                    // Le crédit se répartit entre les bonnes réponses : c'est la convention que
                    // suit déjà l'export Moodle XML du module.
                    .fraction(checked && correct > 0 ? 1d / correct : 0d));
        }
        boolean multiple = correct > 1 || customData.getBoolean("multipleAnswers", false);
        return question.multiple(multiple)
                .type(multiple ? QuestionType.MULTIPLE_CHOICE : QuestionType.SINGLE_CHOICE);
    }

    private Question fillMultipleAnswers(Question question, JsonObject customData) {
        JsonArray answers = customData.getJsonArray("correct_answer_list", new JsonArray());
        for (int i = 0; i < answers.size(); i++) {
            question.addAnswer(new Answer()
                    .textHtml(answers.getJsonObject(i).getString("text", ""))
                    .fraction(1d));
        }
        return question.type(QuestionType.SHORT_ANSWER).multiple(answers.size() > 1);
    }

    private Question fillAssociation(Question question, JsonObject customData) {
        JsonArray pairs = customData.getJsonArray("correct_answer_list", new JsonArray());
        for (int i = 0; i < pairs.size(); i++) {
            JsonObject pair = pairs.getJsonObject(i);
            question.addAnswer(new Answer()
                    .textHtml(pair.getString("text_left", ""))
                    .matchHtml(pair.getString("text_right", ""))
                    .fraction(1d));
        }
        return question.type(QuestionType.MATCHING);
    }

    private Question fillOrdering(Question question, JsonObject customData) {
        JsonArray items = customData.getJsonArray("correct_answer_list", new JsonArray());
        for (int i = 0; i < items.size(); i++) {
            JsonObject item = items.getJsonObject(i);
            question.addAnswer(new Answer()
                    .textHtml(item.getString("text", ""))
                    .order(item.getInteger("order_by", i + 1))
                    .fraction(1d));
        }
        return question.type(QuestionType.ORDERING);
    }

    /**
     * Texte à trous : les balises {@code <fill-zone zone-id="N">} redeviennent des marqueurs
     * {@code [[n]]}, numérotés à partir de 1 comme le veut le modèle neutre.
     */
    private Question fillCloze(Question question, JsonObject customData, String location) {
        String html = customData.getString("htmlContent", "");
        JsonArray zones = customData.getJsonArray("zones", new JsonArray());
        if (zones.isEmpty()) {
            report.dropped("exercizer.cloze.no.zone",
                    "Le texte à trous de " + location + " n'a aucune zone : il n'est pas exporté.",
                    location);
            return null;
        }

        StringBuffer rewritten = new StringBuffer();
        Matcher matcher = FILL_ZONE.matcher(html);
        java.util.Map<String, Integer> gapByZoneId = new java.util.LinkedHashMap<String, Integer>();
        while (matcher.find()) {
            String zoneId = matcher.group(1);
            Integer gap = gapByZoneId.get(zoneId);
            if (gap == null) {
                gap = gapByZoneId.size() + 1;
                gapByZoneId.put(zoneId, gap);
            }
            matcher.appendReplacement(rewritten, "[[" + gap + "]]");
        }
        matcher.appendTail(rewritten);

        if (gapByZoneId.isEmpty()) {
            report.degraded("exercizer.cloze.markup.unreadable",
                    "Le texte à trous de " + location + " ne porte pas de balise de zone "
                            + "reconnaissable : son texte est exporté sans ses trous.", location);
        }

        for (int i = 0; i < zones.size(); i++) {
            JsonObject zone = zones.getJsonObject(i);
            String zoneId = String.valueOf(zone.getValue("id"));
            Integer gap = gapByZoneId.get(zoneId);
            question.addAnswer(new Answer()
                    .textHtml(zone.getString("answer", ""))
                    .gap(gap == null ? i + 1 : gap)
                    .fraction(1d));
        }
        return question.type(QuestionType.CLOZE)
                .promptHtml(rewritten.toString())
                .multiple(zones.size() > 1);
    }

    /**
     * {@code grain_data} arrive tantôt en objet, tantôt en chaîne JSON : la colonne est de type
     * TEXT et la requête d'export la convertit en jsonb. Les deux formes sont acceptées.
     */
    private JsonObject grainData(JsonObject grain) {
        Object value = grain.getValue("grain_data");
        if (value instanceof JsonObject) {
            return (JsonObject) value;
        }
        if (value instanceof String) {
            try {
                return new JsonObject((String) value);
            } catch (RuntimeException e) {
                report.error("exercizer.grain.data.unreadable",
                        "Les données d'un grain sont illisibles : il est ignoré.", null);
            }
        }
        return new JsonObject();
    }

    private static double readDouble(Object value, double fallback) {
        if (value instanceof Number) {
            double parsed = ((Number) value).doubleValue();
            return parsed > 0d ? parsed : fallback;
        }
        if (value instanceof String) {
            try {
                double parsed = Double.parseDouble((String) value);
                return parsed > 0d ? parsed : fallback;
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }
}
