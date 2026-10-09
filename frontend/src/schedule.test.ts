import { describe, expect, it } from 'vitest';

import { GRAIN } from './grains';
import {
  areDatesValid,
  buildGrainsCustomCopyData,
  buildScheduleBody,
  buildScheduledAt,
  buildSimpleScheduleBody,
  hasRecipients,
  initialCopyData,
  normaliseTime,
  scheduleBlocker,
  shuffle,
  toScheduleDate,
} from './schedule';
import { Grain, Subject } from './types';

const grain = (over: Partial<Grain> & { id: number; grain_type_id: number }): Grain => ({
  subject_id: 1,
  order_by: over.id,
  grain_data: {},
  ...over,
});

/** Tirage FIGÉ : les mélanges deviennent vérifiables. 0 renverse l'ordre de la liste. */
const noShuffle = () => 0;

describe('scheduleBlocker', () => {
  it('refuse un sujet vide', () => {
    expect(scheduleBlocker([])).toBe('exercizer.service.check.schedule');
  });

  it('refuse un sujet qui n’a que des énoncés', () => {
    expect(scheduleBlocker([grain({ id: 1, grain_type_id: GRAIN.STATEMENT })])).toBe(
      'exercizer.service.check.schedule',
    );
  });

  it('accepte un sujet dont les questions ont une réponse', () => {
    expect(
      scheduleBlocker([
        grain({ id: 1, grain_type_id: GRAIN.STATEMENT }),
        grain({
          id: 2,
          grain_type_id: GRAIN.QCM,
          grain_data: { custom_data: { correct_answer_list: [{ text: 'a', isChecked: true }] } },
        }),
      ]),
    ).toBeNull();
  });

  it('refuse un QCM dont aucune proposition n’est cochée', () => {
    expect(
      scheduleBlocker([
        grain({
          id: 1,
          grain_type_id: GRAIN.QCM,
          grain_data: { custom_data: { correct_answer_list: [{ text: 'a', isChecked: false }] } },
        }),
      ]),
    ).toBe('exercizer.service.check.schedule.resp');
  });

  it('refuse une association à moitié remplie', () => {
    expect(
      scheduleBlocker([
        grain({
          id: 1,
          grain_type_id: GRAIN.ASSOCIATION,
          grain_data: {
            custom_data: { correct_answer_list: [{ text_left: 'a', text_right: '' }] },
          },
        }),
      ]),
    ).toBe('exercizer.service.check.schedule.resp');
  });

  it('refuse une mise en ordre ou des réponses multiples sans réponse', () => {
    for (const type of [GRAIN.ORDER_BY, GRAIN.MULTIPLE_ANSWERS]) {
      expect(
        scheduleBlocker([
          grain({ id: 1, grain_type_id: type, grain_data: { custom_data: {} } }),
        ]),
      ).toBe('exercizer.service.check.schedule.resp');
    }
  });

  it('laisse passer une réponse simple sans corrigé, comme l’ancienne IHM', () => {
    // Règle reprise à la lettre : on ne durcit pas, un refus nouveau bloquerait un usage existant.
    expect(
      scheduleBlocker([grain({ id: 1, grain_type_id: GRAIN.SIMPLE_ANSWER, grain_data: {} })]),
    ).toBeNull();
  });
});

describe('buildScheduledAt', () => {
  it('n’envoie que les personnes choisies une par une', () => {
    const result = buildScheduledAt(
      [{ _id: 'g1', name: '4ème-1' }],
      [
        { _id: 'u1', name: 'Léa', profile: 'Student' },
        // Arrivée avec son groupe : le serveur la résoudra, l'envoyer créerait un doublon.
        { _id: 'u2', name: 'Paul', profile: 'Student', groupId: 'g1' },
      ],
    );
    expect(result.groupList).toEqual([{ _id: 'g1', name: '4ème-1' }]);
    expect(result.userList).toEqual([{ _id: 'u1', name: 'Léa', profile: 'Student' }]);
    expect(result.exclude).toEqual([]);
  });

  it('ne met dans les exclus que les membres de groupe retirés', () => {
    const result = buildScheduledAt(
      [{ _id: 'g1', name: '4ème-1' }],
      [
        { _id: 'u2', name: 'Paul', groupId: 'g1', exclude: true },
        { _id: 'u3', name: 'Zoé', groupId: 'g1' },
      ],
    );
    expect(result.exclude).toEqual([{ _id: 'u2', name: 'Paul', profile: undefined }]);
  });

  it('ne répète pas une personne exclue deux fois', () => {
    const result = buildScheduledAt(
      [],
      [
        { _id: 'u2', name: 'Paul', groupId: 'g1', exclude: true },
        { _id: 'u2', name: 'Paul', groupId: 'g2', exclude: true },
      ],
    );
    expect(result.exclude).toHaveLength(1);
  });

  it('sait dire qu’il n’y a personne', () => {
    expect(hasRecipients(buildScheduledAt([], []))).toBe(false);
    expect(hasRecipients(buildScheduledAt([], [{ _id: 'u1', name: 'Léa' }]))).toBe(true);
  });
});

