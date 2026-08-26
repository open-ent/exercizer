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

import fr.openent.exercizer.services.ISubjectSequenceScheduledService;
import fr.wseduc.webutils.Either;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.sql.SqlStatementsBuilder;
import org.entcore.common.user.UserInfos;
import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.Promise;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

public class SubjectSequenceScheduledServiceSqlImpl extends AbstractExercizerServiceSqlImpl implements ISubjectSequenceScheduledService {

	public SubjectSequenceScheduledServiceSqlImpl() {
		super("exercizer", "subject_sequence_scheduled");
	}

	/**
	 * Titre/description copiés du modèle au moment de l'affectation, comme subject_scheduled.title l'est
	 * déjà de subject.title (cf. SubjectScheduledServiceSqlImpl#createScheduledSubject, même patron
	 * INSERT ... SELECT ... FROM subject_sequence WHERE id=?).
	 */
	@Override
	public void createHeader(final Long subjectSequenceId, final UserInfos user, final Handler<Either<String, JsonObject>> handler) {
		final String query = "INSERT INTO " + resourceTable + " (subject_sequence_id, owner, owner_username, title, description) " +
				"SELECT ?, ?, ?, seq.title, seq.description FROM " + schema + "subject_sequence AS seq " +
				"WHERE seq.id = ? AND seq.is_deleted = false RETURNING id, title, description";

		final SqlStatementsBuilder s = new SqlStatementsBuilder();
		final String userQuery = "SELECT " + schema + "merge_users(?,?)";
		s.prepared(userQuery, new JsonArray().add(user.getUserId()).add(user.getUsername()));
		s.prepared(query, new JsonArray().add(subjectSequenceId).add(user.getUserId()).add(user.getUsername()).add(subjectSequenceId));

		sql.transaction(s.build(), SqlResult.validUniqueResultHandler(1, handler));
	}

	@Override
	public void attachChild(final Long subjectSequenceScheduledId, final Long subjectScheduledId, final Integer orderBy, final Handler<Either<String, JsonObject>> handler) {
		final String query = "UPDATE " + schema + "subject_scheduled SET subject_sequence_scheduled_id = ?, sequence_order_by = ? WHERE id = ? RETURNING id";
		sql.prepared(query, new JsonArray().add(subjectSequenceScheduledId).add(orderBy).add(subjectScheduledId), SqlResult.validUniqueResultHandler(handler));
	}

	@Override
	public void refreshDates(final Long subjectSequenceScheduledId, final Handler<Either<String, JsonObject>> handler) {
		final String query = "UPDATE " + resourceTable + " AS h SET begin_date = agg.min_begin, due_date = agg.max_due, modified = NOW() " +
				"FROM (SELECT MIN(begin_date) AS min_begin, MAX(due_date) AS max_due FROM " + schema + "subject_scheduled " +
				"WHERE subject_sequence_scheduled_id = ?) AS agg " +
				"WHERE h.id = ? RETURNING h.id, h.begin_date, h.due_date";
		sql.prepared(query, new JsonArray().add(subjectSequenceScheduledId).add(subjectSequenceScheduledId), SqlResult.validUniqueResultHandler(handler));
	}

	/**
	 * Header + liste ordonnée des subject_scheduled enfants (mêmes champs que GET /subjects-scheduled,
	 * filtrés par subject_sequence_scheduled_id, cf. spec §3.2).
	 */
	@Override
	public void getById(final String id, final Handler<Either<String, JsonObject>> handler) {
		final String query = "SELECT to_jsonb(h.*) AS header, COALESCE(jsonb_agg(jsonb_build_object(" +
				"'id', ss.id, 'subjectId', ss.subject_id, 'title', ss.title, 'sequenceOrderBy', ss.sequence_order_by, " +
				"'beginDate', ss.begin_date, 'dueDate', ss.due_date, 'isOver', ss.is_over" +
				") ORDER BY ss.sequence_order_by) FILTER (WHERE ss.id IS NOT NULL), '[]'::jsonb) AS children " +
				"FROM " + resourceTable + " AS h " +
				"LEFT JOIN " + schema + "subject_scheduled AS ss ON ss.subject_sequence_scheduled_id = h.id " +
				"WHERE h.id = ? GROUP BY h.id";

		sql.prepared(query, new JsonArray().add(Sql.parseId(id)), SqlResult.validUniqueResultHandler(handler, "header", "children"));
	}

