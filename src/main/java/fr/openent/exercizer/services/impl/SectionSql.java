package fr.openent.exercizer.services.impl;

import io.vertx.core.json.JsonArray;
import org.entcore.common.sql.SqlStatementsBuilder;

/**
 * Requêtes partagées autour des sections d'un sujet (cf. sql/039-add-subject-sections.sql).
 *
 * Invariant : grain.order_by est un ordre GLOBAL et continu sur le sujet — grains hors section
 * d'abord, puis section par section. L'IHM AngularJS, qui ignore les sections, voit ainsi toujours
 * une séquence cohérente.
 *
 * Les copies (duplication, bibliothèque, distribution) retrouvent la section d'un grain par
 * correspondance de RANG entre la section d'origine et sa copie : (subject_id, order_by) est unique,
 * ce qui permet un seul INSERT…SELECT, sans aller-retour Java pour récupérer les nouveaux id.
 */
final class SectionSql {

    private static final String SCHEMA = "exercizer.";

    private SectionSql() {}

    /**
     * Renumérote les grains d'un sujet de 1 à N dans l'ordre (section, rang). Sans effet sur un sujet
     * sans section : son ordre historique, éventuellement troué, est laissé tel quel.
     */
    static void normalizeGrainOrder(final SqlStatementsBuilder s, final Number subjectId) {
        s.prepared("UPDATE " + SCHEMA + "grain AS g SET order_by = n.rn FROM (" +
                        "SELECT g2.id, row_number() OVER (ORDER BY COALESCE(ss.order_by, 0), g2.order_by, g2.id) AS rn " +
                        "FROM " + SCHEMA + "grain AS g2 LEFT JOIN " + SCHEMA + "subject_section AS ss ON ss.id = g2.section_id " +
                        "WHERE g2.subject_id = ?) AS n " +
                        "WHERE g.id = n.id AND g.order_by IS DISTINCT FROM n.rn " +
                        "AND EXISTS (SELECT 1 FROM " + SCHEMA + "subject_section WHERE subject_id = ?)",
                new JsonArray().add(subjectId).add(subjectId));
    }

    /** Renumérote les sections d'un sujet de 1 à N, sans changer leur ordre relatif. */
    static void normalizeSectionOrder(final SqlStatementsBuilder s, final Number subjectId) {
        s.prepared("UPDATE " + SCHEMA + "subject_section AS ss SET order_by = n.rn FROM (" +
                        "SELECT id, row_number() OVER (ORDER BY order_by, id) AS rn FROM " + SCHEMA + "subject_section " +
                        "WHERE subject_id = ?) AS n WHERE ss.id = n.id AND ss.order_by <> n.rn",
                new JsonArray().add(subjectId));
    }

    /** Recalcule le barème du sujet, comme le fait chaque écriture de grain. */
    static void updateMaxScoreAndDate(final SqlStatementsBuilder s, final Number subjectId) {
        s.prepared("UPDATE " + SCHEMA + "subject SET max_score=(SELECT sum(cast(g.grain_data::json->>'max_score' as double precision)) FROM " +
                        SCHEMA + "grain as g WHERE g.subject_id=?), modified = NOW() WHERE id=?",
                new JsonArray().add(subjectId).add(subjectId));
    }

    /**
     * Copie les sections ET les grains d'un sujet dans un autre (duplication, copie de dossier,
     * publication en bibliothèque). Remplace l'ancien INSERT…SELECT des seuls grains.
     */
    static void copySectionsAndGrains(final SqlStatementsBuilder s, final Number newSubjectId, final Number fromSubjectId) {
        s.prepared("INSERT INTO " + SCHEMA + "subject_section (subject_id, title, description, order_by) " +
                        "SELECT ?, title, description, order_by FROM " + SCHEMA + "subject_section WHERE subject_id = ?",
                new JsonArray().add(newSubjectId).add(fromSubjectId));

        s.prepared("INSERT INTO " + SCHEMA + "grain (subject_id, grain_type_id, order_by, grain_data, section_id) " +
                        "SELECT ?, g.grain_type_id, g.order_by, g.grain_data, " +
                        "(SELECT ns.id FROM " + SCHEMA + "subject_section AS ns INNER JOIN " + SCHEMA + "subject_section AS os " +
                        "ON os.order_by = ns.order_by WHERE ns.subject_id = ? AND os.id = g.section_id) " +
                        "FROM " + SCHEMA + "grain AS g WHERE g.subject_id = ?",
                new JsonArray().add(newSubjectId).add(newSubjectId).add(fromSubjectId));
    }

    /** Fige les sections d'un sujet au moment de sa distribution. */
    static void scheduleSections(final SqlStatementsBuilder s, final Number subjectScheduledId, final Number fromSubjectId) {
        s.prepared("INSERT INTO " + SCHEMA + "subject_section_scheduled (subject_scheduled_id, title, description, order_by) " +
                        "SELECT ?, title, description, order_by FROM " + SCHEMA + "subject_section WHERE subject_id = ?",
                new JsonArray().add(subjectScheduledId).add(fromSubjectId));
    }

    /**
     * Sous-requête qui donne la section distribuée d'un grain, à partir de l'id de sa section modèle.
     * Deux paramètres : l'id du sujet distribué, puis l'id de la section modèle (NULL possible).
     */
    static String scheduledSectionOf() {
        return "(SELECT sss.id FROM " + SCHEMA + "subject_section_scheduled AS sss INNER JOIN " + SCHEMA + "subject_section AS ss " +
                "ON ss.order_by = sss.order_by WHERE sss.subject_scheduled_id = ? AND ss.id = ?)";
    }
}
