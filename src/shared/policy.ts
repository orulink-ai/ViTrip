import type { PublicSettings, Settings } from './types';
export function allowedURL(input: string): string {
  const value = input.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : 'https://' + value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('仅支持 HTTP / HTTPS 网页，地址不能包含账号密码');
  }
  return url.href;
}
export function needsApproval(label: string): boolean {
  return /支付|付款|购买|下单|预订|预定|提交|确认订单|删除|发送|pay|purchase|book|reserve|confirm|checkout|submit|delete|send/i.test(
    label,
  );
}
export function redactSettings(settings: Settings): PublicSettings {
  return {
    baseURL: settings.baseURL,
    model: settings.model,
    hasKey: Boolean(settings.apiKey),
    ...(settings.jevApiKey ? { hasJevKey: true } : {}),
  };
}
