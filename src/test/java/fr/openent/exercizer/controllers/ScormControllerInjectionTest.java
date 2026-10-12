package fr.openent.exercizer.controllers;

import io.vertx.core.json.JsonObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * Les deux parties du contrôleur qui ne dépendent ni du réseau ni de la base, et dont une erreur
 * se paierait cher : l'injection du pont dans la page du SCO, et le décodage du chemin demandé.
 */
public class ScormControllerInjectionTest {

    private ScormController controller() {
        JsonObject config = new JsonObject().put("scorm", new JsonObject()
                .put("content-origin", "https://scorm.ent-scolaire.fr")
                .put("ent-origin", "https://ent-scolaire.fr")
                .put("token-secret", "secret"));
        return new ScormController(null, null, config);
    }

    @Test
    public void injecte_le_pont_juste_apres_l_ouverture_de_head() {
        String html = "<!DOCTYPE html><html><head><title>SCO</title></head><body>x</body></html>";
        String injected = controller().inject(html, "1.2", new JsonObject());

        int head = injected.indexOf("<head>");
        int config = injected.indexOf("__OPENENT_SCORM__");
        int title = injected.indexOf("<title>");
        assertTrue("la configuration doit suivre <head>", config > head);
        // Le SCO cherche son API dès son premier script : un pont injecté après lui arriverait
        // trop tard.
        assertTrue("la configuration doit précéder le contenu de la page", config < title);
    }

    @Test
    public void declare_l_origine_parente_et_la_version() {
        String injected = controller().inject("<html><head></head><body></body></html>",
                "2004", new JsonObject().put("cmi.location", "page3"));
        assertTrue(injected.contains("\"parentOrigin\":\"https://ent-scolaire.fr\""));
        assertTrue(injected.contains("\"version\":\"2004\""));
        // L'état est injecté côté serveur : l'API SCORM est synchrone, et un état livré ensuite
        // par message arriverait après le premier GetValue.
        assertTrue(injected.contains("page3"));
    }

    @Test
    public void une_version_inconnue_retombe_sur_scorm_12() {
        String injected = controller().inject("<html><head></head></html>", null, new JsonObject());
        assertTrue(injected.contains("\"version\":\"1.2\""));
    }

    @Test
    public void injecte_meme_sans_balise_head() {
        // Des paquets réels servent des fragments ou du HTML malformé ; le pont doit quand même
        // être posé, sans quoi le module ne démarre pas du tout.
        String injected = controller().inject("<html><body>sans head</body></html>", "1.2",
                new JsonObject());
        assertTrue(injected.contains("__OPENENT_SCORM__"));
        assertTrue(injected.indexOf("__OPENENT_SCORM__") < injected.indexOf("sans head"));

        String fragment = controller().inject("<p>rien du tout</p>", "1.2", new JsonObject());
        assertTrue(fragment.contains("__OPENENT_SCORM__"));
    }

    @Test
    public void tolere_un_head_en_majuscules() {
        String injected = controller().inject("<HTML><HEAD></HEAD><BODY>x</BODY></HTML>", "1.2",
                new JsonObject());
        assertTrue(injected.indexOf("__OPENENT_SCORM__") < injected.indexOf("<BODY>"));
    }

    @Test
    public void decode_les_chemins_encodes_par_le_navigateur() {
        // Les clés de la table du paquet sont les chemins tels qu'ils figurent dans l'archive ;
        // le navigateur, lui, encode espaces et accents.
        assertEquals("leçon 1.html", ScormController.decode("le%C3%A7on%201.html"));
        assertEquals("js/app.js", ScormController.decode("js/app.js"));
        // Un « + » appartient au nom du fichier : le muer en espace le rendrait introuvable.
        assertEquals("notes+2024.pdf", ScormController.decode("notes+2024.pdf"));
        // La chaîne de requête porte le jeton, pas le chemin.
        assertEquals("index.html", ScormController.decode("index.html?t=abc"));
        assertEquals("", ScormController.decode(null));
    }

    @Test
    public void un_pourcentage_malforme_ne_fait_pas_echouer_le_service() {
        assertEquals("100%.html", ScormController.decode("100%.html"));
    }
}
