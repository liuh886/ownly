#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import YAML from 'yaml';

const FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DIRECTORIES = {
  object: 'Ownly/Objects',
  snapshot: 'Ownly/Snapshots',
  review: 'Ownly/Reviews',
};

const ARCHIVE_DIRECTORIES = {
  object: 'Ownly/Archive/Objects',
  snapshot: 'Ownly/Archive/Snapshots',
  review: 'Ownly/Archive/Reviews',
};

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function nowId() {
  return `${todayISO().replaceAll('-', '')}_${Date.now()}`;
}

function slugify(input) {
  const slug = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'untitled';
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.replaceAll('-', '_');
    const next = argv[index + 1];

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
    } else if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }

  return { options, positionals };
}

function printHelp() {
  console.log(`Ownly CLI

Usage:
  npm run wyqd -- --vault <vault> object list [--json] [--status idle]
  npm run wyqd -- --vault <vault> object due [--days 30] [--json]
  npm run wyqd -- --vault <vault> object accounts [--json]
  npm run wyqd -- --vault <vault> object add --title <name> --amount <num> [--category <text>] [--purchased-at YYYY-MM-DD] [--ended-at YYYY-MM-DD] [--status using]
  npm run wyqd -- --vault <vault> object add --title <name> --object-type recurring_cost --amount <num> [--billing-cycle monthly] [--billing-day 15] [--payment-account <text>]
  npm run wyqd -- --vault <vault> object get --id <id>
  npm run wyqd -- --vault <vault> object update --id <id> [--title <name>] [--amount <num>] [--status idle]
  npm run wyqd -- --vault <vault> object retire --id <id> [--ended-at YYYY-MM-DD]
  npm run wyqd -- --vault <vault> object cancel --id <id> [--reason <text>]
  npm run wyqd -- --vault <vault> object delete --id <id> --yes
  npm run wyqd -- --vault <vault> object restore --id <id>
  npm run wyqd -- --vault <vault> snapshot add --date YYYY-MM-DD --assets <num> --liabilities <num> [--month-end]
  npm run wyqd -- --vault <vault> snapshot restore --id <id>
  npm run wyqd -- --vault <vault> review add --summary <text> [--food-rank 1] [--scenery-rank 2] [--experience-rank 3]
  npm run wyqd -- --vault <vault> review restore --id <id>

Machine-readable output:
  npm run --silent wyqd -- --vault <vault> object list --json

Environment:
  OWNLY_VAULT can be used instead of --vault.
`);
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function requireOption(options, key) {
  if (options[key] === undefined || options[key] === '') {
    fail(`Missing required option --${key.replaceAll('_', '-')}`);
  }
  return options[key];
}

function numberOption(options, key, fallback = undefined) {
  if (options[key] === undefined || options[key] === '') return fallback;
  const value = Number(options[key]);
  if (!Number.isFinite(value)) fail(`Option --${key.replaceAll('_', '-')} must be a number.`);
  return value;
}

function getVaultRoot(options) {
  const root = options.vault || process.env.OWNLY_VAULT || process.env.WYQD_VAULT;
  if (!root) fail('Missing vault root. Pass --vault <path> or set OWNLY_VAULT.');
  return resolve(String(root));
}

function ensureDirectory(vaultRoot, entityType) {
  const directory = join(vaultRoot, DIRECTORIES[entityType]);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function ensureDirectoryPath(vaultRoot, relativePath) {
  const directory = join(vaultRoot, relativePath);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function parseMarkdown(content, fileName) {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) fail(`Invalid Markdown frontmatter: ${fileName}`);

  return {
    frontmatter: YAML.parse(match[1] || '{}') || {},
    body: content.slice(match[0].length),
  };
}

function serializeMarkdown(frontmatter, body = '') {
  const yaml = YAML.stringify(frontmatter).trimEnd();
  const normalizedBody = body.startsWith('\n') || body.length === 0 ? body : `\n${body}`;
  return `---\n${yaml}\n---\n${normalizedBody}`;
}

function listEntries(vaultRoot, entityType) {
  const directory = ensureDirectory(vaultRoot, entityType);
  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => {
      const filePath = join(directory, fileName);
      const parsed = parseMarkdown(readFileSync(filePath, 'utf8'), fileName);
      return { fileName, filePath, ...parsed };
    })
    .filter((entry) => entry.frontmatter.type === entityType);
}

function listArchivedEntries(vaultRoot, entityType) {
  const directory = ensureDirectoryPath(vaultRoot, ARCHIVE_DIRECTORIES[entityType]);
  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => {
      const filePath = join(directory, fileName);
      const parsed = parseMarkdown(readFileSync(filePath, 'utf8'), fileName);
      return { fileName, filePath, ...parsed };
    })
    .filter((entry) => entry.frontmatter.type === entityType);
}