describe('dates', () => {
  it('garde le jour choisi et l’heure saisie', () => {
    expect(toScheduleDate(new Date(2026, 2, 18), '08:30')).toBe('2026-03-18T08:30:00.000Z');
  });

  it('remplace une heure invalide', () => {
    expect(normaliseTime('abc')).toBe('00:00');
    expect(normaliseTime('abc', true)).toBe('23:59');
    expect(normaliseTime('25:00')).toBe('00:00');
    expect(normaliseTime('23:59')).toBe('23:59');
  });

  it('exige que le début précède la fin', () => {
    const base = {
      beginDate: new Date(2026, 2, 18),
      beginTime: '08:00',
      dueDate: new Date(2026, 2, 20),
      dueTime: '23:59',
    };
    expect(areDatesValid(base)).toBe(true);
    expect(areDatesValid({ ...base, dueDate: new Date(2026, 2, 17) })).toBe(false);
    // Même jour, même heure : ce n'est pas une période.
    expect(
      areDatesValid({ ...base, dueDate: new Date(2026, 2, 18), dueTime: '08:00' }),
    ).toBe(false);
  });

  it('exige que le corrigé ne précède pas la fin', () => {
    const base = {
      beginDate: new Date(2026, 2, 18),
      beginTime: '08:00',
      dueDate: new Date(2026, 2, 20),
      dueTime: '23:59',
      correctedTime: '00:00',
    };
    expect(areDatesValid({ ...base, correctedDate: new Date(2026, 2, 21) })).toBe(true);
    expect(areDatesValid({ ...base, correctedDate: new Date(2026, 2, 19) })).toBe(false);
  });
});

describe('initialCopyData', () => {
  it('vide la réponse d’une question à saisir', () => {
    expect(initialCopyData(grain({ id: 1, grain_type_id: GRAIN.SIMPLE_ANSWER }))).toEqual({
      filled_answer: '',
    });
  });

  it('prépare autant de champs que de réponses attendues', () => {
    const data = initialCopyData(
      grain({
        id: 1,
        grain_type_id: GRAIN.MULTIPLE_ANSWERS,
        grain_data: { custom_data: { correct_answer_list: [{ text: 'a' }, { text: 'b' }] } },
      }),
    );
    expect(data.filled_answer_list).toEqual([{ text: '' }, { text: '' }]);
  });

  it('recopie les propositions d’un QCM sans dire lesquelles sont justes', () => {
    const data = initialCopyData(
      grain({
        id: 1,
        grain_type_id: GRAIN.QCM,
        grain_data: {
          custom_data: {
            correct_answer_list: [
              { text: 'Paris', isChecked: true },
              { text: 'Lyon', isChecked: false },
            ],
            multipleAnswers: true,
          },
        },
      }),
    );
    // ⚠ Aucune trace de `isChecked` : la copie de l'élève ne doit pas porter la réponse.
    expect(data.filled_answer_list).toEqual([{ text: 'Paris' }, { text: 'Lyon' }]);
    expect(JSON.stringify(data)).not.toContain('isChecked');
    expect(data.multipleAnswers).toBe(true);
  });

  it('mélange l’ordre de départ d’une mise en ordre', () => {
    const data = initialCopyData(
      grain({
        id: 1,
        grain_type_id: GRAIN.ORDER_BY,
        grain_data: {
          custom_data: {
            correct_answer_list: [
              { text: 'un', order_by: 1 },
              { text: 'deux', order_by: 2 },
              { text: 'trois', order_by: 3 },
            ],
          },
        },
      }),
      noShuffle,
    );
    // Les rangs repartent de 1, et le texte n'est plus dans l'ordre attendu.
    expect(data.filled_answer_list?.map((a) => a.order_by)).toEqual([1, 2, 3]);
    expect(data.filled_answer_list?.map((a) => a.text)).not.toEqual(['un', 'deux', 'trois']);
  });

  it('pose la colonne de gauche et mélange les étiquettes de droite', () => {
    const data = initialCopyData(
      grain({
        id: 1,
        grain_type_id: GRAIN.ASSOCIATION,
        grain_data: {
          custom_data: {
            show_left_column: true,
            correct_answer_list: [
              { text_left: 'France', text_right: 'Paris' },
              { text_left: 'Italie', text_right: 'Rome' },
            ],
          },
        },
      }),
      noShuffle,
    );
    expect(data.filled_answer_list?.map((a) => a.text_left)).toEqual(['France', 'Italie']);
    expect(data.filled_answer_list?.every((a) => a.text_right === null)).toBe(true);
    expect(data.possible_answer_list).toHaveLength(2);
    expect(data.show_left_column).toBe(true);
  });

  it('met les deux colonnes dans un même tas quand la gauche est masquée', () => {
    const data = initialCopyData(
      grain({
        id: 1,
        grain_type_id: GRAIN.ASSOCIATION,
        grain_data: {
          custom_data: {
            show_left_column: false,
            correct_answer_list: [{ text_left: 'France', text_right: 'Paris' }],
          },
        },
      }),
      noShuffle,
    );
    expect(data.filled_answer_list).toEqual([{ text_left: null, text_right: null }]);
    expect(data.all_possible_answer?.map((a) => a.item).sort()).toEqual(['France', 'Paris']);
  });

  it('vide les zones d’un grain à zones', () => {
    const data = initialCopyData(
      grain({
        id: 1,
        grain_type_id: GRAIN.TEXT_TO_FILL,
        grain_data: { custom_data: { zones: [{ id: 0, answer: 'bleu', options: [] }] } },
      }),
    );
    expect(data.zones).toEqual([{ id: 0, answer: '', options: [] }]);
  });
});

