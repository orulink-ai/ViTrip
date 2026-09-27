import { z } from 'zod';
import { CodexRpc, type CodexCommand } from './codex-rpc';
import { resolveHostEnvironment } from './host-environment';
import { resolveCodexExecutable } from './codex-executable';
import { codexModelSchema, type CodexModel } from '../shared/codex-models';
export async function listCodexModels(cwd: string, override?: CodexCommand): Promise<CodexModel[]> {
  const host = await resolveHostEnvironment();
  const command = override ?? {
    command: await resolveCodexExecutable(host.commandPath),
    args: ['app-server', '--listen', 'stdio://'],
  };
  if (!command.command) throw new Error('未找到 Codex CLI');
  const rpc = new CodexRpc(command, cwd, { ...process.env, PATH: host.commandPath });
  rpc.on('failure', () => {});
  try {
    await rpc.request('initialize', {
      clientInfo: { name: 'vitrip', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    rpc.send({ method: 'initialized', params: {} });
    const result: CodexModel[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = z
        .object({ data: z.array(codexModelSchema), nextCursor: z.string().nullish() })
        .parse(
          await rpc.request('model/list', {
            limit: 100,
            includeHidden: false,
            ...(cursor ? { cursor } : {}),
          }),
        );
      result.push(...page.data);
      cursor = page.nextCursor ?? undefined;
      if (cursor && seen.has(cursor)) throw new Error('Codex 模型目录分页异常');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return result;
  } finally {
    await rpc.close();
  }
}
