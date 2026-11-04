package fr.openent.exercizer.services.impl;

import io.vertx.core.json.JsonArray;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlStatementsBuilder;

import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Requêtes de rattachement des sujets aux programmes officiels : les référentiels CASE du module case
 * (schéma {@code casestd}, même base Postgres) et la table {@code exercizer.subject_alignment}
 * (cf. sql/044-subject-packs.sql).
 *
 * On lit le schéma {@code casestd} en SQL plutôt que par les routes CASE : l'arbre d'un programme se
 * compte avec les sujets dans une même requête, sans rapatrier le paquet entier (5 Mo). Comme les
 * routes normatives du module case, on ne lit que les référentiels PUBLIÉS.
 *
 * L'arbre est porté par les associations {@code isChildOf} : l'enfant en origine, le parent en
 * destination ; les énoncés de premier niveau ont le référentiel lui-même pour parent.
 */
final class ProgrammeSql {

    private static final String S = "exercizer.";
    private static final String CASE = "casestd.";

    /** Le schéma du module case existe-t-il ? Sans lui, les programmes sont simplement absents. */
    static final String AVAILABLE = "SELECT to_regclass('casestd.item') IS NOT NULL AS available";

    /** En deçà, un rang plein texte ne traduit aucun mot commun (ts_rank renvoie 1e-20, pas 0). */
    private static final double MIN_RANK = 0.001;

    /** Valeur du paramètre {@code node} qui désigne les sujets rattachés à aucun énoncé du programme. */
    static final String UNALIGNED = "__none__";

    /**
     * Types d'énoncés qui structurent un programme sans décrire un apprentissage : on ne les propose
     * pas en suggestion de rattachement.
     */
    private static final List<String> STRUCTURAL_TYPES =
            Arrays.asList("Cycle", "Enseignement", "Domaine", "Sous-domaine", "Thème");

    /**
     * Matière d'exercizer (code de sql/041) → segments « enseignement » des codes du programme
     * (deuxième segment de {@code human_coding_scheme} : C2.MAT.1.2.5 → MAT).
     */
    private static final Map<String, List<String>> TEACHINGS = new HashMap<>();

    static {
        TEACHINGS.put("FRANCAIS", Arrays.asList("FRA", "LAN"));
        TEACHINGS.put("LANGAGE", Collections.singletonList("LAN"));
        TEACHINGS.put("MATHEMATIQUES", Arrays.asList("MAT", "OUM"));
        TEACHINGS.put("HISTOIRE_GEO", Arrays.asList("HGE", "RTE"));
        TEACHINGS.put("EMC", Collections.singletonList("EMC"));
        TEACHINGS.put("LANGUES_VIVANTES", Collections.singletonList("LVE"));
        TEACHINGS.put("EPS", Arrays.asList("EPS", "APH"));
        TEACHINGS.put("ARTS_PLASTIQUES", Arrays.asList("APL", "AAR", "HDA"));
        TEACHINGS.put("EDUCATION_MUSICALE", Arrays.asList("EMU", "AAR", "HDA"));
        TEACHINGS.put("QUESTIONNER_LE_MONDE", Arrays.asList("QLM", "DMV", "RTE"));
        TEACHINGS.put("EXPLORER_LE_MONDE", Arrays.asList("DMV", "RTE", "OUM"));
        TEACHINGS.put("SCIENCES_TECHNO", Arrays.asList("SCT", "QLM", "DMV"));
        TEACHINGS.put("SVT", Arrays.asList("SCT", "QLM"));
        TEACHINGS.put("PHYSIQUE_CHIMIE", Arrays.asList("SCT", "QLM"));
        TEACHINGS.put("TECHNOLOGIE", Arrays.asList("SCT", "QLM"));
    }

    private ProgrammeSql() {}

    /** Les segments d'enseignement qui correspondent à ces matières (codes de sql/041), sans doublon. */
    static Set<String> teachingsOf(final Collection<String> disciplineCodes) {
        final Set<String> teachings = new LinkedHashSet<>();
        for (String code : disciplineCodes) {
            teachings.addAll(TEACHINGS.getOrDefault(code, Collections.emptyList()));
        }
        return teachings;
    }

