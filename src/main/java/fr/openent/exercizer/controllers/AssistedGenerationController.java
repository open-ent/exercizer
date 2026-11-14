package fr.openent.exercizer.controllers;

import static org.entcore.common.http.response.DefaultResponseHandler.arrayResponseHandler;

import java.util.Collections;

import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;

import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Delete;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.http.Renders;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpClient;
import io.vertx.core.http.HttpClientOptions;
import io.vertx.core.http.HttpMethod;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.http.RequestOptions;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

/**
 * Création assistée en arrière-plan (cf. sql/048-assisted-generation.sql).
 *
 * <p>Le navigateur a LU le devoir (texte du PDF ou reconnaissance de caractères) ; il confie ici
 * ce texte, et l'image des premières pages, puis rend la main à l'enseignant. Le serveur demande
 * le brouillon à l'IA du dashboard ({@code POST /dashboard/api/ai/exercizer-generate}) en relayant
 * les cookies de l'enseignant — quota et consommation sont les siens —, comme le wiki. Le brouillon
 * (ou l'erreur) est enregistré, et l'enseignant est prévenu par le fil d'actualité
 * ({@code exercizer.generated_ok} / {@code exercizer.generated_error}). Il le relit ensuite dans
 * l'écran de relecture ; rien n'est créé avant qu'il valide.</p>
 *
 * <p>Droit : celui de la création assistée ({@code SubjectController|generate}), vérifié sur la
 * session. Chacun ne voit que ses générations.</p>
 */
public class AssistedGenerationController extends ControllerHelper {

	private static final String TABLE = "exercizer.assisted_generation";
	private static final String GENERATE_ACTION = "fr.openent.exercizer.controllers.SubjectController|generate";
	/** Un modèle local sur processeur met plusieurs minutes ; au-delà, on abandonne. */
	private static final long TIMEOUT_MS = 10 * 60 * 1000L;
	/** Une génération restée « en cours » plus longtemps a été perdue (redémarrage du module). */
	private static final String STALE = "15 minutes";
	private static final int MAX_PENDING = 3;

	private final HttpClient client;
	private final String endpoint;

	public AssistedGenerationController(final Vertx vertx, final JsonObject config) {
		this.client = vertx.createHttpClient(new HttpClientOptions().setKeepAlive(false));
		final String dashboard = config.getString("ai-dashboard-url", config.getString("host", "http://localhost"));
		this.endpoint = dashboard.replaceAll("/+$", "") + "/dashboard/api/ai/exercizer-generate";
	}

	@Post("/assisted-generations")
	@ApiDoc("Starts an assisted generation in the background and returns its id at once.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void start(final HttpServerRequest request) {
		withGenerator(request, user -> RequestUtils.bodyToJson(request, body -> {
			final JsonArray lines = body.getJsonArray("lines", new JsonArray());
			if (lines.isEmpty()) {
				badRequest(request, "exercizer.digitize.error.empty");
				return;
			}
			final String cookies = request.headers().get("Cookie");
			final String locale = body.getString("locale", "fr");
			final JsonObject input = new JsonObject()
					.put("source", body.getJsonArray("source", new JsonArray()))
					.put("figures", body.getJsonArray("figures", new JsonArray()));
			Sql.getInstance().prepared(
					"SELECT count(*) AS pending FROM " + TABLE + " WHERE owner = ? AND status = 'pending' AND created > NOW() - INTERVAL '" + STALE + "'",
					new JsonArray().add(user.getUserId()),
					SqlResult.validUniqueResultHandler(count -> {
						if (count.isLeft()) {
							renderError(request);
							return;
						}
						if (count.right().getValue().getLong("pending", 0L) >= MAX_PENDING) {
							Renders.renderJson(request, new JsonObject().put("error", "exercizer.assisted.error.busy"), 429);
							return;
						}
						Sql.getInstance().prepared(
								"INSERT INTO " + TABLE + " (owner, title, folder_id, document_id, document_name, input) " +
										"VALUES (?, ?, ?, ?, ?, ?::jsonb) RETURNING id, title, status, created",
								new JsonArray()
										.add(user.getUserId())
										.add(trim(body.getString("title"), 255))
										.add(body.getValue("folderId") instanceof Number ? body.getLong("folderId") : null)
										.add(trim(body.getString("documentId"), 36))
										.add(trim(body.getString("documentName"), 255))
										.add(input.encode()),
								SqlResult.validUniqueResultHandler(inserted -> {
									if (inserted.isLeft()) {
										renderError(request);
										return;
									}
									final JsonObject generation = inserted.right().getValue();
									Renders.renderJson(request, generation, 201);
									final JsonObject payload = new JsonObject()
											.put("lines", lines)
											.put("images", body.getJsonArray("images", new JsonArray()))
											.put("locale", locale);
									generate(request, user, generation.getLong("id"), generation.getString("title"), payload, cookies);
								}));
					}));
		}));
	}

	@Get("/assisted-generations")
	@ApiDoc("Lists the current user's assisted generations, without their drafts.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void list(final HttpServerRequest request) {
		withGenerator(request, user -> Sql.getInstance().prepared(
				"SELECT id, title, document_name, " + statusColumn() + ", error, created, modified FROM " + TABLE +
						" WHERE owner = ? ORDER BY created DESC",
				new JsonArray().add(user.getUserId()), SqlResult.validResultHandler(arrayResponseHandler(request))));
	}

