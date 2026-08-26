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

import fr.openent.exercizer.services.ISubjectSequenceItemService;
import fr.wseduc.webutils.Either;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.sql.SqlStatementsBuilder;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.util.List;

/**
 * @see fr.openent.exercizer.services.impl.GrainServiceSqlImpl GrainServiceSqlImpl (patron direct : items
 * ordonnés (order_by) rattachés à un parent, ici subject_sequence au lieu de subject).
 */
public class SubjectSequenceItemServiceSqlImpl extends AbstractExercizerServiceSqlImpl implements ISubjectSequenceItemService {

	public SubjectSequenceItemServiceSqlImpl() {
		super("exercizer", "subject_sequence_item");
	}

	@Override
	public void persist(final JsonObject resource, final Long subjectSequenceId, final Handler<Either<String, JsonObject>> handler) {
		final String query = "INSERT INTO " + resourceTable + "(subject_sequence_id, subject_id, order_by) VALUES (?,?,?) RETURNING id";

		final SqlStatementsBuilder s = new SqlStatementsBuilder();
		s.prepared(query, new JsonArray().add(subjectSequenceId).add(resource.getLong("subjectId")).add(resource.getInteger("orderBy")));
		touchSubjectSequence(s, subjectSequenceId);

		sql.transaction(s.build(), SqlResult.validUniqueResultHandler(0, handler));
	}

	@Override
	public void update(final JsonObject resource, final Long id, final Long subjectSequenceId, final Handler<Either<String, JsonObject>> handler) {
		// RETURNING id nécessaire : validUniqueResultHandler(0, handler) attend une ligne de résultat sur
		// cette 1re requête de la transaction, or un UPDATE sans RETURNING n'en renvoie aucune. Sans ce
		// correctif, tout appel à cette route (réordonnancement des items du Parcours depuis le frontend,
		// boutons monter/descendre) échoue systématiquement en Left, alors que persist() (juste au-dessus)
		// a bien son RETURNING id. Bug trouvé en implémentant le frontend consommateur de cette route (cf.
		// rapport de tâche), corrigé a minima par symétrie avec persist().
		final String query = "UPDATE " + resourceTable + " SET subject_id=?, order_by=? WHERE id=? AND subject_sequence_id=? RETURNING id";

		final SqlStatementsBuilder s = new SqlStatementsBuilder();
		s.prepared(query, new JsonArray().add(resource.getLong("subjectId")).add(resource.getInteger("orderBy")).add(id).add(subjectSequenceId));
		touchSubjectSequence(s, subjectSequenceId);

		sql.transaction(s.build(), SqlResult.validUniqueResultHandler(0, handler));
	}

	@Override
	public void remove(final List<Long> itemIds, final Long subjectSequenceId, final Handler<Either<String, JsonObject>> handler) {
		final String query = "DELETE FROM " + resourceTable + " WHERE subject_sequence_id = ? AND id IN " + Sql.listPrepared(itemIds.toArray());

		final SqlStatementsBuilder s = new SqlStatementsBuilder();
		final JsonArray values = new JsonArray();
		values.add(subjectSequenceId);
		values.addAll(new JsonArray(itemIds));
		s.prepared(query, values);
		touchSubjectSequence(s, subjectSequenceId);

		sql.transaction(s.build(), SqlResult.validRowsResultHandler(1, handler));
	}

	private void touchSubjectSequence(final SqlStatementsBuilder s, final Long subjectSequenceId) {
		s.prepared("UPDATE " + schema + "subject_sequence SET modified = NOW() WHERE id=?", new JsonArray().add(subjectSequenceId));
	}

	/**
	 * Jointure sur subject pour renvoyer directement titre/description/max_score du sujet référencé
	 * (évite un aller-retour supplémentaire côté frontend pour afficher la liste ordonnée du Parcours).
	 */
	@Override
	public void list(final Long subjectSequenceId, final Handler<Either<String, JsonArray>> handler) {
		final String query = "SELECT si.id, si.subject_sequence_id, si.subject_id, si.order_by, " +
				"s.title AS subject_title, s.description AS subject_description, s.max_score AS subject_max_score " +
				"FROM " + resourceTable + " AS si " +
				"INNER JOIN " + schema + "subject AS s ON s.id = si.subject_id " +
				"WHERE si.subject_sequence_id = ? ORDER BY si.order_by";

		sql.prepared(query, new JsonArray().add(subjectSequenceId), SqlResult.validResultHandler(handler));
	}
}
