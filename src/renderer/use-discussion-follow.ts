import { useEffect, useRef, useState } from 'react';
import type { Journey, Trip } from '../shared/types';
import type { MapViewCommand, MapViewStatus } from '../shared/map-view';
import { refreshMapView, type MapViewTarget } from '../shared/map-view';
import { itineraryStops } from '../shared/itinerary-map';
import {
  createDiscussionFollow,
  reduceDiscussionFollow,
  type DiscussionFollowEvent,
} from '../shared/discussion-follow';

/** Agent-issued presentation commands; no secondary model reads the conversation. */
export function useDiscussionFollow(
  trip: Trip | null,
  journey: Journey | undefined,
  visible: boolean,
) {
  const [state, setState] = useState(createDiscussionFollow);
  const stateRef = useRef(state);
  const [command, setCommand] = useState<MapViewCommand | null>(null);
  const pending = useRef<{ command: MapViewCommand; revision: number } | null>(null);
  const latestTarget = useRef<MapViewTarget | null>(null);
  const context = useRef({ trip, journey, visible });
  context.current = { trip, journey, visible };
  const preferenceKey = `vitrip-discussion-follow:${trip?.journeyId ?? ''}`;
  const dispatch = (event: DiscussionFollowEvent) => {
    const next = reduceDiscussionFollow(stateRef.current, event);
    stateRef.current = next;
    setState(next);
    return next;
  };
  const acknowledge = (value: MapViewCommand, status: MapViewStatus) => {
    void window.vitrip.mapViewResult(value.requestId, value.tripId, status).catch(() => {});
  };
  useEffect(() => {
    if (pending.current) acknowledge(pending.current.command, 'unavailable');
    pending.current = null;
    latestTarget.current = null;
    setCommand(null);
    let enabled = true;
    try {
      enabled = localStorage.getItem(preferenceKey) !== 'false';
    } catch {
      /* Optional preference. */
    }
    const next = { ...createDiscussionFollow(enabled), visible };
    stateRef.current = next;
    setState(next);
  }, [trip?.id, preferenceKey]);
  useEffect(() => {
    dispatch({ type: 'visibility', visible });
  }, [visible]);
  useEffect(
    () =>
      window.vitrip.onEvent((event) => {
        const value = event.mapView;
        if (event.type !== 'map-view' || !value) return;
        const current = context.current;
        if (value.tripId !== current.trip?.id || value.journeyId !== current.journey?.id) {
          acknowledge(value, 'unavailable');
          return;
        }
        setCommand(value);
      }),
    [],
  );
  useEffect(() => {
    if (!command || !journey) return;
    if (command.tripId !== trip?.id || command.journeyId !== journey.id) return;
    // Plan events can arrive immediately before the tool's presentation event.
    if (journey.revision < command.planRevision) return;
    if (pending.current) acknowledge(pending.current.command, 'unavailable');
    pending.current = null;
    const stops = itineraryStops(journey.plan);
    const valid =
      command.planRevision === journey.revision &&
      command.target.stopIds.every((id) => stops.some((stop) => stop.id === id && stop.location)) &&
      (command.target.kind !== 'day' || Boolean(journey.plan?.days[command.target.dayIndex!]));
    if (!valid) {
      acknowledge(command, 'unavailable');
      setCommand(null);
      return;
    }
    const next = dispatch({ type: 'target', ...command.target, force: true });
    latestTarget.current = command.target;
    const status: MapViewStatus | undefined = !next.enabled
      ? 'disabled'
      : !visible
        ? 'hidden'
        : next.paused
          ? 'paused'
          : undefined;
    if (status) acknowledge(command, status);
    else pending.current = { command, revision: next.revision };
    setCommand(null);
  }, [command, trip?.id, journey, visible]);
  useEffect(() => {
    if (!pending.current || (state.enabled && !state.paused && visible)) return;
    acknowledge(
      pending.current.command,
      !state.enabled ? 'disabled' : !visible ? 'hidden' : 'paused',
    );
    pending.current = null;
  }, [state.enabled, state.paused, visible]);
  const stops = itineraryStops(journey?.plan ?? null);
  const resume = () => {
    const target =
      latestTarget.current &&
      refreshMapView(context.current.journey?.plan ?? null, latestTarget.current);
    if (target) {
      latestTarget.current = target;
      dispatch({ type: 'target', ...target });
    } else dispatch({ type: 'clear' });
    dispatch({ type: 'resume' });
  };
  return {
    enabled: state.enabled,
    paused: state.paused,
    label: state.targetLabel,
    targets: stops.filter((stop) => state.targetIds.includes(stop.id)),
    focus: state.enabled && !state.paused && visible ? state.focus : null,
    pause: () => dispatch({ type: 'manual' }),
    resume,
    presented: (revision: number) => {
      const value = pending.current;
      if (!value || value.revision !== revision) return;
      const current = context.current;
      acknowledge(
        value.command,
        current.trip?.id === value.command.tripId &&
          current.journey?.revision === value.command.planRevision &&
          current.visible &&
          stateRef.current.enabled &&
          !stateRef.current.paused
          ? 'shown'
          : 'unavailable',
      );
      pending.current = null;
    },
    toggle: () => {
      const enabled = !stateRef.current.enabled;
      try {
        localStorage.setItem(preferenceKey, String(enabled));
      } catch {
        /* Optional preference. */
      }
      dispatch({ type: 'enabled', enabled });
      if (enabled) resume();
    },
  };
}
export type DiscussionFollowControls = ReturnType<typeof useDiscussionFollow>;
