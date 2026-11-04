package fr.openent.exercizer.services;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.user.UserInfos;

/**
 * Catalogue d'exercices partagé entre établissements, et classement des sujets par niveau et matière
 * (cf. sql/041-subject-catalog.sql).
 */
public interface ICatalogService {

    /** Les niveaux (dans l'ordre de la scolarité) et les matières : {@code {levels: [...], disciplines: [...]}}. */
    void referential(Handler<Either<String, JsonObject>> handler);

    /**
     * Une page du catalogue : {@code {total, subjects: [...]}}. Critères facultatifs : {@code q} (titre ou
     * description), {@code levels} et {@code disciplines} (id ; « l'un de » dans une même famille, « et »
     * entre les deux), {@code limit}, {@code offset}, {@code structures} (établissements de l'usager :
     * les sujets venus d'un pack n'y apparaissent que s'il y a accès).
     * Rangée par programme : en plus, {@code programme} (référentiel CASE) et {@code node} (énoncé :
     * sujets rattachés à lui ou à l'un de ses descendants, ou à lui seul avec {@code direct} ;
     * {@code __none__} : rattachés à aucun énoncé de ce programme). Chaque sujet porte ses
     * {@code alignments}.
     */
    void list(JsonObject criteria, Handler<Either<String, JsonObject>> handler);

    /** Nombre de sujets par couple (niveau, matière), sous les critères de {@link #list} : {@code {facets: [...]}}. */
    void facets(JsonObject criteria, Handler<Either<String, JsonObject>> handler);

    /**
     * Les programmes publiés (référentiels CASE du module case) avec leur nombre de sujets rattachés :
     * {@code {programmes: [{id, title, version, aligned}]}} ; vide si le module case est absent.
     */
    void programmes(JsonObject criteria, Handler<Either<String, JsonObject>> handler);

    /**
     * L'arbre d'un programme, à plat, avec le nombre de sujets sous chaque énoncé (critères de
     * {@link #list}) : {@code {nodes: [{id, parent, seq, code, label, type, levels, count}], unaligned}}.
     * Sans {@code full}, seules les branches qui portent des sujets.
     */
    void programmeTree(String programme, boolean full, JsonObject criteria, Handler<Either<String, JsonObject>> handler);

    /**
     * Énoncés de programmes publiés (de {@code programme} seul s'il n'est pas null) qui répondent à la
     * recherche {@code q}, avec le nombre de sujets visibles (critères de {@link #list}, sans {@code q})
     * rattachés à chacun ou à ses descendants : {@code {objectives: [{id, programme, programme_title,
     * code, label, type, levels, count}]}}.
     */
    void objectives(String q, String programme, JsonObject criteria, Handler<Either<String, JsonObject>> handler);

    /**
     * Énoncés d'un programme à proposer pour un sujet de ces niveaux et matières (id), au texte donné :
     * {@code {suggestions: [{id, code, label, type}]}}.
     */
    void suggestions(String programme, JsonArray levelIds, JsonArray disciplineIds, String text,
                     Handler<Either<String, JsonObject>> handler);

    /** Un sujet du catalogue, avec ses grains et ses sections : {@code {subject, grains, sections}}. */
    void get(Long catalogSubjectId, Handler<Either<String, JsonObject>> handler);

    /**
     * Le même, vu d'un enseignant de ces établissements : un sujet venu d'un pack auquel aucun d'eux
     * n'a accès est « not.found ».
     */
    void get(Long catalogSubjectId, java.util.List<String> structures, Handler<Either<String, JsonObject>> handler);

    /** Le classement d'un sujet : {@code {level_ids: [...], discipline_ids: [...], alignments: [...]}}. */
    void classification(Long subjectId, Handler<Either<String, JsonObject>> handler);

    /** Remplace le classement d'un sujet ; ses rattachements aussi, sauf {@code alignmentIds} null. */
    void setClassification(Long subjectId, JsonArray levelIds, JsonArray disciplineIds, JsonArray alignmentIds,
                           Handler<Either<String, JsonObject>> handler);

    /** Copie un sujet du catalogue dans les sujets de l'usager : {@code {id}} du sujet créé. */
    void copy(Long catalogSubjectId, Long folderId, UserInfos user, Handler<Either<String, JsonObject>> handler);

    /**
     * Publie au catalogue une copie d'un sujet de l'usager : {@code {id}} du sujet du catalogue. Les
     * rattachements sont {@code alignmentIds}, ou ceux du sujet d'origine s'il est null ; posés tels quels
     * par un modérateur ({@code moderator}), simplement proposés sinon (cf. {@link #moderation}).
     */
    void publish(Long subjectId, JsonArray levelIds, JsonArray disciplineIds, JsonArray alignmentIds, String authors,
                 UserInfos user, boolean moderator, Handler<Either<String, JsonObject>> handler);

    /**
     * Reclasse un sujet du catalogue. Les rattachements ({@code alignmentIds}, inchangés s'il est null)
     * remplacent ceux du sujet pour un modérateur, qui valide du même coup les propositions retenues ;
     * pour l'auteur, les énoncés nouveaux deviennent des propositions.
     */
    void reclassify(Long catalogSubjectId, JsonArray levelIds, JsonArray disciplineIds, JsonArray alignmentIds,
                    UserInfos user, boolean moderator, Handler<Either<String, JsonObject>> handler);

    /** Retire un sujet du catalogue (suppression physique : il n'a ni copie ni distribution). */
    void remove(Long catalogSubjectId, Handler<Either<String, JsonObject>> handler);

    // ── Qualité et confiance (cf. sql/046-catalog-quality.sql) ──────────────────

    /**
     * Les signaux d'usage d'un sujet du catalogue vus par l'usager : {@code {copies, structures,
     * my_structures, rating_avg, rating_count, can_review, reviews: [{user_id, username, rating, comment,
     * modified}]}} ; {@code my_structures} = copies faites depuis l'un des établissements de l'usager.
     */
    void usage(Long catalogSubjectId, UserInfos user, Handler<Either<String, JsonObject>> handler);

    /** Dépose ou remplace l'avis de l'usager ; « forbidden » s'il n'a pas copié le sujet ou en est l'auteur. */
    void review(Long catalogSubjectId, UserInfos user, int rating, String comment,
                Handler<Either<String, JsonObject>> handler);

    /** Retire l'avis d'un usager sur un sujet du catalogue. */
    void removeReview(Long catalogSubjectId, String userId, Handler<Either<String, JsonObject>> handler);

    /**
     * La file de validation des rattachements proposés : {@code {proposals: [{subject_id, subject_title,
     * subject_owner_username, cfitem_id, code, label, programme, programme_title, proposed_by,
     * proposed_by_name, proposed_at}]}}.
     */
    void moderation(Handler<Either<String, JsonObject>> handler);

    /** Valide ou refuse des propositions : {@code [{subject_id, cfitem_id, accept}]}. */
    void decide(JsonArray decisions, Handler<Either<String, JsonObject>> handler);
}
