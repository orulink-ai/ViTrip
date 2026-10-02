import { setTimeout as delay } from 'node:timers/promises';
interface GoogleBrowser {
  navigate(url: string): Promise<string>;
  state(): { url: string };
}

function verificationPage(url: string) {
  try {
    const page = new URL(url);
    return (
      page.protocol === 'https:' &&
      page.hostname === 'www.google.com' &&
      page.pathname.startsWith('/sorry/')
    );
  } catch {
    return false;
  }
}

/** A challenge redirect can abort Chromium's original navigation without a network failure. */
export async function navigateGoogle(browser: GoogleBrowser, url: string): Promise<string> {
  let result: string;
  try {
    result = await browser.navigate(url);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('ERR_ABORTED')) throw error;
    // Chromium may reject loadURL before the redirected document commits.
    for (let attempt = 0; attempt < 20 && !verificationPage(browser.state().url); attempt++)
      await delay(50);
    if (!verificationPage(browser.state().url)) throw error;
    result = '';
  }
  if (verificationPage(browser.state().url))
    return 'Google 要求人机验证，尚未取得搜索结果。请用户接管浏览器完成验证，不要自动绕过；随后 observe 核实页面。';
  return result;
}
