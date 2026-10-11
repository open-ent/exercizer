import { describe, expect, it } from 'vitest';

import { GRAIN } from './grains';
import {
  flattenGroups,
  groupBySection,
  groupCopiesBySection,
  moveGrainAcross,
  moveGrainToSection,
  moveSection,
  rankAtEndOf,
  sectionMaxScore,
  sectionProgress,
  sectionScore,
  structurePayload,
} from './sections';
import { Grain, ScheduledSection, Section } from './types';

const grain = (id: number, order_by: number, section_id: number | null, max_score = 1): Grain => ({
  id,
  subject_id: 1,
  grain_type_id: GRAIN.QCM,
  order_by,
  section_id,
  grain_data: { title: `Q${id}`, max_score },
});

const section = (id: number, order_by: number): Section => ({
  id,
  subject_id: 1,
  title: `Partie ${id}`,
  order_by,
});

// Un énoncé hors section, puis Partie 10 (Q2, Q3) et Partie 20 (Q4).
const sections = [section(20, 2), section(10, 1)];
const grains = [
  { ...grain(1, 1, null), grain_type_id: GRAIN.STATEMENT },
  grain(3, 3, 10, 2),
  grain(2, 2, 10, 3),
  grain(4, 4, 20, 5),
];

const ids = (groups: ReturnType<typeof groupBySection>) =>
  groups.map((group) => [group.section?.id ?? null, group.grains.map((g) => g.id)]);

describe('groupBySection', () => {
  it('met le groupe hors section en tête, puis les sections dans leur ordre', () => {
    expect(ids(groupBySection(grains, sections))).toEqual([
      [null, [1]],
      [10, [2, 3]],
      [20, [4]],
    ]);
  });

  it('garde un groupe hors section vide, et traite une section inconnue comme hors section', () => {
    const lost = grain(9, 9, 999);
    expect(ids(groupBySection([grain(2, 1, 10), lost], [section(10, 1)]))).toEqual([
      [null, [9]],
      [10, [2]],
    ]);
  });

  it("d'un sujet sans section ne fait qu'un groupe", () => {
    expect(ids(groupBySection([grain(1, 2, null), grain(2, 1, null)], []))).toEqual([[null, [2, 1]]]);
  });
});

describe('flattenGroups', () => {
  it('renumérote de 1 à n section par section, et ne signale que ce qui change', () => {
    const groups = moveSection(groupBySection(grains, sections), 20, -1);
    const { grains: flat, sections: ordered, changed } = flattenGroups(groups);
    expect(flat.map((g) => [g.id, g.order_by, g.section_id])).toEqual([
      [1, 1, null],
      [4, 2, 20],
      [2, 3, 10],
      [3, 4, 10],
    ]);
    expect(ordered.map((s) => [s.id, s.order_by])).toEqual([
      [20, 1],
      [10, 2],
    ]);
    expect(changed.map((g) => g.id)).toEqual([4, 2, 3]);
  });
});

describe('structurePayload', () => {
  it("décrit l'arbre attendu par PUT /structure", () => {
    expect(structurePayload(groupBySection(grains, sections))).toEqual({
      ungrouped: [1],
      sections: [
        { id: 10, grainIds: [2, 3] },
        { id: 20, grainIds: [4] },
      ],
    });
  });
});

describe('moveSection', () => {
  it('déplace une section avec ses grains, sans jamais passer devant le groupe hors section', () => {
    const groups = groupBySection(grains, sections);
    expect(ids(moveSection(groups, 10, -1))).toEqual(ids(groups));
    expect(ids(moveSection(groups, 10, 1))).toEqual([
      [null, [1]],
      [20, [4]],
      [10, [2, 3]],
    ]);
    expect(ids(moveSection(groups, 20, 1))).toEqual(ids(groups));
  });
});

