import { describe, expect, it } from 'vitest';

import { bestBySubject } from './results';

const attempt = (id: number, subject_id: number, score: number, created: string) => ({
  id,
  subject_id,
  title: `Sujet ${subject_id}`,
  score,
  max_score: 10,
  created,
});

describe('bestBySubject', () => {
  it('garde le meilleur score par exercice, à la place de sa dernière tentative', () => {
    const rows = bestBySubject([
      attempt(4, 1, 6, '2026-11-15T10:04'),
      attempt(3, 2, 9, '2026-11-15T10:03'),
      attempt(2, 1, 8, '2026-11-15T10:02'),
      attempt(1, 1, 4, '2026-11-15T10:01'),
    ]);
    expect(rows.map((r) => [r.subject_id, r.score, r.tries, r.created])).toEqual([
      [1, 8, 3, '2026-11-15T10:04'],
      [2, 9, 1, '2026-11-15T10:03'],
    ]);
  });
});
