package org.openent.exercizer.utils;

import fr.openent.exercizer.utils.PlainText;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;

/** L'explication d'une réponse est du texte : le HTML des packs y est ramené. */
public class PlainTextTest {

    @Test
    public void un_paragraphe_de_pack_devient_son_texte() {
        assertEquals("« que » est le COD, placé avant.",
                PlainText.fromHtml("<p>« que » est le <strong>COD</strong>, placé avant.</p>"));
    }

    @Test
    public void les_paragraphes_deviennent_des_lignes_et_les_entites_sont_decodees() {
        assertEquals("Barème : 1 point.\n« a&b » — x < 3",
                PlainText.fromHtml("<p>Barème : 1 point.</p><p><em>« a&amp;b »</em> — x &lt; 3</p>"));
        assertEquals("un\ndeux", PlainText.fromHtml("un<br/>deux"));
    }

    @Test
    public void un_texte_ecrit_a_la_main_n_est_pas_touche() {
        assertFalse(PlainText.looksLikeHtml("si x < 3 et y > 2"));
        assertEquals("si x < 3 et y > 2 &amp; rien", PlainText.fromHtml("si x < 3 et y > 2 &amp; rien"));
    }

    @Test
    public void seule_l_explication_du_grain_change() {
        JsonObject data = new JsonObject().put("statement", "<p>Énoncé</p>")
                .put("answer_explanation", "<p>Parce que.</p>");
        assertSame(data, PlainText.normaliseExplanation(data));
        assertEquals("Parce que.", data.getString("answer_explanation"));
        assertEquals("<p>Énoncé</p>", data.getString("statement"));
        assertEquals(new JsonObject(), PlainText.normaliseExplanation(new JsonObject()));
    }
}
