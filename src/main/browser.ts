import { backgroundTest } from './test-window-policy';
import { WebContentsView } from 'electron';
import { z } from 'zod';
import { allowedURL, needsApproval } from '../shared/policy';
import type { Bounds, BrowserState } from '../shared/types';
const targetSchema = z.object({
  x: z.number(),
  y: z.number(),
  label: z.string(),
  secret: z.boolean(),
  submit: z.boolean(),
});
export class Browser {
  readonly view = new WebContentsView({
    webPreferences: {
      backgroundThrottling: !backgroundTest(),
      partition: 'persist:vitrip-browser',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  private sequence = 0;
  private revision = 0;
  constructor(
    private changed: (state: BrowserState) => void,
    private error: (text: string) => void,
  ) {
    const page = this.view.webContents;
    this.view.setBounds({ x: 700, y: 124, width: 700, height: 740 });
    page.session.setPermissionRequestHandler((_page, _permission, callback) => callback(false));
    page.session.setPermissionCheckHandler(() => false);
    page.session.on('will-download', (event) => {
      event.preventDefault();
      this.error('当前版本暂不支持网页文件下载。');
    });
    page.setWindowOpenHandler(({ url }) => {
      void this.navigate(url).catch((e) => this.error(String(e)));
      return { action: 'deny' };
    });
    page.on('will-navigate', (event, url) => {
      try {
        allowedURL(url);
      } catch {
        event.preventDefault();
      }
    });
    page.on('will-redirect', (event, url) => {
      try {
        allowedURL(url);
      } catch {
        event.preventDefault();
      }
    });
    page.on('did-start-navigation', () => {
      this.revision++;
    });
    const broadcast = () => this.changed(this.state());
    page.on('did-navigate', broadcast);
    page.on('did-navigate-in-page', broadcast);
    page.on('page-title-updated', broadcast);
    page.on('did-start-loading', broadcast);
    page.on('did-stop-loading', broadcast);
    page.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.error('网页加载失败：' + description);
    });
  }
  state(): BrowserState {
    const page = this.view.webContents;
    return {
      url: page.getURL(),
      title: page.getTitle(),
      loading: page.isLoading(),
      canBack: page.navigationHistory.canGoBack(),
      canForward: page.navigationHistory.canGoForward(),
    };
  }
  bounds(value: Bounds) {
    if (value.width > 0 && value.height > 0)
      this.view.setBounds({
        x: Math.max(0, Math.round(value.x)),
        y: Math.max(0, Math.round(value.y)),
        width: Math.round(value.width),
        height: Math.round(value.height),
      });
    this.view.setVisible(value.visible);
  }
  async navigate(url: string) {
    await this.view.webContents.loadURL(allowedURL(url));
    return '网页已打开。请 observe 读取页面。';
  }
  history(action: 'back' | 'forward' | 'reload') {
    const page = this.view.webContents;
    if (action === 'back' && page.navigationHistory.canGoBack()) page.navigationHistory.goBack();
    if (action === 'forward' && page.navigationHistory.canGoForward())
      page.navigationHistory.goForward();
    if (action === 'reload') page.reload();
  }
  private async evaluate(code: string): Promise<unknown> {
    return this.view.webContents.executeJavaScriptInIsolatedWorld(1004, [{ code }], true);
  }
  async observe(): Promise<string> {
    this.sequence += 1000;
    const result = await this.evaluate(`(() => {
      const refs = new Map(); globalThis.__vitripRefs = refs;
      let index = ${this.sequence};
      const elements = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(el => {const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';}).slice(0,250).map(el=>{
        const ref=++index;refs.set(ref,el);
        const sensitive=el.type==='password'||/cc-|password|one-time-code/.test(el.autocomplete||'')||/密码|验证码|卡号|安全码|password|credit card|cvv|cvc|otp/i.test(el.getAttribute('aria-label')||el.getAttribute('name')||'');
        const value=!sensitive&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName)?String(el.value).slice(0,1000):undefined;
        return {ref,value,sensitive,tag:el.tagName.toLowerCase(),type:el.getAttribute('type'),label:(el.getAttribute('aria-label')||el.innerText||el.getAttribute('placeholder')||el.getAttribute('name')||'').slice(0,160),href:el.tagName==='A'?el.href:undefined};
      });
      globalThis.__vitripFingerprint=JSON.stringify([location.href,document.body?.innerText,[...document.querySelectorAll('input,textarea,select')].map(el=>el.value)]);
      return JSON.stringify({url:location.href,title:document.title,text:document.body?.innerText.slice(0,18000)||'',elements});
    })()`);
    return z.string().parse(result);
  }
  async assertFresh(): Promise<void> {
    await this.evaluate(
      `(() => {const current=JSON.stringify([location.href,document.body?.innerText,[...document.querySelectorAll('input,textarea,select')].map(el=>el.value)]);if(current!==globalThis.__vitripFingerprint)throw new Error('页面已变化，旧决策已取消，请重新观察');})()`,
    );
  }
  private async target(ref: number) {
    const result = await this.evaluate(`(() => {
      const el=globalThis.__vitripRefs?.get(${ref});
      if(!el||!el.isConnected)throw new Error('元素引用失效，请重新 observe');
      el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      const r=el.getBoundingClientRect();
      if(!r.width||!r.height)throw new Error('元素不可见，请重新 observe');
      const label=(el.getAttribute('aria-label')||el.innerText||el.getAttribute('placeholder')||el.getAttribute('name')||'').slice(0,160);
      return {x:r.x+r.width/2,y:r.y+r.height/2,label,secret:el.type==='password'||/cc-|password|one-time-code/.test(el.autocomplete||'')||/密码|验证码|卡号|安全码|password|credit card|cvv|cvc|otp/i.test(label),submit:!!el.form&&((el.tagName==='BUTTON'&&el.type==='submit')||el.type==='submit')};
    })()`);
    return targetSchema.parse(result);
  }
  private command(method: string, params?: Record<string, unknown>) {
    const debug = this.view.webContents.debugger;
    if (!debug.isAttached()) debug.attach('1.3');
    return debug.sendCommand(method, params);
  }
  async click(ref: number, approve: (label: string) => Promise<void>) {
    const target = await this.target(ref);
    const revision = this.revision;
    if (target.secret) throw new Error('请用户接管后填写密码或支付信息。');
    if (target.submit || needsApproval(target.label))
      await approve(`点击「${target.label || '提交表单'}」`);
    if (revision !== this.revision) throw new Error('页面已变化，请重新 observe');
    const next = await this.target(ref);
    await this.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: next.x, y: next.y });
    await this.evaluate(
      `(() => {const dot=document.createElement('div');dot.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #55784d;background:#72995a33;border-radius:50%;width:28px;height:28px;left:${next.x - 14}px;top:${next.y - 14}px';document.documentElement.appendChild(dot);dot.animate([{transform:'scale(.6)',opacity:1},{transform:'scale(1.5)',opacity:0}],{duration:700}).onfinish=()=>dot.remove();})()`,
    );
    await this.command('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: next.x,
      y: next.y,
      button: 'left',
      clickCount: 1,
    });
    await this.command('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: next.x,
      y: next.y,
      button: 'left',
      clickCount: 1,
    });
    return '已点击。页面可能发生变化，请重新 observe。';
  }
  async type(ref: number, text: string) {
    const target = await this.target(ref);
    if (target.secret) throw new Error('请用户接管后填写密码或支付信息。');
    await this.evaluate(
      `(() => {const el=globalThis.__vitripRefs?.get(${ref});if(!el||!el.isConnected)throw new Error('元素引用失效');if(!['INPUT','TEXTAREA'].includes(el.tagName))throw new Error('请选择文本输入框');el.focus();el.select();})()`,
    );
    await this.command('Input.insertText', { text });
    return '已填写文本，尚未提交。';
  }
  async press(key: string, approve: (label: string) => Promise<void>) {
    if (key === 'Enter') await approve('按 Enter，可能提交当前表单');
    const codes: Record<string, number> = {
      Enter: 13,
      Tab: 9,
      Escape: 27,
      ArrowDown: 40,
      ArrowUp: 38,
      Backspace: 8,
    };
    await this.command('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: key,
      windowsVirtualKeyCode: codes[key],
    });
    await this.command('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: key,
      windowsVirtualKeyCode: codes[key],
    });
    return '已按键，请重新 observe。';
  }
  async scroll(direction: string) {
    await this.evaluate(
      `window.scrollBy({top:${direction === 'down' ? 650 : -650},behavior:'instant'})`,
    );
    return '已滚动。';
  }
  cancel() {
    if (this.view.webContents.isLoading()) this.view.webContents.stop();
  }
  destroy() {
    this.view.webContents.close();
  }
}
