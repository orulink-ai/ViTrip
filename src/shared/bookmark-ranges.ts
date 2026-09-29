export interface BookmarkMatch {
  id: string;
  text: string;
  anchor?: { prefix: string; suffix: string };
}
export const compactQuote = (text: string) => text.replace(/\s/g, '');
/** Map normalized selections back to original text without losing inline formatting. */
export function bookmarkRanges(text: string, marks: BookmarkMatch[]) {
  const offsets: number[] = [];
  let compact = '';
  for (let i = 0; i < text.length; i++)
    if (!/\s/.test(text[i])) {
      offsets.push(i);
      compact += text[i];
    }
  const ranges: Array<{ id: string; start: number; end: number }> = [];
  for (const mark of marks) {
    const needle = compactQuote(mark.text);
    if (!needle) continue;
    let start = compact.indexOf(needle);
    while (start !== -1) {
      const end = start + needle.length;
      if (
        !mark.anchor ||
        (compact.slice(0, start).endsWith(mark.anchor.prefix) &&
          compact.slice(end).startsWith(mark.anchor.suffix))
      ) {
        ranges.push({ id: mark.id, start: offsets[start], end: offsets[end - 1] + 1 });
        break;
      }
      start = compact.indexOf(needle, start + 1);
    }
  }
  return ranges;
}
