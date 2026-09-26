import type { Plan } from '../shared/types';
import { itineraryStops, locationURL } from '../shared/itinerary-map';

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Script-free export fallback, generated after sanitizing the model's HTML. */
export function mapSummaryHTML(plan: Plan | null) {
  if (!plan) return '';
  const stops = itineraryStops(plan);
  return `<section id="vitrip-map-summary"><h2>行程地点</h2><p>按行程顺序排列；地点连线仅作顺序示意，不代表导航路线。在线底图不包含在导出文件中。</p>${plan.days
    .map(
      (day, d) =>
        `<section><h3>${escape(day.title)}</h3><ol>${stops
          .filter((s) => s.dayIndex === d)
          .map(
            (stop) =>
              `<li id="${stop.id}" value="${stop.number}"><p><a href="#${stop.id}" data-vitrip-stop="${stop.id}">${escape(stop.time)} ${escape(stop.title)}</a></p>${
                stop.location
                  ? `<p>${escape(stop.location.name)} · ${stop.location.precision === 'approximate' ? '大致位置' : '地点位置'} · ${stop.location.latitude}, ${stop.location.longitude}</p><a href="${escape(locationURL(stop.location))}" rel="noreferrer">在线查看位置 ↗</a>${stop.location.sourceUrl ? ` · <a href="${escape(stop.location.sourceUrl)}" rel="noreferrer">坐标来源 ↗</a>` : ''}`
                  : '<p>待定位 · 尚无可靠坐标</p>'
              }</li>`,
          )
          .join('')}</ol></section>`,
    )
    .join('')}</section>`;
}
