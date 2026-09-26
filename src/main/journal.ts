import sanitize from 'sanitize-html';
import type { Journey } from '../shared/types';
import { planHTML } from './export';
import { mapSummaryHTML } from './map-summary';
export const escapeHTML = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function cleanJournal(html: string) {
  return sanitize(html, {
    allowedTags: [
      ...sanitize.defaults.allowedTags,
      'style',
      'details',
      'summary',
      'section',
      'article',
      'header',
      'footer',
      'nav',
      'main',
      'span',
      'div',
      'br',
      'hr',
    ],
    allowedAttributes: {
      '*': ['class', 'id', 'style', 'title'],
      a: ['href', 'title'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      details: ['open'],
    },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    allowVulnerableTags: true,
    nonTextTags: ['script', 'textarea', 'option', 'title'],
    transformTags: {
      a: (_tag, attributes) => ({ tagName: 'a', attribs: { ...attributes, rel: 'noreferrer' } }),
    },
  });
}
export function journalHTML(journey: Journey) {
  const custom = cleanJournal(
    journey.plan
      ? planHTML(journey.plan)
      : journey.html ||
          `<header><small>ViTrip / YOUR TRAVEL JOURNAL</small><h1>${escapeHTML(journey.title)}</h1><p>边聊边完善，每一个重要问题都有归处。</p></header>`,
  );
  const labels = { confirmed: '已确认', reference: '参考建议', pending: '待核实' };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${escapeHTML(journey.title)} · ViTrip</title><style>html{scroll-behavior:smooth}body{margin:0;padding:32px;font:14px/1.7 system-ui;background:#fff;color:#171717;overflow-wrap:anywhere}h1{font-size:30px;line-height:1.3}h2{font-size:20px}a{color:inherit;text-decoration:underline}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #e5e5e5}section,article{max-width:100%}#vitrip-knowledge{margin-top:36px;border-top:1px solid #e5e5e5;padding-top:24px}#vitrip-knowledge article{border-bottom:1px solid #e5e5e5;padding:16px 0}#vitrip-knowledge small{color:#737373}#vitrip-knowledge h3{margin:8px 0}#vitrip-knowledge p{white-space:pre-wrap;margin:8px 0}#vitrip-knowledge a{margin-right:12px}nav{display:flex;gap:12px;flex-wrap:wrap}footer{color:#737373;font-size:12px;margin-top:28px}@media print{body{padding:12px}article{break-inside:avoid}}</style></head><body>${custom}${journey.plan && journey.html ? `<details><summary>旧版手册（历史记录）</summary>${cleanJournal(journey.html).replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')}</details>` : ''}${mapSummaryHTML(journey.plan)}<section id="vitrip-knowledge"><h2>已整理的问题与提醒</h2><p>同一趟旅行的所有会话共享。已确认内容、参考建议与待核实事项分别标注。</p><nav>${[...new Set(journey.entries.map((e) => e.category))].map((category) => `<span>${escapeHTML(category)}</span>`).join(' · ')}</nav>${
    journey.entries
      .map(
        (e) =>
          `<article><small>${escapeHTML(e.category)} · ${labels[e.status]}</small><h3>${escapeHTML(e.question)}</h3><p>${escapeHTML(e.answer)}</p>${e.sources
            .filter((url) => /^https?:\/\//i.test(url))
            .map((url, i) => `<a href="${escapeHTML(url)}" rel="noreferrer">来源 ${i + 1} ↗</a>`)
            .join('')}</article>`,
      )
      .join('') || '<p>聊到的重要偏好、决定和疑问会陆续整理在这里。</p>'
  }</section><footer>ViTrip · 旅行手册 v${journey.revision} · 信息会随交流继续完善</footer></body></html>`;
}