describe('buildGrainsCustomCopyData', () => {
  it('ne prépare que les questions, pas les énoncés', () => {
    const result = buildGrainsCustomCopyData([
      grain({ id: 1, grain_type_id: GRAIN.STATEMENT }),
      grain({
        id: 2,
        grain_type_id: GRAIN.SIMPLE_ANSWER,
        grain_data: { title: 'Fleuve', max_score: 3, statement: '<p>?</p>' },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].grain_id).toBe(2);
    expect(result[0].grain_copy_data.title).toBe('Fleuve');
    expect(result[0].grain_copy_data.max_score).toBe(3);
  });
});

describe('buildScheduleBody', () => {
  const subject: Subject = { id: 7, title: 'Fractions', owner: 'prof', folder_id: null };
  const grains = [
    grain({
      id: 1,
      grain_type_id: GRAIN.QCM,
      grain_data: { custom_data: { correct_answer_list: [{ text: 'a', isChecked: true }] } },
    }),
  ];
  const recipients = buildScheduledAt([{ _id: 'g1', name: '4ème-1' }], []);

  it('traduit les options d’un sujet à échéance', () => {
    const body = buildScheduleBody(
      subject,
      {
        mode: 'classic',
        beginDate: new Date(2026, 2, 18),
        beginTime: '08:00',
        dueDate: new Date(2026, 2, 20),
        dueTime: '23:59',
        allowStudentsToUpdateCopy: true,
        forbidTraining: true,
        randomDisplay: true,
        estimatedDuration: '30',
      },
      recipients,
      grains,
      noShuffle,
    );
    expect(body.beginDate).toBe('2026-03-18T08:00:00.000Z');
    expect(body.dueDate).toBe('2026-03-20T23:59:00.000Z');
    // « L'élève peut améliorer sa copie » = PAS un envoi unique.
    expect(body.isOneShotSubmit).toBe(false);
    // « Interdire l'entraînement » = entraînement NON permis.
    expect(body.isTrainingPermitted).toBe(false);
    expect(body.isTrainingMode).toBe(false);
    expect(body.randomDisplay).toBe(true);
    expect(body.grainsCustomCopyData).toHaveLength(1);
  });

  it('place les bornes à l’époque en mode entraînement', () => {
    const body = buildScheduleBody(
      subject,
      {
        mode: 'training',
        beginDate: new Date(2026, 2, 18),
        beginTime: '08:00',
        dueDate: new Date(2026, 2, 20),
        dueTime: '23:59',
      },
      recipients,
      grains,
      noShuffle,
    );
    // C'est ainsi que l'ancienne IHM signale « pas d'échéance ».
    expect(body.beginDate).toBe('1970-01-01T00:00:00.000Z');
    expect(body.dueDate).toBe('1970-01-01T00:00:00.000Z');
    expect(body.isTrainingMode).toBe(true);
    expect(body.isOneShotSubmit).toBe(false);
    expect(body.isTrainingPermitted).toBe(false);
  });
});

describe('buildSimpleScheduleBody', () => {
  it('porte les trois dates et rien d’autre', () => {
    const body = buildSimpleScheduleBody(
      { id: 7, title: 'Devoir', owner: 'prof', folder_id: null },
      {
        mode: 'classic',
        beginDate: new Date(2026, 2, 18),
        beginTime: '08:00',
        dueDate: new Date(2026, 2, 20),
        dueTime: '23:59',
        correctedDate: new Date(2026, 2, 21),
        correctedTime: '09:00',
      },
      buildScheduledAt([], [{ _id: 'u1', name: 'Léa' }]),
    );
    expect(Object.keys(body).sort()).toEqual([
      'beginDate',
      'correctedDate',
      'dueDate',
      'scheduledAt',
      'subjectTitle',
    ]);
    expect(body.correctedDate).toBe('2026-03-21T09:00:00.000Z');
  });
});

describe('shuffle', () => {
  it('garde les mêmes éléments', () => {
    const items = [1, 2, 3, 4];
    expect(shuffle(items, noShuffle).sort()).toEqual(items);
  });

  it('ne modifie pas la liste d’origine', () => {
    const items = [1, 2, 3];
    shuffle(items, noShuffle);
    expect(items).toEqual([1, 2, 3]);
  });
});
