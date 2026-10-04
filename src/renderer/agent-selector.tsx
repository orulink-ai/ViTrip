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
  running = false,
  disabled,
  onChange,
  onSettings,
}: {
  config: PublicSettings;
  running?: boolean;
  disabled: boolean;
  onChange: (runtime: 'pi' | 'codex') => Promise<void>;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
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
          className="shrink-0"
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
          className="min-w-0 max-w-40 shrink"
          title={`${config.codexModel || '默认模型'} · ${config.codexEffort || '默认强度'}`}
        >
          <span className="truncate">
            {running ? '下次：' : ''}
            {config.codexModel || '默认模型'} · {config.codexEffort || '默认强度'}
          </span>
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Agent 权限模式"
        onClick={onSettings}
        disabled={disabled}
        title={running ? '权限修改用于后续发送' : '修改当前会话权限'}
      >
        {running ? '下次：' : ''}
        {config.permissionMode === 'full-access' ? '完全访问权限' : '请求批准'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Agent 设置"
        className="shrink-0"
        onClick={onSettings}
        disabled={disabled}
      >
        <Settings2 />
      </Button>
    </div>
  );
}
