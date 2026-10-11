package fr.openent.exercizer.interoperability;

import fr.tech.openent.interoperability.CourseFormat;
import fr.tech.openent.interoperability.CourseFormats;
import fr.tech.openent.interoperability.WriteOptions;
import fr.tech.openent.interoperability.model.ConversionReport;
import fr.tech.openent.interoperability.model.Course;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Écriture d'un sujet exercizer dans un format d'échange. */
public class PackageExportService {

    private final Vertx vertx;
    private final String platformName;
    private final String platformUrl;

    public PackageExportService(Vertx vertx, String platformName, String platformUrl) {
        this.vertx = vertx;
        this.platformName = platformName == null ? "Open ENT" : platformName;
        this.platformUrl = platformUrl;
    }

    /** Le fichier produit et ce qui a été perdu en le produisant. */
    public static final class Exported {
        private final Path file;
        private final String fileName;
        private final String mediaType;
        private final ConversionReport report;

        Exported(Path file, String fileName, String mediaType, ConversionReport report) {
            this.file = file;
            this.fileName = fileName;
            this.mediaType = mediaType;
            this.report = report;
        }

        public Path file() {
            return file;
        }

        public String fileName() {
            return fileName;
        }

        public String mediaType() {
            return mediaType;
        }

        public ConversionReport report() {
            return report;
        }
    }

    /**
     * @param formatId identifiant stable du format ({@code scorm12}, {@code scorm2004},
     *                 {@code moodle}, {@code moodle-xml}, {@code learnhouse})
     */
    public Future<Exported> export(final JsonObject subject, final JsonArray grains,
                                   final String formatId) {
        final Promise<Exported> promise = Promise.promise();
        final CourseFormat format = CourseFormat.byId(formatId);
        if (format == null) {
            promise.fail("exercizer.export.format.unknown");
            return promise.future();
        }
        vertx.executeBlocking(blocking -> {
            try {
                blocking.complete(exportBlocking(subject, grains, format));
            } catch (IOException e) {
                blocking.fail(e);
            }
        }, false, promise);
        return promise.future();
    }

    public Exported exportBlocking(JsonObject subject, JsonArray grains, CourseFormat format)
            throws IOException {
        ConversionReport report = new ConversionReport();
        Course course = new SubjectToCourseConverter(report).convert(subject, grains);
        try {
            Path target = Files.createTempFile("exercizer-export-", format.extension());
            // createTempFile crée un fichier vide ; les écrivains d'archive le remplacent.
            Files.deleteIfExists(target);
            WriteOptions options = WriteOptions.DEFAULT.copy()
                    .platformName(platformName)
                    .platformUrl(platformUrl);
            CourseFormats.write(course, target, format, options, report);
            return new Exported(target, fileName(subject, format), format.mediaType(), report);
        } finally {
            course.close();
        }
    }

    /**
     * Nom du fichier proposé au téléchargement.
     *
     * Les caractères hors alphanumériques sont remplacés : un titre de sujet contenant une barre
     * oblique ou un guillemet désorganiserait l'en-tête {@code Content-Disposition}.
     */
    private static String fileName(JsonObject subject, CourseFormat format) {
        String title = subject.getString("title");
        String base = title == null ? "sujet" : title.replaceAll("[^\\p{Alnum}]+", "-");
        if (base.length() > 60) {
            base = base.substring(0, 60);
        }
        if (base.isEmpty()) {
            base = "sujet";
        }
        return base + format.extension();
    }
}
