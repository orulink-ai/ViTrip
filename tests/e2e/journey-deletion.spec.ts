import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Storage } from '../../src/main/storage';
test('删除旅行需确认，清理所属会话及文档，保留其他旅行并在重启后生效', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vitrip-delete-e2e-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const keep = store.createJourney('保留的旅行');
  const removed = store.createJourney('香港');
  const second = store.create(removed.journeyId);
  store.updateNotebook(removed.journeyId, { markdown: '香港笔记' });
  store.updateNotebook(keep.journeyId, { markdown: '需要保留' });
  store.close();
  const folder = path.join(dir, 'journeys', removed.journeyId, 'notebook');
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, '交通.md'), '# 交通');
  for (const trip of [removed, second, keep]) {
    const session = path.join(dir, 'sessions', trip.id);
    await mkdir(session, { recursive: true });
    await writeFile(path.join(session, 'fixture.txt'), 'test');
  }
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const openDelete = async (title: string) => {
      await page.getByRole('button', { name: '旅行操作 ' + title, exact: true }).click();
      await page.getByRole('menuitem', { name: '删除旅行', exact: true }).click();
    };
    await openDelete('香港');
    await expect(page.getByRole('dialog')).toContainText('2 个会话');
    await page.screenshot({
      path: 'artifacts/delete-journey-confirmation.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(
      (await page.evaluate(() => window.vitrip.init())).journeys.some(
        (j) => j.id === removed.journeyId,
      ),
    ).toBe(true);
    await access(folder);
    await openDelete('香港');
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: '旅行操作 香港', exact: true })).toHaveCount(0);
    const state = await page.evaluate(() => window.vitrip.init());
    expect(state.trips.map((t) => t.id)).toEqual([keep.id]);
    expect(state.activeTripId).toBe(keep.id);
    for (const file of [
      folder,
      path.join(dir, 'sessions', removed.id),
      path.join(dir, 'sessions', second.id),
    ])
      await expect(access(file)).rejects.toThrow();
    await access(path.join(dir, 'sessions', keep.id, 'fixture.txt'));
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await expect(
      page.getByRole('button', { name: '旅行操作 保留的旅行', exact: true }),
    ).toBeVisible();
    expect((await page.evaluate(() => window.vitrip.init())).journeys.map((j) => j.id)).toEqual([
      keep.journeyId,
    ]);
    await openDelete('保留的旅行');
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const fresh = await page.evaluate(() => window.vitrip.init());
    expect(fresh.trips).toHaveLength(1);
    expect(fresh.journeys).toHaveLength(1);
    expect(fresh.trips[0].messages).toEqual([]);
    expect(fresh.journeys[0].id).not.toBe(keep.journeyId);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
