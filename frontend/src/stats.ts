/**
 * Statistiques d'une distribution — portage de la directive `stats` de l'IHM AngularJS
 * (`teacher_dashboard/common/directives/stats.ts`) : la matrice « élève × question », les
 * moyennes, et les deux exports CSV.
 *
 * Sans réseau ni composant : l'écran charge les copies de grains et le corrigé, ce module en
 * tire tout ce qui s'affiche et tout ce qui s'exporte.
 */

import { automaticCorrection } from './correction';
import { GRAIN, isQuestion, sanitizeScore } from './grains';
import { GrainCopy, GrainScheduled, SubjectCopy, SubjectScheduled } from './types';

/** La case d'un élève pour une question. */
export interface StatCell {
  /** Le score affiché : la note de l'enseignant si elle diffère du score automatique. */
  score: number | null;
  /** Le score automatique, rappelé en infobulle quand l'enseignant l'a amendé. */
  calculated: number | null;
  /** L'enseignant a amendé le score automatique — la case porte alors un astérisque. */
  changed: boolean;
}

interface Tally {
  sum: number;
  nb: number;
}

export interface DistributionStats {
  /** Les questions (hors énoncés), dans l'ordre du sujet : ce sont les colonnes Q1, Q2… */
  questions: GrainScheduled[];
  /** copie → question distribuée → case. Seules les copies RENDUES y figurent. */
  matrix: Map<number, Map<number, StatCell>>;
  /** Moyenne par question, sur les copies qui ont un score pour elle. */
  averages: Map<number, number | null>;
  /** Moyennes du score automatique et du score final des copies rendues. */
  auto: number | null;
  final: number | null;
}

const mean = (tally: Tally | undefined): number | null =>
  tally && tally.nb > 0 ? tally.sum / tally.nb : null;

/** Les colonnes de la matrice : les questions, triées par rang. */
export function statQuestions(reference: GrainScheduled[]): GrainScheduled[] {
  return reference
    .filter((grain) => isQuestion(grain.grain_type_id))
    .sort((a, b) => a.order_by - b.order_by);
}

/**
 * Construit la matrice et ses moyennes.
 *
 * Deux règles reprises de l'original :
 *  - seules les copies RENDUES comptent ;
 *  - tant que l'enseignant n'a pas commencé à corriger une copie, le score automatique de ses
 *    questions est RECALCULÉ ici — celui de la base peut dater d'un rendu précédent. Une fois la
 *    correction entamée, on garde ce qui est enregistré.
 */
export function buildStats(
  copies: SubjectCopy[],
  grainCopiesByCopy: Map<number, GrainCopy[]>,
  reference: GrainScheduled[],
): DistributionStats {
  const matrix = new Map<number, Map<number, StatCell>>();
  const perQuestion = new Map<number, Tally>();
  const auto: Tally = { sum: 0, nb: 0 };
  const final: Tally = { sum: 0, nb: 0 };
  const referenceById = new Map(reference.map((grain) => [grain.id, grain]));

  for (const copy of copies) {
    if (!copy.submitted_date) continue;
    if (copy.calculated_score !== null && copy.calculated_score !== undefined) {
      auto.sum += copy.calculated_score;
      auto.nb++;
    }
    if (copy.final_score !== null && copy.final_score !== undefined) {
      final.sum += copy.final_score;
      final.nb++;
    }

    const row = new Map<number, StatCell>();
    for (const grainCopy of grainCopiesByCopy.get(copy.id) ?? []) {
      const model = referenceById.get(grainCopy.grain_scheduled_id);
      let calculated = grainCopy.calculated_score ?? null;
      if (!copy.is_correction_on_going && model) {
        calculated = automaticCorrection(
          model.grain_type_id,
          sanitizeScore(model.grain_data.max_score),
          model.grain_data.custom_data,
          grainCopy.grain_copy_data.custom_copy_data,
        ).calculated_score;
      }
      const amended =
        grainCopy.final_score !== null &&
        grainCopy.final_score !== undefined &&
        grainCopy.final_score !== calculated;
      const score = amended ? (grainCopy.final_score as number) : calculated;
      if (score !== null) {
        const tally = perQuestion.get(grainCopy.grain_scheduled_id) ?? { sum: 0, nb: 0 };
        tally.sum += score;
        tally.nb++;
        perQuestion.set(grainCopy.grain_scheduled_id, tally);
      }
      row.set(grainCopy.grain_scheduled_id, { score, calculated, changed: amended });
    }
    matrix.set(copy.id, row);
  }

  const questions = statQuestions(reference);
  return {
    questions,
    matrix,
    averages: new Map(questions.map((grain) => [grain.id, mean(perQuestion.get(grain.id))])),
    auto: mean(auto),
    final: mean(final),
  };
}

/** Couleur d'une case : tout juste, partiel, tout faux, ou sans score. */
export type ScoreLevel = 'full' | 'partial' | 'none' | 'empty';

export function scoreLevel(cell: StatCell | undefined, maxScore: number): ScoreLevel {
  if (!cell || cell.score === null) return 'empty';
  if (cell.score === maxScore) return 'full';
  return cell.score === 0 ? 'none' : 'partial';
}

/**
 * Un score tel qu'on l'AFFICHE — filtre `truncateNumber` : un entier reste entier, le reste
 * prend deux décimales, et l'absence de score se lit « - ».
 */
export function displayScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Un score tel qu'on l'EXPORTE — `formatScore` de la directive : TRONQUÉ (et non arrondi) à deux
 * décimales, avec une virgule, pour qu'un tableur français le lise comme un nombre.
 */
