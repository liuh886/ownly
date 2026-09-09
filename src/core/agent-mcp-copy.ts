import type { WYQDLanguage } from './i18n';

export interface AgentMcpCopy {
  eyebrow: string;
  title: string;
  description: string;
  scopeBadge: string;
  localBadge: string;
  whatTitle: string;
  whatBody: string;
  dataTitle: string;
  dataBody: string;
  dataExample: string;
  dataNote: string;
  setupTitle: string;
  setupIntro: string;
  codexLabel: string;
  codexCommand: string;
  codexVerify: string;
  claudeLabel: string;
  claudeCommand: string;
  claudeVerify: string;
  otherLabel: string;
  otherCommand: string;
  otherHint: string;
  placeholderNote: string;
  promptsTitle: string;
  prompts: string[];
  safetyTitle: string;
  safetyBody: string;
  docsLabel: string;
  closeLabel: string;
  copyLabel: string;
  copiedLabel: string;
}

const COPY: Record<WYQDLanguage, AgentMcpCopy> = {
  en: {
    eyebrow: 'Agent access',
    title: 'Use Ownly with Codex or Claude Code',
    description:
      'One command connects your agent to the same local Ownly facts. No clone, no build, no uploads.',
    scopeBadge: 'MCP v0.7 · read-only by default',
    localBadge: 'Local stdio · npm',
    whatTitle: 'What this gives you',
    whatBody:
      'Ask about renewals, spending, object history, or data health without letting the agent scrape Markdown files or guess from filenames.',
    dataTitle: '1 · Point it at your Ownly data',
    dataBody:
      'Use the folder containing the default Ownly/ directory, or a custom root containing Objects/ directly. Browsers never reveal the real OS path — copy it from Finder, File Explorer, Terminal, or your Obsidian vault location.',
    dataExample: '<VAULT_OR_DATA_ROOT> — e.g. D:\\MyVault or /Users/you/Vault',
    dataNote:
      'Never point at Objects/ itself or a single Markdown file. Quote Windows paths that contain spaces.',
    setupTitle: '2 · Connect with one command',
    setupIntro:
      'Published on npm (0.7.1+). Requires Node 20+ and nothing else.',
    codexLabel: 'Codex',
    codexCommand:
      'codex mcp add ownly -- npx -y @ownly-app/mcp --data-dir <VAULT_OR_DATA_ROOT>',
    codexVerify: 'Verify with: codex mcp list · inside Codex use /mcp',
    claudeLabel: 'Claude Code',
    claudeCommand:
      'claude mcp add --transport stdio --scope user ownly -- npx -y @ownly-app/mcp --data-dir <VAULT_OR_DATA_ROOT>',
    claudeVerify: 'Verify with: claude mcp list · inside Claude Code use /mcp',
    otherLabel: 'Other clients (Cursor / Windsurf / VS Code)',
    otherCommand:
      '{"mcpServers":{"ownly":{"command":"npx","args":["-y","@ownly-app/mcp","--data-dir","<VAULT_OR_DATA_ROOT>"]}}}',
    otherHint:
      'Paste into your MCP config file (Cursor: Settings → MCP; Claude Desktop: claude_desktop_config.json), then restart the client.',
    placeholderNote:
      'Replace <VAULT_OR_DATA_ROOT> with the real absolute path to your data location.',
    promptsTitle: '3 · Start with one of these',
    prompts: [
      'Which subscriptions renew in the next 30 days? Use Ownly, do not guess from memory.',
      'Add this subscription to Ownly. Show the exact preview and wait for my confirmation before committing.',
      'Why did I stop using this item? Use its Ownly history and keep facts separate from inference.',
    ],
    safetyTitle: 'Safe by default',
    safetyBody:
      'Read-only unless started with --allow-write. Every write needs a validated before/after preview plus your confirmation, with a safety backup first. Your Markdown stays local; only facts returned by a tool call enter the agent context.',
    docsLabel: 'Open full MCP guide on GitHub',
    closeLabel: 'Close',
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
  },
  zh: {
    eyebrow: 'Agent 访问',
    title: '让 Codex 或 Claude Code 使用 Ownly',
    description:
      '一行命令，让外部 Agent 查询同一份本地 Markdown 事实源。不用 clone，不用构建，不上传数据。',
    scopeBadge: 'MCP v0.7 · 默认只读',
    localBadge: '本地 stdio · npm',
    whatTitle: '它能解决什么',
    whatBody:
      '直接询问续费、订阅支出、物品历史或数据健康度，不需要让 Agent 自己扫描 Markdown、猜文件名或推断状态。',
    dataTitle: '1 · 告诉它你的 Ownly 数据在哪里',
    dataBody:
      '填写“包含默认 Ownly/ 文件夹”的目录，或内部含有 Objects/ 的自定义数据根。浏览器不会暴露真实系统路径，请从 Finder、文件资源管理器、Terminal 或 Obsidian Vault 位置复制。',
    dataExample: '<VAULT_OR_DATA_ROOT> —— 例如 D:\\MyVault 或 /Users/you/Vault',
    dataNote:
      '不要指向 Objects/ 本身或某个 Markdown 文件；Windows 路径含空格时请加引号。',
    setupTitle: '2 · 一行命令接好',
    setupIntro:
      '已发布到 npm（0.7.1+），只需要 Node 20+，不需要其它准备。',
    codexLabel: 'Codex',
    codexCommand:
      'codex mcp add ownly -- npx -y @ownly-app/mcp --data-dir <VAULT_OR_DATA_ROOT>',
    codexVerify: '验证：codex mcp list · 进入 Codex 后使用 /mcp',
    claudeLabel: 'Claude Code',
    claudeCommand:
      'claude mcp add --transport stdio --scope user ownly -- npx -y @ownly-app/mcp --data-dir <VAULT_OR_DATA_ROOT>',
    claudeVerify: '验证：claude mcp list · 进入 Claude Code 后使用 /mcp',
    otherLabel: '其它客户端（Cursor / Windsurf / VS Code）',
    otherCommand:
      '{"mcpServers":{"ownly":{"command":"npx","args":["-y","@ownly-app/mcp","--data-dir","<VAULT_OR_DATA_ROOT>"]}}}',
    otherHint:
      '粘贴到你的 MCP 配置文件（Cursor：Settings → MCP；Claude Desktop：claude_desktop_config.json），然后重启客户端。',
    placeholderNote:
      '把 <VAULT_OR_DATA_ROOT> 替换成你的数据目录真实绝对路径即可。',
    promptsTitle: '3 · 从这三句开始问',
    prompts: [
      '未来 30 天有哪些订阅会续费？请使用 Ownly，不要凭记忆猜。',
      '把这个订阅加入 Ownly。请先展示完整预览，等待我确认后再提交。',
      '我为什么后来不再使用这个物品？请查 Ownly 历史，并把事实与推断分开。',
    ],
    safetyTitle: '默认安全',
    safetyBody:
      '默认只读；只有使用 --allow-write 启动才允许提交。每次写入都需要已校验的前后对比预览加你的确认，提交前先创建安全备份。Markdown 一直留在本地，只有被工具返回的那部分事实会进入 Agent 上下文。',
    docsLabel: '在 GitHub 查看完整 MCP 文档',
    closeLabel: '关闭',
    copyLabel: '复制',
    copiedLabel: '已复制',
  },
};

export function getAgentMcpCopy(language: WYQDLanguage): AgentMcpCopy {
  return COPY[language];
}
