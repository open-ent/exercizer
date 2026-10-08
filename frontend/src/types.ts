/**
 * Modèle de données d'Exercizer, tel que le serveur le renvoie.
 *
 * Reprend fidèlement les interfaces de l'IHM AngularJS (`ts/app/models/domain/`) : le backend
 * Java est INCHANGÉ par la migration, les deux interfaces lisent donc exactement les mêmes
 * objets. Les noms de champs sont ceux des colonnes PostgreSQL (serpent minuscule) ; on ne les
 * renomme pas, pour qu'une comparaison avec l'ancienne IHM reste immédiate.
 */

/** Dossier de rangement des sujets (arborescence, `parent_folder_id` nul = racine). */
export interface Folder {
  id: number;
  parent_folder_id: number | null;
  owner: string;
  created?: string;
  modified?: string;
  label: string;
}

/** Document du workspace attaché à un sujet ou à une copie. */
export interface SubjectDocument {
  id: string;
  name?: string;
  title?: string;
  created?: string;
}

/** Le type d'un sujet : `simple` (énoncé + fichier rendu) ou vide/`null` (sujet à grains). */
export type SubjectType = 'simple' | string | null;

/** Un sujet (l'exercice tel que l'enseignant le conçoit, avant distribution). */
export interface Subject {
  id: number;
  folder_id: number | null;
  original_subject_id?: number | null;
  owner: string;
  owner_username?: string;
  created?: string;
  modified?: string;
  title: string;
  description?: string;
  picture?: string;
  max_score?: number;
  authors_contributors?: string;
  is_library_subject?: boolean;
  is_deleted?: boolean;
  type?: SubjectType;
  files?: SubjectDocument[];
}

/**
 * Les destinataires d'une distribution.
 *
 * ⚠ Le serveur range cet objet dans une colonne TEXTE : il arrive donc en CHAÎNE JSON et doit
 * être désérialisé par le client (cf. `api.ts#parseScheduledAt`), comme le faisait
 * `SubjectScheduledService#resolve`. `exclude` porte les élèves retirés de la distribution après
 * coup — leur copie n'est plus attendue.
 */
export interface ScheduledAt {
  groupList: Array<{ id?: string; name: string }>;
  userList: Array<{ id?: string; name: string }>;
  exclude?: Array<{ id?: string; name: string }>;
}

/**
 * Un sujet DISTRIBUÉ : la photographie du sujet au moment de l'attribution, avec ses bornes de
 * temps et ses options. C'est lui que l'élève voit, jamais le sujet d'origine — modifier le sujet
 * après distribution ne change donc rien aux copies en cours.
 */
export interface SubjectScheduled {
  id: number;
  subject_id: number;
  owner: string;
  owner_username?: string;
  created?: string;
  modified?: string;
  title: string;
  description?: string;
  picture?: string;
  max_score?: number;
  begin_date?: string;
  due_date?: string;
  corrected_date?: string;
  estimated_duration?: string;
  is_over?: boolean;
  /** Un seul envoi autorisé : une copie rendue n'est plus modifiable. */
  is_one_shot_submit?: boolean;
  random_display?: boolean;
  /** Le résultat s'affiche de lui-même pour l'élève dès la date de rendu passée. */
  has_automatic_display?: boolean;
  is_deleted?: boolean;
  scheduled_at?: ScheduledAt;
  type?: SubjectType;
  is_training_mode?: boolean;
  /** L'élève peut se refaire le sujet « pour s'entraîner » après correction. */
  is_training_permitted?: boolean;
  files?: SubjectDocument[];
  /** Pilotage en direct (sql/036) : 'en_cours' | 'en_pause'. */
  session_state?: string;
  paused_at?: string;
  paused_duration_seconds?: number;
  /** Parcours (sql/037) — nul = hors parcours. */
  subject_sequence_scheduled_id?: number | null;
  sequence_order_by?: number;
}

/** Fichier joint à une copie (rendu de l'élève, ou corrigé déposé par l'enseignant). */
export interface SubjectCopyFile {
  id: string;
  name?: string;
  title?: string;
  created?: string;
}

/** La copie d'un élève pour un sujet distribué. */
export interface SubjectCopy {
  id: number;
  subject_scheduled_id: number;
  owner: string;
  owner_username?: string;
  created?: string;
  modified?: string;
  final_score?: number | null;
  calculated_score?: number | null;
  comment?: string;
  has_been_started?: boolean;
  submitted_date?: string | null;
  is_correction_on_going?: boolean;
  is_corrected?: boolean;
  is_deleted?: boolean;
  /** Décalage horaire du poste de l'élève au moment du rendu (conservé par le serveur). */
  offset?: number;
  /** Copie d'entraînement : refaite à l'initiative de l'élève, hors notation. */
  is_training_copy?: boolean;
  current_grain_id?: number | null;
  corrected_files?: SubjectCopyFile[];
  homework_files?: SubjectCopyFile[];
  /** Pilotage en direct (sql/036). */
  extra_time_minutes?: number;
  is_forced_submit?: boolean;
  /** Date de rendu recopiée par le serveur depuis le sujet distribué (routes élève). */
  dueDate?: string;
}

/** Parcours : une suite ordonnée de sujets distribuée en un bloc. */
export interface SubjectSequence {
  id: number;
  owner: string;
  owner_username?: string;
  title: string;
  description?: string;
  created?: string;
  modified?: string;
  is_deleted?: boolean;
}

export interface SubjectSequenceScheduled {
  id: number;
  subject_sequence_id: number;
  owner: string;
  title: string;
  description?: string;
  begin_date?: string;
  due_date?: string;
  created?: string;
  scheduled_at?: ScheduledAt;
}

/** Étiquette libre posée sur un sujet (filtre de la bibliothèque). */
export interface SubjectTag {
  id: number;
  label: string;
}

export interface SubjectLessonType {
  id: number;
  label: string;
}

export interface SubjectLessonLevel {
  id: number;
  label: string;
}

/**
 * Les états d'une copie, dans l'ordre où l'IHM AngularJS les évalue
 * (`SubjectCopyService#copyState`). `null` = copie jamais ouverte.
 */
export type CopyState =
  | 'is_corrected'
  | 'is_correction_on_going'
  | 'is_submitted'
  | 'has_been_started'
  // Copies d'entraînement : trois états à part, la notation ne les concerne pas.
  | 'is_done'
  | 'is_on_going'
  | 'is_sided'
  | null;
