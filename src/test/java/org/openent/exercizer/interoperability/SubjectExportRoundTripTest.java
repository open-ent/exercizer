package org.openent.exercizer.interoperability;

import fr.openent.exercizer.interoperability.CourseToSubjectConverter;
import fr.openent.exercizer.interoperability.PackageExportService;
import fr.openent.exercizer.interoperability.SubjectToCourseConverter;
import fr.tech.openent.interoperability.CourseFormat;
import fr.tech.openent.interoperability.CourseFormats;
import fr.tech.openent.interoperability.ReadOptions;
import fr.tech.openent.interoperability.model.ConversionReport;
import fr.tech.openent.interoperability.model.Course;
import fr.tech.openent.interoperability.model.Notice;
import fr.tech.openent.interoperability.model.Question;
import fr.tech.openent.interoperability.model.QuestionType;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Sujet exercizer → modèle neutre → paquet, et retour.
 *
 * Les grains d'entrée reproduisent ce que rend getGrainsForExport : {name, grain_data}.
 */
public class SubjectExportRoundTripTest {

    private JsonObject subject() {
        return new JsonObject().put("id", 42).put("title", "Les volcans")
                .put("description", "<p>Révisions</p>");
    }

    private JsonArray grains() {
        return new JsonArray()
                .add(new JsonObject().put("name", "statement").put("grain_data",
                        new JsonObject()
                                .put("title", "Consigne")
                                .put("custom_data", new JsonObject()
                                        .put("statement", "<p>Lisez le document.</p>"))))
                .add(new JsonObject().put("name", "qcm").put("grain_data",
                        new JsonObject()
                                .put("title", "Produits")
                                .put("statement", "Que produit un volcan ?")
                                .put("max_score", 3.0)
                                .put("answer_explanation", "Chapitre 2.")
                                .put("custom_data", new JsonObject()
                                        .put("multipleAnswers", true)
                                        .put("no_error_allowed", false)
                                        .put("correct_answer_list", new JsonArray()
                                                .add(new JsonObject().put("text", "Lave")
                                                        .put("isChecked", true))
                                                .add(new JsonObject().put("text", "Cendres")
                                                        .put("isChecked", true))
                                                .add(new JsonObject().put("text", "Pluie")
                                                        .put("isChecked", false))))))
                .add(new JsonObject().put("name", "simple_answer").put("grain_data",
                        new JsonObject()
                                .put("title", "Magma")
                                .put("statement", "La lave souterraine ?")
                                .put("max_score", 1.0)
                                .put("custom_data", new JsonObject()
                                        .put("correct_answer", "magma"))))
                .add(new JsonObject().put("name", "association").put("grain_data",
                        new JsonObject()
                                .put("title", "Associer")
                                .put("statement", "Associez")
                                .put("max_score", 2.0)
                                .put("custom_data", new JsonObject()
                                        .put("show_left_column", true)
                                        .put("correct_answer_list", new JsonArray()
                                                .add(new JsonObject().put("text_left", "Etna")
                                                        .put("text_right", "Italie"))))))
                .add(new JsonObject().put("name", "text_to_fill").put("grain_data",
                        new JsonObject()
                                .put("title", "Trous")
                                .put("max_score", 2.0)
                                .put("custom_data", new JsonObject()
                                        .put("answersType", "list")
                                        .put("htmlContent",
                                                "Le <fill-zone zone-id=\"0\"></fill-zone>&nbsp; sort "
                                                        + "du <fill-zone zone-id=\"1\"></fill-zone>&nbsp;.")
                                        .put("zones", new JsonArray()
                                                .add(new JsonObject().put("id", 0)
                                                        .put("answer", "magma"))
                                                .add(new JsonObject().put("id", 1)
                                                        .put("answer", "cratère"))))))
                .add(new JsonObject().put("name", "area_select_image").put("grain_data",
                        new JsonObject().put("title", "Zones").put("custom_data", new JsonObject())));
    }

