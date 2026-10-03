import { expect, it } from 'vitest';
import { videoStoryboard, timeVideoScenes } from '../src/shared/itinerary-video';
import type { Plan } from '../src/shared/types';
const plan: Plan = {
  title: '海岛',
  subtitle: '',
  budget: '',
  days: [
    {
      title: '到达',
      subtitle: '',
      activities: [
        { id: 'airport', title: '抵达机场', time: '10:10（当地）', detail: '取行李后出发' },
        {
          id: 'bus',
          title: '机场巴士',
          time: '取行李后',
          detail: '交通时间待确认',
          optional: true,
        },
        { id: 'hotel', title: '入住酒店', time: '下午', detail: '休息' },
      ],
    },
  ],
};
it('视频独立生成分镜与旁白，保留备选和待确认事实，不要求地图坐标', () => {
  const scenes = videoStoryboard(plan, 0);
  expect(scenes[0].kind).toBe('overview');
  expect(scenes.at(-1)?.kind).toBe('summary');
  expect(scenes.filter((s) => s.kind === 'stop').map((s) => s.stops[s.activeIndex].id)).toEqual([
    'airport',
    'bus',
    'hotel',
  ]);
  expect(
    scenes.find((s) => s.kind === 'stop' && s.stops[s.activeIndex].id === 'bus')?.narration,
  ).toContain('备选');
  expect(
    scenes.find((s) => s.kind === 'stop' && s.stops[s.activeIndex].id === 'bus')?.narration,
  ).toContain('待确认');
  expect(() => videoStoryboard(plan, 1)).toThrow();
});
it('动画分镜以实际音频时长对齐，拒绝缺失或无效时长', () => {
  const scenes = videoStoryboard(plan, 0);
  const timed = timeVideoScenes(
    scenes,
    scenes.map(() => 3),
  );
  expect(timed.map((s) => [s.start, s.duration])).toEqual([
    [0, 3],
    [3, 3],
    [6, 3],
    [9, 3],
    [12, 3],
  ]);
  expect(() => timeVideoScenes(scenes, [3])).toThrow();
  expect(() =>
    timeVideoScenes(
      scenes,
      scenes.map(() => NaN),
    ),
  ).toThrow();
});
it('旁白保留长说明末尾的待确认信息，去掉界面和地图实现说明', () => {
  const source = structuredClone(plan);
  source.days[0].activities[0].detail =
    '转机后需要重新托运行李。地图标注建筑参考点，不另占地图点。' +
    '请按现场指示办理手续。'.repeat(12) +
    '更新订单仍待确认。';
  const scene = videoStoryboard(source, 0)[1];
  expect(scene.narration).toContain('更新订单仍待确认');
  expect(scene.caption).not.toContain('地图');
});
