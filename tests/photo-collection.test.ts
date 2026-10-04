import { expect, it } from 'vitest';
import {
  startPhotoCollection,
  finishPhotoCollection,
  photoCollectionPrompt,
  bindPhotoCollectionTool,
} from '../src/shared/photo-collection';
import { itineraryStops } from '../src/shared/itinerary-map';
import { demoPlan } from '../src/shared/demo';
import type { TravelPhoto } from '../src/shared/photos';
const stop = itineraryStops(demoPlan)[0];
const photo = { id: 'a', subject: stop.location!.name } as TravelPhoto;
it('没有真实保存图片时失败，候选或助手文字不能算成功', () => {
  const task = startPhotoCollection('journey', stop, []);
  expect(task.status).toBe('collecting');
  expect(finishPhotoCollection(task, stop, [], []).status).toBe('failed');
  expect(finishPhotoCollection(task, stop, [], []).message).toContain('未保存');
});
it('只接受目标地点新增且可读的缓存图片，不接受其他地点、旧图或缺失缓存', () => {
  const task = startPhotoCollection('journey', stop, []);
  expect(finishPhotoCollection(task, stop, [photo], ['a']).status).toBe('saved');
  expect(finishPhotoCollection(task, stop, [photo], []).status).toBe('failed');
  expect(finishPhotoCollection(task, stop, [{ ...photo, subject: '其他地点' }], ['a']).status).toBe(
    'failed',
  );
  const previous = startPhotoCollection('journey', stop, [photo]);
  expect(finishPhotoCollection(previous, stop, [photo], ['a']).status).toBe('failed');
});
it('采集中地点改变或删除，拒绝将旧地点照片报告为成功', () => {
  const task = startPhotoCollection('journey', stop, []);
  expect(finishPhotoCollection(task, undefined, [photo], ['a']).status).toBe('failed');
  expect(finishPhotoCollection(task, { ...stop, id: 'other-stop' }, [photo], ['a']).status).toBe(
    'failed',
  );
  expect(
    finishPhotoCollection(
      task,
      { ...stop, location: { ...stop.location!, longitude: 1 } },
      [photo],
      ['a'],
    ).status,
  ).toBe('failed');
});
it('失败和停止给出可重试的原因；已有新增照片仍报告保存事实', () => {
  const task = startPhotoCollection('journey', stop, []);
  expect(finishPhotoCollection(task, stop, [], [], '已停止图片采集').message).toBe(
    '已停止图片采集',
  );
  expect(finishPhotoCollection(task, stop, [photo], ['a'], '已停止图片采集').status).toBe('saved');
});
it('采集请求提供地点上下文、稳定活动 ID 和强制保存及结果核验要求', () => {
  const text = photoCollectionPrompt(stop);
  expect(text).toContain(stop.id);
  expect(text).toContain('save_photo');
  expect(text).toContain('activityId');
  expect(text).toContain('不能把候选');
});

it('旧图片元数据存在但缓存缺失时，重新保存可读缓存可以修复成功', () => {
  const task = startPhotoCollection('journey', stop, [photo], []);
  expect(finishPhotoCollection(task, stop, [photo], ['a']).status).toBe('saved');
});

it('采集工具绑定当前活动，拒绝其他地点主题或其他活动 ID', () => {
  const args = { subject: stop.location!.name, ref: 1001 };
  expect(bindPhotoCollectionTool(stop, 'save_photo', args)).toEqual({
    ...args,
    activityId: stop.id,
  });
  expect(() =>
    bindPhotoCollectionTool(stop, 'save_photo', { ...args, activityId: 'other-stop' }),
  ).toThrow('活动');
  expect(() => bindPhotoCollectionTool(stop, 'photo_candidates', { subject: '其他地点' })).toThrow(
    '地点',
  );
  expect(bindPhotoCollectionTool(stop, 'navigate', { url: 'https://example.com' })).toEqual({
    url: 'https://example.com',
  });
});
