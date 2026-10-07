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

package fr.openent.exercizer.services.impl;

import fr.openent.exercizer.parsers.ResourceParser;
import fr.openent.exercizer.services.ISubjectSequenceService;
import fr.wseduc.webutils.Either;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.user.UserInfos;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.util.List;

public class SubjectSequenceServiceSqlImpl extends AbstractExercizerServiceSqlImpl implements ISubjectSequenceService {

	public SubjectSequenceServiceSqlImpl() {
		super("exercizer", "subject_sequence", "subject_sequence_shares");
	}

	/**
	 * @see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
	 */
	@Override
	public void persist(final JsonObject resource, final UserInfos user, final Handler<Either<String, JsonObject>> handler) {
		final JsonObject subjectSequence = ResourceParser.beforeAny(resource);
		subjectSequence.put("owner", user.getUserId());
		subjectSequence.put("owner_username", user.getUsername());
		super.persist(subjectSequence, user, handler);
	}

	/**
	 * @see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
	 */
	@Override
	public void update(final JsonObject resource, final UserInfos user, final Handler<Either<String, JsonObject>> handler) {
		final JsonObject subjectSequence = ResourceParser.beforeAny(resource);
		super.update(subjectSequence, user, handler);
	}

	/**
	 * Suppression logique, sur le modèle de SubjectServiceSqlImpl#removeSubjectsAndGrains (sans le
	 * détachement de dossier, un Parcours n'a pas de folder_id en phase 1, ni la suppression des items :
	 * un Parcours déjà affecté est figé, cf. spec §7-pt.5, donc son historique d'items reste consultable).
	 */
	@Override
	public void remove(final JsonArray subjectSequenceIds, final Handler<Either<String, JsonObject>> handler) {
		final String query = "UPDATE " + resourceTable + " SET is_deleted = true, modified = NOW() WHERE id IN " +
				Sql.listPrepared(subjectSequenceIds.getList());
		sql.prepared(query, new JsonArray(subjectSequenceIds.getList()), SqlResult.validRowsResultHandler(handler));
	}

	/**
	 * @see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
	 */
	@Override
	public void list(final List<String> groupsAndUserIds, final UserInfos user, final Handler<Either<String, JsonArray>> handler) {
		final JsonArray filters = new JsonArray().add("is_deleted = false");
		super.list(filters, groupsAndUserIds, user, handler);
	}

	/**
	 * @see fr.openent.exercizer.services.impl.AbstractExercizerServiceSqlImpl
	 */
	@Override
	public void getById(final String id, final UserInfos user, final Handler<Either<String, JsonObject>> handler) {
		super.getById(id, user, handler);
	}
}
