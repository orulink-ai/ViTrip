import { expect, it } from 'vitest';
import { planSchema } from '../src/shared/schemas';
import { itineraryStops } from '../src/shared/itinerary-map';
import { demoPlan } from '../src/shared/demo';

it('行程工具保留明确的时间语义、时区、备注与注意事项并传给地图', () => {
  const plan = structuredClone(demoPlan);
  Object.assign(plan.days[0].activities[0], {
    time: '05:15',
    timeLabel: '抵达',
    timeZone: '泰国当地时间 · UTC+7',
    notes: ['SL903 · T1 国际抵达'],
    warnings: ['后续航班从 T2 出发，行李是否直挂待确认'],
  });
  const saved = planSchema.parse(plan);
  expect(itineraryStops(saved)[0]).toMatchObject({
    time: '05:15',
    timeLabel: '抵达',
    timeZone: '泰国当地时间 · UTC+7',
    notes: ['SL903 · T1 国际抵达'],
    warnings: ['后续航班从 T2 出发，行李是否直挂待确认'],
  });
});
