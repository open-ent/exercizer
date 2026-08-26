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

package fr.openent.exercizer.controllers;

import static org.entcore.common.http.response.DefaultResponseHandler.arrayResponseHandler;
import static org.entcore.common.http.response.DefaultResponseHandler.notEmptyResponseHandler;

import java.util.ArrayList;
import java.util.List;

import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.filter.ResourceFilter;
import org.entcore.common.http.filter.sql.ShareAndOwner;
import org.entcore.common.user.UserUtils;

import fr.openent.exercizer.filters.MassShareAndOwner;
import fr.openent.exercizer.services.ISubjectSequenceItemService;
import fr.openent.exercizer.services.ISubjectSequenceService;
import fr.openent.exercizer.services.impl.SubjectSequenceItemServiceSqlImpl;
import fr.openent.exercizer.services.impl.SubjectSequenceServiceSqlImpl;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Delete;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.rs.Put;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.http.Renders;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.http.HttpServerRequest;

/**
 * « Parcours » (nom fonctionnel) — CRUD du modèle (subject_sequence) et gestion des sujets qui le
 * composent (subject_sequence_item, ordonnés). Mirroir de SubjectController pour la partie modèle,
 * cf. SPEC-PARCOURS-multi-sequences.md §3.1. L'affectation (scheduling) d'un Parcours à une classe vit
 * dans SubjectSequenceScheduledController, mirroir de SubjectScheduledController, sur le même principe
 * de séparation modèle/instance déjà en place pour subject/subject_scheduled.
 */
public class SubjectSequenceController extends ControllerHelper {

	private final ISubjectSequenceService subjectSequenceService;
	private final ISubjectSequenceItemService subjectSequenceItemService;

	public SubjectSequenceController() {
		this.subjectSequenceService = new SubjectSequenceServiceSqlImpl();
		this.subjectSequenceItemService = new SubjectSequenceItemServiceSqlImpl();
	}

	@Post("/subject-sequence")
	@ApiDoc("Persists a subject sequence (Parcours).")
	@SecuredAction("exercizer.subjectSequence.persist")
	public void persist(final HttpServerRequest request) {
		UserUtils.getUserInfos(eb, request, user -> {
			if (user != null) {
				RequestUtils.bodyToJson(request, resource ->
						subjectSequenceService.persist(resource, user, notEmptyResponseHandler(request)));
			} else {
				log.debug("User not found in session.");
				unauthorized(request);
			}
		});
	}

	@Put("/subject-sequence/:id")
	@ApiDoc("Updates a subject sequence (Parcours).")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void update(final HttpServerRequest request) {
		UserUtils.getUserInfos(eb, request, user -> {
			if (user != null) {
				RequestUtils.bodyToJson(request, resource -> {
					// même contrôle IDOR que SubjectController#update (#WB2-532)
					final Integer resourceBodyId = resource.getInteger("id");
					final Integer resourceParamId = Integer.valueOf(request.params().get("id"));
					if (resourceBodyId != null && !resourceBodyId.equals(resourceParamId)) {
						log.error("Security Error: Insecure Direct Object Reference (IDOR). " +
								"Id in request param = " + resourceParamId + ". Id in body = " + resourceBodyId);
						unauthorized(request);
					} else {
						subjectSequenceService.update(resource, user, notEmptyResponseHandler(request));
					}
				});
			} else {
				log.debug("User not found in session.");
				unauthorized(request);
			}
		});
	}

	@Put("/subject-sequence/mark/delete")
	@ApiDoc("Delete (logically) subject sequences (Parcours).")
	@ResourceFilter(MassShareAndOwner.class)
	@SecuredAction(value = "exercizer.manager", type = ActionType.RESOURCE)
	public void remove(final HttpServerRequest request) {
		UserUtils.getUserInfos(eb, request, user -> {
			if (user != null) {
				RequestUtils.bodyToJson(request, pathPrefix + "delete", resource ->
						subjectSequenceService.remove(resource.getJsonArray("ids"), event -> {
							if (event.isRight()) {
								Renders.noContent(request);
							} else {
								Renders.renderError(request);
							}
						}));
			} else {
				log.debug("User not found in session.");
				unauthorized(request);
			}
		});
	}

