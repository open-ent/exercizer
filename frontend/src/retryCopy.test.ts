import { afterEach, describe, expect, it, vi } from 'vitest';

import { retryCopy } from './api';
import type { SubjectCopy } from './types';

afterEach(() => vi.unstubAllGlobals());

describe('retryCopy', () => {
  it('repasse la copie « commencée », remet le grain à zéro et recrée les grains', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}', json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await retryCopy({ id: 7, subject_scheduled_id: 3, has_been_started: false } as unknown as SubjectCopy);
    const calls = fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${url}`);
    expect(calls).toContain('PUT /exercizer/subject-copy/report');
    expect(calls).toContain('POST /exercizer/subject-copy/7/last-grain/-1');
    expect(calls).toContain('POST /exercizer/subject-scheduled/3/subject-copy/7/recreate-grains');
    const report = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/report'))!;
    expect(JSON.parse((report[1] as RequestInit).body as string).has_been_started).toBe(true);
  });
});
