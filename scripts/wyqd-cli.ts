#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import YAML from 'yaml';
import { validateEntity } from '../src/domain/schema';

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
  npm run wyqd -- --vault <vault> object get --id <id> [--json]
  npm run wyqd -- --vault <vault> object search --query <text> [--json]
  npm run wyqd -- --vault <vault> object review-needed [--json]
  npm run wyqd -- --vault <vault> object history --id <id> [--json]
  npm run wyqd -- --vault <vault> object due [--days 30] [--json]
  npm run wyqd -- --vault <vault> object accounts [--json]
  npm run wyqd -- --vault <vault> object add --title <name> --amount <num> [--category <text>] [--purchased-at YYYY-MM-DD]
  npm run wyqd -- --vault <vault> object add --title <name> --object-type recurring_cost --amount <num> [--billing-cycle monthly]
  npm run wyqd -- --vault <vault> recurring list --active --json
  npm run wyqd -- --vault <vault> summary --json
  npm run wyqd -- --vault <vault> doctor [--json]

Environment:
  OWNLY_VAULT can be used instead of --vault.
`);
}

let globalOptions = {};

function fail(message, errorCode = 'INVALID_INPUT', exitCode = 1) {
  if (globalOptions.json) {
    console.error(JSON.stringify({ error: message, code: errorCode }));
  } else {
    console.error(message);
  }
  process.exit(exitCode);
}

function requireOption(options, key) {
  if (options[key] === undefined || options[key] === '') {
    fail(`Missing required option --${key.replaceAll('_', '-')}`, 'MISSING_OPTION');
  }
  return options[key];
}

function numberOption(options, key, fallback = undefined) {
  if (options[key] === undefined || options[key] === '') return fallback;
  const value = Number(options[key]);
  if (!Number.isFinite(value)) fail(`Option --${key.replaceAll('_', '-')} must be a number.`, 'INVALID_INPUT');
  return value;
}

function getVaultRoot(options) {
  const root = options.vault || process.env.OWNLY_VAULT || process.env.WYQD_VAULT;
  if (!root) fail('Missing vault root. Pass --vault <path> or set OWNLY_VAULT.', 'VAULT_NOT_FOUND');
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

function writeAgentLog(vaultRoot, action, entityId, beforeSummary, afterSummary) {
  const directory = ensureDirectoryPath(vaultRoot, 'Ownly/Logs');
  const logFile = join(directory, 'agent_operations.log');
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    entity_id: entityId,
    before: beforeSummary,
    after: afterSummary,
  };
  appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
}

function parseMarkdown(content, fileName) {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) fail(`Invalid Markdown frontmatter: ${fileName}`, 'INVALID_INPUT');

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

function readEntry(directory, fileName) {
  const filePath = join(directory, fileName);
  const content = readFileSync(filePath, 'utf-8');
  const parsed = parseMarkdown(content, fileName);
  return { ...parsed, fileName, path: filePath };
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

  if (!id && !title) fail('Pass --id or --title to select an entry.', 'MISSING_OPTION');

  const matches = entries.filter((entry) => {
    if (id) return entry.frontmatter.id === id;
    return entry.frontmatter.title === title;
  });

  if (matches.length === 0) fail(`No ${entityType} matched.`, 'NOT_FOUND');
  if (matches.length > 1) fail(`Multiple ${entityType} entries matched. Use --id.`, 'NOT_FOUND');
  return matches[0];
}

function findArchivedEntry(vaultRoot, entityType, options) {
  const entries = listArchivedEntries(vaultRoot, entityType);
  const archiveFile = options.archive_file ? String(options.archive_file) : null;
  const id = options.id ? String(options.id) : null;
  const title = options.title ? String(options.title) : null;

  if (!archiveFile && !id && !title) {
    fail('Pass --archive-file, --id or --title to select an archived entry.', 'MISSING_OPTION');
  }

  const matches = entries.filter((entry) => {
    if (archiveFile) return entry.fileName === archiveFile;
    if (id) return entry.frontmatter.id === id;
    return entry.frontmatter.title === title;
  });

  if (matches.length === 0) fail(`No archived ${entityType} matched.`, 'NOT_FOUND');
  if (matches.length > 1) fail(`Multiple archived ${entityType} entries matched. Use --archive-file.`, 'NOT_FOUND');
  return matches[0];
}

function writeEntry(directory, fileName, frontmatter, body, validateStrict = true) {
  const result = validateEntity(frontmatter);
  
  if (result.issues.length > 0) {
    for (const issue of result.issues) {
      if (issue.severity === 'error') {
        console.error(`[Validation Error] ${issue.message} (field: ${issue.field})`);
      } else {
        console.warn(`[Validation Warning] ${issue.message} (field: ${issue.field})`);
      }
    }
  }

  if (!result.valid && validateStrict) {
    fail('Entity validation failed. Aborting write.', 'INVALID_INPUT');
  }

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

  writeEntry(archiveDirectory, archiveFileName, archiveFrontmatter, entry.body, false);
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

  writeEntry(targetDirectory, fileName, { ...frontmatter, updated_at: todayISO() }, entry.body, false);
  rmSync(join(archiveDirectory, entry.fileName));

  return fileName;
}

function formatAgentRow(entry, allReviews) {
  const o = entry.frontmatter || entry;
  const fileName = entry.fileName || '';
  const reviews = Array.isArray(allReviews) ? allReviews : [];
  const hasReview = Boolean(o.review_ref) || reviews.some((r) => (r.frontmatter || r).target_id === o.id);

  const needsReview =
    (o.object_type === 'physical' && ['idle', 'transferred', 'discarded'].includes(o.status)) ||
    (o.object_type === 'recurring_cost' && o.status === 'cancelled') ||
    (o.object_type === 'one_time_experience' && o.status === 'completed' && !hasReview);

  const row = {
    id: o.id,
    title: o.title,
    object_type: o.object_type,
    status: o.status,
    category: o.category || undefined,
    fileName,
    created_at: o.created_at,
    updated_at: o.updated_at || undefined,
    review_ref: o.review_ref || null,
    has_review: hasReview,
    needs_review: needsReview,
  };

  if (o.object_type === 'physical') {
    Object.assign(row, {
      purchase_price: o.purchase_price,
      total_acquisition_cost: o.total_acquisition_cost,
      sale_price: o.sale_price,
      purchased_at: o.purchased_at,
      ended_at: o.ended_at,
    });
  } else if (o.object_type === 'recurring_cost') {
    Object.assign(row, {
      billing_amount: o.billing_amount,
      billing_cycle: o.billing_cycle,
      annualized_cost: o.annualized_cost,
      payment_account: o.payment_account,
      started_at: o.started_at,
    });
  } else if (o.object_type === 'one_time_experience') {
    const loc = o.location;
    Object.assign(row, {
      budget_total: o.budget_total,
      actual_total: o.actual_total,
      experience_subtype: o.experience_subtype,
      ended_at: o.ended_at,
      location: loc ? { city: loc.city, country: loc.country, country_code: loc.country_code } : undefined,
    });
  }

  for (const key of Object.keys(row)) {
    if (row[key] === undefined) delete row[key];
  }

  return row;
}

function writeResult(vaultRoot, entry) {
  const reviews = listEntries(vaultRoot, 'review');
  return formatAgentRow(entry, reviews);
}

function printObjectRows(vaultRoot, entries, reviews) {
  const reviewEntries = reviews || listEntries(vaultRoot, 'review');
  console.log(JSON.stringify(entries.map((e) => formatAgentRow(e, reviewEntries)), null, 2));
}

function printEntries(entries, json) {
  if (json) {
    // Generic JSON for snapshots/reviews — not agent object rows
    const rows = entries.map((entry) => ({
      file: entry.fileName,
      ...entry.frontmatter,
    }));
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

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
  if (amount === undefined) fail('Missing required option --amount', 'MISSING_OPTION');

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
      fail('Option --billing-day must be an integer from 1 to 31.', 'INVALID_INPUT');
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
    if (options.json) {
      printObjectRows(vaultRoot, entries);
    } else {
      printEntries(entries, false);
    }
    return;
  }

  if (command === 'search') {
    const query = (options.query || '').toLowerCase();
    if (!query) fail('Missing --query', 'MISSING_OPTION');
    const entries = listEntries(vaultRoot, 'object');
    const matches = entries.filter((e) => {
      const { title, category } = e.frontmatter;
      return (title && title.toLowerCase().includes(query)) ||
        (category && category.toLowerCase().includes(query)) ||
        (e.body && e.body.toLowerCase().includes(query));
    });
    const reviews = listEntries(vaultRoot, 'review');
    console.log(JSON.stringify(matches.map((m) => formatAgentRow(m, reviews)), null, 2));
    return;
  }

  if (command === 'review-needed') {
    const reviews = listEntries(vaultRoot, 'review');
    const entries = listEntries(vaultRoot, 'object').filter((e) => {
      const row = formatAgentRow(e, reviews);
      return row.needs_review;
    });
    console.log(JSON.stringify(entries.map((e) => formatAgentRow(e, reviews)), null, 2));
    return;
  }

  if (command === 'history') {
    requireOption(options, 'id');
    const obj = findEntry(vaultRoot, 'object', options);
    const reviews = listEntries(vaultRoot, 'review').filter(
      (r) => r.frontmatter.target_id === obj.frontmatter.id,
    );
    console.log(JSON.stringify({
      object: formatAgentRow(obj, reviews),
      reviews: reviews.map((r) => ({
        id: r.frontmatter.id,
        title: r.frontmatter.title,
        review_type: r.frontmatter.review_type,
        reviewed_at: r.frontmatter.reviewed_at,
        summary: r.frontmatter.summary,
        food_score: r.frontmatter.food_score,
        scenery_score: r.frontmatter.scenery_score,
        experience_score: r.frontmatter.experience_score,
        fileName: r.fileName,
      })),
    }, null, 2));
    return;
  }

  if (command === 'link') {
    const objectId = requireOption(options, 'object_id');
    const reviewId = requireOption(options, 'review_id');
    const objEntry = findEntry(vaultRoot, 'object', { id: objectId });
    const reviewEntry = findEntry(vaultRoot, 'review', { id: reviewId });

    const nextObj = { ...objEntry.frontmatter, review_ref: reviewId, updated_at: todayISO() };
    const nextReview = { ...reviewEntry.frontmatter, target_id: objectId, target_type: objEntry.frontmatter.object_type, updated_at: todayISO() };

    writeEntry(join(vaultRoot, DIRECTORIES.object), objEntry.fileName, nextObj, objEntry.body);
    writeEntry(join(vaultRoot, DIRECTORIES.review), reviewEntry.fileName, nextReview, reviewEntry.body);
    writeAgentLog(vaultRoot, 'object_link', objectId, objEntry.frontmatter, nextObj);

    const updatedObj = readEntry(join(vaultRoot, DIRECTORIES.object), objEntry.fileName);
    const updatedReview = readEntry(join(vaultRoot, DIRECTORIES.review), reviewEntry.fileName);
    console.log(JSON.stringify({
      object: writeResult(vaultRoot, updatedObj),
      review: {
        id: updatedReview.frontmatter.id, title: updatedReview.frontmatter.title,
        review_type: updatedReview.frontmatter.review_type,
        target_id: updatedReview.frontmatter.target_id, fileName: updatedReview.fileName,
      },
    }, null, 2));
    return;
  }

  if (command === 'batch-review-needed') {
    const reviews = listEntries(vaultRoot, 'review');
    const objects = listEntries(vaultRoot, 'object');
    const needsReview = objects.filter((e) => formatAgentRow(e, reviews).needs_review);
    const updated = [];
    for (const e of needsReview) {
      const next = { ...e.frontmatter, updated_at: todayISO() };
      const existingReview = reviews.find((r) => r.frontmatter.target_id === e.frontmatter.id);
      if (existingReview) next.review_ref = existingReview.frontmatter.id;
      writeEntry(join(vaultRoot, DIRECTORIES.object), e.fileName, next, e.body);
      updated.push(writeResult(vaultRoot, readEntry(join(vaultRoot, DIRECTORIES.object), e.fileName)));
    }
    console.log(JSON.stringify({ processed: needsReview.length, updated }, null, 2));
    return;
  }

  if (command === 'add') {
    const object = createObject(options);
    const fileName = `${object.created_at}--${slugify(object.title)}.md`;
    writeEntry(directory, fileName, object, options.body || '## Notes\n');
    writeAgentLog(vaultRoot, 'object_add', object.id, null, object);
    if (options.json) {
      const entry = readEntry(directory, fileName);
      console.log(JSON.stringify(writeResult(vaultRoot, entry), null, 2));
    } else {
      console.log(JSON.stringify({ fileName, id: object.id, title: object.title }, null, 2));
    }
    return;
  }

  if (command === 'get') {
    const entry = findEntry(vaultRoot, 'object', options);
    if (options.json) {
      const reviews = listEntries(vaultRoot, 'review');
      console.log(JSON.stringify(formatAgentRow(entry, reviews), null, 2));
    } else {
      console.log(JSON.stringify({ fileName: entry.fileName, ...entry.frontmatter }, null, 2));
    }
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
          fail('Option --billing-day must be an integer from 1 to 31.', 'INVALID_INPUT');
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
    writeAgentLog(vaultRoot, 'object_update', next.id, entry.frontmatter, next);
    if (options.json) {
      const updated = readEntry(directory, entry.fileName);
      console.log(JSON.stringify(writeResult(vaultRoot, updated), null, 2));
    } else {
      console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, title: next.title }, null, 2));
    }
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
    writeAgentLog(vaultRoot, 'object_retire', next.id, entry.frontmatter, next);
    if (options.json) {
      const updated = readEntry(directory, entry.fileName);
      console.log(JSON.stringify(writeResult(vaultRoot, updated), null, 2));
    } else {
      console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, status: next.status }, null, 2));
    }
    return;
  }

  if (command === 'cancel') {
    const entry = findEntry(vaultRoot, 'object', options);
    if (entry.frontmatter.object_type !== 'recurring_cost') {
      fail('object cancel only supports recurring_cost objects.', 'INVALID_INPUT');
    }

    const next = {
      ...entry.frontmatter,
      status: 'cancelled',
      cancelled_at: options.cancelled_at || todayISO(),
      cancel_reason: options.reason || '未记录',
      updated_at: todayISO(),
    };
    writeEntry(directory, entry.fileName, next, entry.body);
    writeAgentLog(vaultRoot, 'object_cancel', next.id, entry.frontmatter, next);
    if (options.json) {
      const updated = readEntry(directory, entry.fileName);
      console.log(JSON.stringify(writeResult(vaultRoot, updated), null, 2));
    } else {
      console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, status: next.status }, null, 2));
    }
    return;
  }

  if (command === 'delete') {
    const entry = findEntry(vaultRoot, 'object', options);
    if (!options.yes) fail('Refusing to delete without --yes.', 'MISSING_OPTION');
    const archiveFileName = archiveEntry(vaultRoot, 'object', entry);
    writeAgentLog(vaultRoot, 'object_delete', entry.frontmatter.id, entry.frontmatter, null);
    if (options.json) {
      console.log(JSON.stringify({
        archived: true,
        archiveFileName,
        object: writeResult(vaultRoot, entry),
      }, null, 2));
    } else {
      console.log(JSON.stringify(
        { archived: basename(entry.filePath), archiveFileName, id: entry.frontmatter.id }, null, 2));
    }
    return;
  }

  if (command === 'restore') {
    const entry = findArchivedEntry(vaultRoot, 'object', options);
    const fileName = restoreArchivedEntry(vaultRoot, 'object', entry);
    writeAgentLog(vaultRoot, 'object_restore', entry.frontmatter.id, null, entry.frontmatter);
    if (options.json) {
      const restored = readEntry(join(vaultRoot, DIRECTORIES.object), fileName);
      console.log(JSON.stringify({ restored: true, object: writeResult(vaultRoot, restored) }, null, 2));
    } else {
      console.log(JSON.stringify({ restored: fileName, id: entry.frontmatter.id }, null, 2));
    }
    return;
  }

  fail(`Unknown object command: ${command}`, 'INVALID_INPUT');
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
    if (assets === undefined) fail('Missing required option --assets', 'MISSING_OPTION');

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
    writeAgentLog(vaultRoot, 'snapshot_add', snapshot.id, null, snapshot);
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
    writeAgentLog(vaultRoot, 'snapshot_update', next.id, entry.frontmatter, next);
    console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, net_worth: next.net_worth }, null, 2));
    return;
  }

  if (command === 'delete') {
    const entry = findEntry(vaultRoot, 'snapshot', options);
    if (!options.yes) fail('Refusing to delete without --yes.', 'MISSING_OPTION');
    const archiveFileName = archiveEntry(vaultRoot, 'snapshot', entry);
    writeAgentLog(vaultRoot, 'snapshot_delete', entry.frontmatter.id, entry.frontmatter, null);
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
    writeAgentLog(vaultRoot, 'snapshot_restore', entry.frontmatter.id, null, entry.frontmatter);
    console.log(JSON.stringify({ restored: fileName, id: entry.frontmatter.id }, null, 2));
    return;
  }

  fail(`Unknown snapshot command: ${command}`, 'INVALID_INPUT');
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
    writeAgentLog(vaultRoot, 'review_add', review.id, null, review);
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
    writeAgentLog(vaultRoot, 'review_update', next.id, entry.frontmatter, next);
    console.log(JSON.stringify({ fileName: entry.fileName, id: next.id, title: next.title }, null, 2));
    return;
  }

  if (command === 'delete') {
    const entry = findEntry(vaultRoot, 'review', options);
    if (!options.yes) fail('Refusing to delete without --yes.', 'MISSING_OPTION');
    const archiveFileName = archiveEntry(vaultRoot, 'review', entry);
    writeAgentLog(vaultRoot, 'review_delete', entry.frontmatter.id, entry.frontmatter, null);
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
    writeAgentLog(vaultRoot, 'review_restore', entry.frontmatter.id, null, entry.frontmatter);
    console.log(JSON.stringify({ restored: fileName, id: entry.frontmatter.id }, null, 2));
    return;
  }

  fail(`Unknown review command: ${command}`, 'INVALID_INPUT');
}

function doctorCommand(vaultRoot, options) {
  const objects = listEntries(vaultRoot, 'object');
  const snapshots = listEntries(vaultRoot, 'snapshot');
  const reviews = listEntries(vaultRoot, 'review');

  const results = {
    valid: true,
    entitiesChecked: 0,
    errors: [],
    warnings: [],
  };

  const check = (entry) => {
    results.entitiesChecked++;
    const res = validateEntity(entry.frontmatter);
    if (!res.valid) {
      results.valid = false;
      res.issues.forEach((issue) => {
        if (issue.severity === 'error') {
          results.errors.push({ id: entry.frontmatter.id, ...issue });
        } else {
          results.warnings.push({ id: entry.frontmatter.id, ...issue });
        }
      });
    } else {
      res.issues.forEach((issue) => {
        if (issue.severity === 'warning') {
          results.warnings.push({ id: entry.frontmatter.id, ...issue });
        }
      });
    }
  };

  objects.forEach(check);
  snapshots.forEach(check);
  reviews.forEach(check);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`Doctor checked ${results.entitiesChecked} entities.`);
    console.log(`Errors: ${results.errors.length}, Warnings: ${results.warnings.length}`);
    results.errors.forEach((e) => console.error(`[ERROR] ${e.id}: ${e.message}`));
    results.warnings.forEach((w) => console.warn(`[WARN] ${w.id}: ${w.message}`));
    if (!results.valid) process.exit(1);
  }
}

function summaryCommand(vaultRoot, options) {
  const objects = listEntries(vaultRoot, 'object').map((e) => e.frontmatter);
  const reviews = listEntries(vaultRoot, 'review');

  const totalObjects = objects.length;
  const physicalCount = objects.filter((o) => o.object_type === 'physical').length;
  const activeRecurring = objects.filter((o) => o.object_type === 'recurring_cost' && o.status === 'active').length;
  const travelExperiences = objects.filter((o) => o.object_type === 'one_time_experience' && o.experience_subtype === 'travel_worldview').length;
  const reviewNeeded = objects.filter((o) => {
    const hasReview = Boolean(o.review_ref) || reviews.some((r) => r.frontmatter.target_id === o.id);
    return (o.object_type === 'physical' && ['idle', 'transferred', 'discarded'].includes(o.status)) ||
      (o.object_type === 'recurring_cost' && o.status === 'cancelled') ||
      (o.object_type === 'one_time_experience' && o.status === 'completed' && !hasReview);
  }).length;

  const summary = {
    total_objects: totalObjects,
    physical: physicalCount,
    active_recurring_costs: activeRecurring,
    travel_experiences: travelExperiences,
    needs_review_count: reviewNeeded,
    data_folder: join(vaultRoot, DIRECTORIES.object),
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Vault Summary:`);
    console.log(`Total Objects: ${summary.total_objects}`);
    console.log(`Physical: ${summary.physical}`);
    console.log(`Active Recurring Costs: ${summary.active_recurring_costs}`);
    console.log(`Travel Experiences: ${summary.travel_experiences}`);
    console.log(`Needs Review: ${summary.needs_review_count}`);
    console.log(`Data Folder: ${summary.data_folder}`);
  }
}

