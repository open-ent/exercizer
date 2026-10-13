package fr.openent.exercizer.services.impl;

import fr.openent.exercizer.services.ICatalogService;
import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.sql.SqlStatementsBuilder;
import org.entcore.common.user.UserInfos;

/**
 * Catalogue d'exercices. Un sujet du catalogue est un sujet {@code is_library_subject = true} : sans
 * dossier, sans partage, sans établissement. On n'y écrit qu'en le PUBLIANT (copie d'un sujet de
 * l'usager) et on n'en sort qu'en le COPIANT (copie dans les sujets de l'usager) : il n'est jamais
 * modifié ni distribué en place.
 *
 * Toutes les lectures portent la garde {@code is_library_subject = true} : un id de sujet personnel
 * passé dans une route du catalogue ne renvoie rien.
 */
public class CatalogServiceSqlImpl extends AbstractExercizerServiceSqlImpl implements ICatalogService {

    private static final String S = "exercizer.";
    private static final int MAX_LIMIT = 100;
    private static final String CATALOG_GUARD = "s.is_library_subject = true AND s.is_deleted = false";

    public CatalogServiceSqlImpl() {
        super("exercizer", "subject");
    }

    @Override
    public void referential(final Handler<Either<String, JsonObject>> handler) {
        sql.raw("SELECT id, code, label, rank, level_group FROM " + S + "subject_lesson_level " +
                "ORDER BY rank NULLS LAST, id", SqlResult.validResultHandler(levels -> {
            if (levels.isLeft()) {
                handler.handle(new Either.Left<>(levels.left().getValue()));
                return;
            }
            sql.raw("SELECT id, code, label FROM " + S + "subject_lesson_type ORDER BY id",
                    SqlResult.validResultHandler(disciplines -> {
                        if (disciplines.isLeft()) {
                            handler.handle(new Either.Left<>(disciplines.left().getValue()));
                            return;
                        }
                        handler.handle(new Either.Right<>(new JsonObject()
                                .put("levels", levels.right().getValue())
                                .put("disciplines", disciplines.right().getValue())));
                    }));
        }));
    }

    @Override
    public void list(final JsonObject criteria, final Handler<Either<String, JsonObject>> handler) {
        final StringBuilder where = new StringBuilder(" WHERE ").append(CATALOG_GUARD);
        final JsonArray values = new JsonArray();

        final String q = criteria.getString("q");
        if (q != null && !q.trim().isEmpty()) {
            final String pattern = "%" + escapeLike(q.trim()) + "%";
            where.append(" AND (s.title ILIKE ? OR s.description ILIKE ?)");
            values.add(pattern).add(pattern);
        }
        final JsonArray levels = criteria.getJsonArray("levels", new JsonArray());
        if (!levels.isEmpty()) {
            where.append(" AND EXISTS (SELECT 1 FROM ").append(S).append("subject_level AS fl WHERE fl.subject_id = s.id ")
                    .append("AND fl.level_id IN ").append(Sql.listPrepared(levels.getList())).append(")");
            levels.forEach(values::add);
        }
        final JsonArray disciplines = criteria.getJsonArray("disciplines", new JsonArray());
        if (!disciplines.isEmpty()) {
            where.append(" AND EXISTS (SELECT 1 FROM ").append(S).append("subject_discipline AS fd WHERE fd.subject_id = s.id ")
                    .append("AND fd.discipline_id IN ").append(Sql.listPrepared(disciplines.getList())).append(")");
            disciplines.forEach(values::add);
        }

        final int limit = Math.max(1, Math.min(MAX_LIMIT, criteria.getInteger("limit", 24)));
        final int offset = Math.max(0, criteria.getInteger("offset", 0));
        values.add(limit).add(offset);

        final String query = "SELECT s.id, s.title, s.description, s.picture, s.max_score, s.type, s.owner, s.owner_username, " +
                "s.authors_contributors, s.created, s.modified, " +
                "(SELECT count(*) FROM " + S + "grain AS g WHERE g.subject_id = s.id AND g.grain_type_id > 3) AS question_count, " +
                classificationColumns() + ", count(*) OVER () AS total " +
                "FROM " + S + "subject AS s" + where +
                " ORDER BY (SELECT min(l.rank) FROM " + S + "subject_level AS ol JOIN " + S + "subject_lesson_level AS l " +
                "ON l.id = ol.level_id WHERE ol.subject_id = s.id) NULLS LAST, lower(s.title), s.id " +
                "LIMIT ? OFFSET ?";

        sql.prepared(query, values, SqlResult.validResultHandler(event -> {
            if (event.isLeft()) {
                handler.handle(new Either.Left<>(event.left().getValue()));
                return;
            }
            final JsonArray rows = event.right().getValue();
            final long total = rows.isEmpty() ? 0 : rows.getJsonObject(0).getLong("total", 0L);
            rows.forEach(row -> ((JsonObject) row).remove("total"));
            handler.handle(new Either.Right<>(new JsonObject().put("total", total).put("subjects", rows)));
        }, "level_ids", "discipline_ids"));
    }

