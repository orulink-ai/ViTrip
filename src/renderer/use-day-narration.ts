import { useEffect, useRef, useState } from 'react';
import type { Journey, Trip } from '../shared/types';
import type { NarrationCommand } from '../shared/day-narration';
import type { DiscussionFollowControls } from './use-discussion-follow';
import { NarrationPlayer, type NarrationState } from './narration-player';
import { narrationAudio } from './narration-audio';

function latestInteraction(trip: Trip | null): string {
  return JSON.stringify([
    trip?.messages.filter((message) => message.role === 'user').at(-1)?.id,
    trip?.queuedMessages?.at(-1)?.id,
  ]);
}

export function useDayNarration(
  trip: Trip | null,
  journey: Journey | undefined,
  visible: boolean,
  discussion: DiscussionFollowControls,
) {
  const [command, setCommand] = useState<NarrationCommand | null>(null);
  const [state, setState] = useState<NarrationState>({ index: 0, phase: 'ready' });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [valid, setValid] = useState(true);
  const player = useRef<NarrationPlayer | null>(null);
  const context = useRef({ trip, journey, visible, discussion });
  context.current = { trip, journey, visible, discussion };
  const lastUser = useRef<string | undefined>(undefined);
  const cancelAudio = useRef<(() => void) | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioURL = useRef<string | null>(null);
  const speechGeneration = useRef(0);
  const cancel = () => {
    ++speechGeneration.current;
    cancelAudio.current?.();
    cancelAudio.current = null;
    if (audio.current) {
      const value = audio.current;
      audio.current = null;
      value.pause();
      value.removeAttribute('src');
      value.load();
    }
    if (audioURL.current) {
      URL.revokeObjectURL(audioURL.current);
      audioURL.current = null;
    }
    narrationAudio.setActive(false);
  };
  useEffect(() => {
    const unsubscribe = window.vitrip.onEvent((event) => {
      if (
        event.type === 'voice' &&
        event.voice?.kind === 'transcript' &&
        event.voice.role === 'user'
      ) {
        player.current?.pause('提问已暂停讲解，回答后可继续本段。');
        return;
      }
      if (event.type !== 'day-narration' || !event.narration) return;
      const next = event.narration,
        current = context.current;
      if (next.tripId !== current.trip?.id || next.journeyId !== current.journey?.id) return;
      player.current?.end();
      if (next.planKey !== JSON.stringify(current.journey.plan)) {
        setError('行程已变化，请重新生成讲解。');
        return;
      }
      lastUser.current = latestInteraction(current.trip);
      const speechCache = new Map<string, string>();
      setCommand(next);
      setGenerating(false);
      setError('');
      setValid(true);
      const nextPlayer = new NarrationPlayer(
        next.segments,
        {
          show: async (target) => {
            const current = context.current;
            if (!current.visible) return 'hidden';
            if (JSON.stringify(current.journey?.plan) !== next.planKey)
              throw Error('行程已变化，请重新生成讲解。');
            const result = await window.vitrip.presentMap(
              next.tripId,
              target.kind === 'day'
                ? { action: 'day', dayIndex: target.dayIndex! }
                : { action: 'focus', stopIds: target.stopIds },
            );
            return result.status;
          },
          speak: async (text, started) => {
            const generation = ++speechGeneration.current;
            let source = speechCache.get(text);
            if (!source) {
              source = await window.vitrip.narrationSpeech(next.tripId, text);
              if (speechCache.size >= 8) speechCache.delete(speechCache.keys().next().value!);
              speechCache.set(text, source);
            }
            if (generation !== speechGeneration.current) return;
            const bytes = Uint8Array.from(atob(source.split(',')[1]), (character) =>
              character.charCodeAt(0),
            );
            const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
            audioURL.current = url;
            const value = new Audio(url);
            audio.current = value;
            await new Promise<void>((resolve, reject) => {
              cancelAudio.current = () => reject(Error('讲解已暂停'));
              value.onended = () => {
                if (audio.current === value) {
                  audio.current = null;
                  cancelAudio.current = null;
                  URL.revokeObjectURL(url);
                  audioURL.current = null;
                }
                resolve();
              };
              value.onerror = () => {
                URL.revokeObjectURL(url);
                reject(Error('语音播放失败，请重试本段。'));
              };
              void value.play().then(started).catch(reject);
            });
          },
          cancel,
        },
        (nextState) => {
          setState(nextState);
          narrationAudio.setActive(['locating', 'loading', 'playing'].includes(nextState.phase));
        },
      );
      player.current = nextPlayer;
      nextPlayer.play();
    });
    const interrupt = narrationAudio.onInterrupt(() =>
      player.current?.pause('提问已暂停讲解，回答后可继续本段。'),
    );
    return () => {
      unsubscribe();
      interrupt();
      player.current?.end();
      cancel();
    };
  }, []);
  useEffect(() => {
    player.current?.end();
    player.current = null;
    setCommand(null);
    setGenerating(false);
    setError('');
  }, [trip?.id]);
  const userId = latestInteraction(trip);
  useEffect(() => {
    if (player.current && lastUser.current !== undefined && userId !== lastUser.current)
      player.current.pause('提问已暂停讲解，回答后可继续本段。');
    lastUser.current = userId;
  }, [userId]);
  const planKey = JSON.stringify(journey?.plan);
  useEffect(() => {
    if (command && command.planKey !== planKey) {
      setValid(false);
      player.current?.pause('行程已更新，请重新生成讲解。');
    }
  }, [planKey, command]);
  useEffect(() => {
    if (!visible || !discussion.enabled || discussion.paused)
      player.current?.pause('已暂停讲解；打开地图并恢复跟随后可继续本段。');
  }, [visible, discussion.enabled, discussion.paused]);
  const prepare = async (dayIndex: number) => {
    if (!trip || generating) return;
    player.current?.end();
    setCommand(null);
    setError('');
    setGenerating(true);
    const id = trip.id;
    try {
      await window.vitrip.send(
        `请启动「每日行程讲解」，带我按顺序听一遍第${dayIndex + 1}天${journey?.plan?.days[dayIndex]?.date ? `（${journey.plan.days[dayIndex].date}）` : ''}的行程安排。`,
      );
    } catch (error) {
      if (context.current.trip?.id === id)
        setError(error instanceof Error ? error.message : '讲解生成失败');
    } finally {
      if (context.current.trip?.id === id) setGenerating(false);
    }
  };
  return {
    command,
    state,
    generating,
    error,
    valid,
    prepare,
    pause: () => player.current?.pause(),
    resume: () => {
      if (!valid) return;
      if (!discussion.enabled) discussion.toggle();
      else discussion.resume();
      player.current?.play();
    },
    move: (delta: number) => {
      if (!valid) return;
      if (!discussion.enabled) discussion.toggle();
      else discussion.resume();
      player.current?.move(delta);
    },
    end: () => {
      player.current?.end();
      setCommand(null);
    },
  };
}
export type DayNarrationControls = ReturnType<typeof useDayNarration>;
