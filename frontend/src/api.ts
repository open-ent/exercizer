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

import { PilotageState } from './pilotage';
import {
  CatalogPage,
  CatalogReferential,
  CatalogSubjectDetail,
  Classification,
  Folder,
  Grain,
  GrainCopy,
  GrainCopyData,
  GrainData,
  GrainScheduled,
  GrainType,
  ScheduledAt,
  ScheduledSection,
  Section,
  Subject,
  SubjectCopy,
  SubjectCopyFile,
  SubjectDocument,
  SubjectLessonLevel,
  SubjectLessonType,
  SubjectScheduled,
  SubjectSequence,
  SubjectSequenceItem,
  SubjectSequenceProgress,
  SubjectSequenceScheduled,
  SubjectSequenceScheduledDetail,
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

/**
 * Envoi d'un fichier en `multipart/form-data`. Pas de `Content-Type` : c'est le navigateur qui
 * le pose, avec la frontière — le fixer à la main rend le corps illisible pour le serveur.
 * Un 413 est remonté tel quel : l'écran le traduit en « fichier trop volumineux ».
 */
const upload = <T>(url: string, file: File) => {
  const body = new FormData();
  body.append('file', file);
  return fetch(url, { ...base, method: 'PUT', headers: xsrfHeader(), body }).then((r) => json<T>(r));
};

/** `?id=1&id=2` — la forme que le serveur attend pour une liste d'identifiants. */
const idsQuery = (ids: Array<number | string>) =>
  ids.length ? `?${ids.map((id) => `id=${encodeURIComponent(id)}`).join('&')}` : '';

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

/**
 * Duplique UN sujet par le service d'archivage de l'ENT — c'est lui qui recopie aussi les
 * fichiers joints, ce que `POST /subject/duplicate` ne fait pas. L'ancienne IHM passait par là
 * pour le bouton « Dupliquer ».
 */
export const duplicateSubjectDeep = (subjectId: number) =>
  sendVoid('POST', '/archive/duplicate', {
    application: 'exercizer',
    resourceId: String(subjectId),
  });

/** Export d'un sujet interactif au format Moodle XML — une navigation, pas une requête. */
export const exportMoodleUrl = (subject: Subject) =>
  `/exercizer/subject/export-moodle/${subject.id}/${(subject.title ?? '').replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * Crée un sujet AVEC ses grains — l'import d'un fichier Moodle.
 * ⚠ Le corps est validé contre `jsonschema/import.json` (`additionalProperties: false`) : le
 * sujet n'y porte que son titre, sa description, son dossier et son image.
 */
export const importSubject = (
  subject: { title: string; description?: string; folder_id: number | null; picture?: string },
  grains: Array<{ grain_type_id: number; order_by: number; grain_data: GrainData }>,
) => send<Subject>('POST', '/exercizer/subject/import', { subject, grains });

/**
 * Dépose une image dans l'espace documentaire et rend son identifiant. Sert à l'import, dont
 * les images arrivent encodées dans le fichier.
 */
export const uploadWorkspaceImage = async (blob: Blob, name: string): Promise<string> => {
  const body = new FormData();
  body.append('blob', blob, name);
  const thumbnails = [120, 150, 100, 290, 48, 82, 381]
    .map((size) => `thumbnail=${size}x${size}`)
    .join('&');
  const res = await fetch(
    `/workspace/document?protected=true&application=media-library&${thumbnails}`,
    { ...base, method: 'POST', headers: xsrfHeader(), body },
  );
  return (await json<{ _id: string }>(res))._id;
};

/**
 * Configuration publique du module. `libraryHost` est l'adresse de la bibliothèque externe,
 * absente quand la plateforme n'en a pas — l'onglet « Bibliothèque » disparaît alors.
 */
export interface PublicConf {
  libraryHost?: string;
  /** La plateforme a renoncé à vérifier l'horloge des postes. */
  'disable-timezone-check'?: boolean;
}

export const getPublicConf = async (): Promise<PublicConf> => {
  try {
    return (await get<PublicConf>('/exercizer/conf/public')) ?? {};
  } catch {
    return {};
  }
};

/**
 * « Création assistée » : un service de la plateforme lit l'image d'un énoncé (un document de
 * l'espace documentaire) et remplit le sujet de questions. Long — plusieurs minutes parfois — et
 * mené côté serveur : il aboutit même si l'usager quitte la page.
 */
export const generateSubject = (subjectId: number, fileId: string) =>
  send<unknown>('POST', '/exercizer/subject/generate', { fileId, id: subjectId });

// ── Ressources externes d'un sujet ────────────────────────────────────────────

/** Un document importé depuis une adresse externe, et déposé dans le stockage de l'ENT. */
export interface ExternalResource {
  id: number | string;
  title: string;
}

export const getExternalResources = (subjectId: number) =>
  get<ExternalResource[]>(`/exercizer/subject/${subjectId}/external-resources`);

/** Le SERVEUR télécharge l'adresse donnée : le poste de l'enseignant n'y accède pas lui-même. */
export const importExternalResource = (subjectId: number, url: string, title: string) =>
  sendVoid('POST', `/exercizer/subject/${subjectId}/external-resource`, { url, title });

export const renameExternalResource = (subjectId: number, id: number | string, title: string) =>
  sendVoid('PUT', `/exercizer/subject/${subjectId}/external-resource/${id}`, { title });

export const removeExternalResource = (subjectId: number, id: number | string) =>
  sendVoid('DELETE', `/exercizer/subject/${subjectId}/external-resource/${id}`);

export const externalResourceUrl = (subjectId: number, id: number | string) =>
  `/exercizer/subject/${subjectId}/external-resource/${id}/download`;

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

/**
 * Les sujets distribués archivés (hors période courante).
 * ⚠ `corrected_metadata` arrive lui aussi en chaîne JSON (`ArchivesService`).
 */
export const getArchivedSubjectsScheduled = () =>
  get<SubjectScheduled[]>('/exercizer/archive/subjects-scheduled')
    .then(parseScheduledAt)
    .then((list) => list.map(parseCorrectedMetadata));

function parseCorrectedMetadata<T extends { corrected_metadata?: unknown }>(item: T): T {
  if (typeof item.corrected_metadata !== 'string') return item;
  try {
    return { ...item, corrected_metadata: JSON.parse(item.corrected_metadata) };
  } catch {
    return { ...item, corrected_metadata: null };
  }
}

/** Export CSV des distributions archivées choisies — une navigation, pas une requête. */
export const archiveExportCsvUrl = (ids: number[]) =>
  `/exercizer/archive/subjects-scheduled/export-csv${idsQuery(ids)}`;

/**
 * Modifie les bornes d'une distribution déjà faite (`SubjectScheduledService#modifySchedule`).
 * `notify` prévient les destinataires ; l'ancienne IHM ne le coupait que lorsque seule l'option
 * d'entraînement changeait.
 */
export const modifySchedule = (
  subjectScheduledId: number,
  body: {
    beginDate: string;
    dueDate: string;
    correctedDate?: string;
    isTrainingPermitted?: boolean;
    notify: boolean;
  },
) =>
  sendVoid('POST', `/exercizer/schedule-subject/modify/${subjectScheduledId}`, {
    ...body,
    offset: new Date().getTimezoneOffset(),
  });

export const unscheduleSubject = (id: number) =>
  sendVoid('DELETE', `/exercizer/unschedule-subject/${id}`);

/**
 * Distribue un sujet. Le corps est construit par `schedule.ts#buildScheduleBody` — il doit
 * correspondre au schéma JSON du serveur au champ près.
 */
export const scheduleSubject = (subjectId: number, body: unknown) =>
  send<{ id: number }>('POST', `/exercizer/schedule-subject/${subjectId}`, body);

/** Distribue un sujet « simple » : trois dates et des destinataires, pas de grains. */
export const scheduleSimpleSubject = (subjectId: number, body: unknown) =>
  send<{ id: number }>('POST', `/exercizer/schedule-simple-subject/${subjectId}`, body);

/**
 * Les destinataires possibles d'un sujet : le partage entcore en donne la liste visible.
 * `search` restreint la recherche côté serveur — obligatoire pour un administrateur local, dont
 * l'annuaire visible est trop grand pour être chargé d'un coup.
 */
export interface ShareTargets {
  groups: { visibles: Array<{ id: string; name: string; groupDisplayName?: string | null; structureName?: string | null }> };
  users: { visibles: Array<{ id: string; username?: string; lastName?: string; firstName?: string; profile?: string }> };
}

export const getShareTargets = (subjectId: number, search?: string) =>
  get<ShareTargets>(
    `/exercizer/subject/share/json/${subjectId}${search ? `?search=${encodeURIComponent(search)}` : ''}`,
  );

/**
 * Les membres d'un groupe. Sert à montrer qui recevra le sujet, et à en retirer quelqu'un.
 * ⚠ L'identifiant passe en paramètre de requête : `?id=…`.
 */
export const getGroupMembers = (groupId: string) =>
  get<Array<{ _id: string; name: string; profiles?: string[] }>>(
    `/exercizer/members?id=${encodeURIComponent(groupId)}`,
  );

/** Crée une copie d'entraînement pour l'élève courant, sur un sujet qui l'autorise. */
export const createTrainingCopy = (subjectScheduledId: number) =>
  sendVoid('POST', `/exercizer/subject-scheduled/create-training-copy/${subjectScheduledId}`);

// ── Copies ────────────────────────────────────────────────────────────────────

export const getCopiesAsStudent = () => get<SubjectCopy[]>('/exercizer/subjects-copy');

export const getCopiesAsTeacher = () =>
  get<SubjectCopy[]>('/exercizer/subjects-copy-by-subjects-scheduled');

/** Les copies des distributions archivées données (`?id=…` répété). */
export const getArchivedCopies = (subjectScheduledIds: number[]) =>
  get<SubjectCopy[]>(
    `/exercizer/archive/subjects-copy-by-subjects-scheduled${idsQuery(subjectScheduledIds)}`,
  ).then((list) => (list ?? []).map(parseCorrectedMetadata));

/** Les copies d'un sujet distribué donné (rechargement ciblé après une correction). */
export const getCopiesBySubjectScheduled = (subjectScheduledId: number) =>
  send<SubjectCopy[]>('POST', `/exercizer/subjects-copy-by-subject-scheduled/${subjectScheduledId}`);

/** Ouvre (ou récupère) la copie de l'élève pour un sujet distribué. */
export const openCopy = (subjectScheduledId: number) =>
  send<SubjectCopy>('POST', `/exercizer/subject-copy/${subjectScheduledId}`);

export const updateCopy = (copy: SubjectCopy) =>
  send<SubjectCopy>('PUT', '/exercizer/subject-copy/correct', copy);

/** Rend une copie de sujet « simple » : seuls l'identifiant et le décalage horaire partent. */
export const submitSimpleCopy = (id: number) =>
  send<SubjectCopy>('PUT', '/exercizer/subject-copy/submit', {
    id,
    offset: new Date().getTimezoneOffset(),
  });

/**
 * La copie de l'usager courant pour une distribution, avec cette distribution — ce dont le
 * « linker » a besoin pour savoir où l'emmener.
 */
export const getCopyByScheduled = (subjectScheduledId: number) =>
  get<{ subject_scheduled: SubjectScheduled; subject_copy: SubjectCopy }>(
    `/exercizer/subject-copy-by-subject-schedule/${subjectScheduledId}`,
  );

/** L'heure du serveur, pour vérifier que l'horloge du poste n'est pas déréglée. */
export const getServerNow = () => get<{ date: string }>('/exercizer/now');

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

/**
 * La copie telle qu'on l'envoie : sans ses listes de fichiers, que le serveur ne sait pas relire
 * (`cleanBeforeSave` de `SubjectCopyService`).
 */
function cleanCopyForSend(copy: SubjectCopy): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...copy };
  delete clean.corrected_files;
  delete clean.homework_files;
  return clean;
}

