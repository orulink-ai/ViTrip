import type { ItineraryStop } from './itinerary-map';
import { photosForActivity, type TravelPhoto } from './photos';

export interface PhotoCollectionTask {
  journeyId: string;
  activityId: string;
  subject: string;
  latitude: number;
  longitude: number;
  status: 'collecting' | 'saved' | 'failed';
  initialPhotoIds: string[];
  photoIds: string[];
  message: string;
}
export const photoCollectionKey = (journeyId: string, activityId: string) =>
  `${journeyId}:${activityId}`;

export function startPhotoCollection(
  journeyId: string,
  stop: ItineraryStop,
  photos: TravelPhoto[],
  readableIds: string[] = photos.map((photo) => photo.id),
): PhotoCollectionTask {
  if (!stop.location) throw Error('地点尚未定位，无法采集地点图片');
  return {
    journeyId,
    activityId: stop.id,
    subject: stop.location.name,
    latitude: stop.location.latitude,
    longitude: stop.location.longitude,
    status: 'collecting',
    initialPhotoIds: photosForActivity(stop, photos)
      .filter((photo) => readableIds.includes(photo.id))
      .map((photo) => photo.id),
    photoIds: [],
    message: '',
  };
}

/** Only newly saved, readable photos for the unchanged destination are completion evidence. */
export function finishPhotoCollection(
  task: PhotoCollectionTask,
  stop: ItineraryStop | undefined,
  photos: TravelPhoto[],
  readableIds: string[],
  reason?: string,
): PhotoCollectionTask {
  if (
    !stop?.location ||
    stop.id !== task.activityId ||
    stop.location.name !== task.subject ||
    stop.location.latitude !== task.latitude ||
    stop.location.longitude !== task.longitude
  )
    return { ...task, status: 'failed', message: '地点已变更，请按当前地点重新查找图片。' };
  const saved = photosForActivity(stop, photos).filter(
    (photo) => !task.initialPhotoIds.includes(photo.id) && readableIds.includes(photo.id),
  );
  return saved.length
    ? {
        ...task,
        status: 'saved',
        photoIds: saved.map((photo) => photo.id),
        message: `已保存 ${saved.length} 张地点图片，来源可查看。`,
      }
    : {
        ...task,
        status: 'failed',
        message: reason || '本次未保存此地点的新图片。请重试或让助手更换图片来源。',
      };
}

export function photoCollectionPrompt(stop: ItineraryStop): string {
  return `请为当前旅行地点「${stop.location!.name}」实际采集并保存相关真实照片。活动 ID：${stop.id}。地点坐标：${stop.location!.latitude}, ${stop.location!.longitude}。地点说明：${stop.detail}。\n先检查已有照片，找到与具体地点及分店一致的真实网页并核对图片；不要选择头像、标志、广告或其他地点的图片。使用 photo_candidates 获取当前页面候选，紧接着调用 save_photo，subject 必须与上述地点名称完全一致，activityId 必须是 ${stop.id}。引用失效时重新获取候选，网页无图或受限时尝试其他可靠来源。至少成功保存一张新图片才算完成，不能把候选、待采集事项或文字说明当成图片已保存；如果无法保存，明确说明原因。保留来源，不用其他同名地点或生成图片代替，不改变行程安排。`;
}

/** A scoped photo request cannot save images under a different activity or subject. */
export function bindPhotoCollectionTool(
  stop: ItineraryStop,
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!['photo_candidates', 'save_photo'].includes(name)) return args;
  if (
    typeof args.subject !== 'string' ||
    args.subject.trim().normalize('NFKC').toLocaleLowerCase() !==
      stop.location?.name.trim().normalize('NFKC').toLocaleLowerCase()
  )
    throw Error('图片主题与当前地点不一致，请使用请求中的完整地点名称。');
  if (name === 'save_photo' && args.activityId !== undefined && args.activityId !== stop.id)
    throw Error('图片活动与当前地点不一致，请使用请求中的活动 ID。');
  return {
    ...args,
    subject: stop.location!.name,
    ...(name === 'save_photo' ? { activityId: stop.id } : {}),
  };
}
