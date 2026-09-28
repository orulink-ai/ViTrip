import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shellQuote } from '../../src/main/host-environment';

test('会话模型自动保存，运行和排队消息保留发送时配置，其他会话独立且重启不丢失', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vitrip-settings-ui-'));
  await mkdir(path.join(dir, 'bin'));
  await writeFile(
    path.join(dir, 'bin/codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 999.0.0"; exit 0; fi\nexec ${shellQuote(process.execPath)} ${shellQuote(path.resolve('tests/fixtures/codex-app-server.mjs'))}\n`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    VITRIP_TEST_DATA: path.join(dir, 'data'),
    PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH,
  };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    const tripId = (await page.evaluate(() => window.vitrip.init())).activeTripId;
    const second = await page.evaluate(async (id) => {
      const other = await window.vitrip.create();
      await window.vitrip.select(id);
      return other.id;
    }, tripId);
    await page.reload();
    const selectModel = async (name: string) => {
      await page.getByRole('button', { name: '模型设置', exact: true }).first().click();
      const dialog = page.getByRole('dialog');
      if (
        name === 'GPT Luna' &&
        !(await dialog.getByLabel('Codex 模型', { exact: true }).count())
      ) {
        await dialog.getByRole('combobox', { name: '执行引擎', exact: true }).click();
        await page.getByRole('option', { name: 'Codex · 本机登录', exact: true }).click();
      }
      await dialog.getByLabel('Codex 模型', { exact: true }).click();
      await page.getByRole('option', { name, exact: true }).click();
      await expect(dialog.getByRole('status', { name: '' })).toContainText('已自动保存');
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    };
    await selectModel('GPT Luna');
    await expect(page.getByRole('button', { name: '选择 Codex 模型和思考强度' })).toContainText(
      'gpt-6-luna',
    );
    await page.getByLabel('旅行需求', { exact: true }).fill('wait');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    const actualSettings = async () =>
      JSON.parse(
        await readFile(path.join(dir, 'data/sessions', tripId, 'turn-settings.json'), 'utf8').catch(
          (e: NodeJS.ErrnoException) => {
            if (e.code === 'ENOENT') return 'null';
            throw e;
          },
        ),
      );
    await expect.poll(actualSettings).toEqual({ model: 'gpt-6-luna', effort: 'medium' });
    await selectModel('GPT Sol');
    expect((await page.evaluate(() => window.vitrip.init())).running).toBe(true);
    expect(await actualSettings()).toEqual({ model: 'gpt-6-luna', effort: 'medium' });
    await page.getByLabel('旅行需求', { exact: true }).fill('后续安排');
    await page.getByRole('button', { name: '加入队列', exact: true }).click();
    await expect(page.getByLabel('待发送消息')).toContainText('后续安排');
    await selectModel('GPT Luna');
    // A different conversation can be configured while this one is running.
    await page.evaluate(
      (id) =>
        window.vitrip.conversationSettings(id, {
          runtime: 'codex',
          codexModel: 'gpt-6-sol',
          codexEffort: 'high',
        }),
      second,
    );
    expect((await page.evaluate(() => window.vitrip.init())).running).toBe(true);
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await page.getByRole('button', { name: '继续发送队列', exact: true }).click();
    await expect.poll(actualSettings).toEqual({ model: 'gpt-6-sol', effort: 'medium' });
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    await page.evaluate((id) => window.vitrip.select(id), second);
    await page.reload();
    await expect(page.getByRole('button', { name: '选择 Codex 模型和思考强度' })).toContainText(
      'gpt-6-sol · high',
    );
    await page.evaluate((id) => window.vitrip.select(id), tripId);
    await page.reload();
    await expect(page.getByRole('button', { name: '选择 Codex 模型和思考强度' })).toContainText(
      'gpt-6-luna',
    );
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    const restored = await page.evaluate(() => window.vitrip.init());
    expect(restored.trips.find((t) => t.id === tripId)?.settings?.codexModel).toBe('gpt-6-luna');
    expect(restored.trips.find((t) => t.id === second)?.settings?.codexEffort).toBe('high');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
