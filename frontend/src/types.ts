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

/**
 * Document attaché à un sujet (corrigé d'un sujet « simple »).
 *
 * ⚠ La clé est `doc_id`, pas `id` : c'est l'identifiant du document dans le workspace, et c'est
 * lui que la suppression attend. `metadata` recopie quelques informations du fichier pour éviter
 * d'interroger le workspace à chaque affichage.
 */
export interface SubjectDocument {
  doc_id: string;
  doc_type?: 'workspace' | 'storage';
  metadata?: {
    name?: string;
    filename?: string;
    size?: number;
    'content-type'?: string;
  };
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
  /** Passation en grand format pour les jeunes élèves (sql/043), recopiée sur la distribution. */
  large_display?: boolean;
  files?: SubjectDocument[];
  /**
   * Les partages du sujet (modèle entcore) : une entrée par personne ou par groupe, qui porte en
   * clés les actions accordées — cf. `rights.ts`. Absent ou vide : le sujet n'est pas partagé.
   */
  shared?: SharedEntry[];
}

export interface SharedEntry {
  userId?: string;
  groupId?: string;
  [action: string]: unknown;
}

/**
 * Les destinataires d'une distribution.
 *
 * ⚠ Le serveur range cet objet dans une colonne TEXTE : il arrive donc en CHAÎNE JSON et doit
 * être désérialisé par le client (cf. `api.ts#parseScheduledAt`), comme le faisait
 * `SubjectScheduledService#resolve`. `exclude` porte les élèves retirés de la distribution après
 * coup — leur copie n'est plus attendue.
 */
export interface Recipient {
  /** ⚠ La clé est `_id`, et non `id` : c'est ce qu'impose le schéma JSON du serveur
   *  (`jsonschema/subjectScheduled.json`, `additionalProperties: false`). */
  _id?: string;
  name: string;
}

export interface ScheduledAt {
  groupList: Recipient[];
  userList: Recipient[];
  exclude?: Recipient[];
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
  /** Sections (sql/039) : une question par page (défaut) ou une section par page. */
  display_mode?: DisplayMode;
  /** Grand format (sql/043) : gros caractères, une question à l'écran, énoncé lu à voix haute. */
  large_display?: boolean;
  /** Les destinataires sont prévenus d'un changement de dates. */
  is_notify?: boolean;
  /** Archives : décomptes calculés par le serveur, et corrigé historique (un seul fichier). */
  corrected_copy?: number;
  total_copy?: number;
  corrected_file_id?: string | null;
  corrected_metadata?: { filename?: string } | null;
}

/** Affichage pour l'élève pendant la passation. */
export type DisplayMode = 'grain' | 'section';

