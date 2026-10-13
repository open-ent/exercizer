import { describe, expect, it } from 'vitest';

import { catalogSearchParams } from './api';
import {
  canManageCatalogSubject,
  groupLevels,
  isCatalogAudience,
  isPublishable,
  labelsOf,
  pageCount,
  sortDisciplines,
  toggleId,
} from './catalog';
import { CatalogDiscipline, CatalogLevel } from './types';

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
