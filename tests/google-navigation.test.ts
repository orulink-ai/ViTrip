import { expect, it, vi } from 'vitest';
import { navigateGoogle } from '../src/main/google-navigation';

it('Google 验证页明确要求接管，不能报告已经取得搜索结果', async () => {
  const browser = {
    navigate: vi.fn().mockRejectedValue(new Error('ERR_ABORTED (-3)')),
    state: () => ({ url: 'https://www.google.com/sorry/index' }),
  };
  expect(await navigateGoogle(browser, 'https://www.google.com/search?q=Phuket')).toContain(
    '请用户接管',
  );
});
it('正常加载的验证页也明确提示尚未取得结果', async () => {
  const browser = {
    navigate: vi.fn().mockResolvedValue('网页已打开。'),
    state: () => ({ url: 'https://www.google.com/sorry/index' }),
  };
  expect(await navigateGoogle(browser, 'https://www.google.com/search?q=Phuket')).toContain(
    '尚未取得搜索结果',
  );
});
it('保留正常导航结果，不吞掉网络失败或其他来源错误', async () => {
  const browser = {
    navigate: vi.fn().mockResolvedValue('网页仍在加载'),
    state: () => ({ url: 'https://www.google.com/maps/search/' }),
  };
  expect(await navigateGoogle(browser, 'https://www.google.com/maps/search/')).toBe('网页仍在加载');
  browser.navigate.mockRejectedValue(new Error('ERR_INTERNET_DISCONNECTED'));
  await expect(navigateGoogle(browser, 'https://www.google.com/maps/search/')).rejects.toThrow(
    'ERR_INTERNET_DISCONNECTED',
  );
});
it('等待 Chromium 延迟提交的验证页跳转，不把初始导航中断当作网络故障', async () => {
  let observations = 0;
  const browser = {
    navigate: vi.fn().mockRejectedValue(new Error('ERR_ABORTED (-3)')),
    state: () => ({
      url:
        ++observations === 1
          ? 'https://www.google.com/search?q=Phuket'
          : 'https://www.google.com/sorry/index',
    }),
  };
  expect(await navigateGoogle(browser, 'https://www.google.com/search?q=Phuket')).toContain(
    '请用户接管',
  );
});
