/**
 * Site public d'entraînement : appels aux routes /exercizer/practice/* (sans session requise).
 * Le score vient TOUJOURS du serveur : le navigateur n'a pas les réponses attendues.
 */
import { GrainCopy, GrainCustomCopyData } from '../types';

export interface PracticeConfig {
  title: string;
  signupUrl: string;
  entUrl: string;
}

export interface PracticeBoot {
  page: 'home' | 'exercise';
  subjectId?: number;
  config: PracticeConfig;
}

export interface PracticeSubject {
  id: number;
  title: string;
  description?: string | null;
  level_ids?: number[];
  discipline_ids?: number[];
  question_count?: number;
  alignments?: Array<{ id: string; code?: string | null; label?: string | null }>;
}

export interface PracticeDetail {
  subject: PracticeSubject;
  /** Copies VIERGES des grains : la forme d'une copie d'élève, sans réponse attendue. */
  grains: Array<Pick<GrainCopy, 'grain_type_id' | 'order_by' | 'grain_copy_data'> & { id: number; section_id?: number | null }>;
  sections: Array<{ id: number; title: string; description?: string | null; order_by: number }>;
}

export interface GrainResult {
  grain_id: number;
  score: number;
  max_score: number;
  answered: boolean;
  answers: Record<string, boolean | null>;
  answer_explanation?: string;
}

export interface CheckResult {
  score: number;
  max_score: number;
  recorded: boolean;
  grains: GrainResult[];
}

export interface Referential {
  levels: Array<{ id: number; code: string; label: string; rank?: number | null }>;
  disciplines: Array<{ id: number; code: string; label: string }>;
}

const BASE = '/exercizer/practice';

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as T;
}

/** Le jeton XSRF d'une session ouverte : entcore l'exige pour un POST authentifié. */
function xsrf(): Record<string, string> {
  const token = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.split('=')[1];
  return token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {};
}

export const readBoot = (): PracticeBoot => {
  const fallback: PracticeBoot = { page: 'home', config: { title: 'Exercices', signupUrl: '/auth/login', entUrl: '' } };
  try {
    return { ...fallback, ...(JSON.parse(document.getElementById('practice-boot')?.textContent ?? '{}') as PracticeBoot) };
  } catch {
    return fallback;
  }
};

export const getReferential = () => fetch(`${BASE}/referential`).then((r) => json<Referential>(r));

export const searchPublic = (params: { q?: string; levels?: number[]; disciplines?: number[]; offset?: number }) => {
  const search = new URLSearchParams({ limit: '24', offset: String(params.offset ?? 0) });
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.levels?.length) search.set('levels', params.levels.join(','));
  if (params.disciplines?.length) search.set('disciplines', params.disciplines.join(','));
  return fetch(`${BASE}/catalog?${search}`).then((r) => json<{ total: number; subjects: PracticeSubject[] }>(r));
};

export const getPublicSubject = (id: number) => fetch(`${BASE}/subject/${id}`).then((r) => json<PracticeDetail>(r));

export const checkAnswers = (id: number, answers: Array<{ grain_id: number; custom_copy_data: GrainCustomCopyData }>) =>
  fetch(`${BASE}/subject/${id}/check`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...xsrf() },
    body: JSON.stringify({ answers }),
  }).then((r) => json<CheckResult>(r));

export type PracticeAttempt = {
  id: number;
  subject_id: number;
  title: string;
  score: number;
  max_score: number;
  created: string;
};

/** Les tentatives de l'usager connecté, les plus récentes d'abord. */
export const getAttempts = () =>
  fetch(`${BASE}/attempts`, { credentials: 'same-origin' }).then((r) => json<PracticeAttempt[]>(r));

/** L'usager est-il connecté ? (sans session : 401) */
export const getConnectedUser = () =>
  fetch('/auth/oauth2/userinfo', { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<{ username?: string; firstName?: string }>) : null))
    .catch(() => null);

/** Réponses mises de côté avant d'aller s'inscrire ou se connecter, rejouées au retour. */
const PENDING = 'exercizer.practice.pending';

export function savePending(subjectId: number, answers: Record<number, GrainCustomCopyData>) {
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ subjectId, answers }));
  } catch {
    // stockage indisponible (navigation privée) : on perd seulement la reprise
  }
}

export function takePending(subjectId: number): Record<number, GrainCustomCopyData> | null {
  try {
    const raw = sessionStorage.getItem(PENDING);
    if (!raw) return null;
    const pending = JSON.parse(raw) as { subjectId: number; answers: Record<number, GrainCustomCopyData> };
    if (pending.subjectId !== subjectId) return null;
    sessionStorage.removeItem(PENDING);
    return pending.answers;
  } catch {
    return null;
  }
}
