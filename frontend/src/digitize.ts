/**
 * Numérisation d'un devoir — du texte lu sur les pages à un BROUILLON de sujet, que l'enseignant
 * relit avant que rien ne soit créé.
 *
 * Aucune IA : des règles, comme la numérisation des fiches de mej-twenty. Un devoir imprimé a une
 * typographie très régulière (« Exercice 2 », « 1. », « a) », cases à cocher, pointillés de
 * réponse, « (2 pts) ») ; ce sont ces repères qui découpent le texte, pas une interprétation. Ce
 * qui n'est pas reconnu avec certitude est signalé (`warnings`) plutôt que deviné en silence.
 *
 * Trois temps, séparés pour être vérifiables sans navigateur (cf. `digitize.test.ts`) :
 *  1. `classifyLine` dit ce qu'est chaque ligne (titre de partie, question, proposition…) ;
 *  2. `buildDraft` regroupe les lignes en parties et en questions, et choisit un type par question ;
 *  3. `draftToImport` traduit le brouillon relu en grains pour `POST /subject/import`, avec le
 *     plan des parties à créer ensuite.
 *
 * La lecture des pages (texte du PDF, ou reconnaissance de caractères pour un scan) vient de
 * `@open-ent/react/digitize`, la même que celle de l'éditeur (« Insérer depuis un document »).
 */

import { cleanText, FigureBand, SourceLine } from '@open-ent/react/digitize';

import { GRAIN } from './grains';
import { escapeHtml, fillZoneHtml, ImportedGrain } from './moodleImport';
import { GrainAnswer, GrainData } from './types';

// ── Entrée : les lignes lues ──────────────────────────────────────────────────

// La lecture des pages et ses types viennent de la bibliothèque, partagée avec l'éditeur.
export type { FigureBand, SourceLine } from '@open-ent/react/digitize';

// ── Sortie : le brouillon ─────────────────────────────────────────────────────

/** Les types qu'un brouillon peut proposer — ceux qu'un devoir papier sait porter. */
export const DRAFT_TYPES = [
  GRAIN.STATEMENT,
  GRAIN.SIMPLE_ANSWER,
  GRAIN.OPEN_ANSWER,
  GRAIN.QCM,
  GRAIN.ASSOCIATION,
  GRAIN.ORDER_BY,
  GRAIN.TEXT_TO_FILL,
] as const;

export interface DraftAnswer {
  text: string;
  /** Association : colonne de droite. */
  right?: string;
  /** QCM : case cochée sur le document (un corrigé). */
  checked?: boolean;
}

/** Une zone du devoir, pour en joindre l'image à la question (figure, tableau, schéma). */
export interface DraftRegion {
  page: number;
  y0: number;
  y1: number;
}

/** Pourquoi la relecture s'impose sur une question — clés i18n `exercizer.digitize.warning.*`. */
export type DraftWarning =
  | 'answer'
  | 'checked'
  | 'pairs'
  | 'order'
  | 'figure'
  | 'blanks';

export interface DraftItem {
  /** Stable pour React, pas un identifiant serveur. */
  key: string;
  grainTypeId: number;
  /** « 1 », « 2.b »… tel qu'imprimé, vide pour un énoncé. */
  label: string;
  /** Texte de la question (ou de l'énoncé), un paragraphe par entrée. */
  paragraphs: string[];
  /** QCM, association, mise en ordre. */
  answers: DraftAnswer[];
  /** Réponse attendue d'une réponse simple, réponses des trous d'un texte à trous. */
  expected: string[];
  /** QCM à plusieurs bonnes réponses. */
  multiple: boolean;
  score: number;
  include: boolean;
  /** Joindre l'image de la zone du devoir à l'énoncé de la question. */
  attachExcerpt: boolean;
  region: DraftRegion;
  warnings: DraftWarning[];
}

export interface DraftSection {
  key: string;
  /** Nul : questions posées avant la première partie (ou devoir sans parties). */
  title: string | null;
  items: DraftItem[];
}

export interface Draft {
  /** Titre proposé pour le sujet : la première ligne du devoir. */
  title: string;
  sections: DraftSection[];
  /** Lignes écartées (en-tête « Nom / Prénom / Classe », numéros de page). */
  ignored: string[];
}

// ── 1. Ce qu'est chaque ligne ─────────────────────────────────────────────────

