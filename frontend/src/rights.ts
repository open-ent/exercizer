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
