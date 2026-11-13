package fr.openent.exercizer.packs;

import fr.openent.exercizer.utils.PlainText;
import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.eventbus.Message;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.sql.SqlStatementsBuilder;

import java.util.Map;

/**
 * Sujets installés par un pack pédagogique, à la demande du module d'interopérabilité
 * ({@code BusPackAdapter}, adresse {@value #ADDRESS}).
 *
 * <p>Un sujet de pack est un sujet du catalogue du compte technique, repéré par l'identifiant
 * global de la ressource ({@code pack_global_id}). Document attendu :
 * <pre>
 * { "subject": {title, description, picture, type, large_display, authors_contributors},
 *   "levels": ["CE1"], "disciplines": ["MATHEMATIQUES"],
 *   "grains": [{grain_type_id, order_by, grain_data: {…}}] }
 * </pre>
 * Niveaux et matières sont désignés par leur CODE (sql/041), jamais par identifiant.</p>
 *
 * <p>Un sujet que le catalogue contenait déjà avant les packs (même titre, même compte technique,
 * pas encore d'identifiant de pack) est REPRIS plutôt que dupliqué : c'est ainsi que le jeu
 * d'exercices de la migration 042 devient le pack « Catalogue d'exercices » sans changer d'id.</p>
 */
public class PackBusHandler implements Handler<Message<JsonObject>> {

    public static final String ADDRESS = "exercizer.packs";
    private static final Logger log = LoggerFactory.getLogger(PackBusHandler.class);
    private static final String S = "exercizer.";

    private final Sql sql = Sql.getInstance();

    @Override
    public void handle(Message<JsonObject> message) {
        final JsonObject body = message.body();
        final String action = body.getString("action", "");
        final Handler<Either<String, JsonObject>> reply = result -> {
            if (result.isRight()) {
                message.reply(result.right().getValue().put("status", "ok"));
            } else {
                log.error("[Exercizer] pack, action " + action + " : " + result.left().getValue());
                message.reply(new JsonObject().put("status", "error").put("message", result.left().getValue()));
            }
        };
        switch (action) {
            case "install":
                install(body, reply);
                break;
            case "access":
                access(body.getJsonArray("ids", new JsonArray()), body.getJsonObject("access", new JsonObject()), reply);
                break;
            case "alignedResults":
                alignedResults(body.getJsonArray("students", new JsonArray()), reply);
                break;
            default:
                reply.handle(new Either.Left<>("action inconnue : " + action));
        }
    }

    // ------------------------------------------------------------------ résultats alignés

    /**
     * Copies rendues par ces élèves sur des sujets alignés sur le référentiel, une ligne par énoncé
     * travaillé : de quoi suggérer un badge à l'enseignant (module openbadges), preuves à l'appui.
     */
    private void alignedResults(JsonArray students, Handler<Either<String, JsonObject>> handler) {
        if (students.isEmpty()) {
            handler.handle(new Either.Right<>(new JsonObject().put("results", new JsonArray())));
            return;
        }
        final StringBuilder in = new StringBuilder("?");
        for (int i = 1; i < students.size(); i++) {
            in.append(",?");
        }
        sql.prepared("SELECT c.id AS \"copyId\", c.owner AS student, a.cfitem_id AS cfitem, s.title, "
                + "COALESCE(c.final_score, c.calculated_score) AS score, "
                + "COALESCE(ss.max_score, s.max_score) AS \"maxScore\", c.submitted_date AS date "
                + "FROM " + S + "subject_copy c "
                + "JOIN " + S + "subject_scheduled ss ON ss.id = c.subject_scheduled_id "
                + "JOIN " + S + "subject s ON s.id = ss.subject_id "
                + "JOIN " + S + "subject_alignment a ON a.subject_id = ss.subject_id "
                + "WHERE c.submitted_date IS NOT NULL AND c.owner IN (" + in + ") "
                + "ORDER BY c.submitted_date DESC", students, SqlResult.validResultHandler(result ->
                handler.handle(result.isRight()
                        ? new Either.Right<>(new JsonObject().put("results", result.right().getValue()))
                        : new Either.Left<>(result.left().getValue()))));
    }

