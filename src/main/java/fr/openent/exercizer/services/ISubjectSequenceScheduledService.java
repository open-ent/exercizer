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

package fr.openent.exercizer.services;

import fr.wseduc.webutils.Either;
import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.user.UserInfos;

/**
 * Instance affectée du Parcours (subject_sequence_scheduled), calqué sur {@link ISubjectScheduledService}.
 * L'orchestration d'affectation elle-même (résolution des destinataires, boucle sur les items du modèle,
 * appel de {@link ISubjectScheduledService#schedule}) vit dans le contrôleur
 * (SubjectSequenceScheduledController), exactement comme SubjectScheduledController porte déjà cette
 * logique pour un sujet unique. Ce service ne porte que les opérations propres au header
 * subject_sequence_scheduled et à l'agrégation de suivi (cf. SPEC-PARCOURS-multi-sequences.md §3.2/§5.1).
 */
public interface ISubjectSequenceScheduledService {

	/**
	 * Crée la ligne subject_sequence_scheduled (titre/description copiés du modèle, comme
	 * subject_scheduled.title l'est déjà de subject.title), retourne son id.
	 */
	void createHeader(final Long subjectSequenceId, final UserInfos user, final Handler<Either<String, JsonObject>> handler);

	/**
	 * Rattache un subject_scheduled nouvellement créé au Parcours planifié (colonnes
	 * subject_sequence_scheduled_id/sequence_order_by sur subject_scheduled, cf. spec §2.3).
	 */
	void attachChild(final Long subjectSequenceScheduledId, final Long subjectScheduledId, final Integer orderBy, final Handler<Either<String, JsonObject>> handler);

	/**
	 * Recalcule begin_date/due_date dénormalisés du header (min/max des subject_scheduled enfants),
	 * après (dé)planification d'un item.
	 */
	void refreshDates(final Long subjectSequenceScheduledId, final Handler<Either<String, JsonObject>> handler);

	/**
	 * Header + liste ordonnée des subject_scheduled enfants avec leur statut résumé.
	 */
	void getById(final String id, final Handler<Either<String, JsonObject>> handler);

	/**
	 * Ids des subject_scheduled enfants, utilisé par le contrôleur pour boucler sur le unSchedule
	 * existant de chacun (mêmes règles de suppression de fichiers de copie, cf. spec §3.2).
	 */
	Future<JsonArray> getChildrenIds(final Long subjectSequenceScheduledId);

	/**
	 * Supprime le header. Les subject_scheduled enfants doivent avoir été désaffectés individuellement
	 * au préalable par le contrôleur (réutilisation de ISubjectScheduledService#unSchedule).
	 */
	Future<Void> unSchedule(final Long subjectSequenceScheduledId);

	/**
	 * Suivi/score global agrégé (D5/D7) : pour chaque élève, nombre d'items soumis/corrigés et score
	 * moyen (moyenne simple des scores des sujets déjà corrigés) — cf. spec §5.1 et §7-pt.6.
	 */
	void getProgress(final String id, final Handler<Either<String, JsonObject>> handler);

	/**
	 * Le propriétaire voit l'agrégat complet de {@link #getProgress}, un autre appelant autorisé
	 * (élève engagé, cf. SubjectSequenceScheduledAccess) ne voit que sa propre ligne.
	 */
	void isOwner(final String id, final String userId, final Handler<Either<String, Boolean>> handler);

	/**
	 * Liste des distributions (subject_sequence_scheduled) d'un Parcours modèle, pour permettre à
	 * l'enseignant de retrouver l'écran de suivi (D5) d'une distribution passée depuis la liste des
	 * Parcours — jusqu'ici aucun lien dans l'IHM ne menait à cet écran une fois quitté.
	 */
	void listBySequence(final Long subjectSequenceId, final Handler<Either<String, JsonArray>> handler);
}
