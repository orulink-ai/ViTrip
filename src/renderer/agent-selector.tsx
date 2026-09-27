import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import {
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorContent,
} from './components/assistant-ui/elements/model-selector';
import { Button } from './components/ui/button';
import type { PublicSettings } from '../shared/types';

export function AgentSelector({
  config,
  disabled,
  onChange,
  onSettings,
}: {
  config: PublicSettings;
  disabled: boolean;
  onChange: (runtime: 'pi' | 'codex') => Promise<void>;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ModelSelectorRoot
        models={[
          { id: 'pi', name: 'Pi', description: config.model || '自定义模型接口', disabled },
          {
            id: 'codex',
            name: 'Codex',
            description: config.codexModel || '本机登录 · 默认模型',
            disabled,
          },
        ]}
        value={config.runtime ?? 'pi'}
        open={open && !disabled}
        onOpenChange={setOpen}
        onValueChange={(value) => {
          if (!disabled && (value === 'pi' || value === 'codex')) void onChange(value);
        }}
      >
        <ModelSelectorTrigger
          type="button"
          variant="ghost"
          size="sm"
          aria-label="切换 Agent"
          disabled={disabled}
        />
        <ModelSelectorContent searchable={false} side="top" />
      </ModelSelectorRoot>
      {config.runtime === 'codex' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onSettings}
          aria-label="选择 Codex 模型和思考强度"
          className="max-w-40"
        >
          <span className="truncate">
            {config.codexModel || '默认模型'} · {config.codexEffort || '默认强度'}
          </span>
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Agent 设置"
        onClick={onSettings}
        disabled={disabled}
      >
        <Settings2 />
      </Button>
    </div>
  );
}
