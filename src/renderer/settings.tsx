import { useEffect, useState } from 'react';
import { Settings2, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import type { PublicSettings } from '../shared/types';
export function SettingsDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  config: PublicSettings;
  onSave: (value: PublicSettings) => void;
}) {
  const [baseURL, setBaseURL] = useState(config.baseURL);
  const [model, setModel] = useState(config.model);
  const [key, setKey] = useState('');
  const [jevKey, setJevKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setBaseURL(config.baseURL);
      setModel(config.model);
      setKey('');
      setJevKey('');
      setError('');
    }
  }, [open, config]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog">
        <DialogHeader>
          <div className="settings-icon">
            <Settings2 size={21} />
          </div>
          <DialogTitle>连接你的旅行助手</DialogTitle>
          <DialogDescription>
            Pi 管理旅行会话，DeepSeek 负责规划，Jev 操控本地浏览器。密钥加密保存在本机。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              onSave(
                await window.vitrip.settings({
                  baseURL,
                  model,
                  ...(key ? { apiKey: key } : {}),
                  ...(jevKey ? { jevApiKey: jevKey } : {}),
                }),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : '保存失败');
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            接口地址
            <Input
              aria-label="模型接口地址"
              value={baseURL}
              onChange={(event) => setBaseURL(event.target.value)}
              required
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label>
            模型名称
            <Input
              aria-label="模型名称"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              required
              placeholder="填写服务商提供的模型 ID"
            />
          </label>
          <label>
            API Key <span>{config.hasKey ? '已保存，留空则保留' : '本地模型可留空'}</span>
            <Input
              aria-label="API Key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={config.hasKey ? '••••••••（已加密保存）' : '输入 API Key'}
            />
          </label>
          {config.hasKey && (
            <button
              type="button"
              className="clear-key"
              onClick={async () => {
                try {
                  onSave(await window.vitrip.settings({ baseURL, model, apiKey: '' }));
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              清除已保存的密钥
            </button>
          )}
          <label>
            Jev · OpenRouter Key{' '}
            <span>{config.hasJevKey ? '已保存，留空保留' : '浏览器自动操作使用'}</span>
            <Input
              aria-label="Jev OpenRouter Key"
              type="password"
              autoComplete="off"
              value={jevKey}
              onChange={(e) => setJevKey(e.target.value)}
              placeholder={config.hasJevKey ? '••••••••（已加密保存）' : '输入 OpenRouter API Key'}
            />
          </label>
          <p className="settings-note">浏览器决策模型：typesafe/jev-1.13</p>
          {config.hasJevKey && (
            <button
              type="button"
              className="clear-key"
              onClick={async () => {
                try {
                  onSave(await window.vitrip.settings({ baseURL, model, jevApiKey: '' }));
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              清除 Jev 密钥
            </button>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving} className="save-settings">
            {saving ? '正在保存…' : '保存设置'}
            <Check size={15} />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
