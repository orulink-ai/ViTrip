import { expect, it, vi } from 'vitest';
import { prepareNarration, narrationSchema } from '../src/shared/day-narration';
import { NarrationPlayer } from '../src/renderer/narration-player';
import type { Plan } from '../src/shared/types';
const plan: Plan = {
  title: '旅行',
  subtitle: '',
  budget: '',
  days: [
    {
      title: '明天',
      subtitle: '',
      activities: [
        {
          id: 'hotel',
          title: '酒店',
          time: '上午',
          detail: '出发',
          location: { name: '酒店', latitude: 7, longitude: 98, precision: 'place' },
        },
        { id: 'show', title: '表演', time: '晚上', detail: '时间待确认' },
      ],
    },
  ],
};
const input = {
  dayIndex: 0,
  segments: [
    { title: '全天安排', text: '先看今天的安排。', stopIds: [] },
    { title: '酒店', text: '从酒店出发。', stopIds: ['hotel'] },
    { title: '表演', text: '晚上看表演，地点尚待定位。', stopIds: ['show'] },
    { title: '总结', text: '出发前确认时间。', stopIds: [] },
  ],
};
it('讲解绑定已保存当天地点，待定位段回到当天，不修改计划', () => {
  const before = JSON.stringify(plan);
  const segments = prepareNarration(plan, narrationSchema.parse(input));
  expect(segments[1].target).toMatchObject({ kind: 'places', stopIds: ['hotel'] });
  expect(segments[2]).toMatchObject({ unlocated: true, target: { kind: 'day', dayIndex: 0 } });
  expect(JSON.stringify(plan)).toBe(before);
  expect(() =>
    prepareNarration(plan, {
      ...input,
      segments: [{ title: '错误', text: '错误', stopIds: ['other'] }],
    }),
  ).toThrow();
  expect(() =>
    prepareNarration(plan, { ...input, segments: input.segments.slice(0, 2) }),
  ).toThrow();
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}
it('真实地图回执前不朗读，音频结束才进入下一段', async () => {
  const map = deferred<'shown'>(),
    audio = deferred<void>();
  const show = vi.fn().mockReturnValue(map.promise);
  const speak = vi
    .fn()
    .mockReturnValue(new Promise(() => {}))
    .mockReturnValueOnce(audio.promise);
  const player = new NarrationPlayer(
    prepareNarration(plan, input),
    { show, speak, cancel: vi.fn() },
    () => {},
  );
  player.play();
  await flush();
  expect(speak).not.toHaveBeenCalled();
  map.resolve('shown');
  await flush();
  expect(speak).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledTimes(1);
  audio.resolve();
  await flush();
  expect(show).toHaveBeenCalledTimes(2);
  player.end();
});
it('暂停、跳站与结束拒绝旧的音频回调，隐藏地图不继续朗读', async () => {
  const first = deferred<void>();
  const speak = vi
    .fn()
    .mockReturnValue(new Promise(() => {}))
    .mockReturnValueOnce(first.promise);
  const show = vi.fn().mockResolvedValue('shown');
  const cancel = vi.fn();
  const player = new NarrationPlayer(
    prepareNarration(plan, input),
    { show, speak, cancel },
    () => {},
  );
  player.play();
  await flush();
  player.pause();
  first.resolve();
  await flush();
  expect(player.state.index).toBe(0);
  expect(player.state.phase).toBe('paused');
  player.move(1);
  await flush();
  expect(player.state.index).toBe(1);
  player.end();
  await flush();
  expect(player.state.phase).toBe('ended');
  const hidden = new NarrationPlayer(
    prepareNarration(plan, input),
    { show: async () => 'hidden', speak, cancel },
    () => {},
  );
  const count = speak.mock.calls.length;
  hidden.play();
  await flush();
  expect(speak).toHaveBeenCalledTimes(count);
  expect(hidden.state.phase).toBe('paused');
});
it('TTS错误停止自动推进并允许重试当前段', async () => {
  const player = new NarrationPlayer(
    prepareNarration(plan, input),
    {
      show: async () => 'shown',
      speak: async () => {
        throw Error('朗读失败');
      },
      cancel() {},
    },
    () => {},
  );
  player.play();
  await flush();
  expect(player.state).toMatchObject({ index: 0, phase: 'error', message: '朗读失败' });
});
