import { describe, expect, it } from 'vitest';

import { catalogSearchParams } from './api';
import {
  buildLevelTree,
  contextLevels,
  programmesInContext,
  referentialInContext,
  buildProgrammeTree,
  canManageCatalogSubject,
  isObjective,
  nodeCriteria,
  programmeCoverage,
  parseOrg,
  resolveOrg,
  visibleProgrammeNodes,
  withOutlineLeaves,
  groupLevels,
  isCatalogAudience,
  isClassified,
  isPublishable,
  labelsOf,
  pageCount,
  sortDisciplines,
  toggleId,
} from './catalog';
import { CatalogDiscipline, CatalogFacet, CatalogLevel, LevelGroup, Programme, ProgrammeNode } from './types';

const level = (id: number, code: string, rank: number | null, group: CatalogLevel['level_group']) => ({
  id,
  code,
  label: `exercizer.subject.lesson.level${id}`,
  rank,
  level_group: group,
});

describe('groupLevels', () => {
  it('range les niveaux par groupe, dans l’ordre de la scolarité', () => {
    const groups = groupLevels([
      level(1, '6E', 20, 'college'),
      level(25, 'CE1', 11, 'elementaire'),
      level(24, 'CP', 10, 'elementaire'),
      level(7, '2NDE', 30, 'lycee'),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['elementaire', 'college', 'lycee']);
    expect(groups[0].levels.map((l) => l.code)).toEqual(['CP', 'CE1']);
  });

  it('garde à la fin un niveau sans groupe (ajout manuel au référentiel)', () => {
    const groups = groupLevels([level(99, 'X', null, null), level(24, 'CP', 10, 'elementaire')]);
    expect(groups.map((g) => g.group)).toEqual(['elementaire', 'other']);
  });
});

describe('sortDisciplines', () => {
  const discipline = (id: number, code: string, label: string): CatalogDiscipline => ({ id, code, label });
  it('trie par libellé traduit, « Autre » en dernier', () => {
    const labels: Record<string, string> = { a: 'Mathématiques', b: 'Autre', c: 'Français', d: 'Éducation musicale' };
    const sorted = sortDisciplines(
      [discipline(1, 'MATHEMATIQUES', 'a'), discipline(2, 'AUTRE', 'b'), discipline(3, 'FRANCAIS', 'c'), discipline(4, 'EDUCATION_MUSICALE', 'd')],
      (key) => labels[key],
    );
    expect(sorted.map((d) => d.code)).toEqual(['EDUCATION_MUSICALE', 'FRANCAIS', 'MATHEMATIQUES', 'AUTRE']);
  });
});

describe('toggleId / labelsOf', () => {
  it('ajoute puis retire', () => {
    expect(toggleId([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleId([1, 2, 3], 2)).toEqual([1, 3]);
  });
  it('rend les libellés dans l’ordre du référentiel et ignore l’inconnu', () => {
    const referential = [
      { id: 24, label: 'cp' },
      { id: 25, label: 'ce1' },
    ];
    expect(labelsOf([25, 24, 99], referential, (k) => k.toUpperCase())).toEqual(['CP', 'CE1']);
  });
});

describe('isPublishable', () => {
  it('exige au moins un niveau et une matière', () => {
    expect(isPublishable({ level_ids: [1], discipline_ids: [] })).toBe(false);
    expect(isPublishable({ level_ids: [], discipline_ids: [1] })).toBe(false);
    expect(isPublishable({ level_ids: [1], discipline_ids: [1] })).toBe(true);
  });
});

describe('isClassified', () => {
  it('un niveau, une matière ou un énoncé suffit', () => {
    expect(isClassified({ level_ids: [], discipline_ids: [], alignment_ids: [] })).toBe(false);
    expect(isClassified({ level_ids: [], discipline_ids: [] })).toBe(false);
    expect(isClassified({ level_ids: [1], discipline_ids: [] })).toBe(true);
    expect(isClassified({ level_ids: [], discipline_ids: [2] })).toBe(true);
    expect(isClassified({ level_ids: [], discipline_ids: [], alignment_ids: ['c3-mat'] })).toBe(true);
  });
});

describe('canManageCatalogSubject', () => {
  it('auteur ou modérateur', () => {
    expect(canManageCatalogSubject({ owner: 'u1' }, 'u1', false)).toBe(true);
    expect(canManageCatalogSubject({ owner: 'u1' }, 'u2', false)).toBe(false);
    expect(canManageCatalogSubject({ owner: 'u1' }, 'u2', true)).toBe(true);
    expect(canManageCatalogSubject({ owner: 'u1' }, undefined, false)).toBe(false);
  });
});

describe('catalogSearchParams', () => {
  it('omet les critères vides', () => {
    expect(catalogSearchParams({ q: '  ', levels: [], limit: 24, offset: 0 })).toBe('limit=24&offset=0');
  });
  it('sérialise les listes d’id', () => {
    expect(catalogSearchParams({ q: 'fractions', levels: [24, 25], disciplines: [11] })).toBe(
      'q=fractions&levels=24%2C25&disciplines=11',
    );
  });
});

describe('pageCount', () => {
  it('au moins une page', () => {
    expect(pageCount(0, 24)).toBe(1);
    expect(pageCount(25, 24)).toBe(2);
  });
});

describe('isCatalogAudience', () => {
  it('écarte élèves et parents', () => {
    expect(isCatalogAudience('ENSEIGNANT')).toBe(true);
    expect(isCatalogAudience('PERSEDUCNAT')).toBe(true);
    expect(isCatalogAudience('ELEVE')).toBe(false);
    expect(isCatalogAudience('PERSRELELEVE')).toBe(false);
  });
});

describe('catalogSearchParams (programme)', () => {
  it('ajoute le programme et le nœud, et `direct` seulement s’il est demandé', () => {
    expect(catalogSearchParams({ programme: 'doc', node: 'n1', direct: true })).toBe(
      'programme=doc&node=n1&direct=true',
    );
    expect(catalogSearchParams({ programme: 'doc', node: 'n1' })).toBe('programme=doc&node=n1');
    // Un nœud sans programme n'a pas de sens : rien n'est envoyé.
    expect(catalogSearchParams({ node: 'n1' })).toBe('');
  });
});

describe('parseOrg / resolveOrg', () => {
  const programmes = [
    { id: 'vide', title: 'Vide', version: null, aligned: 0, levels: [] },
    { id: 'p1d', title: 'Primaire', version: '2026', aligned: 19, levels: ['maternelle', 'elementaire'] as LevelGroup[] },
  ];

  it('rejette les valeurs inconnues', () => {
    expect(parseOrg('level')).toBe('level');
    expect(parseOrg('programme:p1d')).toBe('programme:p1d');
    expect(parseOrg('programme:')).toBeNull();
    expect(parseOrg('n’importe quoi')).toBeNull();
  });

  it('préfère l’URL, puis la préférence, puis le premier programme qui a des exercices', () => {
    expect(resolveOrg('discipline', 'level', programmes)).toBe('discipline');
    expect(resolveOrg(null, 'level', programmes)).toBe('level');
    expect(resolveOrg(null, null, programmes)).toBe('programme:p1d');
    expect(resolveOrg(null, null, [])).toBe('level');
  });

  it('ignore un programme qui n’est plus publié', () => {
    expect(resolveOrg('programme:retire', 'programme:retire', programmes)).toBe('programme:p1d');
  });
});

const programmeNode = (id: string, parent: string | null, count = 0, levels = ['CP']): ProgrammeNode => ({
  id,
  parent,
  seq: null,
  code: id.toUpperCase(),
  label: `Énoncé ${id}`,
  type: null,
  levels,
  count,
});

describe('buildProgrammeTree', () => {
  it('reconstruit l’arbre et remonte à la racine un énoncé dont le parent manque', () => {
    const tree = buildProgrammeTree([
      programmeNode('c2', null, 3),
      programmeNode('mat', 'c2', 3),
      programmeNode('orphelin', 'absent', 1),
    ]);
    expect(tree.map((item) => item.id)).toEqual(['c2', 'orphelin']);
    expect(tree[0].children.map((item) => [item.id, item.count])).toEqual([['mat', 3]]);
  });
});

describe('programmeCoverage', () => {
  const typed = (id: string, parent: string | null, type: string, count = 0, levels = ['CE1']) => ({
    ...programmeNode(id, parent, count, levels),
    type,
  });
  // Cycle › Enseignement › Domaine › (Domaine) › Sous-domaine › objectifs, plus un attendu hors domaine.
  const nodes = [
    typed('c2', null, 'Cycle', 2),
    typed('mat', 'c2', 'Enseignement', 2),
    typed('calc', 'mat', 'Domaine', 2),
    typed('calc.sub', 'calc', 'Domaine', 2),
    typed('pose', 'calc.sub', 'Sous-domaine', 2),
    typed('sous', 'pose', 'Objectif d’apprentissage', 2),
    typed('add', 'pose', 'Objectif d’apprentissage', 0),
    typed('cp', 'pose', 'Objectif d’apprentissage', 0, ['CP']),
    typed('geo', 'mat', 'Domaine', 0),
    typed('fig', 'geo', 'Objectif d’apprentissage', 0),
    typed('att', 'mat', 'Attendu de fin de cycle', 0),
  ];

  it('compte les objectifs couverts sous le domaine le plus haut, dans l’ordre du programme', () => {
    expect(
      programmeCoverage(nodes, null).map((row) => [row.id, row.covered, row.objectives, row.exercises, row.path]),
    ).toEqual([
      ['calc', 1, 3, 2, ['Énoncé c2', 'Énoncé mat']],
      ['geo', 0, 1, 0, ['Énoncé c2', 'Énoncé mat']],
      // Hors de tout domaine : rangé sous son enseignement.
      ['mat', 0, 1, 2, ['Énoncé c2']],
    ]);
  });

  it('ne garde que les objectifs des niveaux demandés', () => {
    expect(programmeCoverage(nodes, ['CP']).map((row) => [row.id, row.covered, row.objectives])).toEqual([
      ['calc', 0, 1],
    ]);
  });

  it('isObjective écarte les énoncés de structure', () => {
    expect(isObjective('Domaine')).toBe(false);
    expect(isObjective(null)).toBe(false);
    expect(isObjective('Attendu de fin de cycle')).toBe(true);
  });
});

describe('visibleProgrammeNodes', () => {
  const nodes = [
    programmeNode('c1', null, 0, ['PS', 'MS']),
    programmeNode('c2', null, 0, ['CP', 'CE1']),
    { ...programmeNode('sous', 'c2', 0, ['CE1']), label: 'Poser une soustraction' },
  ];

  it('renvoie null sans recherche ni niveau : tout l’arbre', () => {
    expect(visibleProgrammeNodes(nodes, '', [])).toBeNull();
  });

  it('garde les correspondances (sans accents) et leurs ancêtres', () => {
    expect([...(visibleProgrammeNodes(nodes, 'SOUSTRACTION', []) ?? [])].sort()).toEqual(['c2', 'sous']);
  });

  it('filtre par niveau', () => {
    expect([...(visibleProgrammeNodes(nodes, '', ['MS']) ?? [])]).toEqual(['c1']);
  });
});

describe('rangements par niveau et par matière', () => {
  const levels = [level(24, 'CP', 10, 'elementaire'), level(25, 'CE1', 11, 'elementaire')];
  const disciplines: CatalogDiscipline[] = [{ id: 11, code: 'MATHEMATIQUES', label: 'maths' }];
  const facets: CatalogFacet[] = [
    { kind: 'group', level_group: 'elementaire', level_id: null, discipline_id: null, count: 2 },
    { kind: 'level', level_group: null, level_id: 24, discipline_id: null, count: 2 },
    { kind: 'level_discipline', level_group: null, level_id: 24, discipline_id: 11, count: 2 },
    { kind: 'discipline', level_group: null, level_id: null, discipline_id: 11, count: 2 },
  ];

  it('construit groupe › niveau › matière sans les branches vides', () => {
    const tree = buildLevelTree({ levels, disciplines }, facets, (key) => key);
    expect(tree.map((item) => item.id)).toEqual(['g:elementaire']);
    expect(tree[0].children.map((item) => item.id)).toEqual(['l:24']);
    expect(tree[0].children[0].children.map((item) => [item.id, item.count])).toEqual([['l:24|d:11', 2]]);
  });

  it('traduit un nœud en critères de recherche', () => {
    expect(nodeCriteria('g:elementaire', levels)).toEqual({ levels: [24, 25], disciplines: [] });
    expect(nodeCriteria('d:11|l:25', levels)).toEqual({ levels: [25], disciplines: [11] });
    expect(nodeCriteria(null, levels)).toEqual({ levels: [], disciplines: [] });
  });
});

describe('withOutlineLeaves', () => {
  const tree = buildProgrammeTree([programmeNode('c2', null, 3), programmeNode('mat', 'c2', 3)]);

  it('pose une feuille d’attente sous une branche feuille non chargée', () => {
    const [c2] = withOutlineLeaves(tree, new Map(), '…', () => '');
    expect(c2.children[0].children.map((item) => item.kind)).toEqual(['loading']);
  });

  it('ajoute les exercices chargés, puis la suite d’une liste tronquée', () => {
    const loaded = new Map([['mat', { subjects: [{ id: 7, title: 'Soustraction' }], total: 3 }]]);
    const [c2] = withOutlineLeaves(tree, loaded, '…', (count) => `+${count}`);
    const leaves = c2.children[0].children;
    expect(leaves.map((item) => [item.kind, item.name])).toEqual([
      ['subject', 'Soustraction'],
      ['more', '+2'],
    ]);
    expect(leaves[0].subjectId).toBe(7);
  });
});

describe('contexte des niveaux', () => {
  const programmes: Programme[] = [
    { id: 'p1d', title: 'Primaire', version: null, aligned: 19, levels: ['maternelle', 'elementaire'] },
    { id: 'p2d', title: 'Collège', version: null, aligned: 0, levels: ['college'] },
  ];

  it('préfère les établissements au thème, et « tout afficher » lève le filtre', () => {
    const context = { schoolLevels: ['college' as LevelGroup], source: 'type' as const };
    expect(contextLevels(context, ['maternelle'], false)).toEqual(['college']);
    expect(contextLevels({ schoolLevels: [], source: 'none' }, ['maternelle', 'inconnu'], false)).toEqual([
      'maternelle',
    ]);
    expect(contextLevels(undefined, undefined, false)).toBeNull();
    expect(contextLevels(context, ['maternelle'], true)).toBeNull();
  });

  it('ne garde que les programmes du contexte, et celui qu’un lien désigne', () => {
    expect(programmesInContext(programmes, ['college']).map((p) => p.id)).toEqual(['p2d']);
    expect(programmesInContext(programmes, ['college'], 'p1d').map((p) => p.id)).toEqual(['p1d', 'p2d']);
    expect(programmesInContext(programmes, null)).toHaveLength(2);
  });

  it('réduit le référentiel aux niveaux du contexte', () => {
    const referential = {
      levels: [level(24, 'CP', 10, 'elementaire'), level(1, '6E', 20, 'college'), level(99, 'X', null, null)],
      disciplines: [],
    };
    expect(referentialInContext(referential, ['college']).levels.map((l) => l.code)).toEqual(['6E']);
    expect(referentialInContext(referential, null).levels).toHaveLength(3);
  });
});
