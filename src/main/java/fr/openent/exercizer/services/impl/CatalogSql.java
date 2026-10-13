package fr.openent.exercizer.services.impl;

import io.vertx.core.json.JsonArray;
import org.entcore.common.sql.SqlStatementsBuilder;

/**
 * Requêtes partagées autour du classement d'un sujet par niveau et matière (cf. sql/041-subject-catalog.sql).
 *
 * Le classement suit le sujet partout où il est recopié : duplication, publication au catalogue,
 * copie depuis le catalogue.
 */
final class CatalogSql {

    private static final String SCHEMA = "exercizer.";

    private CatalogSql() {}

    /** Recopie les niveaux et les matières d'un sujet sur un autre. */
    static void copyClassification(final SqlStatementsBuilder s, final Number newSubjectId, final Number fromSubjectId) {
        s.prepared("INSERT INTO " + SCHEMA + "subject_level (subject_id, level_id) " +
                        "SELECT ?, level_id FROM " + SCHEMA + "subject_level WHERE subject_id = ?",
                new JsonArray().add(newSubjectId).add(fromSubjectId));
        s.prepared("INSERT INTO " + SCHEMA + "subject_discipline (subject_id, discipline_id) " +
                        "SELECT ?, discipline_id FROM " + SCHEMA + "subject_discipline WHERE subject_id = ?",
                new JsonArray().add(newSubjectId).add(fromSubjectId));
    }

    /**
     * Remplace le classement d'un sujet. Un id inconnu du référentiel est ignoré (INSERT…SELECT sur le
     * référentiel) plutôt que de faire échouer toute la transaction sur une clé étrangère.
     */
    static void replaceClassification(final SqlStatementsBuilder s, final Number subjectId,
                                      final JsonArray levelIds, final JsonArray disciplineIds) {
        s.prepared("DELETE FROM " + SCHEMA + "subject_level WHERE subject_id = ?", new JsonArray().add(subjectId));
        s.prepared("DELETE FROM " + SCHEMA + "subject_discipline WHERE subject_id = ?", new JsonArray().add(subjectId));
        for (Object levelId : levelIds) {
            s.prepared("INSERT INTO " + SCHEMA + "subject_level (subject_id, level_id) " +
                            "SELECT ?, id FROM " + SCHEMA + "subject_lesson_level WHERE id = ? ON CONFLICT DO NOTHING",
                    new JsonArray().add(subjectId).add(levelId));
        }
        for (Object disciplineId : disciplineIds) {
            s.prepared("INSERT INTO " + SCHEMA + "subject_discipline (subject_id, discipline_id) " +
                            "SELECT ?, id FROM " + SCHEMA + "subject_lesson_type WHERE id = ? ON CONFLICT DO NOTHING",
                    new JsonArray().add(subjectId).add(disciplineId));
        }
    }
}