    @Override
    public void get(final Long catalogSubjectId, final Handler<Either<String, JsonObject>> handler) {
        final String subjectQuery = "SELECT s.*, " + classificationColumns() + " FROM " + S + "subject AS s " +
                "WHERE s.id = ? AND " + CATALOG_GUARD;
        sql.prepared(subjectQuery, new JsonArray().add(catalogSubjectId), SqlResult.validUniqueResultHandler(subject -> {
            if (subject.isLeft()) {
                handler.handle(new Either.Left<>(subject.left().getValue()));
                return;
            }
            if (subject.right().getValue().isEmpty()) {
                handler.handle(new Either.Left<>("not.found"));
                return;
            }
            sql.prepared("SELECT * FROM " + S + "grain WHERE subject_id = ? ORDER BY order_by, id",
                    new JsonArray().add(catalogSubjectId), SqlResult.validResultHandler(grains -> {
                        if (grains.isLeft()) {
                            handler.handle(new Either.Left<>(grains.left().getValue()));
                            return;
                        }
                        sql.prepared("SELECT * FROM " + S + "subject_section WHERE subject_id = ? ORDER BY order_by, id",
                                new JsonArray().add(catalogSubjectId), SqlResult.validResultHandler(sections -> {
                                    if (sections.isLeft()) {
                                        handler.handle(new Either.Left<>(sections.left().getValue()));
                                        return;
                                    }
                                    handler.handle(new Either.Right<>(new JsonObject()
                                            .put("subject", subject.right().getValue())
                                            .put("grains", grains.right().getValue())
                                            .put("sections", sections.right().getValue())));
                                }));
                    }));
        }, "level_ids", "discipline_ids"));
    }

    @Override
    public void classification(final Long subjectId, final Handler<Either<String, JsonObject>> handler) {
        sql.prepared("SELECT " + classificationColumns() + " FROM " + S + "subject AS s WHERE s.id = ?",
                new JsonArray().add(subjectId), SqlResult.validUniqueResultHandler(handler, "level_ids", "discipline_ids"));
    }

    @Override
    public void setClassification(final Long subjectId, final JsonArray levelIds, final JsonArray disciplineIds,
                                  final Handler<Either<String, JsonObject>> handler) {
        final SqlStatementsBuilder s = new SqlStatementsBuilder();
        CatalogSql.replaceClassification(s, subjectId, levelIds, disciplineIds);
        s.prepared("UPDATE " + S + "subject SET modified = NOW() WHERE id = ?", new JsonArray().add(subjectId));
        sql.transaction(s.build(), SqlResult.validRowsResultHandler(handler));
    }

    @Override
    public void copy(final Long catalogSubjectId, final Long folderId, final UserInfos user,
                     final Handler<Either<String, JsonObject>> handler) {
        withNewSubjectId(handler, newId -> {
            final SqlStatementsBuilder s = new SqlStatementsBuilder();
            s.prepared("SELECT " + S + "merge_users(?,?)", new JsonArray().add(user.getUserId()).add(user.getUsername()));
            // Le dossier n'est retenu que s'il appartient à l'usager ; sinon le sujet arrive à la racine.
            s.prepared("INSERT INTO " + S + "subject (id, folder_id, owner, owner_username, title, description, picture, " +
                            "max_score, is_library_subject, is_deleted, authors_contributors, type) " +
                            "SELECT ?, (SELECT f.id FROM " + S + "folder AS f WHERE f.id = ? AND f.owner = ?), ?, ?, " +
                            "s.title, s.description, s.picture, s.max_score, false, false, s.authors_contributors, s.type " +
                            "FROM " + S + "subject AS s WHERE s.id = ? AND " + CATALOG_GUARD,
                    new JsonArray().add(newId).add(folderId).add(user.getUserId()).add(user.getUserId())
                            .add(user.getUsername()).add(catalogSubjectId));
            copyContent(s, newId, catalogSubjectId);
            sql.transaction(s.build(), SqlResult.validRowsResultHandler(1, inserted -> {
                if (inserted.isLeft()) {
                    handler.handle(new Either.Left<>(inserted.left().getValue()));
                } else if (inserted.right().getValue().getInteger("rows", 0) == 0) {
                    handler.handle(new Either.Left<>("not.found"));
                } else {
                    handler.handle(new Either.Right<>(new JsonObject().put("id", newId)));
                }
            }));
        });
    }

