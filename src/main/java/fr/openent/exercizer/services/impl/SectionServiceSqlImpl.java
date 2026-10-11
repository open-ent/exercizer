package fr.openent.exercizer.services.impl;

import fr.openent.exercizer.services.ISectionService;
import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.sql.SqlStatementsBuilder;

/**
 * Sections d'un sujet. Chaque écriture qui touche à la structure se termine par la renumérotation
 * globale des grains ({@link SectionSql#normalizeGrainOrder}) : c'est elle qui tient l'invariant.
 *
 * Toutes les requêtes portent la garde {@code subject_id = ?} : le filtre de droits vérifie le
 * SUJET de la route, il faut donc qu'une section ou un grain d'un autre sujet passé dans le corps
 * soit sans effet.
 */
public class SectionServiceSqlImpl extends AbstractExercizerServiceSqlImpl implements ISectionService {

    private static final String SECTION = "exercizer.subject_section";
    private static final String GRAIN = "exercizer.grain";

    public SectionServiceSqlImpl() {
        super("exercizer", "subject_section");
    }

    @Override
    public void list(final Long subjectId, final Handler<Either<String, JsonArray>> handler) {
        sql.prepared("SELECT * FROM " + SECTION + " WHERE subject_id = ? ORDER BY order_by, id",
                new JsonArray().add(subjectId), SqlResult.validResultHandler(handler));
    }

    @Override
    public void create(final Long subjectId, final JsonObject section, final Handler<Either<String, JsonObject>> handler) {
        // Toujours en fin de sujet : une section s'insère ailleurs en réécrivant ensuite la structure.
        sql.prepared("INSERT INTO " + SECTION + " (subject_id, title, description, order_by) VALUES (?, ?, ?, " +
                        "(SELECT COALESCE(max(order_by), 0) + 1 FROM " + SECTION + " WHERE subject_id = ?)) RETURNING *",
                new JsonArray().add(subjectId).add(section.getString("title", "")).add(section.getString("description"))
                        .add(subjectId),
                SqlResult.validUniqueResultHandler(handler));
    }

    @Override
    public void update(final Long subjectId, final Long sectionId, final JsonObject section, final Handler<Either<String, JsonObject>> handler) {
        sql.prepared("UPDATE " + SECTION + " SET title = ?, description = ?, modified = NOW() " +
                        "WHERE id = ? AND subject_id = ? RETURNING *",
                new JsonArray().add(section.getString("title", "")).add(section.getString("description"))
                        .add(sectionId).add(subjectId),
                SqlResult.validUniqueResultHandler(handler));
    }

    @Override
    public void remove(final Long subjectId, final Long sectionId, final boolean withGrains, final Handler<Either<String, JsonObject>> handler) {
        final SqlStatementsBuilder s = new SqlStatementsBuilder();
        if (withGrains) {
            s.prepared("DELETE FROM " + GRAIN + " WHERE section_id = ? AND subject_id = ?",
                    new JsonArray().add(sectionId).add(subjectId));
        } else {
            s.prepared("UPDATE " + GRAIN + " SET section_id = (SELECT p.id FROM " + SECTION + " AS p WHERE p.subject_id = ? " +
                            "AND p.order_by < (SELECT order_by FROM " + SECTION + " WHERE id = ? AND subject_id = ?) " +
                            "ORDER BY p.order_by DESC LIMIT 1), modified = NOW() WHERE section_id = ? AND subject_id = ?",
                    new JsonArray().add(subjectId).add(sectionId).add(subjectId).add(sectionId).add(subjectId));
        }
        s.prepared("DELETE FROM " + SECTION + " WHERE id = ? AND subject_id = ?", new JsonArray().add(sectionId).add(subjectId));
        SectionSql.normalizeSectionOrder(s, subjectId);
        SectionSql.normalizeGrainOrder(s, subjectId);
        SectionSql.updateMaxScoreAndDate(s, subjectId);
        sql.transaction(s.build(), SqlResult.validRowsResultHandler(1, handler));
    }

