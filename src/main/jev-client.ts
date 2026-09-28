import { z } from 'zod';
import type { Settings } from '../shared/types';

/** Transport shared by experimental tools; provider bodies never reach the renderer. */
export async function jevEvaluate(
  state: unknown,
  questions: Record<string, unknown>,
  settings: Settings,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!settings.jevApiKey) throw new Error('请先在设置中配置 JEV OpenRouter API Key');
  signal.throwIfAborted();
  const endpoint =
    process.env.VITRIP_TEST_DATA && process.env.VITRIP_TEST_JEV_URL
      ? process.env.VITRIP_TEST_JEV_URL
      : 'https://openrouter.ai/api/v1/systemone';
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.jevApiKey}` },
    body: JSON.stringify({ model: 'typesafe/jev-1.13', state, questions }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  if (!response.ok) {
    const error = new Error(`JEV OpenRouter HTTP ${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  const data: unknown = await response.json();
  signal.throwIfAborted();
  const parsed = z.object({ answers: z.record(z.string(), z.unknown()) }).safeParse(data);
  if (!parsed.success) throw new Error('JEV 返回了无效响应');
  return parsed.data.answers;
}
