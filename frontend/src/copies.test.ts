import { describe, expect, it } from 'vitest';

import {
  canCreateTraining,
  canPerformAsStudent,
  canViewAsStudent,
  copyState,
  dominoAction,
  endOfWeek,
  isAfter,
  isDueThisWeekOrEarlier,
  isFinished,
  isPerformDisabled,
  isTodo,
  isTooLate,
  matchesDueDateRange,
  matchesTitle,
  withDueDate,
} from './copies';
import { SubjectCopy, SubjectScheduled } from './types';

const copy = (over: Partial<SubjectCopy> = {}): SubjectCopy => ({
  id: 1,
  subject_scheduled_id: 10,
  owner: 'eleve-1',
  ...over,
});

const scheduled = (over: Partial<SubjectScheduled> = {}): SubjectScheduled => ({
  id: 10,
  subject_id: 100,
  owner: 'prof-1',
  title: 'Fractions',
  ...over,
});

const NOW = new Date('2026-03-18T10:00:00Z'); // un mercredi

describe('copyState', () => {
  it('range une copie jamais ouverte sur aucun état', () => {
    expect(copyState(copy())).toBeNull();
  });

  it('distingue commencée, rendue, en correction et corrigée', () => {
    expect(copyState(copy({ has_been_started: true }))).toBe('has_been_started');
    expect(copyState(copy({ submitted_date: '2026-03-01T08:00:00Z' }))).toBe('is_submitted');
    expect(copyState(copy({ is_correction_on_going: true }))).toBe('is_correction_on_going');
    expect(
      copyState(copy({ is_corrected: true, submitted_date: '2026-03-01T08:00:00Z' })),
    ).toBe('is_corrected');
  });

  it("exige le rendu pour qu'une copie soit dite corrigée", () => {
    // `is_corrected` sans date de rendu ne suffit pas : l'ordre d'évaluation le fait retomber sur
    // la correction en cours, puis sur « commencée ». C'est le comportement de l'IHM AngularJS.
    expect(copyState(copy({ is_corrected: true, has_been_started: true }))).toBe(
      'has_been_started',
    );
  });

  it('a trois états propres aux copies d’entraînement, « commencée » primant sur « rendue »', () => {
    expect(copyState(copy({ is_training_copy: true }))).toBe('is_sided');
    expect(
      copyState(copy({ is_training_copy: true, submitted_date: '2026-03-01T08:00:00Z' })),
    ).toBe('is_done');
    expect(
      copyState(
        copy({
          is_training_copy: true,
          has_been_started: true,
          submitted_date: '2026-03-01T08:00:00Z',
        }),
      ),
    ).toBe('is_on_going');
  });
});

describe('isAfter', () => {
  it('tranche l’égalité par valueEqual', () => {
    const d = '2026-03-18T10:00:00Z';
    expect(isAfter(d, d, true)).toBe(true);
    expect(isAfter(d, d, false)).toBe(false);
  });

  it('retombe sur valueEqual quand une date manque', () => {
    expect(isAfter(NOW, undefined, true)).toBe(true);
    expect(isAfter(NOW, undefined, false)).toBe(false);
  });

  it('ignore l’heure quand on le lui demande', () => {
    expect(isAfter('2026-03-18T23:00:00', '2026-03-18T01:00:00', false, true)).toBe(false);
    expect(isAfter('2026-03-18T23:00:00', '2026-03-18T01:00:00', false)).toBe(true);
  });
});

describe('canPerformAsStudent', () => {
  it('refuse avant la date d’ouverture', () => {
    expect(
      canPerformAsStudent(scheduled({ begin_date: '2026-03-20T08:00:00Z' }), copy(), NOW),
    ).toBe(false);
  });

  it('refuse un second envoi quand le sujet n’en autorise qu’un', () => {
    const s = scheduled({ begin_date: '2026-03-01T08:00:00Z', is_one_shot_submit: true });
    expect(canPerformAsStudent(s, copy({ submitted_date: '2026-03-10T08:00:00Z' }), NOW)).toBe(
      false,
    );
  });

  it('refuse pendant et après la correction', () => {
    const s = scheduled({ begin_date: '2026-03-01T08:00:00Z' });
    expect(canPerformAsStudent(s, copy({ is_correction_on_going: true }), NOW)).toBe(false);
    expect(canPerformAsStudent(s, copy({ is_corrected: true }), NOW)).toBe(false);
  });

  it('autorise une copie rendue quand plusieurs envois sont permis', () => {
    const s = scheduled({ begin_date: '2026-03-01T08:00:00Z' });
    expect(canPerformAsStudent(s, copy({ submitted_date: '2026-03-10T08:00:00Z' }), NOW)).toBe(
      true,
    );
  });
});

