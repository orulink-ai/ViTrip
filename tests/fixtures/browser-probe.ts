import { backgroundTest } from '../../src/main/test-window-policy';
import { app, BrowserWindow } from 'electron';
import { Browser } from '../../src/main/browser';
const background = backgroundTest();
if (background && process.platform === 'darwin') app.setActivationPolicy('accessory');
if (process.env.VITRIP_TEST_DATA) app.setPath('userData', process.env.VITRIP_TEST_DATA);
void app.whenReady().then(() => {
  const window = new BrowserWindow({
    show: !background,
    focusable: !background,
    skipTaskbar: background,
    width: 900,
    height: 700,
    webPreferences: { backgroundThrottling: !background },
  });
  const browser = new Browser(
    () => {},
    () => {},
  );
  window.contentView.addChildView(browser.view);
  browser.bounds({ x: 0, y: 0, width: 900, height: 700, visible: true });
  Object.assign(globalThis, { probeBrowser: browser });
  void window.loadURL('about:blank');
});
