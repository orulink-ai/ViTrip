import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import type { WebContents } from 'electron';
import type { Bounds } from '../shared/types';

import { zoomShortcut, type ZoomAction } from '../shared/interface-zoom';
export { zoomShortcut } from '../shared/interface-zoom';
const steps = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export function nextZoomFactor(factor: number, action: ZoomAction): number {
  if (action === 'reset') return 1;
  return action === 'in'
    ? (steps.find((step) => step > factor + 0.001) ?? 2)
    : ([...steps].reverse().find((step) => step < factor - 0.001) ?? 0.5);
}
export function scaleZoomBounds(bounds: Bounds, factor: number): Bounds {
  return {
    ...bounds,
    x: bounds.x * factor,
    y: bounds.y * factor,
    width: bounds.width * factor,
    height: bounds.height * factor,
  };
}
export class ZoomPreference {
  factor = 1;
  constructor(private readonly file: string) {
    try {
      const { factor } = JSON.parse(readFileSync(file, 'utf8'));
      if (typeof factor === 'number' && Number.isFinite(factor) && factor >= 0.5 && factor <= 2)
        this.factor = factor;
    } catch {
      /* Missing or invalid preferences use the default size. */
    }
  }
  change(action: ZoomAction) {
    const factor = nextZoomFactor(this.factor, action);
    writeFileSync(this.file + '.tmp', JSON.stringify({ factor }), { mode: 0o600 });
    renameSync(this.file + '.tmp', this.file);
    this.factor = factor;
    return factor;
  }
}
/** Apply one application-wide scale even when focus or the embedded page's origin changes. */
export class InterfaceZoom {
  private readonly preference: ZoomPreference;
  constructor(
    file: string,
    private readonly surfaces: WebContents[],
    private readonly changed: () => void,
  ) {
    this.preference = new ZoomPreference(file);
    for (const surface of surfaces) {
      surface.on('did-finish-load', () => this.apply());
      surface.on('before-input-event', (event, input) => {
        const action = zoomShortcut(input, process.platform);
        if (!action) return;
        event.preventDefault();
        this.change(action);
      });
      surface.on('zoom-changed', (_event, direction) =>
        this.change(direction === 'in' ? 'in' : 'out'),
      );
    }
    this.apply();
  }
  change(action: ZoomAction) {
    this.preference.change(action);
    this.apply();
  }
  private apply() {
    for (const surface of this.surfaces)
      if (!surface.isDestroyed()) surface.setZoomFactor(this.preference.factor);
    this.changed();
  }
}
