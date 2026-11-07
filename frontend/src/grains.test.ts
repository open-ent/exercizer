import { describe, expect, it } from 'vitest';

import {
  byOrder,
  cleanGrainData,
  computedMaxScore,
  convertGrainData,
  defaultCustomData,
  duplicatedTitle,
  GRAIN,
  grainDisplayName,
  isZoneType,
  isQuestion,
  isUndecided,
  moveGrain,
  nextOrder,
  preferredRank,
  questionNumber,
  renumberOrderAnswers,
  sanitizeScore,
  statementOf,
  withEditableAnswers,
} from './grains';
import { Grain, GrainData } from './types';

const grain = (over: Partial<Grain> & { id: number }): Grain => ({
  subject_id: 1,
  grain_type_id: GRAIN.QCM,
  order_by: over.id,
  grain_data: {},
  ...over,
});

describe('natures de grain', () => {
  it('ne compte comme question que les types au-delà de l’énoncé', () => {
    expect(isQuestion(GRAIN.CHOOSE)).toBe(false);
    expect(isQuestion(GRAIN.CHOOSE_ANSWER)).toBe(false);
    expect(isQuestion(GRAIN.STATEMENT)).toBe(false);
    expect(isQuestion(GRAIN.SIMPLE_ANSWER)).toBe(true);
    expect(isQuestion(GRAIN.AREA_SELECT_IMAGE)).toBe(true);
  });

  it('reconnaît les deux étapes d’un grain pas encore décidé', () => {
    expect(isUndecided(GRAIN.CHOOSE)).toBe(true);
    expect(isUndecided(GRAIN.CHOOSE_ANSWER)).toBe(true);
    expect(isUndecided(GRAIN.STATEMENT)).toBe(false);
  });

  it('reconnaît les trois types à zones, et eux seuls', () => {
    expect(isZoneType(GRAIN.TEXT_TO_FILL)).toBe(true);
    expect(isZoneType(GRAIN.AREA_SELECT)).toBe(true);
    expect(isZoneType(GRAIN.AREA_SELECT_IMAGE)).toBe(true);
    expect(isZoneType(GRAIN.QCM)).toBe(false);
    expect(isZoneType(GRAIN.STATEMENT)).toBe(false);
  });

  it('prépare un grain à zones vide, en saisie libre', () => {
    expect(defaultCustomData(GRAIN.TEXT_TO_FILL)).toEqual({
      zones: [],
      options: [],
      answersType: 'text',
    });
    expect(defaultCustomData(GRAIN.AREA_SELECT_IMAGE)).toEqual({ zones: [], options: [] });
  });

  it('propose les types du plus courant au plus spécialisé', () => {
    const list = [GRAIN.ORDER_BY, GRAIN.QCM, GRAIN.SIMPLE_ANSWER, GRAIN.ASSOCIATION];
    expect([...list].sort((a, b) => preferredRank(a) - preferredRank(b))).toEqual([
      GRAIN.QCM,
      GRAIN.SIMPLE_ANSWER,
      GRAIN.ASSOCIATION,
      GRAIN.ORDER_BY,
    ]);
  });
});

describe('sanitizeScore', () => {
  it('accepte la virgule décimale', () => {
    expect(sanitizeScore('1,5')).toBe(1.5);
    expect(sanitizeScore('2.25')).toBe(2.25);
  });

  it('arrondit à deux décimales', () => {
    expect(sanitizeScore('1,234')).toBe(1.23);
  });

  it('renvoie 0 pour tout ce qui n’est pas un nombre', () => {
    expect(sanitizeScore('')).toBe(0);
    expect(sanitizeScore(undefined)).toBe(0);
    expect(sanitizeScore(null)).toBe(0);
    expect(sanitizeScore('abc')).toBe(0);
  });
});

describe('computedMaxScore', () => {
  it('somme les barèmes des questions seules', () => {
    expect(
      computedMaxScore([
        grain({ id: 1, grain_type_id: GRAIN.STATEMENT, grain_data: { max_score: 99 } }),
        grain({ id: 2, grain_type_id: GRAIN.QCM, grain_data: { max_score: 2 } }),
        grain({ id: 3, grain_type_id: GRAIN.SIMPLE_ANSWER, grain_data: { max_score: '1,5' } }),
        grain({ id: 4, grain_type_id: GRAIN.CHOOSE, grain_data: { max_score: 5 } }),
      ]),
    ).toBe(3.5);
  });

  it('vaut 0 sur un sujet vide', () => {
    expect(computedMaxScore([])).toBe(0);
  });
});