describe('canViewAsStudent', () => {
  const open = { begin_date: '2026-03-01T08:00:00Z' };

  it('refuse tant que la date de rendu n’est pas passée', () => {
    const s = scheduled({ ...open, due_date: '2026-03-25T08:00:00Z', has_automatic_display: true });
    expect(canViewAsStudent(s, copy({ is_corrected: true }), NOW)).toBe(false);
  });

  it('autorise après la date de rendu si l’affichage automatique est coché', () => {
    const s = scheduled({ ...open, due_date: '2026-03-10T08:00:00Z', has_automatic_display: true });
    expect(canViewAsStudent(s, copy(), NOW)).toBe(true);
  });

  it('sinon exige une copie corrigée', () => {
    const s = scheduled({ ...open, due_date: '2026-03-10T08:00:00Z' });
    expect(canViewAsStudent(s, copy(), NOW)).toBe(false);
    expect(canViewAsStudent(s, copy({ is_corrected: true }), NOW)).toBe(true);
  });
});

describe('dominoAction', () => {
  it('propose la reprise d’une copie d’entraînement commencée, le score sinon', () => {
    expect(dominoAction(scheduled(), copy({ is_training_copy: true, has_been_started: true }), NOW)).toBe(
      'perform',
    );
    expect(
      dominoAction(
        scheduled(),
        copy({ is_training_copy: true, submitted_date: '2026-03-10T08:00:00Z' }),
        NOW,
      ),
    ).toBe('training');
  });

  it('pour un sujet simple, ne regarde que la date d’ouverture', () => {
    const futur = scheduled({ type: 'simple', begin_date: '2026-03-25T08:00:00Z' });
    const ouvert = scheduled({ type: 'simple', begin_date: '2026-03-01T08:00:00Z' });
    expect(dominoAction(futur, copy(), NOW)).toBe('text');
    // Même corrigée : un sujet simple se rouvre, il n'a pas de correction en ligne.
    expect(dominoAction(ouvert, copy({ is_corrected: true }), NOW)).toBe('perform');
  });

  it('bascule de la passation à la consultation, puis à rien d’ouvrable', () => {
    const open = { begin_date: '2026-03-01T08:00:00Z' };
    expect(dominoAction(scheduled(open), copy(), NOW)).toBe('perform');
    expect(
      dominoAction(
        scheduled({ ...open, due_date: '2026-03-10T08:00:00Z' }),
        copy({ is_corrected: true, submitted_date: '2026-03-05T08:00:00Z' }),
        NOW,
      ),
    ).toBe('view');
    // Corrigée mais date de rendu non atteinte : ni passation, ni consultation.
    expect(
      dominoAction(
        scheduled({ ...open, due_date: '2026-03-25T08:00:00Z' }),
        copy({ is_corrected: true, submitted_date: '2026-03-05T08:00:00Z' }),
        NOW,
      ),
    ).toBe('text');
  });
});

describe('états dérivés', () => {
  it('signale le retard uniquement sur une copie non rendue', () => {
    const s = scheduled({ due_date: '2026-03-10T08:00:00Z' });
    expect(isTooLate(s, copy(), NOW)).toBe(true);
    expect(isTooLate(s, copy({ submitted_date: '2026-03-09T08:00:00Z' }), NOW)).toBe(false);
  });

  it('inerte le bouton d’une copie rendue dont le délai est échu', () => {
    expect(
      isPerformDisabled(
        copy({ dueDate: '2026-03-10T08:00:00Z', submitted_date: '2026-03-09T08:00:00Z' }),
        NOW,
      ),
    ).toBe(true);
    // Sans rendu, le bouton reste actif : l'élève est en retard mais peut encore déposer.
    expect(isPerformDisabled(copy({ dueDate: '2026-03-10T08:00:00Z' }), NOW)).toBe(false);
  });

  it('n’offre l’entraînement qu’après correction et date de rendu', () => {
    const permis = { is_training_permitted: true, due_date: '2026-03-10T08:00:00Z' };
    expect(canCreateTraining(scheduled(permis), copy({ is_corrected: true }), NOW)).toBe(true);
    expect(canCreateTraining(scheduled(permis), copy(), NOW)).toBe(false);
    expect(
      canCreateTraining(scheduled({ due_date: '2026-03-10T08:00:00Z' }), copy({ is_corrected: true }), NOW),
    ).toBe(false);
  });
});

