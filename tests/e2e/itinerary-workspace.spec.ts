import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('行程仅有地图和准备待办，待办完成状态持久化且地图日期保留', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-two-tabs-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.route('https://tile.openstreetmap.org/**', (r) => r.abort());
    await page.getByRole('button', { name: '先看看一份示例行程' }).click();
    await expect(page.getByRole('tab', { name: '行程地图', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: '总览', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '参考资料', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '返回行程', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '地图第 2 天', exact: true }).click();
    await page.getByRole('tab', { name: '准备待办', exact: true }).click();
    await page.getByLabel('新的待办事项', { exact: true }).fill('带护照');
    await page.getByLabel('新的待办事项', { exact: true }).press('Enter');
    await page.getByRole('checkbox', { name: '带护照', exact: true }).check();
    await page.getByRole('tab', { name: '行程地图', exact: true }).click();
    await expect(page.getByRole('button', { name: '地图第 2 天', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.reload();
    await page.getByRole('tab', { name: '行程', exact: true }).click();
    await page.getByRole('tab', { name: '准备待办', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '带护照', exact: true })).toBeChecked();
    await expect(page.getByRole('tab', { name: '准备待办', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.waitForTimeout(300); // Let the official tab indicator settle for the screenshot.
    await page.screenshot({ path: 'artifacts/map-ux/preparation-workspace.png' });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
