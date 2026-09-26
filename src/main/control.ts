/** Takeover is acknowledged only after the in-flight browser action settles. */
export class RunControl {
  private paused = true;
  private active: Promise<unknown> | null = null;
  resume() {
    this.paused = false;
  }
  async pause() {
    this.paused = true;
    await this.active?.catch(() => {});
  }
  async perform<T>(action: () => Promise<T>): Promise<T> {
    if (this.paused) throw new Error('浏览器已暂停，请重新观察页面后继续');
    if (this.active) throw new Error('浏览器正忙');
    const current = action();
    this.active = current;
    try {
      return await current;
    } finally {
      if (this.active === current) this.active = null;
    }
  }
}
