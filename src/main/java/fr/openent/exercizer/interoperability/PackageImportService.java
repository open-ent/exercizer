package fr.openent.exercizer.interoperability;

import fr.tech.openent.interoperability.CourseFormat;
import fr.tech.openent.interoperability.CourseFormats;
import fr.tech.openent.interoperability.ReadOptions;
import fr.tech.openent.interoperability.io.ArchiveLimits;
import fr.tech.openent.interoperability.model.Activity;
import fr.tech.openent.interoperability.model.ConversionReport;
import fr.tech.openent.interoperability.model.Course;
import fr.tech.openent.interoperability.model.Notice;
import fr.tech.openent.interoperability.model.Section;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import fr.openent.exercizer.interoperability.text.AikenReader;
import fr.openent.exercizer.interoperability.text.GiftReader;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

/**
 * Conversion d'un paquet déposé en charge utile d'import exercizer.
 *
 * Le dépôt se fait par téléversement de fichier et jamais par URL : la route
 * {@code POST /subject/:id/external-resource} récupère déjà une URL arbitraire côté serveur, et
 * son propre code signale cette surface SSRF comme à durcir. Il n'y a aucune raison de
 * l'élargir.
 *
 * La lecture d'un paquet est bloquante — dépaquetage, analyse XML, empreintes — et ne s'exécute
 * donc jamais sur la boucle d'événements.
 */
public class PackageImportService {

    private final Vertx vertx;
    private final ArchiveLimits limits;

    public PackageImportService(Vertx vertx, long maxPackageSize) {
        this.vertx = vertx;
        this.limits = maxPackageSize > 0
                ? ArchiveLimits.DEFAULT.copy().maxTotalBytes(maxPackageSize)
                : ArchiveLimits.DEFAULT;
    }

    /** Le résultat d'une conversion : ce qu'on créerait, et ce qu'on perdrait en le créant. */
    public static final class Converted {
        private final String format;
        private final JsonObject payload;
        private final JsonObject analysis;

        Converted(String format, JsonObject payload, JsonObject analysis) {
            this.format = format;
            this.payload = payload;
            this.analysis = analysis;
        }

        /** Identifiant du format reconnu ({@code moodle-xml}, {@code qti}, {@code oeip}, {@code gift}…). */
        public String format() {
            return format;
        }

        /** Charge utile de {@code POST /subject/import}, ou {@code null} si rien n'est créable. */
        public JsonObject payload() {
            return payload;
        }

        /** Ce que l'enseignant doit voir AVANT de valider. */
        public JsonObject analysis() {
            return analysis;
        }
    }

    /** Formats texte : au-delà, ce n'est pas une banque de questions écrite à la main. */
    private static final long MAX_TEXT_BYTES = 5L * 1024 * 1024;

    public Future<Converted> convert(final String path) {
        return convert(path, 0);
    }

    /**
     * @param item rang du sujet à retenir quand le paquet en porte plusieurs (OEIP) ; ignoré sinon.
     */
    public Future<Converted> convert(final String path, final int item) {
        final Promise<Converted> promise = Promise.promise();
        vertx.executeBlocking(blocking -> {
            try {
                blocking.complete(convertBlocking(Paths.get(path), item));
            } catch (IOException e) {
                blocking.fail(e);
            }
        }, false, promise);
        return promise.future();
    }

    public Converted convertBlocking(Path file) throws IOException {
        return convertBlocking(file, 0);
    }

    /**
     * Ordre de reconnaissance, au CONTENU et jamais à l'extension :
     * <ol>
     *   <li>OEIP — un ZIP à manifeste {@code oeip-manifest.json}. Il passe en tête : un paquet
     *       OEIP porte aussi un {@code imsmanifest.xml} (projection Common Cartridge) que la
     *       bibliothèque prendrait pour un cartouche, en perdant les grains natifs ;</li>
     *   <li>les formats de la bibliothèque d'interopérabilité (Moodle, QTI, Common Cartridge,
     *       SCORM, cmi5, xAPI, LearnHouse) ;</li>
     *   <li>les formats texte de Moodle : Aiken, puis GIFT (Aiken n'a pas d'accolades, GIFT si).</li>
     * </ol>
     */
    public Converted convertBlocking(Path file, int item) throws IOException {
        if (OeipSubjectReader.isOeip(file)) {
            return convertOeip(file, item);
        }

        CourseFormat format = CourseFormats.detect(file);
        if (format != null) {
            ConversionReport report = new ConversionReport();
            // Les binaires ne sont pas lus : à ce stade on ne crée que des grains, et le rattachement
            // des fichiers au sujet n'est pas en place. Les citer serait mentir.
            ReadOptions options = ReadOptions.DEFAULT.copy().limits(limits).includeBinaries(false);
            Course course = CourseFormats.read(file, format, options, report);
            try {
                return fromCourse(format.id(), format.label(), course, report);
            } finally {
                course.close();
            }
        }

        String text = readText(file);
        if (text != null) {
            ConversionReport report = new ConversionReport();
            if (AikenReader.looksLikeAiken(text)) {
                return fromCourse("aiken", "Aiken (Moodle)",
                        new AikenReader(report).read(text, null), report);
            }
            if (GiftReader.looksLikeGift(text)) {
                return fromCourse("gift", "GIFT (Moodle)",
                        new GiftReader(report).read(text, null), report);
            }
        }
        throw new IOException("exercizer.import.format.unknown");
    }

