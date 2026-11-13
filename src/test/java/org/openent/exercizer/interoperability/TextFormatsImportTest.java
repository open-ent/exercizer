package org.openent.exercizer.interoperability;

import fr.openent.exercizer.interoperability.CourseToSubjectConverter;
import fr.openent.exercizer.interoperability.GrainType;
import fr.openent.exercizer.interoperability.text.AikenReader;
import fr.openent.exercizer.interoperability.text.GiftReader;
import fr.tech.openent.interoperability.model.ConversionReport;
import fr.tech.openent.interoperability.model.Course;
import fr.tech.openent.interoperability.model.Notice;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/** GIFT et Aiken : les formats texte de Moodle, jusqu'aux grains exercizer. */
public class TextFormatsImportTest {

    private static final String GIFT = ""
            + "// Banque d'essai\n"
            + "$CATEGORY: $course$/Volcans\n"
            + "\n"
            + "::Lave::La lave souterraine s'appelle {=magma =le magma}\n"
            + "\n"
            + "::Etna::L'Etna est en Italie.{T}\n"
            + "\n"
            + "::Capitale::Quelle est la capitale de l'Italie ? {\n"
            + "  =Rome#Bien.\n"
            + "  ~Milan#Non.\n"
            + "  ~Naples\n"
            + "}\n"
            + "\n"
            + "::Gaz::Gaz volcaniques ? {~%50%dioxyde de soufre ~%50%vapeur d'eau ~%-100%oxygène}\n"
            + "\n"
            + "::Associer::Associez. {=Etna -> Italie =Fuji -> Japon}\n"
            + "\n"
            + "::Trou::Le Vésuve a détruit {~Rome =Pompéi ~Lyon} en 79.\n"
            + "\n"
            + "::Date::En quelle année ? {#79:2}\n"
            + "\n"
            + "::Rédaction::Décrivez une éruption. {}\n"
            + "\n"
            + "Une simple consigne, sans réponse \\{ échappée \\}.\n";

    private JsonObject gift(ConversionReport report) {
        Course course = new GiftReader(report).read(GIFT, "Banque");
        return new CourseToSubjectConverter(report).toImportPayload(course);
    }

    private static JsonObject grain(JsonArray grains, String title) {
        for (int i = 0; i < grains.size(); i++) {
            JsonObject data = grains.getJsonObject(i).getJsonObject("grain_data");
            if (title.equals(data.getString("title"))) {
                return grains.getJsonObject(i);
            }
        }
        throw new AssertionError("grain absent : " + title);
    }

    @Test
    public void gift_est_reconnu_et_aiken_aussi() {
        assertTrue(GiftReader.looksLikeGift(GIFT));
        assertFalse(AikenReader.looksLikeAiken(GIFT));
        assertFalse(GiftReader.looksLikeGift("Un texte ordinaire.\n\nDeux paragraphes."));
    }

