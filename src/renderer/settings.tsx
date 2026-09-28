import type { CodexModel } from '../shared/codex-models';
import {
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorContent,
} from './components/assistant-ui/elements/model-selector';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './components/ui/select';
import { t } from './i18n';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
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
  const [experiments, setExperiments] = useState(
    config.jevExperiments ?? { browser: false, webSearch: false, localSearch: false },
  );
  const [tavilyKey, setTavilyKey] = useState('');
  useEffect(() => {
    if (open) setTavilyKey('');
  }, [open]);
  const [runtime, setRuntime] = useState<'pi' | 'codex'>(config.runtime ?? 'pi');
  const [codexModel, setCodexModel] = useState(config.codexModel ?? '');
  const [codexEffort, setCodexEffort] = useState(config.codexEffort ?? '');
  const [codexModels, setCodexModels] = useState<CodexModel[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  useEffect(() => {
    if (!open || runtime !== 'codex') return;
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError('');
    void window.vitrip
      .codexModels()
      .then((models) => {
        if (!cancelled) setCodexModels(models);
      })
      .catch((e) => {
        if (!cancelled) setCatalogError(String(e));
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, runtime]);
  const selectedModel = codexModels.find((m) => m.model === codexModel);
  const [baseURL, setBaseURL] = useState(config.baseURL);
  const [model, setModel] = useState(config.model);
  const [imageInput, setImageInput] = useState(config.imageInput);
  const [key, setKey] = useState('');
  const [jevKey, setJevKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setExperiments(
        config.jevExperiments ?? { browser: false, webSearch: false, localSearch: false },
      );
      setRuntime(config.runtime ?? 'pi');
      setCodexModel(config.codexModel ?? '');
      setCodexEffort(config.codexEffort ?? '');
      setBaseURL(config.baseURL);
      setModel(config.model);
      setImageInput(config.imageInput);
      setKey('');
      setJevKey('');
      setError('');
    }
  }, [open, config]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('连接你的旅行助手')}</DialogTitle>
          <DialogDescription>
            选择 Pi 或本机 Codex 规划旅行。Jev 操控本地浏览器，接口密钥加密保存在本机。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              onSave(
                await window.vitrip.settings({
                  jevExperiments: experiments,
                  runtime,
                  codexModel,
                  codexEffort,
                  baseURL,
                  model,
                  imageInput,
                  ...(tavilyKey ? { tavilyApiKey: tavilyKey } : {}),
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
            执行引擎
            <Select value={runtime} onValueChange={(value) => setRuntime(value as 'pi' | 'codex')}>
              <SelectTrigger aria-label="执行引擎">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pi">Pi · 自定义模型接口</SelectItem>
                <SelectItem value="codex">Codex · 本机登录</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {runtime === 'codex' && (
            <>
              <p className="settings-note">
                使用本机 Codex CLI 的登录与配置。首次使用请安装 Codex CLI，并在终端运行 codex
                login。无需在这里填写 Codex 密钥。
              </p>
              <label>
                Codex 模型
                <ModelSelectorRoot
                  models={[
                    { id: '__default__', name: '跟随本机 Codex 配置' },
                    ...codexModels.map((m) => ({
                      id: m.model,
                      name: m.displayName,
                      description: m.description,
                    })),
                    ...(!selectedModel && codexModel ? [{ id: codexModel, name: codexModel }] : []),
                  ]}
                  value={codexModel || '__default__'}
                  onValueChange={(value) => {
                    setCodexModel(value === '__default__' ? '' : value);
                    setCodexEffort(
                      codexModels.find((m) => m.model === value)?.defaultReasoningEffort ?? '',
                    );
                  }}
                >
                  <ModelSelectorTrigger
                    type="button"
                    aria-label="Codex 模型"
                    disabled={catalogLoading}
                  />
                  <ModelSelectorContent />
                </ModelSelectorRoot>
              </label>
              {catalogLoading && <p role="status">正在读取可用模型…</p>}
              {catalogError && <p role="alert">{catalogError}</p>}
              <label>
                思考强度
                <Select
                  value={codexEffort || '__default__'}
                  onValueChange={(value) =>
                    setCodexEffort(
                      value === '__default__'
                        ? (selectedModel?.defaultReasoningEffort ?? '')
                        : value,
                    )
                  }
                  disabled={!selectedModel || catalogLoading}
                >
                  <SelectTrigger aria-label="Codex 思考强度">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      默认
                      {selectedModel
                        ? ` · ${selectedModel.defaultReasoningEffort}`
                        : '（先选择模型）'}
                    </SelectItem>
                    {selectedModel?.supportedReasoningEfforts.map((effort) => (
                      <SelectItem key={effort.reasoningEffort} value={effort.reasoningEffort}>
                        {effort.reasoningEffort}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </>
          )}
          {runtime === 'pi' && (
            <>
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
                图片输入能力
                <Select
                  value={imageInput === undefined ? 'auto' : String(imageInput)}
                  onValueChange={(value) =>
                    setImageInput(value === 'auto' ? undefined : value === 'true')
                  }
                >
                  <SelectTrigger aria-label="图片输入能力">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动识别服务商支持</SelectItem>
                    <SelectItem value="true">已确认接口支持图片</SelectItem>
                    <SelectItem value="false">仅文本</SelectItem>
                  </SelectContent>
                </Select>
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
            </>
          )}
          {runtime === 'pi' && (
            <label>
              Tavily Search API Key
              <Input
                type="password"
                aria-label="Tavily Search API Key"
                autoComplete="off"
                value={tavilyKey}
                onChange={(event) => setTavilyKey(event.target.value)}
                placeholder={
                  config.hasTavilyKey ? t('已保存，留空保留') : t('未配置时使用 Exa 搜索')
                }
              />
              <span className="text-sm text-muted-foreground">
                {t('普通资料先搜索和读取正文，需要网页交互时再打开浏览器。')}
              </span>
              {config.hasTavilyKey && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={async () => {
                    try {
                      onSave(await window.vitrip.settings({ baseURL, model, tavilyApiKey: '' }));
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  {t('清除搜索密钥')}
                </Button>
              )}
            </label>
          )}
          <fieldset className="grid gap-4 border-t pt-4">
            <legend>JEV 实验性功能</legend>
            <p className="settings-note">
              默认关闭，可分别启用。关闭后继续使用原有浏览器控制与 Pi 搜索。搜索实验目前用于 Pi
              引擎。
            </p>
            {(
              [
                ['browser', 'Pi JEV 浏览器控制'],
                ['webSearch', 'JEV 联网搜索'],
                ['localSearch', 'JEV 本地代码与文档搜索'],
              ] as const
            ).map(([name, label]) => (
              <label key={name}>
                {label}
                <Select
                  value={experiments[name] ? 'on' : 'off'}
                  disabled={saving}
                  onValueChange={(value) => {
                    const next = { ...experiments, [name]: value === 'on' };
                    setExperiments(next);
                  }}
                >
                  <SelectTrigger aria-label={label}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">关闭 · 使用原有功能</SelectItem>
                    <SelectItem value="on">启用实验</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            ))}
            <p className="settings-note">
              联网搜索由现有搜索服务获取来源，再由 JEV
              判断相关性。本地搜索支持代码及纯文本文档；候选片段会发送至 OpenRouter。
            </p>
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
          </fieldset>
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
