/**
 * Client REST du module Exercizer — cookies de session ENT, même origine.
 *
 * Mêmes endpoints que l'IHM AngularJS : le backend Java n'est pas touché par la migration, les
 * deux interfaces écrivent donc des données interchangeables. Chaque fonction porte, quand ce
 * n'est pas évident, le service AngularJS d'origine pour qu'on puisse comparer.
 *
 * ⚠️ Toute mutation (POST/PUT/DELETE) doit porter le header `X-XSRF-TOKEN` (= cookie
 * `XSRF-TOKEN`), sinon le filtre d'entcore répond 401 avant d'atteindre le contrôleur.
 */

import {
  Folder,
  Grain,
  GrainData,
  GrainType,
  ScheduledAt,
  Subject,
  SubjectCopy,
  SubjectDocument,
  SubjectLessonLevel,
  SubjectLessonType,
  SubjectScheduled,
  SubjectSequence,
  SubjectSequenceScheduled,
  SubjectTag,
} from './types';

function xsrfHeader(): Record<string, string> {
  const m = typeof document !== 'undefined' ? document.cookie.match(/XSRF-TOKEN=([^;]+)/) : null;
  return m ? { 'X-XSRF-TOKEN': decodeURIComponent(m[1]) } : {};
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(String(res.status));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function ok(res: Response): Promise<void> {
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
}

const base = { credentials: 'include' as const };
const jsonHeaders = { 'Content-Type': 'application/json' };
const mutHeaders = () => ({ ...jsonHeaders, ...xsrfHeader() });

const get = <T>(url: string) => fetch(url, base).then((r) => json<T>(r));
const send = <T>(method: string, url: string, body?: unknown) =>
  fetch(url, {
    ...base,
    method,
    headers: mutHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => json<T>(r));
const sendVoid = (method: string, url: string, body?: unknown) =>
  fetch(url, {
    ...base,
    method,
    headers: body === undefined ? xsrfHeader() : mutHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(ok);

// ── Dossiers ──────────────────────────────────────────────────────────────────

export const getFolders = () => get<Folder[]>('/exercizer/folders');

export const createFolder = (folder: { label: string; parent_folder_id: number | null }) =>
  send<Folder>('POST', '/exercizer/folder', folder);

export const updateFolder = (folder: Folder) =>
  send<Folder>('PUT', `/exercizer/folder/${folder.id}`, folder);

/** Suppression DÉFINITIVE d'un dossier et de son contenu (POST, pas DELETE — côté serveur). */
export const removeFolders = (ids: number[]) =>
  sendVoid('POST', '/exercizer/folders/delete', { ids });

export const duplicateFolders = (ids: number[], targetFolderId: number | null) =>
  sendVoid('POST', '/exercizer/folders/duplicate', { ids, targetFolderId });

export const moveFolders = (ids: number[], targetFolderId: number | null) =>
  sendVoid('PUT', '/exercizer/folders/move', { ids, targetFolderId });

// ── Sujets ────────────────────────────────────────────────────────────────────

export const getSubjects = () => get<Subject[]>('/exercizer/subjects');

/** Y compris les sujets supprimés — nécessaire pour afficher le titre d'un sujet archivé. */
export const getAllSubjects = () => get<Subject[]>('/exercizer/subjects-all');

export const createSubject = (subject: Partial<Subject>) =>
  send<Subject>('POST', '/exercizer/subject', subject);

export const updateSubject = (subject: Subject) =>
  send<Subject>('PUT', `/exercizer/subject/${subject.id}`, subject);

/** Mise à la corbeille (`is_deleted`), et non effacement : c'est ce que fait la croix de la liste. */
export const removeSubjects = (ids: number[]) =>
  sendVoid('PUT', '/exercizer/subject/mark/delete', { ids });

export const moveSubjects = (ids: number[], folderId: number | null) =>
  sendVoid('PUT', '/exercizer/subjects/move', { ids, folderId });

export const duplicateSubjects = (ids: number[], folderId: number | null) =>
  sendVoid('POST', '/exercizer/subject/duplicate', { ids, folderId });

export const listSubjectFiles = (id: number) =>
  get<SubjectDocument[]>(`/exercizer/subject/${id}/files`);

// ── Sujets distribués ─────────────────────────────────────────────────────────

/**
 * Les sujets distribués de l'enseignant (ceux qu'il a attribués).
 * Côté ÉLÈVE, l'endpoint est différent et prend le décalage horaire du poste en paramètre de
 * chemin : le serveur s'en sert pour décider si la date de rendu est passée. Le signe est inversé
 * par rapport à `getTimezoneOffset()` (#40732), comme dans `SubjectScheduledService#resolve`.
 */
export const getSubjectsScheduledAsTeacher = () =>
  get<SubjectScheduled[]>('/exercizer/subjects-scheduled').then(parseScheduledAt);

export const getSubjectsScheduledAsStudent = () =>
  get<SubjectScheduled[]>(
    `/exercizer/subjects-scheduled-by-subjects-copy/${-1 * new Date().getTimezoneOffset()}`,
  ).then(parseScheduledAt);

/**
 * `scheduled_at` arrive en CHAÎNE JSON (colonne texte), pas en objet : l'IHM AngularJS la
 * désérialise au même endroit. Une valeur illisible ne doit pas faire échouer la liste entière —
 * on retombe sur des listes vides, ce qui n'affiche aucun destinataire plutôt que de tout perdre.
 */
const NO_RECIPIENT: ScheduledAt = { groupList: [], userList: [], exclude: [] };

function parseScheduledAt(list: SubjectScheduled[]): SubjectScheduled[] {
  return (list ?? []).map((s) => {
    const raw = s.scheduled_at as unknown;
    if (typeof raw !== 'string') return s;
    try {
      const parsed = JSON.parse(raw) as Partial<ScheduledAt>;
      return {
        ...s,
        scheduled_at: {
          groupList: parsed.groupList ?? [],
          userList: parsed.userList ?? [],
          exclude: parsed.exclude ?? [],
        },
      };
    } catch {
      return { ...s, scheduled_at: NO_RECIPIENT };
    }
  });
}

/** Les sujets distribués archivés (hors période courante). */
export const getArchivedSubjectsScheduled = () =>
  get<SubjectScheduled[]>('/exercizer/archive/subjects-scheduled').then(parseScheduledAt);

export const unscheduleSubject = (id: number) =>
  sendVoid('DELETE', `/exercizer/unschedule-subject/${id}`);

/** Données de distribution, telles que `SubjectScheduledService#persist` les envoie. */
export interface ScheduleInput {
  subjectTitle: string;
  beginDate?: string;
  dueDate?: string;
  estimatedDuration?: string;
  isOneShotSubmit?: boolean;
  isTrainingMode?: boolean;
  isTrainingPermitted?: boolean;
  randomDisplay?: boolean;
  hasAutomaticDisplay?: boolean;
  /** Destinataires de la distribution (élèves et groupes). */
  scheduledAt?: ScheduledAt;
}

export const scheduleSubject = (subjectId: number, input: ScheduleInput) =>
  send<SubjectScheduled>('POST', `/exercizer/schedule-subject/${subjectId}`, input);

export const scheduleSimpleSubject = (subjectId: number, input: ScheduleInput) =>
  send<SubjectScheduled>('POST', `/exercizer/schedule-simple-subject/${subjectId}`, input);

export const modifySchedule = (scheduledId: number, input: ScheduleInput) =>
  send<SubjectScheduled>('POST', `/exercizer/schedule-subject/modify/${scheduledId}`, input);

/** Crée une copie d'entraînement pour l'élève courant, sur un sujet qui l'autorise. */
export const createTrainingCopy = (subjectScheduledId: number) =>
  sendVoid('POST', `/exercizer/subject-scheduled/create-training-copy/${subjectScheduledId}`);

// ── Copies ────────────────────────────────────────────────────────────────────

export const getCopiesAsStudent = () => get<SubjectCopy[]>('/exercizer/subjects-copy');

export const getCopiesAsTeacher = () =>
  get<SubjectCopy[]>('/exercizer/subjects-copy-by-subjects-scheduled');

export const getArchivedCopies = () =>
  get<SubjectCopy[]>('/exercizer/archive/subjects-copy-by-subjects-scheduled');

/** Les copies d'un sujet distribué donné (rechargement ciblé après une correction). */
export const getCopiesBySubjectScheduled = (subjectScheduledId: number) =>
  send<SubjectCopy[]>('POST', `/exercizer/subjects-copy-by-subject-scheduled/${subjectScheduledId}`);

/** Ouvre (ou récupère) la copie de l'élève pour un sujet distribué. */
export const openCopy = (subjectScheduledId: number) =>
  send<SubjectCopy>('POST', `/exercizer/subject-copy/${subjectScheduledId}`);

export const updateCopy = (copy: SubjectCopy) =>
  send<SubjectCopy>('PUT', '/exercizer/subject-copy/correct', copy);

export const submitSimpleCopy = (id: number) =>
  send<SubjectCopy>('PUT', '/exercizer/subject-copy/submit', { id });

/** Relance par message : les copies visées, avec objet et corps libres. */
export const remindCopies = (copyIds: number[], subject: string, body: string) =>
  sendVoid('POST', '/exercizer/subject-copy/custom/reminder', { ids: copyIds, subject, body });

export const remindCopiesAutomatically = (copyIds: number[], subjectScheduledId: number) =>
  sendVoid('POST', `/exercizer/subject-copy/automatic/reminder/${subjectScheduledId}`, {
    ids: copyIds,
  });

/** Retire des élèves de la distribution (leur copie n'est plus attendue). */
export const excludeCopies = (copyIds: number[]) =>
  sendVoid('POST', '/exercizer/subject-copy/action/exclude', { ids: copyIds });

// ── Grains ────────────────────────────────────────────────────────────────────

export const getGrainTypes = () => get<GrainType[]>('/exercizer/grain-types');

/**
 * Les grains d'un sujet.
 *
 * C'est un POST, et le corps est le SUJET ENTIER : le serveur s'en sert pour vérifier les droits
 * (un sujet de la bibliothèque passe par une autre route). Forme reprise de
 * `GrainService#getListBySubject`.
 */
export const getGrains = async (subject: Subject): Promise<Grain[]> => {
  const url = subject.is_library_subject
    ? '/exercizer/subject-library-grains'
    : `/exercizer/grains/${subject.id}`;
  const grains = await send<Grain[]>('POST', url, cleanSubjectForSend(subject));
  return parseGrains(grains);
};

/**
 * `grain_data` arrive en **chaîne JSON** (colonne texte) : on la désérialise ici, au seul endroit
 * qui parle au serveur, pour que les écrans n'aient affaire qu'à des objets.
 *
 * Une donnée illisible ne doit pas faire perdre le sujet entier : le grain est rendu avec un
 * contenu vide plutôt qu'écarté — il garde ainsi son rang et son identifiant, et reste
 * supprimable.
 */
function parseGrains(grains: Grain[]): Grain[] {
  return (grains ?? []).map((grain) => {
    const raw = grain.grain_data as unknown;
    if (typeof raw !== 'string') return grain;
    try {
      return { ...grain, grain_data: JSON.parse(raw) as GrainData };
    } catch {
      return { ...grain, grain_data: {} };
    }
  });
}

/**
 * Le sujet tel qu'on l'envoie : sans le `tracker` ni les `files` d'AngularJS, et avec un `owner`
 * à plat. `cleanBeforeSave` faisait cela dans tous les services.
 */
function cleanSubjectForSend(subject: Subject): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...subject };
  const owner = copy.owner as { userId?: string } | string | undefined;
  if (owner && typeof owner === 'object' && owner.userId) copy.owner = owner.userId;
  delete copy.files;
  return copy;
}

/** Corps attendu par le serveur pour créer ou modifier un grain. */
interface GrainPayload {
  grainTypeId: number;
  orderBy: number;
  grainData: GrainData;
}

const grainPayload = (grain: Grain): GrainPayload => ({
  grainTypeId: grain.grain_type_id,
  orderBy: grain.order_by,
  grainData: grain.grain_data,
});

/** Crée un grain. Le serveur ne renvoie que son identifiant. */
export const createGrain = (grain: Omit<Grain, 'id'>) =>
  send<{ id: number }>('POST', `/exercizer/subject/${grain.subject_id}/grain`, {
    grainTypeId: grain.grain_type_id,
    orderBy: grain.order_by,
    grainData: grain.grain_data,
  });

export const updateGrain = (grain: Grain) =>
  sendVoid('PUT', `/exercizer/subject/${grain.subject_id}/grain/${grain.id}`, grainPayload(grain));

/**
 * Supprime des grains. L'identifiant de chacun passe en paramètre de requête RÉPÉTÉ
 * (`?idGrain=1&idGrain=2`) — c'est ce que le serveur attend.
 */
export const removeGrains = (subjectId: number, grainIds: number[]) => {
  const query = grainIds.map((id) => `idGrain=${encodeURIComponent(id)}`).join('&');
  return sendVoid('DELETE', `/exercizer/subject/${subjectId}/grains?${query}`);
};

/** Duplique des grains DANS le même sujet (le serveur suffixe les titres). */
export const duplicateGrains = (subjectId: number, grainIds: number[]) =>
  sendVoid('POST', `/exercizer/subject/${subjectId}/duplicate/grains`, { grainIds });

// ── Pièces jointes d'un sujet (corrigé d'un sujet « simple ») ─────────────────

/** Rattache un document du workspace au sujet. */
export const addSubjectDoc = (subjectId: number, doc: { _id: string; metadata?: unknown }) =>
  send<SubjectDocument>('PUT', `/exercizer/subject/${subjectId}/doc`, {
    doc_id: doc._id,
    metadata: doc.metadata,
  });

export const removeSubjectFile = (subjectId: number, docId: string) =>
  sendVoid('DELETE', `/exercizer/subject/${subjectId}/file/${docId}`);

// ── Référentiels (filtres de la bibliothèque) ─────────────────────────────────

export const getSubjectTags = () => get<SubjectTag[]>('/exercizer/subject-tags');
export const getLessonTypes = () => get<SubjectLessonType[]>('/exercizer/subject-lesson-types');
export const getLessonLevels = () => get<SubjectLessonLevel[]>('/exercizer/subject-lesson-levels');

// ── Parcours ──────────────────────────────────────────────────────────────────

export const getSubjectSequences = () => get<SubjectSequence[]>('/exercizer/subject-sequences');

export const getSubjectSequenceScheduled = (id: number) =>
  get<SubjectSequenceScheduled>(`/exercizer/subject-sequence-scheduled/${id}`);

// ── Téléchargements (navigations, pas des requêtes) ───────────────────────────

/** Corrigé déposé pour TOUTE la distribution. */
export const generalCorrectedFileUrl = (subjectScheduledId: number) =>
  `/exercizer/subject-scheduled/corrected/download/${subjectScheduledId}`;

/** Corrigé déposé sur une copie en particulier. */
export const copyCorrectedFileUrl = (copyId: number) =>
  `/exercizer/subject-copy/corrected/download/${copyId}`;

/** Fichier rendu par l'élève sur un sujet « simple », vu par l'élève lui-même. */
export const myHomeworkFileUrl = (copyId: number, fileId: string) =>
  `/exercizer/subject-copy/${copyId}/mine/${fileId}`;

// ── Préférence d'interface (bascule React / AngularJS) ────────────────────────

/**
 * La préférence `exercizerUi` porte à la fois le CHOIX d'interface (lu par le serveur, cf.
 * `ExercizerController#preferredUi`) et l'état des bandeaux qui le proposent. On lit et réécrit
 * l'objet ENTIER : un bandeau n'a pas à effacer le compteur de l'autre.
 *
 * ⚠ L'enveloppe renvoyée par l'ENT est `{ preference: "<json>" }` — une CHAÎNE, pas un objet.
 */
export interface UiPreference {
  ui?: 'react' | 'angular';
  /** Bandeau de l'IHM AngularJS : « plus tard » définitif, et nombre d'affichages. */
  invitationDismissed?: boolean;
  invitationShown?: number;
  /** Bandeau de l'IHM React : idem, dans l'autre sens. */
  returnDismissed?: boolean;
  returnShown?: number;
  feedback?: string;
  feedbackAt?: string;
}

const UI_PREFERENCE_URL = '/userbook/preference/exercizerUi';

export const getUiPreference = async (): Promise<UiPreference> => {
  try {
    const res = await fetch(UI_PREFERENCE_URL, base);
    if (!res.ok) return {};
    const body = (await res.json()) as { preference?: string };
    return body?.preference ? (JSON.parse(body.preference) as UiPreference) : {};
  } catch {
    // Un défaut de lecture de préférence ne doit jamais empêcher l'application de s'afficher.
    return {};
  }
};

export const setUiPreference = async (preference: UiPreference): Promise<void> => {
  await fetch(UI_PREFERENCE_URL, {
    ...base,
    method: 'PUT',
    headers: mutHeaders(),
    body: JSON.stringify(preference),
  }).catch(() => undefined);
};
