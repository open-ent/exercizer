// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedSave } from './useDebouncedSave';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Api = ReturnType<typeof useDebouncedSave<string>>;

let root: Root;
let api: Api;
let container: HTMLElement;

function mount(save: (v: string) => Promise<unknown>) {
  function Harness() {
    api = useDebouncedSave(save, 100);
    return null;
  }
  act(() => root.render(createElement(Harness)));
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('enregistrement différé', () => {
  it('enregistre après le délai et reste sans échec', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    mount(save);
    act(() => api.schedule('a', 'v1'));
    expect(api.pending).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(save).toHaveBeenCalledWith('v1');
    expect(api.pending).toBe(false);
    expect(api.failed).toBe(false);
  });

  it('un envoi refusé n’est pas présenté comme réussi : failed, puis retry renvoie la valeur', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('500')).mockResolvedValue(undefined);
    mount(save);
    act(() => api.schedule('a', 'v1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(api.failed).toBe(true);
    await act(async () => {
      await api.retry();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('v1');
    expect(api.failed).toBe(false);
  });

  it('retry qui échoue encore : l’erreur remonte et failed reste vrai', async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'));
    mount(save);
    act(() => api.schedule('a', 'v1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await act(async () => {
      await expect(api.retry()).rejects.toThrow('offline');
    });
    expect(api.failed).toBe(true);
  });

  it('flush relance l’erreur (« Rendre » ne part pas sur des réponses non enregistrées)', async () => {
    const save = vi.fn().mockRejectedValue(new Error('403'));
    mount(save);
    act(() => api.schedule('a', 'v1'));
    await act(async () => {
      await expect(api.flush()).rejects.toThrow('403');
    });
    expect(api.failed).toBe(true);
  });

  it('une saisie plus récente remplace la valeur échouée', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('500')).mockResolvedValue(undefined);
    mount(save);
    act(() => api.schedule('a', 'v1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    act(() => api.schedule('a', 'v2'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(save).toHaveBeenLastCalledWith('v2');
    expect(api.failed).toBe(false);
  });
});
