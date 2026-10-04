import type { NarrationSegment } from '../shared/day-narration';
import type { MapViewStatus, MapViewTarget } from '../shared/map-view';
export type NarrationPhase =
  'ready' | 'locating' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
export interface NarrationState {
  index: number;
  phase: NarrationPhase;
  message?: string;
}
export interface NarrationDriver {
  show(target: MapViewTarget): Promise<MapViewStatus>;
  speak(text: string, started: () => void): Promise<void>;
  cancel(): void;
}
/** Generation tokens prevent cancelled audio/map receipts from advancing another segment. */
export class NarrationPlayer {
  state: NarrationState = { index: 0, phase: 'ready' };
  private generation = 0;
  constructor(
    readonly segments: NarrationSegment[],
    private driver: NarrationDriver,
    private changed: (state: NarrationState) => void,
  ) {}
  private update(phase: NarrationPhase, message?: string) {
    this.state = { ...this.state, phase, message };
    this.changed(this.state);
  }
  play() {
    if (
      this.state.phase === 'ended' ||
      ['playing', 'locating', 'loading'].includes(this.state.phase)
    )
      return;
    void this.run();
  }
  private async run() {
    const generation = ++this.generation;
    const segment = this.segments[this.state.index];
    if (!segment) {
      this.end();
      return;
    }
    this.update('locating');
    try {
      const status = await this.driver.show(segment.target);
      if (generation !== this.generation) return;
      if (status !== 'shown') {
        this.update('paused', '地图未展示，请打开行程地图并开启跟随后继续。');
        return;
      }
      this.update('loading');
      await this.driver.speak(segment.text, () => {
        if (generation === this.generation) this.update('playing');
      });
      if (generation !== this.generation) return;
      if (this.state.index === this.segments.length - 1) this.end();
      else {
        this.state = { ...this.state, index: this.state.index + 1 };
        void this.run();
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.update('error', error instanceof Error ? error.message : '讲解播放失败，请重试。');
    }
  }
  pause(message?: string) {
    if (this.state.phase === 'ended') return;
    ++this.generation;
    this.driver.cancel();
    this.update('paused', message);
  }
  move(delta: number) {
    this.pause();
    this.state = {
      index: Math.max(0, Math.min(this.segments.length - 1, this.state.index + delta)),
      phase: 'paused',
    };
    this.play();
  }
  end() {
    ++this.generation;
    this.driver.cancel();
    this.update('ended');
  }
}
