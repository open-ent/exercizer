package org.openent.exercizer.exporter;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import fr.openent.exercizer.exporter.SubjectExporter;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

/**
 * Export Moodle d'une réponse ouverte : la réponse de départ (un schéma à compléter…) devient le
 * modèle de réponse de l'élève, le corrigé les informations pour le correcteur.
 */
public class SubjectExporterEssayTest {

    private static JsonObject openAnswer(JsonObject customData) {
        return new JsonObject()
                .put("name", "open_answer")
                .put("grain_data", new JsonObject()
                        .put("title", "Le cycle de l'eau")
                        .put("statement", "<p>Complète le schéma.</p>")
                        .put("max_score", 2)
                        .put("custom_data", customData));
    }

    @Test
    public void exportsStartingAndModelAnswers() {
        String xml = new SubjectExporter(new JsonArray().add(openAnswer(new JsonObject()
                .put("starting_answer", "<p><img src=\"/workspace/document/depart\"></p>")
                .put("model_answer", "<p>Le schéma complété</p>")))).exportToMoodle();

        assertTrue(xml, xml.contains("<responsetemplate format=\"html\"><text>"));
        assertTrue(xml, xml.contains("/workspace/document/depart"));
        assertTrue(xml, xml.contains("<graderinfo format=\"html\"><text>"));
        assertTrue(xml, xml.contains("Le schéma complété"));
    }

    @Test
    public void omitsEmptyFields() {
        String xml = new SubjectExporter(new JsonArray().add(openAnswer(new JsonObject()))).exportToMoodle();

        assertTrue(xml, xml.contains("type=\"essay\""));
        assertFalse(xml, xml.contains("responsetemplate"));
        assertFalse(xml, xml.contains("graderinfo"));
    }
}
