import type { Plan, ItinerarySource } from '../shared/types';
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const sourceLink = (url: string | undefined, label: string) => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
      return '';
    return `<a href="${escape(url)}" rel="noreferrer">${escape(label)} ↗</a>`;
  } catch {
    return '';
  }
};
const sourceHTML = (source: ItinerarySource | undefined) =>
  source
    ? `<details><summary>原文依据</summary><p>${escape(source.excerpt)}</p>${sourceLink(source.url, '查看原攻略')}</details>`
    : '';
const stayLabels = { planned: '原攻略安排 · 预订待确认', booked: '已预订', pending: '待确认' };
const kindLabels = { transport: '交通', activity: '游玩', meal: '餐饮', stay: '住宿' };
export function planHTML(plan: Plan) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(plan.title)} · ViTrip</title><style>body{font:14px/1.7 system-ui;background:#fff;color:#171717;max-width:850px;margin:32px auto;padding:0 24px}header{border-bottom:1px solid #e5e5e5;padding-bottom:24px}h1{font-size:30px;line-height:1.3}section{margin:24px 0}article{margin:20px 0}small,p{color:#737373}a{color:inherit;text-decoration:underline}@media print{body{margin:0}section{break-inside:avoid}}</style><header><small>ViTrip / YOUR NEXT CHAPTER</small><h1>${escape(plan.title)}</h1><p>${escape(plan.subtitle)}</p><b>${escape(plan.budget)}</b>${sourceHTML(plan.source)}</header>${plan.packing?.length ? `<section><h2>准备清单</h2><p>原攻略中的候选物品；完成状态请查看笔记本待办。</p><ul>${plan.packing.map((item) => `<li>${escape(item)}</li>`).join('')}</ul></section>` : ''}${plan.days.map((day) => `<section><h2>${escape(day.title)}</h2><p>${escape(day.subtitle)}</p>${day.stay ? `<p><strong>当晚住宿：${escape(day.stay.name)}</strong> · ${stayLabels[day.stay.status]} ${sourceLink(day.stay.sourceUrl, '住宿来源')}</p>` : ''}${day.issues?.length ? `<aside><h3>待确认</h3><ul>${day.issues.map((issue) => `<li>${escape(issue)}</li>`).join('')}</ul></aside>` : ''}${day.activities.map((item) => `<article><small>${escape(item.time)}${item.kind ? ` · ${kindLabels[item.kind]}` : ''}${item.optional ? ' · 可选' : ''}${item.optionGroup ? ` · 同组择一（${escape(item.optionGroup)}）` : ''}</small><h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p>${sourceHTML(item.source)}${item.url && /^https?:\/\//.test(item.url) ? `<a href="${escape(item.url)}" rel="noreferrer">参考来源 ↗</a>` : ''}</article>`).join('')}</section>`).join('')}<footer>由 ViTrip 整理 · 价格与开放时间请以预订页面为准</footer></html>`;
}
