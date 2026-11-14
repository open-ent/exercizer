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
        String injected = controller().inject(html, "1.2", new JsonObject(), "https://ent-scolaire.fr");

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
                "2004", new JsonObject().put("cmi.location", "page3"), "https://ent-scolaire.fr");
        assertTrue(injected.contains("\"parentOrigin\":\"https://ent-scolaire.fr\""));
        assertTrue(injected.contains("\"version\":\"2004\""));
        // L'état est injecté côté serveur : l'API SCORM est synchrone, et un état livré ensuite
        // par message arriverait après le premier GetValue.
        assertTrue(injected.contains("page3"));
    }

    @Test
    public void une_version_inconnue_retombe_sur_scorm_12() {
        String injected = controller().inject("<html><head></head></html>", null, new JsonObject(),
                "https://ent-scolaire.fr");
        assertTrue(injected.contains("\"version\":\"1.2\""));
    }

    @Test
    public void injecte_meme_sans_balise_head() {
        // Des paquets réels servent des fragments ou du HTML malformé ; le pont doit quand même
        // être posé, sans quoi le module ne démarre pas du tout.
        String injected = controller().inject("<html><body>sans head</body></html>", "1.2",
                new JsonObject(), "https://ent-scolaire.fr");
        assertTrue(injected.contains("__OPENENT_SCORM__"));
        assertTrue(injected.indexOf("__OPENENT_SCORM__") < injected.indexOf("sans head"));

        String fragment = controller().inject("<p>rien du tout</p>", "1.2", new JsonObject(),
                "https://ent-scolaire.fr");
        assertTrue(fragment.contains("__OPENENT_SCORM__"));
    }

    @Test
    public void tolere_un_head_en_majuscules() {
        String injected = controller().inject("<HTML><HEAD></HEAD><BODY>x</BODY></HTML>", "1.2",
                new JsonObject(), "https://ent-scolaire.fr");
        assertTrue(injected.indexOf("__OPENENT_SCORM__") < injected.indexOf("<BODY>"));
    }

    private ScormController controller(String contentOrigin, String entOrigin) {
        JsonObject config = new JsonObject().put("scorm", new JsonObject()
                .put("content-origin", contentOrigin)
                .put("ent-origin", entOrigin)
                .put("token-secret", "secret"));
        return new ScormController(null, null, config);
    }

    @Test
    public void l_origine_parente_suit_l_hote_de_l_ent_ouvert_par_l_usager() {
        ScormController c = controller("https://scorm.ent-scolaire.fr", "https://www.ent-scolaire.fr");
        // L'ENT est servi sous plusieurs hôtes : figer www perdait le suivi sur tous les autres.
        assertEquals("https://cd04.ent-scolaire.fr", c.parentOriginOf("cd04.ent-scolaire.fr"));
        assertEquals("https://www.ent-scolaire.fr", c.parentOriginOf("www.ent-scolaire.fr"));
        // Derrière Traefik la requête arrive en http : le schéma est celui de l'origine déclarée.
        assertTrue(c.parentOriginOf("eclat-bfc.ent-scolaire.fr").startsWith("https://"));
    }

    @Test
    public void l_origine_parente_ne_sort_jamais_du_domaine_de_l_ent() {
        ScormController c = controller("https://scorm.ent-scolaire.fr", "https://www.ent-scolaire.fr");
        assertEquals("https://www.ent-scolaire.fr", c.parentOriginOf("evil.example.org"));
        assertEquals("https://www.ent-scolaire.fr", c.parentOriginOf("ent-scolaire.fr.evil.org"));
        assertEquals("https://www.ent-scolaire.fr", c.parentOriginOf("a.b.ent-scolaire.fr"));
        // Le domaine du contenu ne peut pas se désigner lui-même comme parent.
        assertEquals("https://www.ent-scolaire.fr", c.parentOriginOf("scorm.ent-scolaire.fr"));
        assertEquals("https://www.ent-scolaire.fr", c.parentOriginOf(""));
    }

    @Test
    public void un_ent_a_l_apex_n_ouvre_pas_tout_le_domaine_parent() {
        ScormController c = controller("https://scorm.ent-scolaire.fr", "https://ent-scolaire.fr");
        assertEquals("https://ent-scolaire.fr", c.parentOriginOf("autre.scolaire.fr"));
        assertEquals(null, ScormController.parentDomain("ent-scolaire.fr"));
        assertEquals("ent-scolaire.fr", ScormController.parentDomain("www.ent-scolaire.fr"));
    }

    @Test
    public void origines_normalisees() {
        // ${SCORM_CONTENT_ORIGIN:-} non renseignée arrive en chaîne vide : ce n'est pas une origine.
        assertEquals(null, ScormController.origin(""));
        assertEquals(null, ScormController.origin("   "));
        assertEquals("https://scorm.ent-scolaire.fr", ScormController.origin("https://scorm.ent-scolaire.fr/"));
        assertEquals("localhost:8090", ScormController.authority("http://LOCALHOST:8090"));
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
