package fr.openent.exercizer.services.impl;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;

import java.util.Collections;

/**
 * Site public d'entraînement (cf. sql/050-public-practice.sql) : sujets publiés hors connexion et
 * tentatives d'entraînement libre.
 *
 * Un sujet est PUBLIC s'il est au catalogue, publié par un modérateur ({@code is_public}) et, s'il vient
 * d'un pack, si ce pack est offert à tous : un pack réservé aux établissements abonnés n'est jamais
 * montré, même marqué.
 */
public class PracticeServiceSqlImpl {

	private static final String S = "exercizer.";
	/** Nombre de tentatives renvoyées à l'usager. */
	private static final int ATTEMPTS_LIMIT = 200;

	private final Sql sql = Sql.getInstance();
	private final CatalogServiceSqlImpl catalog = new CatalogServiceSqlImpl();

	/** La condition « sujet public » sur {@code s}, sans paramètre. */
	static String publicGuard() {
		return "s.is_library_subject = true AND s.is_deleted = false AND s.is_public = true"
				+ CatalogSql.packAccessGuard(Collections.emptyList(), new JsonArray());
	}

	/** Le sujet public, ses grains (bruts, avec les réponses) et ses sections : à expurger par l'appelant. */
	public void subject(final Long id, final Handler<Either<String, JsonObject>> handler) {
		isPublic(id, isPublic -> {
			if (!isPublic) {
				handler.handle(new Either.Left<>("not.found"));
			} else {
				catalog.get(id, Collections.emptyList(), handler);
			}
		});
	}

	/** Les grains d'un sujet public, pour la correction. */
	public void referenceGrains(final Long id, final Handler<Either<String, JsonArray>> handler) {
		sql.prepared("SELECT g.id, g.grain_type_id, g.grain_data FROM " + S + "grain AS g JOIN " + S +
						"subject AS s ON s.id = g.subject_id WHERE s.id = ? AND " + publicGuard() +
						" ORDER BY g.order_by, g.id",
				new JsonArray().add(id), SqlResult.validResultHandler(handler));
	}

	public void isPublic(final Long id, final Handler<Boolean> handler) {
		sql.prepared("SELECT 1 FROM " + S + "subject AS s WHERE s.id = ? AND " + publicGuard(),
				new JsonArray().add(id), SqlResult.validResultHandler(event ->
						handler.handle(event.isRight() && !event.right().getValue().isEmpty())));
	}

	/**
	 * Le document de l'espace documentaire est-il cité par un sujet public (énoncé, grain, image) ?
	 * Seule condition pour le servir hors connexion : un id qui n'apparaît dans aucun sujet public
	 * reste privé. {@code docId} doit avoir été validé (uuid) par l'appelant.
	 */
	public void isPublicMedia(final String docId, final Handler<Boolean> handler) {
		final String pattern = "%/workspace/document/" + docId + "%";
		sql.prepared("SELECT 1 FROM " + S + "subject AS s WHERE " + publicGuard() + " AND (s.picture LIKE ? " +
						"OR s.description LIKE ? OR EXISTS (SELECT 1 FROM " + S + "grain AS g WHERE g.subject_id = s.id " +
						"AND g.grain_data LIKE ?)) LIMIT 1",
				new JsonArray().add(pattern).add(pattern).add(pattern), SqlResult.validResultHandler(event ->
						handler.handle(event.isRight() && !event.right().getValue().isEmpty())));
	}

	/** Les sujets publics pour le plan du site : id, titre, date de modification. */
	public void sitemap(final Handler<Either<String, JsonArray>> handler) {
		sql.raw("SELECT s.id, s.title, s.modified FROM " + S + "subject AS s WHERE " + publicGuard() +
				" ORDER BY s.id", SqlResult.validResultHandler(handler));
	}

	/** Publie ou retire un sujet DU CATALOGUE du site public. */
	public void setPublic(final Long id, final boolean value, final Handler<Either<String, JsonObject>> handler) {
		sql.prepared("UPDATE " + S + "subject SET is_public = ? WHERE id = ? AND is_library_subject = true " +
						"AND is_deleted = false RETURNING id, is_public",
				new JsonArray().add(value).add(id), SqlResult.validUniqueResultHandler(event -> {
					if (event.isRight() && event.right().getValue().isEmpty()) {
						handler.handle(new Either.Left<>("not.found"));
					} else {
						handler.handle(event);
					}
				}));
	}

	public void recordAttempt(final String userId, final Long subjectId, final double score, final double maxScore,
							  final JsonArray answers, final Handler<Either<String, JsonObject>> handler) {
		sql.prepared("INSERT INTO " + S + "practice_attempt (user_id, subject_id, score, max_score, answers) " +
						"VALUES (?, ?, ?, ?, ?::jsonb) RETURNING id, created",
				new JsonArray().add(userId).add(subjectId).add(score).add(maxScore).add(answers.encode()),
				SqlResult.validUniqueResultHandler(handler));
	}

	/** Les tentatives de l'usager, les plus récentes d'abord, avec le titre et les rattachements du sujet. */
	public void attempts(final String userId, final Handler<Either<String, JsonArray>> handler) {
		sql.prepared("SELECT a.id, a.subject_id, s.title, a.score, a.max_score, a.created, " +
						"COALESCE((SELECT json_agg(al.cfitem_id) FROM " + S + "subject_alignment AS al " +
						"WHERE al.subject_id = a.subject_id), '[]'::json) AS cfitem_ids " +
						"FROM " + S + "practice_attempt AS a JOIN " + S + "subject AS s ON s.id = a.subject_id " +
						"WHERE a.user_id = ? ORDER BY a.created DESC LIMIT " + ATTEMPTS_LIMIT,
				new JsonArray().add(userId), SqlResult.validResultHandler(handler, "cfitem_ids"));
	}
}
