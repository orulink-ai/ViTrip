import { expect, it } from 'vitest';
import { linkedNotebookStops } from '../src/shared/place-notebook-links';
import { itineraryStops } from '../src/shared/itinerary-map';
import { demoPlan } from '../src/shared/demo';
import { photosForActivity, type TravelPhoto } from '../src/shared/photos';

it('正文和笔记地图能关联地点，网址和无关代码不会误关联，同一地点只出现一次', () => {
  const stops = itineraryStops(demoPlan);
  const stop = stops[0];
  const name = stop.location!.name;
  expect(linkedNotebookStops(`# 攻略\n\n${name} 的门票与交通。再次去 ${name}。`, stops)).toEqual([
    stop,
  ]);
  expect(
    linkedNotebookStops(`[官网](https://example.com/${name})\n\n\`\`\`txt\n${name}\n\`\`\``, stops),
  ).toEqual([]);
  expect(
    linkedNotebookStops(
      '```vitrip-map\n' +
        JSON.stringify({
          version: 1,
          id: 'map',
          title: '攻略',
          mode: 'places',
          points: [{ ...stop.location, id: 'point' }],
        }) +
        '\n```',
      stops,
    ),
  ).toEqual([stop]);
});

it('照片使用活动明确关联或完整地点主题，不混入其他地点', () => {
  const photos = [
    { id: 'a', subject: '清水寺' },
    { id: 'b', subject: '清水寺周边酒店' },
    { id: 'c', subject: '餐厅' },
  ] as TravelPhoto[];
  expect(
    photosForActivity({ photoIds: ['c'], location: { name: '清水寺' } }, photos).map((p) => p.id),
  ).toEqual(['a', 'c']);
});

it('英文地点名称不把同名前缀的其他分店当成提及', () => {
  const stop = {
    ...itineraryStops(demoPlan)[0],
    location: { name: 'No.6 Restaurant', latitude: 1, longitude: 2, precision: 'place' as const },
  };
  expect(linkedNotebookStops('No.6 RestaurantAnnex', [stop])).toEqual([]);
  expect(linkedNotebookStops('晚餐：NO.6 RESTAURANT。', [stop])).toEqual([stop]);
});

it('Markdown 加粗和链接中的地点名称仍能关联，分开的段落不会拼成地点', () => {
  const stop = {
    ...itineraryStops(demoPlan)[0],
    location: { name: 'No.6 Restaurant', latitude: 1, longitude: 2, precision: 'place' as const },
  };
  expect(
    linkedNotebookStops('晚餐去 **No.6** [Restaurant](https://example.com)。', [stop]),
  ).toEqual([stop]);
  expect(linkedNotebookStops('No.6\n\nRestaurant', [stop])).toEqual([]);
});
