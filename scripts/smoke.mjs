import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// Use a real, deterministic page: public example sites can change their content.
const fixtureText = 'ViTrip packaged browser verification';
const fixture = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>ViTrip test</title><h1>' + fixtureText + '</h1>');
});
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
const fixtureURL = 'http://127.0.0.1:' + fixture.address().port + '/';
const directory = await mkdtemp(path.join(os.tmpdir(), 'vitrip-package-'));
const child = spawn(
  path.resolve('release/mac-arm64/ViTrip.app/Contents/MacOS/ViTrip'),
  ['--remote-debugging-port=0'],
  { env: { ...process.env, VITRIP_TEST_DATA: directory }, stdio: ['ignore', 'pipe', 'pipe'] },
);
const sockets = [];
async function connect(url) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => {
        ws.removeEventListener('message', receive);
        reject(new Error('CDP timeout: ' + method));
      }, 15000);
      const receive = (e) => {
        const data = JSON.parse(e.data);
        if (data.id === current) {
          clearTimeout(timer);
          ws.removeEventListener('message', receive);
          data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
        }
      };
      ws.addEventListener('message', receive);
      ws.send(JSON.stringify({ id: current, method, params }));
    });
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('调试端口未启动')), 20000);
    child.stderr.on('data', (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on('error', reject);
    child.on('exit', () => reject(new Error('安装包提前退出')));
  });
  const origin = 'http://' + new URL(endpoint).host;
  const targets = () => fetch(origin + '/json/list').then((r) => r.json());
  let shell;
  for (let n = 0; n < 100; n++) {
    shell = (await targets()).find((t) => t.url.includes('/renderer/index.html'));
    if (shell) break;
    await delay(100);
  }
  if (!shell) throw new Error('主界面未启动');
  const call = await connect(shell.webSocketDebuggerUrl);
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error('页面执行失败：' + JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  for (let n = 0; n < 100; n++) {
    if (await evaluate("document.body?.innerText.includes('下一站，去哪里？')")) break;
    await delay(100);
  }
  if (!(await evaluate("document.body?.innerText.includes('下一站，去哪里？')")))
    throw new Error('UI未渲染');
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='先看看一份示例行程').click()",
  );
  for (let n = 0; n < 50; n++) {
    if (await evaluate('document.querySelector(\'[aria-label="行程交互地图"]\') !== null')) break;
    await delay(100);
  }
  if (!(await evaluate('document.querySelector(\'[aria-label="行程交互地图"]\') !== null')))
    throw new Error('行程未渲染');
  await evaluate(`window.vitrip.browse(${JSON.stringify(fixtureURL)})`);
  const guest = (await targets()).find((t) => t.url === fixtureURL);
  if (!guest) throw new Error('真实网页未打开');
  const guestCall = await connect(guest.webSocketDebuggerUrl);
  const content = await guestCall('Runtime.evaluate', {
    expression:
      "({text:document.body?.innerText,isolated:typeof window.vitrip==='undefined'&&typeof window.require==='undefined'})",
    returnByValue: true,
  });
  if (!content.result.value.text.includes(fixtureText) || !content.result.value.isolated)
    throw new Error('浏览器隔离或页面内容验证失败');
  console.log(
    JSON.stringify({
      packagedApp: 'passed',
      demo: 'passed',
      liveHTTPBrowser: 'passed',
      remotePageIsolation: true,
    }),
  );
} finally {
  fixture.closeAllConnections();
  fixture.close();
  for (const socket of sockets) socket.close();
  if (child.exitCode === null) {
    const ended = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await ended;
  }
  await rm(directory, { recursive: true, force: true });
}
