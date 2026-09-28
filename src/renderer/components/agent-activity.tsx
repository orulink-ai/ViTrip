import { t } from '../i18n';
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
  navigate: '打开网页',
  observe: '阅读网页',
  computer_use: '操作浏览器',
  click: '点击网页',
  type: '填写信息',
  press: '操作键盘',
  scroll: '浏览页面',
  plan: '更新行程',
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
  if (!step) return null;
  const document = ['notebook', 'journal'].includes(step.name)
    ? documentOperation(step)
    : undefined;
  const label = t(document?.label ?? labels[step.name] ?? step.name);
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
          query={document?.target ?? step.name}
          request={step.input}
          result={step.output || t('等待工具返回…')}
          running={step.status === 'active'}
          open={open}
          onOpenChange={setOpen}
        />
      )}
      {(open || step.status !== 'complete') && (
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
