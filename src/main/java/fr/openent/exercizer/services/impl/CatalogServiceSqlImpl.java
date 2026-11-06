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
    private static final int SUGGESTIONS = 8;
    /** Énoncés du programme proposés en tête des résultats d'une recherche. */
    private static final int OBJECTIVES = 8;
    /** Colonnes JSON du classement d'un sujet, à décoder dans la réponse. */
    private static final String[] JSON_COLUMNS = {"level_ids", "discipline_ids", "alignments"};
    /** Les mêmes, et les rattachements proposés qu'un modérateur n'a pas encore validés. */
    private static final String[] DETAIL_JSON_COLUMNS = {"level_ids", "discipline_ids", "alignments", "pending_alignments"};

    private volatile boolean programmesAvailable = false;

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
        withProgrammes(programmes -> {
            final JsonArray values = new JsonArray();
            final StringBuilder where = new StringBuilder(" WHERE ").append(visibleFilter(criteria, values, programmes));
            final String programme = criteria.getString("programme");
            final String node = criteria.getString("node");
            if (programmes && programme != null && node != null) {
                where.append(ProgrammeSql.nodeFilter(programme, node, criteria.getBoolean("direct", false), values));
            }

            final int limit = Math.max(1, Math.min(MAX_LIMIT, criteria.getInteger("limit", 24)));
            final int offset = Math.max(0, criteria.getInteger("offset", 0));
            values.add(limit).add(offset);

            final String query = "SELECT s.id, s.title, s.description, s.picture, s.max_score, s.type, s.owner, s.owner_username, " +
                    "s.authors_contributors, s.created, s.modified, " +
                    "(SELECT count(*) FROM " + S + "grain AS g WHERE g.subject_id = s.id AND g.grain_type_id > 3) AS question_count, " +
                    classificationColumns(programmes) + ", " + CatalogSql.usageColumns() + ", count(*) OVER () AS total " +
                    "FROM " + S + "subject AS s" + where +
                    " ORDER BY " + order(criteria.getString("sort")) + "lower(s.title), s.id " +
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
            }, JSON_COLUMNS));
        });
    }

    @Override
    public void facets(final JsonObject criteria, final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> {
            final JsonArray values = new JsonArray();
            // Un sujet vaut souvent pour plusieurs niveaux et matières : chaque regroupement est compté à
            // part (sujets DISTINCTS), la somme des comptes d'un niveau compterait deux fois ces sujets.
            // GROUPING() distingue un regroupement d'un niveau sans groupe (level_group null).
            final String query = "SELECT CASE GROUPING(l.level_group, sl.level_id, sd.discipline_id) " +
                    "WHEN 3 THEN 'group' WHEN 5 THEN 'level' WHEN 4 THEN 'level_discipline' ELSE 'discipline' END AS kind, " +
                    "l.level_group, sl.level_id, sd.discipline_id, count(DISTINCT s.id) AS count " +
                    "FROM " + S + "subject AS s JOIN " + S + "subject_level AS sl ON sl.subject_id = s.id " +
                    "JOIN " + S + "subject_lesson_level AS l ON l.id = sl.level_id " +
                    "JOIN " + S + "subject_discipline AS sd ON sd.subject_id = s.id " +
                    "WHERE " + visibleFilter(criteria, values, programmes) +
                    " GROUP BY GROUPING SETS ((l.level_group), (sl.level_id), (sl.level_id, sd.discipline_id), (sd.discipline_id))";
            sql.prepared(query, values, SqlResult.validResultHandler(event -> {
                if (event.isLeft()) {
                    handler.handle(new Either.Left<>(event.left().getValue()));
                } else {
                    handler.handle(new Either.Right<>(new JsonObject().put("facets", event.right().getValue())));
                }
            }));
        });
    }

    @Override
    public void objectives(final String q, final String programme, final JsonObject criteria,
                           final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> {
            if (!programmes || q == null || q.trim().isEmpty()) {
                handler.handle(new Either.Right<>(new JsonObject().put("objectives", new JsonArray())));
                return;
            }
            // Le compte d'un énoncé = tous ses exercices visibles, pas seulement ceux qui répondent au texte.
            final JsonArray values = new JsonArray();
            final String visible = visibleSubjects(criteria.copy().put("q", (String) null), values, true);
            final String query = ProgrammeSql.objectives(visible, q.trim(), programme,
                    criteria.getJsonArray("levels", new JsonArray()), OBJECTIVES, values);
            sql.prepared(query, values, SqlResult.validResultHandler(event -> {
                if (event.isLeft()) {
                    handler.handle(new Either.Left<>(event.left().getValue()));
                } else {
                    handler.handle(new Either.Right<>(new JsonObject().put("objectives", event.right().getValue())));
                }
            }, "levels"));
        });
    }

    @Override
    public void programmes(final JsonObject criteria, final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> {
            if (!programmes) {
                handler.handle(new Either.Right<>(new JsonObject().put("programmes", new JsonArray())));
                return;
            }
            final JsonArray values = new JsonArray();
            sql.prepared(ProgrammeSql.programmes(visibleSubjects(criteria, values, programmes)), values,
                    SqlResult.validResultHandler(event -> {
                        if (event.isLeft()) {
                            handler.handle(new Either.Left<>(event.left().getValue()));
                        } else {
                            handler.handle(new Either.Right<>(new JsonObject().put("programmes", event.right().getValue())));
                        }
                    }, "levels"));
        });
    }

    @Override
    public void programmeTree(final String programme, final boolean full, final JsonObject criteria,
                              final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> {
            if (!programmes) {
                handler.handle(new Either.Left<>("not.found"));
                return;
            }
            final JsonArray values = new JsonArray();
            final String visible = visibleSubjects(criteria, values, programmes);
            final JsonArray unalignedValues = values.copy().add(programme);
            values.add(programme).add(programme).add(programme);
            sql.prepared(ProgrammeSql.tree(visible, full), values, SqlResult.validResultHandler(nodes -> {
                if (nodes.isLeft()) {
                    handler.handle(new Either.Left<>(nodes.left().getValue()));
                    return;
                }
                if (nodes.right().getValue().isEmpty() && full) {
                    // Un référentiel publié a toujours des énoncés : il est inconnu ou non publié.
                    handler.handle(new Either.Left<>("not.found"));
                    return;
                }
                sql.prepared(ProgrammeSql.unalignedCount(visible), unalignedValues, SqlResult.validUniqueResultHandler(unaligned -> {
                    if (unaligned.isLeft()) {
                        handler.handle(new Either.Left<>(unaligned.left().getValue()));
                        return;
                    }
                    handler.handle(new Either.Right<>(new JsonObject()
                            .put("nodes", nodes.right().getValue())
                            .put("unaligned", unaligned.right().getValue().getLong("count", 0L))));
                }));
            }, "levels"));
        });
    }

    @Override
    public void suggestions(final String programme, final JsonArray levelIds, final JsonArray disciplineIds,
                            final String text, final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> {
            if (!programmes) {
                handler.handle(new Either.Right<>(new JsonObject().put("suggestions", new JsonArray())));
                return;
            }
            // Les niveaux et les matières sont des id d'exercizer : on les traduit d'abord en codes.
            final JsonArray codeValues = new JsonArray();
            final String codes = "SELECT 'level' AS kind, code FROM " + S + "subject_lesson_level WHERE code IS NOT NULL AND id IN " +
                    inList(levelIds, codeValues) +
                    " UNION ALL SELECT 'discipline', code FROM " + S + "subject_lesson_type WHERE code IS NOT NULL AND id IN " +
                    inList(disciplineIds, codeValues);
            sql.prepared(codes, codeValues, SqlResult.validResultHandler(found -> {
                if (found.isLeft()) {
                    handler.handle(new Either.Left<>(found.left().getValue()));
                    return;
                }
                final java.util.List<String> levels = new java.util.ArrayList<>();
                final java.util.List<String> disciplines = new java.util.ArrayList<>();
                found.right().getValue().forEach(row -> {
                    final JsonObject r = (JsonObject) row;
                    ("level".equals(r.getString("kind")) ? levels : disciplines).add(r.getString("code"));
                });
                final JsonArray values = new JsonArray();
                final String query = ProgrammeSql.suggestions(programme, levels, ProgrammeSql.teachingsOf(disciplines),
                        text, SUGGESTIONS, values);
                sql.prepared(query, values, SqlResult.validResultHandler(event -> {
                    if (event.isLeft()) {
                        handler.handle(new Either.Left<>(event.left().getValue()));
                    } else {
                        handler.handle(new Either.Right<>(new JsonObject().put("suggestions", event.right().getValue())));
                    }
                }));
            }));
        });
    }

    /**
     * Les sujets du catalogue que l'usager voit, sous les critères {@code q}, {@code levels},
     * {@code disciplines} et {@code structures} (cf. {@link ICatalogService#list}) : une condition sur
     * {@code s}. Ajoute ses paramètres à {@code values}.
     */
    private static String visibleFilter(final JsonObject criteria, final JsonArray values, final boolean programmes) {
        final StringBuilder where = new StringBuilder(CATALOG_GUARD);
        where.append(CatalogSql.packAccessGuard(criteria.getJsonArray("structures", new JsonArray()).getList(), values));

        final String q = criteria.getString("q");
        if (q != null && !q.trim().isEmpty()) {
            final String pattern = "%" + ProgrammeSql.escapeLike(q.trim()) + "%";
            where.append(" AND (s.title ILIKE ? OR s.description ILIKE ?");
            values.add(pattern).add(pattern);
            // Chercher par objectif : un sujet rattaché à un énoncé du programme qui répond à la recherche.
            if (programmes) {
                where.append(" OR s.id IN (").append(ProgrammeSql.alignedToMatching(q.trim(), values)).append(")");
            }
            where.append(")");
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
        return where.toString();
    }

    /**
     * Le début du tri d'une page du catalogue : les plus copiés ({@code usage}), les mieux notés
     * ({@code rating}), sinon dans l'ordre de la scolarité. Le titre départage toujours.
     */
    private static String order(final String sort) {
        if ("usage".equals(sort)) return "copy_count DESC, structure_count DESC, ";
        if ("rating".equals(sort)) return "rating_avg DESC NULLS LAST, rating_count DESC, ";
        return "(SELECT min(l.rank) FROM " + S + "subject_level AS ol JOIN " + S + "subject_lesson_level AS l " +
                "ON l.id = ol.level_id WHERE ol.subject_id = s.id) NULLS LAST, ";
    }

    /** Les id des sujets visibles (cf. {@link #visibleFilter}), en sous-requête. */
    private static String visibleSubjects(final JsonObject criteria, final JsonArray values, final boolean programmes) {
        return "SELECT s.id FROM " + S + "subject AS s WHERE " + visibleFilter(criteria, values, programmes);
    }

    /** « (?,?) » pour ces id, ou « (NULL) » — aucun — si la liste est vide. */
    private static String inList(final JsonArray ids, final JsonArray values) {
        if (ids.isEmpty()) return "(NULL)";
        ids.forEach(values::add);
        return Sql.listPrepared(ids.getList());
    }

    /**
     * Le schéma du module case est-il présent ? Une réponse positive est retenue ; une négative est
     * revérifiée à chaque appel, le module pouvant être installé plus tard sans redémarrer exercizer.
     */
    private void withProgrammes(final Handler<Boolean> next) {
        if (programmesAvailable) {
            next.handle(true);
            return;
        }
        sql.raw(ProgrammeSql.AVAILABLE, SqlResult.validUniqueResultHandler(event -> {
            programmesAvailable = event.isRight() && event.right().getValue().getBoolean("available", false);
            next.handle(programmesAvailable);
        }));
    }

    @Override
    public void get(final Long catalogSubjectId, final Handler<Either<String, JsonObject>> handler) {
        get(catalogSubjectId, null, handler);
    }

    @Override
    public void get(final Long catalogSubjectId, final java.util.List<String> structures,
                    final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> {
            final JsonArray values = new JsonArray().add(catalogSubjectId);
            final String subjectQuery = "SELECT s.*, " + classificationColumns(programmes) + ", " +
                    (programmes ? ProgrammeSql.pendingAlignmentsColumn() : "'[]'::json AS pending_alignments") + ", " +
                    CatalogSql.usageColumns() + " FROM " + S + "subject AS s " +
                    "WHERE s.id = ? AND " + CATALOG_GUARD
                    + (structures == null ? "" : CatalogSql.packAccessGuard(structures, values));
            sql.prepared(subjectQuery, values, SqlResult.validUniqueResultHandler(subject -> {
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
            }, DETAIL_JSON_COLUMNS));
        });
    }

    @Override
    public void classification(final Long subjectId, final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> sql.prepared("SELECT " + classificationColumns(programmes) + " FROM " + S +
                        "subject AS s WHERE s.id = ?",
                new JsonArray().add(subjectId), SqlResult.validUniqueResultHandler(handler, JSON_COLUMNS)));
    }

    @Override
    public void setClassification(final Long subjectId, final JsonArray levelIds, final JsonArray disciplineIds,
                                  final JsonArray alignmentIds, final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> {
            final SqlStatementsBuilder s = new SqlStatementsBuilder();
            CatalogSql.replaceClassification(s, subjectId, levelIds, disciplineIds);
            // Sans le champ (ancienne interface), les rattachements restent tels quels.
            if (programmes && alignmentIds != null) {
                ProgrammeSql.replaceAlignments(s, subjectId, alignmentIds);
            }
            s.prepared("UPDATE " + S + "subject SET modified = NOW() WHERE id = ?", new JsonArray().add(subjectId));
            sql.transaction(s.build(), SqlResult.validRowsResultHandler(handler));
        });
    }

    @Override
    public void copy(final Long catalogSubjectId, final Long folderId, final UserInfos user,
                     final Handler<Either<String, JsonObject>> handler) {
        withNewSubjectId(handler, newId -> {
            final SqlStatementsBuilder s = new SqlStatementsBuilder();
            s.prepared("SELECT " + S + "merge_users(?,?)", new JsonArray().add(user.getUserId()).add(user.getUsername()));
            final JsonArray copyValues = new JsonArray().add(newId).add(folderId).add(user.getUserId())
                    .add(user.getUserId()).add(user.getUsername()).add(catalogSubjectId);
            // Le dossier n'est retenu que s'il appartient à l'usager ; sinon le sujet arrive à la racine.
            s.prepared("INSERT INTO " + S + "subject (id, folder_id, owner, owner_username, title, description, picture, " +
                            "max_score, is_library_subject, is_deleted, authors_contributors, type, large_display) " +
                            "SELECT ?, (SELECT f.id FROM " + S + "folder AS f WHERE f.id = ? AND f.owner = ?), ?, ?, " +
                            "s.title, s.description, s.picture, s.max_score, false, false, s.authors_contributors, s.type, s.large_display " +
                            "FROM " + S + "subject AS s WHERE s.id = ? AND " + CATALOG_GUARD
                            + CatalogSql.packAccessGuard(user.getStructures(), copyValues),
                    copyValues);
            copyContent(s, newId, catalogSubjectId);
            CatalogSql.recordCopy(s, catalogSubjectId, newId, user.getUserId(), user.getStructures());
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
    public void publish(final Long subjectId, final JsonArray levelIds, final JsonArray disciplineIds,
                        final JsonArray alignmentIds, final String authors, final UserInfos user,
                        final boolean moderator, final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> withNewSubjectId(handler, newId -> {
            final SqlStatementsBuilder s = new SqlStatementsBuilder();
            s.prepared("SELECT " + S + "merge_users(?,?)", new JsonArray().add(user.getUserId()).add(user.getUsername()));
            s.prepared("INSERT INTO " + S + "subject (id, folder_id, owner, owner_username, title, description, picture, " +
                            "max_score, is_library_subject, is_deleted, authors_contributors, type, large_display) " +
                            "SELECT ?, NULL, ?, ?, s.title, s.description, s.picture, s.max_score, true, false, ?, s.type, s.large_display " +
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
            // Les rattachements choisis à la publication, sinon ceux du sujet d'origine ; ceux d'un
            // enseignant attendent la validation d'un modérateur avant de ranger l'exercice.
            if (moderator) {
                if (programmes && alignmentIds != null) {
                    ProgrammeSql.replaceAlignments(s, newId, alignmentIds);
                } else {
                    CatalogSql.copyAlignments(s, newId, subjectId);
                }
            } else if (programmes && alignmentIds != null) {
                ProgrammeSql.proposeAlignments(s, newId, alignmentIds, user.getUserId(), user.getUsername());
            } else {
                ProgrammeSql.proposeAlignmentsOf(s, newId, subjectId, user.getUserId(), user.getUsername());
            }
            sql.transaction(s.build(), SqlResult.validRowsResultHandler(1, inserted -> {
                if (inserted.isLeft()) {
                    handler.handle(new Either.Left<>(inserted.left().getValue()));
                } else if (inserted.right().getValue().getInteger("rows", 0) == 0) {
                    handler.handle(new Either.Left<>("not.found"));
                } else {
                    handler.handle(new Either.Right<>(new JsonObject().put("id", newId)));
                }
            }));
        }));
    }

    @Override
    public void reclassify(final Long catalogSubjectId, final JsonArray levelIds, final JsonArray disciplineIds,
                           final JsonArray alignmentIds, final UserInfos user, final boolean moderator,
                           final Handler<Either<String, JsonObject>> handler) {
        if (moderator) {
            // Le rattachement retenu par le modérateur vaut validation : il ne reste rien à proposer.
            setClassification(catalogSubjectId, levelIds, disciplineIds, alignmentIds, event -> {
                if (event.isLeft() || alignmentIds == null) {
                    handler.handle(event);
                    return;
                }
                sql.prepared("DELETE FROM " + S + "subject_alignment_proposal WHERE subject_id = ?",
                        new JsonArray().add(catalogSubjectId), SqlResult.validRowsResultHandler(cleared ->
                                handler.handle(cleared.isLeft() ? cleared : event)));
            });
            return;
        }
        withProgrammes(programmes -> {
            final SqlStatementsBuilder s = new SqlStatementsBuilder();
            CatalogSql.replaceClassification(s, catalogSubjectId, levelIds, disciplineIds);
            if (programmes && alignmentIds != null) {
                ProgrammeSql.proposeAlignments(s, catalogSubjectId, alignmentIds, user.getUserId(), user.getUsername());
            }
            s.prepared("UPDATE " + S + "subject SET modified = NOW() WHERE id = ?", new JsonArray().add(catalogSubjectId));
            sql.transaction(s.build(), SqlResult.validRowsResultHandler(handler));
        });
    }

    @Override
    public void usage(final Long catalogSubjectId, final UserInfos user, final Handler<Either<String, JsonObject>> handler) {
        final String structures = user.getStructures() == null ? "" : String.join(",", user.getStructures());
        final String query = "SELECT " + CatalogSql.usageColumns() + ", " +
                "(SELECT count(*) FROM " + S + "subject_catalog_copy AS c WHERE c.catalog_subject_id = s.id " +
                "AND c.structure_ids && string_to_array(?, ',')::varchar[]) AS my_structures, " +
                "(s.owner <> ? AND EXISTS (SELECT 1 FROM " + S + "subject_catalog_copy AS c " +
                "WHERE c.catalog_subject_id = s.id AND c.user_id = ?)) AS can_review " +
                "FROM " + S + "subject AS s WHERE s.id = ? AND " + CATALOG_GUARD;
        final JsonArray values = new JsonArray().add(structures).add(user.getUserId()).add(user.getUserId())
                .add(catalogSubjectId);
        sql.prepared(query, values, SqlResult.validUniqueResultHandler(stats -> {
            if (stats.isLeft()) {
                handler.handle(new Either.Left<>(stats.left().getValue()));
                return;
            }
            if (stats.right().getValue().isEmpty()) {
                handler.handle(new Either.Left<>("not.found"));
                return;
            }
            sql.prepared("SELECT user_id, username, rating, comment, modified FROM " + S + "subject_catalog_review " +
                            "WHERE catalog_subject_id = ? ORDER BY modified DESC",
                    new JsonArray().add(catalogSubjectId), SqlResult.validResultHandler(reviews -> {
                        if (reviews.isLeft()) {
                            handler.handle(new Either.Left<>(reviews.left().getValue()));
                            return;
                        }
                        final JsonObject usage = stats.right().getValue();
                        handler.handle(new Either.Right<>(new JsonObject()
                                .put("copies", usage.getLong("copy_count", 0L))
                                .put("structures", usage.getLong("structure_count", 0L))
                                .put("my_structures", usage.getLong("my_structures", 0L))
                                .put("rating_avg", usage.getValue("rating_avg"))
                                .put("rating_count", usage.getLong("rating_count", 0L))
                                .put("can_review", usage.getBoolean("can_review", false))
                                .put("reviews", reviews.right().getValue())));
                    }));
        }));
    }

    @Override
    public void review(final Long catalogSubjectId, final UserInfos user, final int rating, final String comment,
                       final Handler<Either<String, JsonObject>> handler) {
        final String query = "INSERT INTO " + S + "subject_catalog_review (catalog_subject_id, user_id, username, rating, comment) " +
                "SELECT s.id, ?, ?, ?, ? FROM " + S + "subject AS s WHERE s.id = ? AND " + CATALOG_GUARD +
                " AND s.owner <> ? AND EXISTS (SELECT 1 FROM " + S + "subject_catalog_copy AS c " +
                "WHERE c.catalog_subject_id = s.id AND c.user_id = ?) " +
                "ON CONFLICT (catalog_subject_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, " +
                "comment = EXCLUDED.comment, username = EXCLUDED.username, modified = NOW()";
        final JsonArray values = new JsonArray().add(user.getUserId()).add(user.getUsername()).add(rating)
                .add(comment).add(catalogSubjectId).add(user.getUserId()).add(user.getUserId());
        sql.prepared(query, values, SqlResult.validRowsResultHandler(event -> {
            if (event.isRight() && event.right().getValue().getInteger("rows", 0) == 0) {
                handler.handle(new Either.Left<>("forbidden"));
            } else {
                handler.handle(event);
            }
        }));
    }

    @Override
    public void removeReview(final Long catalogSubjectId, final String userId,
                             final Handler<Either<String, JsonObject>> handler) {
        sql.prepared("DELETE FROM " + S + "subject_catalog_review WHERE catalog_subject_id = ? AND user_id = ?",
                new JsonArray().add(catalogSubjectId).add(userId), SqlResult.validRowsResultHandler(handler));
    }

    @Override
    public void moderation(final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> {
            if (!programmes) {
                handler.handle(new Either.Right<>(new JsonObject().put("proposals", new JsonArray())));
                return;
            }
            sql.raw(ProgrammeSql.proposals(), SqlResult.validResultHandler(event -> {
                if (event.isLeft()) {
                    handler.handle(new Either.Left<>(event.left().getValue()));
                } else {
                    handler.handle(new Either.Right<>(new JsonObject().put("proposals", event.right().getValue())));
                }
            }));
        });
    }

    @Override
    public void suggestAlignments(final Handler<Either<String, JsonObject>> handler) {
        withProgrammes(programmes -> {
            if (!programmes) {
                handler.handle(new Either.Right<>(new JsonObject().put("proposals", 0).put("subjects", 0)));
                return;
            }
            final JsonArray values = new JsonArray();
            sql.prepared(ProgrammeSql.suggestUnaligned(values), values, SqlResult.validResultHandler(event -> {
                if (event.isLeft()) {
                    handler.handle(new Either.Left<>(event.left().getValue()));
                    return;
                }
                final JsonArray rows = event.right().getValue();
                final java.util.Set<Object> subjects = new java.util.HashSet<>();
                rows.forEach(row -> subjects.add(((JsonObject) row).getValue("subject_id")));
                handler.handle(new Either.Right<>(new JsonObject().put("proposals", rows.size()).put("subjects", subjects.size())));
            }));
        });
    }

    @Override
    public void decide(final JsonArray decisions, final Handler<Either<String, JsonObject>> handler) {
        final SqlStatementsBuilder s = new SqlStatementsBuilder();
        for (Object value : decisions) {
            final JsonObject decision = (JsonObject) value;
            ProgrammeSql.decide(s, decision.getLong("subject_id"), decision.getString("cfitem_id"),
                    decision.getBoolean("accept", false));
        }
        sql.transaction(s.build(), SqlResult.validRowsResultHandler(handler));
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
        CatalogSql.copyAlignments(s, newId, fromId);
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

    /**
     * Les id de niveaux (dans l'ordre de la scolarité) et de matières d'un sujet {@code s}, et ses
     * rattachements aux programmes ({@code programmes} : le schéma du module case est présent), en JSON.
     */
    private static String classificationColumns(final boolean programmes) {
        return (programmes ? ProgrammeSql.alignmentsColumn() : "'[]'::json AS alignments") + ", " +
                "COALESCE((SELECT json_agg(sl.level_id ORDER BY l.rank NULLS LAST, l.id) FROM " + S + "subject_level AS sl " +
                "JOIN " + S + "subject_lesson_level AS l ON l.id = sl.level_id WHERE sl.subject_id = s.id), '[]'::json) AS level_ids, " +
                "COALESCE((SELECT json_agg(sd.discipline_id ORDER BY sd.discipline_id) FROM " + S + "subject_discipline AS sd " +
                "WHERE sd.subject_id = s.id), '[]'::json) AS discipline_ids";
    }
}
