import { useEffect, useState } from 'react';
import { ExternalLink, History } from 'lucide-react';
import type { BrowserVisit } from '../shared/browser-history';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';
import { t, useLocale } from './i18n';

export function BrowserActions({
  journeyId,
  url,
  onBrowse,
  onOverlay,
  onError,
}: {
  journeyId?: string;
  url: string;
  onBrowse: (url: string) => Promise<void>;
  onOverlay: (open: boolean) => void;
  onError: (message: string) => void;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [visits, setVisits] = useState<BrowserVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    onOverlay(open);
    return () => onOverlay(false);
  }, [open, onOverlay]);
  useEffect(() => {
    if (!open || !journeyId) return;
    let active = true;
    let updates = 0;
    setVisits([]);
    setLoading(true);
    setLoadError('');
    const unsubscribe = window.vitrip.onEvent((event) => {
      if (event.type === 'browser-history' && event.journeyId === journeyId && event.visits) {
        updates++;
        setVisits(event.visits);
        setLoading(false);
        setLoadError('');
      }
    });
    void window.vitrip
      .browserHistory(journeyId)
      .then((items) => {
        if (active && updates === 0) {
          setVisits(items);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (active && updates === 0) {
          setLoadError(String(error));
          setLoading(false);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [open, journeyId]);
  async function perform(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      onError(String(error));
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('浏览记录')}
        title={t('浏览记录')}
        disabled={!journeyId}
        onClick={() => setOpen(true)}
      >
        <History size={15} />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={t('在默认浏览器打开')}
        title={t('在电脑的默认浏览器打开当前网址，登录状态不会同步。')}
        disabled={!/^https?:/.test(url)}
        onClick={() => void perform(() => window.vitrip.openBrowserExternal())}
      >
        <ExternalLink size={15} />
        <span className="hidden xl:inline">{t('在默认浏览器打开')}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('浏览记录')}</DialogTitle>
            <DialogDescription>
              {t('本旅行最近访问的 100 个网页，同一旅行的会话共享。简介来自网页自身。')}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p role="status">{t('正在读取浏览记录…')}</p>
          ) : loadError ? (
            <p role="alert">{loadError}</p>
          ) : visits.length === 0 ? (
            <p>{t('这趟旅行还没有浏览记录')}</p>
          ) : (
            <>
              <ul className="max-h-[60vh] min-w-0 overflow-y-auto divide-y">
                {visits.map((visit) => (
                  <li key={visit.url} className="min-w-0 space-y-1 py-3">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto max-w-full justify-start whitespace-normal p-0 text-left"
                      aria-label={t('重新打开：{title}', { title: visit.title || visit.url })}
                      onClick={() => {
                        setOpen(false);
                        void perform(() => onBrowse(visit.url));
                      }}
                    >
                      {visit.title || visit.url}
                    </Button>
                    <p className="break-all text-xs text-muted-foreground">{visit.url}</p>
                    {visit.description && (
                      <p className="text-sm break-words">{visit.description}</p>
                    )}
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={new Date(visit.visitedAt).toISOString()}
                    >
                      {new Date(visit.visitedAt).toLocaleString(locale)}
                    </time>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void perform(async () => {
                    if (!journeyId) return;
                    await window.vitrip.clearBrowserHistory(journeyId);
                  })
                }
              >
                {t('清空本旅行记录')}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
