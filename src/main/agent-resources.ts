import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createExtensionRuntime,
  loadSkills,
  type ResourceLoader,
} from '@earendil-works/pi-coding-agent';

export const builtinToolNames = [
  'read',
  'bash',
  'edit',
  'write',
  'grep',
  'find',
  'ls',
  'powershell',
];

export function createTravelResources(options: {
  cwd: string;
  prompt: string;
  cliPath?: string;
  home?: string;
  skillRoots?: string[];
}): ResourceLoader {
  const home = options.home ?? os.homedir();
  const roots = options.skillRoots ?? [
    path.join(home, '.agents/skills'),
    path.join(home, '.codex/skills'),
    path.join(home, '.pi/agent/skills'),
  ];
  let skills: ReturnType<typeof loadSkills> = { skills: [], diagnostics: [] };
  const instructions = `${options.prompt}
你可以使用 Pi 内置工具 read、write、edit、bash、grep、find、ls，以及环境已安装时的 powershell。文件和命令在本机执行，默认工作目录为 ${options.cwd}，可按用户任务使用其他路径。旅行专用是工作目标，不代表只能调用浏览器。查询或处理资料优先使用合适的 CLI/API；需要网页交互时再用浏览器。
飞书 CLI：${options.cliPath ? `已找到 ${options.cliPath}，通过 bash 调用 lark-cli。` : '未找到 lark-cli；不要声称已接通，需要先安装或配置 PATH。'}
涉及飞书时先用 read 阅读 lark-shared 和对应业务 SKILL.md，按技能中的相对路径读取 references；按需运行 --help，不猜命令参数。认证沿用本机 CLI，先检查 auth status，访问用户资源使用 --as user。缺少权限时说明实际错误，按所需业务域授权，不自动扩大到全部权限。不要读取或打印凭据文件、访问令牌或密钥。CLI 路径参数使用当前工作目录内的相对路径。
用户明确要求的读写操作可以执行；发消息、发邮件、删除资源等必须有相应用户意图，不能从“开放工具”推断授权。遇到 CLI 退出码 10 的高风险确认，展示具体操作并等用户明确确认，不自行追加确认参数绕过。
不要根据历史会话中“没有 CLI/文件工具”的回复判断当前能力，以本轮工具清单和执行结果为准。`;
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => skills,
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => instructions,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {
      const skillPaths: string[] = [];
      for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
          if (entry.name.startsWith('lark-') && (entry.isDirectory() || entry.isSymbolicLink())) {
            const file = path.join(root, entry.name, 'SKILL.md');
            if (fs.existsSync(file)) skillPaths.push(file);
          }
        }
      }
      skills = loadSkills({
        cwd: options.cwd,
        agentDir: options.cwd,
        skillPaths,
        includeDefaults: false,
      });
    },
  };
}
