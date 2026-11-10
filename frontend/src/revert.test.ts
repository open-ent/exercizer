import { describe, expect, it, vi } from 'vitest';

import { GRAIN } from './grains';
import { diffSnapshot, isEmptyDiff, RevertApi, revertToSnapshot } from './revert';
import { Grain, Section } from './types';

const grain = (id: number, order_by: number, section_id: number | null = null, title = `Q${id}`): Grain => ({
  id,
  subject_id: 1,
  grain_type_id: GRAIN.QCM,
  order_by,
  section_id,
  grain_data: { title, max_score: 1 },
});

const section = (id: number, order_by: number, title = `S${id}`): Section => ({
  id,
  subject_id: 1,
  title,
  description: null,
  order_by,
});

function fakeApi(): RevertApi & { calls: string[] } {
  const calls: string[] = [];
  let nextId = 100;
  return {
    calls,
    createGrain: vi.fn(async (g) => {
      calls.push(`createGrain:${g.grain_data.title}:${g.section_id ?? '-'}`);
      return { id: nextId++ };
    }),
    updateGrain: vi.fn(async (g) => void calls.push(`updateGrain:${g.id}:${g.order_by}`)),
    removeGrains: vi.fn(async (_s, ids) => void calls.push(`removeGrains:${ids.join(',')}`)),
    createSection: vi.fn(async (_s, s) => {
      calls.push(`createSection:${s.title}`);
      return section(nextId++, 0, s.title);
    }),
    updateSection: vi.fn(async (s) => void calls.push(`updateSection:${s.id}:${s.title}`)),
    removeSection: vi.fn(async (_s, id, withGrains) => void calls.push(`removeSection:${id}:${withGrains}`)),
    saveStructure: vi.fn(async (_s, structure) => void calls.push(`saveStructure:${JSON.stringify(structure)}`)),
  };
}

describe('diffSnapshot', () => {
  it('ne voit rien quand le sujet est intact, quel que soit l’ordre des clés', () => {
    const before = { grains: [grain(1, 1)], sections: [] };
    const reordered = { ...grain(1, 1), grain_data: { max_score: 1, title: 'Q1' } };
    expect(isEmptyDiff(diffSnapshot(before, [reordered], []))).toBe(true);
  });

  it('classe ajouts, suppressions, modifications et déplacements', () => {
    const before = { grains: [grain(1, 1), grain(2, 2), grain(3, 3)], sections: [] };
    const now = [grain(3, 1), grain(1, 2, null, 'Q1 modifiée'), grain(4, 3)];
    const diff = diffSnapshot(before, now, []);
    expect(diff.addedGrains.map((g) => g.id)).toEqual([4]);
    expect(diff.removedGrains.map((g) => g.id)).toEqual([2]);
    // La version d'ORIGINE, celle qu'on réécrira.
    expect(diff.modifiedGrains).toEqual([grain(1, 1)]);
    expect(diff.reordered).toBe(true);
  });

  it('ne compte pas comme déplacement le seul trou laissé par une suppression', () => {
    const before = { grains: [grain(1, 1), grain(2, 2), grain(3, 3)], sections: [] };
    const diff = diffSnapshot(before, [grain(1, 1), grain(3, 2)], []);
    expect(diff.reordered).toBe(false);
    expect(diff.removedGrains.map((g) => g.id)).toEqual([2]);
  });

  it('voit un grain changé de partie et une partie renommée', () => {
    const before = { grains: [grain(1, 1, 10), grain(2, 2, 11)], sections: [section(10, 1), section(11, 2)] };
    const diff = diffSnapshot(before, [grain(1, 1, 10), grain(2, 2, 10)], [section(10, 1, 'Renommée'), section(11, 2)]);
    expect(diff.reordered).toBe(true);
    expect(diff.modifiedSections).toEqual([section(10, 1)]);
    expect(diff.modifiedGrains).toEqual([]);
  });
});

describe('revertToSnapshot', () => {
  it('sujet sans partie : supprime, recrée, réécrit et remet les rangs', async () => {
    const api = fakeApi();
    const before = { grains: [grain(1, 1), grain(2, 2), grain(3, 3)], sections: [] };
    const now = [grain(3, 1), grain(1, 2, null, 'Q1 modifiée'), grain(4, 3)];
    await revertToSnapshot(api, 1, before, now, []);
    expect(api.calls).toEqual([
      'removeGrains:4',
      'createGrain:Q2:-',
      // Q1 repart avec son contenu ET son rang d'origine…
      'updateGrain:1:1',
      // … Q3 n'a bougé que de rang.
      'updateGrain:3:3',
    ]);
    expect(api.saveStructure).not.toHaveBeenCalled();
  });

  it('sujet à parties : recrée la partie avant ses grains, puis rétablit l’arbre avec les nouveaux identifiants', async () => {
    const api = fakeApi();
    const before = {
      grains: [grain(1, 1, null), grain(2, 2, 10), grain(3, 3, 11)],
      sections: [section(10, 1), section(11, 2)],
    };
    // Partie 11 supprimée avec sa question, partie 12 ajoutée, grain 1 rangé dans la partie 12.
    const now = [grain(2, 1, 10), grain(1, 2, 12), grain(5, 3, 12)];
    await revertToSnapshot(api, 1, before, now, [section(10, 1), section(12, 2)]);
    expect(api.calls).toEqual([
      'removeGrains:5',
      'removeSection:12:false',
      'createSection:S11',
      'createGrain:Q3:100',
      'saveStructure:{"ungrouped":[1],"sections":[{"id":10,"grainIds":[2]},{"id":100,"grainIds":[101]}]}',
    ]);
  });

  it('revient à un sujet sans partie quand la première partie a été créée pendant l’édition', async () => {
    const api = fakeApi();
    const before = { grains: [grain(1, 1), grain(2, 2)], sections: [] };
    await revertToSnapshot(api, 1, before, [grain(1, 1, 10), grain(2, 2, 10)], [section(10, 1)]);
    expect(api.calls).toEqual([
      'removeSection:10:false',
      'saveStructure:{"ungrouped":[1,2],"sections":[]}',
    ]);
  });
});
