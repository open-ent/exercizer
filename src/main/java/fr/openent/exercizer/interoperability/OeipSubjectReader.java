package fr.openent.exercizer.interoperability;

import fr.tech.openent.interoperability.model.ConversionReport;
import io.vertx.core.json.DecodeException;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Lecture des sujets exercizer d'un paquet OEIP (Open ENT Interoperability Package, 1.0 ou 1.1).
 *
 * <p>Un sujet OEIP est une ressource du jeu {@code resources/exercizer/*.json} dont le document
 * natif ({@code extensions.exercizer}) a la forme {@code {subject, levels, disciplines, grains}}
 * — la forme exacte des packs pédagogiques. Les grains sont déjà ceux d'exercizer : aucune
 * conversion, c'est le seul format reçu à fidélité pleine.</p>
 *
 * <p>Ce qui est vérifié avant toute lecture : la présence de {@code oeip-manifest.json} et de
 * son identifiant de format, et, quand le paquet porte un relevé {@code checksums.sha256}, l'empreinte
 * de chaque fichier lu. Un paquet altéré est refusé en entier — un sujet à moitié réécrit
 * serait distribué à des élèves.</p>
 *
 * <p>Ce qui n'est PAS repris d'une ressource étrangère : tout champ de sujet hors liste blanche.
 * {@code persistSubjectGrains} insère les clés du sujet comme noms de colonnes ; un paquet
 * forgé ne doit pas pouvoir y glisser un nom de son choix.</p>
 */
public final class OeipSubjectReader {

    public static final String FORMAT_ID = "open-ent-interoperability-package";
    static final String MANIFEST = "oeip-manifest.json";
    static final String CHECKSUMS = "checksums.sha256";
    static final String EXERCIZER_DIR = "resources/exercizer/";

    /** Grains reçus d'un paquet : tous les types d'exercizer, sauf SCORM (13) qui exige son paquet. */
    static final Set<Long> ACCEPTED_GRAIN_TYPES = Collections.unmodifiableSet(
            new HashSet<Long>(Arrays.asList(3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L, 11L, 12L)));

    private static final int MAX_ENTRIES = 20000;
    private static final long MAX_JSON_BYTES = 32L * 1024 * 1024;

    /** Un sujet trouvé dans le paquet. */
    public static final class Subject {
        private final String globalId;
        private final String title;
        private final JsonObject payload;
        private final JsonArray levels;
        private final JsonArray disciplines;

        Subject(String globalId, String title, JsonObject payload, JsonArray levels, JsonArray disciplines) {
            this.globalId = globalId;
            this.title = title;
            this.payload = payload;
            this.levels = levels;
            this.disciplines = disciplines;
        }

        public String globalId() {
            return globalId;
        }

        public String title() {
            return title;
        }

        /** Charge utile de {@code persistSubjectGrains}. */
        public JsonObject payload() {
            return payload;
        }

        public JsonArray levels() {
            return levels;
        }

        public JsonArray disciplines() {
            return disciplines;
        }
    }

    /** Le paquet lu : sa description et ses sujets, dans l'ordre du paquet. */
    public static final class Result {
        private final JsonObject manifest;
        private final List<Subject> subjects;

        Result(JsonObject manifest, List<Subject> subjects) {
            this.manifest = manifest;
            this.subjects = subjects;
        }

        public JsonObject manifest() {
            return manifest;
        }

        public List<Subject> subjects() {
            return subjects;
        }

        /** Titre du paquet : celui du pack, à défaut la source. */
        public String title() {
            JsonObject pack = manifest.getJsonObject("pack");
            if (pack != null && pack.getString("title") != null) {
                return pack.getString("title");
            }
            JsonObject source = manifest.getJsonObject("source");
            return source == null ? null : source.getString("sourceSystem");
        }

        public String sourceSystem() {
            JsonObject source = manifest.getJsonObject("source");
            return source == null ? null : source.getString("sourceSystem");
        }

        public String version() {
            return manifest.getString("oeipVersion");
        }
    }

    private final ConversionReport report;

    public OeipSubjectReader(ConversionReport report) {
        this.report = report == null ? new ConversionReport() : report;
    }

    /** Un ZIP qui porte un manifeste OEIP à sa racine. */
    public static boolean isOeip(Path file) {
        try (ZipFile zip = new ZipFile(file.toFile())) {
            return zip.getEntry(MANIFEST) != null;
        } catch (IOException e) {
            return false;
        }
    }

    public Result read(Path file) throws IOException {
        try (ZipFile zip = new ZipFile(file.toFile())) {
            if (zip.size() > MAX_ENTRIES) {
                throw new IOException("exercizer.oeip.too.many.entries");
            }
            JsonObject manifest = json(zip, MANIFEST);
            if (manifest == null || !FORMAT_ID.equals(manifest.getString("format"))) {
                throw new IOException("exercizer.oeip.manifest.invalid");
            }
            Map<String, String> checksums = checksums(zip);

            List<String> paths = new ArrayList<String>();
            Set<String> otherServices = new HashSet<String>();
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (entry.isDirectory() || !name.startsWith("resources/") || !name.endsWith(".json")) {
                    continue;
                }
                if (name.startsWith(EXERCIZER_DIR)) {
                    paths.add(name);
                } else {
                    String[] parts = name.split("/");
                    if (parts.length > 2) {
                        otherServices.add(parts[1]);
                    }
                }
            }
            Collections.sort(paths);
            if (!otherServices.isEmpty()) {
                List<String> sorted = new ArrayList<String>(otherServices);
                Collections.sort(sorted);
                report.info("exercizer.oeip.other.services",
                        "Le paquet contient aussi des ressources d'autres applications ("
                                + String.join(", ", sorted) + ") : seuls les sujets d'exercices "
                                + "sont importés ici.", null);
            }

            List<Subject> subjects = new ArrayList<Subject>();
            for (String path : paths) {
                byte[] bytes = bytes(zip, path);
                verify(checksums, path, bytes);
                JsonObject dataset = parse(bytes, path);
                if (dataset == null || !"resources".equals(dataset.getString("dataset"))) {
                    continue;
                }
                for (Object o : dataset.getJsonArray("items", new JsonArray())) {
                    if (o instanceof JsonObject) {
                        Subject subject = subject((JsonObject) o);
                        if (subject != null) {
                            subjects.add(subject);
                        }
                    }
                }
            }
            if (subjects.isEmpty()) {
                serviceFidelityNotice(manifest);
            }
            return new Result(manifest, subjects);
        }
    }

    private Subject subject(JsonObject item) {
        String title = item.getString("title", "Sujet");
        JsonObject extensions = item.getJsonObject("extensions");
        JsonObject document = extensions == null ? null : extensions.getJsonObject("exercizer");
        if (document == null) {
            report.dropped("exercizer.oeip.no.native.document",
                    "La ressource « " + title + " » ne porte pas de sujet exercizer "
                            + "(extensions.exercizer) : elle n'est pas reprise.", item.getString("globalId"));
            return null;
        }
        JsonObject source = document.getJsonObject("subject", new JsonObject());
        JsonObject subject = new JsonObject()
                .put("title", clip(source.getString("title", title), 255))
                .put("folder_id", (Long) null);
        if (source.getValue("description") instanceof String) {
            subject.put("description", source.getString("description"));
        }
        if (source.getValue("authors_contributors") instanceof String) {
            subject.put("authors_contributors", clip(source.getString("authors_contributors"), 255));
        }
        if (source.getValue("large_display") instanceof Boolean) {
            subject.put("large_display", source.getBoolean("large_display"));
        }
        if (source.getValue("type") != null && !"interactive".equals(source.getValue("type"))) {
            report.dropped("exercizer.oeip.subject.type",
                    "« " + title + " » est un sujet de type « " + source.getValue("type")
                            + " » : seuls les sujets interactifs s'importent.", item.getString("globalId"));
            return null;
        }

        JsonArray grains = new JsonArray();
        int order = 0;
        for (Object g : document.getJsonArray("grains", new JsonArray())) {
            if (!(g instanceof JsonObject)) {
                continue;
            }
            JsonObject grain = (JsonObject) g;
            Object type = grain.getValue("grain_type_id");
            Object data = grain.getValue("grain_data");
            if (!(type instanceof Number) || !ACCEPTED_GRAIN_TYPES.contains(((Number) type).longValue())
                    || !(data instanceof JsonObject)) {
                report.dropped("exercizer.oeip.grain.unsupported",
                        "Un grain de « " + title + " » (type " + type + ") n'est pas importable : il est "
                                + "écarté.", item.getString("globalId"));
                continue;
            }
            grains.add(new JsonObject()
                    .put("grain_type_id", ((Number) type).longValue())
                    .put("order_by", order++)
                    .put("grain_data", data));
        }
        if (grains.isEmpty()) {
            report.dropped("exercizer.oeip.subject.empty",
                    "« " + title + " » ne contient aucun grain importable.", item.getString("globalId"));
            return null;
        }
        return new Subject(item.getString("globalId"), subject.getString("title"),
                new JsonObject().put("subject", subject).put("grains", grains),
                strings(document.getJsonArray("levels")), strings(document.getJsonArray("disciplines")));
    }

    /** Aucun sujet lisible : on dit pourquoi d'après la fidélité déclarée par l'émetteur. */
    private void serviceFidelityNotice(JsonObject manifest) {
        for (Object o : manifest.getJsonArray("services", new JsonArray())) {
            if (o instanceof JsonObject && "exercizer".equals(((JsonObject) o).getString("id"))) {
                JsonObject service = (JsonObject) o;
                if (!service.getBoolean("normalized", false) || "native-only".equals(service.getString("fidelity"))) {
                    report.error("exercizer.oeip.native.only",
                            "Les exercices de ce paquet ne sont présents qu'au niveau « Native » "
                                    + "(archive interne de l'ENT émetteur) : ils se restaurent par "
                                    + "l'import d'archive, pas ici.", null);
                    return;
                }
            }
        }
        report.error("exercizer.oeip.no.subject",
                "Le paquet OEIP ne contient aucun sujet d'exercices.", null);
    }

    // ------------------------------------------------------------------ intégrité

    private Map<String, String> checksums(ZipFile zip) throws IOException {
        Map<String, String> sums = new HashMap<String, String>();
        if (zip.getEntry(CHECKSUMS) == null) {
            report.degraded("exercizer.oeip.unsigned",
                    "Le paquet ne porte pas de relevé d'empreintes (checksums.sha256) : son "
                            + "intégrité n'a pas pu être vérifiée.", null);
            return sums;
        }
        String text = new String(bytes(zip, CHECKSUMS), StandardCharsets.UTF_8);
        for (String line : text.split("\n")) {
            String trimmed = line.trim();
            int space = trimmed.indexOf(' ');
            if (space > 0) {
                String path = trimmed.substring(space).trim();
                if (path.startsWith("*")) {
                    path = path.substring(1);
                }
                sums.put(path, trimmed.substring(0, space).toLowerCase());
            }
        }
        return sums;
    }

    private static void verify(Map<String, String> checksums, String path, byte[] bytes) throws IOException {
        String expected = checksums.get(path);
        if (expected == null) {
            return;
        }
        if (!expected.equals(sha256(bytes))) {
            throw new IOException("exercizer.oeip.integrity");
        }
    }

    static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ------------------------------------------------------------------ lecture

    private static JsonObject json(ZipFile zip, String path) throws IOException {
        if (zip.getEntry(path) == null) {
            return null;
        }
        return parse(bytes(zip, path), path);
    }

    private static JsonObject parse(byte[] bytes, String path) throws IOException {
        try {
            return new JsonObject(new String(bytes, StandardCharsets.UTF_8));
        } catch (DecodeException | ClassCastException e) {
            throw new IOException("exercizer.oeip.json.invalid");
        }
    }

    /** Lecture bornée : la taille annoncée par l'entrée ZIP n'engage pas l'émetteur. */
    private static byte[] bytes(ZipFile zip, String path) throws IOException {
        ZipEntry entry = zip.getEntry(path);
        try (InputStream in = zip.getInputStream(entry)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = in.read(buffer)) > 0) {
                total += read;
                if (total > MAX_JSON_BYTES) {
                    throw new IOException("exercizer.oeip.entry.too.large");
                }
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }

    private static JsonArray strings(JsonArray values) {
        JsonArray clean = new JsonArray();
        if (values != null) {
            for (Object value : values) {
                if (value instanceof String) {
                    clean.add(value);
                }
            }
        }
        return clean;
    }

    private static String clip(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
