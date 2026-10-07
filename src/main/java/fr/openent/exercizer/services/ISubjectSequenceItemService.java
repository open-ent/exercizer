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

import java.util.List;

/**
 * Sujets qui composent un Parcours modèle (subject_sequence_item, ordre = order_by), calqué sur
 * {@link IGrainService} qui relie des blocs à un subject avec le même mécanisme d'order_by.
 */
public interface ISubjectSequenceItemService {

	/**
	 * Ajoute un sujet existant (subjectId) au Parcours, à un order_by donné.
	 */
	void persist(final JsonObject resource, final Long subjectSequenceId, final Handler<Either<String, JsonObject>> handler);

	/**
	 * Change le sujet et/ou l'order_by d'un item existant (réordonnancement).
	 */
	void update(final JsonObject resource, final Long id, final Long subjectSequenceId, final Handler<Either<String, JsonObject>> handler);

	/**
	 * Retrait en masse d'items du Parcours.
	 */
	void remove(final List<Long> itemIds, final Long subjectSequenceId, final Handler<Either<String, JsonObject>> handler);

	/**
	 * Liste ordonnée des items du Parcours, avec les informations du sujet référencé (titre, description,
	 * max_score) déjà jointes pour éviter un aller-retour supplémentaire côté frontend.
	 */
	void list(final Long subjectSequenceId, final Handler<Either<String, JsonArray>> handler);
}
