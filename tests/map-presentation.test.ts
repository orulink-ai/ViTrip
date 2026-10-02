import { expect, it } from 'vitest';
import { MapPresentationBridge } from '../src/main/map-presentation';

it('工具只有收到当前命令的地图回执才返回展示成功；拒绝错会话及重复回执', async () => {
  const bridge = new MapPresentationBridge();
  let command: any;
  const result = bridge.present(
    {
      tripId: 'trip',
      journeyId: 'journey',
      planRevision: 1,
      target: { kind: 'places', stopIds: ['hotel'], label: '酒店' },
    },
    new AbortController().signal,
    (value) => {
      command = value;
    },
  );
  expect(bridge.acknowledge(command.requestId, 'another', 'shown')).toBe(false);
  expect(bridge.acknowledge(command.requestId, 'trip', 'paused')).toBe(true);
  expect(await result).toMatchObject({ status: 'paused' });
  expect(bridge.acknowledge(command.requestId, 'trip', 'shown')).toBe(false);
});
it('界面未收到命令及取消请求不能声称已展示', async () => {
  const bridge = new MapPresentationBridge(5);
  const input = {
    tripId: 'trip',
    journeyId: 'journey',
    planRevision: 1,
    target: { kind: 'day' as const, dayIndex: 0, stopIds: [], label: '当天' },
  };
  expect(await bridge.present(input, new AbortController().signal, () => {})).toMatchObject({
    status: 'unavailable',
  });
  const abort = new AbortController();
  const pending = bridge.present(input, abort.signal, () => {});
  abort.abort();
  expect(await pending).toMatchObject({ status: 'unavailable' });
});
