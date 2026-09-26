import type { ToolActivity } from '../../shared/types';
import { CircleCheck, CircleX, LoaderCircle, PauseCircle } from 'lucide-react';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from './ai-elements/chain-of-thought';
import { Tool, ToolHeader, ToolContent } from './ai-elements/tool';

const labels: Record<string, string> = {
  navigate: '打开网页',
  observe: '阅读网页',
  computer_use: '操作浏览器',
  click: '点击网页',
  type: '填写信息',
  press: '操作键盘',
  scroll: '浏览页面',
  plan: '更新行程',
  journal: '整理旅行手册',
};
const statuses = { active: '进行中', complete: '已完成', error: '失败', interrupted: '已中断' };
const icons = {
  active: LoaderCircle,
  complete: CircleCheck,
  error: CircleX,
  interrupted: PauseCircle,
};
export function AgentActivity({ steps }: { steps: ToolActivity[] }) {
  return (
    <ChainOfThought defaultOpen data-testid="agent-activity">
      <ChainOfThoughtHeader>执行过程 · {steps.length} 步</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((step) => (
          <ChainOfThoughtStep
            key={step.id}
            icon={icons[step.status]}
            label={labels[step.name] ?? step.name}
            status={step.status === 'active' ? 'active' : 'complete'}
            description={`${statuses[step.status]}${step.finishedAt ? ` · ${((step.finishedAt - step.startedAt) / 1000).toFixed(1)} 秒` : ''}`}
          >
            <Tool>
              <ToolHeader
                type="dynamic-tool"
                toolName={step.name}
                title={`${step.name} · 查看详情`}
                state={
                  step.status === 'active'
                    ? 'input-available'
                    : step.status === 'complete'
                      ? 'output-available'
                      : 'output-error'
                }
              />
              <ToolContent>
                <div>
                  <p className="text-xs text-muted-foreground">调用参数</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {step.input}
                  </pre>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">执行结果</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {step.output || (step.status === 'active' ? '等待工具返回…' : '未返回结果')}
                  </pre>
                </div>
              </ToolContent>
            </Tool>
          </ChainOfThoughtStep>
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