function findEntry(vaultRoot, entityType, options) {
  const entries = listEntries(vaultRoot, entityType);
  const id = options.id ? String(options.id) : null;
  const title = options.title ? String(options.title) : null;

  if (!id && !title) fail('Pass --id or --title to select an entry.');

  const matches = entries.filter((entry) => {
    if (id) return entry.frontmatter.id === id;
    return entry.frontmatter.title === title;
  });

  if (matches.length === 0) fail(`No ${entityType} matched.`);
  if (matches.length > 1) fail(`Multiple ${entityType} entries matched. Use --id.`);
  return matches[0];
}

function findArchivedEntry(vaultRoot, entityType, options) {
  const entries = listArchivedEntries(vaultRoot, entityType);
  const archiveFile = options.archive_file ? String(options.archive_file) : null;
  const id = options.id ? String(options.id) : null;
  const title = options.title ? String(options.title) : null;

  if (!archiveFile && !id && !title) {
    fail('Pass --archive-file, --id or --title to select an archived entry.');
  }

  const matches = entries.filter((entry) => {
    if (archiveFile) return entry.fileName === archiveFile;
    if (id) return entry.frontmatter.id === id;
    return entry.frontmatter.title === title;
  });

  if (matches.length === 0) fail(`No archived ${entityType} matched.`);
  if (matches.length > 1) fail(`Multiple archived ${entityType} entries matched. Use --archive-file.`);
  return matches[0];
}

function writeEntry(directory, fileName, frontmatter, body) {
  writeFileSync(join(directory, fileName), serializeMarkdown(frontmatter, body), 'utf8');
}

function archiveEntry(vaultRoot, entityType, entry) {
  const archiveDirectory = ensureDirectoryPath(vaultRoot, ARCHIVE_DIRECTORIES[entityType]);
  const timestamp = new Date().toISOString();
  const archiveFileName = `${timestamp.replace(/[:.]/g, '-')}--${entry.fileName}`;
  const archiveFrontmatter = {
    ...entry.frontmatter,
    archived_at: timestamp,
    archived_from: DIRECTORIES[entityType],
    original_file_name: entry.fileName,
  };

  writeEntry(archiveDirectory, archiveFileName, archiveFrontmatter, entry.body);
  rmSync(entry.filePath);

  return archiveFileName;
}

function restoreArchivedEntry(vaultRoot, entityType, entry) {
  const targetDirectory = ensureDirectory(vaultRoot, entityType);
  const archiveDirectory = ensureDirectoryPath(vaultRoot, ARCHIVE_DIRECTORIES[entityType]);
  const frontmatter = { ...entry.frontmatter };
  const originalFileName = frontmatter.original_file_name;
  delete frontmatter.archived_at;
  delete frontmatter.archived_from;
  delete frontmatter.original_file_name;
  const preferredFileName =
    typeof originalFileName === 'string' && originalFileName.endsWith('.md')
      ? originalFileName
      : entry.fileName.replace(/^[^-]+--/, '');
  const fileName = readdirSync(targetDirectory).includes(preferredFileName)
    ? `restored-${new Date().toISOString().replace(/[:.]/g, '-')}--${preferredFileName}`
    : preferredFileName;

  writeEntry(targetDirectory, fileName, { ...frontmatter, updated_at: todayISO() }, entry.body);
  rmSync(join(archiveDirectory, entry.fileName));

  return fileName;
}