describe('répartition en onglets', () => {
  it('exclut les copies d’entraînement de « à faire » et de « terminés »', () => {
    const entrainement = copy({ is_training_copy: true, has_been_started: true });
    expect(isTodo(entrainement)).toBe(false);
    expect(isFinished(entrainement)).toBe(false);
  });

  it('fait passer une copie de « à faire » à « terminés » au rendu', () => {
    expect(isTodo(copy({ has_been_started: true }))).toBe(true);
    expect(isFinished(copy({ has_been_started: true }))).toBe(false);
    const rendue = copy({ submitted_date: '2026-03-10T08:00:00Z' });
    expect(isTodo(rendue)).toBe(false);
    expect(isFinished(rendue)).toBe(true);
  });
});

describe('colonne « cette semaine »', () => {
  it('retient ce qui est dû avant la fin de la semaine courante', () => {
    // NOW est un mercredi : la semaine court jusqu'au dimanche 22 mars inclus.
    expect(endOfWeek(NOW).toISOString().slice(0, 10)).toBe('2026-03-22');
    expect(isDueThisWeekOrEarlier(scheduled({ due_date: '2026-03-20T08:00:00Z' }), NOW)).toBe(true);
    expect(isDueThisWeekOrEarlier(scheduled({ due_date: '2026-03-10T08:00:00Z' }), NOW)).toBe(true);
    expect(isDueThisWeekOrEarlier(scheduled({ due_date: '2026-03-24T08:00:00Z' }), NOW)).toBe(false);
  });

  it('écarte un sujet sans date de rendu', () => {
    expect(isDueThisWeekOrEarlier(scheduled(), NOW)).toBe(false);
    expect(isDueThisWeekOrEarlier(undefined, NOW)).toBe(false);
  });
});

describe('recherche et tri', () => {
  it('cherche dans le titre sans tenir compte de la casse', () => {
    expect(matchesTitle(scheduled({ title: 'Les Fractions' }), 'fraction')).toBe(true);
    expect(matchesTitle(scheduled({ title: 'Les Fractions' }), 'géométrie')).toBe(false);
    expect(matchesTitle(scheduled({ title: 'Les Fractions' }), '')).toBe(true);
  });

  it('borne par date de rendu, bornes incluses', () => {
    const s = scheduled({ due_date: '2026-03-18T10:00:00Z' });
    expect(matchesDueDateRange(s, new Date('2026-03-18T10:00:00Z'), null)).toBe(true);
    expect(matchesDueDateRange(s, new Date('2026-03-19T00:00:00Z'), null)).toBe(false);
    expect(matchesDueDateRange(s, null, new Date('2026-03-18T10:00:00Z'))).toBe(true);
  });

  it('trie par date de rendu et recopie dueDate, les copies sans date en dernier', () => {
    const byId = new Map<number, SubjectScheduled>([
      [10, scheduled({ id: 10, due_date: '2026-03-20T08:00:00Z' })],
      [11, scheduled({ id: 11, due_date: '2026-03-12T08:00:00Z' })],
      [12, scheduled({ id: 12 })],
    ]);
    const sorted = withDueDate(
      [
        copy({ id: 1, subject_scheduled_id: 10 }),
        copy({ id: 2, subject_scheduled_id: 12 }),
        copy({ id: 3, subject_scheduled_id: 11 }),
      ],
      byId,
    );
    expect(sorted.map((c) => c.id)).toEqual([3, 1, 2]);
    expect(sorted[0].dueDate).toBe('2026-03-12T08:00:00Z');
  });
});
