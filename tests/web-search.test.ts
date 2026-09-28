import { expect, it } from 'vitest';
import { searchConfig } from '../src/main/web-search';
it('uses keyless Exa by default and enables only search and readable content tools', () => {
  const config = searchConfig(false);
  expect(config.provider).toBe('exa');
  expect(config.workflow).toBe('none');
  expect(config.tools.sourceCheck.enabled).toBe(false);
  expect(config.fetch.allowedModes).toEqual(['readable']);
});
it('uses Tavily when configured without persisting the credential', () => {
  const config = searchConfig(true);
  expect(config.provider).toBe('tavily');
  expect(config.tavilyApiKey).toBe('$VITRIP_TAVILY_API_KEY');
});
it('loads the real packaged extension with no unrelated extensions or terminal workflow', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { configureWebSearch, loadWebSearch } = await import('../src/main/web-search');
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-web-'));
  try {
    await configureWebSearch(dir, 'test-secret-never-write');
    expect(await readFile(join(dir, 'web-search.json'), 'utf8')).not.toContain(
      'test-secret-never-write',
    );
    const result = await loadWebSearch(dir, new AbortController().signal, () => {});
    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    expect([...result.extensions[0].tools.keys()].sort()).toEqual([
      'fetch_content',
      'get_search_content',
      'web_enable',
      'web_search',
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
