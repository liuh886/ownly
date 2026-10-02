import type { WYQDLanguage } from './i18n';

export interface OwnlyLocalDataCopy {
  connected: string;
  connectedDescription: string;
  disconnected: string;
  disconnectedDescription: string;
  createOrOpen: string;
  changeFolder: string;
  disconnect: string;
  /** Persistent demo-mode banner: what is on screen and what will not persist. */
  demoNote: string;
  connecting: string;
  browserNotSupported: string;
  mobileNotSupported: string;
  connectFailed: string;
  initializeFailed: string;
  createdNotice: string;
  openedNotice: string;
  onboarding: {
    eyebrow: string;
    title: string;
    description: string;
    storageQuestion: string;
    localTitle: string;
    localDescription: string;
    cloudTitle: string;
    cloudDescription: string;
    cloudNote: string;
    cloudRule: string;
    createTitle: string;
    createDescription: string;
    createButton: string;
    openTitle: string;
    openDescription: string;
    openButton: string;
    recommendationTitle: string;
  recommendation: string;
  /** Peer card beside create/open, so demo reads as a choice, not an escape. */
  demoTitle: string;
  demoDescription: string;
  demoButton: string;
  /** Neutral close (Escape / backdrop). Must not pick a mode for the user. */
  dismiss: string;
  /** Shown on both folder cards: what connecting does to the demo session. */
  connectDiscardsDemo: string;
  };
}

