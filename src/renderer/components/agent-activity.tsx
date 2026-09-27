import { t } from '../i18n';
import type { ToolActivity } from '../../shared/types';
import { ToolGroup } from './assistant-ui/elements/tool-group.aui';
import { ToolFallback } from './assistant-ui/elements/tool-fallback.aui';
import type { ToolCallMessagePartStatus } from '@assistant-ui/react';

const labels: Record<string, string> = {
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
  photo_candidates: '读取来源照片',
  save_photo: '保存来源照片',
  inspect_photo: '查看已存照片',
};
const statuses = { active: '进行中', complete: '已完成', error: '失败', interrupted: '已中断' };
export function AgentActivity({ steps }: { steps: ToolActivity[] }) {
  return (
    <ToolGroup.Root defaultOpen data-testid="agent-activity">
      <ToolGroup.Trigger
        count={steps.length}
        active={steps.some((step) => step.status === 'active')}
        aria-label={`${t('执行过程 ·')}${steps.length}${t('步')}`}
      />
      <ToolGroup.Content>
        {steps.map((step) => {
          const status: ToolCallMessagePartStatus =
            step.status === 'active'
              ? { type: 'running' }
              : step.status === 'complete'
                ? { type: 'complete' }
                : {
                    type: 'incomplete',
                    reason: step.status === 'interrupted' ? 'cancelled' : 'error',
                    error: step.output,
                  };
          return (
            <ToolFallback.Root key={step.id}>
              <p className="text-sm">{t(labels[step.name] ?? step.name)}</p>
              <p className="text-xs text-muted-foreground">
                {t(statuses[step.status])}
                {step.finishedAt
                  ? ` · ${((step.finishedAt - step.startedAt) / 1000).toFixed(1)} ${t('秒')}`
                  : ''}
              </p>
              <ToolFallback.Trigger toolName={`${step.name} · ${t('查看详情')}`} status={status} />
              <ToolFallback.Content>
                <ToolFallback.Args argsText={step.input} />
                <ToolFallback.Result
                  result={
                    step.output || (step.status === 'active' ? t('等待工具返回…') : t('未返回结果'))
                  }
                />
              </ToolFallback.Content>
            </ToolFallback.Root>
          );
        })}
      </ToolGroup.Content>
    </ToolGroup.Root>
  );
}