	@Get("/subject-sequences")
	@ApiDoc("Gets subject sequence (Parcours) list which are not deleted.")
	@SecuredAction("exercizer.subjectSequence.list")
	public void list(final HttpServerRequest request) {
		UserUtils.getUserInfos(eb, request, user -> {
			if (user != null) {
				final List<String> groupsAndUserIds = new ArrayList<>();
				groupsAndUserIds.add(user.getUserId());
				if (user.getGroupsIds() != null) {
					groupsAndUserIds.addAll(user.getGroupsIds());
				}
				subjectSequenceService.list(groupsAndUserIds, user, arrayResponseHandler(request));
			} else {
				log.debug("User not found in session.");
				unauthorized(request);
			}
		});
	}

	@Get("/subject-sequence/:id/items")
	@ApiDoc("Gets the ordered list of subjects composing a subject sequence (Parcours).")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.read", type = ActionType.RESOURCE)
	public void listItems(final HttpServerRequest request) {
		final Long subjectSequenceId;
		try {
			subjectSequenceId = Long.parseLong(request.params().get("id"));
		} catch (NumberFormatException e) {
			badRequest(request, e.getMessage());
			return;
		}
		subjectSequenceItemService.list(subjectSequenceId, arrayResponseHandler(request));
	}

	@Post("/subject-sequence/:id/item")
	@ApiDoc("Adds an existing subject to a subject sequence (Parcours), at a given order.")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void itemPersist(final HttpServerRequest request) {
		final Long subjectSequenceId;
		try {
			subjectSequenceId = Long.parseLong(request.params().get("id"));
		} catch (NumberFormatException e) {
			badRequest(request, e.getMessage());
			return;
		}
		RequestUtils.bodyToJson(request, pathPrefix + "subjectSequenceItem", resource ->
				subjectSequenceItemService.persist(resource, subjectSequenceId, notEmptyResponseHandler(request)));
	}

	@Put("/subject-sequence/:id/item/:itemId")
	@ApiDoc("Updates an item of a subject sequence (Parcours) : subject and/or order (reordering).")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void itemUpdate(final HttpServerRequest request) {
		final Long subjectSequenceId;
		final Long itemId;
		try {
			subjectSequenceId = Long.parseLong(request.params().get("id"));
			itemId = Long.parseLong(request.params().get("itemId"));
		} catch (NumberFormatException e) {
			badRequest(request, e.getMessage());
			return;
		}
		RequestUtils.bodyToJson(request, pathPrefix + "subjectSequenceItem", resource ->
				subjectSequenceItemService.update(resource, itemId, subjectSequenceId, notEmptyResponseHandler(request)));
	}

	@Delete("/subject-sequence/:id/items")
	@ApiDoc("Removes items (mass) from a subject sequence (Parcours).")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void itemRemoves(final HttpServerRequest request) {
		final List<String> ids = request.params().getAll("itemId");
		if (ids == null || ids.isEmpty()) {
			badRequest(request);
			return;
		}

		final List<Long> itemIds = new ArrayList<>();
		final Long subjectSequenceId;
		try {
			subjectSequenceId = Long.parseLong(request.params().get("id"));
			for (final String id : ids) {
				itemIds.add(Long.parseLong(id));
			}
		} catch (NumberFormatException e) {
			badRequest(request, e.getMessage());
			return;
		}

		subjectSequenceItemService.remove(itemIds, subjectSequenceId, event -> {
			if (event.isRight()) {
				Renders.noContent(request);
			} else {
				Renders.renderError(request);
			}
		});
	}

	@Get("/subject-sequence/share/json/:id")
	@ApiDoc("Lists rights for a given subject sequence (Parcours).")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void share(final HttpServerRequest request) {
		super.shareJson(request, false);
	}

	@Put("/subject-sequence/share/json/:id")
	@ApiDoc("Adds rights for a given subject sequence (Parcours).")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.manager", type = ActionType.RESOURCE)
	public void shareSubmit(final HttpServerRequest request) {
		// pas de notification personnalisée (uri/pushNotif) : aucun écran frontend de Parcours n'existe
		// encore vers lequel pointer (le frontend est un chantier séparé, cf. tâche) ; simplifié par
		// rapport à SubjectController#shareSubmit sur le même modèle que ResourceTypeController#shareResource.
		super.shareJsonSubmit(request, "exercizer.share", false, null, null);
	}

	@Put("/subject-sequence/share/remove/:id")
	@ApiDoc("Removes rights for a given subject sequence (Parcours).")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.manager", type = ActionType.RESOURCE)
	public void shareRemove(final HttpServerRequest request) {
		super.removeShare(request, false);
	}
}
