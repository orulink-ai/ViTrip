import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import type { ToolActivity } from '../../src/shared/types';
test('连续文档操作默认收起，显示保存数量，展开能区分文件和操作', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-document-ui-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const steps: ToolActivity[] = [
    { action: 'list' },
    { action: 'read', name: '交通方案.md' },
    { action: 'write', name: '交通方案.md' },
    { action: 'write', name: '旅行预算.md' },
  ].map((args, index) => ({
    id: String(index),
    name: 'notebook',
    input: JSON.stringify(args),
    output: '已完成',
    status: 'complete',
    startedAt: 1,
    finishedAt: 2,
  }));
  steps.push({
    id: 'journal',
    name: 'journal',
    input: '{}',
    output: '已完成',
    status: 'complete',
    startedAt: 1,
    finishedAt: 2,
  });
  trip.messages = [
    { id: 'q', role: 'user', content: '帮我整理交通费用，标清人民币价格和计费单位。' },
    {
      id: 'a',
      role: 'assistant',
      content: '已整理交通方案和旅行预算，保留泰铢原价及汇率来源。',
      activities: steps,
      parts: [
        { type: 'text', text: '已整理交通方案和旅行预算，保留泰铢原价及汇率来源。' },
        ...steps.map((s) => ({ type: 'tool' as const, toolId: s.id })),
      ],
    },
  ];
  store.save();
  store.close();
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, VITRIP_TEST_DATA: dir },
  });
  try {
    const page = await app.firstWindow();
    const group = page.getByTestId('document-activity-group');
    await expect(group.getByRole('button', { name: '已保存 2 份文档 · 查看过程' })).toBeVisible();
    await expect(page.getByText(/0.0 秒/)).not.toBeVisible();
    await expect(
      page.locator('#message-a .aui-assistant-action-bar-root').getByRole('button'),
    ).toHaveCount(3);
    await page.screenshot({
      path: 'artifacts/document-activity-summary.png',
      animations: 'disabled',
    });
    await group.getByRole('button', { name: '已保存 2 份文档 · 查看过程' }).click();
    await expect(group.getByRole('button', { name: /保存笔记 交通方案.md/ })).toBeVisible();
    await expect(group.getByRole('button', { name: /读取笔记 交通方案.md/ })).toBeVisible();
    await expect(group.getByRole('button', { name: /查看笔记目录/ })).toBeVisible();
    await expect(page.getByText(/0.0 秒/)).not.toBeVisible();
    await page.screenshot({
      path: 'artifacts/document-activity-expanded.png',
      animations: 'disabled',
    });
    await group.getByRole('button', { name: /保存笔记 交通方案.md/ }).click();
    await expect(group.getByText('Request', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