describe('questionNumber', () => {
  it('ne numérote que les questions, un énoncé intercalé ne décalant rien', () => {
    const grains = [
      grain({ id: 1, order_by: 1, grain_type_id: GRAIN.QCM }),
      grain({ id: 2, order_by: 2, grain_type_id: GRAIN.STATEMENT }),
      grain({ id: 3, order_by: 3, grain_type_id: GRAIN.SIMPLE_ANSWER }),
    ];
    expect(questionNumber(grains[0], grains)).toBe(1);
    expect(questionNumber(grains[2], grains)).toBe(2);
  });
});

describe('ordre des grains', () => {
  it('trie par rang', () => {
    const grains = [grain({ id: 3, order_by: 3 }), grain({ id: 1, order_by: 1 })];
    expect(byOrder(grains).map((g) => g.id)).toEqual([1, 3]);
  });

  it('place le prochain grain après le dernier', () => {
    expect(nextOrder([])).toBe(1);
    expect(nextOrder([grain({ id: 1, order_by: 1 }), grain({ id: 2, order_by: 4 })])).toBe(5);
  });

  it('renumérote de 1 à n et ne signale que les rangs changés', () => {
    const grains = [
      grain({ id: 1, order_by: 1 }),
      grain({ id: 2, order_by: 2 }),
      grain({ id: 3, order_by: 3 }),
    ];
    // On remonte le troisième en tête : les trois rangs changent.
    const { grains: moved, changed } = moveGrain(grains, 2, 0);
    expect(moved.map((g) => g.id)).toEqual([3, 1, 2]);
    expect(moved.map((g) => g.order_by)).toEqual([1, 2, 3]);
    expect(changed.map((g) => g.id).sort()).toEqual([1, 2, 3]);
  });

  it('ne signale que ce qui bouge vraiment', () => {
    const grains = [
      grain({ id: 1, order_by: 1 }),
      grain({ id: 2, order_by: 2 }),
      grain({ id: 3, order_by: 3 }),
      grain({ id: 4, order_by: 4 }),
    ];
    // Échange des deux derniers : les deux premiers gardent leur rang.
    const { changed } = moveGrain(grains, 3, 2);
    expect(changed.map((g) => g.id)).toEqual([4, 3]);
  });

  it('ignore un déplacement impossible', () => {
    const grains = [grain({ id: 1, order_by: 1 }), grain({ id: 2, order_by: 2 })];
    expect(moveGrain(grains, 0, 0).changed).toEqual([]);
    expect(moveGrain(grains, 5, 0).changed).toEqual([]);
    expect(moveGrain(grains, 0, -1).changed).toEqual([]);
  });
});

describe('defaultCustomData', () => {
  it('ouvre les listes avec deux réponses', () => {
    expect(defaultCustomData(GRAIN.QCM).correct_answer_list).toHaveLength(2);
    expect(defaultCustomData(GRAIN.MULTIPLE_ANSWERS).correct_answer_list).toHaveLength(2);
    expect(defaultCustomData(GRAIN.ORDER_BY).correct_answer_list).toEqual([
      { text: '', order_by: 1 },
      { text: '', order_by: 2 },
    ]);
  });

  it('montre la colonne de gauche d’une association par défaut', () => {
    expect(defaultCustomData(GRAIN.ASSOCIATION).show_left_column).toBe(true);
    expect(defaultCustomData(GRAIN.ASSOCIATION).correct_answer_list).toHaveLength(1);
  });

  it('ne règle rien pour une réponse ouverte', () => {
    expect(defaultCustomData(GRAIN.OPEN_ANSWER)).toEqual({});
  });
});

describe('withEditableAnswers', () => {
  it('complète un QCM revenu du serveur sans ligne', () => {
    const padded = withEditableAnswers(GRAIN.QCM, {});
    expect(padded.correct_answer_list).toEqual([
      { text: '', isChecked: false },
      { text: '', isChecked: false },
    ]);
  });

  it('garde ce qui existe et n’ajoute que le manque', () => {
    const padded = withEditableAnswers(GRAIN.QCM, {
      correct_answer_list: [{ text: 'Paris', isChecked: true }],
    });
    expect(padded.correct_answer_list).toEqual([
      { text: 'Paris', isChecked: true },
      { text: '', isChecked: false },
    ]);
  });

  it('numérote les lignes ajoutées d’une mise en ordre', () => {
    expect(withEditableAnswers(GRAIN.ORDER_BY, {}).correct_answer_list).toEqual([
      { text: '', order_by: 1 },
      { text: '', order_by: 2 },
    ]);
  });

  it('n’ajoute qu’une ligne à une association', () => {
    expect(withEditableAnswers(GRAIN.ASSOCIATION, {}).correct_answer_list).toEqual([
      { text_left: '', text_right: '' },
    ]);
  });

  it('ne touche pas aux types sans liste', () => {
    const data = { correct_answer: 'Paris' };
    expect(withEditableAnswers(GRAIN.SIMPLE_ANSWER, data)).toBe(data);
    expect(withEditableAnswers(GRAIN.STATEMENT, {})).toEqual({});
  });

  it('laisse intacte une liste déjà assez longue', () => {
    const data = { correct_answer_list: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] };
    expect(withEditableAnswers(GRAIN.MULTIPLE_ANSWERS, data)).toBe(data);
  });
});