	@Override
	public Future<JsonArray> getChildrenIds(final Long subjectSequenceScheduledId) {
		final Promise<JsonArray> promise = Promise.promise();
		final String query = "SELECT id FROM " + schema + "subject_scheduled WHERE subject_sequence_scheduled_id = ?";
		sql.prepared(query, new JsonArray().add(subjectSequenceScheduledId), SqlResult.validResultHandler(res -> {
			if (res.isRight()) {
				promise.complete(res.right().getValue());
			} else {
				promise.fail(res.left().getValue());
			}
		}));
		return promise.future();
	}

	@Override
	public Future<Void> unSchedule(final Long subjectSequenceScheduledId) {
		final Promise<Void> promise = Promise.promise();
		final String query = "DELETE FROM " + resourceTable + " WHERE id = ?";
		// sql.prepared() (une seule requête, pas une transaction multi-statements) : le résultat porte
		// "rows" à la racine du corps de réponse, pas dans un tableau "results" indexé - la surcharge à
		// index (idx=1) est réservée à sql.transaction()/plusieurs statements et était systématiquement
		// hors limites ici (une seule requête = un seul résultat, à l'index 0 au mieux), d'où un échec
		// "missing.result" à chaque appel, indépendamment du succès réel du DELETE. Bug trouvé en
		// vérifiant DELETE /unschedule-subject-sequence/:id le 2026-08-26.
		sql.prepared(query, new JsonArray().add(subjectSequenceScheduledId), SqlResult.validRowsResultHandler(result -> {
			if (result.isRight()) {
				promise.complete();
			} else {
				promise.fail(result.left().getValue());
			}
		}));
		return promise.future();
	}

	/**
	 * Pour chaque élève : nombre d'items soumis/corrigés (mêmes colonnes que
	 * SubjectCopyController#checkCorrection, subject_copy.submitted_date/is_corrected) et score moyen
	 * (moyenne simple des final_score déjà corrigés, cf. spec §5.1 et décision §7-pt.6 : les items non
	 * encore corrigés — final_score NULL — sont ignorés par AVG plutôt que comptés comme 0).
	 */
	@Override
	public void getProgress(final String id, final Handler<Either<String, JsonObject>> handler) {
		final String query = "SELECT (SELECT COUNT(*) FROM " + schema + "subject_scheduled WHERE subject_sequence_scheduled_id = ?) AS total_items, " +
				"COALESCE(jsonb_agg(jsonb_build_object(" +
				"'studentId', t.owner, 'studentName', t.owner_username, " +
				"'submittedItems', t.submitted_items, 'correctedItems', t.corrected_items, 'averageScore', t.average_score" +
				")) FILTER (WHERE t.owner IS NOT NULL), '[]'::jsonb) AS students " +
				"FROM (" +
				"  SELECT sc.owner, sc.owner_username, " +
				"    COUNT(CASE WHEN sc.submitted_date IS NOT NULL THEN 1 END) AS submitted_items, " +
				"    COUNT(CASE WHEN sc.is_corrected THEN 1 END) AS corrected_items, " +
				"    AVG(sc.final_score) AS average_score " +
				"  FROM " + schema + "subject_scheduled AS ss " +
				"  INNER JOIN " + schema + "subject_copy AS sc ON sc.subject_scheduled_id = ss.id AND NOT sc.is_training_copy " +
				"  WHERE ss.subject_sequence_scheduled_id = ? " +
				"  GROUP BY sc.owner, sc.owner_username" +
				") AS t";

		sql.prepared(query, new JsonArray().add(Sql.parseId(id)).add(Sql.parseId(id)), SqlResult.validUniqueResultHandler(handler, "students"));
	}
}
