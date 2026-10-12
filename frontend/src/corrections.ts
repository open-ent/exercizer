/**
 * Règles d'avancement d'une distribution, côté enseignant — portage des fonctions d'agrégat de
 * `teacherDashboardCorrectionSubjectScheduledList` et `teacherDashboardCorrectionCopyList`.
 *
 * Toutes ignorent les copies d'entraînement : celles-ci sont à l'initiative de l'élève et
 * n'entrent dans aucun décompte de l'enseignant.
 */

import { isAfter } from './copies';
import { SubjectCopy, SubjectScheduled } from './types';

/** Les copies attendues d'une distribution (hors entraînement). */
export function gradedCopies(copies: SubjectCopy[]): SubjectCopy[] {
  return copies.filter((copy) => !copy.is_training_copy);
}

/** Combien de copies ont été rendues, sur combien d'attendues. */
export function submissionCount(copies: SubjectCopy[]): { submitted: number; total: number } {
  const graded = gradedCopies(copies);
  return {
    submitted: graded.filter((copy) => copy.submitted_date).length,
    total: graded.length,
  };
}

/** Combien de copies rendues restent à corriger — le chiffre qui décide de relancer ou non. */
export function notCorrectedCount(copies: SubjectCopy[]): number {
  return gradedCopies(copies).filter((copy) => copy.submitted_date && !copy.is_corrected).length;
}

/**
 * La distribution est-elle soldée ?
 *
 * Deux conditions : TOUTES les copies attendues sont corrigées, et la date de mise à disposition
 * du corrigé est passée (ou il n'y en a pas). Une distribution sans aucune copie n'est pas
 * corrigée : `isListCopyCorrected` partait de `true`, mais la liste vide signifie ici « personne
 * n'a encore de copie », pas « tout est fait ».
 */
export function isFullyCorrected(
  scheduled: SubjectScheduled,
  copies: SubjectCopy[],
  now: Date = new Date(),
): boolean {
  const graded = gradedCopies(copies);
  if (graded.length === 0) return false;
  if (!graded.every((copy) => copy.is_corrected)) return false;
  return !scheduled.corrected_date || isAfter(now, scheduled.corrected_date, false);
}

/** Clé i18n de l'état d'une distribution. */
export function scheduledStateKey(
  scheduled: SubjectScheduled,
  copies: SubjectCopy[],
  now: Date = new Date(),
): string {
  return isFullyCorrected(scheduled, copies, now)
    ? 'exercizer.copy.state.corrected'
    : 'exercizer.copy.state.notcorrected';
}

/**
 * Date de la dernière activité d'un élève sur cette distribution — ce que la vignette affiche
 * sous « Modifié le ». C'est la plus récente des dates de modification des copies, et non la date
 * de modification de la distribution elle-même.
 */
export function lastCopyActivity(copies: SubjectCopy[]): string | undefined {
  let latest: string | undefined;
  for (const copy of copies) {
    const date = copy.modified ?? copy.created;
    if (!date) continue;
    if (!latest || new Date(date).getTime() > new Date(latest).getTime()) latest = date;
  }
  return latest;
}

/** Regroupe les copies par distribution, pour n'avoir à parcourir la liste qu'une fois. */
export function groupCopiesByScheduled(copies: SubjectCopy[]): Map<number, SubjectCopy[]> {
  const byScheduled = new Map<number, SubjectCopy[]>();
  for (const copy of copies) {
    const list = byScheduled.get(copy.subject_scheduled_id);
    if (list) list.push(copy);
    else byScheduled.set(copy.subject_scheduled_id, [copy]);
  }
  return byScheduled;
}

/** Les destinataires d'une distribution, en une ligne (« 6eA, Jean Dupont… »). */
export function recipientsLabel(scheduled: SubjectScheduled, max = 2): string {
  const names = [
    ...(scheduled.scheduled_at?.groupList ?? []).map((group) => group.name),
    ...(scheduled.scheduled_at?.userList ?? []).map((user) => user.name),
  ];
  if (names.length === 0) return '';
  return names.length > max ? `${names.slice(0, max).join(', ')}…` : names.join(', ');
}

/** Copie RENDUE après l'échéance — la colonne « Rendu le » la signale (`tooLate`). */
export function submittedLate(scheduled: SubjectScheduled, copy: SubjectCopy): boolean {
  if (!copy.submitted_date || !scheduled.due_date) return false;
  return isAfter(copy.submitted_date, scheduled.due_date, false);
}

/**
 * Le pilotage en direct n'a de sens que PENDANT la séance : avant ou après, il n'y a rien à
 * mettre en pause ni à prolonger (`isPilotageAvailable`).
 */
export function isPilotageAvailable(scheduled: SubjectScheduled, now: Date = new Date()): boolean {
  if (!scheduled.begin_date || !scheduled.due_date) return false;
  const time = now.getTime();
  return (
    time >= new Date(scheduled.begin_date).getTime() &&
    time <= new Date(scheduled.due_date).getTime()
  );
}

/**
 * Les copies dont le score automatique reste à calculer quand l'enseignant ouvre la liste —
 * `GrainCopyService#getListByNotCorrectedSubjectCopies`.
 *
 * Avec « un seul envoi », le score est figé au premier calcul ; sinon l'élève peut encore
 * modifier sa copie, et le score est recalculé tant que l'enseignant n'a pas commencé à corriger.
 */
export function copiesToScore(scheduled: SubjectScheduled, copies: SubjectCopy[]): SubjectCopy[] {
  return copies.filter((copy) => {
    if (!copy.submitted_date) return false;
    if (scheduled.is_one_shot_submit) return copy.calculated_score === null;
    return !copy.is_correction_on_going && !copy.is_corrected;
  });
}

/** Moyenne des notes finales des copies corrigées — l'encart « Statistiques du sujet ». */
export function correctedAverage(copies: SubjectCopy[]): { average: number | null; nb: number } {
  const corrected = copies.filter((copy) => copy.is_corrected);
  if (corrected.length === 0) return { average: null, nb: 0 };
  const sum = corrected.reduce((total, copy) => total + (copy.final_score ?? 0), 0);
  return { average: sum / corrected.length, nb: corrected.length };
}

// ── Tri des tableaux de copies ────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc';

export interface SortState<Field extends string> {
  field: Field;
  direction: SortDirection;
}

/** Clic sur un en-tête : même colonne → on inverse, autre colonne → croissant. */
export function nextSort<Field extends string>(
  current: SortState<Field>,
  field: Field,
): SortState<Field> {
  if (current.field !== field) return { field, direction: 'asc' };
  return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

/**
 * Trie sans modifier la liste. Les valeurs absentes vont TOUJOURS en fin de liste, quel que soit
 * le sens : l'ancienne IHM les renvoyait en tête en ordre décroissant, ce qui poussait les élèves
 * sans copie rendue au-dessus de ceux qu'on cherchait à classer.
 */
export function sortBy<T>(
  items: T[],
  value: (item: T) => string | number | null | undefined,
  direction: SortDirection,
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const missingA = va === null || va === undefined || va === '';
    const missingB = vb === null || vb === undefined || vb === '';
    if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1;
    if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
    return sign * String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
  });
}
