package org.openent.exercizer.interoperability;

import fr.openent.exercizer.interoperability.CourseToSubjectConverter;
import fr.openent.exercizer.interoperability.GrainType;
import fr.tech.openent.interoperability.ReadOptions;
import fr.tech.openent.interoperability.formats.moodle.MoodleXmlQuestionReader;
import fr.tech.openent.interoperability.model.ConversionReport;
import fr.tech.openent.interoperability.model.Course;
import fr.tech.openent.interoperability.model.Notice;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

import java.nio.charset.Charset;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * Projection d'un cours du modèle neutre vers la charge utile de POST /subject/import.
 *
 * Les attentes sont calées sur ce que produit l'importeur Moodle XML historique
 * (public/ts/app/services/ImportService.ts), seule référence qui fasse autorité sur la forme des
 * custom_data.
 */
public class CourseToSubjectConverterTest {

    private static final Charset UTF8 = Charset.forName("UTF-8");

    private static final String BANK =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            + "<quiz>\n"
            + "  <question type=\"category\">\n"
            + "    <category><text>$course$/Sciences/Volcans</text></category>\n"
            + "  </question>\n"
            + "  <question type=\"description\">\n"
            + "    <name><text>Consigne</text></name>\n"
            + "    <questiontext format=\"html\"><text>&lt;p&gt;Lisez.&lt;/p&gt;</text></questiontext>\n"
            + "  </question>\n"
            + "  <question type=\"multichoice\">\n"
            + "    <name><text>Produits</text></name>\n"
            + "    <questiontext format=\"html\"><text>Que produit un volcan ?</text></questiontext>\n"
            + "    <generalfeedback format=\"html\"><text>Chapitre 2.</text></generalfeedback>\n"
            + "    <defaultgrade>3.0</defaultgrade>\n"
            + "    <single>false</single>\n"
            + "    <answer fraction=\"50\"><text>&lt;p&gt;Lave&lt;/p&gt;</text></answer>\n"
            + "    <answer fraction=\"50\"><text>Cendres</text></answer>\n"
            + "    <answer fraction=\"0\"><text>Pluie</text></answer>\n"
            + "  </question>\n"
            + "  <question type=\"shortanswer\">\n"
            + "    <name><text>Magma</text></name>\n"
            + "    <questiontext format=\"html\"><text>La lave souterraine ?</text></questiontext>\n"
            + "    <defaultgrade>1.0</defaultgrade>\n"
            + "    <answer fraction=\"100\"><text>magma</text></answer>\n"
            + "  </question>\n"
            + "  <question type=\"matching\">\n"
            + "    <name><text>Associer</text></name>\n"
            + "    <questiontext format=\"html\"><text>Associez</text></questiontext>\n"
            + "    <defaultgrade>2.0</defaultgrade>\n"
            + "    <subquestion><text>Etna</text><answer><text>Italie</text></answer></subquestion>\n"
            + "  </question>\n"
            + "  <question type=\"essay\">\n"
            + "    <name><text>Rédaction</text></name>\n"
            + "    <questiontext format=\"html\"><text>Expliquez</text></questiontext>\n"
            + "    <defaultgrade>5.0</defaultgrade>\n"
            + "  </question>\n"
            + "  <question type=\"gapselect\">\n"
            + "    <name><text>Trous</text></name>\n"
            + "    <questiontext format=\"html\"><text>Le [[1]] sort du [[2]].</text></questiontext>\n"
            + "    <defaultgrade>2.0</defaultgrade>\n"
            + "    <selectoption><text>magma</text><group>1</group></selectoption>\n"
            + "    <selectoption><text>cratère</text><group>2</group></selectoption>\n"
            + "  </question>\n"
            + "</quiz>\n";

    private JsonObject convert(ConversionReport report) throws Exception {
        Course course = new MoodleXmlQuestionReader().read(BANK.getBytes(UTF8),
                ReadOptions.DEFAULT, report);
        try {
            return new CourseToSubjectConverter(report).toImportPayload(course);
        } finally {
            course.close();
        }
    }

