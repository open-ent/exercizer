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

import fr.openent.exercizer.services.ISubjectScheduledService;
import fr.wseduc.webutils.Server;
import fr.wseduc.webutils.request.CookieHelper;
import fr.wseduc.webutils.request.filter.UserAuthFilter;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.http.ServerWebSocket;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * WebSocket applicatif du pilotage actif en direct (D3), scopé par subjectScheduledId
 * (et non par sujet ou par élève) car un même sujet peut être planifié plusieurs fois pour
 * des classes différentes : chaque séance de pilotage a son propre canal de diffusion.
 *
 * Réplique le pattern de net.atos.entng.collaborativewall.controllers.WallWebSocketController :
 * auth par cookie de session signé, map id de ressource -> wsId -> ServerWebSocket, broadcast texte.
 * À la différence de collaborative-wall (fan-out multi-instances via NATS, cf. chat-nats) ou de
 * chat-nats lui-même, cette implémentation reste mono-instance (map en mémoire) : si exercizer tourne
 * un jour en plusieurs répliques sans affinité de session, un élève connecté à une autre instance que
 * l'enseignant ne recevra pas les diffusions. C'est une limite connue et documentée (cf. spec D3),
 * pas corrigée dans cette itération - le frontend doit prévoir un repli HTTP (polling) pour ne pas
 * bloquer la fonctionnalité si le WS échoue.
 *
 * Ce contrôleur ne reçoit pas d'actions du client : les actions de pilotage passent par les routes
 * REST habituelles (filtrées par SubjectScheduledOwner) ; le WS ne sert qu'à la diffusion en direct.
 */
public class PilotageWebSocketController implements Handler<ServerWebSocket> {

    private static final Logger log = LoggerFactory.getLogger(PilotageWebSocketController.class);

    private final Vertx vertx;
    private final ISubjectScheduledService subjectScheduledService;
    private final Map<String, Map<String, ServerWebSocket>> subjectScheduledIdToWSIdToWS = new HashMap<>();

    public PilotageWebSocketController(final Vertx vertx, final ISubjectScheduledService subjectScheduledService) {
        this.vertx = vertx;
        this.subjectScheduledService = subjectScheduledService;
    }

    @Override
    public void handle(final ServerWebSocket ws) {
        ws.pause();
        final String sessionId = CookieHelper.getInstance().getSigned(UserAuthFilter.SESSION_ID, ws);
        final Optional<String> maybeSubjectScheduledId = getSubjectScheduledId(ws.path());
        if (!maybeSubjectScheduledId.isPresent()) {
            closeWithError("missing.subject.scheduled.id", (short) 400, ws);
            return;
        }
        final String subjectScheduledId = maybeSubjectScheduledId.get();

        UserUtils.getSession(Server.getEventBus(vertx), sessionId, infos -> {
            try {
                if (infos == null) {
                    closeWithError("not.authenticated", (short) 401, ws);
                    return;
                }
                final UserInfos user = UserUtils.sessionToUserInfos(infos);

                subjectScheduledService.canAccessPilotage(subjectScheduledId, user.getUserId(), event -> {
                    if (event.isLeft()) {
                        log.error("An error occurred while checking access to a pilotage session: " + event.left().getValue());
                        closeWithError("unknown.error", (short) 500, ws);
                        return;
                    }
                    if (!event.right().getValue()) {
                        closeWithError("not.authorized", (short) 403, ws);
                        return;
                    }
                    final String wsId = UUID.randomUUID().toString();
                    ws.closeHandler(e -> onCloseWSConnection(subjectScheduledId, wsId));
                    // No client -> server actions on this channel : it is push-only, actions go through REST.
                    ws.frameHandler(frame -> {
                        if (frame.isClose()) {
                            onCloseWSConnection(subjectScheduledId, wsId);
                        }
                    });
                    onConnect(subjectScheduledId, wsId, ws);
                    ws.resume();
                });
            } catch (Exception e) {
                ws.resume();
                closeWithError("unknown.error", (short) 500, ws);
                log.error("An error occurred while treating pilotage ws", e);
            }
        });
    }

    private void onConnect(final String subjectScheduledId, final String wsId, final ServerWebSocket ws) {
        final Map<String, ServerWebSocket> wsIdToWs = subjectScheduledIdToWSIdToWS.computeIfAbsent(subjectScheduledId, k -> new HashMap<>());
        wsIdToWs.put(wsId, ws);
    }

    private void onCloseWSConnection(final String subjectScheduledId, final String wsId) {
        final Map<String, ServerWebSocket> wss = subjectScheduledIdToWSIdToWS.get(subjectScheduledId);
        if (wss != null) {
            wss.remove(wsId);
            if (wss.isEmpty()) {
                subjectScheduledIdToWSIdToWS.remove(subjectScheduledId);
            }
        }
    }

    /**
     * Broadcasts a pilotage event to every socket connected on this subjectScheduledId (teacher and students alike).
     * The payload carries its own routing info ("scope" / "studentId") so the client filters what applies to it,
     * as there is no server-side notion of "this frame is for this specific browser" beyond the subjectScheduledId scope.
     */
    public void broadcast(final String subjectScheduledId, final JsonObject event) {
        final Map<String, ServerWebSocket> wsIdToWs = subjectScheduledIdToWSIdToWS.get(subjectScheduledId);
        if (wsIdToWs == null || wsIdToWs.isEmpty()) {
            return;
        }
        final String payload = event.encode();
        for (final ServerWebSocket ws : wsIdToWs.values()) {
            if (!ws.isClosed()) {
                try {
                    ws.writeTextMessage(payload);
                } catch (Exception e) {
                    log.warn("Cannot send pilotage message to this websocket", e);
                }
            }
        }
    }

    private void closeWithError(final String errorMessage, final short errorCode, final ServerWebSocket ws) {
        ws.close(errorCode, errorMessage, e -> log.warn("Pilotage ws connection closed with error " + errorCode + " - " + errorMessage));
    }

    private Optional<String> getSubjectScheduledId(final String path) {
        final String[] splitted = path.split("/");
        if (splitted.length > 0) {
            return Optional.of(splitted[splitted.length - 1].trim());
        }
        return Optional.empty();
    }

    public int getNumberOfConnectedUsers() {
        return subjectScheduledIdToWSIdToWS.values().stream().mapToInt(Map::size).sum();
    }
}
