package fr.openent.exercizer.interoperability;

import fr.tech.openent.interoperability.CourseFormat;
import fr.tech.openent.interoperability.CourseFormats;
import fr.tech.openent.interoperability.ReadOptions;
import fr.tech.openent.interoperability.model.Activity;
import fr.tech.openent.interoperability.model.ActivityType;
import fr.tech.openent.interoperability.model.Asset;
import fr.tech.openent.interoperability.model.ConversionReport;
import fr.tech.openent.interoperability.model.Course;
import fr.wseduc.webutils.Either;
import io.vertx.core.CompositeFuture;
import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.storage.Storage;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Dépôt et restitution des paquets SCORM.
 *
 * Le paquet est dépaqueté à l'enregistrement et chacun de ses fichiers est écrit dans le stockage
 * de l'ENT ; la table {@code scorm_package} retient la correspondance entre le chemin relatif
 * d'origine — celui qu'emploient les href du paquet — et l'identifiant opaque rendu par le
 * stockage.
 *
 * Cette correspondance n'est pas qu'une commodité : comme le service de contenu ne sert QUE des
 * chemins présents dans cette table, aucune traversée de répertoire n'est possible par
 * construction. Il n'y a pas de chemin à assainir, parce qu'il n'y a pas de chemin.
 */
public class ScormService {

    private static final String TABLE = "exercizer.scorm_package";
    private static final String STATE_TABLE = "exercizer.scorm_state";

    private final Vertx vertx;
    private final Storage storage;

    public ScormService(Vertx vertx, Storage storage) {
        this.vertx = vertx;
        this.storage = storage;
    }

    /** Ce qu'un dépôt produit. */
    public static final class Deposited {
        private final String title;
        private final String entryPoint;
        private final String version;
        private final Map<String, String> files;

        Deposited(String title, String entryPoint, String version, Map<String, String> files) {
            this.title = title;
            this.entryPoint = entryPoint;
            this.version = version;
            this.files = files;
        }

        public String title() {
            return title;
        }

        public String entryPoint() {
            return entryPoint;
        }

        public String version() {
            return version;
        }

        public Map<String, String> files() {
            return files;
        }
    }

    /**
     * Lit un paquet SCORM déposé et écrit chacun de ses fichiers dans le stockage.
     *
     * @param path chemin du fichier téléversé
     */
    public Future<Deposited> deposit(final String path) {
        final Promise<Deposited> promise = Promise.promise();
        vertx.executeBlocking(blocking -> {
            try {
                blocking.complete(readPackage(Paths.get(path)));
            } catch (IOException e) {
                blocking.fail(e);
            }
        }, false, (io.vertx.core.AsyncResult<ReadPackage> read) -> {
            if (read.failed()) {
                promise.fail(read.cause());
                return;
            }
            writeAll(read.result()).onComplete(promise);
        });
        return promise.future();
    }

    /** Résultat intermédiaire : le contenu lu, pas encore écrit. */
    private static final class ReadPackage {
        private String title;
        private String entryPoint;
        private String version;
        private final Map<String, byte[]> files = new LinkedHashMap<String, byte[]>();
    }

    private ReadPackage readPackage(Path file) throws IOException {
        CourseFormat format = CourseFormats.detect(file);
        if (format == null || !format.isScorm()) {
            throw new IOException("exercizer.scorm.format.invalid");
        }
        ConversionReport report = new ConversionReport();
        Course course = CourseFormats.read(file, format, ReadOptions.DEFAULT, report);
        try {
            ReadPackage read = new ReadPackage();
            read.title = course.title();
            read.version = CourseFormat.SCORM_2004 == format
                    ? ScormCmi.VERSION_2004 : ScormCmi.VERSION_12;

            for (Activity activity : course.allActivities()) {
                if (activity.type() == ActivityType.SCORM && activity.scormEntryPoint() != null) {
                    read.entryPoint = activity.scormEntryPoint();
                    if (activity.scormVersion() != null) {
                        read.version = activity.scormVersion();
                    }
                    break;
                }
            }
            if (read.entryPoint == null) {
                // Un paquet sans contenu exécutable n'a rien à faire dans un lecteur SCORM.
                throw new IOException("exercizer.scorm.no.entry.point");
            }

            // Tout le paquet est conservé, et pas seulement les fichiers du SCO d'entrée : une
            // feuille de style ou une image non déclarée reste citée par le HTML, et son absence
            // ne se verrait qu'à l'écran.
            for (Asset asset : course.assets().values()) {
                if (asset.content() == null || asset.sourcePath() == null) {
                    continue;
                }
                read.files.put(asset.sourcePath(), readAll(asset));
            }
            return read;
        } finally {
            course.close();
        }
    }

    private Future<Deposited> writeAll(final ReadPackage read) {
        final Map<String, String> ids = new LinkedHashMap<String, String>();
        List<Future> writes = new ArrayList<Future>();
        for (final Map.Entry<String, byte[]> file : read.files.entrySet()) {
            final Promise<Void> written = Promise.promise();
            writes.add(written.future());
            storage.writeBuffer(Buffer.buffer(file.getValue()), "application/octet-stream",
                    file.getKey(), new Handler<JsonObject>() {
                        @Override
                        public void handle(JsonObject result) {
                            if ("ok".equals(result.getString("status"))) {
                                synchronized (ids) {
                                    ids.put(file.getKey(), result.getString("_id"));
                                }
                                written.complete();
                            } else {
                                written.fail(result.getString("message", "storage.error"));
                            }
                        }
                    });
        }
        return CompositeFuture.all(writes)
                .map(done -> new Deposited(read.title, read.entryPoint, read.version, ids));
    }

