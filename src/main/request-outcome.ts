/** Tracks only durable writes completed by one request, including its journal sync. */
export class RequestOutcome {
  private writes = new Set<'plan' | 'journal'>();

  saved(tool: 'plan' | 'journal') {
    this.writes.add(tool);
  }

  failure(
    error: unknown,
    options: {
      cancelled?: boolean;
      timedOut?: boolean;
      syncing?: boolean;
      secrets?: (string | undefined)[];
    } = {},
  ): string | null {
    if (options.cancelled) return null;
    const saved = this.writes.has('plan')
      ? this.writes.has('journal')
        ? '行程和旅行资料'
        : '行程'
      : this.writes.has('journal')
        ? '旅行资料'
        : '';
    if (options.timedOut) {
      if (saved)
        return `${saved}已保存，后续${options.syncing ? '整理' : '回复'}超时。已保存的内容可在行程中查看。`;
      return options.syncing
        ? '回复已完成，但共享旅行资料整理超时。'
        : '本次请求未完成：处理超时，请稍后重试。';
    }
    let message = error instanceof Error ? error.message : '未知错误';
    for (const key of options.secrets ?? [])
      if (key) message = message.replaceAll(key, '[密钥已隐藏]');
    const prefix = saved
      ? `${saved}已保存，后续处理未完成：`
      : options.syncing
        ? '回复已完成，但共享旅行资料整理未完成：'
        : '本次请求未完成：';
    return prefix + message.slice(0, 500);
  }
}
