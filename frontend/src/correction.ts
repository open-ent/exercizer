/**
 * Correction automatique d'une copie — portage des services `QcmService`, `SimpleAnswerService`,
 * `MultipleAnswerService`, `AssociationService`, `OrderService` et du modèle commun des grains
 * « à zones » de l'IHM AngularJS.
 *
 * ⚠ Ce code décide de NOTES. Il est porté à la lettre, y compris ses bizarreries : le résultat
 * d'une copie ne doit pas dépendre de l'interface avec laquelle on la relit. Les écarts repérés
 * au passage sont signalés en commentaire, pas corrigés.
 *
 * ⚠ Le barème automatique est calculé **par le client**, à la consultation, et renvoyé au serveur
 * s'il était absent (`calculated_score`). Ce n'est pas un choix de ce portage : c'est ainsi que
 * fonctionne le module.
 */

import { GRAIN, sanitizeScore } from './grains';
import { latinise } from './latinise';
import { GrainAnswer, GrainCustomCopyData, GrainCustomData, GrainZone } from './types';

/**
 * Deux réponses sont-elles la même ? Casse, espaces, caractères de largeur nulle et caractères
 * latins étendus sont ignorés — `CompareStringHelper.compare`.
 *
 * ⚠ Une chaîne VIDE (ou absente) ne vaut jamais une autre, pas même une autre chaîne vide : c'est
 * le `string1 && string2` de l'original. Une question sans réponse attendue est donc toujours
 * comptée fausse.
 */
export function compareAnswers(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const normalise = (value: string) =>
    latinise(value)
      .replace(/[​‌\s]/g, '')
      .toLowerCase();
  return normalise(a) === normalise(b);
}

/** Un score affichable : deux décimales au plus, 0 à défaut — `ScoreHelper.format`. */
export function formatScore(score: number | null | undefined): number {
  if (score === null || score === undefined || Number.isNaN(score)) return 0;
  return Math.round(score * 100) / 100;
}

/**
 * Résultat d'une correction automatique : le score, et le verdict réponse par réponse.
 *
 * Les clés d'`answers` sont celles de l'original — l'INDICE de la réponse dans la liste, sauf
 * pour la mise en ordre où c'est son RANG (`order_by`). `undefined` y signifie « ni juste ni
 * fausse » : c'est le cas d'une proposition de QCM qu'il fallait laisser décochée.
 */
export interface AutomaticCorrection {
  calculated_score: number;
  answers: Record<number, boolean | undefined>;
}

const EMPTY: AutomaticCorrection = { calculated_score: 0, answers: {} };

/**
 * Corrige un grain. `reference` est le contenu du grain DISTRIBUÉ (avec les bonnes réponses),
 * `filled` celui de la copie.
 *
 * Renvoie un score nul pour les types qui n'ont pas de correction automatique (énoncé, réponse
 * ouverte) : l'enseignant les note à la main.
 */
export function automaticCorrection(
  grainTypeId: number,
  maxScore: number,
  reference: GrainCustomData | undefined,
  filled: GrainCustomCopyData | undefined,
): AutomaticCorrection {
  if (!reference || !filled) return EMPTY;
  switch (grainTypeId) {
    case GRAIN.SIMPLE_ANSWER:
      return correctSimpleAnswer(maxScore, reference, filled);
    case GRAIN.MULTIPLE_ANSWERS:
      return correctMultipleAnswers(maxScore, reference, filled);
    case GRAIN.QCM:
      return correctQcm(maxScore, reference, filled);
    case GRAIN.ASSOCIATION:
      return correctAssociation(maxScore, reference, filled);
    case GRAIN.ORDER_BY:
      return correctOrder(maxScore, reference, filled);
    case GRAIN.TEXT_TO_FILL:
    case GRAIN.AREA_SELECT:
    case GRAIN.AREA_SELECT_IMAGE:
      return correctZones(maxScore, reference, filled);
    default:
      // Énoncé (3) et réponse ouverte (5) : rien à corriger automatiquement.
      return EMPTY;
  }
}

/** Réponse simple : tout ou rien. */
function correctSimpleAnswer(
  maxScore: number,
  reference: GrainCustomData,
  filled: GrainCustomCopyData,
): AutomaticCorrection {
  const correct = compareAnswers(reference.correct_answer, filled.filled_answer);
  return { calculated_score: correct ? maxScore : 0, answers: { 0: correct } };
}

/**
 * Réponses multiples : chaque réponse de l'élève est cherchée parmi celles attendues, et une
 * réponse attendue ne peut servir qu'UNE fois (`alreadyMatch`) — répéter la même bonne réponse
 * ne rapporte donc rien deux fois. Le score est proportionnel au nombre de réponses ATTENDUES.
 */
