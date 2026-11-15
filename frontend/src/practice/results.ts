import type { PracticeAttempt } from './api';

/** Le meilleur résultat par exercice, dans l'ordre de la dernière tentative. */
export function bestBySubject(attempts: PracticeAttempt[]) {
  const best = new Map<number, PracticeAttempt & { tries: number }>();
  for (const attempt of attempts) {
    const seen = best.get(attempt.subject_id);
    if (!seen) {
      best.set(attempt.subject_id, { ...attempt, tries: 1 });
      continue;
    }
    seen.tries++;
    const ratio = (a: PracticeAttempt) => (a.max_score > 0 ? a.score / a.max_score : 0);
    if (ratio(attempt) > ratio(seen)) {
      best.set(attempt.subject_id, { ...attempt, created: seen.created, tries: seen.tries });
    }
  }
  return [...best.values()];
}