describe('cleanGrainData', () => {
  const withAnswers = (list: GrainData['custom_data']): GrainData => ({ custom_data: list });

  it('écarte les lignes d’association à moitié remplies', () => {
    const data = withAnswers({
      correct_answer_list: [
        { text_left: 'a', text_right: '1' },
        { text_left: '', text_right: '' },
        { text_left: 'b', text_right: '' },
      ],
    });
    const cleaned = cleanGrainData(GRAIN.ASSOCIATION, data);
    expect(cleaned.custom_data?.correct_answer_list).toEqual([
      { text_left: 'a', text_right: '1' },
      { text_left: 'b', text_right: '' },
    ]);
  });

  it('écarte les réponses de QCM sans texte', () => {
    const data = withAnswers({
      correct_answer_list: [
        { text: 'oui', isChecked: true },
        { text: '', isChecked: false },
      ],
    });
    expect(cleanGrainData(GRAIN.QCM, data).custom_data?.correct_answer_list).toEqual([
      { text: 'oui', isChecked: true },
    ]);
  });

  it('laisse les autres types intacts', () => {
    const data = withAnswers({ correct_answer_list: [{ text: '' }, { text: 'b' }] });
    expect(cleanGrainData(GRAIN.MULTIPLE_ANSWERS, data)).toBe(data);
    expect(cleanGrainData(GRAIN.ORDER_BY, data)).toBe(data);
  });

  it('ne touche pas l’objet d’origine', () => {
    const data = withAnswers({ correct_answer_list: [{ text: '' }, { text: 'b' }] });
    cleanGrainData(GRAIN.QCM, data);
    expect(data.custom_data?.correct_answer_list).toHaveLength(2);
  });
});

describe('renumberOrderAnswers', () => {
  it('renumérote de 1 à n dans l’ordre du tableau', () => {
    expect(
      renumberOrderAnswers([
        { text: 'c', order_by: 3 },
        { text: 'a', order_by: 1 },
      ]),
    ).toEqual([
      { text: 'c', order_by: 1 },
      { text: 'a', order_by: 2 },
    ]);
  });
});

describe('statementOf', () => {
  it('lit l’énoncé à sa place canonique', () => {
    expect(statementOf({ custom_data: { statement: '<p>ici</p>' } })).toBe('<p>ici</p>');
  });

  it('retombe sur un énoncé posé à plat par un import ancien', () => {
    expect(statementOf({ statement: '<p>legacy</p>' })).toBe('<p>legacy</p>');
  });

  it('préfère la place canonique quand les deux existent', () => {
    expect(
      statementOf({ statement: '<p>legacy</p>', custom_data: { statement: '<p>ici</p>' } }),
    ).toBe('<p>ici</p>');
  });

  it('renvoie une chaîne vide quand il n’y a rien', () => {
    expect(statementOf({})).toBe('');
  });
});

describe('libellés', () => {
  it('suffixe le titre d’une copie, ou prend le nom du type', () => {
    expect(duplicatedTitle('Fractions', 'QCM', '_copie')).toBe('Fractions_copie');
    expect(duplicatedTitle('', 'QCM', '_copie')).toBe('QCM_copie');
    expect(duplicatedTitle(undefined, 'QCM', '_copie')).toBe('QCM_copie');
  });

  it('affiche le nom du type tant que le grain n’a pas de titre', () => {
    expect(grainDisplayName(grain({ id: 1, grain_data: { title: 'Q1' } }), 'QCM')).toBe('Q1');
    expect(grainDisplayName(grain({ id: 1, grain_data: { title: '' } }), 'QCM')).toBe('QCM');
    expect(grainDisplayName(grain({ id: 1, grain_data: {} }), 'QCM')).toBe('QCM');
  });
});

