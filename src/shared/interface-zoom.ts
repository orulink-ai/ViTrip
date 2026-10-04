export type ZoomAction = 'in' | 'out' | 'reset';
export function zoomShortcut(
  input: { type: string; key: string; meta: boolean; control: boolean; alt: boolean },
  platform: string,
): ZoomAction | undefined {
  if (
    input.type !== 'keyDown' ||
    input.alt ||
    !(platform === 'darwin' ? input.meta : input.control)
  )
    return;
  if (input.key === '+' || input.key === '=') return 'in';
  if (input.key === '-') return 'out';
  if (input.key === '0') return 'reset';
}
