/**
 * Règles d'état et d'accès aux copies — portage fidèle de `SubjectCopyService` (AngularJS).
 *
 * Isolé des composants, et sans aucune dépendance au réseau : ce sont ces règles qui décident ce
 * que l'élève peut ouvrir et ce que l'enseignant peut corriger, elles méritent d'être lisibles et
 * vérifiables seules (cf. `copies.test.ts`).
 */

import { CopyState, SubjectCopy, SubjectScheduled } from './types';

/**
 * `DateService#compare_after` : vrai si `a` est postérieur à `b`, `valueEqual` tranchant
 * l'égalité. Une date absente ou illisible donne `NaN`, et toute comparaison avec `NaN` est
 * fausse — on retombe alors sur `valueEqual`, comme le faisait la branche « égalité » d'AngularJS
 * quand `moment(undefined)` produisait une date invalide.
 */
export function isAfter(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
  valueEqual: boolean,
  resetTime = false,
): boolean {
  const da = toDate(a);
  const db = toDate(b);
  if (da === null || db === null) return valueEqual;
  if (resetTime) {
    da.setHours(0, 0, 0, 0);
    db.setHours(0, 0, 0, 0);
  }
  const ta = da.getTime();
  const tb = db.getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return valueEqual;
  if (ta > tb) return true;
  if (ta < tb) return false;
  return valueEqual;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

/** L'état d'une copie, dans l'ordre d'évaluation de `SubjectCopyService#copyState`. */
export function copyState(copy: SubjectCopy): CopyState {
  if (copy.is_training_copy) {
    // Une copie d'entraînement n'est jamais corrigée : seuls trois états la concernent, et
    // « commencée » l'emporte sur « rendue » — l'élève peut la reprendre.
    if (copy.has_been_started) return 'is_on_going';
    if (copy.submitted_date) return 'is_done';
    return 'is_sided';
  }
  if (copy.is_corrected && copy.submitted_date) return 'is_corrected';
  if (copy.is_correction_on_going) return 'is_correction_on_going';
  if (copy.submitted_date) return 'is_submitted';
  if (copy.has_been_started) return 'has_been_started';
  return null;
}

/** Clé i18n de l'état, pour l'affichage. Mêmes clés que l'IHM AngularJS. */
export function copyStateKey(copy: SubjectCopy): string | null {
  switch (copyState(copy)) {
    case 'is_done':
      return 'exercizer.copy.state.training.done';
    case 'is_on_going':
      return 'exercizer.copy.state.training.ongoing';
    case 'is_sided':
      return 'exercizer.copy.state.training.sided';
    case 'is_corrected':
      return 'exercizer.copy.state.corrected';
    case 'is_correction_on_going':
      return 'exercizer.copy.state.ongoing';
    case 'is_submitted':
      return 'exercizer.copy.state.submitted';
    case 'has_been_started':
      return 'exercizer.copy.state.started';
    default:
      return null;
  }
}

/** Couleur d'état (classes du socle, reprises de `copyStateColorClass`). */
export function copyStateColorClass(copy: SubjectCopy): string | null {
  switch (copyState(copy)) {
    case 'is_done':
      return 'color-training-done';
    case 'is_on_going':
      return 'color-training-on-going';
    case 'is_sided':
      return 'color-training-sided';
    case 'is_corrected':
      return 'color-corrected';
    case 'is_correction_on_going':
      return 'color-is-correction-on-going';
    case 'is_submitted':
      return 'color-is-submitted';
    case 'has_been_started':
      return 'color-has-been-started';
    default:
      return null;
  }
}

/**
 * L'élève peut-il travailler sa copie ?
 *
 * Trois verrous, dans cet ordre : la date d'ouverture, l'option « un seul envoi » une fois la
 * copie rendue, et la correction (en cours ou faite) — on ne modifie pas une copie que
 * l'enseignant est en train de corriger.
 */
export function canPerformAsStudent(
  scheduled: SubjectScheduled,
  copy: SubjectCopy,
  now: Date = new Date(),
): boolean {
  if (!isAfter(now, scheduled.begin_date, true)) return false;
  if (scheduled.is_one_shot_submit && copy.submitted_date) return false;
  return !(copy.is_correction_on_going || copy.is_corrected);
}

/**
 * L'élève peut-il consulter sa copie corrigée ?
 *
 * Il faut que la date de rendu soit passée, puis soit l'affichage automatique du résultat, soit
 * une copie effectivement corrigée.
 */
export function canViewAsStudent(
  scheduled: SubjectScheduled,
  copy: SubjectCopy,
  now: Date = new Date(),
): boolean {
  if (!isAfter(now, scheduled.begin_date, true)) return false;
  if (!isAfter(now, scheduled.due_date, false)) return false;
  return scheduled.has_automatic_display === true || copy.is_corrected === true;
}

/** L'enseignant ne corrige qu'une copie rendue. */
export function canCorrectAsTeacher(scheduled: SubjectScheduled, copy: SubjectCopy): boolean {
  return Boolean(scheduled && copy && copy.submitted_date);
}

/**
 * Ce que l'ouverture d'une vignette doit faire, repris de `subject-copy-domino#selectTitle` :
 *  - `perform` : travailler la copie ;
 *  - `view`    : consulter la copie corrigée ;
 *  - `training` : voir le score d'une copie d'entraînement terminée ;
 *  - `text`    : rien d'ouvrable (trop tôt, ou en attente de correction).
 */
export type DominoAction = 'perform' | 'view' | 'training' | 'text';

export function dominoAction(
  scheduled: SubjectScheduled,
  copy: SubjectCopy,
  now: Date = new Date(),
): DominoAction {
  if (copy.is_training_copy) {
    // Reprise possible tant qu'elle n'a pas été rendue — ou qu'elle a été reprise depuis.
    return copy.has_been_started || !copy.submitted_date ? 'perform' : 'training';
  }
  if (scheduled.type === 'simple') {
    // Un sujet « simple » n'a pas de correction en ligne : seule la date d'ouverture compte.
    return isAfter(now, scheduled.begin_date, true) ? 'perform' : 'text';
  }
  if (canPerformAsStudent(scheduled, copy, now)) return 'perform';
  if (canViewAsStudent(scheduled, copy, now)) return 'view';
  return 'text';
}

/**
 * La passation est-elle fermée pour de bon ? Sur une copie déjà rendue dont la date de rendu est
 * échue, le bouton reste visible mais inerte — comme dans `isPerformDisabled`.
 */
export function isPerformDisabled(copy: SubjectCopy, now: Date = new Date()): boolean {
  if (copy.is_training_copy || !copy.dueDate || !copy.submitted_date) return false;
  return new Date(copy.dueDate).getTime() <= now.getTime();
}

/** Copie non rendue dont la date de rendu est passée : l'élève est en retard. */
export function isTooLate(
  scheduled: SubjectScheduled,
  copy: SubjectCopy,
  now: Date = new Date(),
): boolean {
  if (copy.submitted_date) return false;
  return isAfter(now, scheduled.due_date, false);
}

/** Sujet dont la date d'ouverture n'est pas encore atteinte. */
export function cannotStartYet(scheduled: SubjectScheduled, now: Date = new Date()): boolean {
  return isAfter(scheduled.begin_date, now, true);
}

/** L'élève peut-il se créer une copie d'entraînement à partir de ce sujet corrigé ? */
export function canCreateTraining(
  scheduled: SubjectScheduled,
  copy: SubjectCopy,
  now: Date = new Date(),
): boolean {
  return Boolean(
    scheduled.is_training_permitted && copy.is_corrected && isAfter(now, scheduled.due_date, true),
  );
}

/**
 * Les trois onglets du tableau de bord élève, et la règle qui décide où va chaque copie.
 *
 * L'IHM AngularJS répartissait ce tri dans ses GABARITS, en chaînant des filtres
 * (`filterOnSubjectCopyTraining`, `filterOnSubjectCopyNotStartedOrStarted`, …). Les réunir ici
 * rend la règle visible et vérifiable ; elle est reprise filtre par filtre, sans l'interpréter.
 */
export type StudentTab = 'todo' | 'finished' | 'training';

/** « À faire » : hors entraînement, et pas encore rendue (jamais ouverte ou commencée). */
export function isTodo(copy: SubjectCopy): boolean {
  if (copy.is_training_copy) return false;
  const state = copyState(copy);
  return state === 'has_been_started' || state === null;
}

/** « Terminés » : hors entraînement, rendue — en attente de correction, en cours, ou corrigée. */
export function isFinished(copy: SubjectCopy): boolean {
  if (copy.is_training_copy) return false;
  const state = copyState(copy);
  return (
    state === 'is_submitted' || state === 'is_correction_on_going' || state === 'is_corrected'
  );
}

/** L'onglet d'une copie. Sert au comptage des pastilles ; l'affichage filtre lui-même. */
export function studentTab(copy: SubjectCopy): StudentTab {
  if (copy.is_training_copy) return 'training';
  return isFinished(copy) ? 'finished' : 'todo';
}

/**
 * Colonne « cette semaine » de l'onglet « à faire » : les copies dont la date de rendu est déjà
 * atteinte ou tombe dans la semaine en cours.
 *
 * Le test d'AngularJS (`scheduledThisWeek`) comparait des NUMÉROS DE SEMAINE, avec un correctif
 * pour le passage d'année. On garde la même intention en comparant à la fin de la semaine
 * courante, ce qui traite le changement d'année sans cas particulier.
 */
export function isDueThisWeekOrEarlier(
  scheduled: SubjectScheduled | undefined,
  now: Date = new Date(),
): boolean {
  if (!scheduled?.due_date) return false;
  return new Date(scheduled.due_date).getTime() <= endOfWeek(now).getTime();
}

/** Fin de la semaine courante (dimanche 23:59:59,999), semaine commençant le lundi. */
export function endOfWeek(now: Date = new Date()): Date {
  const end = new Date(now.getTime());
  // getDay() : 0 = dimanche. On ramène dimanche à 7 pour une semaine lundi → dimanche.
  const day = end.getDay() === 0 ? 7 : end.getDay();
  end.setDate(end.getDate() + (7 - day));
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Recherche sur le titre du sujet distribué, insensible à la casse (chaîne vide = tout passe). */
export function matchesTitle(scheduled: SubjectScheduled | undefined, text: string): boolean {
  if (!text) return true;
  if (!scheduled) return true;
  return (scheduled.title ?? '').toLowerCase().includes(text.toLowerCase());
}

/** Filtre « date de rendu entre deux bornes », bornes incluses, chacune facultative. */
export function matchesDueDateRange(
  scheduled: SubjectScheduled | undefined,
  begin?: Date | null,
  end?: Date | null,
): boolean {
  if (!scheduled) return false;
  const dueDate = scheduled.due_date;
  return (
    (!begin || isAfter(dueDate, begin, true)) && (!end || isAfter(end, dueDate, true))
  );
}

/**
 * Tri par date de rendu croissante, en recopiant au passage `dueDate` sur la copie — c'est ce que
 * faisait `orderByDueDate`, et c'est de ce champ que dépend `isPerformDisabled`.
 */
export function withDueDate(
  copies: SubjectCopy[],
  scheduledById: Map<number, SubjectScheduled>,
): SubjectCopy[] {
  return copies
    .map((copy) => {
      const scheduled = scheduledById.get(copy.subject_scheduled_id);
      return scheduled?.due_date ? { ...copy, dueDate: scheduled.due_date } : copy;
    })
    .sort((a, b) => time(a.dueDate) - time(b.dueDate));
}

function time(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}
