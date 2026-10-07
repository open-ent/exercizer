/*
 * Copyright © Région Nord Pas de Calais-Picardie.
 *
 * This file is part of OPEN ENT NG. OPEN ENT NG is a versatile ENT Project based on the JVM and ENT Core Project.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation (version 3 of the License).
 *
 * For the sake of explanation, any module that communicate over native
 * Web protocols, such as HTTP, with OPEN ENT NG is outside the scope of this
 * license and could be license under its own terms. This is merely considered
 * normal use of OPEN ENT NG, and does not fall under the heading of "covered work".
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

package fr.openent.exercizer.services;

import fr.wseduc.webutils.Either;
import org.entcore.common.user.UserInfos;

import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.util.List;

public interface ISubjectScheduledService {

    void retieve(String id, Handler<Either<String, JsonObject>> handler);

    /**
     *@see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
     */
    void persist(final JsonObject resource, final UserInfos user, final Handler<Either<String, JsonObject>> handler);

    /**
     * @see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
     */
    void list(final UserInfos user, final Handler<Either<String, JsonArray>> handler);

    /**
     *@see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
     */
    void listBySubjectCopyList(final UserInfos user, final Handler<Either<String, JsonArray>> handler);
    
    /**
     *@see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
     */
    void getById(final String id, final UserInfos user, final Handler<Either<String, JsonObject>> handler);
    
    /**
     * Schedules a subject.
     * 
     * @param scheduledSubject the resource
     * @param user the user
     * @param handler the handler
     */
    void schedule(final JsonObject scheduledSubject, final UserInfos user, final Handler<Either<String, JsonObject>> handler);

    /**
     * find data of subject scheduled.
     *
     * @param subjectScheduledId the id
     * @param handler the handler
     */
    void findUnscheduledData(final Long subjectScheduledId, final Handler<Either<String, JsonObject>> handler);

    /**
     * Find file IDs to remove from Storage before unscheduling a subject_schedule
     * 
     * @param subjectScheduledId the id
     * @return a Future list of subject_copy_file
     */
    Future<JsonArray> findUnscheduledCopyFiles(final Long subjectScheduledId);

    /**
     * unScheduled a subject.
     *
     * @param subjectScheduledId the id
     */
    Future<Void> unSchedule(final Long subjectScheduledId);

    /**
     * Schedules a simple subject.
     *
     * @param scheduledSubject the resource
     * @param user the user
     * @param handler the handler
     */
    void simpleSchedule(final JsonObject scheduledSubject, final UserInfos user, final Handler<Either<String, JsonObject>> handler);

    /**
     * Return download informations.
     * Useful to check if the corrected file is available to the user.
     *
     * @param id the id of SubjectScheduled
     * @param docId id of the file
     * @param handler the handler
     *
     */
    void getCorrectedDownloadInformation(final String id, final String docId, final Handler<Either<String, JsonObject>> handler);

    void getMember(final String id, final Handler<Either<String, JsonArray>> handler);

    void getArchive(final UserInfos user, final Handler<Either<String, JsonArray>> handler);

    void getListForExport(final UserInfos user, final List<String> ids, final Handler<Either<String, JsonArray>> handler);

    void modify(final String id, JsonObject fiedls, final Handler<Either<String, JsonObject>> handler);

    void createTrainingCopy(final String subjectScheduledId, UserInfos user, final Handler<Either<String, JsonObject>> handler);

    void recreateGrainCopies(final String subjectScheduledId, final String subjectCopyId, final Handler<Either<String, JsonObject>> handler);

    void getSubjectCopyBySubjectScheduled(final Long subjectScheduledId, final String userId, final Handler<Either<String, JsonObject>> handler);

    /**
     * Pilotage (D3) : met en pause ou reprend une séance planifiée.
     * Idempotent : appeler pause sur une séance déjà en pause (ou resume sur une séance déjà en cours)
     * ne fait rien de plus que renvoyer l'état courant.
     *
     * @param subjectScheduledId the id
     * @param pause true to pause the session, false to resume it
     * @param handler the handler, returns the updated session_state/paused_at/paused_duration_seconds
     */
    void setSessionState(final String subjectScheduledId, final boolean pause, final Handler<Either<String, JsonObject>> handler);

    /**
     * Pilotage (D3) : prolonge le temps d'un élève ou de toute la classe.
     * Les copies déjà rendues (submitted_date non nul) sont ignorées.
     *
     * @param subjectScheduledId the id
     * @param studentId scope: null for the whole class, a student id otherwise
     * @param minutes minutes to add to the current deadline
     * @param handler the handler, returns the list of updated copies (id, owner, extra_time_minutes)
     */
    void extendTime(final String subjectScheduledId, final String studentId, final int minutes, final Handler<Either<String, JsonArray>> handler);

    /**
     * Pilotage (D3) : force la remise de la copie d'un élève (comme un "Rendre" fait par l'élève).
     * Refuse si la copie est déjà rendue.
     *
     * @param subjectScheduledId the id
     * @param studentId the student id
     * @param handler the handler, returns the updated copy
     */
    void forceSubmit(final String subjectScheduledId, final String studentId, final Handler<Either<String, JsonObject>> handler);

    /**
     * Pilotage (D3) : agrégation pour l'écran enseignant, état de la séance + une ligne par élève
     * (statut de copie, prolongation, remise forcée).
     *
     * @param subjectScheduledId the id
     * @param handler the handler
     */
    void getPilotageState(final String subjectScheduledId, final Handler<Either<String, JsonObject>> handler);

    /**
     * Pilotage (D3) : autorise l'accès au canal WebSocket de pilotage d'une séance.
     * Vrai pour l'enseignant propriétaire, ou pour un élève ayant une copie sur cette séance.
     * Utilisé par PilotageWebSocketController (pas de {@link org.entcore.common.http.filter.ResourceFilter}
     * possible sur un Handler&lt;ServerWebSocket&gt; brut, contrairement aux routes REST).
     *
     * @param subjectScheduledId the id
     * @param userId the connecting user id
     * @param handler the handler
     */
    void canAccessPilotage(final String subjectScheduledId, final String userId, final Handler<Either<String, Boolean>> handler);
}
