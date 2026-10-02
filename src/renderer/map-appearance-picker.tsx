import { useState } from 'react';
import { Layers } from 'lucide-react';
import { TooltipIconButton } from './components/assistant-ui/elements/tooltip-icon-button';
import { MAP_MODES, type MapAppearance } from '../shared/map-appearance';
import { Button } from './components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { t } from './i18n';

export function MapAppearancePicker({
  value,
  onChange,
  onDefault,
  compact = false,
}: {
  value: MapAppearance;
  onChange: (value: MapAppearance) => void;
  onDefault: () => boolean;
  compact?: boolean;
}) {
  const [notice, setNotice] = useState('');
  return (
    <Popover>
      <PopoverTrigger asChild>
        {compact ? (
          <TooltipIconButton tooltip={t('地图外观')} aria-label={t('地图外观')} variant="outline">
            <Layers />
          </TooltipIconButton>
        ) : (
          <Button size="sm" variant="outline">
            {t('地图外观')}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('地图视角')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {MAP_MODES.map(({ label, style, view }) => (
              <Button
                key={label}
                size="sm"
                variant={value.style === style && value.view === view ? 'secondary' : 'outline'}
                aria-pressed={value.style === style && value.view === view}
                onClick={() => {
                  setNotice('');
                  onChange({ style, view });
                }}
              >
                {t(label)}
              </Button>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-muted-foreground">
          {t('选择后即时预览，按旅行保存。地球支持拖动旋转与缩放。')}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setNotice(onDefault() ? '已设为新旅行默认外观' : '外观暂时无法保存')}
        >
          {t('设为新旅行默认')}
        </Button>
        {notice && (
          <p role="status" className="text-xs text-muted-foreground">
            {t(notice)}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