    // ------------------------------------------------------------------ installation

    private void install(JsonObject body, Handler<Either<String, JsonObject>> handler) {
        final String globalId = body.getString("globalId");
        final JsonObject owner = body.getJsonObject("owner", new JsonObject());
        final JsonObject document = body.getJsonObject("document", new JsonObject());
        final JsonObject subject = document.getJsonObject("subject", new JsonObject());
        if (globalId == null || owner.getString("id") == null || subject.getString("title") == null) {
            handler.handle(new Either.Left<>("installation incomplète : globalId, owner.id et subject.title requis"));
            return;
        }
        final String localId = body.getString("localId");
        // Sujet déjà lié à ce pack, sinon sujet du catalogue d'avant les packs à reprendre.
        final String existing = "SELECT id FROM " + S + "subject WHERE "
                + (localId != null ? "id = ? AND " : "")
                + "is_library_subject = true AND owner = ? AND (pack_global_id = ? OR (pack_global_id IS NULL "
                + "AND is_deleted = false AND title = ?)) ORDER BY (pack_global_id IS NULL), id LIMIT 1";
        final JsonArray params = new JsonArray();
        if (localId != null) {
            params.add(Long.valueOf(localId));
        }
        params.add(owner.getString("id")).add(globalId).add(subject.getString("title"));
        sql.prepared(existing, params, SqlResult.validUniqueResultHandler(found -> {
            if (found.isLeft()) {
                handler.handle(found);
                return;
            }
            final Long id = found.right().getValue().getLong("id");
            if (id != null) {
                write(id, false, globalId, owner, document, body.getJsonArray("alignments", new JsonArray()), handler);
                return;
            }
            sql.raw("SELECT nextval('" + S + "subject_id_seq') AS id", SqlResult.validUniqueResultHandler(next -> {
                if (next.isLeft()) {
                    handler.handle(next);
                } else {
                    write(next.right().getValue().getLong("id"), true, globalId, owner, document,
                            body.getJsonArray("alignments", new JsonArray()), handler);
                }
            }));
        }));
    }

