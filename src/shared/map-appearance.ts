export const MAP_STYLES = ['street', 'liberty', 'bright', 'positron', 'dark', 'fiord'] as const;
export type MapStyleId = (typeof MAP_STYLES)[number];
export type MapView = 'flat' | 'tilted' | 'globe';
export interface MapAppearance {
  style: MapStyleId;
  view: MapView;
}
export const DEFAULT_MAP_APPEARANCE: MapAppearance = { style: 'street', view: 'flat' };
const prefix = 'vitrip-map-appearance:';
const defaultKey = `${prefix}default`;
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function parse(value: string | null): MapAppearance | undefined {
  try {
    const candidate = JSON.parse(value ?? 'null');
    if (
      candidate &&
      MAP_STYLES.includes(candidate.style) &&
      ['flat', 'tilted', 'globe'].includes(candidate.view)
    ) {
      return { style: candidate.style, view: candidate.view };
    }
  } catch {
    /* Old or malformed preferences fall back to defaults. */
  }
}

export function readMapAppearance(store: PreferenceStorage, journeyId?: string): MapAppearance {
  try {
    return (
      (journeyId ? parse(store.getItem(`${prefix}${journeyId}`)) : undefined) ??
      parse(store.getItem(defaultKey)) ?? { ...DEFAULT_MAP_APPEARANCE }
    );
  } catch {
    return { ...DEFAULT_MAP_APPEARANCE };
  }
}

export function saveMapAppearance(
  store: PreferenceStorage,
  journeyId: string | undefined,
  value: MapAppearance,
): boolean {
  if (!journeyId) return false;
  return save(store, `${prefix}${journeyId}`, value);
}

export function saveDefaultMapAppearance(store: PreferenceStorage, value: MapAppearance): boolean {
  return save(store, defaultKey, value);
}

function save(store: PreferenceStorage, key: string, value: MapAppearance): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
