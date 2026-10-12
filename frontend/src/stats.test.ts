import { describe, expect, it } from 'vitest';

import { GRAIN } from './grains';
import {
  answerText,
  buildStats,
  csvScore,
  displayScore,
  fullCsv,
  scoreLevel,
  simpleCsv,
  CsvLabels,
} from './stats';
import { GrainCopy, GrainScheduled, SubjectCopy, SubjectScheduled } from './types';

const scheduled: SubjectScheduled = { id: 10, subject_id: 100, owner: 'prof', title: 'Fractions' };

const reference: GrainScheduled[] = [
  {
    id: 1,
    subject_scheduled_id: 10,
    grain_type_id: GRAIN.STATEMENT,
    order_by: 1,
    grain_data: { custom_data: { statement: '<p>Lisez</p>' } },
  },
  {
    id: 3,
    subject_scheduled_id: 10,
    grain_type_id: GRAIN.QCM,
    order_by: 3,
    grain_data: {
      title: 'Capitale',
      max_score: 2,
      custom_data: {
        correct_answer_list: [
          { text: 'Paris', isChecked: true },
          { text: 'Lyon', isChecked: false },
        ],
      },
    },
  },
  {
    id: 2,
    subject_scheduled_id: 10,
    grain_type_id: GRAIN.SIMPLE_ANSWER,
    order_by: 2,
    grain_data: { title: 'Un demi', max_score: 1, custom_data: { correct_answer: '0,5' } },
  },
];

const copy = (over: Partial<SubjectCopy>): SubjectCopy => ({
  id: 1,
  subject_scheduled_id: 10,
  owner: 'eleve',
  ...over,
});

const grainCopy = (over: Partial<GrainCopy>): GrainCopy => ({
  id: 1,
  subject_copy_id: 1,
  grain_type_id: GRAIN.SIMPLE_ANSWER,
  grain_scheduled_id: 2,
  order_by: 2,
  grain_copy_data: {},
  ...over,
});

const copies = [
  copy({
    id: 1,
    owner_username: 'Léa',
    submitted_date: '2026-03-10T08:00:00Z',
    calculated_score: 3,
    final_score: 2.5,
  }),
  copy({
    id: 2,
    owner_username: 'Tom',
    submitted_date: '2026-03-10T09:00:00Z',
    calculated_score: 0,
    is_correction_on_going: true,
  }),
  copy({ id: 3, owner_username: 'Zoé' }),
];

const grainCopies = new Map<number, GrainCopy[]>([
  [
    1,
    [
      grainCopy({
        id: 11,
        subject_copy_id: 1,
        grain_copy_data: { custom_copy_data: { filled_answer: '0,5' } },
      }),
      grainCopy({
        id: 12,
        subject_copy_id: 1,
        grain_type_id: GRAIN.QCM,
        grain_scheduled_id: 3,
        final_score: 1.5,
        grain_copy_data: {
          custom_copy_data: {
            filled_answer_list: [
              { text: 'Paris', isChecked: true },
              { text: 'Lyon', isChecked: false },
            ],
          },
        },
      }),
    ],
  ],
  [
    2,
    [
      // Correction entamée : le score enregistré est conservé, même s'il contredit la réponse.
      grainCopy({
        id: 21,
        subject_copy_id: 2,
        calculated_score: 0,
        grain_copy_data: { custom_copy_data: { filled_answer: '0,5' } },
      }),
    ],
  ],
]);

const labels: CsvLabels = {
  subjectTitle: 'Titre',
  subjectType: 'Type',
  studentName: 'Élève',
  autoScore: 'Auto',
  finalScore: 'Final',
  comment: 'Commentaire',
  average: 'Moyenne',
  interactive: 'Interactif',
  questionType: 'Type de question',
  noAnswer: 'Aucune réponse',
  grainTypeName: (id) => `type${id}`,
};

