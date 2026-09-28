import { expect, it, vi, afterEach } from 'vitest';
import { piComputerUse } from '../src/main/pi-jev-browser';
afterEach(() => vi.unstubAllGlobals());
it('uses upstream single action decisions, executes once, then returns verified page evidence', async () => {
  let clicked = false;
  const execute = vi.fn(async () => {
    clicked = true;
    return 'clicked';
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.questions.action).toBeDefined();
      const ids = Object.keys(body.questions.action.criteria);
      const choice = clicked ? 'DONE' : ids.find((id) => id.startsWith('CLICK:'))!;
      return new Response(
        JSON.stringify({
          answers: {
            action: {
              type: 'choice',
              choice,
              confidence: 1,
              probabilities: Object.fromEntries(ids.map((id) => [id, Number(id === choice)])),
            },
          },
        }),
      );
    }),
  );
  const result = JSON.parse(
    await piComputerUse({
      goal: 'Open beach',
      settings: { baseURL: 'https://example.com', model: 'test', apiKey: '', jevApiKey: 'secret' },
      signal: new AbortController().signal,
      observe: async () =>
        JSON.stringify({
          url: 'https://example.com',
          title: 'Test',
          text: clicked ? 'Beach opened' : 'Open beach',
          elements: [{ ref: 42, tag: 'button', label: 'Open beach' }],
        }),
      assertFresh: async () => {},
      execute,
      onStatus: () => {},
    }),
  );
  expect(execute).toHaveBeenCalledExactlyOnceWith('click', { ref: 42 });
  expect(result.status).toBe('done_unverified');
  expect(result.page.text).toContain('Beach opened');
});
it('bounds action candidates to the provider limit on control-heavy pages', async () => {
  let choices = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      const ids = Object.keys(body.questions.action.criteria);
      choices = ids.length;
      return new Response(
        JSON.stringify({
          answers: {
            action: {
              type: 'choice',
              choice: 'BLOCKED',
              confidence: 1,
              probabilities: Object.fromEntries(ids.map((id) => [id, Number(id === 'BLOCKED')])),
            },
          },
        }),
      );
    }),
  );
  await piComputerUse({
    goal: 'Find beach',
    settings: { baseURL: 'https://example.com', model: 'test', apiKey: '', jevApiKey: 'secret' },
    signal: new AbortController().signal,
    observe: async () =>
      JSON.stringify({
        url: 'https://example.com',
        title: 'Test',
        text: 'Many controls',
        elements: Array.from({ length: 250 }, (_, ref) => ({
          ref,
          tag: 'input',
          type: 'text',
          label: 'Field ' + ref,
        })),
      }),
    assertFresh: async () => {},
    execute: async () => '',
    onStatus: () => {},
  });
  expect(choices).toBeLessThanOrEqual(255);
});
