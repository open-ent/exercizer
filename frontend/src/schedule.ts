/**
 * Règles de la DISTRIBUTION d'un sujet — portage de la directive `subjectSchedule`, de
 * `SubjectScheduledService#schedule` et de `GrainCopyService#createGrainCopyCustomList`.
 *
 * Trois morceaux, tous testables sans réseau :
 *  - ce qui rend un sujet distribuable (toutes ses questions doivent avoir une réponse) ;
 *  - les destinataires, et la règle d'exclusion qui n'est pas celle qu'on croit ;
 *  - la préparation de la COPIE INITIALE de chaque question, que le serveur attend toute faite.
 */

import { GRAIN, isQuestion } from './grains';
import {
  Grain,
  GrainAnswer,
  GrainCopyData,
  GrainCustomCopyData,
  ScheduledAt,
  Subject,
} from './types';

// ── Ce qui rend un sujet distribuable ─────────────────────────────────────────

/**
 * Pourquoi un sujet ne peut pas être distribué. `null` = il peut l'être.
 *
 * Les clés sont celles de l'ancienne IHM : `…check.schedule` quand il n'y a pas de question,
 * `…check.schedule.resp` quand une question n'a pas de réponse attendue.
 */
export type ScheduleBlocker =
  | 'exercizer.service.check.schedule'
  | 'exercizer.service.check.schedule.resp'
  | null;

/**
 * Un sujet sans question ne se distribue pas, et une question sans réponse attendue non plus :
 * elle serait impossible à corriger.
 *
 * ⚠ Les règles par type sont celles de `canSchedule`, à la lettre — y compris le fait que la
 * réponse SIMPLE (type 4) n'est pas vérifiée : un sujet dont la seule question est une réponse
 * simple sans corrigé passe. On ne durcit pas : distribuer est une action que les enseignants
 * font déjà, et un refus nouveau bloquerait un usage existant.
 */
export function scheduleBlocker(grains: Grain[]): ScheduleBlocker {
  if (grains.length === 0) return 'exercizer.service.check.schedule';

  let questions = 0;
  let allAnswered = true;

  for (const grain of grains) {
    const answers = grain.grain_data?.custom_data?.correct_answer_list;
    switch (grain.grain_type_id) {
      case GRAIN.CHOOSE:
      case GRAIN.CHOOSE_ANSWER:
      case GRAIN.STATEMENT:
        // Ni question, ni contenu à vérifier.
        break;
      case GRAIN.MULTIPLE_ANSWERS:
      case GRAIN.ORDER_BY:
        questions += 1;
        if (!answers || answers.length === 0) allAnswered = false;
        break;
      case GRAIN.QCM:
        questions += 1;
        // Un QCM dont aucune proposition n'est cochée n'a pas de bonne réponse.
        if (!answers || answers.length === 0 || !answers.some((a) => a.isChecked)) {
          allAnswered = false;
        }
        break;
      case GRAIN.ASSOCIATION:
        questions += 1;
        if (!answers || answers.length === 0) allAnswered = false;
        // Une paire à moitié vide ne se corrige pas.
        else if (answers.some((a) => a.text_left === '' || a.text_right === '')) {
          allAnswered = false;
        }
        break;
      default:
        // Réponse simple, réponse ouverte, grains à zones : comptés, jamais recalés.
        questions += 1;
    }
  }

  if (questions === 0) return 'exercizer.service.check.schedule';
  return allAnswered ? null : 'exercizer.service.check.schedule.resp';
}

// ── Destinataires ─────────────────────────────────────────────────────────────

/** Un destinataire choisi dans la recherche : un groupe, ou quelqu'un en particulier. */
export interface PickedGroup {
  _id: string;
  name: string;
}

export interface PickedUser {
  _id: string;
  name: string;
  profile?: string;
  /** Renseigné quand la personne est arrivée AVEC son groupe, et non choisie une par une. */
  groupId?: string;
  /** Retirée de la distribution bien que son groupe y soit. */
  exclude?: boolean;
}

/**
 * Les destinataires, dans la forme que le serveur attend.
 *
 * ⚠ Règle contre-intuitive, reprise telle quelle de `createSubjectScheduledAt` : `userList` ne
 * contient QUE les personnes choisies une par une. Celles qui viennent d'un groupe n'y figurent
 * pas — le serveur résout le groupe lui-même — et n'apparaissent que dans `exclude` si on les a
 * retirées. Les y ajouter créerait des copies en double.
 *
 * ⚠ La clé est `_id`, pas `id` : le schéma JSON du serveur est en `additionalProperties: false`.
 */
export function buildScheduledAt(groups: PickedGroup[], users: PickedUser[]): ScheduledAt {
  const groupList = groups.map((group) => ({ _id: group._id, name: group.name }));
  const userList = users
    .filter((user) => user.groupId === undefined)
    .map((user) => ({ _id: user._id, name: user.name, profile: user.profile }));

  const excluded = new Map<string, { _id: string; name: string; profile?: string }>();
  for (const user of users) {
    if (user.groupId !== undefined && user.exclude) {
      excluded.set(user._id, { _id: user._id, name: user.name, profile: user.profile });
    }
  }

  return { groupList, userList, exclude: [...excluded.values()] };
}