function printEntries(entries, json) {
  const rows = entries.map((entry) => ({
    file: entry.fileName,
    id: entry.frontmatter.id,
    title: entry.frontmatter.title,
    type: entry.frontmatter.type,
    object_type: entry.frontmatter.object_type,
    status: entry.frontmatter.status,
    snapshot_at: entry.frontmatter.snapshot_at,
    reviewed_at: entry.frontmatter.reviewed_at,
  }));

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  for (const row of rows) {
    console.log(
      [
        row.id,
        row.title,
        row.object_type || row.type,
        row.status || row.snapshot_at || row.reviewed_at || '',
        row.file,
      ]
        .filter(Boolean)
        .join(' | '),
    );
  }
}

function normalizePhysicalStatus(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const statusMap = {
    observing: 'observing',
    purchased: 'purchased',
    using: 'using',
    idle: 'idle',
    transferred: 'transferred',
    discarded: 'discarded',
    '观察中': 'observing',
    '已购买': 'purchased',
    '服役中': 'using',
    '已退役': 'idle',
    '已卖出': 'transferred',
    '已丢弃': 'discarded',
  };

  return statusMap[normalized] || normalized;
}

function calculateAnnualizedCost(amount, cycle) {
  if (cycle === 'weekly') return amount * 52;
  if (cycle === 'quarterly') return amount * 4;
  if (cycle === 'annual' || cycle === 'custom') return amount;
  return amount * 12;
}