    @Test
    public void chaque_type_gift_devient_le_bon_grain() {
        ConversionReport report = new ConversionReport();
        JsonArray grains = gift(report).getJsonArray("grains");

        assertEquals(GrainType.MULTIPLE_ANSWERS, (long) grain(grains, "Lave").getLong("grain_type_id"));

        JsonObject etna = grain(grains, "Etna");
        assertEquals(GrainType.QCM, (long) etna.getLong("grain_type_id"));
        JsonArray tf = etna.getJsonObject("grain_data").getJsonObject("custom_data").getJsonArray("correct_answer_list");
        assertEquals("Vrai", tf.getJsonObject(0).getString("text"));
        assertTrue(tf.getJsonObject(0).getBoolean("isChecked"));

        JsonObject capitale = grain(grains, "Capitale").getJsonObject("grain_data").getJsonObject("custom_data");
        assertFalse(capitale.getBoolean("multipleAnswers"));
        assertEquals(3, capitale.getJsonArray("correct_answer_list").size());

        JsonObject gaz = grain(grains, "Gaz").getJsonObject("grain_data").getJsonObject("custom_data");
        assertTrue("deux réponses pondérées positives = QCM à plusieurs réponses", gaz.getBoolean("multipleAnswers"));

        JsonObject associer = grain(grains, "Associer");
        assertEquals(GrainType.ASSOCIATION, (long) associer.getLong("grain_type_id"));
        assertEquals("Japon", associer.getJsonObject("grain_data").getJsonObject("custom_data")
                .getJsonArray("correct_answer_list").getJsonObject(1).getString("text_right"));

        JsonObject trou = grain(grains, "Trou");
        assertEquals(GrainType.TEXT_TO_FILL, (long) trou.getLong("grain_type_id"));
        JsonObject cloze = trou.getJsonObject("grain_data").getJsonObject("custom_data");
        assertEquals("list", cloze.getString("answersType"));
        assertEquals(1, cloze.getJsonArray("zones").size());
        assertEquals("Pompéi", cloze.getJsonArray("zones").getJsonObject(0).getString("answer"));
        assertEquals(3, cloze.getJsonArray("zones").getJsonObject(0).getJsonArray("options").size());
        assertTrue(cloze.getString("htmlContent").contains("<fill-zone zone-id=\"0\">"));
        assertTrue(cloze.getString("htmlContent").contains("en 79."));

        JsonObject date = grain(grains, "Date");
        assertEquals(GrainType.SIMPLE_ANSWER, (long) date.getLong("grain_type_id"));
        assertEquals("79", date.getJsonObject("grain_data").getJsonObject("custom_data").getString("correct_answer"));

        assertEquals(GrainType.OPEN_ANSWER, (long) grain(grains, "Rédaction").getLong("grain_type_id"));
    }

    @Test
    public void la_categorie_devient_un_titre_et_la_consigne_un_enonce() {
        JsonArray grains = gift(new ConversionReport()).getJsonArray("grains");
        JsonObject first = grains.getJsonObject(0).getJsonObject("grain_data");
        assertEquals(GrainType.STATEMENT, (long) grains.getJsonObject(0).getLong("grain_type_id"));
        assertTrue(first.getJsonObject("custom_data").getString("statement").contains("Volcans"));

        JsonObject last = grains.getJsonObject(grains.size() - 1);
        assertEquals(GrainType.STATEMENT, (long) last.getLong("grain_type_id"));
        String statement = last.getJsonObject("grain_data").getJsonObject("custom_data").getString("statement");
        assertTrue("les accolades échappées sont du texte : " + statement, statement.contains("{ échappée }"));
    }

    @Test
    public void les_pertes_sont_signalees() {
        ConversionReport report = new ConversionReport();
        gift(report);
        boolean tolerance = false;
        for (Notice notice : report.notices()) {
            tolerance |= "exercizer.numerical.tolerance".equals(notice.code());
        }
        assertTrue("la marge d'erreur d'une numérique ne se représente pas", tolerance);
        assertEquals("partial", report.fidelity());
    }

    @Test
    public void aiken_donne_des_qcm_a_reponse_unique() {
        String aiken = "Quelle est la capitale de l'Italie ?\n"
                + "A. Milan\n"
                + "B) Rome\n"
                + "C. Turin\n"
                + "ANSWER: B\n"
                + "\n"
                + "Le Vésuve est un\n"
                + "volcan de quelle région ?\n"
                + "A. Campanie\n"
                + "B. Sicile\n"
                + "ANSWER: A\n"
                + "\n"
                + "Question sans réponse\n"
                + "A. oui\n"
                + "B. non\n"
                + "ANSWER: Z\n";
        assertTrue(AikenReader.looksLikeAiken(aiken));
        assertFalse(GiftReader.looksLikeGift(aiken));

        ConversionReport report = new ConversionReport();
        JsonObject payload = new CourseToSubjectConverter(report)
                .toImportPayload(new AikenReader(report).read(aiken, null));
        assertNotNull(payload);
        JsonArray grains = payload.getJsonArray("grains");
        assertEquals(2, grains.size());
        JsonObject first = grains.getJsonObject(0).getJsonObject("grain_data");
        JsonArray answers = first.getJsonObject("custom_data").getJsonArray("correct_answer_list");
        assertEquals("Rome", answers.getJsonObject(1).getString("text"));
        assertTrue(answers.getJsonObject(1).getBoolean("isChecked"));
        assertTrue(grains.getJsonObject(1).getJsonObject("grain_data").getString("statement")
                .contains("<br>volcan"));
        assertEquals("partial", report.fidelity());
    }
}
