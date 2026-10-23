import type { SubjectCopy, SubjectScheduled } from './types';

/** Ce que le récapitulatif de début de copie montre à l'élève (parité `perform-summary.html` de l'ancienne IHM). */
export interface CopySummary {
  /** `training` : copie d'entraînement ; sinon le rendu est définitif (`one-shot`) ou répétable (`several`). */
  mode: 'training' | 'one-shot' | 'several';
  /** Date d'ouverture du rendu, seulement si elle est encore à venir. */
  futureStart: string | null;
  /** Échéance, ou `null` tant qu'elle n'est pas définie. */
  dueDate: string | null;
  /** Les questions s'affichent dans un ordre aléatoire. */
  randomOrder: boolean;
  /** Durée estimée en minutes, ou `null` si elle n'est pas définie. */
  durationMinutes: number | null;
  description: string;
}

/**
 * Récapitulatif d'une copie. Une copie d'entraînement n'affiche que la mention d'entraînement ; une copie notée affiche
 * l'avertissement de rendu (définitif ou non), l'éventuelle date d'ouverture à venir, l'échéance, l'ordre aléatoire, la durée
 * estimée et la consigne générale.
 * Exemple : sujet à envoi unique, échéance le 12/11, durée 30 min → `mode: 'one-shot'`, `durationMinutes: 30`.
 */
export function copySummary(scheduled: SubjectScheduled, copy: Pick<SubjectCopy, 'is_training_copy'>, now: Date = new Date()): CopySummary {
  const training = !!copy.is_training_copy;
  const begin = scheduled.begin_date ? new Date(scheduled.begin_date) : null;
  const duration = Number(scheduled.estimated_duration);
  return {
    mode: training ? 'training' : scheduled.is_one_shot_submit ? 'one-shot' : 'several',
    futureStart: !training && begin && !Number.isNaN(begin.getTime()) && begin.getTime() > now.getTime() ? (scheduled.begin_date ?? null) : null,
    dueDate: scheduled.due_date || null,
    randomOrder: !!scheduled.random_display,
    durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : null,
    description: scheduled.description ?? '',
  };
}

/** Une copie neuve (aucune position mémorisée) s'ouvre sur son récapitulatif ; une copie reprise rouvre là où l'élève s'était arrêté. */
export const startsOnSummary = (copy: Pick<SubjectCopy, 'current_grain_id'>): boolean => !copy.current_grain_id;