    private void write(Long id, boolean created, String globalId, JsonObject owner, JsonObject document,
                       JsonArray alignments, Handler<Either<String, JsonObject>> handler) {
        final JsonObject subject = document.getJsonObject("subject", new JsonObject());
        final SqlStatementsBuilder s = new SqlStatementsBuilder();
        s.prepared("SELECT " + S + "merge_users(?,?)", new JsonArray().add(owner.getString("id")).add(owner.getString("name")));
        final JsonArray fields = new JsonArray()
                .add(subject.getString("title"))
                .add(subject.getValue("description"))
                .add(subject.getValue("picture"))
                .add(subject.getString("authors_contributors", owner.getString("name")))
                .add(subject.getString("type", "interactive"))
                .add(subject.getBoolean("large_display", false))
                .add(globalId);
        if (created) {
            s.prepared("INSERT INTO " + S + "subject (title, description, picture, authors_contributors, type, "
                    + "large_display, pack_global_id, id, folder_id, owner, owner_username, max_score, "
                    + "is_library_subject, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, true, false)",
                    fields.copy().add(id).add(owner.getString("id")).add(owner.getString("name")));
        } else {
            s.prepared("UPDATE " + S + "subject SET title = ?, description = ?, picture = ?, authors_contributors = ?, "
                    + "type = ?, large_display = ?, pack_global_id = ?, is_deleted = false, modified = NOW() WHERE id = ?",
                    fields.copy().add(id));
            // Le contenu d'un sujet de pack est celui du pack : il est remplacé, pas fusionné.
            for (String table : new String[]{"grain", "subject_section", "subject_level", "subject_discipline",
                    "subject_alignment"}) {
                s.prepared("DELETE FROM " + S + table + " WHERE subject_id = ?", new JsonArray().add(id));
            }
        }
        for (Object o : document.getJsonArray("grains", new JsonArray())) {
            final JsonObject grain = (JsonObject) o;
            s.prepared("INSERT INTO " + S + "grain (subject_id, grain_type_id, order_by, grain_data) VALUES (?, ?, ?, ?)",
                    new JsonArray().add(id).add(grain.getInteger("grain_type_id")).add(grain.getInteger("order_by"))
                            // L'explication est du texte dans exercizer : un pack peut l'avoir mise en HTML.
                            .add(PlainText.normaliseExplanation(grain.getJsonObject("grain_data", new JsonObject()).copy()).encode()));
        }
        insertByCode(s, id, "subject_level", "level_id", "subject_lesson_level", document.getJsonArray("levels"));
        insertByCode(s, id, "subject_discipline", "discipline_id", "subject_lesson_type", document.getJsonArray("disciplines"));
        for (Object item : alignments) {
            s.prepared("INSERT INTO " + S + "subject_alignment (subject_id, cfitem_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
                    new JsonArray().add(id).add(String.valueOf(item)));
        }
        s.prepared("UPDATE " + S + "subject SET max_score = COALESCE((SELECT sum(cast(g.grain_data::json->>'max_score' "
                + "AS double precision)) FROM " + S + "grain AS g WHERE g.subject_id = ?), 0) WHERE id = ?",
                new JsonArray().add(id).add(id));
        sql.transaction(s.build(), SqlResult.validRowsResultHandler(done -> handler.handle(done.isLeft()
                ? new Either.Left<>(done.left().getValue())
                : new Either.Right<>(new JsonObject().put("id", id).put("created", created)))));
    }

    private static void insertByCode(SqlStatementsBuilder s, Long id, String table, String column, String referential,
                                     JsonArray codes) {
        if (codes == null || codes.isEmpty()) {
            return;
        }
        s.prepared("INSERT INTO " + S + table + " (subject_id, " + column + ") SELECT ?, x.id FROM " + S + referential
                + " AS x WHERE x.code IN " + Sql.listPrepared(codes.getList()) + " ON CONFLICT DO NOTHING",
                new JsonArray().add(id).addAll(codes));
    }

    // ------------------------------------------------------------------ accès

    /** Remplace l'accès des sujets : {@code {everyone: audience|null, structures: {id: audience}}}. */
    private void access(JsonArray ids, JsonObject access, Handler<Either<String, JsonObject>> handler) {
        if (ids.isEmpty()) {
            handler.handle(new Either.Right<>(new JsonObject()));
            return;
        }
        final SqlStatementsBuilder s = new SqlStatementsBuilder();
        final JsonArray subjectIds = new JsonArray();
        for (Object id : ids) {
            subjectIds.add(Long.valueOf(String.valueOf(id)));
        }
        s.prepared("DELETE FROM " + S + "subject_access WHERE subject_id IN " + Sql.listPrepared(subjectIds.getList()),
                subjectIds);
        final String everyone = access.getString("everyone");
        for (Object id : subjectIds) {
            if (everyone != null) {
                s.prepared("INSERT INTO " + S + "subject_access (subject_id, structure_id, audience) VALUES (?, '*', ?)",
                        new JsonArray().add(id).add(everyone));
            }
            for (Map.Entry<String, Object> e : access.getJsonObject("structures", new JsonObject())) {
                s.prepared("INSERT INTO " + S + "subject_access (subject_id, structure_id, audience) VALUES (?, ?, ?)",
                        new JsonArray().add(id).add(e.getKey()).add(String.valueOf(e.getValue())));
            }
        }
        sql.transaction(s.build(), SqlResult.validRowsResultHandler(handler));
    }
}