describe('moveGrainAcross', () => {
  const groups = groupBySection(grains, sections);

  it('permute deux grains à l’intérieur de leur section', () => {
    expect(ids(moveGrainAcross(groups, 2, 1))).toEqual([
      [null, [1]],
      [10, [3, 2]],
      [20, [4]],
    ]);
  });

  it('au bord, fait passer le grain dans la section voisine', () => {
    expect(ids(moveGrainAcross(groups, 3, 1))).toEqual([
      [null, [1]],
      [10, [2]],
      [20, [3, 4]],
    ]);
    expect(ids(moveGrainAcross(groups, 2, -1))).toEqual([
      [null, [1, 2]],
      [10, [3]],
      [20, [4]],
    ]);
  });

  it('ne bouge pas le tout premier ni le tout dernier grain au-delà du sujet', () => {
    expect(ids(moveGrainAcross(groups, 1, -1))).toEqual(ids(groups));
    expect(ids(moveGrainAcross(groups, 4, 1))).toEqual(ids(groups));
  });

  it('ne modifie pas les groupes reçus', () => {
    const before = ids(groups);
    moveGrainAcross(groups, 3, 1);
    expect(ids(groups)).toEqual(before);
  });
});

describe('moveGrainToSection', () => {
  it('range le grain à la fin de la section visée', () => {
    expect(ids(moveGrainToSection(groupBySection(grains, sections), 1, 10))).toEqual([
      [null, []],
      [10, [2, 3, 1]],
      [20, [4]],
    ]);
  });
});

describe('rankAtEndOf', () => {
  it('donne le dernier rang de la section, 0 si elle est vide', () => {
    const groups = groupBySection(grains, [...sections, section(30, 3)]);
    expect(rankAtEndOf(groups, 10)).toBe(3);
    expect(rankAtEndOf(groups, 30)).toBe(0);
  });
});

describe('barèmes et avancement', () => {
  it('somme le barème des seules questions d’une section', () => {
    expect(sectionMaxScore(grains)).toBe(10);
  });

  it('compte les questions répondues', () => {
    expect(sectionProgress(grains, (g) => g.id !== 3)).toEqual({ answered: 2, total: 3 });
  });

  it('fait le sous-total d’une correction (note finale, sinon calculée)', () => {
    const copies = [
      { grain_type_id: GRAIN.STATEMENT, final_score: 9, grain_copy_data: { max_score: 9 } },
      { grain_type_id: GRAIN.QCM, final_score: 1.5, calculated_score: 0, grain_copy_data: { max_score: 2 } },
      { grain_type_id: GRAIN.QCM, final_score: null, calculated_score: 1, grain_copy_data: { max_score: '3' } },
    ];
    expect(sectionScore(copies)).toEqual({ score: 2.5, max: 5 });
  });
});

describe('groupCopiesBySection', () => {
  const scheduled: ScheduledSection[] = [
    { id: 200, title: 'B', order_by: 2, grain_scheduled_ids: [13] },
    { id: 100, title: 'A', order_by: 1, grain_scheduled_ids: [11, 12] },
    { id: 300, title: 'Vide', order_by: 3, grain_scheduled_ids: [] },
  ];

  it('regroupe en gardant l’ordre reçu (mélange compris) et omet les sections vides', () => {
    const copies = [
      { id: 1, grain_scheduled_id: 10 },
      { id: 3, grain_scheduled_id: 12 },
      { id: 2, grain_scheduled_id: 11 },
      { id: 4, grain_scheduled_id: 13 },
    ];
    expect(
      groupCopiesBySection(copies, scheduled).map((group) => [
        group.section?.id ?? null,
        group.grains.map((g) => g.id),
      ]),
    ).toEqual([
      [null, [1]],
      [100, [3, 2]],
      [200, [4]],
    ]);
  });

  it("sans section, rend un seul groupe, sans section", () => {
    const copies = [{ id: 1, grain_scheduled_id: 10 }];
    expect(groupCopiesBySection(copies, [])).toEqual([{ section: null, grains: copies }]);
  });
});
