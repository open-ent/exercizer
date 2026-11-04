package fr.openent.exercizer.controllers;

import static org.entcore.common.http.response.DefaultResponseHandler.defaultResponseHandler;

import fr.openent.exercizer.services.ICatalogService;
import fr.openent.exercizer.services.impl.CatalogServiceSqlImpl;
import fr.openent.exercizer.utils.SchoolLevels;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Delete;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.rs.Put;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.Either;
import fr.wseduc.webutils.http.Renders;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.filter.ResourceFilter;
import org.entcore.common.http.filter.sql.OwnerOnly;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.neo4j.Neo4jResult;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;

/**
 * Catalogue d'exercices partagé entre établissements, classement des sujets par niveau et matière
 * (cf. sql/041-subject-catalog.sql) et rattachement aux programmes officiels (référentiels CASE).
 *
 * Droits : on s'appuie sur les droits « workflow » DÉJÀ attribués, pour que le catalogue fonctionne
 * sans reprendre la gestion des accès de chaque établissement :
 *  - consulter et copier = pouvoir créer un sujet ({@code SubjectController|persist}) ET ne pas être
 *    élève ni parent. Un sujet du catalogue porte ses réponses attendues, il ne doit jamais atteindre
 *    un élève — or des établissements attribuent le rôle « Gestion » (qui contient {@code persist})
 *    à leurs groupes d'élèves : le droit seul ne suffit pas ;
 *  - publier = le droit de publication en bibliothèque ({@code SubjectController|publish}) ;
 *  - retirer ou reclasser un sujet du catalogue = en être l'auteur, ou détenir le seul droit neuf,
 *    {@code exercizer.catalog.manage} (modération, à attribuer dans la console d'administration).
 */
public class CatalogController extends ControllerHelper {

	private static final String CREATE_ACTION = "fr.openent.exercizer.controllers.SubjectController|persist";
	private static final String PUBLISH_ACTION = "fr.openent.exercizer.controllers.SubjectController|publish";
	private static final String MANAGE_ACTION = "fr.openent.exercizer.controllers.CatalogController|manage";

	private final ICatalogService catalogService = new CatalogServiceSqlImpl();

	@Get("/catalog/manage")
	@ApiDoc("Declares the catalog moderation right (remove or reclassify any catalog subject).")
	@SecuredAction("exercizer.catalog.manage")
	public void manage(final HttpServerRequest request) {
		renderJson(request, new JsonObject().put("manage", true));
	}

	@Get("/catalog/referential")
	@ApiDoc("Lists school levels (in schooling order) and disciplines.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void referential(final HttpServerRequest request) {
		catalogService.referential(defaultResponseHandler(request));
	}

	@Get("/catalog/subjects")
	@ApiDoc("Searches the catalog: q, levels and disciplines (comma-separated ids), programme and node "
			+ "(CASE framework and item, descendants included unless direct=true; __none__ = not aligned), limit, offset.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void list(final HttpServerRequest request) {
		withAction(request, CREATE_ACTION, user -> {
			final JsonObject criteria = criteria(request, user)
					.put("programme", request.params().get("programme"))
					.put("node", request.params().get("node"))
					.put("direct", "true".equals(request.params().get("direct")));
			final Integer limit = intParam(request.params().get("limit"));
			final Integer offset = intParam(request.params().get("offset"));
			if (limit != null) criteria.put("limit", limit);
			if (offset != null) criteria.put("offset", offset);
			catalogService.list(criteria, defaultResponseHandler(request));
		});
	}

	@Get("/catalog/context")
	@ApiDoc("Gets the school levels served by the user's structures: {schoolLevels, source}.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void context(final HttpServerRequest request) {
		withAction(request, CREATE_ACTION, user -> {
			// Les niveaux choisis par l'administrateur de chaque établissement (identité de
			// l'établissement), sinon ceux de sa nature AAF : un établissement privé peut servir
			// primaire, collège et lycée.
			final String query = "MATCH (s:Structure) WHERE s.id IN $ids " +
					"RETURN s.schoolLevels as schoolLevels, s.type as type";
			Neo4j.getInstance().execute(query, new JsonObject().put("ids", new JsonArray(user.getStructures())),
					Neo4jResult.validResultHandler(event -> {
						if (event.isRight()) {
							renderJson(request, SchoolLevels.resolve(event.right().getValue()));
						} else {
							renderError(request, new JsonObject().put("error", event.left().getValue()));
						}
					}));
		});
	}

	@Get("/catalog/facets")
	@ApiDoc("Counts catalog subjects per (level, discipline) pair, under the search criteria (q, levels, disciplines).")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void facets(final HttpServerRequest request) {
		withAction(request, CREATE_ACTION, user ->
				catalogService.facets(criteria(request, user), defaultResponseHandler(request)));
	}

