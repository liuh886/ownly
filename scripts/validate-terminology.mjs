import { readFile } from 'node:fs/promises';

const files = [
  'README.md',
  'README.zh.md',
  'PRIVACY.md',
  'docs/TERMINOLOGY.md',
  'docs/DATA_MODEL.md',
  'docs/PRODUCT_GOVERNANCE.md',
  'docs/WEB_RUNTIME.md',
  'docs/USER_GUIDE.md',
  'docs/RELEASE_CHECKLIST.md',
  'src/app/page.tsx',
  'src/core/terminology.ts',
  'src/core/first-object-copy.ts',
  'src/core/local-data-copy.ts',
  'src/components/data-safety/DataSafetyButton.tsx',
  'src/components/marketing/MarketingHome.tsx',
  'src/obsidian/main.ts',
];

const forbiddenPhrases = [
  'Select **Connect Vault**',
  '点击 **Connect Vault',
  'Ownly uses your Obsidian Vault as the database',
  'Ownly 使用你的 Obsidian Vault 作为数据库',
  'Web and PWA require Obsidian',
  'Web/PWA 需要安装 Obsidian',
  'Every Markdown file stays on your computer',
  '所有 Markdown 文件只保存在你的电脑上',
  'Keep the record on your device from day one',
  '记录从第一天起就留在你的设备中',
  "Personal Markdown files stay on the user's device",
  'All operations stay on this device. No backup is uploaded.',
  '所有操作均在本机完成，不会上传备份。',
];

const forbiddenByFile = {
  'src/app/page.tsx': [
    'possessions, recurring costs',
  ],
  'src/core/first-object-copy.ts': [
    "title: 'Recurring cost'",
    "title: '周期性支出'",
  ],
  'src/components/marketing/MarketingHome.tsx': [
    'monthly fixed cost',
    'Monthly fixed cost',
    'Recurring cost',
    '每月固定支出',
    '持续支出',
  ],
  'src/obsidian/main.ts': [
    'return createWYQDTranslator(this.settings.language).t(key);',
  ],
};

const requiredByFile = {
  'README.md': [
    'Ownly data folder',
    "Ownly doesn't host your data. You choose where your files live.",
    'On this device',
    'In your personal cloud folder',
    'one sync provider per Ownly data folder',
    'Fact-ready Agent CLI',
    'Ownly itself is not an AI assistant',
  ],
  'README.zh.md': [
    'Ownly 数据目录',
    'Ownly 不托管你的个人数据。数据保存在哪里，由你决定。',
    '保存在这台设备上',
    '保存在个人云盘目录中',
    '一个 Ownly 数据目录只使用一个同步服务',
    'Ownly 本身不是 AI 助手',
  ],
  'PRIVACY.md': [
    'user-controlled storage',
    'personal cloud',
    "Ownly doesn't host your data. You choose where your files live.",
  ],
  'docs/TERMINOLOGY.md': [
    'Ownly data folder',
    'user-controlled storage',
    'personal cloud folder',
    'one sync provider',
    'Obsidian Vault',
    'Archive',
    'Permanently delete',
    'Fact-ready, not AI-powered',
  ],
  'docs/DATA_MODEL.md': [
    'Ownly data folder',
    'Web, PWA, Obsidian, and the Agent CLI',
  ],
  'docs/PRODUCT_GOVERNANCE.md': [
    'user-controlled storage',
    'personal cloud-synced local folder',
    'One Ownly data folder, one sync provider',
    'Ownly-managed cloud synchronization',
  ],
  'docs/WEB_RUNTIME.md': [
    'On this device',
    'In your personal cloud folder',
    'one sync provider per Ownly data folder',
    'Doctor remains deterministic and provider-agnostic',
  ],
  'docs/USER_GUIDE.md': [
    'On this device',
    'In your personal cloud folder',
    'one sync provider per Ownly data folder',
    "Ownly doesn't host your data. You choose where your files live.",
  ],
  'docs/RELEASE_CHECKLIST.md': [
    'Terminology consistency',
    'npm run validate:terminology',
    'personal cloud folder',
    'one-folder / one-sync-provider rule',
  ],
  'src/app/page.tsx': [
    'possessions, subscriptions and important experiences',
    'usage and subscription costs',
  ],
  'src/core/terminology.ts': [
    "dailyCostAvg: '日均使用成本'",
    "monthlyFixedCostAvg: '月均订阅成本'",
    "highestDailyCost: '最高日使用成本'",
    "fixedCostTemplate: '订阅成本模板'",
  ],
  'src/core/first-object-copy.ts': [
    "title: 'Subscription'",
    "title: '订阅'",
  ],
  'src/core/local-data-copy.ts': [
    "title: 'Choose where your Ownly files live'",
    "cloudTitle: 'In your personal cloud folder'",
    'provider handles synchronization',
    'one sync provider per Ownly data folder',
    "title: '选择 Ownly 文件保存在哪里'",
    "cloudTitle: '保存在个人云盘目录中'",
  ],
  'src/components/data-safety/DataSafetyButton.tsx': [
    'No backup is uploaded to an Ownly server',
    'one sync provider for this Ownly data folder',
    '不会把备份上传到 Ownly 服务器',
  ],
  'src/components/marketing/MarketingHome.tsx': [
    'monthly subscription cost',
    'usage cost and subscription cost',
    'Your data, your folder, your choice.',
    'Your cloud if you want one',
    '月均订阅成本',
    '使用成本、订阅成本',
    '你的数据，你的目录，由你决定。',
  ],
  'src/obsidian/main.ts': [
    "import { getTerminologyOverride } from '@/core/terminology';",
    'return getTerminologyOverride(this.settings.language, key)',
  ],
};

const errors = [];

for (const file of files) {
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    errors.push(`${file}: could not be read (${error instanceof Error ? error.message : String(error)})`);
    continue;
  }

  for (const phrase of [...forbiddenPhrases, ...(forbiddenByFile[file] ?? [])]) {
    if (content.includes(phrase)) {
      errors.push(`${file}: contains forbidden stale wording: ${JSON.stringify(phrase)}`);
    }
  }

  for (const phrase of requiredByFile[file] ?? []) {
    if (!content.includes(phrase)) {
      errors.push(`${file}: missing required terminology: ${JSON.stringify(phrase)}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Ownly terminology validation failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Ownly terminology validation passed for ${files.length} files.`);
