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
     * rattachements sont {@code alignmentIds}, ou ceux du sujet d'origine s'il est null.
     */
    void publish(Long subjectId, JsonArray levelIds, JsonArray disciplineIds, JsonArray alignmentIds, String authors,
                 UserInfos user, Handler<Either<String, JsonObject>> handler);

    /** Retire un sujet du catalogue (suppression physique : il n'a ni copie ni distribution). */
    void remove(Long catalogSubjectId, Handler<Either<String, JsonObject>> handler);
}
