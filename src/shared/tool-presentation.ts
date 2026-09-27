import type { ToolActivity } from './types';
export function documentOperation(step: ToolActivity) {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(step.input);
  } catch {
    /* Older activities may contain plain text. */
  }
  const name = typeof args?.name === 'string' ? args.name : '';
  if (step.name === 'notebook') {
    const action = args?.action;
    return {
      label:
        action === 'write'
          ? '保存笔记'
          : action === 'read'
            ? '读取笔记'
            : action === 'list'
              ? '查看笔记目录'
              : '整理笔记',
      target: name || '笔记本',
      saved: step.status === 'complete' && action === 'write' ? name : '',
    };
  }
  return { label: '整理旅行手册', target: '旅行手册', saved: '' };
}
export function documentGroupLabel(steps: ToolActivity[]) {
  const failures = steps.filter((s) => s.status === 'error').length;
  if (failures) return `${failures} 项操作失败 · 查看详情`;
  if (steps.some((s) => s.status === 'interrupted')) return '文档整理已中断 · 查看详情';
  if (steps.some((s) => s.status === 'active')) return '正在整理旅行文档';
  const saved = new Set(steps.map((s) => documentOperation(s).saved).filter(Boolean));
  return saved.size
    ? `已保存 ${saved.size} 份文档 · 查看过程`
    : `已完成 ${steps.length} 项文档操作 · 查看过程`;
}
