import { selectNotebook } from './notebook-navigation';
import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../../src/main/storage';
import { NotebookDocuments } from '../../src/main/notebook-documents';

test('远程配图保存为本地附件：旧笔记补齐、新笔记保存、失败告警、断网重启显示', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN49+4dAAWYAsspex20AAAAAElFTkSuQmCC',
    'base64',
  );
  const server = createServer((req, res) => {
    if (req.url === '/missing') {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.url === '/html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>denied</html>');
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(png);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('server');
  const url = `http://127.0.0.1:${address.port}`;
  const dir = await mkdtemp(join(tmpdir(), 'vitrip-local-images-'));
  const store = new Storage(dir, { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() });
  const trip = store.create();
  const docs = new NotebookDocuments(join(dir, 'journeys'));
  docs.write(trip.journeyId, {
    name: '旧图片.md',
    revision: null,
    markdown: `# 旧图片\n\n![餐厅测试图片](${url}/image.png)\n\n正文保留`,
  });
  store.save();
  store.close();
  const env = { ...process.env, VITRIP_TEST_DATA: dir };
  let app = await electron.launch({ args: ['.'], env });
  try {
    let page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await selectNotebook(page, '旧图片.md');
    const visibleImage = () =>
      page
        .getByRole('article', { name: '旅行笔记页面' })
        .getByRole('img', { name: '餐厅测试图片', exact: true });
    await expect(visibleImage()).toBeVisible();
    await expect
      .poll(() => visibleImage().evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const persisted = await readFile(
      join(dir, 'journeys', trip.journeyId, 'notebook/旧图片.md'),
      'utf8',
    );
    expect(persisted).toMatch(/!\[餐厅测试图片\]\(assets\/[a-f0-9]{64}\.png\)/);
    const asset = persisted.match(/assets\/[a-f0-9]{64}\.png/)![0];
    expect(
      (await readFile(join(dir, 'journeys', trip.journeyId, 'notebook', asset))).length,
    ).toBeGreaterThan(0);
    const results = await page.evaluate(
      async ({ id, url }) => {
        const good = await window.vitrip.writeDocument(id, {
          name: '新图片.md',
          revision: null,
          markdown: `![新图片](${url}/image.png)`,
        });
        const bad = await window.vitrip.writeDocument(id, {
          name: '失败图片.md',
          revision: null,
          markdown: `用户正文\n![失败](${url}/missing)\n![假图片](${url}/html)`,
        });
        return { good, bad };
      },
      { id: trip.journeyId, url },
    );
    expect(results.good.markdown).toContain('assets/');
    expect(results.bad.markdown).toContain('用户正文');
    expect(results.bad.imageWarnings).toHaveLength(2);
    await selectNotebook(page, '失败图片.md');
    await expect(page.getByText(/图片未保存：.*HTTP 403/)).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: '正文已保存，配图未完成' }),
    ).toBeVisible();
    await selectNotebook(page, '旧图片.md');
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    await page.getByRole('tab', { name: '笔记本', exact: true }).click();
    await expect(visibleImage()).toBeVisible();
    await expect
      .poll(() => visibleImage().evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await page.screenshot({ path: 'artifacts/notebook-local-images.png' });
  } finally {
    await app.close();
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