function correctMultipleAnswers(
  maxScore: number,
  reference: GrainCustomData,
  filled: GrainCustomCopyData,
): AutomaticCorrection {
  const expected = (reference.correct_answer_list ?? []).map((answer) => ({
    text: answer.text,
    used: false,
  }));
  const answers: Record<number, boolean | undefined> = {};
  let good = 0;
  let oneError = false;

  (filled.filled_answer_list ?? []).forEach((given, index) => {
    const match = expected.find((item) => !item.used && compareAnswers(item.text, given.text));
    if (match) {
      match.used = true;
      answers[index] = true;
      if (!(reference.no_error_allowed && oneError)) good += 1;
    } else {
      answers[index] = false;
      oneError = true;
      if (reference.no_error_allowed) good = 0;
    }
  });

  return { calculated_score: ratio(good, expected.length, maxScore), answers };
}

/**
 * QCM : on compare case à case, par INDICE — la liste de la copie et celle du grain distribué
 * sont dans le même ordre.
 *
 * Trois subtilités reprises telles quelles de `QcmService` :
 *  - une proposition qu'il fallait laisser décochée et qui l'est ne compte PAS comme une réponse
 *    reconnue (son verdict reste `undefined`) : le score ne porte que sur les cases qui
 *    départagent ;
 *  - une case mal cochée reçoit le verdict de ce qu'il FALLAIT faire, et non de ce qui a été
 *    fait — c'est ce qui permet à l'écran de surligner en rouge une case cochée à tort ;
 *  - quand aucune case ne départage (QCM sans bonne réponse attendue), le barème est accordé en
 *    entier si l'élève n'a rien coché, et nul sinon.
 */
function correctQcm(
  maxScore: number,
  reference: GrainCustomData,
  filled: GrainCustomCopyData,
): AutomaticCorrection {
  const expected = reference.correct_answer_list ?? [];
  const answers: Record<number, boolean | undefined> = {};
  let good = 0;
  let recognised = 0;
  let oneError = false;

  (filled.filled_answer_list ?? []).forEach((given, index) => {
    const givenChecked = given.isChecked === true;
    const expectedChecked = expected[index]?.isChecked === true;

    if (givenChecked === expectedChecked) {
      if (expectedChecked) {
        recognised += 1;
        answers[index] = true;
        if (!(reference.no_error_allowed && oneError)) good += 1;
      } else {
        answers[index] = undefined;
      }
    } else {
      oneError = true;
      recognised += 1;
      if (reference.no_error_allowed) good = 0;
      answers[index] = expectedChecked;
    }
  });

  if (recognised === 0) {
    return { calculated_score: oneError ? 0 : maxScore, answers };
  }
  return { calculated_score: ratio(good, recognised, maxScore), answers };
}

/**
 * Association. Deux corrections selon que la colonne de gauche est montrée ou non :
 *  - montrée : chaque ligne est comparée à CELLE DE MÊME INDICE, les deux côtés devant
 *    correspondre ;
 *  - masquée : l'élève a composé les deux côtés, on cherche donc la paire n'importe où dans la
 *    liste attendue, et dans les deux sens.
 */
function correctAssociation(
  maxScore: number,
  reference: GrainCustomData,
  filled: GrainCustomCopyData,
): AutomaticCorrection {
  const expected = reference.correct_answer_list ?? [];
  const answers: Record<number, boolean | undefined> = {};
  let good = 0;
  let oneError = false;

  const record = (index: number, correct: boolean) => {
    answers[index] = correct;
    if (correct) {
      if (!(reference.no_error_allowed && oneError)) good += 1;
    } else {
      oneError = true;
      if (reference.no_error_allowed) good = 0;
    }
  };

  (filled.filled_answer_list ?? []).forEach((given, index) => {
    if (reference.show_left_column) {
      const pair = expected[index];
      record(
        index,
        !!pair &&
          compareAnswers(given.text_left, pair.text_left) &&
          compareAnswers(given.text_right, pair.text_right),
      );
    } else {
      record(
        index,
        expected.some(
          (pair) =>
            (compareAnswers(pair.text_left, given.text_left) &&
              compareAnswers(pair.text_right, given.text_right)) ||
            (compareAnswers(pair.text_right, given.text_left) &&
              compareAnswers(pair.text_left, given.text_right)),
        ),
      );
    }
  });

  return { calculated_score: ratio(good, expected.length, maxScore), answers };
}

/**
 * Mise en ordre : la réponse placée au rang N est comparée à celle qui devait y être.
 *
 * ⚠ Les verdicts sont indexés par RANG (`order_by`) et non par position dans le tableau — c'est
 * ce que fait `OrderService`, et l'écran de consultation les relit ainsi.
 */
