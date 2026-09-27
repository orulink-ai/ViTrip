import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { z } from 'zod';

export interface CodexCommand {
  command: string;
  args: string[];
}
const envelope = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).passthrough().optional(),
});
/** Private stdio transport: no listening port or credentials cross the renderer boundary. */
export class CodexRpc extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private nextId = 0;
  private stopped = false;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private closed: Promise<void>;
  constructor(command: CodexCommand, cwd: string, env: NodeJS.ProcessEnv) {
    super();
    this.child = spawn(command.command, command.args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    this.closed = new Promise((resolve) => this.child.once('close', () => resolve()));
    // Drain diagnostics without exposing local configuration or credentials in UI/logs.
    this.child.stderr.resume();
    this.child.on('error', () =>
      this.fail(new Error('无法启动 Codex，请安装 Codex CLI 并运行 codex login。')),
    );
    this.child.stdin.on('error', () => this.fail(new Error('Codex 连接已断开')));
    this.child.on('exit', (code) => {
      if (!this.stopped) this.fail(new Error(`Codex 进程意外退出（${code ?? 'signal'}）`));
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', (line) => {
      if (this.stopped) return;
      try {
        const message = envelope.parse(JSON.parse(line));
        if (message.method) this.emit('message', message);
        else if (typeof message.id === 'number') {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(`Codex: ${message.error.message}`));
          else pending.resolve(message.result);
        }
      } catch {
        this.fail(new Error('Codex 返回了无效的协议数据，请检查 CLI 版本'));
      }
    });
  }
  private fail(error: Error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    if (!this.stopped) this.emit('failure', error);
  }
  send(message: object) {
    if (!this.stopped && !this.child.stdin.destroyed)
      this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method: string, params: object): Promise<unknown> {
    if (this.stopped) return Promise.reject(new Error('Codex 连接已关闭'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} 响应超时`));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async close() {
    if (this.stopped) return this.closed;
    this.stopped = true;
    this.fail(new Error('Codex 连接已关闭'));
    const kill = (signal: NodeJS.Signals) => {
      if (this.child.pid) {
        try {
          if (process.platform !== 'win32') process.kill(-this.child.pid, signal);
          else this.child.kill(signal);
        } catch {
          /* already exited */
        }
      }
    };
    kill('SIGTERM');
    const timer = setTimeout(() => kill('SIGKILL'), 1000);
    await this.closed;
    clearTimeout(timer);
  }
}
