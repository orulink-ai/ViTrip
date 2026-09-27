import type { AgentImage } from '../shared/attachments';
import type { ToolResult } from '../shared/photos';
import { ResearchBudget } from './research-budget';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import type { TSchema, Static } from 'typebox';
import {
  createAgentSession,
  createBashToolDefinition,
  createReadToolDefinition,
  createEditToolDefinition,
  createWriteToolDefinition,
  createGrepToolDefinition,
  createFindToolDefinition,
  createLsToolDefinition,
  createPowerShellToolDefinition,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { createActivityTracker } from './activity';
import { createTravelResources, builtinToolNames } from './agent-resources';
import { resolveHostEnvironment, shellQuote } from './host-environment';
import type { ToolActivity, Settings } from '../shared/types';
import { toolsSchema, type ToolName } from '../shared/schemas';
import type { RunControl } from './control';
import { travelPrompt, descriptions } from './travel-instructions';
export { travelPrompt } from './travel-instructions';
interface ToolOptions {
  control: RunControl;
  signal: AbortSignal;
  execute: (name: ToolName, args: Record<string, unknown>) => Promise<ToolResult>;
  onStatus: (text: string) => void;
}
export function travelTools(options: ToolOptions): ToolDefinition[] {
  return Object.entries(toolsSchema).map(([name, schema]) => ({
    name,
    label: name,
    description: descriptions[name as ToolName],
    executionMode: 'sequential',
    parameters: z.toJSONSchema(schema) as unknown as TSchema,
    execute: async (_id, raw) => {
      options.signal.throwIfAborted();
      const args = schema.parse(raw);
      options.onStatus(name === 'plan' ? '正在更新行程…' : `正在使用 ${name}…`);
      const result = await options.control.perform(() => options.execute(name as ToolName, args));
      const text = typeof result === 'string' ? result : result.text;
      const content: (
        { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
      )[] = [{ type: 'text', text }];
      if (typeof result !== 'string' && result.image)
        content.push({ type: 'image', ...result.image });
      return { content, details: {} };
    },
  }));
}
export async function runTravelAgent(
  options: ToolOptions & {
    settings: Settings;
    sessionDir: string;
    contextKey?: string;
    prompt: string;
    images?: AgentImage[];
    initialContext?: string;
    toolNames?: ToolName[];
    onActivity?: (step: ToolActivity) => void;
    onDelta: (text: string) => void;
    onText: (text: string) => void;
  },
) {
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(180000)]);
  fs.mkdirSync(options.sessionDir, { recursive: true, mode: 0o700 });
  const runtime = await ModelRuntime.create({
    authPath: path.join(options.sessionDir, 'auth.json'),
    modelsPath: null,
    refreshOnCreate: false,
  });
  runtime.registerProvider('vitrip', {
    name: 'ViTrip',
    api: 'openai-completions',
    baseUrl: options.settings.baseURL,
    models: [
      {
        id: options.settings.model,
        name: options.settings.model,
        reasoning: false,
        input: supportsImages(options.settings) ? ['text', 'image'] : ['text'],
        contextWindow: 128000,
        maxTokens: 8192,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: 'max_tokens',
          thinkingFormat: 'qwen',
        },
      },
    ],
  });
  await runtime.setRuntimeApiKey('vitrip', options.settings.apiKey || 'local-no-key');
  const model = runtime.getModel('vitrip', options.settings.model);
  if (!model) throw new Error('Pi 模型注册失败');
  const host = await resolveHostEnvironment();
  const resourceLoader = createTravelResources({
    cwd: options.sessionDir,
    prompt: travelPrompt,
    cliPath: host.cliPath,
    skillRoots: process.env.VITRIP_LARK_SKILLS_DIR
      ? process.env.VITRIP_LARK_SKILLS_DIR.split(path.delimiter)
      : undefined,
  });
  await resourceLoader.reload();
  const manager = SessionManager.continueRecent(
    options.sessionDir,
    options.contextKey
      ? path.join(options.sessionDir, 'branches', options.contextKey)
      : options.sessionDir,
  );
  const budget = new ResearchBudget();
  const boundedExecute: ToolOptions['execute'] = async (name, args) => {
    budget.check(
      name,
      ['navigate', 'photo_candidates'].includes(name) && args.url ? String(args.url) : undefined,
    );
    try {
      const result = await options.execute(name, args);
      if (
        name === 'photo_candidates' &&
        args.url &&
        typeof result === 'string' &&
        JSON.parse(result).error
      )
        budget.failed(String(args.url));
      return result;
    } catch (error) {
      if (name === 'navigate') budget.failed(String(args.url));
      throw error;
    }
  };
  const prefix = `export PATH=${shellQuote(host.commandPath)}`;
  function bound<T extends TSchema, D, R>(tool: ToolDefinition<T, D, R>): ToolDefinition {
    return {
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      execute: async (id, args, toolSignal, onUpdate, context) => {
        budget.check(tool.name);
        return tool.execute(
          id,
          args as Static<T>,
          AbortSignal.any([
            signal,
            AbortSignal.timeout(20000),
            ...(toolSignal ? [toolSignal] : []),
          ]),
          onUpdate,
          context,
        );
      },
    };
  }
  const boundedTools = [
    bound(createReadToolDefinition(options.sessionDir)),
    bound(createBashToolDefinition(options.sessionDir, { commandPrefix: prefix })),
    bound(createEditToolDefinition(options.sessionDir)),
    bound(createWriteToolDefinition(options.sessionDir)),
    bound(createGrepToolDefinition(options.sessionDir)),
    bound(createFindToolDefinition(options.sessionDir)),
    bound(createLsToolDefinition(options.sessionDir)),
    bound(createPowerShellToolDefinition(options.sessionDir)),
  ];
  const { session } = await createAgentSession({
    cwd: options.sessionDir,
    agentDir: options.sessionDir,
    model,
    modelRuntime: runtime,
    thinkingLevel: 'off',
    resourceLoader,
    tools: options.toolNames ?? [...builtinToolNames, ...Object.keys(toolsSchema)],
    customTools: [...boundedTools, ...travelTools({ ...options, execute: boundedExecute, signal })],
    sessionManager: manager,
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: false },
      quietStartup: true,
      shellCommandPrefix: `export PATH=${shellQuote(host.commandPath)}`,
    }),
  });
  await session.setModel(model);
  let draft = '',
    turns = 0,
    limit = false;
  const tracker = createActivityTracker(options.onActivity ?? (() => {}), [
    options.settings.apiKey,
    options.settings.jevApiKey ?? '',
  ]);
  const unsubscribe = session.subscribe((event) => {
    if (signal.aborted && event.type === 'tool_execution_end') tracker.finish();
    else tracker.accept(event);
    if (event.type === 'message_start') draft = '';
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      draft += event.assistantMessageEvent.delta;
      options.onDelta(draft);
    }
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const text = event.message.content
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('');
      if (text) options.onText(text);
    }
    if (event.type === 'turn_end' && ++turns >= 24) {
      limit = true;
      void session.abort();
    }
  });
  const cancel = () => {
    void session.abort();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const initial =
      session.messages.length === 0 && options.initialContext
        ? options.initialContext + '\n\n'
        : '';
    await session.prompt(initial + options.prompt, { images: options.images });
    signal.throwIfAborted();
    if (limit) throw new Error('本轮达到24轮上限，已停止。');
    const last = session.messages.at(-1);
    if (
      last?.role === 'assistant' &&
      (last.stopReason === 'error' || last.stopReason === 'aborted')
    )
      throw new Error(last.errorMessage || '模型请求未完成');
  } finally {
    signal.removeEventListener('abort', cancel);
    tracker.finish();
    unsubscribe();
    session.dispose();
  }
}

export function supportsImages(settings: Settings): boolean {
  if (settings.imageInput !== undefined) return settings.imageInput;
  return (
    settings.model === 'deepseek-v4.1-flash' &&
    new URL(settings.baseURL).hostname.endsWith('.maas.aliyuncs.com')
  );
}
