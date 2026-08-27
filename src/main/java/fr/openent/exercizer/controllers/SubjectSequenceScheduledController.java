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

import fr.openent.exercizer.filters.SubjectSequenceScheduledAccess;
import fr.openent.exercizer.filters.SubjectSequenceScheduledOwner;
import fr.openent.exercizer.services.ISubjectScheduledService;
import fr.openent.exercizer.services.ISubjectSequenceItemService;
import fr.openent.exercizer.services.ISubjectSequenceScheduledService;
import fr.openent.exercizer.services.impl.SubjectScheduledServiceSqlImpl;
import fr.openent.exercizer.services.impl.SubjectSequenceItemServiceSqlImpl;
import fr.openent.exercizer.services.impl.SubjectSequenceScheduledServiceSqlImpl;
import fr.openent.exercizer.utils.GroupUtils;
import fr.openent.exercizer.utils.PushNotificationUtils;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Delete;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.I18n;
import fr.wseduc.webutils.http.Renders;
import fr.wseduc.webutils.request.RequestUtils;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.filter.ResourceFilter;
import org.entcore.common.http.filter.sql.ShareAndOwner;
import org.entcore.common.storage.Storage;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;
import org.entcore.common.utils.DateUtils;
import org.entcore.common.utils.StringUtils;
import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;