    /**
     * Les référentiels publiés, avec le nombre de sujets visibles rattachés à l'un de leurs énoncés et
     * les groupes de niveaux qu'ils couvrent ({@code levels}).
     */
    static String programmes(final String visibleSubjects) {
        return "WITH visible AS (" + visibleSubjects + ") " +
                "SELECT d.identifier AS id, d.title, d.version, " +
                "(SELECT count(DISTINCT sa.subject_id) FROM " + S + "subject_alignment AS sa " +
                "JOIN visible AS v ON v.id = sa.subject_id " +
                "JOIN " + CASE + "item AS i ON i.identifier = sa.cfitem_id WHERE i.document_id = d.identifier) AS aligned, " +
                // Les groupes de niveaux couverts (maternelle, élémentaire…), d'après les niveaux des énoncés.
                "(SELECT COALESCE(json_agg(DISTINCT l.level_group), '[]'::json) FROM " + CASE + "item AS i " +
                "CROSS JOIN LATERAL jsonb_array_elements_text(i.education_levels) AS e(code) " +
                "JOIN " + S + "subject_lesson_level AS l ON l.code = e.code WHERE i.document_id = d.identifier) AS levels " +
                "FROM " + CASE + "document AS d WHERE d.published = true ORDER BY d.title";
    }

    /**
     * L'arbre d'un programme, à plat : {@code id, parent (null au premier niveau), seq, code, label,
     * type, levels, count}. {@code count} = nombre de sujets visibles DISTINCTS rattachés à l'énoncé
     * ou à l'un de ses descendants. Sans {@code full}, seules les branches qui portent au moins un
     * sujet sont renvoyées.
     *
     * Paramètres, dans l'ordre : ceux de {@code visibleSubjects}, puis l'id du référentiel trois fois.
     */
    static String tree(final String visibleSubjects, final boolean full) {
        return "WITH RECURSIVE visible AS (" + visibleSubjects + "), " +
                "doc AS (SELECT d.identifier FROM " + CASE + "document AS d WHERE d.identifier = ? AND d.published = true), " +
                "nodes AS (SELECT a.origin_id AS id, a.destination_id AS parent, a.sequence_number AS seq " +
                "FROM " + CASE + "association AS a JOIN doc ON doc.identifier = a.document_id " +
                "WHERE a.association_type = 'isChildOf'), " +
                // Chaque rattachement remonte jusqu'à la racine : (énoncé, sujet) pour tous les ancêtres.
                "up AS (SELECT sa.cfitem_id AS node, sa.subject_id FROM " + S + "subject_alignment AS sa " +
                "JOIN visible AS v ON v.id = sa.subject_id WHERE sa.cfitem_id IN (SELECT id FROM nodes) " +
                "UNION SELECT n.parent, up.subject_id FROM up JOIN nodes AS n ON n.id = up.node " +
                "WHERE n.parent <> ?), " +
                "counts AS (SELECT node, count(DISTINCT subject_id) AS count FROM up GROUP BY node) " +
                "SELECT n.id, NULLIF(n.parent, ?) AS parent, n.seq, i.human_coding_scheme AS code, " +
                "COALESCE(i.abbreviated_statement, i.full_statement) AS label, i.item_type AS type, " +
                "i.education_levels AS levels, COALESCE(c.count, 0) AS count " +
                "FROM nodes AS n JOIN " + CASE + "item AS i ON i.identifier = n.id LEFT JOIN counts AS c ON c.node = n.id" +
                (full ? "" : " WHERE c.count > 0") +
                " ORDER BY n.seq NULLS LAST, i.human_coding_scheme";
    }

    /**
     * Nombre de sujets visibles rattachés à aucun énoncé de ce programme. Paramètres : ceux de
     * {@code visibleSubjects}, puis l'id du référentiel.
     */
    static String unalignedCount(final String visibleSubjects) {
        return "WITH visible AS (" + visibleSubjects + ") SELECT count(*) AS count FROM visible AS v " +
                "WHERE NOT EXISTS (" + alignedTo("v.id") + ")";
    }

    /**
     * Restreint {@code s} aux sujets rattachés à l'énoncé {@code node} — ou à l'un de ses descendants,
     * sauf {@code direct} — ou, pour {@link #UNALIGNED}, à aucun énoncé du programme. Ajoute ses
     * paramètres à {@code values}.
     */
    static String nodeFilter(final String programme, final String node, final boolean direct, final JsonArray values) {
        if (UNALIGNED.equals(node)) {
            values.add(programme);
            return " AND NOT EXISTS (" + alignedTo("s.id") + ")";
        }
        if (direct) {
            values.add(node);
            return " AND s.id IN (SELECT sa.subject_id FROM " + S + "subject_alignment AS sa WHERE sa.cfitem_id = ?)";
        }
        values.add(node).add(programme);
        // Sous-requête non corrélée : la descendance n'est calculée qu'une fois.
        return " AND s.id IN (WITH RECURSIVE below(id) AS (SELECT ?::varchar UNION " +
                "SELECT a.origin_id FROM " + CASE + "association AS a JOIN below ON a.destination_id = below.id " +
                "WHERE a.association_type = 'isChildOf' AND a.document_id = ?) " +
                "SELECT sa.subject_id FROM " + S + "subject_alignment AS sa JOIN below ON below.id = sa.cfitem_id)";
    }