describe('convertGrainData', () => {
  const common = {
    title: 'Capitales',
    max_score: 2,
    statement: '<p>Quelle est la capitale ?</p>',
    answer_hint: 'Une ville',
    answer_explanation: 'Paris',
  };
  const qcm: GrainData = {
    ...common,
    custom_data: {
      correct_answer_list: [
        { text: 'Paris', isChecked: true },
        { text: 'Lyon', isChecked: false },
        { text: '', isChecked: false },
      ],
      no_error_allowed: true,
      multipleAnswers: false,
    },
  };

  it('garde les champs communs à toute question', () => {
    const { data } = convertGrainData(GRAIN.QCM, GRAIN.MULTIPLE_ANSWERS, qcm);
    expect(data).toMatchObject(common);
  });

  it("QCM → réponses multiples : les textes restent, la coche est perdue", () => {
    const { data, lost } = convertGrainData(GRAIN.QCM, GRAIN.MULTIPLE_ANSWERS, qcm);
    expect(data.custom_data?.correct_answer_list).toEqual([{ text: 'Paris' }, { text: 'Lyon' }]);
    expect(data.custom_data?.no_error_allowed).toBe(true);
    expect(lost).toBe(true);
  });

  it('réponses multiples → QCM : rien de coché, rien de perdu', () => {
    const { data, lost } = convertGrainData(GRAIN.MULTIPLE_ANSWERS, GRAIN.QCM, {
      custom_data: { correct_answer_list: [{ text: 'a' }, { text: 'b' }] },
    });
    expect(data.custom_data?.correct_answer_list).toEqual([
      { text: 'a', isChecked: false },
      { text: 'b', isChecked: false },
    ]);
    expect(data.custom_data?.multipleAnswers).toBe(false);
    expect(lost).toBe(false);
  });

  it('réponse simple → QCM : la réponse devient la proposition cochée', () => {
    const { data, lost } = convertGrainData(GRAIN.SIMPLE_ANSWER, GRAIN.QCM, {
      custom_data: { correct_answer: 'Paris' },
    });
    expect(data.custom_data?.correct_answer_list).toEqual([{ text: 'Paris', isChecked: true }]);
    expect(lost).toBe(false);
  });

  it('QCM → réponse simple : la réponse cochée, les autres perdues', () => {
    const { data, lost } = convertGrainData(GRAIN.QCM, GRAIN.SIMPLE_ANSWER, qcm);
    expect(data.custom_data).toEqual({ correct_answer: 'Paris' });
    expect(lost).toBe(true);
  });

  it("association → ordre → association : la colonne droite ne survit pas à l'aller", () => {
    const association: GrainData = {
      custom_data: {
        correct_answer_list: [
          { text_left: 'chat', text_right: 'cat' },
          { text_left: 'chien', text_right: 'dog' },
        ],
      },
    };
    const order = convertGrainData(GRAIN.ASSOCIATION, GRAIN.ORDER_BY, association);
    expect(order.lost).toBe(true);
    expect(order.data.custom_data?.correct_answer_list).toEqual([
      { text: 'chat', order_by: 1 },
      { text: 'chien', order_by: 2 },
    ]);
    const back = convertGrainData(GRAIN.ORDER_BY, GRAIN.ASSOCIATION, order.data);
    expect(back.data.custom_data?.correct_answer_list).toEqual([
      { text_left: 'chat', text_right: '' },
      { text_left: 'chien', text_right: '' },
    ]);
    expect(back.data.custom_data?.show_left_column).toBe(true);
  });

  it("mise en ordre : lue dans l'ordre attendu, pas dans celui du tableau", () => {
    const { data } = convertGrainData(GRAIN.ORDER_BY, GRAIN.MULTIPLE_ANSWERS, {
      custom_data: {
        correct_answer_list: [
          { text: 'deux', order_by: 2 },
          { text: 'un', order_by: 1 },
        ],
      },
    });
    expect(data.custom_data?.correct_answer_list).toEqual([{ text: 'un' }, { text: 'deux' }]);
  });

  it("question ↔ énoncé : l'énoncé change de place", () => {
    const toStatement = convertGrainData(GRAIN.OPEN_ANSWER, GRAIN.STATEMENT, common);
    expect(toStatement.data.statement).toBeUndefined();
    expect(toStatement.data.custom_data?.statement).toBe(common.statement);
    expect(toStatement.lost).toBe(false);
    const back = convertGrainData(GRAIN.STATEMENT, GRAIN.SIMPLE_ANSWER, toStatement.data);
    expect(back.data.statement).toBe(common.statement);
    expect(back.data.custom_data).toEqual({ correct_answer: '' });
  });

  it('les zones et le corrigé d\'une réponse ouverte sont signalés perdus', () => {
    expect(
      convertGrainData(GRAIN.TEXT_TO_FILL, GRAIN.QCM, {
        custom_data: { zones: [{ answer: 'x' }], options: [] },
      }).lost,
    ).toBe(true);
    expect(
      convertGrainData(GRAIN.OPEN_ANSWER, GRAIN.QCM, { custom_data: { model_answer: '<p>x</p>' } })
        .lost,
    ).toBe(true);
    const toZones = convertGrainData(GRAIN.QCM, GRAIN.TEXT_TO_FILL, qcm);
    expect(toZones.lost).toBe(true);
    expect(toZones.data.custom_data).toEqual(defaultCustomData(GRAIN.TEXT_TO_FILL));
  });
});
