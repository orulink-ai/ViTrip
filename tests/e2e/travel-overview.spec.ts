import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('旅行概览统计、完成状态和继续规划可用', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-overview-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const overview = page.getByRole('region', { name: '我的旅行', exact: true });
    await expect(overview.locator('dl')).toHaveText('规划中0趟已完成0趟累计旅行0趟');
    await page.evaluate(async () => {
      const trip = await window.vitrip.demo();
      await window.vitrip.create(trip.journeyId);
    });
    await page.reload();
    await expect(overview).toContainText('京都');
    await expect(overview.locator('dl')).toHaveText('规划中1趟已完成0趟累计旅行1趟');
    await overview.getByRole('button', { name: '旅行记录' }).click();
    await page.getByRole('button', { name: '标记完成' }).click();
    await page.keyboard.press('Escape');
    await expect(overview.locator('dl')).toHaveText('规划中0趟已完成1趟累计旅行1趟');
    await page.reload();
    await expect(overview.locator('dl')).toHaveText('规划中0趟已完成1趟累计旅行1趟');
    await overview.getByRole('button', { name: '旅行记录' }).click();
    await page.getByRole('button', { name: '恢复规划' }).click();
    await page.keyboard.press('Escape');
    await expect(overview.locator('dl')).toHaveText('规划中1趟已完成0趟累计旅行1趟');
    await page.screenshot({ path: 'artifacts/travel-overview.png' });
    await overview.getByRole('button', { name: /继续旅行：/ }).click();
    await expect(page.getByRole('tab', { name: '行程', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('首页仅展示两趟最近旅行，完整旅行记录按需查看', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-home-library-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      for (const title of ['香港', '京都', '普吉岛']) {
        const trip = await window.vitrip.demo();
        await window.vitrip.renameJourney(trip.journeyId, title);
        if (title === '京都') await window.vitrip.setJourneyCompleted(trip.journeyId, true);
      }
      await window.vitrip.createJourney('新的旅行');
    });
    await page.reload();
    const overview = page.getByRole('region', { name: '我的旅行', exact: true });
    await expect(overview.locator('li')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '普吉岛', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(overview.locator('dl')).toHaveText('规划中2趟已完成1趟累计旅行3趟');
    await expect(overview).toContainText('普吉岛');
    await page.screenshot({ path: 'artifacts/home-design-populated.png' });
    await overview.getByRole('button', { name: '旅行记录' }).click();
    await expect(page.getByRole('dialog').locator('li')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 720));
    await expect(page.getByLabel('旅行需求', { exact: true })).toBeInViewport({ ratio: 1 });
    const exploreBox = (await page
      .getByRole('button', { name: '展开探索地图', exact: true })
      .locator('..')
      .boundingBox())!;
    const reviewBox = (await overview
      .getByRole('button', { name: '继续旅行：京都', exact: true })
      .boundingBox())!;
    const overlap =
      Math.max(
        0,
        Math.min(exploreBox.x + exploreBox.width, reviewBox.x + reviewBox.width) -
          Math.max(exploreBox.x, reviewBox.x),
      ) *
      Math.max(
        0,
        Math.min(exploreBox.y + exploreBox.height, reviewBox.y + reviewBox.height) -
          Math.max(exploreBox.y, reviewBox.y),
      );
    expect(overlap).toBe(0);
    await page.screenshot({ path: 'artifacts/home-design-compact.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