    /** Un rattachement du sujet {@code subject} à un énoncé du référentiel passé en paramètre. */
    private static String alignedTo(final String subject) {
        return "SELECT 1 FROM " + S + "subject_alignment AS sa JOIN " + CASE + "item AS i ON i.identifier = sa.cfitem_id " +
                "WHERE sa.subject_id = " + subject + " AND i.document_id = ?";
    }

    /** Les énoncés (de référentiels publiés) d'un sujet {@code s}, triés par code, en JSON. */
    static String alignmentsColumn() {
        return "COALESCE((SELECT json_agg(json_build_object('id', i.identifier, 'code', i.human_coding_scheme, " +
                "'label', i.full_statement, 'programme', i.document_id) ORDER BY i.human_coding_scheme) " +
                "FROM " + S + "subject_alignment AS sa JOIN " + CASE + "item AS i ON i.identifier = sa.cfitem_id " +
                "JOIN " + CASE + "document AS d ON d.identifier = i.document_id AND d.published = true " +
                "WHERE sa.subject_id = s.id), '[]'::json) AS alignments";
    }

    /**
     * Au plus {@code limit} énoncés d'apprentissage d'un programme à proposer pour un sujet : ceux de
     * ses niveaux et de ses matières d'abord, puis par proximité du texte (recherche plein texte en
     * français sur l'énoncé). Ajoute ses paramètres à {@code values}.
     */
    static String suggestions(final String programme, final Collection<String> levels, final Collection<String> teachings,
                              final String text, final int limit, final JsonArray values) {
        final String levelMatch = levels.isEmpty() ? "true"
                : "jsonb_exists_any(i.education_levels, ARRAY" + listPrepared(levels) + "::text[])";
        levels.forEach(values::add);
        final String teachingMatch = teachings.isEmpty() ? "true"
                : "split_part(i.human_coding_scheme, '.', 2) IN " + Sql.listPrepared(teachings.toArray());
        teachings.forEach(values::add);
        values.add(text == null ? "" : text);
        values.add(programme);
        STRUCTURAL_TYPES.forEach(values::add);
        values.add(limit);
        // Dès qu'un énoncé partage des mots avec le sujet, on ne propose que ceux-là : les autres, de
        // rang nul, ne seraient que les premiers codes du niveau et de la matière. Sinon, ce sont eux.
        return "SELECT i.id, i.code, i.label, i.type FROM (" +
                "SELECT i.identifier AS id, i.human_coding_scheme AS code, i.full_statement AS label, i.item_type AS type, " +
                "i.rank, max(i.rank) OVER () AS best " +
                "FROM (SELECT i.*, (" + levelMatch + ") AS level_match, (" + teachingMatch + ") AS teaching_match, " +
                "ts_rank(to_tsvector('french', i.full_statement), plainto_tsquery('french', ?)) AS rank " +
                "FROM " + CASE + "item AS i JOIN " + CASE + "document AS d ON d.identifier = i.document_id AND d.published = true " +
                "WHERE i.document_id = ? AND i.item_type NOT IN " + Sql.listPrepared(STRUCTURAL_TYPES.toArray()) + ") AS i " +
                "WHERE i.level_match AND i.teaching_match) AS i " +
                "WHERE i.rank > " + MIN_RANK + " OR i.best <= " + MIN_RANK + " " +
                "ORDER BY i.rank DESC, i.code LIMIT ?";
    }

    /** « [?,?,?] » : la liste de paramètres d'un tableau Postgres. */
    private static String listPrepared(final Collection<String> values) {
        return Sql.listPrepared(values.toArray()).replace('(', '[').replace(')', ']');
    }

    /** Remplace les rattachements d'un sujet ; un énoncé inconnu du référentiel est ignoré. */
    static void replaceAlignments(final SqlStatementsBuilder s, final Number subjectId,
                                  final JsonArray cfitemIds) {
        s.prepared("DELETE FROM " + S + "subject_alignment WHERE subject_id = ?", new JsonArray().add(subjectId));
        for (Object cfitemId : cfitemIds) {
            s.prepared("INSERT INTO " + S + "subject_alignment (subject_id, cfitem_id) " +
                            "SELECT ?, identifier FROM " + CASE + "item WHERE identifier = ? ON CONFLICT DO NOTHING",
                    new JsonArray().add(subjectId).add(cfitemId));
        }
    }
}
