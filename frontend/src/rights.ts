import { Subject } from './types';

/**
 * Droits du module Exercizer — mêmes clés que l'IHM AngularJS (`public/ts/behaviours.ts`), pour
 * que les deux interfaces accordent exactement les mêmes permissions.
 *
 * Deux familles :
 *  - workflow : porté par la session (`authorizedActions`), lu via `useHasWorkflow` du socle ;
 *  - ressource : porté par le tableau `shared` du sujet (modèle entcore), chaque entrée valant
 *    `{ userId | groupId, "<action>": true }`. Le propriétaire a tous les droits.
 */

/** Droits de workflow (clés en points, comme dans la session). */
export const WORKFLOW = {
  /** Créer et modifier un sujet : c'est ce droit qui distingue l'enseignant de l'élève. */
  create: 'fr.openent.exercizer.controllers.SubjectController|persist',
  /** Importer un sujet depuis un fichier. */
  import: 'fr.openent.exercizer.controllers.SubjectController|importSubjectGrains',
  /** Publier un sujet dans la bibliothèque. */
  publish: 'fr.openent.exercizer.controllers.SubjectController|publish',
  list: 'fr.openent.exercizer.controllers.SubjectController|listSubject',
  view: 'fr.openent.exercizer.controllers.SubjectController|view',
  /** Produire un sujet automatiquement à partir d'un document. */
  generate: 'fr.openent.exercizer.controllers.SubjectController|generate',
  /** Modérer le catalogue d'exercices : retirer ou reclasser n'importe quel sujet publié. */
  catalogManage: 'fr.openent.exercizer.controllers.CatalogController|manage',
} as const;

/** Droits de ressource (clés en tirets, comme dans `shared`). */
export const RESOURCE = {
  manager: 'fr-openent-exercizer-controllers-SubjectController|remove',
  contrib: 'fr-openent-exercizer-controllers-SubjectController|canSchedule',
} as const;

/**
 * L'interface que voit un usager. Elle ne découle PAS du profil ENT mais du droit de création :
 * un documentaliste ou un personnel qui l'a bascule sur la vue enseignant, et le bouton de
 * bascule de l'IHM AngularJS est lui aussi gardé par `workflow="exercizer.create"`.
 */
export type ExercizerRole = 'teacher' | 'student';

export const roleFor = (canCreate: boolean): ExercizerRole => (canCreate ? 'teacher' : 'student');

/**
 * Ce qu'un usager peut faire d'un sujet, du plus au moins étendu — `checkRightFn` du « toaster »
 * de l'ancienne IHM. Le propriétaire a tout ; un sujet partagé donne, selon le partage, la
 * gestion, la contribution (qui permet de distribuer) ou la seule lecture.
 */
export type SubjectRight = 'owner' | 'manager' | 'contrib' | 'read';

const RANK: Record<SubjectRight, number> = { read: 0, contrib: 1, manager: 2, owner: 3 };

export function subjectRight(
  subject: Subject,
  user: { userId?: string; groupsIds?: string[] } | undefined,
): SubjectRight {
  // Session pas encore connue : on ne masque rien, le serveur reste seul juge des droits.
  if (!user?.userId || subject.owner === user.userId) return 'owner';
  const mine = (subject.shared ?? []).filter(
    (entry) =>
      entry.userId === user.userId ||
      (entry.groupId !== undefined && (user.groupsIds ?? []).includes(entry.groupId)),
  );
  if (mine.some((entry) => entry[RESOURCE.manager])) return 'manager';
  if (mine.some((entry) => entry[RESOURCE.contrib])) return 'contrib';
  return 'read';
}

/**
 * Le droit le plus FAIBLE d'une sélection : une action groupée n'est proposée que si elle est
 * permise sur chacun des sujets choisis.
 */
export function lowestRight(rights: SubjectRight[]): SubjectRight {
  return rights.reduce<SubjectRight>(
    (lowest, right) => (RANK[right] < RANK[lowest] ? right : lowest),
    'owner',
  );
}

export const atLeast = (right: SubjectRight, expected: SubjectRight): boolean =>
  RANK[right] >= RANK[expected];
