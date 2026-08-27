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
  buildLabel: string;
  buildCommand: string;
  codexLabel: string;
  codexCommand: string;
  codexVerify: string;
  claudeLabel: string;
  claudeCommand: string;
  claudeVerify: string;
  placeholderNote: string;
  promptsTitle: string;
  prompts: string[];
  privacyTitle: string;
  privacyBody: string;
  readOnlyTitle: string;
  readOnlyBody: string;
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
      'Ownly MCP lets an external agent query and, when explicitly enabled, maintain validated records in the same local Markdown source of truth.',
    scopeBadge: 'MCP v0.2 · read-only by default',
    localBadge: 'Local stdio process',
    whatTitle: 'What this gives you',
    whatBody:
      'Ask an agent about renewals, subscription spend, object history, review evidence, or data health without asking it to scrape Markdown files or infer state from filenames.',
    dataTitle: '1 · Point MCP at your Ownly data location',
    dataBody:
      'Use either the operating-system folder containing the default Ownly/ directory or a custom data root that contains Objects/ directly. Do not point at Objects/ itself or an individual Markdown file.',
    dataExample: '<VAULT>/Ownly/Objects/... or <CUSTOM_ROOT>/Objects/...',
    dataNote:
      'The Web/PWA can open a folder but browsers do not expose its absolute OS path. Use the real local path from Finder, File Explorer, Terminal, or your Obsidian Vault location.',
    setupTitle: '2 · Build once, then register the local MCP process',
    setupIntro:
      'The public npm release is tracked separately. The current product path uses the source-built local executable below.',
    buildLabel: 'Build Ownly MCP',
    buildCommand: `git clone https://github.com/liuh886/ownly.git\ncd ownly\nnpm ci\nnpm install --prefix packages/mcp --ignore-scripts --no-audit --no-fund\nnpm run build --prefix packages/mcp`,
    codexLabel: 'Connect Codex',
    codexCommand:
      'codex mcp add ownly -- node /absolute/path/to/ownly/packages/mcp/dist/index.js --data-dir <VAULT_OR_DATA_ROOT>',
    codexVerify: 'Verify with: codex mcp list · inside Codex use /mcp',
    claudeLabel: 'Connect Claude Code',
    claudeCommand:
      'claude mcp add --transport stdio --scope user ownly -- node /absolute/path/to/ownly/packages/mcp/dist/index.js --data-dir <VAULT_OR_DATA_ROOT>',
    claudeVerify: 'Verify with: claude mcp list · inside Claude Code use /mcp',
    placeholderNote:
      'Replace both placeholders with real absolute paths. Keep the Ownly source checkout and your Ownly data folder wherever you normally store them.',
    promptsTitle: '3 · Start with questions that benefit from recorded evidence',
    prompts: [
      'Which subscriptions renew in the next 30 days? Use Ownly rather than guessing from memory.',
      'Show my active software subscriptions and annualized cost. Do not add different currencies together.',
      'Which subscriptions look worth reviewing first? Separate recorded Ownly facts from your recommendation.',
      'Why did I stop using this item? Use its Ownly history and distinguish facts from inference.',
      'Add this subscription to Ownly. Show the exact preview and wait for my confirmation before committing.',
      'Analyze my recurring costs, but run Ownly Doctor first and tell me if the dataset has material integrity problems.',
    ],
    privacyTitle: 'Privacy boundary',
    privacyBody:
      'Your canonical Ownly Markdown stays on your machine and Ownly does not upload the whole dataset to an Ownly service. Facts returned by a tool call are sent to the MCP client and may enter that client/model context under its own data policy.',
    readOnlyTitle: 'Writes require two explicit gates',
    readOnlyBody:
      'MCP starts read-only. Start it with --allow-write (or OWNLY_MCP_ALLOW_WRITE=1) to permit commits. The agent must still prepare a validated before/after preview and obtain confirmation before commit; Ownly creates a safety backup first.',
    docsLabel: 'Open full MCP guide on GitHub',
    closeLabel: 'Close',
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
  },
  zh: {
    eyebrow: 'Agent 访问',
    title: '让 Codex 或 Claude Code 使用 Ownly',
    description:
      'Ownly MCP 让外部 Agent 查询同一份本地 Markdown 事实源；显式授权后，也能安全维护其中已经校验过的记录。',
    scopeBadge: 'MCP v0.2 · 默认只读',
    localBadge: '本地 stdio 进程',
    whatTitle: '它能解决什么',
    whatBody:
      '你可以直接询问续费、订阅支出、物品历史、复盘证据或数据健康度，而不需要让 Agent 自己扫描 Markdown、猜文件名或推断状态。',
    dataTitle: '1 · 告诉 MCP 你的 Ownly 数据在哪里',
    dataBody:
      '可以填写“包含默认 Ownly/ 文件夹”的目录，也可以直接填写内部含有 Objects/ 的自定义数据根。不要指向 Objects/ 本身或某个 Markdown 文件。',
    dataExample: '<VAULT>/Ownly/Objects/... 或 <CUSTOM_ROOT>/Objects/...',
    dataNote:
      'Web/PWA 可以打开文件夹，但浏览器不会把真实的系统绝对路径暴露给网页。请从 Finder、文件资源管理器、Terminal，或你的 Obsidian Vault 位置取得真实本地路径。',
    setupTitle: '2 · 本地构建一次，然后把 MCP 注册给 Agent',
    setupIntro:
      '公共 npm 发布由独立任务跟踪。当前产品内给出的可执行路径，是直接使用已经落地的本地 MCP 源码包。',
    buildLabel: '构建 Ownly MCP',
    buildCommand: `git clone https://github.com/liuh886/ownly.git\ncd ownly\nnpm ci\nnpm install --prefix packages/mcp --ignore-scripts --no-audit --no-fund\nnpm run build --prefix packages/mcp`,
    codexLabel: '连接 Codex',
    codexCommand:
      'codex mcp add ownly -- node /absolute/path/to/ownly/packages/mcp/dist/index.js --data-dir <VAULT_OR_DATA_ROOT>',
    codexVerify: '验证：codex mcp list · 进入 Codex 后使用 /mcp',
    claudeLabel: '连接 Claude Code',
    claudeCommand:
      'claude mcp add --transport stdio --scope user ownly -- node /absolute/path/to/ownly/packages/mcp/dist/index.js --data-dir <VAULT_OR_DATA_ROOT>',
    claudeVerify: '验证：claude mcp list · 进入 Claude Code 后使用 /mcp',
    placeholderNote:
      '把两个占位符都替换成真实绝对路径即可。Ownly 源码目录和 Ownly 数据目录可以继续放在你原本习惯的位置。',
    promptsTitle: '3 · 从真正需要“历史证据”的问题开始问',
    prompts: [
      '未来 30 天有哪些订阅会续费？请使用 Ownly，不要凭记忆猜。',
      '列出我仍在使用的软件订阅和年化成本。不同币种不要直接相加。',
      '哪些订阅最值得我优先复盘？请把 Ownly 已记录事实与您的建议分开。',
      '我为什么后来不再使用这个物品？请查 Ownly 历史，并区分事实与推断。',
      '把这个订阅加入 Ownly。请先展示完整预览，等待我确认后再提交。',
      '分析我的订阅支出，但先运行 Ownly Doctor；如果数据存在重要完整性问题，先告诉我。',
    ],
    privacyTitle: '隐私边界',
    privacyBody:
      'Ownly 的 Markdown 事实源仍保留在你的电脑上，Ownly 不会把整份数据上传到 Ownly 云服务。但当 Agent 主动调用工具时，被返回的那部分事实会交给 MCP 客户端，并可能按照该客户端/模型自己的数据政策进入上下文。',
    readOnlyTitle: '写入需要两道明确授权',
    readOnlyBody:
      'MCP 启动时默认只读。只有使用 --allow-write（或 OWNLY_MCP_ALLOW_WRITE=1）才允许提交；Agent 仍必须先生成已校验的前后对比预览，取得确认后再提交，且 Ownly 会先创建安全备份。',
    docsLabel: '在 GitHub 查看完整 MCP 文档',
    closeLabel: '关闭',
    copyLabel: '复制',
    copiedLabel: '已复制',
  },
};

export function getAgentMcpCopy(language: WYQDLanguage): AgentMcpCopy {
  return COPY[language];
}