/** Enregistre l'avancement d'une copie sans la rendre (`SubjectCopyService#update`). */
export const reportCopy = (copy: SubjectCopy) =>
  send<SubjectCopy>('PUT', '/exercizer/subject-copy/report', cleanCopyForSend(copy));

/** L'enseignant considère une copie comme rendue, à la place de l'élève. */
export const submitCopyAsTeacher = (copy: SubjectCopy) =>
  send<SubjectCopy>('PUT', '/exercizer/subject-copy/submit', {
    ...cleanCopyForSend(copy),
    offset: new Date().getTimezoneOffset(),
  });

/**
 * Nouvel essai d'une copie d'entraînement (`SubjectCopyService#retry`) : la copie repasse « commencée », le
 * grain courant est remis à zéro et les copies de grains sont recréées vierges. Les trois appels sont
 * indépendants côté serveur, comme dans l'ancienne IHM.
 */
export const retryCopy = (copy: SubjectCopy) =>
  Promise.all([
    reportCopy({ ...copy, has_been_started: true }),
    setCurrentGrain(copy.id, -1),
    recreateGrainCopies(copy.subject_scheduled_id, copy.id),
  ]);

/** Repart d'une copie vierge pour un nouvel essai d'entraînement (`SubjectCopyService#retry`). */
export const recreateGrainCopies = (subjectScheduledId: number, subjectCopyId: number) =>
  sendVoid(
    'POST',
    `/exercizer/subject-scheduled/${subjectScheduledId}/subject-copy/${subjectCopyId}/recreate-grains`,
    {},
  );

