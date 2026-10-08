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