const COPY: Record<WYQDLanguage, OwnlyLocalDataCopy> = {
  en: {
    connected: 'Data folder connected',
    connectedDescription: 'Ownly reads and writes the folder you selected. Ownly does not host your Markdown data.',
    disconnected: 'No data folder',
    disconnectedDescription: 'Nothing is connected, so there is nowhere to read or write. Choose a data folder to start, or continue in demo mode to look around first.',
    createOrOpen: 'Choose data folder',
    changeFolder: 'Change data folder',
    disconnect: 'Disconnect',
    demoNote: 'Demo mode never writes a file, so nothing you do here is kept.',
    connecting: 'Connecting data…',
    browserNotSupported: 'This browser does not support direct folder access, or authorization was cancelled. Use a current desktop Chrome or Microsoft Edge browser.',
    mobileNotSupported: 'Phone browsers cannot open data folders directly. Continue in demo mode to explore, then connect your data folder from desktop Chrome or Microsoft Edge.',
    connectFailed: 'Failed to connect the data folder.',
    initializeFailed: 'Failed to initialize Ownly data.',
    createdNotice: 'Ownly data folder created.',
    openedNotice: 'Ownly data folder connected.',
    onboarding: {
      eyebrow: 'User-controlled storage · No account required',
      title: 'Choose where your Ownly files live',
      description: 'Ownly works directly with a folder you choose. It does not upload your records to an Ownly server.',
      storageQuestion: 'Storage location',
      localTitle: 'On this device',
      localDescription: 'Use a normal local folder. Nothing is synchronized unless you choose to do so outside Ownly.',
      cloudTitle: 'In your personal cloud folder',
      cloudDescription: 'Choose a local folder already synchronized by Dropbox, Google Drive, OneDrive, iCloud Drive, or another provider.',
      cloudNote: 'Keep the folder available offline. Ownly reads and writes normal local files; your provider handles synchronization.',
      cloudRule: 'Use one sync provider per Ownly data folder to reduce conflicting copies.',
      createTitle: 'Create new data',
      createDescription: 'Choose a folder in the storage location you want. Ownly creates the complete data structure automatically. Obsidian is not required.',
      createButton: 'Choose save location',
      openTitle: 'Open existing data',
      openDescription: 'Choose an existing Ownly data folder, or an Obsidian Vault that contains one, from the storage location you want.',
      openButton: 'Choose existing folder',
      recommendationTitle: 'Your data stays under your control',
      recommendation: 'Ownly does not host your personal ledger. If you choose a synced folder, that provider may upload and synchronize the files under its own privacy and security policies. Obsidian remains optional.',
      demoTitle: 'Look around first',
      demoDescription: 'Browse a full set of example records with nothing written to disk. Demo mode is read-only and ends with this tab.',
      demoButton: 'Try demo mode',
      dismiss: 'Decide later',
      connectDiscardsDemo: 'Connecting a folder ends the demo session. Example data is not carried over, and anything you changed in demo is discarded.',
    },
  },
  zh: {
    connected: '数据目录已连接',
    connectedDescription: 'Ownly 直接读写你选择的目录，不托管你的 Markdown 数据。',
    disconnected: '未连接数据目录',
    disconnectedDescription: '当前没有连接任何目录，Ownly 无处读取或写入。选择一个数据目录开始使用，或先用演示模式看看效果。使用 Ownly 不要求安装 Obsidian。',
    createOrOpen: '选择数据目录',
    changeFolder: '更换数据目录',
    disconnect: '断开连接',
    demoNote: '演示模式不会写入任何文件，所以你在这里做的任何改动都不会被保留。',
    connecting: '正在连接数据…',
    browserNotSupported: '当前浏览器不支持直接访问目录，或授权已取消。请使用最新版桌面 Chrome 或 Microsoft Edge。',
    mobileNotSupported: '手机浏览器无法直接打开数据目录。请先使用演示模式体验，再到桌面 Chrome 或 Edge 连接你的数据目录。',
    connectFailed: '连接数据目录失败。',
    initializeFailed: '初始化 Ownly 数据失败。',
    createdNotice: 'Ownly 数据目录已创建。',
    openedNotice: 'Ownly 数据目录已连接。',
    onboarding: {
      eyebrow: '用户控制存储 · 无需账户',
      title: '选择 Ownly 文件保存在哪里',
      description: 'Ownly 直接使用你选择的目录，不会把记录上传到 Ownly 服务器。',
      storageQuestion: '存储位置',
      localTitle: '保存在这台设备上',
      localDescription: '使用普通本地目录。除非你在 Ownly 之外主动设置同步，否则文件不会被同步。',
      cloudTitle: '保存在个人云盘目录中',
      cloudDescription: '选择一个已由 Dropbox、Google Drive、OneDrive、iCloud Drive 或其它服务同步到本机的目录。',
      cloudNote: '请让该目录保持可离线使用。Ownly 只读写普通本地文件，同步由你的云盘服务负责。',
      cloudRule: '一个 Ownly 数据目录只使用一个同步服务，以减少冲突副本。',
      createTitle: '创建新数据',
      createDescription: '在你希望使用的存储位置中选择目录，Ownly 会自动创建完整的数据结构。无需安装 Obsidian。',
      createButton: '选择保存位置',
      openTitle: '打开已有数据',
      openDescription: '从你希望使用的存储位置中选择已有 Ownly 数据目录，或选择包含该目录的 Obsidian Vault。',
      openButton: '选择已有目录',
      recommendationTitle: '数据始终由你控制',
      recommendation: 'Ownly 不托管你的个人账本。如果你选择同步目录，对应云盘服务可能会按照其自己的隐私与安全政策上传和同步这些文件。Obsidian 仍然只是可选工具。',
      demoTitle: '先随便看看',
      demoDescription: '浏览一整套示例记录，不会向磁盘写入任何文件。演示模式是只读的，关闭这个标签页就结束了。',
      demoButton: '进入演示模式',
      dismiss: '以后再说',
      connectDiscardsDemo: '连接数据目录会结束演示会话。示例数据不会被带过去，你在演示中做过的改动也会被丢弃。',
    },
  },
};

export function getOwnlyLocalDataCopy(language: WYQDLanguage): OwnlyLocalDataCopy {
  return COPY[language];
}

/** True for phone/tablet browsers, which never offer direct folder access. */
export function isMobileDevice(userAgent?: string): boolean {
  // Explicit UA (tests / callers with their own source) keeps the classic check.
  if (userAgent !== undefined) {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  }
  // Avoid UA sniffing (Obsidian bans navigator.userAgent/platform): a coarse
  // pointer without hover is the reliable touch-first signal and works in both
  // the Web runtime and Obsidian's mobile webview.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(pointer: coarse)').matches;
}
