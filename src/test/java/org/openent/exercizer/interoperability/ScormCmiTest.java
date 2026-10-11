package org.openent.exercizer.interoperability;

import fr.openent.exercizer.interoperability.ScormCmi;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class ScormCmiTest {

    @Test
    public void lit_un_score_scorm_12() {
        // Un SCO écrit TOUT en chaînes : l'API SCORM ne transporte que du texte.
        JsonObject cmi = new JsonObject()
                .put("cmi.core.score.raw", "8")
                .put("cmi.core.score.max", "10")
                .put("cmi.core.lesson_status", "passed");
        ScormCmi state = new ScormCmi(cmi, ScormCmi.VERSION_12);

        assertEquals(8.0d, state.scoreRaw(), 0.0001d);
        assertEquals(0.8d, state.ratio(), 0.0001d);
        assertTrue(state.completed());
        assertEquals(Boolean.TRUE, state.passed());
        assertEquals(4.0d, state.gradeOver(5d), 0.0001d);
    }

    @Test
    public void lit_un_score_normalise_scorm_2004() {
        JsonObject cmi = new JsonObject()
                .put("cmi.score.scaled", "0.75")
                .put("cmi.completion_status", "completed")
                .put("cmi.success_status", "passed");
        ScormCmi state = new ScormCmi(cmi, ScormCmi.VERSION_2004);

        assertEquals(0.75d, state.ratio(), 0.0001d);
        assertTrue(state.completed());
        assertEquals(Boolean.TRUE, state.passed());
        assertEquals(1.5d, state.gradeOver(2d), 0.0001d);
    }

    @Test
    public void ne_confond_pas_les_cles_des_deux_versions() {
        // C'est le piège : lire les clés de 1.2 sur un état 2004 ne lève AUCUNE erreur, la
        // progression disparaît simplement.
        JsonObject cmi2004 = new JsonObject()
                .put("cmi.completion_status", "completed")
                .put("cmi.score.scaled", "1");
        assertNull("les clés de 1.2 ne doivent rien trouver dans un état 2004",
                new ScormCmi(cmi2004, ScormCmi.VERSION_12).ratio());
        assertEquals(false, new ScormCmi(cmi2004, ScormCmi.VERSION_12).completed());
    }

    @Test
    public void en_2004_l_achevement_et_la_reussite_sont_distincts() {
        JsonObject cmi = new JsonObject()
                .put("cmi.completion_status", "completed")
                .put("cmi.success_status", "failed");
        ScormCmi state = new ScormCmi(cmi, ScormCmi.VERSION_2004);
        assertTrue("l'élève a terminé", state.completed());
        assertEquals("mais il a échoué", Boolean.FALSE, state.passed());
    }

    @Test
    public void un_score_normalise_negatif_vaut_zero() {
        // L'échelle de 2004 va de -1 à 1 ; une note négative n'a pas de sens pour un barème.
        JsonObject cmi = new JsonObject().put("cmi.score.scaled", "-0.5");
        assertEquals(0d, new ScormCmi(cmi, ScormCmi.VERSION_2004).ratio(), 0.0001d);
    }

    @Test
    public void sans_score_rapporte_la_note_reste_indeterminee() {
        // Poser zéro ferait passer pour un échec ce qui n'est qu'une absence de mesure.
        JsonObject cmi = new JsonObject().put("cmi.core.lesson_status", "incomplete");
        ScormCmi state = new ScormCmi(cmi, ScormCmi.VERSION_12);
        assertNull(state.ratio());
        assertNull(state.gradeOver(10d));
        assertEquals(false, state.completed());
        assertNull(state.passed());
    }

    @Test
    public void un_statut_sans_verdict_ne_tranche_pas_la_reussite() {
        JsonObject cmi = new JsonObject().put("cmi.core.lesson_status", "completed");
        ScormCmi state = new ScormCmi(cmi, ScormCmi.VERSION_12);
        assertTrue(state.completed());
        assertNull("« completed » ne dit rien de la réussite", state.passed());
    }
}