/** Un trou : pointillés ou soulignés d'au moins trois caractères. */
export const BLANK = /_{3,}|\.{4,}|…(?:\s*…)+|(?:\.\s){3,}\./g;

/** Le texte a-t-il un trou ? (`BLANK` est global : son `test` garderait un état d'un appel à l'autre.) */
const hasBlank = (text: string) => new RegExp(BLANK.source).test(text);
const blanksOf = (text: string) => text.match(new RegExp(BLANK.source, 'g')) ?? [];

const SECTION =
  /^(exercice|exo|partie|probl[eè]me|activit[ée]|situation|document)\s*(?:n\s*[°o]\s*)?([0-9]{1,2}|[IVX]{1,4}|[A-H])\b\s*[:.)\-–—]?\s*(.*)$/i;
const NUMBERED = /^(?:question\s*)?(\d{1,2})\s*(?:[).°]|-(?=\s))\s*(\S.*)$/i;
const LETTERED = /^([a-hA-H])\s*[).]\s+(\S.*)$/;
const BOX_EMPTY = /^(?:[□☐❑▢◻○◯◦❍]|\[\s?\]|\(\s?\))\s*(\S.*)$/;
const BOX_CHECKED = /^(?:[☑☒■●◉✓✔✗✘]|\[[xX✓]\]|\([xX]\))\s*(\S.*)$/;
const BULLET = /^[•▪‣◆►\-–—*]\s+(\S.*)$/;
const ANSWER_LINE = /^(?:(?:r[ée]ponse|r[ée]sultat|calcul)s?\s*:?\s*)?(?:[_.…\s]|(?:\.\s))*$/i;
const PAGE_NUMBER = /^(?:page\s*)?\d{1,3}\s*(?:\/|sur)\s*\d{1,3}$|^[-–]?\s*\d{1,3}\s*[-–]?$|^page\s*\d{1,3}$/i;
const HEADER_FIELD = /^(?:nom|pr[ée]nom|classe|date|note|appr[ée]ciation|signature)\s*[:.]/i;

/** Barème imprimé : « (2 pts) », « 1,5 point », « /3 ». */
const POINTS = /\(?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:pts?|points?)\s*\)?\.?|\/\s*(\d{1,2}(?:[.,]\d)?)\s*$/i;

export type LineKind =
  | { kind: 'noise' }
  | { kind: 'answerLine' }
  | { kind: 'section'; title: string }
  | { kind: 'question'; label: string; text: string }
  | { kind: 'item'; marker: 'letter' | 'upper' | 'box' | 'bullet'; label: string; text: string; checked: boolean }
  | { kind: 'text'; text: string };

export function classifyLine(raw: string): LineKind {
  const text = cleanText(raw);
  if (!text) return { kind: 'noise' };
  if (PAGE_NUMBER.test(text)) return { kind: 'noise' };
  if (HEADER_FIELD.test(text)) return { kind: 'noise' };
  // Une ligne de réponse (« ........ », « Réponse : ______ ») : de la place pour écrire, pas du texte.
  if (ANSWER_LINE.test(text) && /[_.…]{3,}/.test(text)) return { kind: 'answerLine' };

  const section = SECTION.exec(text);
  // « Partie A : … » — mais pas « Document 1 montre que… » au fil d'une phrase : on n'accepte un
  // titre que court, ou suivi d'un séparateur.
  if (section && (text.length <= 70 || /[:.)\-–—]/.test(text.slice(section[1].length, section[1].length + 8)))) {
    return { kind: 'section', title: text };
  }

  const checked = BOX_CHECKED.exec(text);
  if (checked) return { kind: 'item', marker: 'box', label: '', text: checked[1], checked: true };
  const box = BOX_EMPTY.exec(text);
  if (box) return { kind: 'item', marker: 'box', label: '', text: box[1], checked: false };

  const numbered = NUMBERED.exec(text);
  // « 2.5 + 3 = » n'est pas la question 2 : le texte d'une question commence par une lettre.
  if (numbered && /^[\p{L}«"'(]/u.test(numbered[2])) {
    return { kind: 'question', label: numbered[1], text: numbered[2] };
  }

  const lettered = LETTERED.exec(text);
  if (lettered) {
    const upper = lettered[1] === lettered[1].toUpperCase();
    return {
      kind: 'item',
      marker: upper ? 'upper' : 'letter',
      label: lettered[1].toLowerCase(),
      text: lettered[2],
      checked: false,
    };
  }

  const bullet = BULLET.exec(text);
  if (bullet) return { kind: 'item', marker: 'bullet', label: '', text: bullet[1], checked: false };

  return { kind: 'text', text };
}

