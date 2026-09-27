import { backgroundTest } from './test-window-policy';
import { WebContentsView } from 'electron';
import type { PhotoCandidate } from '../shared/photos';
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
  private photoRefs = new Map<number, { revision: number; candidate: PhotoCandidate }>();
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
      this.photoRefs.clear();
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.view.webContents.loadURL(allowedURL(url)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.view.webContents.stop();
            reject(new Error('网页访问超过 15 秒，请换来源或保存待采集事项'));
          }, 15000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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
  async photoCandidates(): Promise<PhotoCandidate[]> {
    this.sequence += 1000;
    const revision = this.revision;
    const candidates = z
      .array(
        z.object({
          ref: z.number(),
          pageUrl: z.string().url(),
          pageTitle: z.string(),
          imageUrl: z.string().url(),
          alt: z.string(),
          context: z.string(),
          width: z.number(),
          height: z.number(),
        }),
      )
      .parse(
        await this.evaluate(`(() => {
      const refs=new Map();globalThis.__vitripPhotoRefs=refs;
      let index=${this.sequence};
      return [...document.images].filter(el=>{const r=el.getBoundingClientRect();return el.complete&&el.naturalWidth>=80&&el.naturalHeight>=60&&r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'&&/^https?:/.test(el.currentSrc);}).slice(0,40).map(el=>{
        const ref=++index;refs.set(ref,el);
        return {ref,pageUrl:location.href,pageTitle:document.title.slice(0,500),imageUrl:el.currentSrc,alt:el.alt.slice(0,1000),context:(el.closest('figure')?.innerText||el.parentElement?.innerText||'').slice(0,2000),width:el.naturalWidth,height:el.naturalHeight};
      });
    })()`),
      );
    if (revision !== this.revision) throw new Error('页面已变化，请重新获取照片候选');
    this.photoRefs.clear();
    for (const candidate of candidates) this.photoRefs.set(candidate.ref, { revision, candidate });
    return candidates;
  }
  async capturePhoto(
    ref: number,
  ): Promise<{ candidate: PhotoCandidate; png: Buffer; width: number; height: number }> {
    const entry = this.photoRefs.get(ref);
    if (!entry || entry.revision !== this.revision) throw new Error('图片引用失效，请重新获取候选');
    const fingerprint = `(() => {const el=globalThis.__vitripPhotoRefs?.get(${ref});return el?.isConnected&&el.complete?JSON.stringify([el.currentSrc,el.alt.slice(0,1000),(el.closest('figure')?.innerText||el.parentElement?.innerText||'').slice(0,2000),location.href]):null;})()`;
    const current = await this.evaluate(fingerprint);
    if (
      current !==
      JSON.stringify([
        entry.candidate.imageUrl,
        entry.candidate.alt,
        entry.candidate.context,
        entry.candidate.pageUrl,
      ])
    )
      throw new Error('图片已变化，请重新获取候选');
    await this.command('Page.enable');
    const tree = await this.command('Page.getResourceTree');
    const resource = await this.command('Page.getResourceContent', {
      frameId: tree.frameTree.frame.id,
      url: entry.candidate.imageUrl,
    });
    if (
      !resource.base64Encoded ||
      typeof resource.content !== 'string' ||
      resource.content.length > 12 * 1024 * 1024
    )
      throw new Error('图片资源无效或超过大小限制');
    // Chromium decodes WebP/AVIF as well as JPEG/PNG. Decode only the bytes
    // already read from this page, in its isolated world, without another fetch.
    const image = z
      .object({
        data: z.string(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .parse(
        await this.evaluate(`(async()=>{
      const bytes=Uint8Array.from(atob(${JSON.stringify(resource.content)}),c=>c.charCodeAt(0));
      const bitmap=await createImageBitmap(new Blob([bytes]));
      try {
        if(bitmap.width*bitmap.height>24000000)throw new Error('图片分辨率过大');
        const scale=Math.min(1,1280/bitmap.width,1280/bitmap.height);
        const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
        const canvas=new OffscreenCanvas(width,height);
        canvas.getContext('2d').drawImage(bitmap,0,0,width,height);
        const blob=await canvas.convertToBlob({type:'image/png'});
        if(blob.size>8*1024*1024)throw new Error('图片缓存超过大小限制');
        const buffer=new Uint8Array(await blob.arrayBuffer());
        let text='';for(let i=0;i<buffer.length;i+=32768)text+=String.fromCharCode(...buffer.subarray(i,i+32768));
        return {data:btoa(text),width,height};
      } finally {bitmap.close();}
    })()`),
      );
    const png = Buffer.from(image.data, 'base64');
    if (png.length > 8 * 1024 * 1024) throw new Error('图片缓存超过大小限制');
    if (entry.revision !== this.revision || (await this.evaluate(fingerprint)) !== current)
      throw new Error('图片已变化，请重新获取候选');
    return { candidate: entry.candidate, png, width: image.width, height: image.height };
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
