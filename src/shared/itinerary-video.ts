import type { Plan } from './types';
import { itineraryStops, type ItineraryStop } from './itinerary-map';

export interface VideoScene {
  kind: 'overview' | 'stop' | 'summary';
  title: string;
  caption: string;
  narration: string;
  stops: ItineraryStop[];
  activeIndex: number;
}
export interface TimedVideoScene extends VideoScene {
  start: number;
  duration: number;
}
export interface ItineraryVideo {
  id: string;
  fileName: string;
  dataURL: string;
  duration: number;
}

/** A separate video storyboard, independent of map presentation and daily narration. */
export function videoStoryboard(plan: Plan | null, dayIndex: number): VideoScene[] {
  const day = plan?.days[dayIndex];
  const stops = itineraryStops(plan, dayIndex);
  if (!day || !stops.length) throw Error('当天没有可生成视频的行程。');
  const heading = `第${dayIndex + 1}天 · ${day.date ?? day.title}`;
  const overview: VideoScene = {
    kind: 'overview',
    title: day.title,
    caption: day.subtitle || '先看当天的安排，再逐步展开。',
    narration: `${heading}。${day.subtitle || '这段视频带你看懂当天的安排。'}接下来按顺序展开，标为备选的活动需要你选择。`,
    stops,
    activeIndex: -1,
  };
  return [
    overview,
    ...stops.flatMap((stop, index): VideoScene[] => {
      const facts = stop.detail
        .split(/(?<=[。；])/)
        .filter((sentence) => !/地图|建筑参考点|坐标/.test(sentence))
        .join('');
      const chunks = facts.match(/[\s\S]{1,900}/g) ?? [''];
      return chunks.map((caption, part) => ({
        kind: 'stop',
        title: `${stop.title}${part ? '（续）' : ''}`,
        caption,
        narration: `${stop.time ? `${stop.time}。` : ''}${stop.optional || stop.optionGroup ? '这是一个备选方案。' : ''}${stop.title}。${caption}`,
        stops,
        activeIndex: index,
      }));
    }),
    {
      kind: 'summary',
      title: '把当天安排串起来',
      caption: '时间与安排依据已保存行程；备选、估算和待确认事项以原说明为准。',
      narration: `以上就是当天的行程。${stops.some((s) => s.optional || s.optionGroup) ? '备选方案并不表示全部都要执行，出发前记得决定采用哪一种。' : ''}视频依据已保存的行程制作，标注为估算或待确认的信息，出发前还需要核实。`,
      stops,
      activeIndex: -1,
    },
  ];
}
export function timeVideoScenes(scenes: VideoScene[], durations: number[]): TimedVideoScene[] {
  if (durations.length !== scenes.length || durations.some((d) => !Number.isFinite(d) || d <= 0))
    throw Error('分镜必须与有效的实际旁白时长逐段对应。');
  let start = 0;
  return scenes.map((scene, index) => {
    const timed = { ...scene, start, duration: durations[index] };
    start += durations[index];
    return timed;
  });
}