/**
 * Plusieurs propositions sur une même ligne — « a) 12   b) 15   c) 18 », « ☐ Vrai ☐ Faux ».
 * Rend les propositions, ou `null` s'il n'y en a pas au moins deux.
 */
export function splitInlineChoices(text: string): Array<{ text: string; checked: boolean }> | null {
  const boxes = text.split(/\s*(?=[□☐❑▢◻☑☒■]|\[[\sxX]?\])/).map((part) => part.trim()).filter(Boolean);
  if (boxes.length >= 2 && boxes.every((part) => /^(?:[□☐❑▢◻☑☒■]|\[[\sxX]?\])/.test(part))) {
    return boxes.map((part) => ({
      text: cleanText(part.replace(/^(?:[□☐❑▢◻☑☒■]|\[[\sxX]?\])/, '')),
      checked: /^(?:[☑☒■]|\[[xX]\])/.test(part),
    }));
  }
  const letters = text.split(/\s+(?=[a-dA-D]\s*[).]\s)/);
  if (letters.length >= 2 && letters.every((part) => /^[a-dA-D]\s*[).]\s/.test(part))) {
    return letters.map((part) => ({ text: cleanText(part.replace(/^[a-dA-D]\s*[).]\s*/, '')), checked: false }));
  }
  return null;
}

/** Retire le barème d'un texte et le rend à part. */
export function extractPoints(text: string): { text: string; points: number | null } {
  const match = POINTS.exec(text);
  if (!match) return { text, points: null };
  const value = Number((match[1] ?? match[2]).replace(',', '.'));
  return { text: cleanText(text.replace(match[0], ' ')), points: Number.isFinite(value) ? value : null };
}

// ── 2. Des lignes au brouillon ────────────────────────────────────────────────

const CHOICE_WORDS = /\b(coche[rz]?|cochez|entoure[rz]?|entourez|choisi[st]?|choisissez|la bonne r[ée]ponse|les bonnes r[ée]ponses|qcm|souligne[rz]?|soulignez)\b/i;
const MULTIPLE_WORDS = /plusieurs (?:bonnes )?r[ée]ponses|toutes les bonnes r[ée]ponses|une ou plusieurs/i;
const TRUE_FALSE = /\bvrai\s+ou\s+faux\b/i;
const MATCHING_WORDS = /\b(relie[rz]?|reliez|associe[rz]?|associez|fais correspondre|faites correspondre|appari)/i;
const ORDER_WORDS = /\b(remets?|remettez|range[rz]?|rangez|classe[rz]?|classez|ordonne[rz]?|ordonnez)\b.*\b(ordre|croissant|d[ée]croissant|chronologique|alphab[ée]tique)/i;
const OPEN_WORDS = /\b(expliqu|justifi|r[ée]dig|d[ée]cri[st]|d[ée]crivez|pourquoi|comment[ea]|argument|d[ée]velopp|racont|imagin|compar|analys|interpr[èée]t|r[ée]sum)/i;
const SHORT_WORDS = /\b(calcule[rz]?|calculez|combien|quel(?:le)?s?|donne[rz]?|donnez|indique[rz]?|indiquez|convertis|convertissez|r[ée]sous|r[ée]solvez|trouve[rz]?|trouvez|cite[rz]?|citez|nomme[rz]?|nommez)\b/i;
/** Une consigne sans numéro, en tête de ligne : fréquente dans les fiches du premier degré. */
const INSTRUCTION_START = /^(calcule|compl[èe]te|entoure|coche|relie|[ée]cris|range|souligne|r[ée]ponds|associe|remets|colorie|trouve|indique|explique|justifie|donne|cite|classe|conjugue|transforme|recopie|lis)\b/i;

/** Une ligne qui ouvre une question : consigne à l'impératif en tête, ou interrogation. */
function startsQuestion(text: string): boolean {
  return (INSTRUCTION_START.test(text) && /^\p{Lu}/u.test(text)) || /\?\s*(?:\(.*\))?$/.test(text);
}

interface ItemLine {
  marker: 'letter' | 'upper' | 'box' | 'bullet';
  label: string;
  text: string;
  checked: boolean;
  segments: string[];
  y0: number;
  y1: number;
  page: number;
}