    @Override
    public void duplicate(final Long subjectId, final Long sectionId, final String titleSuffix, final Handler<Either<String, JsonObject>> handler) {
        final String sourceOrder = "(SELECT order_by FROM " + SECTION + " WHERE id = ? AND subject_id = ?)";
        final SqlStatementsBuilder s = new SqlStatementsBuilder();
        // 0 — On fait de la place juste après la section copiée.
        s.prepared("UPDATE " + SECTION + " SET order_by = order_by + 1 WHERE subject_id = ? AND order_by > " + sourceOrder,
                new JsonArray().add(subjectId).add(sectionId).add(subjectId));
        // 1 — La copie de la section (c'est elle que renvoie la route).
        s.prepared("INSERT INTO " + SECTION + " (subject_id, title, description, order_by) " +
                        "SELECT subject_id, title || ?, description, order_by + 1 FROM " + SECTION + " WHERE id = ? AND subject_id = ? RETURNING *",
                new JsonArray().add(titleSuffix).add(sectionId).add(subjectId));
        // 2 — Ses grains, rattachés à la copie retrouvée par son rang.
        s.prepared("INSERT INTO " + GRAIN + " (subject_id, grain_type_id, order_by, grain_data, section_id) " +
                        "SELECT g.subject_id, g.grain_type_id, g.order_by, g.grain_data, " +
                        "(SELECT id FROM " + SECTION + " WHERE subject_id = ? AND order_by = " + sourceOrder + " + 1) " +
                        "FROM " + GRAIN + " AS g WHERE g.section_id = ? AND g.subject_id = ?",
                new JsonArray().add(subjectId).add(sectionId).add(subjectId).add(sectionId).add(subjectId));
        SectionSql.normalizeGrainOrder(s, subjectId);
        SectionSql.updateMaxScoreAndDate(s, subjectId);
        sql.transaction(s.build(), SqlResult.validUniqueResultHandler(1, handler));
    }

    @Override
    public void saveStructure(final Long subjectId, final JsonArray ungrouped, final JsonArray sections, final Handler<Either<String, JsonObject>> handler) {
        final SqlStatementsBuilder s = new SqlStatementsBuilder();
        final String grainUpdate = "UPDATE " + GRAIN + " SET section_id = ?, order_by = ?, modified = NOW() WHERE id = ? AND subject_id = ?";
        // Un id de section étranger au sujet donnerait NULL, jamais la section d'un autre sujet.
        final String grainUpdateInSection = "UPDATE " + GRAIN + " SET section_id = (SELECT id FROM " + SECTION +
                " WHERE id = ? AND subject_id = ?), order_by = ?, modified = NOW() WHERE id = ? AND subject_id = ?";

        int rank = 0;
        for (int i = 0; i < ungrouped.size(); i++) {
            s.prepared(grainUpdate, new JsonArray().addNull().add(++rank).add(ungrouped.getLong(i)).add(subjectId));
        }
        for (int i = 0; i < sections.size(); i++) {
            final JsonObject section = sections.getJsonObject(i);
            final Long sectionId = section.getLong("id");
            s.prepared("UPDATE " + SECTION + " SET order_by = ? WHERE id = ? AND subject_id = ?",
                    new JsonArray().add(i + 1).add(sectionId).add(subjectId));
            final JsonArray grainIds = section.getJsonArray("grainIds", new JsonArray());
            for (int j = 0; j < grainIds.size(); j++) {
                s.prepared(grainUpdateInSection,
                        new JsonArray().add(sectionId).add(subjectId).add(++rank).add(grainIds.getLong(j)).add(subjectId));
            }
        }
        // Ce que le corps aurait omis (grain créé entre-temps, section d'un autre onglet) garde sa place
        // relative ; les deux renumérotations rétablissent la continuité.
        SectionSql.normalizeSectionOrder(s, subjectId);
        SectionSql.normalizeGrainOrder(s, subjectId);
        s.prepared("UPDATE exercizer.subject SET modified = NOW() WHERE id = ?", new JsonArray().add(subjectId));
        sql.transaction(s.build(), SqlResult.validRowsResultHandler(handler));
    }

    @Override
    public void listForSubjectCopy(final Long subjectCopyId, final Handler<Either<String, JsonArray>> handler) {
        sql.prepared("SELECT sss.id, sss.title, sss.description, sss.order_by, " +
                        "COALESCE(json_agg(gs.id ORDER BY gs.order_by) FILTER (WHERE gs.id IS NOT NULL), '[]') AS grain_scheduled_ids " +
                        "FROM exercizer.subject_copy AS sc " +
                        "INNER JOIN exercizer.subject_section_scheduled AS sss ON sss.subject_scheduled_id = sc.subject_scheduled_id " +
                        "LEFT JOIN exercizer.grain_scheduled AS gs ON gs.section_scheduled_id = sss.id " +
                        "WHERE sc.id = ? GROUP BY sss.id ORDER BY sss.order_by",
                new JsonArray().add(subjectCopyId), SqlResult.validResultHandler(handler, "grain_scheduled_ids"));
    }

}
