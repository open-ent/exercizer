import { describe, expect, it } from 'vitest';

import {
  automaticCorrection,
  compareAnswers,
  formatScore,
  isBlank,
  totalCalculatedScore,
} from './correction';
import { GRAIN } from './grains';

describe('compareAnswers', () => {
  it('ignore la casse, les espaces et les accents', () => {
    expect(compareAnswers('Paris', 'paris')).toBe(true);
    expect(compareAnswers('le chat', 'LeChat')).toBe(true);
    expect(compareAnswers('Noël', 'noel')).toBe(true);
    expect(compareAnswers('Ça', 'ca')).toBe(true);
  });

  it('traite les ligatures, ce que ne ferait pas une simple décomposition Unicode', () => {
    expect(compareAnswers('Œuvre', 'oeuvre')).toBe(true);
    expect(compareAnswers('Æsop', 'aesop')).toBe(true);
    expect(compareAnswers('Ø', 'o')).toBe(true);
  });

  it('ignore les caractères de largeur nulle', () => {
    expect(compareAnswers('Pa​ris', 'Paris')).toBe(true);
  });

  it('ne reconnaît pas deux réponses vides, pas même entre elles', () => {
    // C'est le `string1 && string2` de l'original : une attente vide est toujours comptée fausse.
    expect(compareAnswers('', '')).toBe(false);
    expect(compareAnswers(undefined, 'a')).toBe(false);
    expect(compareAnswers('a', null)).toBe(false);
  });

  it('distingue deux réponses différentes', () => {
    expect(compareAnswers('Paris', 'Lyon')).toBe(false);
  });
});

describe('formatScore', () => {
  it('arrondit à deux décimales', () => {
    expect(formatScore(1.666)).toBe(1.67);
    expect(formatScore(2)).toBe(2);
  });

  it('renvoie 0 pour une absence de score', () => {
    expect(formatScore(null)).toBe(0);
    expect(formatScore(undefined)).toBe(0);
    expect(formatScore(Number.NaN)).toBe(0);
  });
});

describe('réponse simple', () => {
  const reference = { correct_answer: 'Paris' };

  it('accorde tout le barème ou rien', () => {
    expect(
      automaticCorrection(GRAIN.SIMPLE_ANSWER, 4, reference, { filled_answer: 'paris' }),
    ).toEqual({ calculated_score: 4, answers: { 0: true } });
    expect(
      automaticCorrection(GRAIN.SIMPLE_ANSWER, 4, reference, { filled_answer: 'Lyon' }),
    ).toEqual({ calculated_score: 0, answers: { 0: false } });
  });

  it('compte faux une absence de réponse', () => {
    expect(
      automaticCorrection(GRAIN.SIMPLE_ANSWER, 4, reference, { filled_answer: '' })
        .calculated_score,
    ).toBe(0);
  });
});

describe('réponses multiples', () => {
  const reference = {
    correct_answer_list: [{ text: 'chat' }, { text: 'chien' }],
  };

  it('note au prorata des réponses attendues', () => {
    const result = automaticCorrection(GRAIN.MULTIPLE_ANSWERS, 10, reference, {
      filled_answer_list: [{ text: 'chat' }, { text: 'cheval' }],
    });
    expect(result.calculated_score).toBe(5);
    expect(result.answers).toEqual({ 0: true, 1: false });
  });

  it('ne compte pas deux fois la même bonne réponse', () => {
    const result = automaticCorrection(GRAIN.MULTIPLE_ANSWERS, 10, reference, {
      filled_answer_list: [{ text: 'chat' }, { text: 'CHAT' }],
    });
    expect(result.calculated_score).toBe(5);
    expect(result.answers).toEqual({ 0: true, 1: false });
  });

  it('annule tout si une erreur n’est pas admise', () => {
    const strict = { ...reference, no_error_allowed: true };
    expect(
      automaticCorrection(GRAIN.MULTIPLE_ANSWERS, 10, strict, {
        filled_answer_list: [{ text: 'chat' }, { text: 'cheval' }],
      }).calculated_score,
    ).toBe(0);
    expect(
      automaticCorrection(GRAIN.MULTIPLE_ANSWERS, 10, strict, {
        filled_answer_list: [{ text: 'chat' }, { text: 'chien' }],
      }).calculated_score,
    ).toBe(10);
  });
});

describe('QCM', () => {
  const reference = {
    correct_answer_list: [
      { text: 'Paris', isChecked: true },
      { text: 'Lyon', isChecked: false },
      { text: 'Marseille', isChecked: false },
    ],
  };

  it('ne note que les cases qui départagent', () => {
    // Tout juste : une seule case comptait, elle est cochée.
    const result = automaticCorrection(GRAIN.QCM, 6, reference, {
      filled_answer_list: [{ isChecked: true }, { isChecked: false }, { isChecked: false }],
    });
    expect(result.calculated_score).toBe(6);
    // Les cases qu'il fallait laisser décochées n'ont PAS de verdict.
    expect(result.answers).toEqual({ 0: true, 1: undefined, 2: undefined });
  });

  it('compte une case cochée à tort, et marque ce qu’il fallait faire', () => {
    const result = automaticCorrection(GRAIN.QCM, 6, reference, {
      filled_answer_list: [{ isChecked: true }, { isChecked: true }, { isChecked: false }],
    });
    // Deux cases départagent désormais, une seule est bonne.
    expect(result.calculated_score).toBe(3);
    // Le verdict de la case 1 dit ce qu'il FALLAIT faire (la laisser décochée) : c'est ce qui
    // permet de la surligner en rouge à l'écran.
    expect(result.answers).toEqual({ 0: true, 1: false, 2: undefined });
  });

  it('annule tout si une erreur n’est pas admise', () => {
    const strict = { ...reference, no_error_allowed: true };
    expect(
      automaticCorrection(GRAIN.QCM, 6, strict, {
        filled_answer_list: [{ isChecked: true }, { isChecked: true }, { isChecked: false }],
      }).calculated_score,
    ).toBe(0);
  });

  it('accorde le barème quand rien ne départage et que rien n’est coché', () => {
    const sansBonneReponse = {
      correct_answer_list: [{ text: 'a', isChecked: false }, { text: 'b', isChecked: false }],
    };
    expect(
      automaticCorrection(GRAIN.QCM, 5, sansBonneReponse, {
        filled_answer_list: [{ isChecked: false }, { isChecked: false }],
      }).calculated_score,
    ).toBe(5);
  });
});

