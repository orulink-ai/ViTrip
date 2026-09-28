import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { type Snapshot, type computerUse } from './jev';
import { jevEvaluate } from './jev-client';
import { runJev } from './vendor/pi-jev-browser/loop';
import {
  StaleObservationError,
  type Driver,
  type ObservedTarget,
} from './vendor/pi-jev-browser/driver';
import { buildQuestions, buildTextQuestion, textCandidates } from './vendor/pi-jev-browser/policy';

type Options = Parameters<typeof computerUse>[0];
function checkedChoice(raw: unknown, criteria: Record<string, unknown>) {
  const result = z
    .object({
      type: z.literal('choice'),
      choice: z.string(),
      confidence: z.number().min(0).max(1),
      probabilities: z.record(z.string(), z.number().min(0).max(1)),
    })
    .safeParse(raw);
  if (!result.success) throw new Error('JEV 返回无效选择');
  const answer = result.data;
  const ids = Object.keys(criteria);
  if (
    !Object.hasOwn(criteria, answer.choice) ||
    ids.length !== Object.keys(answer.probabilities).length ||
    ids.some((id) => !Object.hasOwn(answer.probabilities, id)) ||
    Math.abs(Object.values(answer.probabilities).reduce((sum, n) => sum + n, 0) - 1) > 0.02
  )
    throw new Error('JEV 返回了未提供的选择');
  return answer;
}
/** Adapt the upstream surface-independent loop to ViTrip's visible Electron browser. */
export async function piComputerUse(options: Options) {
  if (!options.settings.jevApiKey) throw new Error('请先配置 JEV OpenRouter API Key');
  const driver: Driver = {
    id: () => 'vitrip-browser',
    observe: async (signal) => {
      signal?.throwIfAborted();
      const page: Snapshot = JSON.parse(await options.observe());
      const refs = new Map<string, number>();
      const targets: ObservedTarget[] = [];
      for (const [index, el] of page.elements.entries()) {
        if (el.sensitive || el.type === 'password' || el.tag === 'select') continue;
        const id = String(index);
        refs.set(id, el.ref);
        targets.push({
          id,
          operation: 'CLICK',
          label: el.label || el.tag,
          value: el.value ?? '',
          role: el.tag,
        });
        if (
          el.tag === 'textarea' ||
          (el.tag === 'input' &&
            ['text', 'search', 'email', 'tel', 'url', 'number', null, undefined].includes(el.type))
        )
          targets.push({
            id,
            operation: 'TYPE_TEXT',
            label: el.label || el.tag,
            value: el.value ?? '',
            role: el.tag,
          });
      }
      const assertFresh = async () => {
        try {
          await options.assertFresh();
        } catch {
          throw new StaleObservationError('Observation changed.');
        }
      };
      return {
        data: {
          url: page.url,
          title: page.title,
          text: page.text,
          // Reserve six choices for WAIT/BLOCKED/REVIEW/DONE and scrolling.
          targets: targets.slice(0, 249),
          scrollUp: true,
          scrollDown: true,
        },
        assertFresh,
        dispose: async () => {},
        execute: async (operation, target, text, actionSignal) => {
          actionSignal.throwIfAborted();
          await assertFresh();
          if (operation === 'WAIT') {
            await delay(350, undefined, { signal: actionSignal });
            return;
          }
          if (operation.startsWith('SCROLL_')) {
            await options.execute('scroll', {
              direction: operation === 'SCROLL_UP' ? 'up' : 'down',
            });
            return;
          }
          const ref = target && refs.get(target.id);
          if (ref === undefined) throw new Error('元素引用无效');
          if (operation === 'CLICK') await options.execute('click', { ref });
          else if (operation === 'TYPE_TEXT') await options.execute('type', { ref, text });
          else throw new Error('当前浏览器不支持此操作');
        },
      };
    },
  };
  const result = await runJev(
    { goal: options.goal, maxSteps: 20 },
    {
      driver,
      signal: options.signal,
      onStep: async (step) => options.onStatus(`Pi JEV · ${step.operation} · ${step.step}/20`),
      policy: {
        choose: async (page, goal, history, signal) => {
          const questions = buildQuestions(page, goal);
          const answers = await jevEvaluate(
            { page, recentActions: history },
            questions,
            options.settings,
            signal,
          );
          const answer = checkedChoice(answers.action, questions.action.criteria);
          const target = page.targets.find((t) => `${t.operation}:${t.id}` === answer.choice);
          return {
            operation: target?.operation ?? answer.choice,
            target,
            probability: answer.probabilities[answer.choice],
            providerConfidence: answer.confidence,
          };
        },
        text: async (page, goal, target, history, signal) => {
          const candidates = textCandidates(goal, target);
          if (!candidates.length) return { text: null };
          const questions = buildTextQuestion(page, goal, target, candidates);
          const answers = await jevEvaluate(
            { page, recentActions: history },
            questions,
            options.settings,
            signal,
          );
          const answer = checkedChoice(answers.text, questions.text.criteria);
          return {
            text:
              answer.choice === 'NONE'
                ? null
                : (candidates[Number(answer.choice.slice(5))] ?? null),
          };
        },
      },
    },
  );
  options.signal.throwIfAborted();
  return JSON.stringify({
    ...result,
    ...(result.failure
      ? { message: 'Pi JEV 操作已中断，请检查当前页面和 API 连接。已尝试的动作不会自动重试。' }
      : {}),
  });
}