	@Get("/catalog/programmes")
	@ApiDoc("Lists the published curricula (CASE frameworks of the case module) with their aligned subject count.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void programmes(final HttpServerRequest request) {
		withAction(request, CREATE_ACTION, user ->
				catalogService.programmes(criteria(request, user), defaultResponseHandler(request)));
	}

	@Get("/catalog/programmes/:id/tree")
	@ApiDoc("Gets a curriculum tree with subject counts under the search criteria; full=true keeps empty branches.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void programmeTree(final HttpServerRequest request) {
		withAction(request, CREATE_ACTION, user -> catalogService.programmeTree(request.params().get("id"),
				"true".equals(request.params().get("full")), criteria(request, user), notFoundOr(request)));
	}

	@Get("/catalog/objectives")
	@ApiDoc("Searches curriculum items by code or statement (q), with the count of catalog subjects aligned to "
			+ "each or its descendants under the criteria (levels, disciplines); programme restricts to one curriculum.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void objectives(final HttpServerRequest request) {
		withAction(request, CREATE_ACTION, user -> catalogService.objectives(request.params().get("q"),
				request.params().get("programme"), criteria(request, user), defaultResponseHandler(request)));
	}

	@Get("/catalog/programmes/:id/suggestions")
	@ApiDoc("Suggests curriculum items for a subject: levels and disciplines (comma-separated ids), text.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void suggestions(final HttpServerRequest request) {
		withAction(request, CREATE_ACTION, user -> catalogService.suggestions(request.params().get("id"),
				idList(request.params().get("levels")), idList(request.params().get("disciplines")),
				request.params().get("text"), defaultResponseHandler(request)));
	}

	@Get("/catalog/subject/:id")
	@ApiDoc("Gets a catalog subject with its grains and sections.")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void get(final HttpServerRequest request) {
		final Long id = idParam(request, "id");
		if (id == null) return;
		withAction(request, CREATE_ACTION, user -> catalogService.get(id, user.getStructures(), notFoundOr(request)));
	}

	@Post("/catalog/subject/:id/copy")
	@ApiDoc("Copies a catalog subject into the user's subjects (optional folder_id).")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void copy(final HttpServerRequest request) {
		final Long id = idParam(request, "id");
		if (id == null) return;
		withAction(request, CREATE_ACTION, user -> RequestUtils.bodyToJson(request, body -> {
			final Object folder = body.getValue("folder_id");
			final Long folderId = folder instanceof Number ? ((Number) folder).longValue() : null;
			catalogService.copy(id, folderId, user, notFoundOr(request));
		}));
	}

	@Put("/catalog/subject/:id/classification")
	@ApiDoc("Reclassifies a catalog subject (its author or a catalog moderator).")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void reclassify(final HttpServerRequest request) {
		final Long id = idParam(request, "id");
		if (id == null) return;
		withCatalogAuthorOrModerator(request, id, () -> RequestUtils.bodyToJson(request, body ->
				catalogService.setClassification(id, ids(body, "level_ids"), ids(body, "discipline_ids"),
						alignmentIds(body), defaultResponseHandler(request))));
	}

	@Delete("/catalog/subject/:id")
	@ApiDoc("Removes a subject from the catalog (its author or a catalog moderator).")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void remove(final HttpServerRequest request) {
		final Long id = idParam(request, "id");
		if (id == null) return;
		withCatalogAuthorOrModerator(request, id, () -> catalogService.remove(id, event -> {
			if (event.isRight()) {
				Renders.noContent(request);
			} else {
				renderError(request);
			}
		}));
	}

	@Get("/subject/:id/classification")
	@ApiDoc("Gets the levels and disciplines of one of the user's subjects.")
	@ResourceFilter(OwnerOnly.class)
	@SecuredAction(value = "", type = ActionType.RESOURCE)
	public void classification(final HttpServerRequest request) {
		final Long id = idParam(request, "id");
		if (id == null) return;
		catalogService.classification(id, defaultResponseHandler(request));
	}

	@Put("/subject/:id/classification")
	@ApiDoc("Sets the levels and disciplines of one of the user's subjects.")
	@ResourceFilter(OwnerOnly.class)
	@SecuredAction(value = "", type = ActionType.RESOURCE)
	public void classify(final HttpServerRequest request) {
		final Long id = idParam(request, "id");
		if (id == null) return;
		RequestUtils.bodyToJson(request, body -> catalogService.setClassification(id, ids(body, "level_ids"),
				ids(body, "discipline_ids"), alignmentIds(body), defaultResponseHandler(request)));
	}

	@Post("/subject/:id/catalog")
	@ApiDoc("Publishes a copy of one of the user's subjects in the catalog, with at least one level and one discipline.")
	@ResourceFilter(OwnerOnly.class)
	@SecuredAction(value = "", type = ActionType.RESOURCE)
	public void publish(final HttpServerRequest request) {
		final Long id = idParam(request, "id");
		if (id == null) return;
		withAction(request, PUBLISH_ACTION, user -> RequestUtils.bodyToJson(request, body -> {
			final JsonArray levelIds = ids(body, "level_ids");
			final JsonArray disciplineIds = ids(body, "discipline_ids");
			if (levelIds.isEmpty() || disciplineIds.isEmpty()) {
				badRequest(request, "exercizer.catalog.publish.classification.required");
				return;
			}
			catalogService.publish(id, levelIds, disciplineIds, alignmentIds(body), body.getString("authors"), user,
					notFoundOr(request));
		}));
	}

