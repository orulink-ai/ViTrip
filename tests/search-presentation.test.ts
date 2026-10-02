import { expect, it } from 'vitest';
import { searchPresentation } from '../src/shared/search-presentation';
import type { ToolActivity } from '../src/shared/types';
const step: ToolActivity = {
  id: 'search',
  name: 'webSearch',
  input: '',
  output: '',
  status: 'complete',
  startedAt: 1,
  finishedAt: 5401,
};
it('describes completed searches without falsely claiming to still be waiting', () => {
  expect(searchPresentation(step)).toMatchObject({
    queries: [],
    sources: [],
    state: 'unavailable',
  });
  expect(searchPresentation({ ...step, status: 'active' })?.state).toBe('searching');
  expect(searchPresentation({ ...step, status: 'error' })?.state).toBe('error');
  expect(searchPresentation({ ...step, status: 'interrupted' })?.state).toBe('interrupted');
});
it('shows native action queries and only valid deduplicated source URLs', () => {
  const result = searchPresentation({
    ...step,
    input: JSON.stringify({ type: 'search', queries: ['普吉岛 餐厅', 'Kata restaurants'] }),
    output: JSON.stringify({
      results: [
        { title: '餐厅指南', url: 'https://example.com/kata', snippet: '海滩附近的餐厅' },
        { title: '重复', url: 'https://example.com/kata' },
        { title: '恶意地址', url: 'javascript:alert(1)' },
      ],
    }),
  });
  expect(result?.queries).toEqual(['普吉岛 餐厅', 'Kata restaurants']);
  expect(result?.sources).toEqual([
    {
      title: '餐厅指南',
      url: 'https://example.com/kata',
      snippet: '海滩附近的餐厅',
      domain: 'example.com',
    },
  ]);
  expect(result?.state).toBe('results');
});
it('reads real Pi numbered search results and distinguishes zero results from missing metadata', () => {
  const result = searchPresentation({
    ...step,
    name: 'web_search',
    input: '{"query":"Kata restaurants"}',
    output:
      '**Provider:** exa\n\n1. Kata Beach Guide\n   https://example.com/kata\n\n2. Restaurant hours\n   https://example.org/hours',
  });
  expect(result?.provider).toBe('exa');
  expect(result?.sources.map((s) => s.title)).toEqual(['Kata Beach Guide', 'Restaurant hours']);
  expect(searchPresentation({ ...step, output: '{"results":[]}' })?.state).toBe('empty');
  expect(searchPresentation({ ...step, output: 'No results found.' })?.state).toBe('empty');
  expect(searchPresentation({ ...step, name: 'write' })).toBeUndefined();
});
