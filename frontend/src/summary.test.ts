import { describe, expect, it } from 'vitest';

import { copySummary, startsOnSummary } from './summary';
import type { SubjectScheduled } from './types';

const base = { id: 1, subject_id: 1, owner: 'o', title: 'T' } as SubjectScheduled;
const now = new Date('2026-10-23T10:00:00');

describe('copySummary', () => {
  it('copie notée à envoi unique : avertissement définitif, échéance, durée, consigne', () => {
    const s = copySummary({ ...base, is_one_shot_submit: true, due_date: '2026-11-12T17:00:00', estimated_duration: '30', description: 'Lisez bien.' }, {}, now);
    expect(s).toMatchObject({ mode: 'one-shot', dueDate: '2026-11-12T17:00:00', durationMinutes: 30, randomOrder: false, description: 'Lisez bien.', futureStart: null });
  });
  it('envoi répétable par défaut, ordre aléatoire signalé', () => {
    expect(copySummary({ ...base, random_display: true }, {}, now)).toMatchObject({ mode: 'several', randomOrder: true });
  });
  it('durée absente, nulle ou illisible : non définie', () => {
    expect(copySummary({ ...base }, {}, now).durationMinutes).toBeNull();
    expect(copySummary({ ...base, estimated_duration: '0' }, {}, now).durationMinutes).toBeNull();
    expect(copySummary({ ...base, estimated_duration: 'abc' }, {}, now).durationMinutes).toBeNull();
  });
  it('échéance non définie : null', () => {
    expect(copySummary({ ...base, due_date: '' }, {}, now).dueDate).toBeNull();
  });
  it('date d’ouverture à venir seulement', () => {
    expect(copySummary({ ...base, begin_date: '2026-10-25T08:00:00' }, {}, now).futureStart).toBe('2026-10-25T08:00:00');
    expect(copySummary({ ...base, begin_date: '2026-10-20T08:00:00' }, {}, now).futureStart).toBeNull();
  });
  it('copie d’entraînement : mention d’entraînement, ni date à venir', () => {
    expect(copySummary({ ...base, is_one_shot_submit: true, begin_date: '2026-10-25T08:00:00' }, { is_training_copy: true }, now)).toMatchObject({ mode: 'training', futureStart: null });
  });
});

describe('startsOnSummary', () => {
  it('une copie neuve s’ouvre sur le récapitulatif, une copie reprise non', () => {
    expect(startsOnSummary({ current_grain_id: null })).toBe(true);
    expect(startsOnSummary({})).toBe(true);
    expect(startsOnSummary({ current_grain_id: 42 })).toBe(false);
  });
});