export function csvScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const match = value.toString().match(/^-?\d+(?:\.\d{0,2})?/);
  return match ? match[0].replace('.', ',') : '';
}

/** Les libellés dont les exports ont besoin — l'i18n reste à l'appelant. */
export interface CsvLabels {
  subjectTitle: string;
  subjectType: string;
  studentName: string;
  autoScore: string;
  finalScore: string;
  comment: string;
  average: string;
  interactive: string;
  questionType: string;
  noAnswer: string;
  /** Le nom public d'un type de question, déjà traduit. */
  grainTypeName: (grainTypeId: number) => string;
}

/** Le BOM qui fait reconnaître l'UTF-8 à Excel, et les fins de ligne qu'il attend. */
const BOM = '﻿';
const EOL = '\r\n';

const questionHeader = (questions: GrainScheduled[]) =>
  questions.map((grain, index) => `Q${index + 1}>${grain.grain_data.title ?? ''};`).join('');

/**
 * Export « simple » : les scores par question, le score automatique, le score final et le
 * commentaire de chaque élève, puis la ligne des moyennes.
 */
export function simpleCsv(
  scheduled: SubjectScheduled,
  copies: SubjectCopy[],
  stats: DistributionStats,
  labels: CsvLabels,
): string {
  const { questions } = stats;
  let csv = BOM;
  csv += `${labels.subjectTitle};${labels.subjectType};${labels.studentName};`;
  csv += questionHeader(questions);
  csv += `${labels.autoScore};${labels.finalScore};${labels.comment};${EOL}`;

  for (const copy of copies) {
    csv += `${scheduled.title};${labels.interactive};${copy.owner_username ?? ''};`;
    const row = stats.matrix.get(copy.id);
    for (const grain of questions) {
      csv += `${row ? csvScore(row.get(grain.id)?.score) : ''};`;
    }
    csv += `${csvScore(copy.calculated_score)};${csvScore(copy.final_score)};${copy.comment ?? ''};${EOL}`;
  }

  csv += `${labels.average};;;`;
  for (const grain of questions) csv += `${csvScore(stats.averages.get(grain.id))};`;
  csv += `${csvScore(stats.auto)};${csvScore(stats.final)};;${EOL}`;
  return csv;
}

const TAGS = /<[^>]*>/gm;

/**
 * La réponse d'un élève à une question, en texte — une ligne par élément pour les questions à
 * liste. Les deux types « zones à remplir » (11, 12) ne sont pas exportés : l'original ne le
 * faisait pas, et le libellé de l'export le dit.
 */
export function answerText(grainCopy: GrainCopy, noAnswer: string): string {
  const data = grainCopy.grain_copy_data.custom_copy_data ?? {};
  const list = data.filled_answer_list ?? [];
  switch (grainCopy.grain_type_id) {
    case GRAIN.SIMPLE_ANSWER:
      return data.filled_answer || noAnswer;
    case GRAIN.OPEN_ANSWER:
      return (data.filled_answer || noAnswer).replace(TAGS, '');
    case GRAIN.MULTIPLE_ANSWERS:
      return list.map((answer) => `${answer.text || noAnswer}${EOL}`).join('');
    case GRAIN.QCM:
      return list
        .filter((answer) => answer.isChecked)
        .map((answer) => `${answer.text || noAnswer}${EOL}`)
        .join('');
    case GRAIN.ASSOCIATION:
      return list
        .map((answer) => `${answer.text_left ?? ''} : ${answer.text_right || noAnswer}${EOL}`)
        .join('');
    case GRAIN.ORDER_BY: {
      let text = '';
      for (let rank = 1; rank <= list.length; rank++) {
        const answer = list.find((item) => item.order_by === rank);
        text += `${answer?.text || noAnswer}${EOL}`;
      }
      return text;
    }
    case GRAIN.TEXT_TO_FILL: {
      const zones = data.zones ?? [];
      let text = '';
      for (let id = 0; id < zones.length; id++) {
        const zone = zones.find((item) => item.id === id);
        text += `${zone?.answer || noAnswer}${EOL}`;
      }
      return text;
    }
    default:
      return '';
  }
}

/** Export « complet » : la réponse de chaque élève à chaque question. */
export function fullCsv(
  copies: SubjectCopy[],
  grainCopiesByCopy: Map<number, GrainCopy[]>,
  stats: DistributionStats,
  labels: CsvLabels,
): string {
  const { questions } = stats;
  let csv = BOM;
  csv += `;${questionHeader(questions)}${EOL}`;
  csv += `${labels.questionType};`;
  for (const grain of questions) csv += `${labels.grainTypeName(grain.grain_type_id)};`;
  csv += EOL;

  for (const copy of copies) {
    csv += `${copy.owner_username ?? ''};`;
    const grainCopies = grainCopiesByCopy.get(copy.id);
    if (stats.matrix.has(copy.id) && grainCopies) {
      for (const grain of questions) {
        const grainCopy = grainCopies.find((item) => item.grain_scheduled_id === grain.id);
        // Les guillemets de la réponse sont doublés : l'original ne le faisait pas, et une
        // réponse contenant un guillemet décalait toutes les colonnes suivantes.
        const text = grainCopy ? answerText(grainCopy, labels.noAnswer).replace(/"/g, '""') : '';
        csv += `"${text}";`;
      }
    } else {
      csv += questions.map(() => ';').join('');
    }
    csv += EOL;
  }
  return csv;
}

/** Fait télécharger un CSV construit dans le navigateur. */
export function downloadCsv(csv: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