	@Get("/assisted-generations/:id")
	@ApiDoc("Returns one of the current user's assisted generations, with its draft.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void get(final HttpServerRequest request) {
		final Long id = idParam(request);
		if (id == null) return;
		withGenerator(request, user -> Sql.getInstance().prepared(
				"SELECT id, title, folder_id, document_id, document_name, " + statusColumn() +
						", input, draft, error, created, modified FROM " + TABLE + " WHERE id = ? AND owner = ?",
				new JsonArray().add(id).add(user.getUserId()),
				SqlResult.validUniqueResultHandler(result -> {
					if (result.isLeft()) {
						renderError(request);
					} else if (result.right().getValue().isEmpty()) {
						notFound(request);
					} else {
						final JsonObject generation = result.right().getValue();
						// Les colonnes JSONB reviennent en texte : rendues en objets.
						for (final String column : new String[] { "input", "draft" }) {
							final Object value = generation.getValue(column);
							if (value instanceof String) generation.put(column, new JsonObject((String) value));
						}
						Renders.renderJson(request, generation);
					}
				})));
	}

	@Delete("/assisted-generations/:id")
	@ApiDoc("Deletes one of the current user's assisted generations.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void remove(final HttpServerRequest request) {
		final Long id = idParam(request);
		if (id == null) return;
		UserUtils.getUserInfos(eb, request, user -> {
			if (user == null) {
				unauthorized(request);
				return;
			}
			Sql.getInstance().prepared("DELETE FROM " + TABLE + " WHERE id = ? AND owner = ?",
					new JsonArray().add(id).add(user.getUserId()),
					SqlResult.validRowsResultHandler(result -> {
						if (result.isLeft()) renderError(request);
						else Renders.noContent(request);
					}));
		});
	}

	// ── La génération, en arrière-plan ─────────────────────────────────────────

	private void generate(final HttpServerRequest request, final UserInfos user, final Long id, final String title,
			final JsonObject payload, final String cookies) {
		final RequestOptions options = new RequestOptions()
				.setMethod(HttpMethod.POST)
				.setAbsoluteURI(endpoint)
				.setTimeout(TIMEOUT_MS)
				.putHeader("Content-Type", "application/json")
				.putHeader("Accept", "application/json");
		if (cookies != null) options.putHeader("Cookie", cookies);
		final String userAgent = request.headers().get("User-Agent");
		if (userAgent != null) options.putHeader("User-Agent", userAgent);

		client.request(options)
				.compose(req -> req.send(payload.encode()))
				.compose(resp -> resp.body().map(buffer -> {
					JsonObject json;
					try {
						json = buffer.toJsonObject();
					} catch (Exception e) {
						throw new IllegalStateException("HTTP " + resp.statusCode());
					}
					if (resp.statusCode() != 200) {
						throw new IllegalStateException(json.getString("error", "HTTP " + resp.statusCode()));
					}
					return json;
				}))
				.onSuccess(draft -> finish(request, user, id, title, "ready", draft, null))
				.onFailure(error -> {
					log.error("[Exercizer] Création assistée " + id + " impossible", error);
					finish(request, user, id, title, "error", null, error.getMessage());
				});
	}

	private void finish(final HttpServerRequest request, final UserInfos user, final Long id, final String title,
			final String status, final JsonObject draft, final String error) {
		Sql.getInstance().prepared(
				"UPDATE " + TABLE + " SET status = ?, draft = ?::jsonb, error = ?, modified = NOW() WHERE id = ?",
				new JsonArray().add(status).add(draft == null ? null : draft.encode()).add(trim(error, 2000)).add(id),
				SqlResult.validRowsResultHandler(updated -> {
					if (updated.isLeft()) {
						log.error("[Exercizer] Création assistée " + id + " : résultat non enregistré " + updated.left().getValue());
						return;
					}
					final JsonObject params = new JsonObject()
							.put("exerciseGeneratedUri", pathPrefix + "#/subject/generate/" + id)
							.put("subjectTitle", title == null || title.isEmpty() ? "…" : title)
							.put("disableAntiFlood", true);
					notification.notifyTimeline(request, "exercizer.generated_" + ("ready".equals(status) ? "ok" : "error"),
							user, Collections.singletonList(user.getUserId()), params);
				}));
	}

	// ── Garde-fous ──────────────────────────────────────────────────────────────

	/** Une génération « en cours » depuis trop longtemps a été perdue : elle est rendue en erreur. */
	private static String statusColumn() {
		return "CASE WHEN status = 'pending' AND created < NOW() - INTERVAL '" + STALE + "' THEN 'error' ELSE status END AS status";
	}

	private void withGenerator(final HttpServerRequest request, final Handler<UserInfos> action) {
		UserUtils.getUserInfos(eb, request, user -> {
			if (user == null) {
				unauthorized(request);
			} else if (user.getAuthorizedActions() == null ||
					user.getAuthorizedActions().stream().noneMatch(a -> GENERATE_ACTION.equals(a.getName()))) {
				unauthorized(request);
			} else {
				action.handle(user);
			}
		});
	}

	private Long idParam(final HttpServerRequest request) {
		try {
			return Long.parseLong(request.params().get("id"));
		} catch (NumberFormatException e) {
			badRequest(request);
			return null;
		}
	}

	private static String trim(final String value, final int max) {
		if (value == null) return null;
		final String trimmed = value.trim();
		return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
	}
}
