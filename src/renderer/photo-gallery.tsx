import { useEffect, useState } from 'react';
import type { TravelPhoto } from '../shared/photos';
import { ImageGallery, type GalleryImage } from './components/assistant-ui/elements/image-gallery';

/** Data adapter only: all gallery/lightbox presentation comes from assistant-ui. */
export function PhotoGallery({
  journeyId,
  photos,
  onBrowse,
}: {
  journeyId: string;
  photos: TravelPhoto[];
  onBrowse: (url: string) => void;
}) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(photos);
  useEffect(() => {
    let active = true;
    setImages([]);
    setFailed(false);
    Promise.all(
      photos.map(async (photo) => {
        const src = await window.vitrip.photo(journeyId, photo.id).catch(() => null);
        return src
          ? {
              id: photo.id,
              src,
              alt: `${photo.subject} · ${photo.alt || '来源照片'}`,
              caption: `${photo.subject} · 来源已记录，地点、分店与房型待核对。${photo.context} · ${new Date(photo.capturedAt).toLocaleString()}`,
              source: { label: `查看来源页面 · ${photo.pageTitle}`, url: photo.pageUrl },
            }
          : null;
      }),
    ).then((values) => {
      if (active) {
        setImages(values.filter((value): value is NonNullable<typeof value> => value !== null));
        setFailed(values.some((value) => !value));
      }
    });
    return () => {
      active = false;
    };
  }, [journeyId, key]);
  if (!photos.length) return null;
  return (
    <div
      aria-label="来源照片"
      onClickCapture={(event) => {
        const link = (event.target as Element).closest('a');
        if (link && /^https?:/.test(link.href)) {
          event.preventDefault();
          onBrowse(link.href);
        }
      }}
    >
      <ImageGallery images={images} maxVisible={3} />
      {failed && <p role="status">照片缓存不可用，请重新采集。</p>}
    </div>
  );
}
