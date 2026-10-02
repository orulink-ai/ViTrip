import { startCodexVoice } from './codex-voice-start';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AgentRunOptions } from './agent-runtime';
import type { ToolActivity } from '../shared/types';
import { toolsSchema, type ToolName } from '../shared/schemas';
import { travelPrompt, descriptions } from './travel-instructions';
import { createTravelResources } from './agent-resources';
import { resolveHostEnvironment } from './host-environment';
import { resolveCodexExecutable } from './codex-executable';
import { CodexRpc, type CodexCommand } from './codex-rpc';
import { ResearchBudget } from './research-budget';

const threadResult = z.object({ thread: z.object({ id: z.string().min(1) }) });
const toolCall = z.object({ callId: z.string(), tool: z.string(), arguments: z.unknown() });
const eventParams = z.object({ threadId: z.string().optional() }).passthrough();
const itemSchema = z.object({ id: z.string(), type: z.string() }).passthrough();
const sessionSchema = z.object({ threadId: z.string().min(1) });

/** Each ViTrip conversation owns a Codex thread; Pi session files remain independent. */
export async function runCodexAgent(options: AgentRunOptions, commandOverride?: CodexCommand) {
  const signal = options.signal;
  signal.throwIfAborted();
  await fs.mkdir(options.sessionDir, { recursive: true, mode: 0o700 });
  const host = await resolveHostEnvironment();
  signal.throwIfAborted();
  const command = commandOverride ?? {
    command: await resolveCodexExecutable(host.commandPath),
    args: [
      'app-server',
      ...(options.voice ? ['--enable', 'realtime_conversation'] : []),
      '--listen',
      'stdio://',
    ],
  };
  if (!command.command)
    throw new Error('未找到 Codex CLI。请安装后在终端运行 codex login，再重试。');
  const resources = createTravelResources({
    cwd: options.sessionDir,
    prompt: travelPrompt,
    cliPath: host.cliPath,
    runtime: 'codex',
    skillRoots: process.env.VITRIP_LARK_SKILLS_DIR?.split(path.delimiter),
  });
  await resources.reload();
  const instructions =
    resources.getSystemPrompt() +
    '\n可用 Skills（按需先读取 SKILL.md）：\n' +
    resources
      .getSkills()
      .skills.map((skill) => `${skill.name}: ${skill.description}\n${skill.filePath}`)
      .join('\n');
  const rpc = new CodexRpc(command, options.sessionDir, { ...process.env, PATH: host.commandPath });
  let threadId = '';
  let turnId = '';
  let accepting = true;
  let turnFinished = false;
  const clearSteer = () => {
    turnFinished = true;
    options.onSteerReady?.(undefined);
  };
  let shutdown: Promise<void> | undefined;
  let acknowledgeInterruption!: () => void;
  const interrupted = new Promise<void>((resolve) => {
    acknowledgeInterruption = resolve;
  });
  let failure: Error | undefined;
  let resolveDone!: () => void;
  let rejectDone!: (error: Error) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  // Completion can arrive before turn/start's response, including startup failures.
  void done.catch(() => {});
  const fail = (error: Error) => {
    clearSteer();
    failure = error;
    rejectDone(error);
  };
  rpc.on('failure', fail);
  const activities = new Map<string, ToolActivity>();
  const drafts = new Map<string, string>();
  const completedMessages = new Set<string>();
  const budget = new ResearchBudget();
  const safe = (value: unknown) => {
    let text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
    for (const key of [
      options.settings.apiKey,
      options.settings.jevApiKey,
      options.settings.tavilyApiKey,
    ])
      if (key) text = text.replaceAll(key, '[密钥已隐藏]');
    return text.slice(0, 12000);
  };
  const publish = (step: ToolActivity) => {
    activities.set(step.id, step);
    options.onActivity?.({ ...step });
  };
  const allowed = new Set<string>(options.toolNames ?? Object.keys(toolsSchema));
  async function executeTool(raw: unknown) {
    const call = toolCall.parse(raw);
    const step: ToolActivity = {
      id: call.callId,
      name: call.tool,
      input: safe(call.arguments),
      output: '',
      status: 'active',
      startedAt: Date.now(),
    };
    publish(step);
    try {
      signal.throwIfAborted();
      if (!allowed.has(call.tool) || !Object.hasOwn(toolsSchema, call.tool))
        throw new Error('本轮未开放此工具');
      const name = call.tool as ToolName;
      const args = toolsSchema[name].parse(call.arguments);
      const url = 'url' in args && typeof args.url === 'string' ? args.url : undefined;
      budget.check(name, url);
      options.onStatus(name === 'plan' ? '正在更新行程…' : `正在使用 ${name}…`);
      let result;
      try {
        result = await options.control.perform(() => options.execute(name, args));
      } catch (error) {
        if (url) budget.failed(url);
        throw error;
      }
      signal.throwIfAborted();
      const text = typeof result === 'string' ? result : result.text;
      if (url && name === 'photo_candidates') {
        try {
          if (JSON.parse(text).error) budget.failed(url);
        } catch {
          /* plain text result */
        }
      }
      const contentItems: (
        { type: 'inputText'; text: string } | { type: 'inputImage'; imageUrl: string }
      )[] = [{ type: 'inputText', text }];
      if (typeof result !== 'string' && result.image)
        contentItems.push({
          type: 'inputImage',
          imageUrl: `data:${result.image.mimeType};base64,${result.image.data}`,
        });
      publish({ ...step, status: 'complete', output: safe(text), finishedAt: Date.now() });
      return { success: true, contentItems };
    } catch (error) {
      const text = safe(error instanceof Error ? error.message : error);
      publish({
        ...step,
        status: signal.aborted ? 'interrupted' : 'error',
        output: text,
        finishedAt: Date.now(),
      });
      return { success: false, contentItems: [{ type: 'inputText', text }] };
    }
  }
  async function request(method: string, params: Record<string, unknown>) {
    if (method === 'item/tool/call') return executeTool(params);
    if (
      method === 'item/commandExecution/requestApproval' ||
      method === 'item/fileChange/requestApproval'
    ) {
      const activity =
        typeof params.itemId === 'string' ? activities.get(params.itemId) : undefined;
      const label = `Codex 请求执行：${safe(params.command ?? activity?.input ?? params.reason ?? '修改本地文件')}`;
      const accepted = (await options.approve?.(label)) ?? false;
      signal.throwIfAborted();
      return { decision: accepted ? 'accept' : 'decline' };
    }
    // No implied approval for new protocol request types.
    throw new Error(`ViTrip 暂不支持 Codex 交互 ${method}，请在普通对话中向用户提问。`);
  }
  let requestQueue = Promise.resolve();
  rpc.on('message', (message: { id?: string | number; method: string; params?: unknown }) => {
    if (!accepting) {
      if (message.method === 'turn/completed') acknowledgeInterruption();
      return;
    }
    const parsed = eventParams.safeParse(message.params ?? {});
    if (!parsed.success) {
      fail(new Error('Codex 事件参数无效'));
      return;
    }
    const params = parsed.data;
    if (params.threadId && params.threadId !== threadId) return;
    if (options.voice && message.method.startsWith('thread/realtime/')) {
      if (message.method === 'thread/realtime/sdp' && typeof params.sdp === 'string')
        options.voice.onEvent({ kind: 'sdp', sdp: params.sdp });
      if (
        message.method === 'thread/realtime/transcript/done' &&
        typeof params.text === 'string' &&
        (params.role === 'user' || params.role === 'assistant')
      ) {
        if (params.role === 'user' && params.text.trim()) budget.startTurn();
        options.voice.onEvent({ kind: 'transcript', role: params.role, text: params.text });
      }
      if (message.method === 'thread/realtime/error')
        fail(new Error(typeof params.message === 'string' ? safe(params.message) : '语音连接失败'));
      if (message.method === 'thread/realtime/closed') resolveDone();
      return;
    }
    if (message.id !== undefined) {
      requestQueue = requestQueue
        .then(async () => {
          if (!accepting || signal.aborted) return;
          await request(message.method, params).then(
            (result) => {
              if (accepting) rpc.send({ id: message.id, result });
            },
            (error: unknown) => {
              if (accepting)
                rpc.send({
                  id: message.id,
                  error: {
                    code: -32603,
                    message: safe(error instanceof Error ? error.message : error),
                  },
                });
            },
          );
        })
        .catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));
      return;
    }
    if (
      message.method === 'item/agentMessage/delta' &&
      typeof params.itemId === 'string' &&
      typeof params.delta === 'string'
    ) {
      const text = (drafts.get(params.itemId) ?? '') + params.delta;
      drafts.set(params.itemId, text);
      options.onDelta(text);
    } else if (message.method === 'item/started' || message.method === 'item/completed') {
      const item = itemSchema.safeParse(params.item);
      if (!item.success) return;
      const value = item.data;
      const completed = message.method === 'item/completed';
      if (
        value.type === 'agentMessage' &&
        completed &&
        typeof value.text === 'string' &&
        !completedMessages.has(value.id)
      ) {
        completedMessages.add(value.id);
        options.onDelta('');
        if (value.text) options.onText(value.text);
      } else if (
        ['commandExecution', 'fileChange', 'mcpToolCall', 'webSearch'].includes(value.type)
      ) {
        const previous = activities.get(value.id);
        const label = (
          {
            commandExecution: '执行本机命令',
            fileChange: '修改文件',
            mcpToolCall: '调用外部工具',
            webSearch: '搜索网页',
          } as Record<string, string>
        )[value.type];
        options.onStatus(completed ? '工具已返回，正在继续分析…' : `正在${label}…`);
        publish({
          id: value.id,
          name: String(value.tool ?? value.type),
          input:
            safe(
              value.command ??
                value.changes ??
                value.arguments ??
                value.action ??
                value.query ??
                '',
            ) ||
            previous?.input ||
            '',
          output: safe(
            value.aggregatedOutput ??
              value.result ??
              value.error ??
              value.sources ??
              previous?.output ??
              '',
          ),
          status: completed
            ? value.status === 'failed' ||
              value.status === 'declined' ||
              value.error ||
              (typeof value.exitCode === 'number' && value.exitCode !== 0)
              ? 'error'
              : 'complete'
            : 'active',
          startedAt: previous?.startedAt ?? Date.now(),
          ...(completed ? { finishedAt: Date.now() } : {}),
        });
      }
    } else if (
      message.method === 'item/commandExecution/outputDelta' &&
      typeof params.itemId === 'string' &&
      typeof params.delta === 'string'
    ) {
      const previous = activities.get(params.itemId);
      if (previous) publish({ ...previous, output: safe(previous.output + params.delta) });
    } else if (message.method === 'error') {
      const error = z.object({ message: z.string() }).safeParse(params.error);
      if (params.willRetry === true) options.onStatus('Codex 连接中断，正在重试…');
      else fail(new Error(error.success ? safe(error.data.message) : 'Codex 请求失败'));
    } else if (message.method === 'turn/completed') {
      const turn = z
        .object({
          id: z.string(),
          status: z.string(),
          error: z.object({ message: z.string() }).nullish(),
        })
        .safeParse(params.turn);
      if (!turn.success || (turnId && turn.data.id !== turnId)) return;
      clearSteer();
      if (turn.data.status === 'completed') {
        if (!options.voice) resolveDone();
      } else fail(new Error(turn.data.error?.message ?? 'Codex 本轮已中断'));
    }
  });
  const cancel = () => {
    accepting = false;
    shutdown = (async () => {
      if (threadId && (turnId || options.voice)) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            options.voice
              ? rpc.request('thread/realtime/stop', { threadId })
              : rpc.request('turn/interrupt', { threadId, turnId }).then(() => interrupted),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 750);
            }),
          ]);
        } catch {
          /* A dead server still needs process cleanup. */
        } finally {
          clearTimeout(timer);
        }
      }
      await rpc.close();
    })();
    fail(new Error('Codex 任务已停止'));
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    await rpc.request('initialize', {
      clientInfo: { name: 'vitrip', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    rpc.send({ method: 'initialized', params: {} });
    const account = z
      .object({ account: z.unknown().nullable(), requiresOpenaiAuth: z.boolean() })
      .parse(await rpc.request('account/read', {}));
    if (!account.account && account.requiresOpenaiAuth)
      throw new Error('Codex 尚未登录。请在终端运行 codex login 后重试。');
    const file = path.join(
      options.sessionDir,
      options.contextKey ? `codex-thread-${options.contextKey}.json` : 'codex-thread.json',
    );
    // A restricted background sync must not change the interactive thread's tool catalog.
    const ephemeral = !!options.toolNames;
    let saved: { threadId: string } | undefined;
    if (!ephemeral) {
      try {
        saved = sessionSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('Codex 会话记录无法读取，请创建新对话后重试');
      }
    }
    const config = {
      cwd: options.sessionDir,
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandbox: 'workspace-write',
      developerInstructions:
        instructions +
        (options.voice
          ? '\n语音会话的当前旅行上下文：\n' +
            (options.initialContext ?? '') +
            '\n' +
            options.prompt
          : ''),
      ...(options.settings.codexModel ? { model: options.settings.codexModel } : {}),
    };
    const started = threadResult.parse(
      await rpc.request(
        saved ? 'thread/resume' : 'thread/start',
        saved
          ? {
              ...config,
              threadId: saved.threadId,
            }
          : {
              ...config,
              ephemeral,
              dynamicTools: Object.entries(toolsSchema)
                .filter(([name]) => allowed.has(name))
                .map(([name, schema]) => ({
                  type: 'function',
                  name,
                  description: descriptions[name as ToolName],
                  inputSchema: z.toJSONSchema(schema),
                })),
            },
      ),
    );
    threadId = started.thread.id;
    if (failure) throw failure;
    signal.throwIfAborted();
    if (options.voice) {
      if (!ephemeral) {
        await fs.writeFile(file + '.tmp', JSON.stringify({ threadId }), { mode: 0o600 });
        await fs.rename(file + '.tmp', file);
      }
      await startCodexVoice(rpc, threadId, signal, 30000, {
        type: 'webrtc',
        sdp: options.voice.sdp,
      });
      await done;
      signal.throwIfAborted();
      return;
    }
    const startedTurn = z.object({ turn: z.object({ id: z.string() }) }).parse(
      await rpc.request('turn/start', {
        threadId,
        ...(options.settings.codexModel ? { model: options.settings.codexModel } : {}),
        ...(options.settings.codexEffort ? { effort: options.settings.codexEffort } : {}),
        input: [
          {
            type: 'text',
            text: (options.initialContext ? options.initialContext + '\n\n' : '') + options.prompt,
            text_elements: [],
          },
          ...(options.images ?? []).map((image) => ({
            type: 'image',
            url: `data:${image.mimeType};base64,${image.data}`,
          })),
        ],
      }),
    );
    turnId = startedTurn.turn.id;
    if (!turnFinished && !signal.aborted)
      options.onSteerReady?.(async ({ prompt, images }) => {
        signal.throwIfAborted();
        if (!accepting || turnFinished) throw new Error('当前任务已结束，消息仍保留在队列中');
        const result = z.object({ turnId: z.string() }).parse(
          await rpc.request('turn/steer', {
            threadId,
            expectedTurnId: turnId,
            input: [
              { type: 'text', text: prompt, text_elements: [] },
              ...(images ?? []).map((image) => ({
                type: 'image',
                url: `data:${image.mimeType};base64,${image.data}`,
              })),
            ],
          }),
        );
        if (result.turnId !== turnId) throw new Error('引导目标已变化，请重试');
      });
    if (!ephemeral) {
      await fs.writeFile(file + '.tmp', JSON.stringify({ threadId }), { mode: 0o600 });
      await fs.rename(file + '.tmp', file);
    }
    await done;
    signal.throwIfAborted();
  } finally {
    clearSteer();
    accepting = false;
    signal.removeEventListener('abort', cancel);
    await (shutdown ?? rpc.close());
    await requestQueue;
    for (const step of activities.values())
      if (step.status === 'active')
        publish({ ...step, status: 'interrupted', finishedAt: Date.now() });
  }
}
