/** Guard repeated site failures; request deadlines belong to the host. */
export class ResearchBudget {
  private failures = new Map<string, number>();
  startTurn() {
    this.failures.clear();
  }
  check(tool: string, url?: string) {
    if (['journal', 'plan', 'prepare', 'save_photo', 'inspect_photo'].includes(tool)) return;
    if (url && (this.failures.get(new URL(url).hostname) ?? 0) >= 2)
      throw new Error('该站点连续失败，本轮已停止重试。请换来源或保存待采集事项。');
  }
  failed(url: string) {
    const host = new URL(url).hostname;
    this.failures.set(host, (this.failures.get(host) ?? 0) + 1);
  }
}
