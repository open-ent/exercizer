import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseGrainCopies, parseGrains, updateGrain, updateGrainCopy } from './api';
import type { Grain, GrainCopy } from './types';

afterEach(() => vi.unstubAllGlobals());

const grain = (data: unknown) => ({ id: 1, subject_id: 2, grain_type_id: 4, order_by: 1, grain_data: data }) as unknown as Grain;
const grainCopy = (data: unknown) => ({ id: 1, subject_copy_id: 2, grain_type_id: 4, grain_scheduled_id: 3, order_by: 1, grain_copy_data: data }) as unknown as GrainCopy;

describe('données illisibles', () => {
  it('un grain au JSON illisible est marqué, affiché vide', () => {
    const [g] = parseGrains([grain('{pas du json')]);
    expect(g.unreadable).toBe(true);
    expect(g.grain_data).toEqual({});
  });
  it('un grain lisible n’est pas marqué (objet ou chaîne JSON)', () => {
    expect(parseGrains([grain({ title: 'A' })])[0].unreadable).toBeUndefined();
    expect(parseGrains([grain('{"title":"A"}')])[0]).toMatchObject({ grain_data: { title: 'A' } });
    expect(parseGrains([grain('{"title":"A"}')])[0].unreadable).toBeUndefined();
  });
  it('une copie de grain au JSON illisible est marquée, une lisible non', () => {
    expect(parseGrainCopies([grainCopy('{"')])[0]).toMatchObject({ unreadable: true, grain_copy_data: {} });
    expect(parseGrainCopies([grainCopy('{"title":"Q"}')])[0].unreadable).toBeUndefined();
  });
  it('aucune écriture sur une donnée illisible : refus sans appel réseau', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(updateGrainCopy({ ...grainCopy({}), unreadable: true })).rejects.toThrow('unreadable');
    await expect(updateGrain({ ...grain({}), unreadable: true })).rejects.toThrow('unreadable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
