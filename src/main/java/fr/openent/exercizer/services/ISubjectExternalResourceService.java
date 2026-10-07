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
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

// D4 (import de contenu externe, CCTP AO ENT ÉCLAT-BFC MOD03) : ressource externe téléchargée côté
// serveur et rattachée à un sujet, cf. sql/038-add-subject-external-resource.sql.
public interface ISubjectExternalResourceService {

	void persist(Long subjectId, String fileId, String title, String sourceUrl, String contentType, Long size,
				 String userId, Handler<Either<String, JsonObject>> handler);

	void list(Long subjectId, Handler<Either<String, JsonArray>> handler);

	void getById(Long resourceId, Long subjectId, Handler<Either<String, JsonObject>> handler);

	void remove(Long resourceId, Long subjectId, Handler<Either<String, JsonObject>> handler);

	void rename(Long resourceId, Long subjectId, String title, Handler<Either<String, JsonObject>> handler);
}