    private JsonObject grainOfType(JsonArray grains, long typeId, int occurrence) {
        int seen = 0;
        for (int i = 0; i < grains.size(); i++) {
            JsonObject grain = grains.getJsonObject(i);
            if (grain.getLong("grain_type_id") == typeId && seen++ == occurrence) {
                return grain;
            }
        }
        return null;
    }

    @Test
    public void produit_une_charge_utile_conforme_au_schema_d_import() throws Exception {
        JsonObject payload = convert(new ConversionReport());
        assertNotNull(payload);
        assertNotNull(payload.getJsonObject("subject"));
        assertEquals("Volcans", payload.getJsonObject("subject").getString("title"));
        assertTrue(payload.getJsonArray("grains").size() >= 6);

        // order_by doit être continu et commencer à zéro : c'est lui qui donne l'ordre du sujet.
        JsonArray grains = payload.getJsonArray("grains");
        for (int i = 0; i < grains.size(); i++) {
            assertEquals(i, (int) grains.getJsonObject(i).getInteger("order_by"));
            assertNotNull(grains.getJsonObject(i).getLong("grain_type_id"));
            assertNotNull(grains.getJsonObject(i).getJsonObject("grain_data"));
        }
    }

    @Test
    public void un_enonce_range_son_texte_dans_custom_data() throws Exception {
        JsonArray grains = convert(new ConversionReport()).getJsonArray("grains");
        JsonObject statement = grainOfType(grains, GrainType.STATEMENT, 0);
        assertNotNull(statement);
        JsonObject data = statement.getJsonObject("grain_data");
        // Piège du modèle : pour le type 3 l'énoncé vit dans custom_data.statement.
        assertNull(data.getString("statement"));
        assertTrue(data.getJsonObject("custom_data").getString("statement").contains("Volcans"));
    }

    @Test
    public void un_qcm_a_plusieurs_bonnes_reponses_est_annonce_comme_tel() throws Exception {
        JsonArray grains = convert(new ConversionReport()).getJsonArray("grains");
        JsonObject qcm = grainOfType(grains, GrainType.QCM, 0);
        assertNotNull(qcm);
        JsonObject customData = qcm.getJsonObject("grain_data").getJsonObject("custom_data");

        JsonArray answers = customData.getJsonArray("correct_answer_list");
        assertEquals(3, answers.size());
        // Le balisage d'une proposition serait affiché littéralement : il est retiré.
        assertEquals("Lave", answers.getJsonObject(0).getString("text"));
        assertEquals(true, answers.getJsonObject(0).getBoolean("isChecked"));
        assertEquals(false, answers.getJsonObject(2).getBoolean("isChecked"));

        // C'est la correction assumée vis-à-vis de l'importeur historique, qui ne renseigne
        // jamais ce champ : un QCM à deux bonnes réponses y arrivait en choix unique.
        assertEquals(true, customData.getBoolean("multipleAnswers"));
        assertEquals(false, customData.getBoolean("no_error_allowed"));

        assertEquals(3.0d, qcm.getJsonObject("grain_data").getDouble("max_score"), 0.0001d);
        assertEquals("Chapitre 2.",
                qcm.getJsonObject("grain_data").getString("answer_explanation"));
    }

    @Test
    public void une_reponse_courte_unique_devient_une_reponse_simple() throws Exception {
        JsonArray grains = convert(new ConversionReport()).getJsonArray("grains");
        JsonObject simple = grainOfType(grains, GrainType.SIMPLE_ANSWER, 0);
        assertNotNull(simple);
        assertEquals("magma", simple.getJsonObject("grain_data")
                .getJsonObject("custom_data").getString("correct_answer"));
    }

