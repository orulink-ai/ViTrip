import { expect, it } from 'vitest';
import { createDiscussionFollow, reduceDiscussionFollow } from '../src/shared/discussion-follow';

it('同一讨论地点不反复移动，比较地点作为一次聚焦', () => {
  const first = reduceDiscussionFollow(createDiscussionFollow(), {
    type: 'target',
    stopIds: ['elephant'],
  });
  expect(first.focus?.stopIds).toEqual(['elephant']);
  expect(reduceDiscussionFollow(first, { type: 'target', stopIds: ['elephant'] })).toBe(first);
  const compared = reduceDiscussionFollow(first, { type: 'target', stopIds: ['elephant', 'show'] });
  expect(compared.focus?.stopIds).toEqual(['elephant', 'show']);
  expect(compared.focus?.revision).toBe(2);
});

it('手动查看优先，新讨论保持待定位，用户恢复后才移动', () => {
  let state = reduceDiscussionFollow(createDiscussionFollow(), {
    type: 'target',
    stopIds: ['elephant'],
  });
  state = reduceDiscussionFollow(state, { type: 'manual' });
  state = reduceDiscussionFollow(state, { type: 'target', stopIds: ['show'] });
  expect(state.paused).toBe(true);
  expect(state.targetIds).toEqual(['show']);
  expect(state.focus?.stopIds).toEqual(['elephant']);
  state = reduceDiscussionFollow(state, { type: 'resume' });
  expect(state.paused).toBe(false);
  expect(state.focus?.stopIds).toEqual(['show']);
});

it('隐藏地图不夺取界面，重新打开后可主动恢复；关闭跟随仍保持手动视野', () => {
  let state = reduceDiscussionFollow(createDiscussionFollow(), {
    type: 'visibility',
    visible: false,
  });
  state = reduceDiscussionFollow(state, { type: 'target', stopIds: ['show'] });
  expect(state.focus).toBeNull();
  state = reduceDiscussionFollow(state, { type: 'visibility', visible: true });
  expect(state.focus).toBeNull();
  state = reduceDiscussionFollow(state, { type: 'resume' });
  expect(state.focus?.stopIds).toEqual(['show']);
  state = reduceDiscussionFollow(state, { type: 'enabled', enabled: false });
  state = reduceDiscussionFollow(state, { type: 'target', stopIds: ['elephant'] });
  expect(state.focus?.stopIds).toEqual(['show']);
});

it('整天命令保留所有地点和指定日期，无坐标当天也可切换；单点与总览不混淆', () => {
  const ids = Array.from({ length: 11 }, (_, i) => `stop-${i}`);
  let state = reduceDiscussionFollow(createDiscussionFollow(), {
    type: 'target',
    kind: 'day',
    dayIndex: 1,
    label: '明天',
    stopIds: ids,
  });
  expect(state.focus).toMatchObject({ kind: 'day', dayIndex: 1, stopIds: ids });
  state = reduceDiscussionFollow(state, { type: 'target', kind: 'day', dayIndex: 2, stopIds: [] });
  expect(state.focus).toMatchObject({ kind: 'day', dayIndex: 2, stopIds: [] });
  state = reduceDiscussionFollow(state, { type: 'target', kind: 'places', stopIds: ['hotel'] });
  expect(state.focus).toMatchObject({ kind: 'places', stopIds: ['hotel'] });
  expect(state.focus?.dayIndex).toBeUndefined();
});
