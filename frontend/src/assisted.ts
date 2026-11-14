/**
 * « Création assistée » — du devoir lu dans le navigateur à un BROUILLON de sujet, par l'IA.
 *
 * La lecture des pages est celle de « Numériser un devoir » (`@open-ent/react/digitize`) ; seul le
 * découpage change : au lieu des règles de `digitize.ts`, le modèle configuré par la plateforme
 * (route `/dashboard/api/ai/exercizer-generate`) reconnaît les parties, les questions, leur type
 * et leurs réponses. Le brouillon obtenu a la forme de celui de la numérisation : l'enseignant le
 * relit dans le même écran, et rien n'est créé avant qu'il valide.
 *
 * Le texte est envoyé en lignes NUMÉROTÉES et le modèle répond, pour chaque élément, par les
 * lignes d'où il vient : la zone de la page s'en déduit (aperçu, figure à joindre) sans croire le
 * modèle sur des coordonnées.
 */

import type { FigureBand, SourceLine } from '@open-ent/react/digitize';

import { attachFigures, BLANK, Draft, DraftItem, DraftSection, DraftWarning } from './digitize';
import { GRAIN } from './grains';

// ── Ce qu'échange la route du dashboard ───────────────────────────────────────

export interface AssistedLine {
  n: number;
  page: number;
  text: string;
}

export interface AssistedAnswer {
  text: string;
  right?: string;
  correct?: boolean;
}

export interface AssistedItem {
  type: 'statement' | 'simple' | 'open' | 'qcm' | 'association' | 'order' | 'cloze';
  label: string;
  /** Première et dernière ligne (numérotées à partir de 1) d'où vient l'élément. */
  lines: [number, number] | null;
  text: string[];
  answers: AssistedAnswer[];
  expected: string[];
  multiple: boolean;
  points: number;
  /** Réponses proposées par le modèle, et non lues dans un corrigé du document. */
  proposed: boolean;
}

export interface AssistedResponse {
  title: string;
  sections: Array<{ title: string | null; items: AssistedItem[] }>;
  ignored: number[];
  model?: string;
  vision?: boolean;
}

const TYPE_IDS: Record<AssistedItem['type'], number> = {
  statement: GRAIN.STATEMENT,
  simple: GRAIN.SIMPLE_ANSWER,
  open: GRAIN.OPEN_ANSWER,
  qcm: GRAIN.QCM,
  association: GRAIN.ASSOCIATION,
  order: GRAIN.ORDER_BY,
  cloze: GRAIN.TEXT_TO_FILL,
};

/** Les lignes lues, numérotées comme le modèle les verra (vides écartées). */
export function numberLines(lines: SourceLine[]): { sent: AssistedLine[]; source: SourceLine[] } {
  const source = lines.filter((line) => line.text.trim());
  return { sent: source.map((line, index) => ({ n: index + 1, page: line.page, text: line.text.trim() })), source };
}

let keySeed = 0;
const nextKey = (prefix: string) => `ai-${prefix}-${(keySeed += 1)}`;

/** La zone de la page couverte par des lignes : la première page touchée, de haut en bas. */
function regionOf(source: SourceLine[], span: [number, number] | null): DraftItem['region'] {
  const picked = span ? source.slice(span[0] - 1, span[1]) : [];
  if (!picked.length) return { page: source[0]?.page ?? 1, y0: 0, y1: 0 };
  const page = picked[0].page;
  const same = picked.filter((line) => line.page === page);
  return { page, y0: Math.min(...same.map((line) => line.y0)), y1: Math.max(...same.map((line) => line.y1)) };
}

/** Un élément rendu par le modèle → un élément du brouillon, et ce qu'il reste à vérifier. */
export function assistedItem(item: AssistedItem, source: SourceLine[]): DraftItem {
  const grainTypeId = TYPE_IDS[item.type] ?? GRAIN.OPEN_ANSWER;
  const warnings: DraftWarning[] = [];
  let paragraphs = item.text;
  let expected = item.expected;
  let answers = item.answers.map((answer) => ({ text: answer.text, right: answer.right, checked: !!answer.correct }));

  switch (grainTypeId) {
    case GRAIN.QCM:
      if (!answers.some((answer) => answer.checked)) warnings.push('checked');
      break;
    case GRAIN.SIMPLE_ANSWER:
      expected = expected.slice(0, 1);
      if (!expected[0]) warnings.push('answer');
      break;
    case GRAIN.TEXT_TO_FILL: {
      // Autant de réponses que de trous, ni plus ni moins : sinon, les trous sont à reprendre.
      const blanks = paragraphs.reduce((count, paragraph) => count + (paragraph.match(BLANK)?.length ?? 0), 0);
      if (!blanks) {
        paragraphs = [...paragraphs, '___'];
      }
      const count = Math.max(blanks, 1);
      if (expected.length !== count || expected.some((answer) => !answer)) warnings.push('blanks');
      expected = Array.from({ length: count }, (_, index) => expected[index] ?? '');
      break;
    }
    case GRAIN.ASSOCIATION:
      answers = answers.map((answer) => ({ ...answer, right: answer.right ?? '' }));
      if (!answers.some((answer) => answer.text && answer.right)) warnings.push('pairs');
      break;
    case GRAIN.ORDER_BY:
      if (answers.length < 2) warnings.push('order');
      break;
    default:
      break;
  }
  if (item.proposed && grainTypeId !== GRAIN.STATEMENT && grainTypeId !== GRAIN.OPEN_ANSWER) {
    warnings.unshift('proposed');
  }

  return {
    key: nextKey('item'),
    grainTypeId,
    label: item.label,
    paragraphs,
    answers: grainTypeId === GRAIN.QCM || grainTypeId === GRAIN.ASSOCIATION || grainTypeId === GRAIN.ORDER_BY ? answers : [],
    expected: grainTypeId === GRAIN.SIMPLE_ANSWER || grainTypeId === GRAIN.TEXT_TO_FILL ? expected : [],
    multiple: grainTypeId === GRAIN.QCM && (item.multiple || answers.filter((answer) => answer.checked).length > 1),
    score: grainTypeId === GRAIN.STATEMENT ? 0 : item.points,
    include: true,
    attachExcerpt: false,
    region: regionOf(source, item.lines),
    warnings,
  };
}

/** La réponse du modèle → le brouillon de l'écran de relecture, figures rattachées. */
export function assistedDraft(response: AssistedResponse, source: SourceLine[], figures: FigureBand[] = []): Draft {
  const sections: DraftSection[] = response.sections
    .map((section) => ({
      key: nextKey('section'),
      title: section.title,
      items: section.items.map((item) => assistedItem(item, source)),
    }))
    .filter((section) => section.items.length > 0);
  attachFigures(sections, figures);
  const ignored = response.ignored.map((n) => source[n - 1]?.text.trim()).filter((text): text is string => !!text);
  return { title: response.title, sections, ignored };
}

/** Image d'une page pour un modèle qui lit les images : JPEG, 1600 px de large au plus. */
export function pageImage(canvas: HTMLCanvasElement, maxWidth = 1600): string {
  const scale = Math.min(1, maxWidth / canvas.width);
  if (scale === 1) return canvas.toDataURL('image/jpeg', 0.8);
  const copy = document.createElement('canvas');
  copy.width = Math.round(canvas.width * scale);
  copy.height = Math.round(canvas.height * scale);
  copy.getContext('2d')?.drawImage(canvas, 0, 0, copy.width, copy.height);
  return copy.toDataURL('image/jpeg', 0.8);
}
