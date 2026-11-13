package org.openent.exercizer.interoperability;

import fr.openent.exercizer.interoperability.PackageImportService;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** Paquets OEIP (forme des packs pédagogiques) et reconnaissance des formats par le service d'import. */
public class OeipImportTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    /** Le service ne touche à Vert.x que pour l'exécution bloquante : convertBlocking s'en passe. */
    private final PackageImportService service = new PackageImportService(null, 0L);

    private static JsonObject subject(String title, String evilKey) {
        JsonObject subject = new JsonObject().put("title", title).put("type", "interactive")
                .put("description", "<p>" + title + "</p>");
        if (evilKey != null) {
            subject.put(evilKey, "x");
        }
        return new JsonObject()
                .put("subject", subject)
                .put("levels", new JsonArray().add("4E"))
                .put("disciplines", new JsonArray().add("FRANCAIS"))
                .put("grains", new JsonArray()
                        .add(new JsonObject().put("grain_type_id", 3).put("order_by", 1)
                                .put("grain_data", new JsonObject().put("custom_data",
                                        new JsonObject().put("statement", "<p>Consigne</p>"))))
                        .add(new JsonObject().put("grain_type_id", 4).put("order_by", 2)
                                .put("grain_data", new JsonObject().put("max_score", 1)
                                        .put("answer_explanation", "<p>« que » est le COD.</p>")
                                        .put("custom_data", new JsonObject().put("correct_answer", "prises"))))
                        .add(new JsonObject().put("grain_type_id", 13).put("order_by", 3)
                                .put("grain_data", new JsonObject())));
    }

    private static JsonObject resources() {
        JsonArray items = new JsonArray();
        String[] titles = {"Qui commande ?", "Les déterminants indéfinis"};
        for (int i = 0; i < titles.length; i++) {
            items.add(new JsonObject()
                    .put("globalId", "urn:oeip:1.1:resource:test:" + i)
                    .put("serviceId", "exercizer")
                    .put("title", titles[i])
                    .put("extensions", new JsonObject().put("exercizer",
                            subject(titles[i], i == 0 ? "owner\"; DROP TABLE x; --" : null))));
        }
        return new JsonObject().put("oeipVersion", "1.1").put("sourceSystem", "test")
                .put("serviceId", "exercizer").put("dataset", "resources").put("items", items);
    }

    private File oeip(boolean tamper) throws Exception {
        Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
        files.put("oeip-manifest.json", new JsonObject()
                .put("format", "open-ent-interoperability-package").put("oeipVersion", "1.1")
                .put("profile", "pack")
                .put("source", new JsonObject().put("sourceSystem", "ent-test.fr"))
                .put("pack", new JsonObject().put("title", "Pack d'essai"))
                .encode().getBytes(StandardCharsets.UTF_8));
        byte[] exercises = resources().encode().getBytes(StandardCharsets.UTF_8);
        files.put("resources/exercizer/resources.json", exercises);
        files.put("resources/wiki/resources.json", "{}".getBytes(StandardCharsets.UTF_8));
        // Une projection Common Cartridge, comme en porte un vrai paquet : OEIP doit l'emporter.
        files.put("imsmanifest.xml", "<manifest xmlns=\"http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1\"/>"
                .getBytes(StandardCharsets.UTF_8));
        StringBuilder sums = new StringBuilder();
        for (Map.Entry<String, byte[]> e : files.entrySet()) {
            if (!e.getKey().equals("oeip-manifest.json")) {
                sums.append(hex(e.getValue())).append("  ").append(e.getKey()).append('\n');
            }
        }
        files.put("checksums.sha256", sums.toString().getBytes(StandardCharsets.UTF_8));
        if (tamper) {
            files.put("resources/exercizer/resources.json",
                    resources().put("generatedAt", "altéré").encode().getBytes(StandardCharsets.UTF_8));
        }
        File file = tmp.newFile("pack.oeip");
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(file))) {
            for (Map.Entry<String, byte[]> e : files.entrySet()) {
                zip.putNextEntry(new ZipEntry(e.getKey()));
                zip.write(e.getValue());
                zip.closeEntry();
            }
        }
        return file;
    }

    private static String hex(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    @Test
    public void un_paquet_oeip_liste_ses_sujets_et_en_retient_un() throws Exception {
        PackageImportService.Converted converted = service.convertBlocking(oeip(false).toPath(), 1);
        assertEquals("oeip", converted.format());
        JsonObject analysis = converted.analysis();
        assertEquals(2, analysis.getJsonArray("subjects").size());
        assertEquals(1, (int) analysis.getInteger("selected"));
        assertEquals("Pack d'essai", analysis.getString("title"));
        assertEquals("Les déterminants indéfinis",
                converted.payload().getJsonObject("subject").getString("title"));
        assertEquals("FRANCAIS", analysis.getJsonArray("disciplines").getString(0));
        // L'aperçu = ce qui serait créé.
        assertEquals(converted.payload(), analysis.getJsonObject("preview"));
    }

    @Test
    public void seuls_les_champs_connus_du_sujet_sont_repris() throws Exception {
        JsonObject subject = service.convertBlocking(oeip(false).toPath(), 0).payload().getJsonObject("subject");
        for (String key : subject.fieldNames()) {
            assertTrue("clé inattendue : " + key, key.matches("title|description|folder_id|authors_contributors|large_display"));
        }
    }

    @Test
    public void un_grain_scorm_sans_son_paquet_est_ecarte() throws Exception {
        PackageImportService.Converted converted = service.convertBlocking(oeip(false).toPath(), 0);
        JsonArray grains = converted.payload().getJsonArray("grains");
        assertEquals(2, grains.size());
        assertEquals(0, (int) grains.getJsonObject(0).getInteger("order_by"));
        assertEquals("partial", converted.analysis().getString("fidelity"));
        // L'explication HTML d'un pack arrive en texte.
        assertEquals("« que » est le COD.",
                grains.getJsonObject(1).getJsonObject("grain_data").getString("answer_explanation"));
    }

    @Test
    public void un_paquet_altere_est_refuse() throws Exception {
        try {
            service.convertBlocking(oeip(true).toPath(), 0);
            fail("un paquet altéré doit être refusé");
        } catch (IOException e) {
            assertEquals("exercizer.oeip.integrity", e.getMessage());
        }
    }

    @Test
    public void un_fichier_gift_est_reconnu_a_son_contenu() throws Exception {
        File file = tmp.newFile("banque.txt");
        Files.write(file.toPath(), "::Q1::2+2 ? {=4 ~5}\n".getBytes(StandardCharsets.UTF_8));
        PackageImportService.Converted converted = service.convertBlocking(file.toPath(), 0);
        assertEquals("gift", converted.format());
        assertEquals(1, converted.payload().getJsonArray("grains").size());
        assertFalse(converted.analysis().containsKey("subjects"));
    }

    @Test
    public void un_fichier_inconnu_est_refuse() throws Exception {
        File file = tmp.newFile("note.txt");
        Files.write(file.toPath(), "Bonjour.\n".getBytes(StandardCharsets.UTF_8));
        try {
            service.convertBlocking(file.toPath(), 0);
            fail("format inconnu");
        } catch (IOException e) {
            assertEquals("exercizer.import.format.unknown", e.getMessage());
        }
    }

    @Test
    public void un_paquet_sans_sujet_ne_cree_rien() throws Exception {
        File file = tmp.newFile("vide.oeip");
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(file))) {
            zip.putNextEntry(new ZipEntry("oeip-manifest.json"));
            zip.write(new JsonObject().put("format", "open-ent-interoperability-package").put("oeipVersion", "1.0")
                    .put("services", new JsonArray().add(new JsonObject().put("id", "exercizer")
                            .put("normalized", false).put("fidelity", "native-only")))
                    .encode().getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        PackageImportService.Converted converted = service.convertBlocking(file.toPath(), 0);
        assertNull(converted.payload());
        assertEquals("exercizer.oeip.native.only", converted.analysis().getJsonArray("notices")
                .getJsonObject(converted.analysis().getJsonArray("notices").size() - 1).getString("code"));
    }
}
