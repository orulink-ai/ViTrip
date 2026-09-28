import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { settingsSchema } from '../src/shared/schemas';
import { redactSettings } from '../src/shared/policy';
import { jevEvaluate } from '../src/main/jev-client';
import { rankCandidates, searchLocal } from '../src/main/jev-search';
const settings = {
  baseURL: 'https://example.com/v1',
  model: 'test',
  apiKey: '',
  jevApiKey: 'secret',
};
afterEach(() => vi.unstubAllGlobals());
it('preserves experimental switches without exposing the existing key', () => {
  const experiments = { browser: true, webSearch: true, localSearch: false };
  const parsed = settingsSchema.parse({ ...settings, jevExperiments: experiments });
  expect(parsed.jevExperiments).toEqual(experiments);
  expect(redactSettings({ ...settings, ...parsed })).toMatchObject({
    jevExperiments: experiments,
    hasJevKey: true,
  });
  expect(JSON.stringify(redactSettings({ ...settings, ...parsed }))).not.toContain('secret');
});
it('uses OpenRouter System One and rejects malformed or missing ranking decisions', async () => {
  const fetch = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ answers: { c0: { type: 'noul', noul: 0.8 } } })),
  );
  vi.stubGlobal('fetch', fetch);
  const ranked = await rankCandidates(
    'beach',
    [{ id: 'a', text: 'beach' }],
    settings,
    new AbortController().signal,
  );
  expect(ranked[0]).toMatchObject({ id: 'a', score: 0.8 });
  expect(fetch.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/systemone');
  await expect(
    rankCandidates(
      'q',
      [
        { id: 'a', text: 'a' },
        { id: 'b', text: 'b' },
      ],
      settings,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});
it('does not disclose provider response bodies or call without credentials', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('secret provider body', { status: 401 })),
  );
  await expect(jevEvaluate({}, {}, settings, new AbortController().signal)).rejects.toThrow(
    'HTTP 401',
  );
  await expect(
    jevEvaluate({}, {}, { ...settings, jevApiKey: '' }, new AbortController().signal),
  ).rejects.toThrow('OpenRouter');
});
it('searches actual code and markdown with source lines, excluding secrets and symlinks', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'jev-local-'));
  try {
    await writeFile(path.join(dir, 'guide.md'), '# Kyoto\nA quiet beach\n');
    await writeFile(path.join(dir, 'main.ts'), 'export const beach = true;\n');
    await writeFile(path.join(dir, '.env'), 'beach=private');
    await symlink(path.join(dir, '.env'), path.join(dir, 'leak.md'));
    const sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        sent.push(init.body);
        return new Response(
          JSON.stringify({
            answers: Object.fromEntries(
              Object.keys(body.questions).map((id) => [id, { type: 'noul', noul: 0.9 }]),
            ),
          }),
        );
      }),
    );
    const result = await searchLocal(
      { query: 'beach', path: dir },
      settings,
      new AbortController().signal,
    );
    expect(result.results.map((r) => path.basename(r.path))).toEqual(
      expect.arrayContaining(['guide.md', 'main.ts']),
    );
    expect(result.results.every((r) => r.startLine > 0)).toBe(true);
    expect(sent.join('')).not.toContain('private');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
