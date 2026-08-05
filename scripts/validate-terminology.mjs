import { readFile } from 'node:fs/promises';

const files = [
  'README.md',
  'README.zh.md',
  'docs/TERMINOLOGY.md',
  'docs/DATA_MODEL.md',
  'docs/WEB_RUNTIME.md',
  'docs/USER_GUIDE.md',
  'docs/RELEASE_CHECKLIST.md',
  'src/app/page.tsx',
  'src/core/terminology.ts',
  'src/core/first-object-copy.ts',
  'src/components/marketing/MarketingHome.tsx',
  'src/components/marketing/HomepagePreview.tsx',
];

const forbiddenPhrases = [
  'Select **Connect Vault**',
  '点击 **Connect Vault',
  'Ownly uses your Obsidian Vault as the database',
  'Ownly 使用你的 Obsidian Vault 作为数据库',
  'Web and PWA require Obsidian',
  'Web/PWA 需要安装 Obsidian',
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
    '每月固定支出',
    '持续支出',
  ],
  'src/components/marketing/HomepagePreview.tsx': [
    'Monthly fixed cost',
    'Recurring cost',
    '每月固定支出',
    '持续支出',
  ],
};

const requiredByFile = {
  'README.md': [
    'Ownly data folder',
    'Create new local data',
    'Open existing data',
    'Fact-ready Agent CLI',
    'Ownly itself is not an AI assistant',
  ],
  'README.zh.md': [
    'Ownly 数据目录',
    '创建新的本地数据',
    '打开已有数据',
    'Fact-ready Agent CLI',
    'Ownly 本身不是 AI 助手',
  ],
  'docs/TERMINOLOGY.md': [
    'Ownly data folder',
    'Obsidian Vault',
    'Archive',
    'Permanently delete',
    'Fact-ready, not AI-powered',
  ],
  'docs/DATA_MODEL.md': [
    'Ownly data folder',
    'Web, PWA, Obsidian, and the Agent CLI',
  ],
  'docs/RELEASE_CHECKLIST.md': [
    'Terminology consistency',
    'npm run validate:terminology',
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
  'src/components/marketing/MarketingHome.tsx': [
    'monthly subscription cost',
    '月均订阅成本',
  ],
  'src/components/marketing/HomepagePreview.tsx': [
    'Monthly subscription cost',
    '订阅成本图谱',
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
