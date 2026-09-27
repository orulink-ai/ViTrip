import { test, expect, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('后台 Electron 可交互与截图，打开深链接也不显示窗口或抢焦点', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vitrip-background-'));
  // Reuse built renderer assets without replacing the main task's app bundle.
  const entry = resolve(`dist/background-check-${process.pid}.mjs`);
  execFileSync('node_modules/.bin/esbuild', [
    'src/main/index.ts',
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--external:electron',
    '--external:@earendil-works/*',
    '--external:sanitize-html',
    `--outfile=${entry}`,
  ]);
  const app = await electron.launch({
    args: [entry],
    env: { ...process.env, VITRIP_TEST_DATA: directory, VITRIP_TEST_SHOW: '0' },
  });
  try {
    const page = await app.firstWindow();
    const state = () =>
      app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return {
          visible: window.isVisible(),
          focused: window.isFocused(),
          focusable: window.isFocusable(),
          throttled: window.webContents.backgroundThrottling,
        };
      });
    expect(await state()).toEqual({
      visible: false,
      focused: false,
      focusable: false,
      throttled: false,
    });
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(page.getByRole('region', { name: '交互行程正文' })).toBeVisible();
    expect((await page.screenshot({ timeout: 8000 })).length).toBeGreaterThan(1000);
    const tripId = await page.evaluate(async () => {
      const snapshot = await window.vitrip.init();
      return snapshot.trips[0].id;
    });
    const url = `vitrip://trip/${encodeURIComponent(tripId)}`;
    await app.evaluate(({ app }, url) => app.emit('open-url', { preventDefault() {} }, url), url);
    expect(await state()).toEqual({
      visible: false,
      focused: false,
      focusable: false,
      throttled: false,
    });
  } finally {
    await app.close();
    await rm(entry, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});
