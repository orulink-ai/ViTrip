import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('内嵌浏览器先关闭后，桌面窗口仍能正常退出', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-window-lifecycle-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  const child = app.process();
  let errors = '';
  child.stderr?.on('data', (chunk) => {
    errors += String(chunk);
  });
  try {
    await app.firstWindow();
    await app.evaluate(() => {
      process.on('uncaughtException', (error) => console.error('UNCAUGHT_EXIT', error.stack));
    });
    const closed = await app.evaluate(({ BrowserWindow, webContents }) => {
      const windows = new Set(BrowserWindow.getAllWindows().map((window) => window.webContents.id));
      const embedded = webContents
        .getAllWebContents()
        .filter((contents) => !windows.has(contents.id));
      for (const contents of embedded) contents.close();
      return embedded.length;
    });
    expect(closed).toBeGreaterThan(0);
    await expect
      .poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().length))
      .toBe(1);
    await app.close();
    expect(errors).not.toContain('UNCAUGHT_EXIT');
    expect(child.exitCode === 0 || child.signalCode !== null).toBe(true);
  } finally {
    if (child.exitCode === null && child.signalCode === null) await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('主窗口销毁后，后续页面权限检查安全拒绝且不抛异常', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-permission-lifecycle-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  const child = app.process();
  let errors = '';
  child.stderr?.on('data', (chunk) => {
    errors += String(chunk);
  });
  try {
    await app.firstWindow();
    await app.evaluate(() => {
      process.on('uncaughtException', (error) => console.error('UNCAUGHT_EXIT', error.stack));
    });
    const permission = await app.evaluate(async ({ BrowserWindow }) => {
      const original = BrowserWindow.getAllWindows()[0];
      const probe = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
      original.destroy();
      await probe.loadURL('data:text/html,<title>Permission lifecycle probe</title>');
      return await probe.webContents.executeJavaScript(
        "navigator.permissions.query({ name: 'microphone' }).then(permission => permission.state)",
      );
    });
    expect(permission).toBe('denied');
    await app.close();
    expect(errors).not.toContain('UNCAUGHT_EXIT');
  } finally {
    if (child.exitCode === null && child.signalCode === null) await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
