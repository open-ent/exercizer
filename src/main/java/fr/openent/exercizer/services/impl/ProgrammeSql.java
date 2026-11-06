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
        // Collège : la sixième garde « sciences et technologie », le cycle 4 les sépare.
        TEACHINGS.put("SVT", Arrays.asList("SVT", "SCT", "QLM"));
        TEACHINGS.put("PHYSIQUE_CHIMIE", Arrays.asList("PHC", "SCT", "QLM"));
        TEACHINGS.put("TECHNOLOGIE", Arrays.asList("TEC", "SCT", "QLM"));
        TEACHINGS.put("DOCUMENTATION", Collections.singletonList("EMI"));
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

    /**
     * Un énoncé {@code i} répond à la recherche {@code q} : son code commence par elle (C3.MAT.1.3 → la
     * branche), ou son texte en contient les mots (plein texte en français : « fractions décimales »
     * trouve « une fraction décimale »). Ajoute ses paramètres à {@code values}.
     */
    private static String statementMatches(final String q, final JsonArray values) {
        values.add(escapeLike(q) + "%").add(q);
        return "(i.human_coding_scheme ILIKE ? OR to_tsvector('french', i.full_statement) @@ plainto_tsquery('french', ?))";
    }

    /**
     * Les sujets rattachés à un énoncé (d'un référentiel publié) qui répond à la recherche {@code q}, en
     * sous-requête. Ajoute ses paramètres à {@code values}.
     */
    static String alignedToMatching(final String q, final JsonArray values) {
        return "SELECT sa.subject_id FROM " + S + "subject_alignment AS sa JOIN " + CASE + "item AS i ON i.identifier = sa.cfitem_id " +
                "JOIN " + CASE + "document AS d ON d.identifier = i.document_id AND d.published = true " +
                "WHERE " + statementMatches(q, values);
    }

    /**
     * Au plus {@code limit} énoncés de programmes publiés (de {@code programme} seul s'il est donné, des
     * niveaux {@code levelIds} s'il y en a) qui répondent à la recherche {@code q} : {@code id, programme, programme_title, code, label, type,
     * levels, count}, où {@code count} compte les sujets visibles rattachés à l'énoncé ou à l'un de ses
     * descendants. Ceux qui ont des exercices d'abord, puis par pertinence.
     *
     * Paramètres : ceux de {@code visibleSubjects} déjà dans {@code values}, puis les siens.
     */
    static String objectives(final String visibleSubjects, final String q, final String programme,
                             final JsonArray levelIds, final int limit, final JsonArray values) {
        values.add(q);
        final String match = statementMatches(q, values);
        if (programme != null) values.add(programme);
        // Les niveaux regardés (id d'exercizer) : un énoncé sans niveau reste proposé.
        final String levelMatch = levelIds.isEmpty() ? "" :
                " AND (jsonb_array_length(COALESCE(i.education_levels, '[]'::jsonb)) = 0 OR jsonb_exists_any(i.education_levels, " +
                "ARRAY(SELECT l.code FROM " + S + "subject_lesson_level AS l WHERE l.code IS NOT NULL AND l.id IN " +
                Sql.listPrepared(levelIds.getList()) + ")))";
        levelIds.forEach(values::add);
        values.add(limit);
        return "WITH RECURSIVE visible AS (" + visibleSubjects + "), " +
                "hits AS (SELECT i.identifier AS id, i.document_id AS programme, d.title AS programme_title, " +
                "i.human_coding_scheme AS code, i.full_statement AS label, i.item_type AS type, i.education_levels AS levels, " +
                // Normalisé par la longueur : un énoncé court qui nomme la notion passe avant un long qui la répète.
                "ts_rank(to_tsvector('french', i.full_statement), plainto_tsquery('french', ?), 2) AS rank " +
                "FROM " + CASE + "item AS i JOIN " + CASE + "document AS d ON d.identifier = i.document_id AND d.published = true " +
                "WHERE " + match + (programme != null ? " AND i.document_id = ?" : "") + levelMatch + "), " +
                // Chaque énoncé trouvé descend jusqu'aux feuilles : (énoncé trouvé, descendant).
                "below(hit, id) AS (SELECT id, id FROM hits UNION SELECT b.hit, a.origin_id FROM below AS b " +
                "JOIN " + CASE + "association AS a ON a.destination_id = b.id AND a.association_type = 'isChildOf'), " +
                "counts AS (SELECT b.hit, count(DISTINCT sa.subject_id) AS count FROM below AS b " +
                "JOIN " + S + "subject_alignment AS sa ON sa.cfitem_id = b.id JOIN visible AS v ON v.id = sa.subject_id " +
                "GROUP BY b.hit) " +
                "SELECT h.id, h.programme, h.programme_title, h.code, h.label, h.type, h.levels, COALESCE(c.count, 0) AS count " +
                "FROM hits AS h LEFT JOIN counts AS c ON c.hit = h.id " +
                "ORDER BY (COALESCE(c.count, 0) > 0) DESC, h.rank DESC, h.code LIMIT ?";
    }

    /** Échappe les jokers de LIKE. */
    static String escapeLike(final String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
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
                // Normalisé par la longueur : un énoncé court qui nomme la notion passe avant un long qui la répète.
                "ts_rank(to_tsvector('french', i.full_statement), plainto_tsquery('french', ?), 2) AS rank " +
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

    // ── Rattachements proposés (cf. sql/046-catalog-quality.sql) ────────────────

    /** Les rattachements d'un sujet {@code s} qui attendent la validation d'un modérateur, en JSON. */
    static String pendingAlignmentsColumn() {
        return "COALESCE((SELECT json_agg(json_build_object('id', i.identifier, 'code', i.human_coding_scheme, " +
                "'label', i.full_statement, 'programme', i.document_id, 'proposed_by_name', p.proposed_by_name) " +
                "ORDER BY i.human_coding_scheme) " +
                "FROM " + S + "subject_alignment_proposal AS p JOIN " + CASE + "item AS i ON i.identifier = p.cfitem_id " +
                "JOIN " + CASE + "document AS d ON d.identifier = i.document_id AND d.published = true " +
                "WHERE p.subject_id = s.id), '[]'::json) AS pending_alignments";
    }

    /**
     * Le rattachement voulu par l'auteur d'un sujet du catalogue qui n'est pas modérateur : un
     * rattachement validé hors de la liste est retiré tout de suite (retirer ne fausse pas le
     * rangement), un énoncé nouveau devient une proposition, une proposition hors de la liste tombe.
     */
    static void proposeAlignments(final SqlStatementsBuilder s, final Number subjectId, final JsonArray cfitemIds,
                                  final String userId, final String username) {
        final String kept = cfitemIds.isEmpty() ? "" : " AND cfitem_id NOT IN " + Sql.listPrepared(cfitemIds.getList());
        s.prepared("DELETE FROM " + S + "subject_alignment WHERE subject_id = ?" + kept,
                new JsonArray().add(subjectId).addAll(cfitemIds));
        s.prepared("DELETE FROM " + S + "subject_alignment_proposal WHERE subject_id = ?" + kept,
                new JsonArray().add(subjectId).addAll(cfitemIds));
        for (Object cfitemId : cfitemIds) {
            s.prepared("INSERT INTO " + S + "subject_alignment_proposal (subject_id, cfitem_id, proposed_by, proposed_by_name) " +
                            "SELECT ?, i.identifier, ?, ? FROM " + CASE + "item AS i WHERE i.identifier = ? " +
                            "AND NOT EXISTS (SELECT 1 FROM " + S + "subject_alignment AS sa " +
                            "WHERE sa.subject_id = ? AND sa.cfitem_id = i.identifier) ON CONFLICT DO NOTHING",
                    new JsonArray().add(subjectId).add(userId).add(username).add(cfitemId).add(subjectId));
        }
    }

    /** Auteur des propositions faites par le rattachement assisté ({@code proposed_by}). */
    static final String SUGGESTION_AUTHOR = "suggestion";

    /**
     * Le rattachement assisté : pour chaque sujet du catalogue rattaché à aucun énoncé et sans proposition
     * en attente, propose l'énoncé d'apprentissage le plus proche de son titre et de sa description parmi
     * ceux de ses niveaux et de ses matières, tous programmes publiés confondus, et le suivant s'il est au
     * moins à moitié aussi proche. Un sujet sans mot commun avec aucun énoncé ne reçoit rien ; un
     * rattachement déjà refusé n'est pas reproposé. Renvoie une ligne par proposition ({@code subject_id}).
     */
    static String suggestUnaligned(final JsonArray values) {
        final StringBuilder teachings = new StringBuilder();
        TEACHINGS.forEach((discipline, segments) -> segments.forEach(segment -> {
            teachings.append(teachings.length() == 0 ? "" : ", ").append("(?, ?)");
            values.add(discipline).add(segment);
        }));
        STRUCTURAL_TYPES.forEach(values::add);
        values.add(SUGGESTION_AUTHOR);
        return "WITH teaching (discipline, segment) AS (VALUES " + teachings + "), " +
                "subject AS (SELECT s.id, s.title || ' ' || COALESCE(s.description, '') AS text, " +
                "ARRAY(SELECT l.code FROM " + S + "subject_level AS sl JOIN " + S + "subject_lesson_level AS l " +
                "ON l.id = sl.level_id WHERE sl.subject_id = s.id AND l.code IS NOT NULL) AS levels, " +
                "ARRAY(SELECT t.segment FROM " + S + "subject_discipline AS sd JOIN " + S + "subject_lesson_type AS lt " +
                "ON lt.id = sd.discipline_id JOIN teaching AS t ON t.discipline = lt.code WHERE sd.subject_id = s.id) AS segments " +
                "FROM " + S + "subject AS s WHERE s.is_library_subject = true AND s.is_deleted = false " +
                "AND NOT EXISTS (SELECT 1 FROM " + S + "subject_alignment AS sa WHERE sa.subject_id = s.id) " +
                "AND NOT EXISTS (SELECT 1 FROM " + S + "subject_alignment_proposal AS p WHERE p.subject_id = s.id)), " +
                "ranked AS (SELECT s.id AS subject_id, i.identifier AS cfitem_id, " +
                "ts_rank(to_tsvector('french', i.full_statement), plainto_tsquery('french', s.text), 2) AS rank " +
                "FROM subject AS s JOIN " + CASE + "item AS i " +
                "ON (cardinality(s.levels) = 0 OR jsonb_exists_any(i.education_levels, s.levels)) " +
                "AND (cardinality(s.segments) = 0 OR split_part(i.human_coding_scheme, '.', 2) = ANY (s.segments)) " +
                "JOIN " + CASE + "document AS d ON d.identifier = i.document_id AND d.published = true " +
                "WHERE i.item_type NOT IN " + Sql.listPrepared(STRUCTURAL_TYPES.toArray()) + " " +
                "AND NOT EXISTS (SELECT 1 FROM " + S + "subject_alignment_rejection AS r " +
                "WHERE r.subject_id = s.id AND r.cfitem_id = i.identifier)), " +
                "best AS (SELECT r.*, row_number() OVER w AS position, max(r.rank) OVER w AS top FROM ranked AS r " +
                "WHERE r.rank > " + MIN_RANK + " WINDOW w AS (PARTITION BY r.subject_id ORDER BY r.rank DESC, r.cfitem_id)) " +
                "INSERT INTO " + S + "subject_alignment_proposal (subject_id, cfitem_id, proposed_by) " +
                "SELECT b.subject_id, b.cfitem_id, ? FROM best AS b " +
                "WHERE b.position = 1 OR (b.position = 2 AND b.rank * 2 >= b.top) " +
                "ON CONFLICT DO NOTHING RETURNING subject_id";
    }

    /** Propose pour un sujet nouvellement publié les rattachements d'un autre (le sujet d'origine). */
    static void proposeAlignmentsOf(final SqlStatementsBuilder s, final Number subjectId, final Number fromSubjectId,
                                    final String userId, final String username) {
        s.prepared("INSERT INTO " + S + "subject_alignment_proposal (subject_id, cfitem_id, proposed_by, proposed_by_name) " +
                        "SELECT ?, cfitem_id, ?, ? FROM " + S + "subject_alignment WHERE subject_id = ? ON CONFLICT DO NOTHING",
                new JsonArray().add(subjectId).add(userId).add(username).add(fromSubjectId));
    }

    /**
     * La file de validation : les rattachements proposés sur les sujets du catalogue, du plus ancien au
     * plus récent, avec le sujet et l'énoncé.
     */
    static String proposals() {
        return "SELECT p.subject_id, s.title AS subject_title, s.owner_username AS subject_owner_username, " +
                "p.cfitem_id, i.human_coding_scheme AS code, i.full_statement AS label, " +
                "i.document_id AS programme, d.title AS programme_title, p.proposed_by, p.proposed_by_name, p.proposed_at " +
                "FROM " + S + "subject_alignment_proposal AS p " +
                "JOIN " + S + "subject AS s ON s.id = p.subject_id AND s.is_library_subject = true AND s.is_deleted = false " +
                "JOIN " + CASE + "item AS i ON i.identifier = p.cfitem_id " +
                "JOIN " + CASE + "document AS d ON d.identifier = i.document_id AND d.published = true " +
                "ORDER BY p.proposed_at, s.id, i.human_coding_scheme";
    }

    /**
     * Valide (le rattachement est posé) ou refuse une proposition ; elle quitte la file dans les deux cas.
     * Un refus est retenu, pour que le rattachement assisté ne la repropose pas.
     */
    static void decide(final SqlStatementsBuilder s, final Number subjectId, final String cfitemId, final boolean accept) {
        s.prepared("INSERT INTO " + S + (accept ? "subject_alignment (subject_id, cfitem_id) " : "subject_alignment_rejection (subject_id, cfitem_id) ") +
                        "SELECT subject_id, cfitem_id FROM " + S + "subject_alignment_proposal " +
                        "WHERE subject_id = ? AND cfitem_id = ? ON CONFLICT DO NOTHING",
                new JsonArray().add(subjectId).add(cfitemId));
        s.prepared("DELETE FROM " + S + "subject_alignment_proposal WHERE subject_id = ? AND cfitem_id = ?",
                new JsonArray().add(subjectId).add(cfitemId));
    }
}