	// ── Garde-fous ──────────────────────────────────────────────────────────────

	private static boolean hasAction(final UserInfos user, final String action) {
		return user.getAuthorizedActions() != null &&
				user.getAuthorizedActions().stream().anyMatch(a -> action.equals(a.getName()));
	}

	/** Les profils qui ne voient jamais le catalogue, quels que soient leurs droits. */
	private static boolean isLearnerOrParent(final UserInfos user) {
		return "Student".equals(user.getType()) || "Relative".equals(user.getType());
	}

	/** Exécute l'action si l'usager détient le droit workflow donné (et n'est ni élève ni parent) ; 401 sinon. */
	private void withAction(final HttpServerRequest request, final String action, final Handler<UserInfos> next) {
		UserUtils.getUserInfos(eb, request, user -> {
			if (user != null && !isLearnerOrParent(user) && hasAction(user, action)) {
				next.handle(user);
			} else {
				unauthorized(request);
			}
		});
	}

	/** L'auteur d'un sujet du catalogue (celui qui l'a publié) ou un modérateur. */
	private void withCatalogAuthorOrModerator(final HttpServerRequest request, final Long id, final Runnable next) {
		withAction(request, CREATE_ACTION, user -> {
			if (hasAction(user, MANAGE_ACTION)) {
				next.run();
				return;
			}
			catalogService.get(id, event -> {
				if (event.isRight() && user.getUserId().equals(
						event.right().getValue().getJsonObject("subject", new JsonObject()).getString("owner"))) {
					next.run();
				} else if (event.isLeft() && "not.found".equals(event.left().getValue())) {
					notFound(request);
				} else {
					unauthorized(request);
				}
			});
		});
	}

	private Handler<Either<String, JsonObject>> notFoundOr(final HttpServerRequest request) {
		return event -> {
			if (event.isLeft() && "not.found".equals(event.left().getValue())) {
				notFound(request);
			} else {
				defaultResponseHandler(request).handle(event);
			}
		};
	}

	// ── Paramètres ──────────────────────────────────────────────────────────────

	/** Les critères de recherche communs : q, levels, disciplines, et les établissements de l'usager. */
	private static JsonObject criteria(final HttpServerRequest request, final UserInfos user) {
		return new JsonObject()
				.put("q", request.params().get("q"))
				.put("levels", idList(request.params().get("levels")))
				.put("disciplines", idList(request.params().get("disciplines")))
				.put("structures", new JsonArray(user.getStructures()));
	}

	/**
	 * Les énoncés CASE du corps ({@code alignment_ids}, chaînes sans doublon), ou null si le champ est
	 * absent : l'ancienne interface ne l'envoie pas et ne doit pas effacer les rattachements.
	 */
	private static JsonArray alignmentIds(final JsonObject body) {
		if (!body.containsKey("alignment_ids")) return null;
		final JsonArray ids = new JsonArray();
		for (Object value : body.getJsonArray("alignment_ids", new JsonArray())) {
			if (value instanceof String && !ids.contains(value)) {
				ids.add(value);
			}
		}
		return ids;
	}

	/** L'id numérique d'un paramètre de route ; répond 400 et renvoie null s'il est illisible. */
	private Long idParam(final HttpServerRequest request, final String name) {
		try {
			return Long.parseLong(request.params().get(name));
		} catch (NumberFormatException e) {
			badRequest(request, e.getMessage());
			return null;
		}
	}

	private static Integer intParam(final String value) {
		try {
			return value == null ? null : Integer.parseInt(value);
		} catch (NumberFormatException e) {
			return null;
		}
	}

	/** « 3,12,27 » → [3, 12, 27] ; tout ce qui n'est pas un entier est ignoré. */
	private static JsonArray idList(final String value) {
		final JsonArray ids = new JsonArray();
		if (value == null) return ids;
		for (String part : value.split(",")) {
			try {
				ids.add(Long.parseLong(part.trim()));
			} catch (NumberFormatException e) {
				// ignoré
			}
		}
		return ids;
	}

	/** Les entiers d'un tableau du corps de la requête, sans doublon. */
	private static JsonArray ids(final JsonObject body, final String field) {
		final JsonArray ids = new JsonArray();
		final JsonArray raw = body.getJsonArray(field, new JsonArray());
		for (Object value : raw) {
			if (value instanceof Number && !ids.contains(((Number) value).longValue())) {
				ids.add(((Number) value).longValue());
			}
		}
		return ids;
	}
}
