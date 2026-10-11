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

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;

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
        private final CourseFormat format;
        private final JsonObject payload;
        private final JsonObject analysis;

        Converted(CourseFormat format, JsonObject payload, JsonObject analysis) {
            this.format = format;
            this.payload = payload;
            this.analysis = analysis;
        }

        public CourseFormat format() {
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

    public Future<Converted> convert(final String path) {
        final Promise<Converted> promise = Promise.promise();
        vertx.executeBlocking(blocking -> {
            try {
                blocking.complete(convertBlocking(Paths.get(path)));
            } catch (IOException e) {
                blocking.fail(e);
            }
        }, false, promise);
        return promise.future();
    }

    public Converted convertBlocking(Path file) throws IOException {
        CourseFormat format = CourseFormats.detect(file);
        if (format == null) {
            throw new IOException("exercizer.import.format.unknown");
        }

        ConversionReport report = new ConversionReport();
        // Les binaires ne sont pas lus : à ce stade on ne crée que des grains, et le rattachement
        // des fichiers au sujet n'est pas en place. Les citer serait mentir.
        ReadOptions options = ReadOptions.DEFAULT.copy().limits(limits).includeBinaries(false);

        Course course = CourseFormats.read(file, format, options, report);
        try {
            JsonObject payload = new CourseToSubjectConverter(report).toImportPayload(course);
            return new Converted(format, payload, analysis(format, course, payload, report));
        } finally {
            course.close();
        }
    }

    private JsonObject analysis(CourseFormat format, Course course, JsonObject payload,
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

        JsonArray notices = new JsonArray();
        for (Notice notice : report.notices()) {
            notices.add(new JsonObject()
                    .put("level", notice.level().name().toLowerCase())
                    .put("code", notice.code())
                    .put("message", notice.message())
                    .put("location", notice.location()));
        }

        return new JsonObject()
                .put("format", format.id())
                .put("formatLabel", format.label())
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
                .put("notices", notices);
    }
}
