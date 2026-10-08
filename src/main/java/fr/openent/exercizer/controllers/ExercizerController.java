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

import fr.openent.exercizer.Exercizer;
import fr.wseduc.security.ActionType;
import fr.wseduc.webutils.http.Renders;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.controller.ControllerHelper;
import io.vertx.core.http.HttpServerRequest;

import fr.wseduc.rs.*;
import fr.wseduc.security.SecuredAction;
import org.entcore.common.events.EventHelper;
import org.entcore.common.events.EventStore;
import org.entcore.common.events.EventStoreFactory;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.user.UserUtils;
import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.vertx.java.core.http.RouteMatcher;

import java.util.Map;

public class ExercizerController extends ControllerHelper {
    private final EventHelper eventHelper;
    private final Neo4j neo4j = Neo4j.getInstance();

    /** Clé de préférence usager portant le choix d'IHM, et l'état des bandeaux qui le proposent.
     *  Clé DÉDIÉE : le module écrit déjà des préférences sous d'autres clés, et un choix
     *  d'interface ne doit pas pouvoir être effacé par une écriture partielle venue d'ailleurs. */
    private static final String UI_PREFERENCE = "exercizerUi";

    /** IHM servie quand l'usager n'a rien choisi : "react" (nouvelle) ou "angular" (ancienne),
     *  pilotée par la conf `frontend-ui` du bloc du module dans ent-core.yaml, elle-même alimentée
     *  par la variable EXERCIZER_FRONTEND_UI — PROPRE à ce module, isolée de FRONTEND_UI_DEFAULT
     *  que partagent les modules dont la migration est terminée (ce qui n'est pas le cas ici).
     *  NB : launcher-next conserve la clé `frontend-ui` (bloc `config:` stocké verbatim) ; le
     *  repli Java ne joue que si la conf est absente. */
    private String frontendUi = "angular";

    public ExercizerController(){
        final EventStore eventStore = EventStoreFactory.getFactory().getEventStore(Exercizer.class.getSimpleName());
        this.eventHelper = new EventHelper(eventStore);
    }

    @Override
    public void init(Vertx vertx, JsonObject config, RouteMatcher rm,
                     Map<String, fr.wseduc.webutils.security.SecuredAction> securedActions) {
        super.init(vertx, config, rm, securedActions);
        this.frontendUi = "react".equals(config.getString("frontend-ui", "angular")) ? "react" : "angular";
    }

    @Get("")
    @SecuredAction("exercizer.view")
    public void view(final HttpServerRequest request) {
        // Choix de l'IHM (migration React), par ordre de priorité décroissante :
        //   1. `?ui=react|angular` — dérogation ponctuelle, NON mémorisée (vérification, support) ;
        //   2. la préférence de l'usager (clé `exercizerUi`), posée par les bandeaux de bascule ;
        //   3. la conf `frontend-ui` de la plateforme.
        // exercizer.html = IHM AngularJS historique ; exercizer-react.html = nouvelle IHM React,
        // GÉNÉRÉE par Vite (ses fichiers portent une empreinte de contenu, dont seul le build
        // connaît les noms — elle ne peut donc pas venir de view-src/).
        final String uiParam = request.getParam("ui");
        final String forcedUi = ("react".equals(uiParam) || "angular".equals(uiParam)) ? uiParam : null;

        UserUtils.getUserInfos(eb, request, user -> {
            if (user == null) {
                unauthorized(request);
                return;
            }
            preferredUi(user.getUserId(), forcedUi).onSuccess(ui -> {
                renderView(request, new JsonObject(),
                        "react".equals(ui) ? "exercizer-react.html" : "exercizer.html", null);
                eventHelper.onAccess(request);
            });
        });
    }

    /**
     * IHM à servir : la dérogation d'URL si elle est présente, sinon le choix mémorisé par
     * l'usager, sinon celui de la plateforme.
     *
     * Le choix est lu à SA SOURCE, le nœud {@code UserAppConf} du graphe, et non via la session ni
     * via le bus {@code userbook.preferences} : ni l'un ni l'autre ne restitue une clé écrite
     * pendant la session en cours — l'usager serait renvoyé sur l'ancienne IHM à chaque visite
     * malgré son choix. C'est ce même nœud qu'écrit {@code PUT /userbook/preference/:app}.
     *
     * ⚠ La clé ne peut porter ni tiret ni point : entcore retire les caractères non alphanumériques
     * avant de construire le nom de propriété Cypher. {@code exercizerUi} traverse donc la chaîne
     * inchangée.
     *
     * Aucune panne de cette lecture ne doit empêcher le module de s'afficher : à la moindre
     * difficulté, la plateforme tranche.
     */
    private Future<String> preferredUi(String userId, String forcedUi) {
        if (forcedUi != null) return Future.succeededFuture(forcedUi);

        final Promise<String> promise = Promise.promise();
        final String query = "MATCH (:User {id:{userId}})-[:PREFERS]->(uac:UserAppConf) " +
                "RETURN uac." + UI_PREFERENCE + " AS preference";
        neo4j.execute(query, new JsonObject().put("userId", userId), message -> {
            promise.complete(readUi(message.body()));
        });
        return promise.future();
    }

    /** Extrait le choix d'IHM du résultat Neo4j — la préférence y est rangée en CHAÎNE JSON. */
    private String readUi(JsonObject body) {
        try {
            final JsonArray rows = body.getJsonArray("result", new JsonArray());
            if (rows.isEmpty()) return frontendUi;
            final String raw = rows.getJsonObject(0).getString("preference");
            if (raw == null || raw.trim().isEmpty()) return frontendUi;
            final String ui = new JsonObject(raw).getString("ui");
            return ("react".equals(ui) || "angular".equals(ui)) ? ui : frontendUi;
        } catch (Exception e) {
            // Préférence illisible (écriture partielle, format d'une version antérieure), ou graphe
            // en échec : la plateforme tranche. Jamais d'erreur 500 pour un choix d'habillage.
            log.warn("[Exercizer@readUi] préférence " + UI_PREFERENCE + " illisible", e);
            return frontendUi;
        }
    }

    @Get("/now")
    @ApiDoc("Get now UTC from server")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void now(final HttpServerRequest request) {
        Renders.renderJson(request, new JsonObject().put("date", DateTime.now(DateTimeZone.UTC).toString()));
    }

}