function calculateMonthlyCost(frontmatter) {
  const amount = frontmatter.billing_amount || 0;
  if (frontmatter.billing_cycle === 'weekly') return (amount * 52) / 12;
  if (frontmatter.billing_cycle === 'quarterly') return amount / 3;
  if (frontmatter.billing_cycle === 'annual') return amount / 12;
  if (frontmatter.billing_cycle === 'custom') return (frontmatter.annualized_cost || 0) / 12;
  return amount;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function clampDay(year, monthIndex, day) {
  return Math.min(day, new Date(year, monthIndex + 1, 0).getDate());
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function calculateNextBillingDate(frontmatter, today = new Date()) {
  if (frontmatter.object_type !== 'recurring_cost' || frontmatter.status !== 'active') return null;
  if (frontmatter.billing_cycle === 'custom') return null;

  const start = parseLocalDate(frontmatter.started_at || frontmatter.created_at) || today;
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (frontmatter.billing_cycle === 'weekly') {
    const next = new Date(start);
    while (next < normalizedToday) next.setDate(next.getDate() + 7);
    return formatDate(next);
  }

  const day = frontmatter.billing_day || start.getDate();

  if (frontmatter.billing_cycle === 'annual') {
    const monthIndex = start.getMonth();
    let next = new Date(
      normalizedToday.getFullYear(),
      monthIndex,
      clampDay(normalizedToday.getFullYear(), monthIndex, day),
    );
    if (next < normalizedToday) {
      next = new Date(
        normalizedToday.getFullYear() + 1,
        monthIndex,
        clampDay(normalizedToday.getFullYear() + 1, monthIndex, day),
      );
    }
    return formatDate(next);
  }

  const interval = frontmatter.billing_cycle === 'quarterly' ? 3 : 1;
  let next = new Date(
    start.getFullYear(),
    start.getMonth(),
    clampDay(start.getFullYear(), start.getMonth(), day),
  );
  while (next < normalizedToday) {
    const advanced = addMonths(next, interval);
    next = new Date(
      advanced.getFullYear(),
      advanced.getMonth(),
      clampDay(advanced.getFullYear(), advanced.getMonth(), day),
    );
  }
  return formatDate(next);
}

function daysBetween(fromDate, toDate) {
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
  const end = new Date(`${toDate}T00:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}

function createObject(options) {
  const title = requireOption(options, 'title');
  const amount = numberOption(options, 'amount');
  if (amount === undefined) fail('Missing required option --amount');

  const objectType = options.object_type || 'physical';
  const date = todayISO();
  const base = {
    schema_version: '0.1',
    id: `obj_${nowId()}`,
    type: 'object',
    object_type: objectType,
    title,
    currency: options.currency || 'CNY',
    category: options.category || undefined,
    tags: ['ownly'],
    created_at: date,
    updated_at: date,
  };

  if (objectType === 'physical') {
    return {
      ...base,
      status:
        normalizePhysicalStatus(options.status) ||
        (options.ended_at ? 'idle' : options.purchased_at ? 'using' : 'observing'),
      purchased_at: options.purchased_at || undefined,
      ended_at: options.ended_at || null,
      purchase_price: amount,
      total_acquisition_cost: amount,
      include_in_net_worth: false,
      default_depreciates_to_zero: true,
      amortization_mode: 'none',
    };
  }

  if (objectType === 'recurring_cost') {
    const billingDay = numberOption(options, 'billing_day');
    if (billingDay !== undefined && (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31)) {
      fail('Option --billing-day must be an integer from 1 to 31.');
    }

    return {
      ...base,
      status: options.status || 'active',
      started_at: options.started_at || date,
      billing_cycle: options.billing_cycle || 'monthly',
      billing_amount: amount,
      billing_currency: options.currency || 'CNY',
      billing_day: billingDay,
      payment_account: options.payment_account || null,
      annualized_cost: numberOption(
        options,
        'annualized_cost',
        calculateAnnualizedCost(amount, options.billing_cycle || 'monthly'),
      ),
    };
  }

  return {
    ...base,
    status: options.status || 'planned',
    budget_total: amount,
    actual_total: numberOption(options, 'actual_total'),
  };
}

function objectCommand(vaultRoot, command, options) {
  const directory = ensureDirectory(vaultRoot, 'object');

  if (command === 'due') {
    const days = numberOption(options, 'days', 30);
    const today = new Date();
    const rows = listEntries(vaultRoot, 'object')
      .filter((entry) => entry.frontmatter.object_type === 'recurring_cost')
      .map((entry) => {
        const nextBillingDate = calculateNextBillingDate(entry.frontmatter, today);
        return {
          file: entry.fileName,
          id: entry.frontmatter.id,
          title: entry.frontmatter.title,
          status: entry.frontmatter.status,
          billing_cycle: entry.frontmatter.billing_cycle,
          billing_amount: entry.frontmatter.billing_amount,
          billing_day: entry.frontmatter.billing_day,
          payment_account: entry.frontmatter.payment_account,
          next_billing_date: nextBillingDate,
          days_until: nextBillingDate ? daysBetween(today, nextBillingDate) : null,
        };
      })
      .filter((row) => row.next_billing_date && row.days_until !== null && row.days_until <= days)
      .sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date));

    if (options.json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    for (const row of rows) {
      console.log(
        [
          row.id,
          row.title,
          row.next_billing_date,
          `${row.days_until}d`,
          row.billing_amount,
          row.payment_account,
        ]
          .filter((value) => value !== undefined && value !== null && value !== '')
          .join(' | '),
      );
    }
    return;
  }

  if (command === 'accounts') {
    const groups = new Map();

    for (const entry of listEntries(vaultRoot, 'object')) {
      const item = entry.frontmatter;
      if (item.object_type !== 'recurring_cost' || item.status !== 'active') continue;

      const account = item.payment_account || '未指定支付账户';
      const current = groups.get(account) || {
        account,
        monthly_cost: 0,
        count: 0,
        next_billing_date: null,
        items: [],
      };
      const nextBillingDate = calculateNextBillingDate(item);

      current.monthly_cost += calculateMonthlyCost(item);
      current.count += 1;
      current.next_billing_date =
        current.next_billing_date && nextBillingDate
          ? current.next_billing_date < nextBillingDate
            ? current.next_billing_date
            : nextBillingDate
          : nextBillingDate || current.next_billing_date;
      current.items.push({ id: item.id, title: item.title, billing_amount: item.billing_amount });
      groups.set(account, current);
    }

    const rows = [...groups.values()].sort((a, b) => b.monthly_cost - a.monthly_cost);
    if (options.json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    for (const row of rows) {
      console.log(
        [row.account, `${Math.round(row.monthly_cost)}/month`, `${row.count} items`, row.next_billing_date]
          .filter(Boolean)
          .join(' | '),
      );
    }
    return;
  }

  if (command === 'list') {
    let entries = listEntries(vaultRoot, 'object');
    if (options.status) {
      entries = entries.filter((entry) => entry.frontmatter.status === normalizePhysicalStatus(options.status));
    }
    printEntries(entries, Boolean(options.json));
    return;
  }

  if (command === 'add') {
    const object = createObject(options);
    const fileName = `${object.created_at}--${slugify(object.title)}.md`;
    writeEntry(directory, fileName, object, options.body || '## Notes\n');
    console.log(JSON.stringify({ fileName, id: object.id, title: object.title }, null, 2));
    return;
  }

  if (command === 'get') {
    const entry = findEntry(vaultRoot, 'object', options);
    console.log(JSON.stringify({ fileName: entry.fileName, ...entry.frontmatter }, null, 2));
    return;
  }

  if (command === 'update') {
    const entry = findEntry(vaultRoot, 'object', options);
    const next = { ...entry.frontmatter, updated_at: todayISO() };

    if (options.id && options.title) next.title = options.title;
    if (options.new_title) next.title = options.new_title;
    if (options.title_value) next.title = options.title_value;
    if (options.status) next.status = normalizePhysicalStatus(options.status);
    if (options.category !== undefined) next.category = options.category;
    if (options.purchased_at !== undefined) next.purchased_at = options.purchased_at;
    if (options.ended_at !== undefined) next.ended_at = options.ended_at || null;
    if (options.started_at !== undefined) next.started_at = options.started_at;

    const amount = numberOption(options, 'amount');
    if (amount !== undefined) {
      if (next.object_type === 'physical') {
        next.purchase_price = amount;
        next.total_acquisition_cost = amount;
      } else if (next.object_type === 'recurring_cost') {
        next.billing_amount = amount;
        next.annualized_cost = numberOption(
          options,
          'annualized_cost',
          calculateAnnualizedCost(amount, options.billing_cycle || next.billing_cycle || 'monthly'),
        );
      } else {
        next.budget_total = amount;
      }
    }

    if (next.object_type === 'recurring_cost') {
      const billingDay = numberOption(options, 'billing_day');
      if (billingDay !== undefined) {
        if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) {
          fail('Option --billing-day must be an integer from 1 to 31.');
        }
        next.billing_day = billingDay;
      }
      if (options.payment_account !== undefined) {
        next.payment_account = options.payment_account || null;
      }
      if (options.billing_cycle !== undefined) {
        next.billing_cycle = options.billing_cycle;
        next.annualized_cost = numberOption(
          options,
          'annualized_cost',
          calculateAnnualizedCost(next.billing_amount || 0, next.billing_cycle || 'monthly'),
        );
      }
    }

    writeEntry(directory, entry.fileName, next, entry.body);
    console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, title: next.title }, null, 2));
    return;
  }

  if (command === 'retire') {
    const entry = findEntry(vaultRoot, 'object', options);
    const next = {
      ...entry.frontmatter,
      status: 'idle',
      ended_at: options.ended_at || todayISO(),
      updated_at: todayISO(),
    };
    writeEntry(directory, entry.fileName, next, entry.body);
    console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, status: next.status }, null, 2));
    return;
  }

  if (command === 'cancel') {
    const entry = findEntry(vaultRoot, 'object', options);
    if (entry.frontmatter.object_type !== 'recurring_cost') {
      fail('object cancel only supports recurring_cost objects.');
    }

    const next = {
      ...entry.frontmatter,
      status: 'cancelled',
      cancelled_at: options.cancelled_at || todayISO(),
      cancel_reason: options.reason || '未记录',
      updated_at: todayISO(),
    };
    writeEntry(directory, entry.fileName, next, entry.body);
    console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, status: next.status }, null, 2));
    return;
  }

  if (command === 'delete') {
    const entry = findEntry(vaultRoot, 'object', options);
    if (!options.yes) fail('Refusing to delete without --yes.');
    const archiveFileName = archiveEntry(vaultRoot, 'object', entry);
    console.log(
      JSON.stringify(
        { archived: basename(entry.filePath), archiveFileName, id: entry.frontmatter.id },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'restore') {
    const entry = findArchivedEntry(vaultRoot, 'object', options);
    const fileName = restoreArchivedEntry(vaultRoot, 'object', entry);
    console.log(JSON.stringify({ restored: fileName, id: entry.frontmatter.id }, null, 2));
    return;
  }

  fail(`Unknown object command: ${command}`);
}

function snapshotCommand(vaultRoot, command, options) {
  const directory = ensureDirectory(vaultRoot, 'snapshot');

  if (command === 'list') {
    printEntries(listEntries(vaultRoot, 'snapshot'), Boolean(options.json));
    return;
  }

  if (command === 'get') {
    const entry = findEntry(vaultRoot, 'snapshot', options);
    console.log(JSON.stringify({ fileName: entry.fileName, ...entry.frontmatter }, null, 2));
    return;
  }

  if (command === 'add') {
    const snapshotAt = options.date || todayISO();
    const assets = numberOption(options, 'assets');
    const liabilities = numberOption(options, 'liabilities', 0);
    if (assets === undefined) fail('Missing required option --assets');

    const snapshot = {
      schema_version: '0.1',
      id: `snap_${nowId()}`,
      type: 'snapshot',
      snapshot_type: 'net_worth',
      title: `Account Snapshot ${snapshotAt}`,
      snapshot_at: snapshotAt,
      is_month_end: Boolean(options.month_end),
      currency: options.currency || 'CNY',
      asset_balances: [{ account: 'Total Assets', account_id: 'acct_total_assets', amount: assets }],
      liability_balances: [
        { account: 'Total Liabilities', account_id: 'acct_total_liabilities', amount: liabilities },
      ],
      total_assets: assets,
      total_liabilities: liabilities,
      net_worth: assets - liabilities,
      created_at: todayISO(),
      updated_at: todayISO(),
    };
    const fileName = `snapshot--${snapshotAt}.md`;
    writeEntry(directory, fileName, snapshot, options.body || '## Notes\n');
    console.log(JSON.stringify({ fileName, id: snapshot.id, net_worth: snapshot.net_worth }, null, 2));
    return;
  }

  if (command === 'update') {
    const entry = findEntry(vaultRoot, 'snapshot', options);
    const assets = numberOption(options, 'assets', entry.frontmatter.total_assets);
    const liabilities = numberOption(options, 'liabilities', entry.frontmatter.total_liabilities || 0);
    const next = {
      ...entry.frontmatter,
      snapshot_at: options.date || entry.frontmatter.snapshot_at,
      is_month_end:
        options.month_end === undefined ? entry.frontmatter.is_month_end : Boolean(options.month_end),
      asset_balances: [
        {
          account: 'Total Assets',
          account_id: 'acct_total_assets',
          amount: assets,
          currency: entry.frontmatter.currency || 'CNY',
        },
      ],
      liability_balances: [
        {
          account: 'Total Liabilities',
          account_id: 'acct_total_liabilities',
          amount: liabilities,
          currency: entry.frontmatter.currency || 'CNY',
        },
      ],
      total_assets: assets,
      total_liabilities: liabilities,
      net_worth: assets - liabilities,
      updated_at: todayISO(),
    };
    writeEntry(directory, entry.fileName, next, entry.body);
    console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, net_worth: next.net_worth }, null, 2));
    return;
  }

  if (command === 'delete') {
    const entry = findEntry(vaultRoot, 'snapshot', options);
    if (!options.yes) fail('Refusing to delete without --yes.');
    const archiveFileName = archiveEntry(vaultRoot, 'snapshot', entry);
    console.log(
      JSON.stringify(
        { archived: basename(entry.filePath), archiveFileName, id: entry.frontmatter.id },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'restore') {
    const entry = findArchivedEntry(vaultRoot, 'snapshot', options);
    const fileName = restoreArchivedEntry(vaultRoot, 'snapshot', entry);
    console.log(JSON.stringify({ restored: fileName, id: entry.frontmatter.id }, null, 2));
    return;
  }

  fail(`Unknown snapshot command: ${command}`);
}

function reviewCommand(vaultRoot, command, options) {
  const directory = ensureDirectory(vaultRoot, 'review');

  if (command === 'list') {
    printEntries(listEntries(vaultRoot, 'review'), Boolean(options.json));
    return;
  }

  if (command === 'get') {
    const entry = findEntry(vaultRoot, 'review', options);
    console.log(JSON.stringify({ fileName: entry.fileName, ...entry.frontmatter }, null, 2));
    return;
  }

  if (command === 'add') {
    const summary = requireOption(options, 'summary');
    const reviewedAt = options.date || todayISO();
    const review = {
      schema_version: '0.1',
      id: `review_${nowId()}`,
      type: 'review',
      review_type: options.review_type || 'monthly',
      title: options.title || `Review ${reviewedAt}`,
      reviewed_at: reviewedAt,
      summary,
      food_score: numberOption(options, 'food_score', null),
      scenery_score: numberOption(options, 'scenery_score', null),
      experience_score: numberOption(options, 'experience_score', null),
      period: options.period || reviewedAt.slice(0, 7),
      year: Number(reviewedAt.slice(0, 4)),
      created_at: todayISO(),
      updated_at: todayISO(),
      currency: options.currency || 'CNY',
      tags: ['ownly', 'review'],
    };
    const fileName = `review--${reviewedAt}--${slugify(review.title)}.md`;
    writeEntry(directory, fileName, review, options.body || `## Review\n\n${summary}\n`);
    console.log(JSON.stringify({ fileName, id: review.id, title: review.title }, null, 2));
    return;
  }

  if (command === 'update') {
    const entry = findEntry(vaultRoot, 'review', options);
    const next = {
      ...entry.frontmatter,
      title: options.id && options.title ? options.title : entry.frontmatter.title,
      summary: options.summary || entry.frontmatter.summary,
      food_score: numberOption(options, 'food_score', entry.frontmatter.food_score ?? null),
      scenery_score: numberOption(options, 'scenery_score', entry.frontmatter.scenery_score ?? null),
      experience_score: numberOption(
        options,
        'experience_score',
        entry.frontmatter.experience_score ?? null,
      ),
      reviewed_at: options.date || entry.frontmatter.reviewed_at,
      updated_at: todayISO(),
    };
    const body = options.body || entry.body;
    writeEntry(directory, entry.fileName, next, body);
    console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, title: next.title }, null, 2));
    return;
  }

  if (command === 'delete') {
    const entry = findEntry(vaultRoot, 'review', options);
    if (!options.yes) fail('Refusing to delete without --yes.');
    const archiveFileName = archiveEntry(vaultRoot, 'review', entry);
    console.log(
      JSON.stringify(
        { archived: basename(entry.filePath), archiveFileName, id: entry.frontmatter.id },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'restore') {
    const entry = findArchivedEntry(vaultRoot, 'review', options);
    const fileName = restoreArchivedEntry(vaultRoot, 'review', entry);
    console.log(JSON.stringify({ restored: fileName, id: entry.frontmatter.id }, null, 2));
    return;
  }

  fail(`Unknown review command: ${command}`);
}

function main() {
  const { options, positionals } = parseArgs(process.argv.slice(2));
  if (options.help || positionals.length === 0) {
    printHelp();
    return;
  }

  const [resource, command = 'list'] = positionals;
  const vaultRoot = getVaultRoot(options);

  if (resource === 'object') objectCommand(vaultRoot, command, options);
  else if (resource === 'snapshot') snapshotCommand(vaultRoot, command, options);
  else if (resource === 'review') reviewCommand(vaultRoot, command, options);
  else fail(`Unknown resource: ${resource}`);
}

main();
