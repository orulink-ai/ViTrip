const IDLE_MS = 180_000;
const RESEARCH_MS = 900_000;
const VOICE_MS = 1_800_000;

/** The host owns request deadlines; runtimes consume the same cancellation signal. */
export class RequestDeadline {
  private controller = new AbortController();
  private idleTimer?: ReturnType<typeof setTimeout>;
  private totalTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  reason?: 'idle' | 'total';
  readonly signal = this.controller.signal;

  constructor(private voice = false) {
    this.armTotal(voice ? VOICE_MS : RESEARCH_MS);
    this.progress();
  }

  progress() {
    if (this.voice || this.disposed || this.signal.aborted) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.expire('idle'), IDLE_MS);
  }

  startSync() {
    if (this.disposed || this.signal.aborted) return;
    this.armTotal(IDLE_MS);
    this.progress();
  }

  private armTotal(ms: number) {
    clearTimeout(this.totalTimer);
    this.totalTimer = setTimeout(() => this.expire('total'), ms);
  }

  private expire(reason: 'idle' | 'total') {
    this.reason = reason;
    this.dispose();
    this.controller.abort(new DOMException('请求处理超时', 'TimeoutError'));
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    clearTimeout(this.totalTimer);
  }
}
