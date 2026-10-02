import type { ToolActivity } from './types';
export interface SearchSource {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
export function searchPresentation(step: ToolActivity) {
  if (!['webSearch', 'web_search', 'jev_web_search'].includes(step.name)) return;
  const input = parse(step.input);
  const args = record(input);
  const action = record(args.action);
  const strings = (value: unknown): string[] =>
    typeof value === 'string' && value.trim()
      ? [value.trim()]
      : Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim())
        : [];
  const queries = [
    ...new Set([
      ...strings(typeof input === 'string' ? input : undefined),
      ...strings(args.query),
      ...strings(args.queries),
      ...strings(action.query),
      ...strings(action.queries),
    ]),
  ];
  const sources: SearchSource[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const item = record(value);
    if (typeof item.url !== 'string') return;
    try {
      const url = new URL(item.url);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        seen.has(url.href)
      )
        return;
      seen.add(url.href);
      const snippet =
        typeof item.snippet === 'string'
          ? item.snippet
          : typeof item.content === 'string'
            ? item.content
            : undefined;
      sources.push({
        title: typeof item.title === 'string' && item.title.trim() ? item.title : url.hostname,
        url: url.href,
        domain: url.hostname,
        ...(snippet ? { snippet } : {}),
      });
    } catch {
      /* An invalid URL is not a clickable source. */
    }
  };
  const output = parse(step.output);
  const data = record(output);
  let explicitEmpty = false;
  const collect = (value: unknown, depth = 0) => {
    if (depth > 3) return;
    if (Array.isArray(value)) {
      if (value.length === 0) explicitEmpty = true;
      for (const item of value) {
        add(item);
        collect(item, depth + 1);
      }
    } else {
      const item = record(value);
      for (const key of ['results', 'sources']) if (key in item) collect(item[key], depth + 1);
    }
  };
  collect(output);
  if (typeof output === 'string') {
    for (const match of output.matchAll(/^\d+\.\s+(.+)\r?\n\s+(https?:\/\/\S+)/gm))
      add({ title: match[1], url: match[2] });
    for (const match of output.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g))
      add({ title: match[1], url: match[2] });
    if (/^No results found\.$/m.test(output)) explicitEmpty = true;
  }
  const provider =
    typeof data.provider === 'string'
      ? data.provider
      : step.output.match(/\*\*Provider:\*\*\s*([^\n]+)/)?.[1]?.trim();
  const state =
    step.status === 'active'
      ? 'searching'
      : step.status === 'error'
        ? 'error'
        : step.status === 'interrupted'
          ? 'interrupted'
          : sources.length
            ? 'results'
            : explicitEmpty
              ? 'empty'
              : 'unavailable';
  return { queries, sources, provider, state } as const;
}