    private Converted fromCourse(String formatId, String label, Course course, ConversionReport report) {
        JsonObject payload = new CourseToSubjectConverter(report).toImportPayload(course);
        return new Converted(formatId, payload, analysis(formatId, label, course, payload, report));
    }

    private Converted convertOeip(Path file, int item) throws IOException {
        ConversionReport report = new ConversionReport();
        OeipSubjectReader.Result result = new OeipSubjectReader(report).read(file);
        List<OeipSubjectReader.Subject> subjects = result.subjects();
        int selected = item >= 0 && item < subjects.size() ? item : 0;
        JsonObject payload = subjects.isEmpty() ? null : subjects.get(selected).payload().copy();

        JsonArray list = new JsonArray();
        JsonArray activities = new JsonArray();
        int questions = 0;
        for (int i = 0; i < subjects.size(); i++) {
            OeipSubjectReader.Subject subject = subjects.get(i);
            int grains = subject.payload().getJsonArray("grains").size();
            list.add(new JsonObject()
                    .put("index", i)
                    .put("title", subject.title())
                    .put("grains", grains)
                    .put("levels", subject.levels())
                    .put("disciplines", subject.disciplines()));
            activities.add(new JsonObject().put("title", subject.title()).put("type", "subject")
                    .put("questions", grains));
            questions += grains;
        }

        JsonObject analysis = new JsonObject()
                .put("format", "oeip")
                .put("formatLabel", "OEIP " + (result.version() == null ? "" : result.version()))
                .put("sourceSystem", result.sourceSystem())
                .put("sourceVersion", result.version())
                .put("title", result.title())
                .put("counts", new JsonObject()
                        .put("sections", 1)
                        .put("activities", subjects.size())
                        .put("questions", questions)
                        .put("grains", payload == null ? 0 : payload.getJsonArray("grains").size()))
                .put("outline", new JsonArray().add(new JsonObject()
                        .put("title", result.title()).put("activities", activities)))
                .put("subjects", list)
                .put("selected", selected)
                .put("fidelity", report.fidelity())
                .put("notices", notices(report));
        if (payload != null) {
            analysis.put("preview", payload);
            OeipSubjectReader.Subject subject = subjects.get(selected);
            analysis.put("levels", subject.levels()).put("disciplines", subject.disciplines());
        }
        return new Converted("oeip", payload, analysis);
    }

    /**
     * Le fichier comme texte UTF-8, ou {@code null} s'il est binaire ou trop gros pour être une
     * banque de questions écrite à la main.
     */
    private static String readText(Path file) throws IOException {
        if (Files.size(file) > MAX_TEXT_BYTES) {
            return null;
        }
        byte[] bytes = Files.readAllBytes(file);
        for (byte b : bytes) {
            if (b == 0) {
                return null;
            }
        }
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            // Un export Windows en Latin-1 reste lisible : on le prend tel quel plutôt que de refuser.
            return new String(bytes, StandardCharsets.ISO_8859_1);
        }
    }

    private JsonObject analysis(String formatId, String label, Course course, JsonObject payload,
                                ConversionReport report) {
        JsonArray outline = new JsonArray();
        for (Section section : course.sections()) {
            JsonArray activities = new JsonArray();
            for (Activity activity : section.activities()) {
                activities.add(new JsonObject()
                        .put("title", activity.title())
                        .put("type", activity.type().name().toLowerCase())
                        .put("questions", activity.questions().size()));
            }
            outline.add(new JsonObject()
                    .put("title", section.title())
                    .put("activities", activities));
        }

        JsonObject analysis = new JsonObject()
                .put("format", formatId)
                .put("formatLabel", label)
                .put("sourceSystem", course.sourceSystem())
                .put("sourceVersion", course.sourceVersion())
                .put("title", course.title())
                .put("counts", new JsonObject()
                        .put("sections", course.sections().size())
                        .put("activities", course.allActivities().size())
                        .put("questions", course.allQuestions().size())
                        .put("grains", payload == null
                                ? 0 : payload.getJsonArray("grains").size()))
                .put("outline", outline)
                .put("fidelity", report.fidelity())
                .put("notices", notices(report));
        // L'aperçu de la conversion : les grains tels qu'ils seraient créés, pour que
        // l'enseignant les voie AVANT de valider.
        if (payload != null) {
            analysis.put("preview", payload);
        }
        return analysis;
    }

    private static JsonArray notices(ConversionReport report) {
        JsonArray notices = new JsonArray();
        for (Notice notice : report.notices()) {
            notices.add(new JsonObject()
                    .put("level", notice.level().name().toLowerCase())
                    .put("code", notice.code())
                    .put("message", notice.message())
                    .put("location", notice.location()));
        }
        return notices;
    }
}
