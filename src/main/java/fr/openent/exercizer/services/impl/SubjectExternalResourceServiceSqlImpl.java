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

import fr.openent.exercizer.services.ISubjectExternalResourceService;
import fr.wseduc.webutils.Either;
import org.entcore.common.sql.SqlResult;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

public class SubjectExternalResourceServiceSqlImpl extends AbstractExercizerServiceSqlImpl implements ISubjectExternalResourceService {

	public SubjectExternalResourceServiceSqlImpl() {
		super("exercizer", "subject_external_resource");
	}

	@Override
	public void persist(final Long subjectId, final String fileId, final String title, final String sourceUrl,
						 final String contentType, final Long size, final String userId,
						 final Handler<Either<String, JsonObject>> handler) {
		final String query = "INSERT INTO " + resourceTable +
				"(subject_id, file_id, title, source_url, content_type, size, owner) VALUES (?,?,?,?,?,?,?) RETURNING *";
		sql.prepared(query, new JsonArray().add(subjectId).add(fileId).add(title).add(sourceUrl)
				.add(contentType).add(size).add(userId), SqlResult.validUniqueResultHandler(handler));
	}

	@Override
	public void list(final Long subjectId, final Handler<Either<String, JsonArray>> handler) {
		final String query = "SELECT * FROM " + resourceTable + " WHERE subject_id = ? ORDER BY created";
		sql.prepared(query, new JsonArray().add(subjectId), SqlResult.validResultHandler(handler));
	}

	@Override
	public void getById(final Long resourceId, final Long subjectId, final Handler<Either<String, JsonObject>> handler) {
		final String query = "SELECT * FROM " + resourceTable + " WHERE id = ? AND subject_id = ?";
		sql.prepared(query, new JsonArray().add(resourceId).add(subjectId), SqlResult.validUniqueResultHandler(handler));
	}

	@Override
	public void remove(final Long resourceId, final Long subjectId, final Handler<Either<String, JsonObject>> handler) {
		final String query = "DELETE FROM " + resourceTable + " WHERE id = ? AND subject_id = ? RETURNING *";
		sql.prepared(query, new JsonArray().add(resourceId).add(subjectId), SqlResult.validUniqueResultHandler(handler));
	}

	@Override
	public void rename(final Long resourceId, final Long subjectId, final String title, final Handler<Either<String, JsonObject>> handler) {
		final String query = "UPDATE " + resourceTable + " SET title = ? WHERE id = ? AND subject_id = ? RETURNING *";
		sql.prepared(query, new JsonArray().add(title).add(resourceId).add(subjectId), SqlResult.validUniqueResultHandler(handler));
	}
}
