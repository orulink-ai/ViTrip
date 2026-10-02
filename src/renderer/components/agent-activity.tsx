import { searchPresentation } from '../../shared/search-presentation';
import { Sources } from './assistant-ui/elements/sources';
import { t, useLocale } from '../i18n';
import type { ToolActivity } from '../../shared/types';
import { useState, type PropsWithChildren } from 'react';
import type { ThreadGroupPart } from './assistant-ui/elements/thread.aui';
import { ToolGroup } from './assistant-ui/elements/tool-group.aui';
import { documentOperation, documentGroupLabel } from '../../shared/tool-presentation';
import { useAuiState, type ToolCallMessagePartComponent } from '@assistant-ui/react';
import { ToolCall } from './assistant-ui/elements/tool-call';
import { ToolFallback } from './assistant-ui/elements/tool-fallback.aui';

const labels: Record<string, string> = {
  commandExecution: '执行本机命令',
  fileChange: '编辑文件',
  webSearch: '搜索网页',
  web_enable: '启用联网检索',
  web_search: '搜索网页',
  jev_web_search: 'JEV 联网搜索',
  jev_search: 'JEV 本地检索',
  fetch_content: '读取网页正文',
  get_search_content: '读取检索结果',
  mcpToolCall: '调用外部工具',
  bash: '执行本机命令',
  powershell: '执行 PowerShell',
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  grep: '搜索文件内容',
  find: '查找文件',
  ls: '查看目录',
  google_search: 'Google 搜索',
  google_maps: 'Google Maps 查询',
  navigate: '打开网页',
  observe: '阅读网页',
  computer_use: '操作浏览器',
  click: '点击网页',
  type: '填写信息',
  press: '操作键盘',
  scroll: '浏览页面',
  plan: '更新行程',
  map_view: '展示行程地图',
  journal: '整理旅行手册',
  notebook: '整理笔记文档',
  photo_candidates: '读取来源照片',
  save_photo: '保存来源照片',
  inspect_photo: '查看已存照片',
};
const statuses = { active: '进行中', complete: '已完成', error: '失败', interrupted: '已中断' };
export const ActivityPart: ToolCallMessagePartComponent = ({ toolCallId }) => {
  const steps = useAuiState((s) => s.message.metadata.custom.activities) as
    ToolActivity[] | undefined;
  const step = steps?.find((item) => item.id === toolCallId);
  const [open, setOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const locale = useLocale();
  if (!step) return null;
  const search = searchPresentation(step);
  const document = ['notebook', 'journal'].includes(step.name)
    ? documentOperation(step)
    : undefined;
  const label = t(document?.label ?? labels[step.name] ?? step.name);
  const summary = search
    ? t(
        {
          searching: '正在检索来源…',
          results: '已获取 {count} 个来源',
          empty: '未找到相关结果',
          unavailable: '搜索已结束，当前引擎未提供来源明细',
          error: '搜索失败，可展开查看原因',
          interrupted: '搜索已停止，结果可能不完整',
        }[search.state],
        { count: search.sources.length },
      )
    : '';
  const failed = step.status === 'error' || step.status === 'interrupted';
  return (
    <div data-testid="agent-activity" data-tool-id={step.id} className="my-2">
      {failed ? (
        <ToolFallback.Root>
          <ToolFallback.Trigger
            toolName={label}
            status={{
              type: 'incomplete',
              reason: step.status === 'interrupted' ? 'cancelled' : 'error',
              error: step.output,
            }}
          />
          <ToolFallback.Content>
            <ToolFallback.Args argsText={step.input} />
            <ToolFallback.Result result={step.output || t('未返回结果')} />
          </ToolFallback.Content>
        </ToolFallback.Root>
      ) : (
        <ToolCall
          label={label}
          activeLabel={label}
          query={search ? search.queries[0] || t('查询词未提供') : (document?.target ?? step.name)}
          requestLabel={search ? t('检索内容') : undefined}
          resultLabel={search ? t('检索结果') : undefined}
          request={
            search ? (
              search.queries.length ? (
                <ul className="space-y-1">
                  {search.queries.map((query) => (
                    <li key={query}>{query}</li>
                  ))}
                </ul>
              ) : (
                t('当前引擎未提供查询词')
              )
            ) : (
              step.input
            )
          }
          result={
            search ? (
              <div className="space-y-3">
                <>{search.sources.length === 0 && <p>{summary}</p>}</>
                {search.sources.length > 0 && (
                  <Sources
                    sources={search.sources}
                    open={sourcesOpen}
                    onOpenChange={setSourcesOpen}
                    locale={locale}
                  />
                )}
                <details>
                  <summary className="cursor-pointer text-muted-foreground">
                    {t('技术详情')}
                  </summary>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all pt-2">
                    {step.input || t('未提供参数')}
                    {'\n\n'}
                    {step.output || t('未返回结果')}
                  </pre>
                </details>
              </div>
            ) : (
              step.output ||
              t(step.status === 'active' ? '等待工具返回…' : '工具已完成，未返回文本结果')
            )
          }

          running={step.status === 'active'}
          open={open}
          onOpenChange={setOpen}
        />
      )}
      {search && !open && (
        <p className="text-xs text-muted-foreground">
          {summary}
          {search.provider ? ` · ${search.provider}` : ''}
          {search.sources.length
            ? ` · ${[...new Set(search.sources.map((source) => source.domain))].slice(0, 3).join(' · ')}`
            : ''}
        </p>
      )}
      {(search || open || step.status !== 'complete') && (
        <p className="text-xs text-muted-foreground">
          {t(statuses[step.status])}
          {step.finishedAt
            ? ` · ${((step.finishedAt - step.startedAt) / 1000).toFixed(1)} ${t('秒')}`
            : ''}
        </p>
      )}
    </div>
  );
};

export function ActivityGroup({ group, children }: PropsWithChildren<{ group: ThreadGroupPart }>) {
  const message = useAuiState((s) => s.message);
  const ids = new Set(
    group.indices.flatMap((index) => {
      const part = message.content[index];
      return part?.type === 'tool-call' ? [part.toolCallId] : [];
    }),
  );
  const steps = ((message.metadata.custom.activities ?? []) as ToolActivity[]).filter((step) =>
    ids.has(step.id),
  );
  const [expanded, setExpanded] = useState<boolean | undefined>(undefined);
  if (steps.length < 2 || !steps.every((step) => ['notebook', 'journal'].includes(step.name)))
    return <>{children}</>;
  const active = steps.some((step) => step.status === 'active');
  const problem = steps.some((step) => step.status === 'error' || step.status === 'interrupted');
  return (
    <ToolGroup.Root
      variant="ghost"
      open={expanded ?? problem}
      onOpenChange={setExpanded}
      data-testid="document-activity-group"
    >
      <ToolGroup.Trigger count={steps.length} active={active} label={documentGroupLabel(steps)} />
      <ToolGroup.Content>{children}</ToolGroup.Content>
    </ToolGroup.Root>
  );
}
