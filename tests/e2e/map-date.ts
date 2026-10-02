import { expect, type Page } from '@playwright/test';
export async function selectMapDay(page: Page, day: number) {
  await page.getByRole('combobox', { name: '地图日期', exact: true }).click();
  await page.getByRole('option', { name: new RegExp(`^第 ${day} 天`) }).click();
}
export async function expectMapDay(page: Page, day: number) {
  await expect(page.getByRole('combobox', { name: '地图日期', exact: true })).toContainText(
    `第 ${day} 天`,
  );
}
