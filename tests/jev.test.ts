import { expect, it } from 'vitest';
import { decisionRequest, parseDecision } from '../src/main/jev';
const page = {
  url: 'https://example.com',
  title: '搜索',
  text: '',
  elements: [
    { ref: 1001, tag: 'input', type: 'text', label: '目的地' },
    { ref: 1002, tag: 'button', label: '搜索' },
    { ref: 1003, tag: 'input', type: 'password', label: '密码', sensitive: true },
  ],
};
const answer = (choice: string, ids: string[]) => ({
  choice,
  confidence: 0.99,
  probabilities: Object.fromEntries(ids.map((id) => [id, id === choice ? 1 : 0])),
});
it('offers only observed targets and excludes sensitive fields', () => {
  const request = decisionRequest(page, '搜索京都', []);
  expect(Object.keys(request.questions.type_text_target.criteria)).toEqual(['1001']);
  expect(request.questions.click_target.criteria).not.toHaveProperty('1003');
});
it('consumes only the target head selected by the operation', () => {
  const request = decisionRequest(page, '搜索京都', []);
  const response = {
    answers: {
      operation: answer('CLICK', Object.keys(request.questions.operation.criteria)),
      click_target: answer('1002', Object.keys(request.questions.click_target.criteria)),
      type_text_target: { choice: 'malicious' },
    },
  };
  expect(parseDecision(request, response)).toEqual({ operation: 'CLICK', ref: 1002 });
  response.answers.click_target.choice = '9999';
  expect(() => parseDecision(request, response)).toThrow();
});
it('rejects inconsistent probabilities before any action', () => {
  const request = decisionRequest(page, '搜索京都', []);
  expect(() =>
    parseDecision(request, {
      answers: { operation: { choice: 'DONE', confidence: 1, probabilities: { DONE: 1 } } },
    }),
  ).toThrow();
});
