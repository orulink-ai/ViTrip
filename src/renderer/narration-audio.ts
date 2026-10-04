/** Coordinate the local narrator and realtime voice without coupling their UI. */
let active = false;
const listeners = new Set<(active: boolean) => void>();
const interruptions = new Set<() => void>();
export const narrationAudio = {
  setActive(value: boolean) {
    active = value;
    listeners.forEach((listener) => listener(value));
  },
  subscribe(listener: (active: boolean) => void) {
    listeners.add(listener);
    listener(active);
    return () => {
      listeners.delete(listener);
    };
  },
  onInterrupt(listener: () => void) {
    interruptions.add(listener);
    return () => {
      interruptions.delete(listener);
    };
  },
  interrupt() {
    interruptions.forEach((listener) => listener());
  },
};