    public void create(long subjectId, String owner, Deposited deposited,
                       Handler<Either<String, JsonObject>> handler) {
        JsonObject files = new JsonObject();
        for (Map.Entry<String, String> file : deposited.files().entrySet()) {
            files.put(file.getKey(), file.getValue());
        }
        String query = "INSERT INTO " + TABLE
                + " (subject_id, title, files, entry_point, scorm_version, owner)"
                + " VALUES (?, ?, to_json(?::json), ?, ?, ?) RETURNING id, entry_point, scorm_version";
        JsonArray values = new JsonArray()
                .add(subjectId)
                .add(deposited.title() == null ? "Module SCORM" : deposited.title())
                .add(files.encode())
                .add(deposited.entryPoint())
                .add(deposited.version())
                .add(owner);
        Sql.getInstance().prepared(query, values, SqlResult.validUniqueResultHandler(handler));
    }

    public void get(long packageId, Handler<Either<String, JsonObject>> handler) {
        String query = "SELECT id, subject_id, title, files, entry_point, scorm_version FROM "
                + TABLE + " WHERE id = ?";
        Sql.getInstance().prepared(query, new JsonArray().add(packageId),
                SqlResult.validUniqueResultHandler(handler));
    }

    /** Lit un fichier du paquet par son chemin d'origine. */
    public void readFile(JsonObject scormPackage, String relativePath,
                         final Handler<Either<String, Buffer>> handler) {
        JsonObject files = asJson(scormPackage.getValue("files"));
        String fileId = files.getString(relativePath);
        if (fileId == null) {
            // Le chemin ne figure pas dans la table du paquet : il n'existe pas, et il n'y a
            // rien à chercher ailleurs.
            handler.handle(new Either.Left<String, Buffer>("exercizer.scorm.file.unknown"));
            return;
        }
        storage.readFile(fileId, new Handler<Buffer>() {
            @Override
            public void handle(Buffer buffer) {
                // readFile signale l'échec par un null, sans canal d'erreur.
                if (buffer == null) {
                    handler.handle(new Either.Left<String, Buffer>("exercizer.scorm.file.missing"));
                } else {
                    handler.handle(new Either.Right<String, Buffer>(buffer));
                }
            }
        });
    }

    public void loadState(long packageId, String owner, Long subjectCopyId,
                          Handler<Either<String, JsonObject>> handler) {
        String query = "SELECT cmi, score_raw, score_max, completed, passed FROM " + STATE_TABLE
                + " WHERE package_id = ? AND owner = ? AND COALESCE(subject_copy_id, -1) = ?";
        Sql.getInstance().prepared(query,
                new JsonArray().add(packageId).add(owner)
                        .add(subjectCopyId == null ? -1L : subjectCopyId),
                SqlResult.validUniqueResultHandler(handler));
    }

    public void saveState(long packageId, String owner, Long subjectCopyId, JsonObject cmi,
                          String version, Handler<Either<String, JsonObject>> handler) {
        ScormCmi state = new ScormCmi(cmi, version);
        String query = "INSERT INTO " + STATE_TABLE
                + " (package_id, owner, subject_copy_id, cmi, score_raw, score_max, completed,"
                + " passed, updated)"
                + " VALUES (?, ?, ?, to_json(?::json), ?, ?, ?, ?, NOW())"
                // L'élève repasse le module : son état est remplacé, pas dupliqué.
                + " ON CONFLICT (package_id, owner, COALESCE(subject_copy_id, -1)) DO UPDATE SET"
                + " cmi = EXCLUDED.cmi, score_raw = EXCLUDED.score_raw,"
                + " score_max = EXCLUDED.score_max, completed = EXCLUDED.completed,"
                + " passed = EXCLUDED.passed, updated = NOW()"
                + " RETURNING id, score_raw, score_max, completed, passed";
        JsonArray values = new JsonArray()
                .add(packageId)
                .add(owner)
                .add(subjectCopyId == null ? null : subjectCopyId)
                .add(cmi == null ? "{}" : cmi.encode())
                .add(state.scoreRaw())
                .add(state.scoreMax())
                .add(state.completed())
                .add(state.passed());
        Sql.getInstance().prepared(query, values, SqlResult.validUniqueResultHandler(handler));
    }

    public static JsonObject asJson(Object value) {
        if (value instanceof JsonObject) {
            return (JsonObject) value;
        }
        if (value instanceof String) {
            try {
                return new JsonObject((String) value);
            } catch (RuntimeException e) {
                return new JsonObject();
            }
        }
        return new JsonObject();
    }

    private static byte[] readAll(Asset asset) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        InputStream in = asset.open();
        try {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
        } finally {
            in.close();
        }
        return out.toByteArray();
    }
}