/** Une question telle qu'imprimée : son texte, ses propositions, la place laissée pour répondre. */
interface QuestionBlock {
  kind: 'question';
  label: string;
  prompt: string[];
  items: ItemLine[];
  answerLines: number;
  points: number | null;
  lines: SourceLine[];
}

interface TextBlock {
  kind: 'text';
  paragraphs: string[];
  lines: SourceLine[];
}

type Block = QuestionBlock | TextBlock | { kind: 'section'; title: string };

let keySeed = 0;
const nextKey = (prefix: string) => `${prefix}-${(keySeed += 1)}`;

/** Ajoute une ligne à des paragraphes : une phrase qui se poursuit reste dans le même. */
function appendParagraph(paragraphs: string[], text: string) {
  const last = paragraphs[paragraphs.length - 1];
  if (last !== undefined && /\p{L}-$/u.test(last) && /^\p{Ll}/u.test(text)) {
    // Mot coupé en fin de ligne.
    paragraphs[paragraphs.length - 1] = last.slice(0, -1) + text;
  } else if (last !== undefined && !/[.:!?»]$/.test(last) && !/^[A-ZÀ-Ý«"]/.test(text)) {
    paragraphs[paragraphs.length - 1] = `${last} ${text}`;
  } else {
    paragraphs.push(text);
  }
}

function toBlocks(lines: SourceLine[], ignored: string[]): { title: string; blocks: Block[] } {
  const blocks: Block[] = [];
  let title = '';
  let current: QuestionBlock | TextBlock | null = null;

  const close = () => {
    if (current) blocks.push(current);
    current = null;
  };
  const startText = (line: SourceLine, text: string) => {
    close();
    current = { kind: 'text', paragraphs: [text], lines: [line] };
  };
  const startQuestion = (line: SourceLine, label: string, text: string) => {
    close();
    const { text: prompt, points } = extractPoints(text);
    current = { kind: 'question', label, prompt: [prompt], items: [], answerLines: 0, points, lines: [line] };
  };

  for (const line of lines) {
    const kind = classifyLine(line.text);
    const block = current as QuestionBlock | TextBlock | null;

    switch (kind.kind) {
      case 'noise':
        if (cleanText(line.text)) ignored.push(cleanText(line.text));
        break;
      case 'answerLine':
        if (block?.kind === 'question') {
          block.answerLines += 1;
          block.lines.push(line);
        }
        break;
      case 'section':
        close();
        blocks.push({ kind: 'section', title: extractPoints(kind.title).text });
        break;
      case 'question':
        startQuestion(line, kind.label, kind.text);
        break;
      case 'item': {
        const item: ItemLine = { ...kind, segments: line.segments, y0: line.y0, y1: line.y1, page: line.page };
        if (block?.kind === 'question') {
          block.items.push(item);
          block.lines.push(line);
        } else {
          // Une proposition hors de toute question : la ligne de texte qui précède était la
          // consigne (une question sans numéro).
          const previous = block?.kind === 'text' ? block : null;
          const prompt = previous?.paragraphs.pop();
          if (previous && prompt !== undefined) {
            const promptLine = previous.lines.pop() as SourceLine;
            if (!previous.paragraphs.length) current = null;
            startQuestion(promptLine, '', prompt);
            (current as unknown as QuestionBlock).items.push(item);
            (current as unknown as QuestionBlock).lines.push(line);
          } else {
            startText(line, kind.text);
          }
        }
        break;
      }
      case 'text': {
        if (!title && !blocks.length && !block && kind.text.length <= 100 && !/\?$/.test(kind.text)) {
          title = extractPoints(kind.text).text;
          break;
        }
        const inline = splitInlineChoices(kind.text);
        if (block?.kind === 'question' && inline) {
          for (const choice of inline) {
            block.items.push({ marker: 'box', label: '', text: choice.text, checked: choice.checked, segments: [choice.text], y0: line.y0, y1: line.y1, page: line.page });
          }
          block.lines.push(line);
        } else if (block?.kind === 'question' && line.segments.length >= 2) {
          // Deux colonnes sur la ligne : une rangée d'un « relie » ou d'un tableau de choix.
          block.items.push({ marker: 'bullet', label: '', text: kind.text, checked: false, segments: line.segments, y0: line.y0, y1: line.y1, page: line.page });
          block.lines.push(line);
        } else if (
          block?.kind === 'question' &&
          startsQuestion(kind.text) &&
          (block.items.length > 0 || block.answerLines > 0 || /[.?!]$/.test(block.prompt[block.prompt.length - 1] ?? ''))
        ) {
          // La question précédente est complète : celle-ci est la suivante, sans numéro.
          startQuestion(line, '', kind.text);
        } else if (block?.kind === 'question') {
          const last = block.items[block.items.length - 1];
          if (last) last.text = `${last.text} ${kind.text}`;
          else appendParagraph(block.prompt, extractPoints(kind.text).text);
          block.lines.push(line);
        } else if (startsQuestion(kind.text) || hasBlank(kind.text)) {
          startQuestion(line, '', kind.text);
        } else if (block?.kind === 'text') {
          appendParagraph(block.paragraphs, kind.text);
          block.lines.push(line);
        } else {
          startText(line, kind.text);
        }
        break;
      }
    }
  }
  close();
  return { title, blocks };
}

function regionOf(lines: Array<{ page: number; y0: number; y1: number }>): DraftRegion {
  const page = lines[0]?.page ?? 1;
  const same = lines.filter((line) => line.page === page);
  return {
    page,
    y0: Math.min(...same.map((line) => line.y0)),
    y1: Math.max(...same.map((line) => line.y1)),
  };
}

function newItem(grainTypeId: number, label: string, paragraphs: string[], lines: SourceLine[]): DraftItem {
  return {
    key: nextKey('item'),
    grainTypeId,
    label,
    paragraphs,
    answers: [],
    expected: [],
    multiple: false,
    score: grainTypeId === GRAIN.STATEMENT ? 0 : 1,
    include: true,
    attachExcerpt: false,
    region: regionOf(lines),
    warnings: [],
  };
}

/** Deux colonnes d'un « relie » : les morceaux d'une ligne, ou ses deux moitiés autour de « • ». */
function pairOf(item: ItemLine): DraftAnswer | null {
  const parts = item.segments.length >= 2 ? item.segments : item.text.split(/\s*[•·]\s*|\s{3,}/);
  const cleaned = parts.map(cleanText).map((part) => part.replace(/^[•·\-–]\s*|\s*[•·]$/g, '')).filter(Boolean);
  if (cleaned.length < 2) return null;
  return { text: cleaned[0], right: cleaned[cleaned.length - 1] };
}

/** Termes d'une mise en ordre écrits sur la ligne même : « Range : 12 ; 5 ; 8 ; 21 ». */
function inlineTerms(prompt: string): string[] {
  const after = prompt.split(':').slice(1).join(':');
  const terms = after.split(/\s*[;,–]\s*|\s{2,}/).map(cleanText).filter(Boolean);
  return terms.length >= 3 ? terms : [];
}

/** Les propositions sont-elles des sous-questions (« a) Calcule… ») plutôt que des choix ? */
function itemsAreSubQuestions(block: QuestionBlock, prompt: string): boolean {
  if (block.items.some((item) => item.marker === 'box')) return false;
  if (CHOICE_WORDS.test(prompt) || TRUE_FALSE.test(prompt)) return false;
  if (block.items.every((item) => item.marker === 'bullet')) return false;
  return block.items.some(
    (item) =>
      item.text.length > 60 ||
      /\?\s*$/.test(item.text) ||
      hasBlank(item.text) ||
      INSTRUCTION_START.test(item.text) ||
      OPEN_WORDS.test(item.text) ||
      SHORT_WORDS.test(item.text),
  );
}

/** Le type d'une question sans propositions : selon ses trous, sa consigne, la place laissée. */
function openOrShort(block: QuestionBlock, prompt: string, lines: SourceLine[], label: string): DraftItem {
  const blanks = blanksOf(prompt);
  // Des trous AU MILIEU du texte : un texte à trous. Un seul, en bout de ligne, c'est la place
  // de la réponse d'une question courte.
  const inner = blanks.length >= 2 || (blanks.length === 1 && !new RegExp(`(?:${BLANK.source})\\s*[.!?]?$`).test(prompt));
  if (inner) {
    const item = newItem(GRAIN.TEXT_TO_FILL, label, [prompt], lines);
    item.expected = blanks.map(() => '');
    item.score = blanks.length;
    item.warnings.push('blanks');
    return item;
  }
  const text = cleanText(prompt.replace(BLANK, ' '));
  const open = OPEN_WORDS.test(text) || block.answerLines >= 3;
  const item = newItem(open ? GRAIN.OPEN_ANSWER : GRAIN.SIMPLE_ANSWER, label, [text], lines);
  if (!open) {
    item.expected = [''];
    item.warnings.push('answer');
  }
  return item;
}

/** Une question imprimée → un ou plusieurs éléments du brouillon. */
function questionItems(block: QuestionBlock): DraftItem[] {
  const prompt = block.prompt.join(' ');
  const lines = block.lines;
  const label = block.label;
  let items: DraftItem[];

  if (!block.items.length) {
    const terms = ORDER_WORDS.test(prompt) ? inlineTerms(prompt) : [];
    if (terms.length) {
      const item = newItem(GRAIN.ORDER_BY, label, [prompt.split(':')[0] + ' :'], lines);
      item.answers = terms.map((text) => ({ text }));
      item.warnings.push('order');
      items = [item];
    } else {
      items = [openOrShort(block, prompt, lines, label)];
    }
  } else if (MATCHING_WORDS.test(prompt)) {
    const item = newItem(GRAIN.ASSOCIATION, label, block.prompt, lines);
    item.answers = block.items.map(pairOf).filter((pair): pair is DraftAnswer => !!pair);
    if (!item.answers.length) item.answers = block.items.map((line) => ({ text: line.text, right: '' }));
    item.score = item.answers.length;
    item.warnings.push('pairs');
    items = [item];
  } else if (ORDER_WORDS.test(prompt)) {
    const item = newItem(GRAIN.ORDER_BY, label, block.prompt, lines);
    item.answers = block.items.map((line) => ({ text: line.text }));
    item.warnings.push('order');
    items = [item];
  } else if (TRUE_FALSE.test(prompt) && !block.items.some((line) => /^(vrai|faux)$/i.test(line.text))) {
    // « Vrai ou faux ? » suivi d'affirmations : une question Vrai/Faux par affirmation, précédée
    // de la consigne.
    const intro = newItem(GRAIN.STATEMENT, '', block.prompt, lines.slice(0, 1));
    items = [
      intro,
      ...block.items.map((line, index) => {
        const item = newItem(GRAIN.QCM, label ? `${label}.${index + 1}` : '', [line.text], [line]);
        item.answers = [{ text: 'Vrai' }, { text: 'Faux' }];
        item.warnings.push('checked');
        return item;
      }),
    ];
  } else if (itemsAreSubQuestions(block, prompt)) {
    // « 1. … a) … b) … » : la question devient un énoncé, chaque lettre une question.
    const intro = newItem(GRAIN.STATEMENT, '', block.prompt, lines.slice(0, 1));
    const subs = block.items.map((line) => {
      const sub: QuestionBlock = { kind: 'question', label: '', prompt: [line.text], items: [], answerLines: 0, points: null, lines: [line as unknown as SourceLine] };
      const subLabel = label ? `${label}.${line.label}` : line.label;
      const { text } = extractPoints(line.text);
      return openOrShort(sub, text, [line as unknown as SourceLine], subLabel);
    });
    items = [intro, ...subs];
  } else {
    const item = newItem(GRAIN.QCM, label, block.prompt, lines);
    item.answers = block.items.map((line) => ({ text: extractPoints(line.text).text, checked: line.checked }));
    item.multiple = MULTIPLE_WORDS.test(prompt) || block.items.filter((line) => line.checked).length > 1;
    if (!block.items.some((line) => line.checked)) item.warnings.push('checked');
    items = [item];
  }

  const main = items.find((item) => item.grainTypeId !== GRAIN.STATEMENT);
  if (main && block.points !== null) {
    // Le barème imprimé vaut pour la question entière : réparti entre les sous-questions.
    const questions = items.filter((item) => item.grainTypeId !== GRAIN.STATEMENT);
    const share = Math.round((block.points / questions.length) * 100) / 100;
    for (const question of questions) question.score = share;
  }
  return items;
}

/**
 * Rattache chaque figure à l'élément imprimé juste au-dessus d'elle — la consigne qui la présente,
 * le plus souvent — et propose d'en joindre l'image.
 */
export function attachFigures(sections: DraftSection[], figures: FigureBand[]) {
  const items = sections.flatMap((section) => section.items);
  for (const figure of figures) {
    let owner: DraftItem | null = null;
    for (const item of items) {
      if (item.region.page !== figure.page || item.region.y0 > figure.y0) continue;
      if (!owner || item.region.y0 >= owner.region.y0) owner = item;
    }
    if (!owner) continue;
    owner.region = { ...owner.region, y1: Math.max(owner.region.y1, figure.y1) };
    owner.attachExcerpt = true;
    if (!owner.warnings.includes('figure')) owner.warnings.push('figure');
  }
}

/** Regroupe les lignes lues en parties et en questions, et y rattache les figures. */
export function buildDraft(lines: SourceLine[], figures: FigureBand[] = []): Draft {
  const ignored: string[] = [];
  const { title, blocks } = toBlocks(lines, ignored);
  const sections: DraftSection[] = [{ key: nextKey('section'), title: null, items: [] }];

  for (const block of blocks) {
    const section = sections[sections.length - 1];
    if (block.kind === 'section') {
      sections.push({ key: nextKey('section'), title: block.title, items: [] });
    } else if (block.kind === 'text') {
      section.items.push(newItem(GRAIN.STATEMENT, '', block.paragraphs, block.lines));
    } else {
      section.items.push(...questionItems(block));
    }
  }

  const kept = sections.filter((section, index) => index > 0 || section.items.length > 0);
  attachFigures(kept, figures);
  return { title, sections: kept, ignored };
}

// ── 3. Du brouillon relu au sujet ─────────────────────────────────────────────

/** Les paragraphes d'un élément, en HTML — et l'extrait joint, s'il y en a un. */
function paragraphsHtml(paragraphs: string[], excerpt?: string): string {
  const html = paragraphs
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  return excerpt ? `${html}<p><img src="${escapeHtml(excerpt)}" alt="" /></p>` : html;
}

/** Le texte d'un texte à trous, chaque trou remplacé par une zone. */
export function clozeHtml(paragraphs: string[], expected: string[]): { html: string; count: number } {
  let id = 0;
  const html = paragraphs
    .map((paragraph) => {
      const parts = paragraph.split(BLANK);
      return `<p>${parts
        .map((part, index) => (index === 0 ? escapeHtml(part) : fillZoneHtml(id, expected[id++] ?? '') + escapeHtml(part)))
        .join('')}</p>`;
    })
    .join('');
  return { html, count: id };
}

function questionTitle(item: DraftItem, index: number, questionWord: string): string {
  return `${questionWord} ${item.label || index}`;
}

/** Un élément du brouillon → le `grain_data` du grain. */
export function itemGrainData(item: DraftItem, title: string, excerpt?: string): GrainData {
  const score = Math.max(0, item.score);
  switch (item.grainTypeId) {
    case GRAIN.STATEMENT:
      return { title: '', max_score: 0, custom_data: { statement: paragraphsHtml(item.paragraphs, excerpt) } };
    case GRAIN.SIMPLE_ANSWER:
      return { title, max_score: score, statement: paragraphsHtml(item.paragraphs, excerpt), custom_data: { correct_answer: item.expected[0] ?? '' } };
    case GRAIN.OPEN_ANSWER:
      return { title, max_score: score, statement: paragraphsHtml(item.paragraphs, excerpt), custom_data: {} };
    case GRAIN.QCM: {
      const answers: GrainAnswer[] = item.answers
        .filter((answer) => answer.text.trim())
        .map((answer) => ({ text: answer.text.trim(), isChecked: !!answer.checked }));
      return {
        title,
        max_score: score,
        statement: paragraphsHtml(item.paragraphs, excerpt),
        custom_data: { correct_answer_list: answers, no_error_allowed: false, multipleAnswers: item.multiple },
      };
    }
    case GRAIN.ASSOCIATION:
      return {
        title,
        max_score: score,
        statement: paragraphsHtml(item.paragraphs, excerpt),
        custom_data: {
          show_left_column: true,
          no_error_allowed: false,
          correct_answer_list: item.answers
            .filter((answer) => answer.text.trim() || answer.right?.trim())
            .map((answer) => ({ text_left: answer.text.trim(), text_right: (answer.right ?? '').trim() })),
        },
      };
    case GRAIN.ORDER_BY:
      return {
        title,
        max_score: score,
        statement: paragraphsHtml(item.paragraphs, excerpt),
        custom_data: {
          no_error_allowed: false,
          correct_answer_list: item.answers
            .filter((answer) => answer.text.trim())
            .map((answer, index) => ({ text: answer.text.trim(), order_by: index + 1 })),
        },
      };
    case GRAIN.TEXT_TO_FILL: {
      const { html, count } = clozeHtml(item.paragraphs, item.expected);
      return {
        title,
        max_score: score,
        statement: excerpt ? paragraphsHtml([], excerpt) : '',
        custom_data: {
          options: [],
          zones: Array.from({ length: count }, (_, id) => ({ answer: item.expected[id] ?? '', options: [], id })),
          answersType: 'text',
          htmlContent: html,
        },
      };
    }
    default:
      return { title, max_score: score, statement: paragraphsHtml(item.paragraphs, excerpt), custom_data: {} };
  }
}

/** Ce que l'import crée, et les parties à poser ensuite sur les grains créés. */
export interface DraftImport {
  grains: ImportedGrain[];
  /** Les parties, avec les rangs (`order_by`) de leurs grains. Vide : sujet sans parties. */
  sections: Array<{ title: string; orders: number[] }>;
}

/**
 * Le brouillon relu → grains et parties. `excerpts` donne, par clé d'élément, le lien de l'image
 * déjà déposée dans l'espace documentaire. `questionWord` : « Question » dans la langue de l'usager.
 */
export function draftToImport(
  draft: Draft,
  excerpts: Record<string, string>,
  questionWord: string,
): DraftImport {
  const grains: ImportedGrain[] = [];
  const sections: DraftImport['sections'] = [];
  let questionIndex = 0;

  for (const section of draft.sections) {
    const orders: number[] = [];
    for (const item of section.items) {
      if (!item.include) continue;
      const isQuestion = item.grainTypeId !== GRAIN.STATEMENT;
      if (isQuestion) questionIndex += 1;
      const order = grains.length + 1;
      grains.push({
        grain_type_id: item.grainTypeId,
        order_by: order,
        grain_data: itemGrainData(
          item,
          isQuestion ? questionTitle(item, questionIndex, questionWord) : '',
          excerpts[item.key],
        ),
      });
      orders.push(order);
    }
    if (section.title !== null && orders.length) sections.push({ title: section.title, orders });
  }
  return { grains, sections };
}

/** Change le type d'un élément en gardant ce qui peut l'être. */
export function retypeItem(item: DraftItem, grainTypeId: number): DraftItem {
  const next: DraftItem = { ...item, grainTypeId };
  if (grainTypeId === GRAIN.STATEMENT) next.score = 0;
  else if (item.grainTypeId === GRAIN.STATEMENT) next.score = 1;
  if (grainTypeId === GRAIN.SIMPLE_ANSWER && !next.expected.length) next.expected = [''];
  if (grainTypeId === GRAIN.TEXT_TO_FILL) {
    const count = blanksOf(item.paragraphs.join(' ')).length;
    next.expected = Array.from({ length: count }, (_, index) => item.expected[index] ?? '');
  }
  if ([GRAIN.QCM, GRAIN.ORDER_BY, GRAIN.ASSOCIATION].includes(grainTypeId as 7 | 8 | 9) && next.answers.length < 2) {
    next.answers = [...next.answers, { text: '' }, { text: '' }].slice(0, Math.max(2, next.answers.length));
  }
  return next;
}

/**
 * Ce qui empêchera de distribuer le sujet tel quel — le même contrôle que le serveur
 * (`scheduleBlocker`), dit AVANT la création pour qu'on corrige dans le brouillon.
 */
export function missingAnswer(item: DraftItem): boolean {
  if (!item.include) return false;
  switch (item.grainTypeId) {
    case GRAIN.SIMPLE_ANSWER:
      return !item.expected[0]?.trim();
    case GRAIN.QCM:
      return !item.answers.some((answer) => answer.checked && answer.text.trim());
    case GRAIN.ASSOCIATION:
      return !item.answers.some((answer) => answer.text.trim() && answer.right?.trim());
    case GRAIN.ORDER_BY:
      return item.answers.filter((answer) => answer.text.trim()).length < 2;
    case GRAIN.TEXT_TO_FILL:
      return !item.expected.length || item.expected.some((answer) => !answer.trim());
    default:
      return false;
  }
}