// ── Fichiers d'un sujet « simple » : rendus de l'élève, corrigés de l'enseignant ─────────────

/** L'élève dépose un fichier sur sa copie. */
export const addHomeworkFile = (copyId: number, file: File) =>
  upload<SubjectCopyFile>(`/exercizer/subject-copy/${copyId}/homework`, file);

export const removeHomeworkFile = (copyId: number, fileId: string) =>
  sendVoid('DELETE', `/exercizer/subject-copy/${copyId}/homework/${fileId}`);

/** L'enseignant dépose un corrigé INDIVIDUEL sur une copie. */
export const addCopyCorrectedFile = (copyId: number, file: File) =>
  upload<SubjectCopyFile>(`/exercizer/subject-copy/${copyId}/corrected`, file);

export const removeCopyCorrectedFile = (copyId: number, fileId: string) =>
  sendVoid('DELETE', `/exercizer/subject-copy/${copyId}/corrected/${fileId}`);

/** L'enseignant dépose un corrigé pour TOUTE la distribution (rattaché au sujet). */
export const uploadSubjectFile = (subjectId: number, file: File) =>
  upload<SubjectDocument>(`/exercizer/subject/${subjectId}/file`, file);

/** Rendu d'un élève, vu par l'enseignant. */
export const homeworkFileUrl = (copyId: number, fileId: string) =>
  `/exercizer/subject-copy/${copyId}/homework/${fileId}`;

