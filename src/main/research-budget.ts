/** Per request; always permit durable writes during the finishing window. */
export class ResearchBudget {
  private start: number;
  private failures = new Map<string, number>();
  constructor(private now = Date.now) {
    this.start = now();
  }
  check(tool: string, url?: string) {
    if (['journal', 'plan', 'prepare', 'save_photo', 'inspect_photo'].includes(tool)) return;
    if (this.now() - this.start >= 140000)
      throw new Error('查询预算已用完，请立即保存阶段资料或待采集事项并结束回复。');
    if (url && (this.failures.get(new URL(url).hostname) ?? 0) >= 2)
      throw new Error('该站点连续失败，本轮已停止重试。请换来源或保存待采集事项。');
  }
  failed(url: string) {
    const host = new URL(url).hostname;
    this.failures.set(host, (this.failures.get(host) ?? 0) + 1);
  }
}
