package fr.openent.exercizer.controllers;

import static org.entcore.common.http.response.DefaultResponseHandler.arrayResponseHandler;
import static org.entcore.common.http.response.DefaultResponseHandler.defaultResponseHandler;
import static org.entcore.common.http.response.DefaultResponseHandler.notEmptyResponseHandler;

import fr.openent.exercizer.filters.GrainsCopyAccess;
import fr.openent.exercizer.services.ISectionService;
import fr.openent.exercizer.services.impl.SectionServiceSqlImpl;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Delete;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.rs.Put;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.I18n;
import fr.wseduc.webutils.http.Renders;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.filter.ResourceFilter;
import org.entcore.common.http.filter.sql.ShareAndOwner;
import org.entcore.common.user.UserUtils;

/**
 * Sections d'un sujet interactif (cf. sql/039-add-subject-sections.sql).
 *
 * Aucun droit nouveau : les routes du sujet reprennent les droits de partage des routes de grains
 * ({@code exercizer.read} / {@code exercizer.contrib}, filtre {@link ShareAndOwner} sur le sujet
 * {@code :id}), et celle de la passation reprend le filtre et le droit de {@code POST /grains-copy}.
 * Un droit « workflow » neuf devrait être attribué à la main dans la console d'administration.
 */
public class SectionController extends ControllerHelper {

	private final ISectionService sectionService = new SectionServiceSqlImpl();

	@Get("/subject/:id/sections")
	@ApiDoc("Lists the sections of a subject.")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.read", type = ActionType.RESOURCE)
	public void list(final HttpServerRequest request) {
		final Long subjectId = idParam(request, "id");
		if (subjectId == null) return;
		sectionService.list(subjectId, arrayResponseHandler(request));
	}

	@Post("/subject/:id/section")
	@ApiDoc("Creates a section at the end of a subject.")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void create(final HttpServerRequest request) {
		final Long subjectId = idParam(request, "id");
		if (subjectId == null) return;
		withUser(request, () -> RequestUtils.bodyToJson(request, pathPrefix + "section",
				section -> sectionService.create(subjectId, section, notEmptyResponseHandler(request))));
	}

	@Put("/subject/:id/section/:sectionId")
	@ApiDoc("Updates the title and instructions of a section.")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void update(final HttpServerRequest request) {
		final Long subjectId = idParam(request, "id");
		final Long sectionId = subjectId == null ? null : idParam(request, "sectionId");
		if (sectionId == null) return;
		withUser(request, () -> RequestUtils.bodyToJson(request, pathPrefix + "section",
				section -> sectionService.update(subjectId, sectionId, section, notEmptyResponseHandler(request))));
	}

	@Delete("/subject/:id/section/:sectionId")
	@ApiDoc("Deletes a section, with its grains or moving them to the previous section.")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void remove(final HttpServerRequest request) {
		final Long subjectId = idParam(request, "id");
		final Long sectionId = subjectId == null ? null : idParam(request, "sectionId");
		if (sectionId == null) return;
		final boolean withGrains = "true".equals(request.params().get("withGrains"));
		withUser(request, () -> sectionService.remove(subjectId, sectionId, withGrains, event -> {
			if (event.isRight()) {
				Renders.noContent(request);
			} else {
				renderError(request);
			}
		}));
	}

	@Post("/subject/:id/section/:sectionId/duplicate")
	@ApiDoc("Duplicates a section and its grains right after it.")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void duplicate(final HttpServerRequest request) {
		final Long subjectId = idParam(request, "id");
		final Long sectionId = subjectId == null ? null : idParam(request, "sectionId");
		if (sectionId == null) return;
		final String titleSuffix = I18n.getInstance().translate("exercizer.grain.title.copySuffix",
				Renders.getHost(request), I18n.acceptLanguage(request));
		withUser(request, () -> sectionService.duplicate(subjectId, sectionId, titleSuffix, notEmptyResponseHandler(request)));
	}

	@Put("/subject/:id/structure")
	@ApiDoc("Saves the whole tree of a subject: section order, and section and rank of each grain.")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void saveStructure(final HttpServerRequest request) {
		final Long subjectId = idParam(request, "id");
		if (subjectId == null) return;
		withUser(request, () -> RequestUtils.bodyToJson(request, pathPrefix + "subjectStructure", body -> {
			final JsonArray ungrouped = body.getJsonArray("ungrouped", new JsonArray());
			final JsonArray sections = body.getJsonArray("sections", new JsonArray());
			sectionService.saveStructure(subjectId, ungrouped, sections, defaultResponseHandler(request));
		}));
	}

	@Post("/grains-copy/sections")
	@ApiDoc("Lists the scheduled sections of a subject copy, with their scheduled grain ids.")
	@ResourceFilter(GrainsCopyAccess.class)
	@SecuredAction(value = "", type = ActionType.RESOURCE)
	public void listForSubjectCopy(final HttpServerRequest request) {
		// Même corps que POST /grains-copy (la copie entière) : le filtre l'a déjà validé.
		RequestUtils.bodyToJson(request, copy -> {
			final Long subjectCopyId = copy.getLong("id");
			if (subjectCopyId == null) {
				badRequest(request);
				return;
			}
			sectionService.listForSubjectCopy(subjectCopyId, arrayResponseHandler(request));
		});
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

	private void withUser(final HttpServerRequest request, final Runnable action) {
		UserUtils.getUserInfos(eb, request, user -> {
			if (user != null) {
				action.run();
			} else {
				log.debug("User not found in session.");
				unauthorized(request);
			}
		});
	}
}
