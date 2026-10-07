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

import org.entcore.common.user.UserInfos;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import fr.wseduc.webutils.Either;
import io.vertx.core.json.JsonObject;

import java.util.List;

/**
 * « Parcours » (nom fonctionnel) — subject_sequence (nom technique). CRUD du modèle, calqué sur
 * {@link ISubjectService} (persist/update/remove/list/getById). Cf. SPEC-PARCOURS-multi-sequences.md §2/§3.1.
 * La gestion des sujets qui composent le Parcours (subject_sequence_item, ordre) est portée par
 * {@link ISubjectSequenceItemService}, séparé de ce service exactement comme {@link IGrainService} l'est
 * de {@link ISubjectService}.
 */
public interface ISubjectSequenceService {

	/**
	 *@see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
	 */
	void persist(final JsonObject resource, final UserInfos user, final Handler<Either<String, JsonObject>> handler);

	/**
	 *@see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
	 */
	void update(final JsonObject resource, final UserInfos user, final Handler<Either<String, JsonObject>> handler);

	/**
	 * Suppression logique (is_deleted=true), sur le modèle de {@link ISubjectService#remove}. Les
	 * subject_sequence_item ne sont pas supprimés (pas de notion de dossier à vider pour un Parcours).
	 */
	void remove(final JsonArray subjectSequenceIds, final Handler<Either<String, JsonObject>> handler);

	/**
	 *@see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
	 */
	void list(final List<String> groupsAndUserIds, final UserInfos user, final Handler<Either<String, JsonArray>> handler);

	/**
	 *@see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
	 */
	void getById(final String id, final UserInfos user, final Handler<Either<String, JsonObject>> handler);
}
