package fr.openent.exercizer.services;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

/** Sections d'un sujet interactif, et leur copie figée à la distribution. */
public interface ISectionService {

    void list(final Long subjectId, final Handler<Either<String, JsonArray>> handler);

    void create(final Long subjectId, final JsonObject section, final Handler<Either<String, JsonObject>> handler);

    void update(final Long subjectId, final Long sectionId, final JsonObject section, final Handler<Either<String, JsonObject>> handler);

    /**
     * Supprime une section. Ses grains sont supprimés avec elle si {@code withGrains}, sinon
     * rattachés à la section précédente (ou laissés hors section s'il n'y en a pas).
     */
    void remove(final Long subjectId, final Long sectionId, final boolean withGrains, final Handler<Either<String, JsonObject>> handler);

    /** Copie une section et ses grains juste après elle. Renvoie la nouvelle section. */
    void duplicate(final Long subjectId, final Long sectionId, final String titleSuffix, final Handler<Either<String, JsonObject>> handler);

    /**
     * Réécrit l'arbre du sujet en une transaction : ordre des sections, section et rang de chaque grain.
     * {@code ungrouped} : ids des grains hors section ; {@code sections} : [{id, grainIds}], dans l'ordre.
     */
    void saveStructure(final Long subjectId, final JsonArray ungrouped, final JsonArray sections, final Handler<Either<String, JsonObject>> handler);

    /**
     * Sections distribuées d'une copie, avec les grains distribués de chacune
     * ({@code grain_scheduled_ids}) : de quoi regrouper les copies de grains côté client.
     */
    void listForSubjectCopy(final Long subjectCopyId, final Handler<Either<String, JsonArray>> handler);
}
