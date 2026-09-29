import { notebookAssetSource } from '../shared/notebook-media';
import { useEffect, useState } from 'react';
import { notebookPhotoId } from '../shared/notebook-artifacts';
import type { TravelPhoto } from '../shared/photos';
import { Image } from './components/assistant-ui/elements/image';
import { t } from './i18n';

export function NotebookImage({
  source,
  alt,
  journeyId,
  photos,
  onBrowse,
}: {
  source: string;
  alt: string;
  journeyId: string;
  photos: TravelPhoto[];
  onBrowse: (url: string) => void;
}) {
  const local = notebookAssetSource(source);
  const id = notebookPhotoId(source);
  const photo = photos.find((item) => (id ? item.id === id : item.imageUrl === source));
  const [loaded, setLoaded] = useState<{ id: string; data: string | null }>();
  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined);
    if (photo || local)
      void (
        local
          ? window.vitrip.notebookImage(journeyId, local)
          : window.vitrip.photo(journeyId, photo!.id)
      )
        .then((data) => {
          if (!cancelled) setLoaded({ id: source, data });
        })
        .catch(() => {
          if (!cancelled) setLoaded({ id: source, data: null });
        });
    return () => {
      cancelled = true;
    };
  }, [journeyId, photo?.id, source, local]);
  const data = loaded?.id === source ? loaded?.data : undefined;
  return (
    <figure className="my-4 space-y-2">
      {data ? (
        <Image.Root size="full">
          <Image.Zoom src={data} alt={alt || photo?.subject}>
            <Image.Preview src={data} alt={alt || photo?.subject} />
          </Image.Zoom>
        </Image.Root>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {(photo || local) && data === undefined ? t('正在加载照片…') : t('图片暂不可用')}
          {alt ? ` · ${alt}` : ''}
        </p>
      )}
      {photo && (
        <figcaption className="text-xs text-muted-foreground">
          {photo.subject} ·{' '}
          <a
            href={photo.pageUrl}
            onClick={(event) => {
              event.preventDefault();
              onBrowse(photo.pageUrl);
            }}
          >
            {t('查看图片来源')}
          </a>
          {' · '}
          {t('地点与内容待核对')}
        </figcaption>
      )}
    </figure>
  );
}