describe('buildStats', () => {
  const stats = buildStats(copies, grainCopies, reference);

  it('ne garde que les questions, dans l’ordre du sujet', () => {
    expect(stats.questions.map((grain) => grain.id)).toEqual([2, 3]);
  });

  it('ignore les copies non rendues', () => {
    expect([...stats.matrix.keys()]).toEqual([1, 2]);
  });

  it('recalcule le score automatique tant que la correction n’est pas entamée', () => {
    expect(stats.matrix.get(1)?.get(2)).toEqual({ score: 1, calculated: 1, changed: false });
  });

  it('garde le score enregistré une fois la correction entamée', () => {
    expect(stats.matrix.get(2)?.get(2)?.score).toBe(0);
  });

  it('retient la note de l’enseignant quand elle diffère du score automatique', () => {
    expect(stats.matrix.get(1)?.get(3)).toEqual({ score: 1.5, calculated: 2, changed: true });
  });

  it('moyenne chaque question sur les copies qui ont un score', () => {
    expect(stats.averages.get(2)).toBe(0.5);
    expect(stats.averages.get(3)).toBe(1.5);
  });

  it('moyenne les scores des copies rendues', () => {
    expect(stats.auto).toBe(1.5);
    expect(stats.final).toBe(2.5);
  });
});

describe('affichage', () => {
  it('colore une case selon le score', () => {
    expect(scoreLevel({ score: 2, calculated: 2, changed: false }, 2)).toBe('full');
    expect(scoreLevel({ score: 1, calculated: 1, changed: false }, 2)).toBe('partial');
    expect(scoreLevel({ score: 0, calculated: 0, changed: false }, 2)).toBe('none');
    expect(scoreLevel(undefined, 2)).toBe('empty');
  });

  it('affiche un entier tel quel et le reste sur deux décimales', () => {
    expect(displayScore(3)).toBe('3');
    expect(displayScore(1.5)).toBe('1.50');
    expect(displayScore(null)).toBe('-');
  });

  it('exporte tronqué, avec une virgule', () => {
    expect(csvScore(1.999)).toBe('1,99');
    expect(csvScore(2)).toBe('2');
    expect(csvScore(undefined)).toBe('');
  });
});

describe('exports', () => {
  const stats = buildStats(copies, grainCopies, reference);

  it('produit l’export simple, moyennes comprises', () => {
    const lines = simpleCsv(scheduled, copies, stats, labels).split('\r\n');
    expect(lines[0]).toBe('﻿Titre;Type;Élève;Q1>Un demi;Q2>Capitale;Auto;Final;Commentaire;');
    expect(lines[1]).toBe('Fractions;Interactif;Léa;1;1,5;3;2,5;;');
    expect(lines[3]).toBe('Fractions;Interactif;Zoé;;;;;;');
    expect(lines[4]).toBe('Moyenne;;;0,5;1,5;1,5;2,5;;');
  });

  it('produit l’export complet', () => {
    const lines = fullCsv(copies, grainCopies, stats, labels).split('\r\n');
    expect(lines[0]).toBe('﻿;Q1>Un demi;Q2>Capitale;');
    expect(lines[1]).toBe('Type de question;type4;type7;');
    expect(lines[2]).toBe('Léa;"0,5";"Paris');
  });

  it('retire les balises d’une réponse ouverte et signale l’absence de réponse', () => {
    const open = grainCopy({
      grain_type_id: GRAIN.OPEN_ANSWER,
      grain_copy_data: { custom_copy_data: { filled_answer: '<p>Bonjour</p>' } },
    });
    expect(answerText(open, 'Aucune')).toBe('Bonjour');
    expect(answerText(grainCopy({}), 'Aucune')).toBe('Aucune');
  });

  it('restitue une mise en ordre dans le rang donné par l’élève', () => {
    const order = grainCopy({
      grain_type_id: GRAIN.ORDER_BY,
      grain_copy_data: {
        custom_copy_data: {
          filled_answer_list: [
            { text: 'b', order_by: 2 },
            { text: 'a', order_by: 1 },
          ],
        },
      },
    });
    expect(answerText(order, 'Aucune')).toBe('a\r\nb\r\n');
  });
});