/** Fichier joint à une copie (rendu de l'élève, ou corrigé déposé par l'enseignant). */
export interface SubjectCopyFile {
  /** Identifiant du fichier physique dans le stockage — c'est lui que les routes attendent. */
  file_id: string;
  file_type?: 'homework' | 'corrected';
  metadata?: {
    name?: string;
    filename?: string;
    size?: number;
    'content-type'?: string;
  };
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
  /** Archives : fichiers historiques d'une copie de sujet « simple » (un rendu, un corrigé). */
  homework_metadata?: { filename?: string } | null;
  corrected_metadata?: { filename?: string } | null;
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

/**
 * Un sujet d'un parcours, à son rang. Le titre et le barème viennent d'une jointure serveur à la
 * lecture ; l'écriture n'attend que `subjectId` et `orderBy`.
 */
export interface SubjectSequenceItem {
  id: number;
  subject_sequence_id: number;
  subject_id: number;
  order_by: number;
  subject_title?: string;
  subject_description?: string;
  subject_max_score?: number;
}

/** Un parcours distribué, avec ses sujets distribués (`GET /subject-sequence-scheduled/:id`). */
export interface SubjectSequenceScheduledDetail {
  header: SubjectSequenceScheduled;
  children: Array<{
    id: number;
    subjectId: number;
    title: string;
    sequenceOrderBy: number;
    beginDate?: string;
    dueDate?: string;
    isOver?: boolean;
  }>;
}

/** L'avancement de la classe sur un parcours distribué — réservé à son propriétaire. */
export interface SubjectSequenceProgress {
  totalItems: number;
  students: Array<{
    studentId: string;
    studentName: string;
    submittedItems: number;
    correctedItems: number;
    averageScore: number | null;
    totalItems: number;
    completionRate: number;
  }>;
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

// ── Catalogue d'exercices (sql/041-subject-catalog.sql) ───────────────────────

/** Groupe d'affichage des niveaux, dans l'ordre de la scolarité. */
export type LevelGroup = 'maternelle' | 'elementaire' | 'college' | 'lycee' | 'lycee_pro' | 'superieur';

/** Un niveau scolaire du référentiel : `label` est une clé i18n, `code` un identifiant stable. */
export interface CatalogLevel {
  id: number;
  code: string | null;
  label: string;
  rank: number | null;
  level_group: LevelGroup | null;
}

/** Une matière du référentiel (`subject_lesson_type`) : `label` est une clé i18n. */
export interface CatalogDiscipline {
  id: number;
  code: string | null;
  label: string;
}

export interface CatalogReferential {
  levels: CatalogLevel[];
  disciplines: CatalogDiscipline[];
}

/** Le classement d'un sujet : des id de niveaux et de matières. */
export interface Classification {
  level_ids: number[];
  discipline_ids: number[];
}

/** Un sujet du catalogue, tel que la recherche le renvoie. */
export interface CatalogSubject extends Classification {
  id: number;
  title: string;
  description?: string | null;
  picture?: string | null;
  max_score?: number | null;
  type: 'interactive' | 'simple';
  /** L'auteur de la publication (ou l'usager technique des exercices fournis par Open ENT). */
  owner: string;
  owner_username: string;
  authors_contributors?: string | null;
  question_count: number;
  created?: string;
  modified?: string;
}

export interface CatalogPage {
  total: number;
  subjects: CatalogSubject[];
}

/** Un sujet du catalogue ouvert : ses grains et ses sections, pour l'aperçu. */
export interface CatalogSubjectDetail {
  subject: CatalogSubject;
  grains: Grain[];
  sections: Section[];
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

// ── Grains (les « briques » d'un sujet interactif) ────────────────────────────

/**
 * Un type de grain, tel que la table `exercizer.grain_type` le décrit.
 *
 * `name` sert aussi d'identifiant d'illustration : le module sert
 * `/exercizer/public/assets/icons/illustrations.svg#<name>`.
 * `is_in_list` distingue les types PROPOSÉS à l'enseignant (les questions) des trois types
 * techniques : 1 « choose », 2 « chooseAnswer » (deux étapes d'un grain pas encore décidé) et
 * 3 « statement » (l'énoncé, ajouté par son propre bouton).
 */
export interface GrainType {
  id: number;
  name: string;
  public_name: string;
  illustration?: string | null;
  is_in_list: boolean;
}

/** Document du workspace attaché à un grain (historique : plus proposé à l'ajout). */
export interface GrainDocument {
  id: string;
  name?: string;
  title?: string;
  path?: string;
  owner?: string;
  ownerName?: string;
  created?: string;
}

/**
 * Le contenu d'un grain.
 *
 * ⚠ Le serveur range cet objet dans une colonne TEXTE : il arrive donc en **chaîne JSON** et doit
 * être désérialisé par le client (`api.ts#parseGrains`), comme le faisait
 * `GrainService#instantiateGrain`. `custom_data`, lui, est un objet imbriqué, propre au type.
 */
export interface GrainData {
  title?: string;
  max_score?: number | string;
  /** Énoncé de la question, en HTML. L'énoncé d'un grain de type 3 vit dans `custom_data`. */
  statement?: string;
  document_list?: GrainDocument[];
  /** Indice, montré à l'élève pendant la passation. */
  answer_hint?: string;
  /** Explication, montrée à la correction. */
  answer_explanation?: string;
  custom_data?: GrainCustomData;
}

export interface Grain {
  id: number;
  subject_id: number;
  grain_type_id: number;
  /** Rang GLOBAL dans le sujet (continu, section par section) — cf. sql/039. */
  order_by: number;
  /** Section du grain (sql/039) ; nul = hors section, affiché en tête du sujet. */
  section_id?: number | null;
  created?: string;
  modified?: string;
  grain_data: GrainData;
  /** Les données du grain n'ont pas pu être lues : on n'écrit rien par-dessus (cf. `api.parseGrains`). */
  unreadable?: boolean;
}

/**
 * Une section d'un sujet (« Partie 1 – Calcul ») : un regroupement de grains, sur le modèle
 * Chapitre → Activités de LearnHouse. Les grains d'une section se suivent dans l'ordre global.
 */
export interface Section {
  id: number;
  subject_id: number;
  title: string;
  /** Consigne de la section, en HTML. */
  description?: string | null;
  order_by: number;
  created?: string;
  modified?: string;
}

/**
 * Une section DISTRIBUÉE, telle que la passation et la correction la reçoivent : avec les grains
 * distribués qui la composent, pour regrouper les copies de grains (`grain_scheduled_id`).
 */
export interface ScheduledSection {
  id: number;
  title: string;
  description?: string | null;
  order_by: number;
  grain_scheduled_ids: number[];
}

/** Une réponse d'un grain à liste (réponses multiples, mise en ordre). */
export interface GrainAnswer {
  text?: string;
  /** QCM : réponse attendue. */
  isChecked?: boolean;
  /** Association : les deux colonnes. */
  text_left?: string;
  text_right?: string;
  /** Mise en ordre : rang attendu (1-n) de la réponse. */
  order_by?: number;
}

/** Une zone d'un grain « à trous » ou « à remplir » (types 10, 11, 12). */
export interface GrainZone {
  answer: string;
  options?: string[];
  id?: number;
  position?: { x: number; y: number; z: number };
}

/**
 * `custom_data` réunit les champs propres à chaque type. On les décrit dans un seul objet, tous
 * facultatifs : le serveur ne valide rien, et un sujet ancien peut porter n'importe quel
 * sous-ensemble.
 */
export interface GrainCustomData {
  /** Type 3 (énoncé) : le texte, en HTML. */
  statement?: string;
  /**
   * Type 3 : le titre de l'énoncé y est RECOPIÉ (`StatementCustomData` porte `{statement, title}`).
   * Le serveur ne remonte parfois que celui-là dans une copie de grain — d'où la reprise faite à
   * la lecture (`api.ts#parseGrainCopies`).
   */
  title?: string;
  /** Type 4 (réponse simple). */
  correct_answer?: string;
  /** Types 6, 7, 8, 9 : les réponses, dans une forme propre au type (cf. GrainAnswer). */
  correct_answer_list?: GrainAnswer[];
  /** Types 6 à 9 : « aucune erreur admise » — tout ou rien plutôt qu'un score partiel. */
  no_error_allowed?: boolean;
  /** Type 7 (QCM) : plusieurs bonnes réponses possibles. */
  multipleAnswers?: boolean;
  /** Type 8 (association) : montrer la colonne de gauche à l'élève. */
  show_left_column?: boolean;
  /** Types 10, 11, 12 : zones à remplir. */
  zones?: GrainZone[];
  /** Type 13 (SCORM) : le paquet déposé et la version qu'il déclare. */
  packageId?: number;
  scormVersion?: string;
  options?: string[];
  answersType?: string;
  htmlContent?: string;
  _guideImage?: string;
}

// ── Copies de grains (ce que l'élève remplit) ─────────────────────────────────

/**
 * Un grain DISTRIBUÉ : la photographie du grain au moment de l'attribution, avec les bonnes
 * réponses. `grain_data` arrive en chaîne JSON, comme pour un grain.
 *
 * ⚠ Ces données portent les RÉPONSES ATTENDUES. On ne les demande qu'à la consultation d'une
 * copie corrigée — jamais pendant la passation, où elles se retrouveraient dans le navigateur de
 * l'élève. L'ancienne IHM observe la même règle.
 */
export interface GrainScheduled {
  id: number;
  subject_scheduled_id: number;
  grain_type_id: number;
  order_by: number;
  created?: string;
  grain_data: GrainData;
}

/**
 * Ce que l'élève a rempli, par type. Les champs `filled_*` sont le pendant des
 * `correct_*` du grain distribué.
 */
export interface GrainCustomCopyData {
  /** Types 4 (réponse simple) et 5 (réponse ouverte, en HTML). */
  filled_answer?: string;
  /** Types 6, 7, 8, 9 : les réponses de l'élève, dans la forme propre au type. */
  filled_answer_list?: GrainAnswer[];
  /** Type 8 : les étiquettes encore disponibles (colonne de droite, mélangée). */
  possible_answer_list?: GrainAnswer[];
  /** Type 8 sans colonne de gauche : toutes les étiquettes, des deux côtés. */
  all_possible_answer?: Array<{ item: string; rank?: number }>;
  /** Recopiés du grain distribué pour que la passation sache quoi afficher. */
  no_error_allowed?: boolean;
  multipleAnswers?: boolean;
  show_left_column?: boolean;
  /**
   * Types 10, 11, 12 : la copie reprend TOUT le grain — texte, image de fond, propositions —
   * avec les réponses des zones effacées (cf. `zones.ts#zoneCopyData`).
   */
  zones?: GrainZone[];
  /** Type 13 (SCORM) : le paquet déposé, recopié du grain distribué pour que l'élève le joue. */
  packageId?: number;
  scormVersion?: string;
  options?: string[];
  answersType?: string;
  htmlContent?: string;
  _guideImage?: string;
  /** Type 3 (énoncé) : le serveur le range ici. */
  statement?: string;
}

/**
 * Le contenu d'une copie de grain. Recopie du grain distribué ce que l'élève doit VOIR (titre,
 * barème, énoncé, indice) — mais jamais les bonnes réponses.
 *
 * ⚠ `grain_copy_data` arrive en chaîne JSON et doit être désérialisé.
 * ⚠ Pour un grain de type 3, le serveur pose l'énoncé dans `custom_data` et non dans
 *   `custom_copy_data` : `GrainCopyService#instantiateGrainCopy` le recopiait à la lecture.
 */
export interface GrainCopyData {
  title?: string;
  max_score?: number;
  statement?: string;
  document_list?: GrainDocument[];
  answer_hint?: string;
  custom_copy_data?: GrainCustomCopyData;
  /** Énoncé d'un grain de type 3 (et son titre). */
  custom_data?: GrainCustomData;
}

export interface GrainCopy {
  id: number;
  subject_copy_id: number;
  grain_type_id: number;
  grain_scheduled_id: number;
  order_by: number;
  /** Rang d'affichage quand le sujet mélange ses questions (`random_display`). */
  display_order?: number | null;
  created?: string;
  modified?: string;
  /** Note attribuée par l'enseignant. */
  final_score?: number | null;
  /** Note calculée automatiquement — par le CLIENT, à la consultation. */
  calculated_score?: number | null;
  comment?: string;
  grain_copy_data: GrainCopyData;
  /** Les données de la copie n'ont pas pu être lues : aucune réponse n'est enregistrée par-dessus. */
  unreadable?: boolean;
}