    @Test
    public void projette_les_grains_vers_le_modele_neutre() {
        ConversionReport report = new ConversionReport();
        Course course = new SubjectToCourseConverter(report).convert(subject(), grains());

        assertEquals("Les volcans", course.title());
        // Le grain à zones n'est pas exportable : cinq questions sur six.
        assertEquals(5, course.allQuestions().size());

        assertEquals(QuestionType.STATEMENT, course.allQuestions().get(0).type());
        Question qcm = course.allQuestions().get(1);
        assertEquals(QuestionType.MULTIPLE_CHOICE, qcm.type());
        assertEquals(2, qcm.correctCount());
        assertEquals(0.5d, qcm.answers().get(0).fraction(), 0.0001d);
        assertEquals(3.0d, qcm.defaultMark(), 0.0001d);

        assertEquals(QuestionType.SHORT_ANSWER, course.allQuestions().get(2).type());
        assertEquals(QuestionType.MATCHING, course.allQuestions().get(3).type());

        Question cloze = course.allQuestions().get(4);
        assertEquals(QuestionType.CLOZE, cloze.type());
        // Les balises de zone redeviennent des marqueurs numérotés à partir de 1.
        assertTrue(cloze.promptHtml().contains("[[1]]"));
        assertTrue(cloze.promptHtml().contains("[[2]]"));
        assertEquals(false, cloze.promptHtml().contains("fill-zone"));
        assertEquals(1, cloze.answers().get(0).gap());

        boolean dropped = false;
        for (Notice notice : report.noticesOf(Notice.Level.DROPPED)) {
            if ("exercizer.area.not.exportable".equals(notice.code())) {
                dropped = true;
            }
        }
        assertTrue("le grain à zones doit être signalé", dropped);
    }

    @Test
    public void exporte_en_scorm_puis_le_relit() throws Exception {
        PackageExportService service = new PackageExportService(null, "Open ENT", null);
        PackageExportService.Exported exported =
                service.exportBlocking(subject(), grains(), CourseFormat.SCORM_12);
        try {
            assertEquals("Les-volcans.zip", exported.fileName());
            assertEquals(CourseFormat.SCORM_12, CourseFormats.detect(exported.file()));

            Course reread = CourseFormats.read(exported.file(), ReadOptions.DEFAULT,
                    new ConversionReport());
            try {
                assertEquals("Les volcans", reread.title());
                assertNotNull(reread.allActivities().get(0));
            } finally {
                reread.close();
            }
        } finally {
            Files.deleteIfExists(exported.file());
        }
    }

    @Test
    public void exporte_en_moodle_puis_le_relit_avec_ses_questions() throws Exception {
        PackageExportService service = new PackageExportService(null, "Open ENT", null);
        PackageExportService.Exported exported =
                service.exportBlocking(subject(), grains(), CourseFormat.MOODLE_BACKUP);
        try {
            assertEquals("Les-volcans.mbz", exported.fileName());
            assertEquals(CourseFormat.MOODLE_BACKUP, CourseFormats.detect(exported.file()));

            Course reread = CourseFormats.read(exported.file(), ReadOptions.DEFAULT,
                    new ConversionReport());
            try {
                assertEquals("Les volcans", reread.title());
                // La remise en ordre et les zones mises à part, les questions traversent.
                assertTrue(reread.allQuestions().size() >= 4);
                Question qcm = null;
                for (Question question : reread.allQuestions()) {
                    if (question.type() == QuestionType.MULTIPLE_CHOICE) {
                        qcm = question;
                    }
                }
                assertNotNull("le QCM doit survivre à l'aller-retour", qcm);
                assertEquals(2, qcm.correctCount());
                assertEquals(0.5d, qcm.answers().get(0).fraction(), 0.0001d);
            } finally {
                reread.close();
            }
        } finally {
            Files.deleteIfExists(exported.file());
        }
    }

    @Test
    public void un_aller_retour_complet_conserve_le_qcm() throws Exception {
        // Sujet → LearnHouse → sujet : le format cible ne connaît que le choix parmi des
        // propositions, donc seul le QCM est attendu au retour.
        PackageExportService service = new PackageExportService(null, "Open ENT", null);
        PackageExportService.Exported exported =
                service.exportBlocking(subject(), grains(), CourseFormat.LEARNHOUSE);
        try {
            ConversionReport report = new ConversionReport();
            Course reread = CourseFormats.read(exported.file(), ReadOptions.DEFAULT, report);
            try {
                JsonObject payload = new CourseToSubjectConverter(report).toImportPayload(reread);
                assertNotNull(payload);
                JsonArray grains = payload.getJsonArray("grains");
                boolean qcmFound = false;
                for (int i = 0; i < grains.size(); i++) {
                    JsonObject grain = grains.getJsonObject(i);
                    if (grain.getLong("grain_type_id") == 7L) {
                        qcmFound = true;
                        JsonObject customData = grain.getJsonObject("grain_data")
                                .getJsonObject("custom_data");
                        assertEquals(true, customData.getBoolean("multipleAnswers"));
                        assertEquals(3, customData.getJsonArray("correct_answer_list").size());
                    }
                }
                assertTrue("le QCM doit traverser l'aller-retour", qcmFound);
            } finally {
                reread.close();
            }
        } finally {
            Files.deleteIfExists(exported.file());
        }
    }
}