describe('association', () => {
  const pairs = [
    { text_left: 'France', text_right: 'Paris' },
    { text_left: 'Italie', text_right: 'Rome' },
  ];

  it('compare ligne à ligne quand la colonne de gauche est montrée', () => {
    const reference = { correct_answer_list: pairs, show_left_column: true };
    const result = automaticCorrection(GRAIN.ASSOCIATION, 8, reference, {
      filled_answer_list: [
        { text_left: 'France', text_right: 'Paris' },
        { text_left: 'Italie', text_right: 'Paris' },
      ],
    });
    expect(result.calculated_score).toBe(4);
    expect(result.answers).toEqual({ 0: true, 1: false });
  });

  it('cherche la paire n’importe où, et dans les deux sens, sans colonne de gauche', () => {
    const reference = { correct_answer_list: pairs, show_left_column: false };
    const result = automaticCorrection(GRAIN.ASSOCIATION, 8, reference, {
      filled_answer_list: [
        // Dans l'autre sens : accepté.
        { text_left: 'Rome', text_right: 'Italie' },
        // Dans un autre ordre que la liste attendue : accepté aussi.
        { text_left: 'France', text_right: 'Paris' },
      ],
    });
    expect(result.calculated_score).toBe(8);
  });

  it('compte faux une ligne laissée vide', () => {
    const reference = { correct_answer_list: pairs, show_left_column: true };
    const result = automaticCorrection(GRAIN.ASSOCIATION, 8, reference, {
      filled_answer_list: [{ text_left: 'France', text_right: null as unknown as string }],
    });
    expect(result.answers[0]).toBe(false);
  });
});

describe('mise en ordre', () => {
  const reference = {
    correct_answer_list: [
      { text: 'un', order_by: 1 },
      { text: 'deux', order_by: 2 },
      { text: 'trois', order_by: 3 },
    ],
  };

  it('compare la réponse placée à un rang avec celle attendue à ce rang', () => {
    const result = automaticCorrection(GRAIN.ORDER_BY, 9, reference, {
      filled_answer_list: [
        { text: 'un', order_by: 1 },
        { text: 'trois', order_by: 2 },
        { text: 'deux', order_by: 3 },
      ],
    });
    expect(result.calculated_score).toBe(3);
    // Les verdicts sont indexés par RANG, pas par position dans le tableau.
    expect(result.answers).toEqual({ 1: true, 2: false, 3: false });
  });

  it('accorde tout le barème sur un ordre juste', () => {
    expect(
      automaticCorrection(GRAIN.ORDER_BY, 9, reference, {
        filled_answer_list: reference.correct_answer_list,
      }).calculated_score,
    ).toBe(9);
  });
});

describe('grains à zones', () => {
  it('note au prorata des zones justes', () => {
    const reference = { zones: [{ answer: 'bleu' }, { answer: 'rouge' }] };
    const result = automaticCorrection(GRAIN.TEXT_TO_FILL, 4, reference, {
      zones: [{ answer: 'BLEU' }, { answer: 'vert' }],
    });
    expect(result.calculated_score).toBe(2);
    expect(result.answers).toEqual({ 0: true, 1: false });
  });
});

describe('types sans correction automatique', () => {
  it('ne note ni l’énoncé ni la réponse ouverte', () => {
    expect(automaticCorrection(GRAIN.STATEMENT, 5, {}, {}).calculated_score).toBe(0);
    expect(
      automaticCorrection(GRAIN.OPEN_ANSWER, 5, {}, { filled_answer: '<p>bla</p>' })
        .calculated_score,
    ).toBe(0);
  });

  it('ne tombe pas sur un grain sans données', () => {
    expect(automaticCorrection(GRAIN.QCM, 5, undefined, undefined).calculated_score).toBe(0);
    expect(
      automaticCorrection(GRAIN.MULTIPLE_ANSWERS, 5, { correct_answer_list: [] }, {})
        .calculated_score,
    ).toBe(0);
  });
});

describe('totalCalculatedScore', () => {
  it('somme les scores en ignorant les grains non notés', () => {
    expect(totalCalculatedScore([2, null, 1.5, undefined])).toBe(3.5);
    expect(totalCalculatedScore([])).toBe(0);
  });
});

describe('isBlank', () => {
  it('reconnaît une réponse non remplie', () => {
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank({})).toBe(true);
    expect(isBlank({ text: '' })).toBe(true);
    expect(isBlank({ text: 'a' })).toBe(false);
    expect(isBlank({ text_right: 'a' })).toBe(false);
  });
});
