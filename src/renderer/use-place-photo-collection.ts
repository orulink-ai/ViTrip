import { useEffect, useRef, useState } from 'react';
import type { Journey } from '../shared/types';
import type { ItineraryStop } from '../shared/itinerary-map';
import {
  photoCollectionKey,
  startPhotoCollection,
  type PhotoCollectionTask,
} from '../shared/photo-collection';

export function usePlacePhotoCollection() {
  const [tasks, setTasks] = useState<Record<string, PhotoCollectionTask>>({});
  const attempts = useRef(new Map<string, number>());
  const apply = (task: PhotoCollectionTask) =>
    setTasks((previous) => ({
      ...previous,
      [photoCollectionKey(task.journeyId, task.activityId)]: task,
    }));
  useEffect(
    () =>
      window.vitrip.onEvent((event) => {
        if (event.type === 'photo-collection' && event.photoCollection)
          apply(event.photoCollection);
      }),
    [],
  );
  return {
    tasks,
    restore: (initial: PhotoCollectionTask[]) =>
      setTasks((previous) => ({
        ...Object.fromEntries(
          initial.map((task) => [photoCollectionKey(task.journeyId, task.activityId), task]),
        ),
        ...previous,
      })),
    find: async (journey: Journey, stop: ItineraryStop) => {
      const key = photoCollectionKey(journey.id, stop.id);
      const token = (attempts.current.get(key) ?? 0) + 1;
      attempts.current.set(key, token);
      const pending = startPhotoCollection(journey.id, stop, journey.photos ?? []);
      apply(pending);
      try {
        const result = await window.vitrip.findPlacePhotos(journey.id, stop.id);
        if (attempts.current.get(key) === token) apply(result);
      } catch (error) {
        if (attempts.current.get(key) === token)
          apply({
            ...pending,
            status: 'failed',
            message: error instanceof Error ? error.message : '图片采集失败，请重试。',
          });
      }
    },
  };
}
