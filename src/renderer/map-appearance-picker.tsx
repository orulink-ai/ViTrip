import { useState } from 'react';
import { MAP_STYLES, type MapAppearance, type MapView } from '../shared/map-appearance';
import { Button } from './components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { mapStyleLabels } from './map-styles';
import { t } from './i18n';

export function MapAppearancePicker({
  value,
  onChange,
  onDefault,
}: {
  value: MapAppearance;
  onChange: (value: MapAppearance) => void;
  onDefault: () => boolean;
}) {
  const [notice, setNotice] = useState('');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          {t('地图外观')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('地图风格')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {MAP_STYLES.map((style) => (
              <Button
                key={style}
                size="sm"
                variant={value.style === style ? 'secondary' : 'outline'}
                className="h-auto min-h-9 whitespace-normal"
                aria-pressed={value.style === style}
                onClick={() => {
                  setNotice('');
                  onChange({ ...value, style });
                }}
              >
                {t(mapStyleLabels[style])}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('地图视角')}</legend>
          <div className="flex gap-2">
            {(
              [
                ['flat', '平面'],
                ['tilted', '倾斜'],
                ['globe', '地球'],
              ] as [MapView, string][]
            ).map(([view, label]) => (
              <Button
                key={view}
                size="sm"
                variant={value.view === view ? 'secondary' : 'outline'}
                aria-pressed={value.view === view}
                onClick={() => {
                  setNotice('');
                  onChange({ ...value, view });
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
