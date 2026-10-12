/**
 * Pilotage en direct d'une séance — portage de `PilotageService` et des règles des deux écrans
 * qui s'y branchent (`teacherDashboardPilotage`, `subjectPerformCopyPilotage`).
 *
 * L'enseignant met la séance en pause, prolonge, force une remise, envoie un message ; l'élève
 * le voit aussitôt. Le canal est un WebSocket, avec un repli par sondage quand il ne s'ouvre pas
 * (proxy, pare-feu) — c'est à l'écran de sonder, ce module ne fait que dire si le canal tient.
 *
 * Les calculs de temps sont ceux du serveur, repris à l'identique pour l'écran de l'élève qui n'a
 * pas le droit de demander l'état consolidé (réservé au propriétaire de la distribution).
 */

import { SubjectCopy, SubjectScheduled } from './types';

/** Un élève, tel que l'état consolidé du serveur le décrit à l'enseignant. */
export interface PilotageStudent {
  copyId: number;
  studentId: string;
  studentName: string;
  hasBeenStarted?: boolean;
  submittedDate?: string | null;
  isCorrectionOnGoing?: boolean;
  isCorrected?: boolean;
  extraTimeMinutes?: number;
  isForcedSubmit?: boolean;
  /** `not_started` | `started` | `submitted` | `corrected`. */
  state: string;
  /** Absent hors séance bornée. Négatif : le temps est dépassé. */
  remainingSeconds?: number | null;
}

export interface PilotageState {
  subjectScheduledId: number;
  title: string;
  /** `en_cours` | `en_pause`. */
  sessionState: string;
  beginDate?: string;
  dueDate?: string;
  pausedDurationSeconds?: number;
  students: PilotageStudent[];
}

/** Ce que le canal transporte. `type` vaut `pause`, `resume`, `extend-time`, `force-submit` ou `message`. */
export interface PilotageEvent {
  type?: string;
  studentId?: string | null;
  message?: string;
  updatedCopies?: Array<{ owner: string; extra_time_minutes: number }>;
}

/** Sondage de repli, et délai laissé au canal pour s'ouvrir avant d'y recourir. */
export const POLL_INTERVAL_MS = 20_000;
export const WS_OPEN_TIMEOUT_MS = 5_000;

/**
 * Port du serveur WebSocket du pilotage (bloc `real-time` de la configuration du module). Il
 * n'existe pas de route pour le découvrir : en local on s'y connecte directement, ailleurs le
 * frontal le relaie sous `/exercizer/pilotage/realtime/`.
 */
const PILOTAGE_WS_PORT = 8106;

export function pilotageUrl(subjectScheduledId: number, location: Pick<Location, 'hostname' | 'host'>): string {
  return location.hostname === 'localhost'
    ? `ws://${location.hostname}:${PILOTAGE_WS_PORT}/exercizer/pilotage/${subjectScheduledId}`
    : `wss://${location.host}/exercizer/pilotage/realtime/${subjectScheduledId}`;
}

/**
 * Ouvre le canal. `onStatusChange` dit s'il tient ; une trame illisible est ignorée — le sondage
 * de repli fera de toute façon avancer l'affichage.
 */
export function connectPilotage(
  subjectScheduledId: number,
  onEvent: (event: PilotageEvent) => void,
  onStatusChange: (connected: boolean) => void,
): { close: () => void } {
  let closedByCaller = false;
  let socket: WebSocket;
  try {
    socket = new WebSocket(pilotageUrl(subjectScheduledId, window.location));
  } catch {
    onStatusChange(false);
    return { close: () => undefined };
  }
  socket.onopen = () => {
    if (!closedByCaller) onStatusChange(true);
  };
  socket.onmessage = (message) => {
    try {
      onEvent(JSON.parse(String(message.data)) as PilotageEvent);
    } catch {
      // Trame malformée.
    }
  };
  socket.onclose = () => {
    if (!closedByCaller) onStatusChange(false);
  };
  socket.onerror = () => {
    if (!closedByCaller) onStatusChange(false);
  };
  return {
    close: () => {
      closedByCaller = true;
      try {
        socket.close();
      } catch {
        // Déjà fermé.
      }
    },
  };
}