function correctOrder(
  maxScore: number,
  reference: GrainCustomData,
  filled: GrainCustomCopyData,
): AutomaticCorrection {
  const expected = reference.correct_answer_list ?? [];
  const answers: Record<number, boolean | undefined> = {};
  let good = 0;
  let oneError = false;

  (filled.filled_answer_list ?? []).forEach((given) => {
    const expectedAtRank = expected.find((answer) => answer.order_by === given.order_by);
    const correct = compareAnswers(given.text, expectedAtRank?.text);
    answers[given.order_by ?? 0] = correct;
    if (correct) {
      if (!(reference.no_error_allowed && oneError)) good += 1;
    } else {
      oneError = true;
      if (reference.no_error_allowed) good = 0;
    }
  });

  return { calculated_score: ratio(good, expected.length, maxScore), answers };
}

/**
 * Grains « à zones » (texte à trous, zones de texte, zones d'images) — `zonegrain/model.ts`.
 * Chaque zone est comparée à la sienne, par indice, et le score est proportionnel au nombre de
 * zones. Ces grains ne sont pas encore SAISISSABLES dans cette interface, mais une copie faite
 * dans l'ancienne doit pouvoir être relue ici.
 */
function correctZones(
  maxScore: number,
  reference: GrainCustomData,
  filled: GrainCustomCopyData,
): AutomaticCorrection {
  const expected: GrainZone[] = reference.zones ?? [];
  const given: GrainZone[] = filled.zones ?? [];
  const answers: Record<number, boolean | undefined> = {};
  let good = 0;

  expected.forEach((zone, index) => {
    const correct = !!zone.answer && compareAnswers(zone.answer, given[index]?.answer);
    answers[index] = correct;
    if (correct) good += 1;
  });

  return { calculated_score: ratio(good, expected.length, maxScore), answers };
}

/**
 * Score proportionnel. Un total de zéro réponse donnerait `NaN` — l'original jetait une
 * exception ; on renvoie 0, une copie ne doit pas devenir illisible pour un grain mal formé.
 */
function ratio(good: number, total: number, maxScore: number): number {
  if (!total || !Number.isFinite(maxScore)) return 0;
  const score = (good / total) * maxScore;
  return Number.isNaN(score) ? 0 : score;
}

/**
 * Le score automatique d'une copie entière : la somme de celui de ses grains. C'est ce que
 * l'ancienne IHM accumulait grain par grain au fil de l'affichage.
 */
export function totalCalculatedScore(scores: Array<number | null | undefined>): number {
  return formatScore(scores.reduce<number>((sum, score) => sum + (score ?? 0), 0));
}

/**
 * Les deux scores d'une copie entière, d'après ses grains — portage de
 * `ViewSubjectCopyController#_calculateScores`.
 *
 * Deux règles, reprises telles quelles :
 *  - seuls les grains AYANT un score automatique entrent dans le total (un grain jamais corrigé
 *    automatiquement, comme une réponse ouverte, n'y compte pas tant qu'il n'a pas de note) ;
 *  - la note finale d'un grain, quand l'enseignant ne l'a pas saisie, VAUT son score automatique.
 *    C'est ce qui fait qu'une copie s'ouvre déjà notée, et que corriger consiste à amender.
 *
 * Renvoie aussi les grains dont la note finale a été ainsi déduite : eux seuls ont besoin d'être
 * enregistrés, là où l'ancienne IHM réécrivait la valeur directement dans l'objet affiché.
 */
export function copyScores(
  grainCopies: Array<{
    id: number;
    calculated_score?: number | string | null;
    final_score?: number | string | null;
  }>,
): { calculated: number; final: number; defaulted: number[] } {
  let calculated = 0;
  let final = 0;
  const defaulted: number[] = [];

  for (const grainCopy of grainCopies) {
    const automatic = grainCopy.calculated_score;
    if (automatic === null || automatic === undefined) continue;
    // ⚠ `sanitizeScore`, et non `Number` : une note en cours de frappe est encore une CHAÎNE, et
    // « 1,5 » donnerait `NaN` — donc un total de copie à 0, en silence. Le défaut s'était glissé
    // jusqu'à l'élève, qui lisait « Score final : 0 » sur une copie notée 3,5.
    calculated += sanitizeScore(automatic);
    if (grainCopy.final_score === null || grainCopy.final_score === undefined) {
      final += sanitizeScore(automatic);
      defaulted.push(grainCopy.id);
    } else {
      final += sanitizeScore(grainCopy.final_score);
    }
  }

  return { calculated: formatScore(calculated), final: formatScore(final), defaulted };
}

/** Une réponse d'élève est-elle vide ? Sert à distinguer « faux » de « pas répondu ». */
export const isBlank = (answer: GrainAnswer | undefined): boolean =>
  !answer || (!answer.text && !answer.text_left && !answer.text_right);
