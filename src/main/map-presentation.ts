import { randomUUID } from 'node:crypto';
import type { MapViewCommand, MapViewStatus } from '../shared/map-view';

/** Ephemeral tool-to-view requests. Nothing is persisted as a travel decision. */
export class MapPresentationBridge {
  private pending = new Map<string, { tripId: string; finish: (status: MapViewStatus) => void }>();
  constructor(private timeoutMs = 2500) {}
  present(
    input: Omit<MapViewCommand, 'requestId'>,
    signal: AbortSignal,
    publish: (command: MapViewCommand) => void,
  ): Promise<{ status: MapViewStatus; target: MapViewCommand['target'] }> {
    signal.throwIfAborted();
    const command = { ...input, requestId: randomUUID() };
    return new Promise((resolve) => {
      const finish = (status: MapViewStatus) => {
        if (!this.pending.delete(command.requestId)) return;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        resolve({ status, target: command.target });
      };
      const abort = () => finish('unavailable');
      const timer = setTimeout(abort, this.timeoutMs);
      this.pending.set(command.requestId, { tripId: input.tripId, finish });
      signal.addEventListener('abort', abort, { once: true });
      try {
        publish(command);
      } catch {
        finish('unavailable');
      }
    });
  }
  acknowledge(requestId: string, tripId: string, status: MapViewStatus): boolean {
    const request = this.pending.get(requestId);
    if (!request || request.tripId !== tripId) return false;
    request.finish(status);
    return true;
  }
}