    @Override
    public void publish(final Long subjectId, final JsonArray levelIds, final JsonArray disciplineIds, final String authors,
                        final UserInfos user, final Handler<Either<String, JsonObject>> handler) {
        withNewSubjectId(handler, newId -> {
            final SqlStatementsBuilder s = new SqlStatementsBuilder();
            s.prepared("SELECT " + S + "merge_users(?,?)", new JsonArray().add(user.getUserId()).add(user.getUsername()));
            s.prepared("INSERT INTO " + S + "subject (id, folder_id, owner, owner_username, title, description, picture, " +
                            "max_score, is_library_subject, is_deleted, authors_contributors, type) " +
                            "SELECT ?, NULL, ?, ?, s.title, s.description, s.picture, s.max_score, true, false, ?, s.type " +
                            "FROM " + S + "subject AS s WHERE s.id = ? AND s.owner = ? " +
                            "AND s.is_library_subject = false AND s.is_deleted = false",
                    new JsonArray().add(newId).add(user.getUserId()).add(user.getUsername())
                            .add(authors == null || authors.trim().isEmpty() ? user.getUsername() : authors.trim())
                            .add(subjectId).add(user.getUserId()));
            s.prepared("INSERT INTO " + S + "subject_document (subject_id, doc_id, doc_type, metadata) " +
                            "SELECT ?, d.doc_id, d.doc_type, d.metadata FROM " + S + "subject_document AS d WHERE d.subject_id = ?",
                    new JsonArray().add(newId).add(subjectId));
            SectionSql.copySectionsAndGrains(s, newId, subjectId);
            CatalogSql.replaceClassification(s, newId, levelIds, disciplineIds);
            sql.transaction(s.build(), SqlResult.validRowsResultHandler(1, inserted -> {
                if (inserted.isLeft()) {
                    handler.handle(new Either.Left<>(inserted.left().getValue()));
                } else if (inserted.right().getValue().getInteger("rows", 0) == 0) {
                    handler.handle(new Either.Left<>("not.found"));
                } else {
                    handler.handle(new Either.Right<>(new JsonObject().put("id", newId)));
                }
            }));
        });
    }

    @Override
    public void remove(final Long catalogSubjectId, final Handler<Either<String, JsonObject>> handler) {
        final JsonArray id = new JsonArray().add(catalogSubjectId);
        final String guard = " WHERE subject_id = (SELECT s.id FROM " + S + "subject AS s WHERE s.id = ? AND s.is_library_subject = true)";
        final SqlStatementsBuilder s = new SqlStatementsBuilder();
        s.prepared("DELETE FROM " + S + "subject_library_tag" + guard, id);
        s.prepared("DELETE FROM " + S + "subject_library_main_information" + guard, id);
        s.prepared("DELETE FROM " + S + "subject_document" + guard, id);
        s.prepared("DELETE FROM " + S + "grain" + guard, id);
        s.prepared("DELETE FROM " + S + "subject WHERE id = ? AND is_library_subject = true", id);
        sql.transaction(s.build(), SqlResult.validRowsResultHandler(4, handler));
    }

    /** Copie des corrigés, des sections, des grains et du classement d'un sujet sur un autre. */
    private static void copyContent(final SqlStatementsBuilder s, final Long newId, final Long fromId) {
        s.prepared("INSERT INTO " + S + "subject_document (subject_id, doc_id, doc_type, metadata) " +
                        "SELECT ?, d.doc_id, d.doc_type, d.metadata FROM " + S + "subject_document AS d WHERE d.subject_id = ?",
                new JsonArray().add(newId).add(fromId));
        SectionSql.copySectionsAndGrains(s, newId, fromId);
        CatalogSql.copyClassification(s, newId, fromId);
    }

    private void withNewSubjectId(final Handler<Either<String, JsonObject>> handler, final Handler<Long> next) {
        sql.raw("SELECT nextval('" + S + "subject_id_seq') AS id", SqlResult.validUniqueResultHandler(event -> {
            if (event.isLeft()) {
                handler.handle(new Either.Left<>(event.left().getValue()));
            } else {
                next.handle(event.right().getValue().getLong("id"));
            }
        }));
    }

    /** Les id de niveaux (dans l'ordre de la scolarité) et de matières d'un sujet {@code s}, en JSON. */
    private static String classificationColumns() {
        return "COALESCE((SELECT json_agg(sl.level_id ORDER BY l.rank NULLS LAST, l.id) FROM " + S + "subject_level AS sl " +
                "JOIN " + S + "subject_lesson_level AS l ON l.id = sl.level_id WHERE sl.subject_id = s.id), '[]'::json) AS level_ids, " +
                "COALESCE((SELECT json_agg(sd.discipline_id ORDER BY sd.discipline_id) FROM " + S + "subject_discipline AS sd " +
                "WHERE sd.subject_id = s.id), '[]'::json) AS discipline_ids";
    }

    private static String escapeLike(final String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
