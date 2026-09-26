import { t } from './i18n';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search, CheckCircle2, Clock3, FileText, ExternalLink } from 'lucide-react';
import type { Journey } from '../shared/types';
import { JourneyMap, type MapSelection } from './journey-map';
import { LegacyJournal } from './legacy-journal';
import { ItineraryDocument } from './itinerary-document';
export function JournalPanel({
  journey,
  onBrowse,
  onBuildPlan,
  building,
}: {
  journey: Journey;
  onBrowse: (url: string) => void;
  onBuildPlan: () => void;
  building: boolean;
}) {
  // IPC clones Journey even when only knowledge or its title changes.
  const planKey = JSON.stringify(journey.plan);
  const plan = useMemo(() => journey.plan, [planKey]);
  const [mode, setMode] = useState<'page' | 'notes' | 'map'>('page');
  const [selection, setSelection] = useState<MapSelection>({});
  const [query, setQuery] = useState('');
  const reading = useRef<HTMLDivElement>(null);
  const pendingStop = useRef<string | undefined>(undefined);
  const scroll = useRef(0);
  useEffect(() => {
    scroll.current = 0;
    setQuery('');
  }, [journey.id]);
  useEffect(() => {
    setSelection({});
    pendingStop.current = undefined;
  }, [plan]);
  useEffect(() => {
    if (mode !== 'page' || !plan || !pendingStop.current) return;
    const id = pendingStop.current;
    const frameId = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'center' });
      pendingStop.current = undefined;
    });
    return () => cancelAnimationFrame(frameId);
  }, [mode, plan]);
  useLayoutEffect(() => {
    if (mode === 'page' && reading.current && !pendingStop.current)
      reading.current.scrollTop = scroll.current;
  }, [mode]);
  function readStop(id: string) {
    pendingStop.current = id;
    setMode('page');
    if (mode === 'page') {
      document.getElementById(id)?.scrollIntoView({ block: 'center' });
      pendingStop.current = undefined;
    }
  }
  const entries = journey.entries.filter((e) =>
    (e.category + ' ' + e.question + ' ' + e.answer).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="journal-panel">
      <div className="journal-toolbar">
        <div>
          <strong>{journey.title}</strong>
          <span>
            {journey.entries.length}
            {t('条已整理 · 所有会话共享')}
          </span>
        </div>
        <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
          <TabsList>
            <TabsTrigger value="page">
              <BookOpen size={14} />
              {t('页面')}
            </TabsTrigger>
            <TabsTrigger value="notes">
              <FileText size={14} />
              {t('已整理')}
            </TabsTrigger>
            <TabsTrigger value="map">{t('地图')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {mode !== 'notes' ? (
        <div
          ref={reading}
          className={
            mode === 'map' ? 'flex min-h-0 flex-1 flex-col' : 'min-h-0 flex-1 overflow-y-auto'
          }
          onScroll={(event) => {
            if (mode === 'page') scroll.current = event.currentTarget.scrollTop;
          }}
        >
          {(plan || mode === 'map') && (
            <JourneyMap
              plan={plan}
              selection={selection}
              onSelection={setSelection}
              expanded={mode === 'map'}
              onExpand={(expanded) => setMode(expanded ? 'map' : 'page')}
              onBrowse={onBrowse}
              onRead={readStop}
            />
          )}
          {mode === 'page' && plan && (
            <ItineraryDocument
              plan={plan}
              selectedId={selection.stopId}
              onBrowse={onBrowse}
              onLocate={(stopId, day) => {
                setSelection({ stopId, day });
                setMode('map');
              }}
            />
          )}
          {mode === 'page' && !plan && (
            <div className="space-y-3 px-6 py-4">
              <p className="text-sm text-muted-foreground">
                {t('尚未生成交互行程。已有记录会保留，可让助手整理成按天排列的行程。')}
              </p>
              <Button variant="outline" disabled={building} onClick={onBuildPlan}>
                {t('整理成交互行程')}
              </Button>
              {journey.html && (
                <p className="text-xs text-muted-foreground">{t('以下为旧版手册预览')}</p>
              )}
            </div>
          )}
          {mode === 'page' && !plan && journey.html && (
            <LegacyJournal journeyId={journey.id} revision={journey.revision} onBrowse={onBrowse} />
          )}
          {mode === 'page' && plan && journey.html && (
            <details className="mx-6 border-t py-4">
              <summary className="cursor-pointer text-sm">{t('旧版手册')}</summary>
              <LegacyJournal
                journeyId={journey.id}
                revision={journey.revision}
                onBrowse={onBrowse}
              />
            </details>
          )}
        </div>
      ) : (
        <div className="knowledge-panel">
          <label className="knowledge-search">
            <Search size={16} />
            <Input
              aria-label={t('搜索已整理信息')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('查酒店、预算、提醒或之前的问题…')}
            />
          </label>
          {entries.length ? (
            entries.map((entry) => (
              <article className="knowledge-card" key={entry.id}>
                <div className="knowledge-meta">
                  <span>{entry.category}</span>
                  <span>
                    {entry.status === 'confirmed' ? (
                      <CheckCircle2 size={12} />
                    ) : entry.status === 'pending' ? (
                      <Clock3 size={12} />
                    ) : (
                      <FileText size={12} />
                    )}
                    {
                      { confirmed: t('已确认'), reference: t('参考建议'), pending: t('待核实') }[
                        entry.status
                      ]
                    }
                  </span>
                </div>
                <h3>{entry.question}</h3>
                <p>{entry.answer}</p>
                <div>
                  {entry.sources
                    .filter((url) => /^https?:\/\//i.test(url))
                    .map((url, i) => (
                      <Button
                        variant="link"
                        className="source-link"
                        key={url}
                        onClick={() => onBrowse(url)}
                      >
                        {t('来源')}
                        {i + 1}
                        <ExternalLink size={12} />
                      </Button>
                    ))}
                </div>
              </article>
            ))
          ) : (
            <p className="knowledge-empty">
              {query
                ? t('没有找到匹配的信息。')
                : t('聊到的偏好、决定、问题和注意事项会自动整理在这里。')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
