import { useEffect, useRef, useState } from 'react';
import { t } from './i18n';

/** Read-only compatibility view; new itineraries use ItineraryDocument. */
export function LegacyJournal({
  journeyId,
  revision,
  onBrowse,
}: {
  journeyId: string;
  revision: number;
  onBrowse: (url: string) => void;
}) {
  const [html, setHTML] = useState('');
  const [error, setError] = useState('');
  const [height, setHeight] = useState(400);
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef(() => {});
  const browse = useRef(onBrowse);
  browse.current = onBrowse;
  useEffect(() => {
    let cancelled = false;
    void window.vitrip
      .journal({ journeyId, legacy: true })
      .then((content) => {
        if (!cancelled) {
          setHTML(content);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [journeyId, revision]);
  useEffect(() => () => cleanup.current(), []);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <iframe
        ref={frame}
        title={t('旅行手册')}
        className="block w-full border-0"
        style={{ height }}
        srcDoc={html}
        sandbox="allow-same-origin"
        onLoad={() => {
          cleanup.current();
          const doc = frame.current?.contentDocument;
          if (!doc) return;
          const resize = () => {
            const next = Math.ceil(doc.body.getBoundingClientRect().height);
            if (next > 0) setHeight(next);
          };
          resize();
          const observer = new ResizeObserver(resize);
          observer.observe(doc.body);
          const click = (event: MouseEvent) => {
            const target = event.target;
            const anchor = target && 'closest' in target ? (target as Element).closest('a') : null;
            const href = anchor?.getAttribute('href');
            if (href && /^https?:\/\//i.test(href)) {
              event.preventDefault();
              browse.current(href);
            }
          };
          doc.addEventListener('click', click);
          cleanup.current = () => {
            observer.disconnect();
            doc.removeEventListener('click', click);
          };
        }}
      />
    </>
  );
}
