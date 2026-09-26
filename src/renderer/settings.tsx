import { t } from './i18n';
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
          <DialogTitle>{t('连接你的旅行助手')}</DialogTitle>
          <DialogDescription>
            {t('Pi 管理旅行会话，DeepSeek 负责规划，Jev 操控本地浏览器。密钥加密保存在本机。')}
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
              setError(e instanceof Error ? e.message : t('保存失败'));
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            {t('接口地址')}
            <Input
              aria-label={t('模型接口地址')}
              value={baseURL}
              onChange={(event) => setBaseURL(event.target.value)}
              required
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label>
            {t('模型名称')}
            <Input
              aria-label={t('模型名称')}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              required
              placeholder={t('填写服务商提供的模型 ID')}
            />
          </label>
          <label>
            API Key <span>{config.hasKey ? t('已保存，留空则保留') : t('本地模型可留空')}</span>
            <Input
              aria-label="API Key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={config.hasKey ? t('••••••••（已加密保存）') : t('输入 API Key')}
            />
          </label>
          {config.hasKey && (
            <Button
              variant="ghost"
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
              {t('清除已保存的密钥')}
            </Button>
          )}
          <label>
            Jev · OpenRouter Key{' '}
            <span>{config.hasJevKey ? t('已保存，留空保留') : t('浏览器自动操作使用')}</span>
            <Input
              aria-label="Jev OpenRouter Key"
              type="password"
              autoComplete="off"
              value={jevKey}
              onChange={(e) => setJevKey(e.target.value)}
              placeholder={
                config.hasJevKey ? t('••••••••（已加密保存）') : t('输入 OpenRouter API Key')
              }
            />
          </label>
          <p className="settings-note">{t('浏览器决策模型：typesafe/jev-1.13')}</p>
          {config.hasJevKey && (
            <Button
              variant="ghost"
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
              {t('清除 Jev 密钥')}
            </Button>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving} className="save-settings">
            {saving ? t('正在保存…') : t('保存设置')}
            <Check size={15} />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
