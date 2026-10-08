import { describe, expect, it } from 'vitest';

import {
  groupCopiesByScheduled,
  isFullyCorrected,
  lastCopyActivity,
  notCorrectedCount,
  recipientsLabel,
  submissionCount,
} from './corrections';
import { SubjectCopy, SubjectScheduled } from './types';

const copy = (over: Partial<SubjectCopy> = {}): SubjectCopy => ({
  id: 1,
  subject_scheduled_id: 10,
  owner: 'eleve',
  ...over,
});

const scheduled = (over: Partial<SubjectScheduled> = {}): SubjectScheduled => ({
  id: 10,
  subject_id: 100,
  owner: 'prof',
  title: 'Fractions',
  ...over,
});

const NOW = new Date('2026-03-18T10:00:00Z');

describe('décomptes', () => {
  const copies = [
    copy({ id: 1, submitted_date: '2026-03-10T08:00:00Z', is_corrected: true }),
    copy({ id: 2, submitted_date: '2026-03-11T08:00:00Z' }),
    copy({ id: 3 }),
    copy({ id: 4, is_training_copy: true, submitted_date: '2026-03-12T08:00:00Z' }),
  ];

  it('ignore les copies d’entraînement', () => {
    expect(submissionCount(copies)).toEqual({ submitted: 2, total: 3 });
  });

  it('compte les copies rendues restant à corriger', () => {
    expect(notCorrectedCount(copies)).toBe(1);
  });
});

describe('isFullyCorrected', () => {
  it('exige que toutes les copies attendues soient corrigées', () => {
    const copies = [copy({ id: 1, is_corrected: true }), copy({ id: 2 })];
    expect(isFullyCorrected(scheduled(), copies, NOW)).toBe(false);
    expect(isFullyCorrected(scheduled(), [copy({ id: 1, is_corrected: true })], NOW)).toBe(true);
  });

  it('attend la date de mise à disposition du corrigé', () => {
    const corrigee = [copy({ id: 1, is_corrected: true })];
    expect(
      isFullyCorrected(scheduled({ corrected_date: '2026-03-25T08:00:00Z' }), corrigee, NOW),
    ).toBe(false);
    expect(
      isFullyCorrected(scheduled({ corrected_date: '2026-03-10T08:00:00Z' }), corrigee, NOW),
    ).toBe(true);
  });

  it('ne dit pas « corrigé » d’une distribution sans copie', () => {
    expect(isFullyCorrected(scheduled(), [], NOW)).toBe(false);
    expect(isFullyCorrected(scheduled(), [copy({ is_training_copy: true })], NOW)).toBe(false);
  });
});

describe('lastCopyActivity', () => {
  it('retient la date la plus récente, en retombant sur la création', () => {
    expect(
      lastCopyActivity([
        copy({ id: 1, modified: '2026-03-10T08:00:00Z' }),
        copy({ id: 2, modified: '2026-03-14T08:00:00Z' }),
        copy({ id: 3, created: '2026-03-12T08:00:00Z' }),
      ]),
    ).toBe('2026-03-14T08:00:00Z');
  });

  it('ne renvoie rien quand aucune copie n’a de date', () => {
    expect(lastCopyActivity([copy()])).toBeUndefined();
    expect(lastCopyActivity([])).toBeUndefined();
  });
});

describe('groupCopiesByScheduled', () => {
  it('regroupe par distribution', () => {
    const grouped = groupCopiesByScheduled([
      copy({ id: 1, subject_scheduled_id: 10 }),
      copy({ id: 2, subject_scheduled_id: 11 }),
      copy({ id: 3, subject_scheduled_id: 10 }),
    ]);
    expect(grouped.get(10)?.map((c) => c.id)).toEqual([1, 3]);
    expect(grouped.get(11)?.map((c) => c.id)).toEqual([2]);
  });
});

describe('recipientsLabel', () => {
  it('cite les premiers destinataires et abrège le reste', () => {
    const s = scheduled({
      scheduled_at: {
        groupList: [{ name: '6eA' }, { name: '6eB' }],
        userList: [{ name: 'Jean Dupont' }],
      },
    });
    expect(recipientsLabel(s)).toBe('6eA, 6eB…');
    expect(recipientsLabel(s, 3)).toBe('6eA, 6eB, Jean Dupont');
  });

  it('ne renvoie rien sans destinataire', () => {
    expect(recipientsLabel(scheduled())).toBe('');
  });
});