/** Les rendus de plusieurs copies, en une archive. */
export const simpleCopiesZipUrl = (copyIds: number[]) =>
  `/exercizer/subject-copy/simple/downloads${idsQuery(copyIds)}`;

/** Corrigé individuel d'une copie. */
export const copyCorrectedDocUrl = (copyId: number, fileId: string) =>
  `/exercizer/subject-copy/${copyId}/corrected/${fileId}`;

/** Corrigé commun d'une distribution. */
export const scheduledFileUrl = (subjectScheduledId: number, docId: string) =>
  `/exercizer/subject-scheduled/${subjectScheduledId}/file/${docId}`;

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

/**
 * Crée un grain. Le serveur ne renvoie que son identifiant.
 *
 * Dans un sujet à sections, `section_id` range le grain dans sa section, et le serveur renumérote
 * ensuite tout le sujet : le rang envoyé ne sert qu'à le placer EN FIN de sa section.
 */
export const createGrain = (grain: Omit<Grain, 'id'>) =>
  send<{ id: number }>('POST', `/exercizer/subject/${grain.subject_id}/grain`, {
    grainTypeId: grain.grain_type_id,
    orderBy: grain.order_by,
    grainData: grain.grain_data,
    ...(grain.section_id ? { sectionId: grain.section_id } : {}),
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

// ── Sections (sql/039) ───────────────────────────────────────────────────────

export const getSections = (subjectId: number) =>
  get<Section[]>(`/exercizer/subject/${subjectId}/sections`);

/** Crée une section, toujours en fin de sujet. */
export const createSection = (subjectId: number, section: Pick<Section, 'title' | 'description'>) =>
  send<Section>('POST', `/exercizer/subject/${subjectId}/section`, {
    title: section.title,
    description: section.description ?? null,
  });

export const updateSection = (section: Section) =>
  send<Section>('PUT', `/exercizer/subject/${section.subject_id}/section/${section.id}`, {
    title: section.title,
    description: section.description ?? null,
  });

/**
 * Supprime une section. `withGrains` : ses questions partent avec elle ; sinon elles rejoignent la
 * section précédente (ou la tête du sujet s'il n'y en a pas).
 */
export const removeSection = (subjectId: number, sectionId: number, withGrains: boolean) =>
  sendVoid('DELETE', `/exercizer/subject/${subjectId}/section/${sectionId}?withGrains=${withGrains}`);

/** Copie une section et ses questions juste après elle (le serveur suffixe le titre). */
export const duplicateSection = (subjectId: number, sectionId: number) =>
  send<Section>('POST', `/exercizer/subject/${subjectId}/section/${sectionId}/duplicate`);

/** L'arbre d'un sujet, tel que `PUT /structure` l'enregistre d'un bloc (cf. `sections.ts`). */
export interface SubjectStructure {
  ungrouped: number[];
  sections: Array<{ id: number; grainIds: number[] }>;
}

/**
 * Enregistre l'arbre entier — ordre des sections, section et rang de chaque grain — en une seule
 * transaction côté serveur, plutôt qu'un enregistrement par grain déplacé.
 */
export const saveStructure = (subjectId: number, structure: SubjectStructure) =>
  sendVoid('PUT', `/exercizer/subject/${subjectId}/structure`, structure);

/**
 * Les sections distribuées d'une copie, avec les grains distribués de chacune. Même corps et même
 * contrôle d'accès que {@link getGrainCopies} : l'élève peut les lire pendant la passation.
 */
export const getCopySections = async (copy: SubjectCopy): Promise<ScheduledSection[]> => {
  const body = { ...copy, offset: new Date().getTimezoneOffset() };
  const sections = await send<ScheduledSection[]>('POST', '/exercizer/grains-copy/sections', body);
  return (sections ?? []).map((section) => ({
    ...section,
    grain_scheduled_ids: section.grain_scheduled_ids ?? [],
  }));
};

// ── Copies de grains (la passation, puis la consultation) ────────────────────

/**
 * Les copies de grains d'une copie de sujet — ce que l'élève doit voir et remplir.
 *
 * C'est un POST, et le corps est la COPIE ENTIÈRE, avec son décalage horaire : le serveur s'en
 * sert pour vérifier les bornes de temps. Forme reprise de `GrainCopyService#getListBySubjectCopy`.
 *
 * Le tri suit `display_order` quand le sujet mélange ses questions (`random_display`), et
 * `order_by` sinon.
 */
export const getGrainCopies = async (copy: SubjectCopy): Promise<GrainCopy[]> => {
  const body = { ...copy, offset: new Date().getTimezoneOffset() };
  const grainCopies = await send<GrainCopy[]>('POST', '/exercizer/grains-copy', body);
  return parseGrainCopies(grainCopies).sort((a, b) =>
    a.display_order && b.display_order
      ? a.display_order - b.display_order
      : a.order_by - b.order_by,
  );
};

/**
 * Les copies de grains de PLUSIEURS copies, en un appel — pour les statistiques d'une
 * distribution (`GrainCopyService#getListBySubjectCopies`). Rendues groupées par copie.
 */
export const getGrainCopiesByCopies = async (
  copyIds: number[],
): Promise<Map<number, GrainCopy[]>> => {
  const byCopy = new Map<number, GrainCopy[]>(copyIds.map((id) => [id, []]));
  if (copyIds.length === 0) return byCopy;
  const list = await send<GrainCopy[]>('POST', '/exercizer/grains-copy-by-subjects', {
    ids: copyIds,
  });
  for (const grainCopy of parseGrainCopies(list)) {
    byCopy.get(grainCopy.subject_copy_id)?.push(grainCopy);
  }
  return byCopy;
};

/**
 * `grain_copy_data` arrive en **chaîne JSON**, comme `grain_data`.
 *
 * ⚠ Pour un grain de type 3 (énoncé), le serveur range le texte dans `custom_data` et non dans
 * `custom_copy_data`, et le TITRE peut n'être que là : `GrainCopyService#instantiateGrainCopy`
 * recopiait les deux à la lecture. On fait de même, pour que les écrans n'aient qu'un endroit à
 * regarder.
 */
function parseGrainCopies(grainCopies: GrainCopy[]): GrainCopy[] {
  return (grainCopies ?? []).map((grainCopy) => {
    const raw = grainCopy.grain_copy_data as unknown;
    let data: GrainCopyData;
    if (typeof raw !== 'string') {
      data = (raw as GrainCopyData) ?? {};
    } else {
      try {
        data = JSON.parse(raw) as GrainCopyData;
      } catch {
        data = {};
      }
    }
    if (data.custom_data) {
      data = {
        ...data,
        title: data.custom_data.title ?? data.title,
        custom_copy_data: {
          ...data.custom_copy_data,
          statement: data.custom_data.statement,
        },
      };
    }
    return { ...grainCopy, grain_copy_data: data };
  });
}

/**
 * Le corps attendu par les deux routes d'écriture d'une copie de grain.
 *
 * ⚠ `grain_copy_data` doit partir **sérialisé en chaîne** (c'est ce que faisait
 * `GrainCopyService#write`) : envoyé en objet, le serveur ne le range pas.
 */
const grainCopyBody = (grainCopy: GrainCopy) => ({
  ...grainCopy,
  grain_copy_data: JSON.stringify(grainCopy.grain_copy_data),
});

/** Enregistre la réponse de l'élève. */
export const updateGrainCopy = (grainCopy: GrainCopy) =>
  send<GrainCopy>('PUT', '/exercizer/grain-copy', grainCopyBody(grainCopy));

/**
 * Enregistre la correction d'une question par l'enseignant : note finale, commentaire, et le
 * score automatique que le client vient de calculer.
 *
 * ⚠ C'est la SEULE route d'écriture acceptée sur une copie rendue — `PUT /grain-copy`, celle de
 * l'élève, est refusée dès le rendu (`exercizer.pilotage.copy.submitted`, 400).
 */
export const correctGrainCopy = (grainCopy: GrainCopy) =>
  send<GrainCopy>('PUT', '/exercizer/grain-copy/correct', grainCopyBody(grainCopy));

/**
 * Enregistre la correction de la copie entière : scores, commentaire général, et l'état de la
 * correction (`is_correction_on_going`, `is_corrected`).
 */
export const correctCopy = (copy: SubjectCopy) =>
  send<SubjectCopy>('PUT', '/exercizer/subject-copy/correct', copy);

/**
 * Les grains DISTRIBUÉS d'un sujet, avec les réponses attendues.
 *
 * ⚠ À ne demander qu'à la CONSULTATION d'une copie corrigée. Pendant la passation, ces données
 * donneraient les réponses à l'élève — l'ancienne IHM ne les charge pas non plus à ce moment.
 */
export const getGrainsScheduled = (subjectScheduledId: number) =>
  get<GrainScheduled[]>(`/exercizer/grains-scheduled/${subjectScheduledId}`).then(parseScheduled);

function parseScheduled(list: GrainScheduled[]): GrainScheduled[] {
  return (list ?? []).map((grain) => {
    const raw = grain.grain_data as unknown;
    if (typeof raw !== 'string') return grain;
    try {
      return { ...grain, grain_data: JSON.parse(raw) as GrainData };
    } catch {
      return { ...grain, grain_data: {} };
    }
  });
}

/** Mémorise le grain où l'élève s'est arrêté, pour le retrouver à sa prochaine visite. */
export const setCurrentGrain = (subjectCopyId: number, grainCopyId: number) =>
  sendVoid('POST', `/exercizer/subject-copy/${subjectCopyId}/last-grain/${grainCopyId}`);

/**
 * La copie est-elle encore modifiable ? Le serveur répond non dès que l'enseignant a commencé à
 * la corriger — un élève ne doit pas pouvoir rendre par-dessus une correction en cours.
 *
 * ⚠ La réponse est **enveloppée** : `{"result": true}`, et non un booléen nu. Comparée telle
 * quelle, elle vaut toujours « non » — l'élève voyait alors « votre copie est en cours de
 * correction » sur une copie parfaitement ouverte, et le bouton « Rendre la copie » restait
 * inerte.
 */
export const canStillSubmit = async (subjectCopyId: number): Promise<boolean> => {
  const body = await get<{ result?: boolean } | boolean>(
    `/exercizer/subject-copy/check/no-corrected/${subjectCopyId}`,
  );
  return typeof body === 'boolean' ? body : body?.result === true;
};

/**
 * Rend la copie. Le décalage horaire part avec elle : c'est le serveur qui horodate le rendu, et
 * il a besoin de savoir d'où vient l'élève.
 */
export const submitCopy = (copy: SubjectCopy) =>
  send<SubjectCopy>('PUT', '/exercizer/subject-copy/submit', {
    ...copy,
    offset: new Date().getTimezoneOffset(),
  });

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

// ── Catalogue d'exercices partagé entre établissements ────────────────────────

export const getCatalogReferential = () => get<CatalogReferential>('/exercizer/catalog/referential');

export interface CatalogSearch {
  q?: string;
  levels?: number[];
  disciplines?: number[];
  limit?: number;
  offset?: number;
}

/** Les paramètres de la recherche, sans ceux qui sont vides. */
export function catalogSearchParams(search: CatalogSearch): string {
  const params = new URLSearchParams();
  if (search.q?.trim()) params.set('q', search.q.trim());
  if (search.levels?.length) params.set('levels', search.levels.join(','));
  if (search.disciplines?.length) params.set('disciplines', search.disciplines.join(','));
  if (search.limit !== undefined) params.set('limit', String(search.limit));
  if (search.offset !== undefined) params.set('offset', String(search.offset));
  return params.toString();
}

export const searchCatalog = (search: CatalogSearch) =>
  get<CatalogPage>(`/exercizer/catalog/subjects?${catalogSearchParams(search)}`);

export const getCatalogSubject = async (id: number): Promise<CatalogSubjectDetail> => {
  const detail = await get<CatalogSubjectDetail>(`/exercizer/catalog/subject/${id}`);
  return { ...detail, grains: parseGrains(detail.grains) };
};

/** Copie un sujet du catalogue dans « Mes sujets » ; renvoie l'id du sujet créé. */
export const copyCatalogSubject = (id: number, folderId: number | null) =>
  send<{ id: number }>('POST', `/exercizer/catalog/subject/${id}/copy`, { folder_id: folderId });

export const removeCatalogSubject = (id: number) =>
  sendVoid('DELETE', `/exercizer/catalog/subject/${id}`);

export const reclassifyCatalogSubject = (id: number, classification: Classification) =>
  sendVoid('PUT', `/exercizer/catalog/subject/${id}/classification`, classification);

/** Le classement d'un de MES sujets (le serveur refuse les autres). */
export const getClassification = (subjectId: number) =>
  get<Classification>(`/exercizer/subject/${subjectId}/classification`).then((c) => ({
    level_ids: c?.level_ids ?? [],
    discipline_ids: c?.discipline_ids ?? [],
  }));

export const setClassification = (subjectId: number, classification: Classification) =>
  sendVoid('PUT', `/exercizer/subject/${subjectId}/classification`, classification);

/** Publie au catalogue une COPIE d'un de mes sujets ; renvoie l'id du sujet du catalogue. */
export const publishToCatalog = (
  subjectId: number,
  publication: Classification & { authors?: string },
) => send<{ id: number }>('POST', `/exercizer/subject/${subjectId}/catalog`, publication);

// ── Parcours ──────────────────────────────────────────────────────────────────

export const getSubjectSequences = () => get<SubjectSequence[]>('/exercizer/subject-sequences');

export const createSubjectSequence = (sequence: { title: string; description?: string }) =>
  send<SubjectSequence>('POST', '/exercizer/subject-sequence', sequence);

/** Le serveur ne relit que l'identifiant, le titre et la description (`cleanBeforeSave`). */
export const updateSubjectSequence = (sequence: SubjectSequence) =>
  send<{ modified?: string }>('PUT', `/exercizer/subject-sequence/${sequence.id}`, {
    id: sequence.id,
    owner: sequence.owner,
    title: sequence.title,
    description: sequence.description,
  });

/** Mise à la corbeille, comme pour un sujet. */
export const removeSubjectSequences = (ids: number[]) =>
  sendVoid('PUT', '/exercizer/subject-sequence/mark/delete', { ids });

export const getSubjectSequenceItems = (sequenceId: number) =>
  get<SubjectSequenceItem[]>(`/exercizer/subject-sequence/${sequenceId}/items`);

export const addSubjectSequenceItem = (sequenceId: number, subjectId: number, orderBy: number) =>
  send<{ id: number }>('POST', `/exercizer/subject-sequence/${sequenceId}/item`, {
    subjectId,
    orderBy,
  });

export const updateSubjectSequenceItem = (sequenceId: number, item: SubjectSequenceItem) =>
  sendVoid('PUT', `/exercizer/subject-sequence/${sequenceId}/item/${item.id}`, {
    subjectId: item.subject_id,
    orderBy: item.order_by,
  });

/** L'identifiant de chaque item passe en paramètre de requête répété (`?itemId=1&itemId=2`). */
export const removeSubjectSequenceItems = (sequenceId: number, itemIds: number[]) =>
  sendVoid(
    'DELETE',
    `/exercizer/subject-sequence/${sequenceId}/items?${itemIds.map((id) => `itemId=${id}`).join('&')}`,
  );

/** Les distributions passées d'un parcours — seul chemin vers leur écran de suivi. */
export const getSubjectSequenceSchedules = (sequenceId: number) =>
  get<SubjectSequenceScheduled[]>(`/exercizer/subject-sequence/${sequenceId}/scheduled`);

/** Les destinataires possibles d'un parcours — même forme que pour un sujet. */
export const getSequenceShareTargets = (sequenceId: number, search?: string) =>
  get<ShareTargets>(
    `/exercizer/subject-sequence/share/json/${sequenceId}${search ? `?search=${encodeURIComponent(search)}` : ''}`,
  );

/**
 * Distribue un parcours : chacun de ses sujets devient une distribution ordinaire, rattachée au
 * parcours. Pas de mode entraînement pour un parcours.
 */
export const scheduleSubjectSequence = (
  sequenceId: number,
  body: {
    beginDate: string;
    dueDate: string;
    estimatedDuration?: string;
    isOneShotSubmit: boolean;
    randomDisplay: boolean;
    scheduledAt: ScheduledAt;
  },
) =>
  send<{ id: number }>('POST', `/exercizer/schedule-subject-sequence/${sequenceId}`, {
    ...body,
    isTrainingMode: false,
    isTrainingPermitted: false,
  });

export const unscheduleSubjectSequence = (id: number) =>
  sendVoid('DELETE', `/exercizer/unschedule-subject-sequence/${id}`);

export const getSubjectSequenceScheduled = (id: number) =>
  get<SubjectSequenceScheduledDetail>(`/exercizer/subject-sequence-scheduled/${id}`);

export const getSubjectSequenceProgress = (id: number) =>
  get<SubjectSequenceProgress>(`/exercizer/subject-sequence-scheduled/${id}/progress`);

export const sequenceExportCsvUrl = (id: number) =>
  `/exercizer/subject-sequence-scheduled/${id}/export-csv`;

// ── Pilotage en direct d'une séance ───────────────────────────────────────────

/** L'état consolidé de la séance — réservé au propriétaire de la distribution. */
export const getPilotageState = (subjectScheduledId: number) =>
  get<PilotageState>(`/exercizer/subject-scheduled/${subjectScheduledId}/pilotage`);

export const pausePilotage = (subjectScheduledId: number) =>
  sendVoid('PUT', `/exercizer/subject-scheduled/${subjectScheduledId}/pilotage/pause`, {});

export const resumePilotage = (subjectScheduledId: number) =>
  sendVoid('PUT', `/exercizer/subject-scheduled/${subjectScheduledId}/pilotage/resume`, {});

/** Sans `studentId`, la prolongation vaut pour toute la classe. */
export const extendPilotageTime = (subjectScheduledId: number, minutes: number, studentId?: string) =>
  sendVoid('PUT', `/exercizer/subject-scheduled/${subjectScheduledId}/pilotage/extend-time`, {
    minutes,
    studentId: studentId ?? null,
  });

export const forcePilotageSubmit = (subjectScheduledId: number, studentId: string) =>
  sendVoid('PUT', `/exercizer/subject-scheduled/${subjectScheduledId}/pilotage/force-submit`, {
    studentId,
  });

export const sendPilotageMessage = (subjectScheduledId: number, message: string, studentId?: string) =>
  sendVoid('POST', `/exercizer/subject-scheduled/${subjectScheduledId}/pilotage/message`, {
    message,
    studentId: studentId ?? null,
  });

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
