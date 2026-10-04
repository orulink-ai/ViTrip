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
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './components/ui/dialog';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import type { AgentPermissionMode, ConversationSettings, PublicSettings } from '../shared/types';
export function SettingsDialog({
  open,
  tripId,
  onAutoSave,
  onOpenChange,
  config,
  onSave,
}: {
  open: boolean;
  tripId?: string;
  onAutoSave: (value: PublicSettings) => void;
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
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>(
    config.permissionMode ?? 'ask',
  );
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
  const [selectionSaving, setSelectionSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const selectionPending = useRef(false);
  useEffect(() => {
    if (open) {
      setExperiments(
        config.jevExperiments ?? { browser: false, webSearch: false, localSearch: false },
      );
      setPermissionMode(config.permissionMode ?? 'ask');
      setRuntime(config.runtime ?? 'pi');
      setCodexModel(config.codexModel ?? '');
      setCodexEffort(config.codexEffort ?? '');
      setBaseURL(config.baseURL);
      setModel(config.model);
      setImageInput(config.imageInput);
      setKey('');
      setJevKey('');
      setError('');
      setAutoSaved(false);
    }
  }, [open, tripId]);
  async function saveSelection(patch: Partial<ConversationSettings>) {
    if (selectionPending.current) return;
    selectionPending.current = true;
    setSelectionSaving(true);
    setError('');
    try {
      if (tripId) {
        onAutoSave(await window.vitrip.conversationSettings(tripId, patch));
      } else {
        onSave(
          await window.vitrip.settings({ baseURL: config.baseURL, model: config.model, ...patch }),
        );
      }
      setAutoSaved(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('保存失败'));
    } finally {
      selectionPending.current = false;
      setSelectionSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog flex max-h-[85vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('连接你的旅行助手')}</DialogTitle>
          <DialogDescription>{t('选择当前会话的模型，并配置共享的服务连接。')}</DialogDescription>
        </DialogHeader>
        {autoSaved && !saving && !selectionSaving && !error && (
          <p role="status" className="text-xs text-muted-foreground">
            当前会话设置已自动保存
          </p>
        )}
        <form
          id="connection-settings"
          className="min-h-0 overflow-y-auto"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              onSave(
                await window.vitrip.settings({
                  jevExperiments: experiments,
                  permissionMode,
                  runtime,
                  codexModel,
                  codexEffort,
                  baseURL,
                  model,
                  imageInput,
                  ...(key ? { apiKey: key } : {}),
                  ...(tavilyKey ? { tavilyApiKey: tavilyKey } : {}),
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
          <fieldset className="grid min-w-0 gap-4">
            <legend className="mb-2 font-medium">{t('当前会话 · 自动保存')}</legend>
            <p className="text-xs text-muted-foreground">
              {t('模型和思考强度修改后自动保存，运行中修改用于后续发送。')}
            </p>
            <label>
              执行引擎
              <Select
                value={runtime}
                disabled={saving || selectionSaving}
                onValueChange={(value) => {
                  if (value !== 'pi' && value !== 'codex') return;
                  setRuntime(value);
                  void saveSelection({ runtime: value as 'pi' | 'codex' });
                }}
              >
                <SelectTrigger aria-label="执行引擎">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pi">Pi · 自定义模型接口</SelectItem>
                  <SelectItem value="codex">Codex · 本机登录</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              权限模式
              <Select
                value={permissionMode}
                disabled={saving || selectionSaving}
                onValueChange={async (value) => {
                  if (value !== 'ask' && value !== 'full-access') return;
                  if (await saveSelection({ permissionMode: value })) setPermissionMode(value);
                }}
              >
                <SelectTrigger aria-label="权限模式">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ask">请求批准</SelectItem>
                  <SelectItem value="full-access">完全访问权限</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <p className="text-xs text-muted-foreground">
              {permissionMode === 'full-access'
                ? '允许 Agent 自动执行本机命令、修改文件和网页提交，无需逐次批准。系统授权仍由系统控制。'
                : 'Pi 的本机命令和文件修改、网页提交需批准；Codex 按工作区沙箱策略请求批准。资料读取和旅行内容整理自动执行。'}{' '}
              权限修改用于后续发送，当前任务使用发送时的设置。
            </p>
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
                      ...(!selectedModel && codexModel
                        ? [{ id: codexModel, name: codexModel }]
                        : []),
                    ]}
                    value={codexModel || '__default__'}
                    onValueChange={(value) => {
                      const nextModel = value === '__default__' ? '' : value;
                      const nextEffort =
                        codexModels.find((m) => m.model === value)?.defaultReasoningEffort ?? '';
                      setCodexModel(nextModel);
                      setCodexEffort(nextEffort);
                      void saveSelection({ codexModel: nextModel, codexEffort: nextEffort });
                    }}
                  >
                    <ModelSelectorTrigger
                      type="button"
                      aria-label="Codex 模型"
                      disabled={catalogLoading || saving || selectionSaving}
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
                    onValueChange={(value) => {
                      if (
                        value !== '__default__' &&
                        !selectedModel?.supportedReasoningEfforts.some(
                          (item) => item.reasoningEffort === value,
                        )
                      )
                        return;
                      const effort = value === '__default__' ? '' : value;
                      setCodexEffort(effort);
                      void saveSelection({ codexEffort: effort });
                    }}
                    disabled={!selectedModel || catalogLoading || saving || selectionSaving}
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
              <label>
                {t('模型名称')} <span>{t('自动保存到当前会话')}</span>
                <Input
                  aria-label={t('模型名称')}
                  disabled={saving || selectionSaving}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  onBlur={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (
                      nextTarget instanceof HTMLButtonElement &&
                      nextTarget.type === 'submit' &&
                      nextTarget.form?.id === 'connection-settings'
                    )
                      return;
                    if (model.trim() && model !== config.model)
                      void saveSelection({ model: model.trim() });
                  }}
                  required
                  placeholder={t('填写服务商提供的模型 ID')}
                />
              </label>
            )}
            <fieldset className="grid gap-4 border-t pt-4">
              <legend>JEV 实验性功能 · 自动保存</legend>
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
                    disabled={saving || selectionSaving}
                    onValueChange={(value) => {
                      const next = { ...experiments, [name]: value === 'on' };
                      setExperiments(next);
                      void saveSelection({ jevExperiments: next });
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
            </fieldset>
          </fieldset>
          <fieldset className="grid min-w-0 gap-4 border-t pt-4">
            <legend className="mb-2 font-medium">{t('共享连接 · 手动保存')}</legend>
            <p className="text-xs text-muted-foreground">
              {t('接口与密钥由所有会话共用，修改后点击保存连接设置。')}
            </p>
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
                  API Key{' '}
                  <span>{config.hasKey ? t('已保存，留空则保留') : t('本地模型可留空')}</span>
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
          </fieldset>
        </form>
        <DialogFooter>
          <Button
            form="connection-settings"
            type="submit"
            disabled={saving}
            className="save-settings"
          >
            {saving ? t('正在保存…') : t('保存连接设置')}
            <Check size={15} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