/** Y a-t-il seulement quelqu'un à qui distribuer ? */
export function hasRecipients(scheduledAt: ScheduledAt): boolean {
  return scheduledAt.groupList.length > 0 || scheduledAt.userList.length > 0;
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/**
 * Une borne de temps, dans la forme exacte que l'ancienne IHM produit : la date du jour choisi,
 * l'heure saisie, et un `Z` final.
 *
 * ⚠ L'heure est donc interprétée comme de l'UTC, PAS comme l'heure locale. Ce n'est pas une
 * étourderie de ce portage : `moment(date).hours(12)…toISOString().replace(/T..:../, "T"+time)`
 * produit exactement cela, et c'est ce que la base contient pour toutes les distributions
 * existantes. S'en écarter décalerait les échéances d'une à deux heures selon la saison, et pas
 * dans le même sens que les sujets déjà distribués.
 */
export function toScheduleDate(date: Date, time: string): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  // La date est prise en heure LOCALE : c'est le jour que l'enseignant a cliqué.
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${normaliseTime(time)}:00.000Z`;
}

/** `HH:mm` ou la valeur de repli — `checkTime` de l'ancienne IHM. */
export function normaliseTime(time: string, endOfDay = false): string {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time) ? time : endOfDay ? '23:59' : '00:00';
}

/** Les bornes sont-elles cohérentes ? Le début précède la fin, et le corrigé ne la précède pas. */
export function areDatesValid(options: {
  beginDate: Date;
  beginTime: string;
  dueDate: Date;
  dueTime: string;
  correctedDate?: Date;
  correctedTime?: string;
}): boolean {
  const begin = Date.parse(toScheduleDate(options.beginDate, options.beginTime));
  const due = Date.parse(toScheduleDate(options.dueDate, options.dueTime));
  if (Number.isNaN(begin) || Number.isNaN(due) || begin >= due) return false;
  if (!options.correctedDate) return true;
  const corrected = Date.parse(
    toScheduleDate(options.correctedDate, options.correctedTime ?? '00:00'),
  );
  return !Number.isNaN(corrected) && due <= corrected;
}

// ── La copie initiale de chaque question ──────────────────────────────────────

/**
 * Mélange une liste. Le tirage est injectable pour que les tests puissent le figer : l'ancienne
 * IHM tirait au sort directement, ce qui rendait sa préparation invérifiable.
 */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Ce que l'élève trouvera dans sa copie pour une question donnée, avant d'y répondre.
 *
 * C'est le CLIENT qui le prépare — le serveur le range tel quel — et c'est là que se joue le
 * mélange : les étiquettes d'une association et l'ordre initial d'une mise en ordre sont tirés
 * au sort ici, une fois pour toutes, à la distribution.
 */
export function initialCopyData(grain: Grain, random: () => number = Math.random): GrainCustomCopyData {
  const data = grain.grain_data?.custom_data ?? {};
  const answers: GrainAnswer[] = data.correct_answer_list ?? [];

  switch (grain.grain_type_id) {
    case GRAIN.SIMPLE_ANSWER:
    case GRAIN.OPEN_ANSWER:
      return { filled_answer: '' };

    case GRAIN.MULTIPLE_ANSWERS:
      // Autant de champs vides que de réponses attendues.
      return {
        filled_answer_list: answers.map(() => ({ text: '' })),
        no_error_allowed: data.no_error_allowed === true,
      };

    case GRAIN.QCM:
      // Les propositions sont recopiées : l'élève ne fait que cocher.
      return {
        filled_answer_list: answers.map((answer) => ({ text: answer.text })),
        no_error_allowed: data.no_error_allowed === true,
        multipleAnswers: data.multipleAnswers === true,
      };

    case GRAIN.ASSOCIATION:
      return associationCopyData(answers, data.show_left_column !== false, random);

    case GRAIN.ORDER_BY:
      return {
        // L'ordre de départ est mélangé : le retrouver EST l'exercice.
        filled_answer_list: shuffle(answers, random).map((answer, index) => ({
          text: answer.text,
          order_by: index + 1,
        })),
        no_error_allowed: data.no_error_allowed === true,
      };

    case GRAIN.TEXT_TO_FILL:
    case GRAIN.AREA_SELECT:
    case GRAIN.AREA_SELECT_IMAGE:
      // Les zones sont recopiées, vidées de leur réponse.
      return { zones: (data.zones ?? []).map((zone) => ({ ...zone, answer: '' })) };

    default:
      return {};
  }
}

/**
 * Association. Deux formes selon que la colonne de gauche est montrée :
 *  - montrée : les lignes de gauche sont posées, et les étiquettes de droite forment un tas
 *    mélangé (`possible_answer_list`) dans lequel l'élève pioche ;
 *  - masquée : les deux colonnes sont vides, et TOUTES les étiquettes — gauche et droite
 *    confondues — vont dans un même tas (`all_possible_answer`).
 */
function associationCopyData(
  answers: GrainAnswer[],
  showLeftColumn: boolean,
  random: () => number,
): GrainCustomCopyData {
  if (showLeftColumn) {
    return {
      filled_answer_list: answers.map((answer) => ({
        text_left: answer.text_left,
        text_right: null as unknown as string,
      })),
      possible_answer_list: shuffle(
        answers.map((answer) => ({ text_right: answer.text_right })),
        random,
      ),
      show_left_column: true,
    };
  }

  return {
    filled_answer_list: answers.map(() => ({
      text_left: null as unknown as string,
      text_right: null as unknown as string,
    })),
    all_possible_answer: shuffle(
      answers.flatMap((answer) => [
        { item: answer.text_left ?? '' },
        { item: answer.text_right ?? '' },
      ]),
      random,
    ),
    show_left_column: false,
  };
}

/** Une entrée de `grainsCustomCopyData` : ce que le serveur attend par question. */
export interface GrainCustomCopy {
  grain_id: number;
  grain_copy_data: GrainCopyData;
}

/**
 * La copie initiale de TOUTES les questions d'un sujet — `createGrainCopyCustomList`.
 * Les énoncés en sont absents : le serveur les recopie lui-même.
 */
export function buildGrainsCustomCopyData(
  grains: Grain[],
  random: () => number = Math.random,
): GrainCustomCopy[] {
  return grains
    .filter((grain) => isQuestion(grain.grain_type_id))
    .map((grain) => ({
      grain_id: grain.id,
      grain_copy_data: {
        title: grain.grain_data?.title,
        max_score: Number(grain.grain_data?.max_score ?? 0),
        statement: grain.grain_data?.statement,
        document_list: grain.grain_data?.document_list,
        answer_hint: grain.grain_data?.answer_hint,
        custom_copy_data: initialCopyData(grain, random),
      },
    }));
}

// ── Le corps envoyé au serveur ────────────────────────────────────────────────

/** Les réglages de la distribution, tels que l'écran les recueille. */
export interface ScheduleOptions {
  /** `classic` : avec des bornes de temps. `training` : à faire librement, sans échéance. */
  mode: 'classic' | 'training';
  beginDate: Date;
  beginTime: string;
  dueDate: Date;
  dueTime: string;
  correctedDate?: Date;
  correctedTime?: string;
  /** L'élève peut rendre plusieurs fois (donc PAS un envoi unique). */
  allowStudentsToUpdateCopy?: boolean;
  /** L'élève ne pourra pas se refaire le sujet pour s'entraîner. */
  forbidTraining?: boolean;
  randomDisplay?: boolean;
  /** Durée estimée, en minutes. */
  estimatedDuration?: string;
}

/**
 * Le corps de `POST /schedule-subject/:id`.
 *
 * ⚠ En mode entraînement, les deux bornes valent l'ÉPOQUE (1970) : c'est ainsi que l'ancienne
 * IHM signale « pas d'échéance », et les écrans élève s'y fient.
 */
export function buildScheduleBody(
  subject: Subject,
  options: ScheduleOptions,
  scheduledAt: ScheduledAt,
  grains: Grain[],
  random: () => number = Math.random,
) {
  const training = options.mode === 'training';
  const epoch = new Date(0);

  return {
    subjectTitle: subject.title,
    beginDate: training
      ? toScheduleDate(epoch, '00:00')
      : toScheduleDate(options.beginDate, options.beginTime),
    dueDate: training
      ? toScheduleDate(epoch, '00:00')
      : toScheduleDate(options.dueDate, normaliseTime(options.dueTime, true)),
    estimatedDuration: options.estimatedDuration,
    isOneShotSubmit: training ? false : !options.allowStudentsToUpdateCopy,
    isTrainingMode: training,
    isTrainingPermitted: training ? false : !options.forbidTraining,
    randomDisplay: options.randomDisplay === true,
    scheduledAt,
    grainsCustomCopyData: buildGrainsCustomCopyData(grains, random),
  };
}

/**
 * Le corps de `POST /schedule-simple-subject/:id`. Un sujet « simple » n'a ni grains ni options :
 * trois dates et des destinataires, et la date de corrigé y est OBLIGATOIRE.
 */
export function buildSimpleScheduleBody(
  subject: Subject,
  options: ScheduleOptions,
  scheduledAt: ScheduledAt,
) {
  return {
    subjectTitle: subject.title,
    beginDate: toScheduleDate(options.beginDate, options.beginTime),
    dueDate: toScheduleDate(options.dueDate, normaliseTime(options.dueTime, true)),
    correctedDate: toScheduleDate(
      options.correctedDate ?? options.dueDate,
      options.correctedTime ?? '00:00',
    ),
    scheduledAt,
  };
}
