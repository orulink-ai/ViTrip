import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DefaultResourceLoader,
  SettingsManager,
  type ExtensionFactory,
} from '@earendil-works/pi-coding-agent';
export const webToolNames = ['web_enable', 'web_search', 'fetch_content', 'get_search_content'];
export function searchConfig(hasTavily: boolean) {
  return {
    provider: hasTavily ? 'tavily' : 'exa',
    tavilyApiKey: '$VITRIP_TAVILY_API_KEY',
    workflow: 'none',
    webSearch: { allowedProviders: [hasTavily ? 'tavily' : 'exa'] },
    tools: { sourceCheck: { enabled: false } },
    commands: {
      websearch: { enabled: false },
      curator: { enabled: false },
      search: { enabled: false },
      'google-account': { enabled: false },
    },
    fetch: { defaultMode: 'readable', allowedModes: ['readable'] },
    fetchRouting: { allowRemoteHostedProviders: false },
  };
}
let configDirectory: string | undefined;
/** Called by the desktop host before importing the extension; never touches the user's Pi config. */
export async function configureWebSearch(directory: string, tavilyKey = '') {
  if (configDirectory && directory !== configDirectory)
    throw new Error('搜索配置目录在进程内不能变更');
  configDirectory = directory;
  process.env.PI_CODING_AGENT_DIR = directory;
  process.env.VITRIP_TAVILY_API_KEY = tavilyKey;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    path.join(directory, 'web-search.json'),
    JSON.stringify(searchConfig(!!tavilyKey)),
    { mode: 0o600 },
  );
}
export async function loadWebSearch(
  cwd: string,
  signal: AbortSignal,
  beforeTool: (name: string) => void,
) {
  if (!configDirectory) throw new Error('搜索服务尚未初始化');
  const { default: upstream } = await import('pi-web-access/dist/index.js');
  const factory: ExtensionFactory = (pi) =>
    upstream({
      ...pi,
      registerTool: (tool) => {
        if (!webToolNames.includes(tool.name)) return;
        pi.registerTool({
          ...tool,
          execute: async (id, args, toolSignal, update, context) => {
            beforeTool(tool.name);
            const combined = AbortSignal.any([
              signal,
              AbortSignal.timeout(60000),
              ...(toolSignal ? [toolSignal] : []),
            ]);
            combined.throwIfAborted();
            const result = await tool.execute(id, args, combined, update, context);
            combined.throwIfAborted();
            if ('isError' in result && result.isError === true)
              throw new Error(
                result.content
                  .filter((part) => part.type === 'text')
                  .map((part) => part.text)
                  .join('\n'),
              );
            return result;
          },
        });
      },
    });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: configDirectory,
    settingsManager: SettingsManager.inMemory({ packages: [] }),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [factory],
  });
  await loader.reload();
  const extensions = loader.getExtensions();
  if (extensions.errors.length)
    throw new Error('搜索扩展加载失败：' + extensions.errors.map((e) => e.error).join('; '));
  return extensions;
}
