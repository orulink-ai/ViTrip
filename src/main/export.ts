import type { Plan } from '../shared/types';
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function planHTML(plan: Plan) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(plan.title)} · ViTrip</title><style>body{font:14px/1.7 system-ui;background:#fff;color:#171717;max-width:850px;margin:32px auto;padding:0 24px}header{border-bottom:1px solid #e5e5e5;padding-bottom:24px}h1{font-size:30px;line-height:1.3}section{margin:24px 0}article{margin:20px 0}small,p{color:#737373}a{color:inherit;text-decoration:underline}@media print{body{margin:0}section{break-inside:avoid}}</style><header><small>ViTrip / YOUR NEXT CHAPTER</small><h1>${escape(plan.title)}</h1><p>${escape(plan.subtitle)}</p><b>${escape(plan.budget)}</b></header>${plan.days.map((day) => `<section><h2>${escape(day.title)}</h2><p>${escape(day.subtitle)}</p>${day.activities.map((item) => `<article><small>${escape(item.time)}</small><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p>${item.url && /^https?:\/\//.test(item.url) ? `<a href="${escape(item.url)}" rel="noreferrer">参考来源 ↗</a>` : ''}</article>`).join('')}</section>`).join('')}<footer>由 ViTrip 整理 · 价格与开放时间请以预订页面为准</footer></html>`;
}
