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
     * entre les deux), {@code limit}, {@code offset}.
     */
    void list(JsonObject criteria, Handler<Either<String, JsonObject>> handler);

    /** Un sujet du catalogue, avec ses grains et ses sections : {@code {subject, grains, sections}}. */
    void get(Long catalogSubjectId, Handler<Either<String, JsonObject>> handler);

    /** Le classement d'un sujet : {@code {level_ids: [...], discipline_ids: [...]}}. */
    void classification(Long subjectId, Handler<Either<String, JsonObject>> handler);

    /** Remplace le classement d'un sujet. */
    void setClassification(Long subjectId, JsonArray levelIds, JsonArray disciplineIds,
                           Handler<Either<String, JsonObject>> handler);

    /** Copie un sujet du catalogue dans les sujets de l'usager : {@code {id}} du sujet créé. */
    void copy(Long catalogSubjectId, Long folderId, UserInfos user, Handler<Either<String, JsonObject>> handler);

    /** Publie au catalogue une copie d'un sujet de l'usager : {@code {id}} du sujet du catalogue. */
    void publish(Long subjectId, JsonArray levelIds, JsonArray disciplineIds, String authors, UserInfos user,
                 Handler<Either<String, JsonObject>> handler);

    /** Retire un sujet du catalogue (suppression physique : il n'a ni copie ni distribution). */
    void remove(Long catalogSubjectId, Handler<Either<String, JsonObject>> handler);
}