    @Test
    public void une_association_produit_ses_paires() throws Exception {
        JsonArray grains = convert(new ConversionReport()).getJsonArray("grains");
        JsonObject association = grainOfType(grains, GrainType.ASSOCIATION, 0);
        assertNotNull(association);
        JsonObject customData = association.getJsonObject("grain_data").getJsonObject("custom_data");
        JsonArray pairs = customData.getJsonArray("correct_answer_list");
        assertEquals(1, pairs.size());
        assertEquals("Etna", pairs.getJsonObject(0).getString("text_left"));
        assertEquals("Italie", pairs.getJsonObject(0).getString("text_right"));
        assertEquals(true, customData.getBoolean("show_left_column"));
    }

    @Test
    public void une_redaction_devient_une_reponse_ouverte() throws Exception {
        JsonArray grains = convert(new ConversionReport()).getJsonArray("grains");
        JsonObject open = grainOfType(grains, GrainType.OPEN_ANSWER, 0);
        assertNotNull(open);
        assertEquals(5.0d, open.getJsonObject("grain_data").getDouble("max_score"), 0.0001d);
    }

    @Test
    public void un_texte_a_trous_devient_des_zones_numerotees() throws Exception {
        JsonArray grains = convert(new ConversionReport()).getJsonArray("grains");
        JsonObject cloze = grainOfType(grains, GrainType.TEXT_TO_FILL, 0);
        assertNotNull(cloze);
        JsonObject data = cloze.getJsonObject("grain_data");
        JsonObject customData = data.getJsonObject("custom_data");

        String html = customData.getString("htmlContent");
        assertTrue("les marqueurs [[n]] doivent être remplacés", !html.contains("[["));
        assertTrue(html.contains("<fill-zone zone-id=\"0\">"));
        assertTrue(html.contains("<fill-zone zone-id=\"1\">"));

        JsonArray zones = customData.getJsonArray("zones");
        assertEquals(2, zones.size());
        assertEquals("magma", zones.getJsonObject(0).getString("answer"));
        assertEquals(0, (int) zones.getJsonObject(0).getInteger("id"));
        assertEquals("cratère", zones.getJsonObject(1).getString("answer"));
        assertEquals("list", customData.getString("answersType"));

        // L'énoncé vit dans htmlContent : le laisser aussi dans statement l'afficherait deux fois.
        assertNull(data.getString("statement"));
    }

    @Test
    public void un_type_sans_equivalent_laisse_une_notice() throws Exception {
        String bank = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><quiz>"
                + "<question type=\"calculated\"><name><text>Calcul</text></name>"
                + "<questiontext format=\"html\"><text>{a}+{b}</text></questiontext></question>"
                + "<question type=\"essay\"><name><text>R</text></name>"
                + "<questiontext format=\"html\"><text>Expliquez</text></questiontext></question>"
                + "</quiz>";
        ConversionReport report = new ConversionReport();
        Course course = new MoodleXmlQuestionReader().read(bank.getBytes(UTF8),
                ReadOptions.DEFAULT, report);
        try {
            JsonObject payload = new CourseToSubjectConverter(report).toImportPayload(course);
            assertNotNull(payload);
            boolean found = false;
            for (Notice notice : report.noticesOf(Notice.Level.DROPPED)) {
                if ("moodle.qtype.unsupported".equals(notice.code())) {
                    found = true;
                }
            }
            assertTrue("le type calculated doit être signalé", found);
        } finally {
            course.close();
        }
    }

    @Test
    public void un_cours_sans_contenu_convertible_ne_produit_pas_de_sujet() throws Exception {
        ConversionReport report = new ConversionReport();
        Course course = new Course().title("Vide");
        JsonObject payload = new CourseToSubjectConverter(report).toImportPayload(course);
        // POST /subject/import exige au moins un grain ; mieux vaut refuser que créer un sujet
        // vide que l'enseignant devra supprimer.
        assertNull(payload);
        assertEquals(1, report.count(Notice.Level.ERROR));
        course.close();
    }
}
