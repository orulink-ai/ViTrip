/** Relative Markdown references are restricted to content-addressed notebook assets. */
export const notebookAssetPattern = /^assets\/[a-f0-9]{64}\.png$/;

export function notebookAssetSource(source: string): string | null {
  const relative = /^(?:\.\.\/)*(assets\/[a-f0-9]{64}\.png)$/.exec(source);
  if (relative) return relative[1];
  const match = /^vitrip-asset:([a-f0-9]{64})$/.exec(source);
  return match ? `assets/${match[1]}.png` : null;
}
