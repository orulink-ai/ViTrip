import { Type } from 'typebox';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { Settings } from '../shared/types';
import { rankCandidates, searchLocal } from './jev-search';

export function jevSearchToolNames(settings?: Settings): string[] {
  return [
    ...(settings?.jevExperiments?.webSearch ? ['jev_web_search'] : []),
    ...(settings?.jevExperiments?.localSearch ? ['jev_search'] : []),
  ];
}
export function registerJevSearch(
  pi: ExtensionAPI,
  captured: Map<string, ToolDefinition>,
  settings: Settings,
  directory: string,
  beforeTool: (name: string) => void,
  runSignal: AbortSignal,
) {
  if (settings.jevExperiments?.localSearch)
    pi.registerTool({
      name: 'jev_search',
      label: 'JEV 本地检索',
      description:
        '实验性本地代码与文本文档检索。默认搜索当前旅行笔记本；path 可指定用户任务涉及的本机目录。返回原文、路径和行号。先本地召回再由 JEV 排序，不支持直接解析 PDF/Office。不用于读取凭据。精确符号仍可用 grep/read。',
      parameters: Type.Object({
        query: Type.String({ minLength: 1, maxLength: 2000 }),
        path: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
      }),
      execute: async (_id, args, signal) => {
        beforeTool('jev_search');
        const result = await searchLocal(
          { ...args, path: args.path || directory },
          settings,
          AbortSignal.any([runSignal, AbortSignal.timeout(60000), ...(signal ? [signal] : [])]),
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: {} };
      },
    });
  if (settings.jevExperiments?.webSearch)
    pi.registerTool({
      name: 'jev_web_search',
      label: 'JEV 联网搜索',
      description:
        '实验性联网检索：先通过 Pi 搜索服务获得来源，再用 JEV 评估相关性。开启实验时优先使用此工具；原始 web_search 仍可使用。返回来源原文及分数，正文用 fetch_content 核实。',
      parameters: Type.Object({
        query: Type.String({ minLength: 1, maxLength: 2000 }),
        numResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
      }),
      execute: async (id, args, signal, update, context) => {
        beforeTool('jev_web_search');
        const combined = AbortSignal.any([
          runSignal,
          AbortSignal.timeout(60000),
          ...(signal ? [signal] : []),
        ]);
        combined.throwIfAborted();
        if (!settings.jevApiKey) throw new Error('请先配置 JEV OpenRouter API Key');
        const search = captured.get('web_search');
        const read = captured.get('get_search_content');
        if (!search || !read) throw new Error('Pi 搜索服务不可用');
        const result = await search.execute(
          id,
          { ...args, numResults: args.numResults ?? 8 },
          combined,
          update,
          context,
        );
        const details = result.details as { searchId?: string; successfulQueries?: number };
        if (!details.searchId || !details.successfulQueries) return result;
        const full = await read.execute(
          id + '-sources',
          { responseId: details.searchId, queryIndex: 0, offset: 0, limit: 12000 },
          combined,
          update,
          context,
        );
        const text = full.content
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('\n');
        // pi-web-access's stored result formatter keeps each URL and snippet under a level-3 heading.
        const sections = text
          .split(/(?=^### )/m)
          .filter((s) => s.startsWith('### '))
          .slice(0, 20);
        if (!sections.length)
          return {
            ...result,
            content: [
              {
                type: 'text',
                text:
                  'JEV 未取得可排序的来源，以下为原始 Pi 搜索结果：\n' +
                  result.content
                    .filter((p) => p.type === 'text')
                    .map((p) => p.text)
                    .join('\n'),
              },
            ],
          };
        try {
          const ranked = await rankCandidates(
            args.query,
            sections.map((text, i) => ({ id: String(i), text })),
            settings,
            combined,
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  provider: 'pi-web-access + JEV',
                  sources: ranked,
                  responseId: details.searchId,
                  note: '相关性评分不是事实验证；仅排序本次返回的有限来源。用 fetch_content 读取正文，get_search_content 可查看原始结果。',
                }),
              },
            ],
            details: { ...details, jevRanked: true },
          };
        } catch (error) {
          combined.throwIfAborted();
          return {
            ...result,
            content: [
              {
                type: 'text',
                text:
                  'JEV 排序暂不可用，已保留原始 Pi 搜索结果：\n' +
                  result.content
                    .filter((p) => p.type === 'text')
                    .map((p) => p.text)
                    .join('\n'),
              },
            ],
            details: { ...details, jevRanked: false },
          };
        }
      },
    });
}
