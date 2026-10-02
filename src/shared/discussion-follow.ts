export interface DiscussionFocus {
  stopIds: string[];
  revision: number;
  kind?: 'day' | 'places';
  dayIndex?: number;
  label?: string;
}
export interface DiscussionFollowState {
  enabled: boolean;
  paused: boolean;
  visible: boolean;
  targetIds: string[];
  targetKind?: 'day' | 'places';
  targetDay?: number;
  targetLabel?: string;
  focus: DiscussionFocus | null;
  revision: number;
}
export type DiscussionFollowEvent =
  | {
      type: 'target';
      stopIds: string[];
      kind?: 'day' | 'places';
      dayIndex?: number;
      label?: string;
      force?: boolean;
    }
  | { type: 'manual' }
  | { type: 'clear' }
  | { type: 'resume' }
  | { type: 'enabled'; enabled: boolean }
  | { type: 'visibility'; visible: boolean };

export function createDiscussionFollow(enabled = true): DiscussionFollowState {
  return { enabled, paused: false, visible: true, targetIds: [], focus: null, revision: 0 };
}
function applyTarget(state: DiscussionFollowState): DiscussionFollowState {
  if (
    !state.enabled ||
    state.paused ||
    !state.visible ||
    (!state.targetIds.length && state.targetKind !== 'day')
  )
    return state;
  return {
    ...state,
    revision: state.revision + 1,
    focus: {
      stopIds: state.targetIds,
      revision: state.revision + 1,
      kind: state.targetKind,
      dayIndex: state.targetDay,
      label: state.targetLabel,
    },
  };
}
export function reduceDiscussionFollow(
  state: DiscussionFollowState,
  event: DiscussionFollowEvent,
): DiscussionFollowState {
  switch (event.type) {
    case 'clear':
      return {
        ...state,
        targetIds: [],
        targetKind: undefined,
        targetDay: undefined,
        targetLabel: undefined,
        focus: null,
      };
    case 'target': {
      const stopIds =
        event.kind === 'day'
          ? [...new Set(event.stopIds)]
          : [...new Set(event.stopIds)].slice(0, 4);
      if (!stopIds.length && event.kind !== 'day') return state;
      if (
        !event.force &&
        state.targetKind === event.kind &&
        state.targetDay === event.dayIndex &&
        JSON.stringify(state.targetIds) === JSON.stringify(stopIds)
      )
        return state.focus ? state : applyTarget(state);
      return applyTarget({
        ...state,
        targetIds: stopIds,
        targetKind: event.kind,
        targetDay: event.dayIndex,
        targetLabel: event.label,
        paused: state.paused || !state.visible,
      });
    }
    case 'manual':
      return state.enabled ? { ...state, paused: true } : state;
    case 'resume':
      return applyTarget({ ...state, paused: false });
    case 'enabled':
      return {
        ...state,
        enabled: event.enabled,
        paused: false,
        focus: event.enabled ? null : state.focus,
      };
    case 'visibility':
      return {
        ...state,
        visible: event.visible,
        paused: state.paused || (!event.visible && Boolean(state.focus)),
      };
  }
}