function recurringCommand(vaultRoot, command, options) {
  if (command === 'list') {
    const entries = listEntries(vaultRoot, 'object')
      .filter((e) => e.frontmatter.object_type === 'recurring_cost' && e.frontmatter.status === 'active');
    const json = Boolean(options.json);
    if (json) {
      console.log(JSON.stringify(entries.map((e) => formatAgentRow(e, [])), null, 2));
    } else {
      printEntries(entries, false);
    }
    return;
  }
  fail(`Unknown recurring command: ${command}`, 'INVALID_INPUT');
}

function main() {
  const { options, positionals } = parseArgs(process.argv.slice(2));
  if (options.help || positionals.length === 0) {
    printHelp();
    return;
  }

  const [resource, command = 'list'] = positionals;
  globalOptions = options;
  const vaultRoot = getVaultRoot(options);

  if (resource === 'doctor') doctorCommand(vaultRoot, options);
  else if (resource === 'summary') summaryCommand(vaultRoot, options);
  else if (resource === 'object') objectCommand(vaultRoot, command, options);
  else if (resource === 'snapshot') snapshotCommand(vaultRoot, command, options);
  else if (resource === 'review') reviewCommand(vaultRoot, command, options);
  else if (resource === 'recurring') recurringCommand(vaultRoot, command, options);
  else fail(`Unknown resource: ${resource}`, 'INVALID_INPUT');
}

main();
