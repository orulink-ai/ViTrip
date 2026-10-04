import { expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  nextZoomFactor,
  zoomShortcut,
  scaleZoomBounds,
  ZoomPreference,
} from '../src/main/interface-zoom';

it('uses familiar zoom steps with bounds and a 100% reset', () => {
  expect(nextZoomFactor(1, 'in')).toBe(1.1);
  expect(nextZoomFactor(1.1, 'out')).toBe(1);
  expect(nextZoomFactor(2, 'in')).toBe(2);
  expect(nextZoomFactor(0.5, 'out')).toBe(0.5);
  expect(nextZoomFactor(1.75, 'reset')).toBe(1);
});
it('handles Chrome-style shortcuts once, including unshifted plus, without intercepting typing', () => {
  const input = { type: 'keyDown', key: '=', meta: true, control: false, alt: false };
  expect(zoomShortcut(input, 'darwin')).toBe('in');
  expect(zoomShortcut({ ...input, key: '+' }, 'darwin')).toBe('in');
  expect(zoomShortcut({ ...input, key: '-' }, 'darwin')).toBe('out');
  expect(zoomShortcut({ ...input, key: '0' }, 'darwin')).toBe('reset');
  expect(zoomShortcut({ ...input, meta: false, control: true }, 'win32')).toBe('in');
  expect(zoomShortcut({ ...input, meta: false }, 'darwin')).toBeUndefined();
  expect(zoomShortcut({ ...input, type: 'keyUp' }, 'darwin')).toBeUndefined();
  expect(zoomShortcut({ ...input, alt: true }, 'darwin')).toBeUndefined();
});
it('keeps the embedded browser aligned with zoomed CSS bounds and preserves visibility', () => {
  expect(
    scaleZoomBounds({ x: 300, y: 100, width: 600, height: 400, visible: false }, 1.25),
  ).toEqual({ x: 375, y: 125, width: 750, height: 500, visible: false });
});
it('persists zoom across restarts and recovers invalid saved values to 100%', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vitrip-zoom-'));
  const file = join(dir, 'zoom.json');
  try {
    const preference = new ZoomPreference(file);
    expect(preference.factor).toBe(1);
    preference.change('in');
    expect(new ZoomPreference(file).factor).toBe(1.1);
    for (const invalid of ['broken', '{"factor":null}', '{"factor":100}']) {
      writeFileSync(file, invalid);
      expect(new ZoomPreference(file).factor).toBe(1);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