/** `m:ss`, précédé d'un signe moins quand le temps est dépassé. */
export function formatRemaining(seconds: number): string {
  const sign = seconds < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(seconds));
  const rest = absolute % 60;
  return `${sign}${Math.floor(absolute / 60)}:${rest < 10 ? '0' : ''}${rest}`;
}

/**
 * Le temps restant affiché à l'enseignant : celui du serveur, moins ce qui s'est écoulé depuis
 * qu'on l'a reçu — sauf en pause, où le temps ne court pas.
 */
export function teacherRemaining(
  student: PilotageStudent,
  sessionState: string,
  fetchedAt: number,
  now: number,
): string {
  if (student.remainingSeconds === undefined || student.remainingSeconds === null) return '';
  const elapsed = sessionState === 'en_cours' ? Math.floor((now - fetchedAt) / 1000) : 0;
  return formatRemaining(student.remainingSeconds - elapsed);
}

/** Un élève qui a rendu n'a plus rien à prolonger ni à faire rendre. */
export const canActOn = (student: PilotageStudent): boolean =>
  student.state !== 'submitted' && student.state !== 'corrected';

/** Ce que l'écran de l'élève retient du pilotage de sa séance. */
export interface StudentPilotage {
  sessionState: string;
  pausedAt: string | null;
  pausedDurationSeconds: number;
  extraTimeMinutes: number;
  isForcedSubmit: boolean;
  messages: Array<{ id: string; text: string }>;
}

export function initialStudentPilotage(scheduled: SubjectScheduled, copy: SubjectCopy): StudentPilotage {
  return {
    sessionState: scheduled.session_state || 'en_cours',
    pausedAt: scheduled.paused_at ?? null,
    pausedDurationSeconds: scheduled.paused_duration_seconds ?? 0,
    extraTimeMinutes: copy.extra_time_minutes ?? 0,
    isForcedSubmit: copy.is_forced_submit === true,
    messages: [],
  };
}

/** L'élève ne peut plus écrire : la séance est en pause, ou sa copie a été remise d'office. */
export const isPilotageReadOnly = (state: StudentPilotage): boolean =>
  state.sessionState === 'en_pause' || state.isForcedSubmit;

/**
 * Applique un événement reçu à l'état de l'élève. Sans effet quand il ne le concerne pas : une
 * prolongation ou un message visent parfois un seul camarade.
 */
export function applyPilotageEvent(
  state: StudentPilotage,
  event: PilotageEvent,
  userId: string | undefined,
  now: number = Date.now(),
): StudentPilotage {
  switch (event.type) {
    case 'pause':
      if (state.sessionState === 'en_pause') return state;
      return { ...state, sessionState: 'en_pause', pausedAt: new Date(now).toISOString() };
    case 'resume': {
      if (state.sessionState !== 'en_pause') return state;
      const pausedAt = state.pausedAt ? new Date(state.pausedAt).getTime() : now;
      return {
        ...state,
        sessionState: 'en_cours',
        pausedAt: null,
        pausedDurationSeconds:
          state.pausedDurationSeconds + Math.max(0, Math.floor((now - pausedAt) / 1000)),
      };
    }
    case 'extend-time': {
      const mine = (event.updatedCopies ?? []).find((copy) => copy.owner === userId);
      return mine ? { ...state, extraTimeMinutes: mine.extra_time_minutes } : state;
    }
    case 'force-submit':
      return event.studentId === userId ? { ...state, isForcedSubmit: true } : state;
    case 'message':
      if (event.studentId && event.studentId !== userId) return state;
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: `${now}-${state.messages.length}`, text: event.message ?? '' },
        ],
      };
    default:
      return state;
  }
}

/**
 * Le temps restant à l'élève, en secondes — même formule que le serveur : l'échéance, plus le
 * temps supplémentaire, plus tout ce que les pauses ont mangé. Pendant une pause, la part « pause
 * en cours » grandit aussi vite que le temps passe : le décompte est gelé.
 */
export function studentRemainingSeconds(
  dueDate: string | undefined,
  state: StudentPilotage,
  now: number = Date.now(),
): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return null;
  let paused = state.pausedDurationSeconds * 1000;
  if (state.sessionState === 'en_pause' && state.pausedAt) {
    paused += Math.max(0, now - new Date(state.pausedAt).getTime());
  }
  return Math.floor((due + state.extraTimeMinutes * 60_000 + paused - now) / 1000);
}
