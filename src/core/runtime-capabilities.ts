import type { WYQDRuntimeTarget } from './runtime';

export const OWNLY_DATA_BEHAVIOR_CONTRACT = 'ownly-local-markdown-v1' as const;

export const OWNLY_PRODUCT_SURFACES = ['web', 'pwa', 'obsidian'] as const;
export type OwnlyProductSurface = (typeof OWNLY_PRODUCT_SURFACES)[number];

export const OWNLY_SHARED_DATA_OPERATIONS = {
  create: true,
  read: true,
  update: true,
  archive: true,
  restore: true,
  permanentDelete: true,
} as const;

export const OWNLY_SHARED_RECORD_SUPPORT = {
  physical: true,
  recurringCost: true,
  oneTimeExperience: true,
  account: true,
  snapshot: true,
  review: true,
  objectLog: true,
} as const;

export type OwnlyConnectionModel = 'browser-directory-permission' | 'obsidian-vault';
export type OwnlyMarkdownAccess = 'browser-granted-folder' | 'native-vault-files';

export interface OwnlyRuntimeCapabilities {
  surface: OwnlyProductSurface;
  dataBehaviorContract: typeof OWNLY_DATA_BEHAVIOR_CONTRACT;
  dataRuntime: 'browser' | 'obsidian';
  operations: typeof OWNLY_SHARED_DATA_OPERATIONS;
  records: typeof OWNLY_SHARED_RECORD_SUPPORT;
  connectionModel: OwnlyConnectionModel;
  markdownAccess: OwnlyMarkdownAccess;
  canPromptForLocalData: boolean;
  canInstallPwa: boolean;
  hasOfflineAppShell: boolean;
  firstObjectOnboarding: boolean;
  backupRestoreMigration: boolean;
  languageAndCurrency: boolean;
  doctor: boolean;
  intentionalExceptions: readonly string[];
}

const SHARED_PRODUCT_CAPABILITIES = {
  dataBehaviorContract: OWNLY_DATA_BEHAVIOR_CONTRACT,
  operations: OWNLY_SHARED_DATA_OPERATIONS,
  records: OWNLY_SHARED_RECORD_SUPPORT,
  firstObjectOnboarding: true,
  backupRestoreMigration: true,
  languageAndCurrency: true,
  doctor: true,
} as const;

const WEB_DATA_CAPABILITIES = {
  ...SHARED_PRODUCT_CAPABILITIES,
  dataRuntime: 'browser',
  connectionModel: 'browser-directory-permission',
  markdownAccess: 'browser-granted-folder',
  canPromptForLocalData: true,
} as const;

export const OWNLY_RUNTIME_CAPABILITY_MATRIX = {
  web: {
    ...WEB_DATA_CAPABILITIES,
    surface: 'web',
    canInstallPwa: true,
    hasOfflineAppShell: false,
    intentionalExceptions: [
      'The browser may require local-folder permission to be renewed after restart or permission reset.',
      'Direct local-folder access requires a File System Access API capable desktop browser.',
    ],
  },
  pwa: {
    ...WEB_DATA_CAPABILITIES,
    surface: 'pwa',
    canInstallPwa: false,
    hasOfflineAppShell: true,
    intentionalExceptions: [
      'PWA installation changes launch and offline-shell behavior only; data behavior remains identical to hosted Web.',
      'The browser may require local-folder permission to be renewed after restart or permission reset.',
    ],
  },
  obsidian: {
    ...SHARED_PRODUCT_CAPABILITIES,
    surface: 'obsidian',
    dataRuntime: 'obsidian',
    connectionModel: 'obsidian-vault',
    markdownAccess: 'native-vault-files',
    canPromptForLocalData: false,
    canInstallPwa: false,
    hasOfflineAppShell: false,
    intentionalExceptions: [
      'Obsidian can open and edit source Markdown through native Vault behavior.',
      'The configured Ownly data folder is resolved through plugin settings rather than a browser directory picker.',
    ],
  },
} as const satisfies Record<OwnlyProductSurface, OwnlyRuntimeCapabilities>;

export function getWYQDRuntimeCapabilities(
  runtimeTarget: WYQDRuntimeTarget,
): OwnlyRuntimeCapabilities {
  return runtimeTarget === 'web'
    ? OWNLY_RUNTIME_CAPABILITY_MATRIX.web
    : OWNLY_RUNTIME_CAPABILITY_MATRIX.obsidian;
}

export function dataBehaviorSignature(capabilities: OwnlyRuntimeCapabilities): string {
  return JSON.stringify({
    contract: capabilities.dataBehaviorContract,
    operations: capabilities.operations,
    records: capabilities.records,
    firstObjectOnboarding: capabilities.firstObjectOnboarding,
    backupRestoreMigration: capabilities.backupRestoreMigration,
    languageAndCurrency: capabilities.languageAndCurrency,
    doctor: capabilities.doctor,
  });
}
