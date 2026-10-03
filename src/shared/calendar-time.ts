import { z } from 'zod';

export function itineraryDate(text: string, anchor?: string): string | undefined {
  const full = text.match(/^(\d{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})(?=\s|$|[ ·])/);
  const local = text.match(/^(?:(\d{4})年)?([0-9]{1,2})月([0-9]{1,2})日/);
  const match = full ?? local;
  if (!match) return undefined;
  const year = match[1] ?? anchor?.slice(0, 4);
  if (!year) return undefined;
  const date = `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return z.iso.date().safeParse(date).success ? date : undefined;
}

export function itineraryTime(raw: string, anchor?: string) {
  const date = itineraryDate(raw, anchor);
  const stripped = raw
    .trim()
    .replace(/^方案[A-ZＡ-Ｚ0-9]+\s*[·:：]\s*/, '')
    .replace(/^(?:(?:\d{4}年)?\d{1,2}月\d{1,2}日|\d{4}[-/]\d{1,2}[-/]\d{1,2})\s+/, '')
    .replace(/[（(](?:中国当地|泰国当地|表定|当地时间|中国时间|泰国时间)[）)]$/, '')
    .trim();
  const match = stripped.match(
    /^(\d|[01]\d|2[0-3]):([0-5]\d)(?:\s*[-–—~至→]\s*(\d|[01]\d|2[0-3]):([0-5]\d))?$/,
  );
  const zone = /[（(](?:中国当地|中国时间)[）)]$/.test(raw)
    ? 'Asia/Shanghai'
    : /[（(](?:泰国当地|泰国时间)[）)]$/.test(raw)
      ? 'Asia/Bangkok'
      : undefined;
  return {
    date,
    zone,
    start: match ? `${match[1].padStart(2, '0')}:${match[2]}` : undefined,
    end: match?.[3] ? `${match[3].padStart(2, '0')}:${match[4]}` : undefined,
  };
}
