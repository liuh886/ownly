import type { WYQDLanguage } from './i18n';

export interface OwnlyLocalDataCopy {
  connected: string;
  connectedDescription: string;
  disconnectedDescription: string;
  createOrOpen: string;
  changeFolder: string;
  connecting: string;
  browserNotSupported: string;
  connectFailed: string;
  initializeFailed: string;
  createdNotice: string;
  openedNotice: string;
  onboarding: {
    eyebrow: string;
    title: string;
    description: string;
    createTitle: string;
    createDescription: string;
    createButton: string;
    openTitle: string;
    openDescription: string;
    openButton: string;
    recommendationTitle: string;
    recommendation: string;
    demo: string;
  };
}

const COPY: Record<WYQDLanguage, OwnlyLocalDataCopy> = {
  en: {
    connected: 'Local data connected',
    connectedDescription: 'Markdown data stays in the Ownly data folder you selected.',
    disconnectedDescription: 'Create new data or open existing Ownly data. Obsidian is not required.',
    createOrOpen: 'Create or open data',
    changeFolder: 'Change data folder',
    connecting: 'Connecting Ownly data…',
    browserNotSupported: 'This browser does not support direct folder access, or authorization was cancelled. Use a current desktop Chrome or Microsoft Edge browser.',
    connectFailed: 'Failed to connect Ownly data.',
    initializeFailed: 'Failed to initialize Ownly data.',
    createdNotice: 'Ownly data folder created.',
    openedNotice: 'Ownly data folder connected.',
    onboarding: {
      eyebrow: 'Local-first · No account required',
      title: 'Start using Ownly',
      description: 'Choose where your Ownly files live. Ownly works directly with the folder you select and does not upload your records to an Ownly server.',
      createTitle: 'Create new Ownly data',
      createDescription: 'Choose a folder you control. It can be a normal local folder or a personal cloud-synced folder.',
      createButton: 'Choose data location',
      openTitle: 'Open existing data',
      openDescription: 'Choose an existing Ownly data folder or an Obsidian Vault that contains one.',
      openButton: 'Choose existing folder',
      recommendationTitle: 'Recommended, not required',
      recommendation: 'Ownly works without Obsidian. Keeping the Ownly data folder inside an Obsidian Vault is recommended so Web, PWA, the Obsidian plugin, and the Agent CLI can share readable Markdown.',
      demo: 'Continue in demo mode',
    },
  },
  zh: {
    connected: '数据目录已连接',
    connectedDescription: 'Markdown 数据保存在你选择的 Ownly 数据目录中。',
    disconnectedDescription: '创建新的数据，或打开已有 Ownly 数据。使用 Ownly 不要求安装 Obsidian。',
    createOrOpen: '创建或打开数据',
    changeFolder: '更换数据目录',
    connecting: '正在连接 Ownly 数据…',
    browserNotSupported: '当前浏览器不支持直接访问目录，或授权已取消。请使用最新版桌面 Chrome 或 Microsoft Edge。',
    connectFailed: '连接 Ownly 数据失败。',
    initializeFailed: '初始化 Ownly 数据失败。',
    createdNotice: 'Ownly 数据目录已创建。',
    openedNotice: 'Ownly 数据目录已连接。',
    onboarding: {
      eyebrow: '本地优先 · 无需账户',
      title: '开始使用 Ownly',
      description: '选择 Ownly 文件的保存位置。Ownly 直接使用你选择的目录，不会把记录上传到 Ownly 服务器。',
      createTitle: '创建新的 Ownly 数据',
      createDescription: '选择一个你控制的目录，可以是普通本地目录，也可以是个人云同步目录。',
      createButton: '选择数据位置',
      openTitle: '打开已有数据',
      openDescription: '选择已有的 Ownly 数据目录，或选择包含该目录的 Obsidian Vault。',
      openButton: '选择已有目录',
      recommendationTitle: '建议但不强制',
      recommendation: 'Ownly 完全可以脱离 Obsidian 使用。仍建议将 Ownly 数据目录放在 Obsidian Vault 中，让 Web、PWA、Obsidian 插件和 Agent CLI 共享可直接阅读的 Markdown。',
      demo: '暂时使用演示模式',
    },
  },
};

export function getOwnlyLocalDataCopy(language: WYQDLanguage): OwnlyLocalDataCopy {
  return COPY[language];
}
