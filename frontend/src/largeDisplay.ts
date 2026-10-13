import { automaticCorrection } from './correction';
import { GRAIN } from './grains';
import { GrainCopy, GrainCustomData } from './types';

/**
 * Grand format (sql/043) : la passation pensée pour les jeunes élèves — une question à l'écran,
 * gros caractères, énoncé lu à voix haute et, en entraînement, verdict dès la réponse donnée.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  times: '×',
  divide: '÷',
  minus: '−',
};

/** Le texte brut d'un fragment HTML de l'éditeur, tel qu'une voix doit le lire. */
export function htmlToSpeech(html: string | undefined): string {
  if (!html) return '';
  return (
    html
      // Un bloc ou un saut de ligne marque une pause : sans elle, deux phrases se collent.
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '. ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
        if (code[0] === '#') {
          const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
          return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
        }
        return ENTITIES[code.toLowerCase()] ?? entity;
      })
      .replace(/\s+/g, ' ')
      .replace(/^[\s.]+/, '')
      .trim()
      .replace(PUNCTUATION_THEN_PAUSE, '$1')
  );
}

/** Une pause ajoutée derrière une phrase déjà ponctuée : « ? . » se lit mal. */
const PUNCTUATION_THEN_PAUSE = /([?!.:;])(\s*\.)+/g;

/**
 * Ce que lit le bouton « Écouter » : le titre, l'énoncé, puis les propositions d'un QCM — un
 * enfant qui ne lit pas encore doit pouvoir choisir sans aide.
 */
export function speechText(grainCopy: GrainCopy): string {
  const data = grainCopy.grain_copy_data;
  const statement =
    grainCopy.grain_type_id === GRAIN.STATEMENT ? data.custom_copy_data?.statement : data.statement;
  const parts = [data.title ?? '', htmlToSpeech(statement)];
  if (grainCopy.grain_type_id === GRAIN.QCM) {
    for (const answer of data.custom_copy_data?.filled_answer_list ?? []) {
      if (answer.text) parts.push(htmlToSpeech(answer.text));
    }
  }
  return parts
    .map((part) => part.trim().replace(/[.\s]+$/, ''))
    .filter(Boolean)
    .join('. ')
    .replace(PUNCTUATION_THEN_PAUSE, '$1');
}

export type Verdict = 'correct' | 'partial' | 'wrong';

/** Les types que la correction automatique sait juger : les autres attendent l'enseignant. */
const AUTO_CORRECTED: readonly number[] = [
  GRAIN.SIMPLE_ANSWER,
  GRAIN.MULTIPLE_ANSWERS,
  GRAIN.QCM,
  GRAIN.ASSOCIATION,
  GRAIN.ORDER_BY,
  GRAIN.TEXT_TO_FILL,
  GRAIN.AREA_SELECT,
  GRAIN.AREA_SELECT_IMAGE,
];

export const canCheckInstantly = (grainTypeId: number): boolean => AUTO_CORRECTED.includes(grainTypeId);

/**
 * Le verdict immédiat d'une réponse, à partir du grain DISTRIBUÉ (`reference`, qui porte les
 * réponses attendues). `null` quand la question ne se corrige pas d'elle-même (réponse ouverte,
 * énoncé, SCORM) ou que la référence manque.
 *
 * Une question sans barème est jugée sur ses réponses une à une : un score nul n'y dit rien.
 */
export function instantVerdict(
  grainCopy: GrainCopy,
  reference: GrainCustomData | undefined,
): Verdict | null {
  if (!reference || !canCheckInstantly(grainCopy.grain_type_id)) return null;
  const maxScore = grainCopy.grain_copy_data.max_score ?? 0;
  const correction = automaticCorrection(
    grainCopy.grain_type_id,
    maxScore,
    reference,
    grainCopy.grain_copy_data.custom_copy_data,
  );
  if (maxScore > 0) {
    if (correction.calculated_score >= maxScore) return 'correct';
    return correction.calculated_score > 0 ? 'partial' : 'wrong';
  }
  const judged = Object.values(correction.answers).filter((value) => value !== undefined);
  if (judged.length === 0) return 'wrong';
  if (judged.every(Boolean)) return 'correct';
  return judged.some(Boolean) ? 'partial' : 'wrong';
}