import io.vertx.core.CompositeFuture;
import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.Promise;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.text.ParseException;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Affectation du « Parcours » (subject_sequence_scheduled), mirroir de SubjectScheduledController pour
 * la partie instance planifiée. Ne réécrit pas la logique de planification déjà en place : boucle sur
 * les items du modèle et appelle {@link ISubjectScheduledService#schedule} tel quel pour chacun
 * (orchestration, pas duplication — cf. SPEC-PARCOURS-multi-sequences.md §3.2). Ne touche à aucune route
 * de pilotage D3 (celles-ci restent scopées à un subject_scheduled unique, inchangées, cf. spec §6).
 */
public class SubjectSequenceScheduledController extends ControllerHelper {

	private final ISubjectSequenceScheduledService subjectSequenceScheduledService;
	private final ISubjectSequenceItemService subjectSequenceItemService;
	private final ISubjectScheduledService subjectScheduledService;
	private final Storage storage;

	public SubjectSequenceScheduledController(final Storage storage) {
		this.subjectSequenceScheduledService = new SubjectSequenceScheduledServiceSqlImpl();
		this.subjectSequenceItemService = new SubjectSequenceItemServiceSqlImpl();
		this.subjectScheduledService = new SubjectScheduledServiceSqlImpl();
		this.storage = storage;
	}

	@Post("/schedule-subject-sequence/:id")
	@ApiDoc("Schedules a subject sequence (Parcours) : crée l'instance affectée et planifie chacun de ses sujets, dans l'ordre.")
	@ResourceFilter(ShareAndOwner.class)
	@SecuredAction(value = "exercizer.contrib", type = ActionType.RESOURCE)
	public void schedule(final HttpServerRequest request) {
		final Long subjectSequenceId;
		try {
			subjectSequenceId = Long.parseLong(request.params().get("id"));
		} catch (NumberFormatException e) {
			badRequest(request, e.getMessage());
			return;
		}

		UserUtils.getUserInfos(eb, request, user -> {
			if (user == null) {
				log.debug("User not found in session.");
				unauthorized(request);
				return;
			}
			RequestUtils.bodyToJson(request, pathPrefix + "subjectSequenceScheduled", body -> {
				if (!checkScheduledSequence(request, body)) {
					return;
				}
				subjectSequenceItemService.list(subjectSequenceId, itemsEvent -> {
					if (itemsEvent.isLeft()) {
						renderError(request, new JsonObject().put("error", itemsEvent.left().getValue()));
						return;
					}
					final JsonArray items = itemsEvent.right().getValue();
					if (items.isEmpty()) {
						badRequest(request, "exercizer.subject.sequence.schedule.empty");
						return;
					}
					resolveRecipients(request, user, body.getJsonObject("scheduledAt"), users -> {
						if (users != null) {
							scheduleSequence(request, user, subjectSequenceId, body, items, users);
						}
						// sinon : resolveRecipients a déjà répondu (badRequest/renderError)
					});
				});
			});
		});
	}

	private boolean checkScheduledSequence(final HttpServerRequest request, final JsonObject body) {
		final String sBeginDate = body.getString("beginDate");
		final String sDueDate = body.getString("dueDate");
		if (StringUtils.isEmpty(sBeginDate) || StringUtils.isEmpty(sDueDate)) {
			badRequest(request, "exercizer.schedule.empty.date");
			return false;
		}

		final Date beginDate;
		final Date dueDate;
		try {
			beginDate = DateUtils.parseTimestampWithoutTimezone(sBeginDate);
			dueDate = DateUtils.parseTimestampWithoutTimezone(sDueDate);
		} catch (ParseException e) {
			log.error("can't parse dueDate or beginDate of scheduled subject sequence", e);
			renderError(request);
			return false;
		}

		if (beginDate.after(dueDate)) {
			badRequest(request, "exercizer.schedule.rule.date");
			return false;
		}

		final JsonObject scheduledAt = body.getJsonObject("scheduledAt");
		if (scheduledAt == null || (scheduledAt.getJsonArray("userList", new JsonArray()).size() == 0
				&& scheduledAt.getJsonArray("groupList", new JsonArray()).size() == 0)) {
			badRequest(request, "exercizer.schedule.empty.users");
			return false;
		}

		return true;
	}

	/**
	 * Résout la liste dédupliquée de destinataires (users + membres des groupes, moins les exclusions),
	 * même liste appliquée à chaque item du Parcours (cf. spec §3.2). Petite duplication assumée de la
	 * logique équivalente (privée, couplée à un seul subjectId) de
	 * SubjectScheduledController#getScheduleHandler/#safeUsersCollections — non réutilisable telle quelle
	 * sans modifier ce contrôleur, cf. rapport de tâche.
	 */
	private void resolveRecipients(final HttpServerRequest request, final UserInfos user, final JsonObject scheduledAt,
									final Handler<JsonArray> handler) {
		final JsonArray usersJa = scheduledAt.getJsonArray("userList", new JsonArray());
		final JsonArray groupsJa = scheduledAt.getJsonArray("groupList", new JsonArray());
		final JsonArray excludeJa = scheduledAt.getJsonArray("exclude", new JsonArray());

		if (groupsJa.size() > 0) {
			final Set<String> groupIds = new HashSet<>();
			for (int i = 0; i < groupsJa.size(); i++) {
				if (!(groupsJa.getValue(i) instanceof JsonObject)) continue;
				groupIds.add(groupsJa.getJsonObject(i).getString("_id"));
			}
			GroupUtils.findMembers(eb, user.getUserId(), new ArrayList<>(groupIds), membersJa -> {
				if (membersJa == null) {
					log.error("Failure to find group members : JsonArray null");
					renderError(request);
					handler.handle(null);
					return;
				}
				final JsonArray usersSafe = new JsonArray();
				final Set<String> userIds = new HashSet<>();
				safeUsersCollections(usersJa, usersSafe, userIds, excludeJa);
				safeUsersCollections(membersJa, usersSafe, userIds, excludeJa);
				if (userIds.isEmpty()) {
					badRequest(request, "exercizer.schedule.empty.groups");
					handler.handle(null);
					return;
				}
				handler.handle(usersSafe);
			});
		} else {
			final JsonArray usersSafe = new JsonArray();
			final Set<String> userIds = new HashSet<>();
			safeUsersCollections(usersJa, usersSafe, userIds, excludeJa);
			if (userIds.isEmpty()) {
				badRequest(request, "exercizer.schedule.empty.users");
				handler.handle(null);
				return;
			}
			handler.handle(usersSafe);
		}
	}

	private void safeUsersCollections(final JsonArray usersParam, final JsonArray usersSafe, final Set<String> userIds, final JsonArray excludeJa) {
		for (int i = 0; i < usersParam.size(); i++) {
			if (!(usersParam.getValue(i) instanceof JsonObject)) continue;
			final JsonObject joUser = usersParam.getJsonObject(i);
			final String currentUserId = joUser.getString("_id");
			boolean exclude = false;
			for (Object o : excludeJa) {
				if (!(o instanceof JsonObject)) continue;
				if (StringUtils.trimToBlank(currentUserId).equals(((JsonObject) o).getString("_id"))) {
					exclude = true;
					break;
				}
			}
			if (!userIds.contains(currentUserId) && !exclude) {
				userIds.add(currentUserId);
				usersSafe.add(joUser);
			}
		}
	}

	private void scheduleSequence(final HttpServerRequest request, final UserInfos user, final Long subjectSequenceId,
								   final JsonObject body, final JsonArray items, final JsonArray users) {
		subjectSequenceScheduledService.createHeader(subjectSequenceId, user, headerEvent -> {
			if (headerEvent.isLeft()) {
				log.error("failure to create subject_sequence_scheduled header : " + headerEvent.left().getValue());
				renderError(request, new JsonObject().put("error", headerEvent.left().getValue()));
				return;
			}
			final JsonObject header = headerEvent.right().getValue();
			final Long subjectSequenceScheduledId = header.getLong("id");

			final Date nowUTC = new DateTime(DateTimeZone.UTC).toLocalDateTime().toDate();
			Date beginDate;
			try {
				beginDate = DateUtils.parseTimestampWithoutTimezone(body.getString("beginDate"));
			} catch (ParseException e) {
				beginDate = nowUTC;
			}
			final boolean isNotify = DateUtils.lessOrEqualsWithoutTime(beginDate, nowUTC);

			final List<String> userIds = new ArrayList<>();
			for (Object o : users) {
				if (o instanceof JsonObject) {
					userIds.add(((JsonObject) o).getString("_id"));
				}
			}

			scheduleItem(request, user, subjectSequenceScheduledId, body, items, 0, users, isNotify, success -> {
				if (!success) {
					// une erreur a déjà été rendue par scheduleItem
					return;
				}
				subjectSequenceScheduledService.refreshDates(subjectSequenceScheduledId, refreshEvent -> {
					if (refreshEvent.isLeft()) {
						log.error("failure to refresh subject_sequence_scheduled dates : " + refreshEvent.left().getValue());
					}
					if (isNotify) {
						notifySequence(request, user, header.getString("title"), userIds, body);
					}
					// Le code de statut doit être posé AVANT le premier write() (qui envoie déjà l'en-tête
					// avec le code par défaut 200 sinon) : Renders.created() appelé après write() levait
					// IllegalStateException "Response head already sent", non rattrapée - même bug que
					// SubjectScheduledController#getHandlerScheduleAndNotifies, corrigé là-bas de la même
					// façon (constaté en reproduisant /schedule-subject-sequence/:id réel).
					final String result = new JsonObject().put("id", subjectSequenceScheduledId).toString();
					request.response().setStatusCode(201).setStatusMessage("Created");
					request.response().putHeader("Content-Length", String.valueOf(result.length()));
					request.response().write(result);
					request.response().end();
				});
			});
		});
	}

	/**
	 * Boucle séquentielle sur les items du Parcours, réutilisant ISubjectScheduledService#schedule tel
	 * quel pour chacun (pas de duplication de la logique de planification). Séquentiel plutôt que
	 * parallèle : ordre déterministe, cohérent avec l'ordre du Parcours. Pas de retour arrière
	 * transactionnel inter-items en cas d'échec partiel (chaque appel à schedule() a déjà sa propre
	 * transaction SQL, isolée) : simplification assumée, cf. rapport de tâche. Notification individuelle
	 * par item désactivée (isNotify=false passé au service) : une notification unique agrégée est envoyée
	 * une fois tous les items planifiés, cf. #notifySequence.
	 */
	private void scheduleItem(final HttpServerRequest request, final UserInfos user, final Long subjectSequenceScheduledId,
							   final JsonObject body, final JsonArray items, final int index, final JsonArray users,
							   final boolean isNotify, final Handler<Boolean> onDone) {
		if (index >= items.size()) {
			onDone.handle(true);
			return;
		}
		final JsonObject item = items.getJsonObject(index);
		final JsonObject scheduledSubject = new JsonObject()
				.put("subjectId", item.getLong("subject_id"))
				.put("subjectTitle", item.getString("subject_title"))
				.put("beginDate", body.getString("beginDate"))
				.put("dueDate", body.getString("dueDate"))
				.put("estimatedDuration", body.getString("estimatedDuration", ""))
				.put("isOneShotSubmit", body.getBoolean("isOneShotSubmit"))
				.put("isTrainingMode", body.getBoolean("isTrainingMode", false))
				.put("isTrainingPermitted", body.getBoolean("isTrainingPermitted", false))
				.put("randomDisplay", body.getBoolean("randomDisplay", false))
				.put("scheduledAt", body.getJsonObject("scheduledAt"))
				.put("grainsCustomCopyData", new JsonArray())
				.put("users", users)
				.put("isNotify", isNotify)
				.put("locale", I18n.acceptLanguage(request));

		subjectScheduledService.schedule(scheduledSubject, user, event -> {
			if (event.isLeft()) {
				log.error("failure to schedule subject sequence item : " + event.left().getValue());
				renderError(request, new JsonObject().put("error", event.left().getValue()));
				onDone.handle(false);
				return;
			}
			final Long subjectScheduledId = event.right().getValue().getLong("id");
			subjectSequenceScheduledService.attachChild(subjectSequenceScheduledId, subjectScheduledId, index + 1, attachEvent -> {
				if (attachEvent.isLeft()) {
					log.error("failure to attach subject_scheduled to subject_sequence_scheduled : " + attachEvent.left().getValue());
					renderError(request, new JsonObject().put("error", attachEvent.left().getValue()));
					onDone.handle(false);
					return;
				}
				scheduleItem(request, user, subjectSequenceScheduledId, body, items, index + 1, users, isNotify, onDone);
			});
		});
	}

	/**
	 * Notification unique pour tout le Parcours (au lieu d'une notification par sujet) : simplification
	 * assumée, réutilise le même type de notification "assigncopy" que la planification d'un sujet
	 * unique — aucun template dédié au Parcours n'existe encore côté i18n/frontend (chantier séparé,
	 * hors périmètre de cette tâche backend). Cf. rapport de tâche.
	 */
	private void notifySequence(final HttpServerRequest request, final UserInfos user, final String sequenceTitle,
								 final List<String> recipientSet, final JsonObject body) {
		if (recipientSet.isEmpty()) {
			return;
		}
		final JsonObject params = new JsonObject();
		params.put("uri", pathPrefix + "#/dashboard/student");
		params.put("userUri", "/userbook/annuaire#" + user.getUserId() + "#" + user.getType());
		params.put("username", user.getUsername());
		params.put("subjectName", sequenceTitle);
		params.put("resourceUri", params.getString("uri", ""));
		params.put("disableAntiFlood", true);
		params.put("pushNotif", PushNotificationUtils.getNotification(request, "assigncopy", params));
		params.put("dueDate", body.getString("dueDate"));
		params.put("beginDate", body.getString("beginDate"));
		this.notification.notifyTimeline(request, "exercizer.assigncopy", user, recipientSet, null, params);
	}

	@Delete("/unschedule-subject-sequence/:id")
	@ApiDoc("Unschedules a subject sequence (Parcours) : désaffecte chaque sujet enfant puis supprime le header.")
	@ResourceFilter(SubjectSequenceScheduledOwner.class)
	@SecuredAction(value = "", type = ActionType.RESOURCE)
	public void unSchedule(final HttpServerRequest request) {
		final Long subjectSequenceScheduledId;
		try {
			subjectSequenceScheduledId = Long.parseLong(request.params().get("id"));
		} catch (NumberFormatException e) {
			badRequest(request, e.getMessage());
			return;
		}

		checkAuth(request).onSuccess(user ->
				subjectSequenceScheduledService.getChildrenIds(subjectSequenceScheduledId)
						.compose(childrenIds -> {
							final List<Future> unscheduleFutures = new ArrayList<>();
							for (Object o : childrenIds) {
								if (!(o instanceof JsonObject)) continue;
								unscheduleFutures.add(unscheduleChild(((JsonObject) o).getLong("id")));
							}
							return CompositeFuture.all(unscheduleFutures);
						})
						.compose(v -> subjectSequenceScheduledService.unSchedule(subjectSequenceScheduledId))
						.onSuccess(v -> Renders.noContent(request))
						.onFailure(err -> {
							if (err != null) {
								Renders.renderJson(request, new JsonObject().put("error", err.getMessage()), 400);
							} else {
								request.response().setStatusCode(400).end();
							}
						})
		);
	}

	/**
	 * Désaffecte un subject_scheduled enfant : mêmes règles de suppression de fichiers de copie que
	 * SubjectScheduledController#unSchedule (réutilise findUnscheduledCopyFiles + storage.removeFiles +
	 * ISubjectScheduledService#unSchedule tels quels — pas de duplication de cette logique).
	 */
	private Future<Void> unscheduleChild(final Long subjectScheduledId) {
		return subjectScheduledService.findUnscheduledCopyFiles(subjectScheduledId)
				.compose(copyFiles -> {
					final JsonArray ids = new JsonArray();
					copyFiles.forEach(f -> ids.add(((JsonObject) f).getString("file_id")));
					if (ids.isEmpty()) {
						return Future.<Void>succeededFuture();
					}
					final Promise<Void> promise = Promise.promise();
					storage.removeFiles(ids, resDelete -> {
						if (!"ok".equals(resDelete.getString("status"))) {
							final JsonArray errors = resDelete.getJsonArray("errors", new JsonArray());
							for (Object o : errors) {
								if (!(o instanceof JsonObject)) continue;
								log.error("Failed to remove file with id: " + ((JsonObject) o).getString("id") +
										"/" + ((JsonObject) o).getString("message"));
							}
						}
						promise.complete();
					});
					return promise.future();
				})
				.compose(v -> subjectScheduledService.unSchedule(subjectScheduledId));
	}

	@Get("/subject-sequence-scheduled/:id")
	@ApiDoc("Header + liste ordonnée des sujets planifiés d'un Parcours affecté.")
	@ResourceFilter(SubjectSequenceScheduledAccess.class)
	@SecuredAction(value = "", type = ActionType.RESOURCE)
	public void getScheduled(final HttpServerRequest request) {
		final String id = request.params().get("id");
		subjectSequenceScheduledService.getById(id, event -> {
			if (event.isLeft()) {
				renderError(request, new JsonObject().put("error", event.left().getValue()));
				return;
			}
			renderJson(request, event.right().getValue());
		});
	}

	@Get("/subject-sequence-scheduled/:id/progress")
	@ApiDoc("Suivi/score global agrégé (D5/D7) d'un Parcours affecté, élève par élève.")
	@ResourceFilter(SubjectSequenceScheduledAccess.class)
	@SecuredAction(value = "", type = ActionType.RESOURCE)
	public void progress(final HttpServerRequest request) {
		final String id = request.params().get("id");
		checkAuth(request).onSuccess(user -> subjectSequenceScheduledService.getProgress(id, event -> {
			if (event.isLeft()) {
				renderError(request, new JsonObject().put("error", event.left().getValue()));
				return;
			}
			// IDOR : SubjectSequenceScheduledAccess autorise tout élève engagé dans le Parcours (pas
			// seulement le propriétaire), mais la requête SQL renvoie la classe entière (noms + scores
			// de tous les élèves). Un élève n'a le droit de voir QUE sa propre ligne ; seul le
			// propriétaire (enseignant) voit l'agrégat complet - même distinction que l'export CSV,
			// déjà réservé au propriétaire via SubjectSequenceScheduledOwner.
			subjectSequenceScheduledService.isOwner(id, user.getUserId(), isOwnerEvent -> {
				final boolean isOwner = isOwnerEvent.isRight() && Boolean.TRUE.equals(isOwnerEvent.right().getValue());
				renderJson(request, buildProgressResponse(event.right().getValue(), isOwner ? null : user.getUserId()));
			});
		}));
	}

	/**
	 * Ajoute, pour chaque élève, un taux de complétion calculé côté backend (submittedItems/totalItems),
	 * même logique que SubjectScheduledController#buildPilotageStateResponse pour le pilotage D3.
	 * @param restrictToStudentId non null pour un appelant non-propriétaire : ne renvoie que sa propre ligne.
	 */
	private JsonObject buildProgressResponse(final JsonObject raw, final String restrictToStudentId) {
		final long totalItems = raw.getLong("total_items", 0L);
		final JsonArray outStudents = new JsonArray();
		for (Object o : raw.getJsonArray("students", new JsonArray())) {
			if (!(o instanceof JsonObject)) continue;
			final JsonObject s = (JsonObject) o;
			if (restrictToStudentId != null && !restrictToStudentId.equals(s.getString("studentId"))) {
				continue;
			}
			final JsonObject out = s.copy();
			final long submittedItems = s.getLong("submittedItems", 0L);
			out.put("totalItems", totalItems);
			out.put("completionRate", totalItems > 0 ? ((double) submittedItems) / totalItems : 0d);
			outStudents.add(out);
		}
		return new JsonObject().put("totalItems", totalItems).put("students", outStudents);
	}

	@Get("/subject-sequence-scheduled/:id/export-csv")
	@ApiDoc("Export CSV agrégé (D6) de la progression d'un Parcours affecté, élève par élève.")
	@ResourceFilter(SubjectSequenceScheduledOwner.class)
	@SecuredAction(value = "", type = ActionType.RESOURCE)
	public void exportCsv(final HttpServerRequest request) {
		final String id = request.params().get("id");
		subjectSequenceScheduledService.getProgress(id, event -> {
			if (event.isLeft()) {
				renderError(request, new JsonObject().put("error", event.left().getValue()));
				return;
			}
			final JsonObject data = buildProgressResponse(event.right().getValue(), null);
			final StringBuilder csv = new StringBuilder("Élève;Sujets rendus;Sujets corrigés;Total sujets;Taux de complétion;Score moyen\n");
			for (Object o : data.getJsonArray("students", new JsonArray())) {
				if (!(o instanceof JsonObject)) continue;
				final JsonObject s = (JsonObject) o;
				final Double completionRate = s.getDouble("completionRate", 0d);
				final Object averageScore = s.getValue("averageScore");
				csv.append(csvEscape(s.getString("studentName", "")))
						.append(';').append(s.getLong("submittedItems", 0L))
						.append(';').append(s.getLong("correctedItems", 0L))
						.append(';').append(s.getLong("totalItems", 0L))
						.append(';').append(Math.round(completionRate * 100)).append('%')
						.append(';').append(averageScore != null ? averageScore.toString() : "")
						.append('\n');
			}
			final String filename = "Parcours_" + id + "_export_" + DateUtils.format(new Date()) + ".csv";
			request.response().putHeader("Content-Type", "application/csv");
			request.response().putHeader("Content-Disposition", "attachment; filename=" + filename);
			request.response().end(csv.toString());
		});
	}

	private String csvEscape(final String s) {
		if (s == null) {
			return "";
		}
		if (s.contains(";") || s.contains("\"") || s.contains("\n")) {
			return "\"" + s.replace("\"", "\"\"") + "\"";
		}
		return s;
	}

	/**
	 * Helper function to retrieve the current UserInfo, if authorized.
	 * Otherwise, responds to request with HTTP 401 Unauthorized.
	 */
	protected Future<UserInfos> checkAuth(final HttpServerRequest request) {
		final Promise<UserInfos> promise = Promise.promise();
		UserUtils.getUserInfos(eb, request, user -> {
			if (user != null) {
				promise.complete(user);
			} else {
				final String unauthorizedMsg = "User not found in session.";
				log.debug(unauthorizedMsg);
				unauthorized(request);
				promise.fail(unauthorizedMsg);
			}
		});
		return promise.future();
	}
}
