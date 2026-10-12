import { describe, expect, it } from 'vitest';

import {
  applyPilotageEvent,
  canActOn,
  formatRemaining,
  initialStudentPilotage,
  isPilotageReadOnly,
  pilotageUrl,
  studentRemainingSeconds,
  StudentPilotage,
  teacherRemaining,
} from './pilotage';

const NOW = Date.parse('2026-03-18T10:00:00Z');

const state = (over: Partial<StudentPilotage> = {}): StudentPilotage => ({
  sessionState: 'en_cours',
  pausedAt: null,
  pausedDurationSeconds: 0,
  extraTimeMinutes: 0,
  isForcedSubmit: false,
  messages: [],
  ...over,
});

describe('canal', () => {
  it('vise le port dédié en local, et le relais du frontal ailleurs', () => {
    expect(pilotageUrl(7, { hostname: 'localhost', host: 'localhost:8090' })).toBe(
      'ws://localhost:8106/exercizer/pilotage/7',
    );
    expect(pilotageUrl(7, { hostname: 'ent.example', host: 'ent.example' })).toBe(
      'wss://ent.example/exercizer/pilotage/realtime/7',
    );
  });
});

describe('temps restant', () => {
  it('s’écrit en minutes et secondes, signe compris', () => {
    expect(formatRemaining(125)).toBe('2:05');
    expect(formatRemaining(-61)).toBe('-1:01');
    expect(formatRemaining(0)).toBe('0:00');
  });

  it('décompte chez l’enseignant depuis la dernière réponse du serveur, sauf en pause', () => {
    const student = { copyId: 1, studentId: 'a', studentName: 'A', state: 'started', remainingSeconds: 300 };
    expect(teacherRemaining(student, 'en_cours', NOW - 30_000, NOW)).toBe('4:30');
    expect(teacherRemaining(student, 'en_pause', NOW - 30_000, NOW)).toBe('5:00');
    expect(teacherRemaining({ ...student, remainingSeconds: null }, 'en_cours', NOW, NOW)).toBe('');
  });

  it('ajoute chez l’élève le temps supplémentaire et celui des pauses', () => {
    const due = '2026-03-18T10:10:00Z';
    expect(studentRemainingSeconds(due, state(), NOW)).toBe(600);
    expect(studentRemainingSeconds(due, state({ extraTimeMinutes: 5 }), NOW)).toBe(900);
    expect(studentRemainingSeconds(due, state({ pausedDurationSeconds: 60 }), NOW)).toBe(660);
    expect(studentRemainingSeconds(undefined, state(), NOW)).toBeNull();
  });

  it('gèle le décompte pendant une pause', () => {
    const due = '2026-03-18T10:10:00Z';
    const paused = state({ sessionState: 'en_pause', pausedAt: '2026-03-18T09:58:00Z' });
    expect(studentRemainingSeconds(due, paused, NOW)).toBe(720);
    expect(studentRemainingSeconds(due, paused, NOW + 60_000)).toBe(720);
  });
});

describe('événements reçus par l’élève', () => {
  it('lit l’état initial sur la distribution et la copie', () => {
    const initial = initialStudentPilotage(
      { id: 1, subject_id: 1, owner: 'p', title: 't', session_state: 'en_pause', paused_at: 'x' },
      { id: 2, subject_scheduled_id: 1, owner: 'e', extra_time_minutes: 3, is_forced_submit: true },
    );
    expect(initial).toMatchObject({
      sessionState: 'en_pause',
      pausedAt: 'x',
      extraTimeMinutes: 3,
      isForcedSubmit: true,
    });
    expect(isPilotageReadOnly(initial)).toBe(true);
  });

  it('met en pause puis reprend en comptant la durée de la pause', () => {
    const paused = applyPilotageEvent(state(), { type: 'pause' }, 'moi', NOW);
    expect(paused.sessionState).toBe('en_pause');
    expect(isPilotageReadOnly(paused)).toBe(true);
    const resumed = applyPilotageEvent(paused, { type: 'resume' }, 'moi', NOW + 90_000);
    expect(resumed).toMatchObject({
      sessionState: 'en_cours',
      pausedAt: null,
      pausedDurationSeconds: 90,
    });
    expect(isPilotageReadOnly(resumed)).toBe(false);
  });

  it('ignore une pause déjà posée et une reprise sans pause', () => {
    const paused = state({ sessionState: 'en_pause', pausedAt: 'x' });
    expect(applyPilotageEvent(paused, { type: 'pause' }, 'moi', NOW)).toBe(paused);
    const running = state();
    expect(applyPilotageEvent(running, { type: 'resume' }, 'moi', NOW)).toBe(running);
  });

  it('ne prolonge que l’élève concerné', () => {
    const event = {
      type: 'extend-time',
      updatedCopies: [{ owner: 'autre', extra_time_minutes: 10 }],
    };
    expect(applyPilotageEvent(state(), event, 'moi', NOW).extraTimeMinutes).toBe(0);
    expect(applyPilotageEvent(state(), event, 'autre', NOW).extraTimeMinutes).toBe(10);
  });

  it('ne remet d’office que la copie visée', () => {
    const event = { type: 'force-submit', studentId: 'moi' };
    expect(applyPilotageEvent(state(), event, 'moi', NOW).isForcedSubmit).toBe(true);
    expect(applyPilotageEvent(state(), event, 'autre', NOW).isForcedSubmit).toBe(false);
  });

  it('reçoit les messages de la classe et les siens, pas ceux d’un camarade', () => {
    const toAll = applyPilotageEvent(state(), { type: 'message', message: 'Dix minutes' }, 'moi', NOW);
    expect(toAll.messages.map((message) => message.text)).toEqual(['Dix minutes']);
    const toOther = applyPilotageEvent(
      state(),
      { type: 'message', message: 'Chut', studentId: 'autre' },
      'moi',
      NOW,
    );
    expect(toOther.messages).toEqual([]);
  });
});

describe('actions de l’enseignant', () => {
  it('ne propose plus rien sur une copie rendue', () => {
    const student = { copyId: 1, studentId: 'a', studentName: 'A', state: 'started' };
    expect(canActOn(student)).toBe(true);
    expect(canActOn({ ...student, state: 'submitted' })).toBe(false);
    expect(canActOn({ ...student, state: 'corrected' })).toBe(false);
  });
});
