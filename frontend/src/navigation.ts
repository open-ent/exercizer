/**
 * Repères de la passation : ce qui permet de se retrouver dans un long sujet.
 *
 * Un énoncé (grain de type 3) introduit les questions qui le suivent : c'est le texte qu'elles
 * interrogent (« Questionnaire niveau 2 », un texte à lire, un document…). On en tire des BLOCS
 * — un énoncé et ses questions — qui servent deux fois : le sommaire les replie pour rester court,
 * et chaque question rappelle l'énoncé de son bloc, sans obliger l'élève à revenir en arrière.
 *
 * Sans réseau ni composant (cf. `navigation.test.ts`).
 */

import { GRAIN, isQuestion } from './grains';
import { GrainCopy } from './types';

/** Un énoncé et les questions qui le suivent, jusqu'au prochain énoncé. */
export interface StatementBlock<G> {
  /** `null` pour les questions placées avant tout énoncé. */
  statement: G | null;
  questions: G[];
}

/**
 * Découpe une suite de grains, prise dans l'ordre où l'élève la voit, en blocs. Deux énoncés
 * qui se suivent donnent deux blocs, le premier sans question.
 */
export function statementBlocks<G extends { grain_type_id: number }>(
  grains: G[],
): Array<StatementBlock<G>> {
  const blocks: Array<StatementBlock<G>> = [];
  for (const grain of grains) {
    if (grain.grain_type_id === GRAIN.STATEMENT) {
      blocks.push({ statement: grain, questions: [] });
    } else if (blocks.length === 0) {
      blocks.push({ statement: null, questions: [grain] });
    } else {
      blocks[blocks.length - 1].questions.push(grain);
    }
  }
  return blocks;
}

/**
 * L'énoncé auquel se rapporte une question : celui de son bloc, dans la même partie. Rien pour
 * un énoncé lui-même ni pour une question qui n'en a pas.
 *
 * `first` dit si c'est la première question du bloc : c'est là qu'on montre l'énoncé déplié,
 * l'élève vient de le quitter ou va le découvrir ; plus loin, il reste replié.
 */
export function referenceStatement<G extends { id: number; grain_type_id: number }>(
  grain: G,
  groupGrains: G[],
): { statement: G; first: boolean } | null {
  if (!isQuestion(grain.grain_type_id)) return null;
  for (const block of statementBlocks(groupGrains)) {
    const position = block.questions.findIndex((item) => item.id === grain.id);
    if (position >= 0) {
      return block.statement ? { statement: block.statement, first: position === 0 } : null;
    }
  }
  return null;
}

/** Le grain a-t-il reçu une réponse ? Sert au décompte et à la pastille du sommaire. */
export function hasAnswer(grainCopy: GrainCopy): boolean {
  const data = grainCopy.grain_copy_data.custom_copy_data;
  if (!data) return false;
  switch (grainCopy.grain_type_id) {
    case GRAIN.SIMPLE_ANSWER:
      return !!data.filled_answer && data.filled_answer.trim() !== '' && data.filled_answer !== '<p></p>';
    case GRAIN.OPEN_ANSWER:
      // Une réponse laissée telle que la réponse de départ (schéma à compléter…) n'est pas répondue.
      return (
        !!data.filled_answer &&
        data.filled_answer.trim() !== '' &&
        data.filled_answer !== '<p></p>' &&
        data.filled_answer !== data.starting_answer
      );
    case GRAIN.QCM:
      return (data.filled_answer_list ?? []).some((answer) => answer.isChecked);
    case GRAIN.MULTIPLE_ANSWERS:
      return (data.filled_answer_list ?? []).some((answer) => !!answer.text);
    case GRAIN.ASSOCIATION:
      return (data.filled_answer_list ?? []).some((answer) => !!answer.text_right);
    case GRAIN.ORDER_BY:
      // Une mise en ordre a toujours une réponse : l'ordre initial en est une. On la considère
      // répondue dès que l'élève a touché la copie — faute de mieux, dès qu'elle existe.
      return (data.filled_answer_list ?? []).length > 0;
    default:
      return (data.zones ?? []).some((zone) => !!zone.answer);
  }
}
