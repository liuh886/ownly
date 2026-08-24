import { join } from 'node:path';
import { validateEntity, VALID_OBJECT_LOG_EVENT_TYPES } from '../../src/domain/schema';
import type {
  AccountSnapshot,
  ObjectLogEntry,
  OneTimeExperienceObject,
  OneTimeExperienceStatus,
  PhysicalObject,
  RecurringCostObject,
  RecurringCostStatus,
  ReviewEntry,
  ReviewType,
  WYQDObject,
  WYQDObjectStatus,
  WYQDObjectType,
} from '../../src/domain/types';
import {
  hasFlag,
  integerOption,
  nullableNumberOption,
  numberOption,
  optionalString,
  requiredString,
} from './args';
import {
  calculateAnnualizedCost,
  calculateMonthlyCost,
  calculateNextBillingDate,
  daysBetween,
  formatAgentRow,
  isObjectLogEventType,
  normalizePhysicalStatus,
  nowId,
  objectNeedsReview,
  requireBillingCycle,
  reviewJsonRow,
  slugify,
  stripUndefined,
  todayISO,
} from './domain';
import {
  CLI_DIRECTORIES,
  archiveEntry,
  availableFileName,
  ensureEntityDirectory,
  findArchivedEntry,
  findEntry,
  listEntries,
  readEntry,
  restoreArchivedEntry,
  writeAgentLog,
  writeEntry,
} from './storage';
import {
  CliError,
  type AgentObjectRow,
  type CliIo,
  type CliOptions,
  type DoctorResult,
  type ObjectEntry,
  type StoredEntry,
  type SupportedCliEntity,
} from './types';

export interface CommandContext {
  dataLocation: string;
  options: CliOptions;
  io: CliIo;
  now: Date;
}

interface AccountGroup {
  account: string;
  monthly_cost: number;
  count: number;
  next_billing_date: string | null;
  items: Array<{ id: string; title: string; billing_amount?: number }>;
}

function printJson(io: CliIo, value: unknown): void {
  io.stdout(JSON.stringify(value, null, 2));
}

function printEntries(io: CliIo, entries: readonly StoredEntry[]): void {
  for (const entry of entries) {
    const entity = entry.frontmatter;
    let detail = '';
    if (entity.type === 'object') detail = entity.status;
    else if (entity.type === 'snapshot') detail = entity.snapshot_at;
    else if (entity.type === 'review') detail = entity.reviewed_at ?? '';
    else detail = entity.occurred_at ?? entity.created_at;
    io.stdout(
      [entity.id, entity.title, entity.type === 'object' ? entity.object_type : entity.type, detail, entry.fileName]
        .filter(Boolean)
        .join(' | '),
    );
  }
}

function selectorFromOptions(options: CliOptions): {
  id?: string;
  title?: string;
  archiveFile?: string;
} {
  return {
    id: optionalString(options, 'id'),
    title: optionalString(options, 'title'),
    archiveFile: optionalString(options, 'archive_file'),
  };
}

function writeObjectResult(dataLocation: string, directory: string, fileName: string): AgentObjectRow {
  const entry = readEntry(directory, fileName, 'object');
  const reviews = listEntries(dataLocation, 'review');
  return formatAgentRow(entry, reviews);
}

function validateObjectType(value: string | undefined): WYQDObjectType {
  const objectType = value ?? 'physical';
  if (!['physical', 'recurring_cost', 'one_time_experience'].includes(objectType)) {
    throw new CliError(
      `Invalid object type: ${objectType}. Allowed: physical, recurring_cost, one_time_experience`,
    );
  }
  return objectType as WYQDObjectType;
}

function validateRecurringStatus(value: string | undefined): RecurringCostStatus {
  const status = value ?? 'active';
  if (!['seeded', 'active', 'paused', 'cancelled'].includes(status)) {
    throw new CliError(`Invalid recurring status: ${status}`);
  }
  return status as RecurringCostStatus;
}

function validateExperienceStatus(value: string | undefined): OneTimeExperienceStatus {
  const status = value ?? 'planned';
  if (!['planned', 'in_progress', 'completed', 'reviewed'].includes(status)) {
    throw new CliError(`Invalid experience status: ${status}`);
  }
  return status as OneTimeExperienceStatus;
}

function validateReviewType(value: string | undefined): ReviewType {
  const reviewType = value ?? 'monthly';
  if (!['object_review', 'exit_record', 'monthly', 'annual'].includes(reviewType)) {
    throw new CliError(`Invalid review type: ${reviewType}`);
  }
  return reviewType as ReviewType;
}

function normalizeObjectStatus(object: WYQDObject, value: string): WYQDObjectStatus {
  if (object.object_type === 'physical') {
    return normalizePhysicalStatus(value) ?? object.status;
  }
  if (object.object_type === 'recurring_cost') return validateRecurringStatus(value);
  return validateExperienceStatus(value);
}

function createObject(options: CliOptions, now: Date): WYQDObject {
  const title = requiredString(options, 'title');
  const amount = numberOption(options, 'amount');
  if (amount === undefined) {
    throw new CliError('Missing required option --amount', 'MISSING_OPTION');
  }

  const objectType = validateObjectType(optionalString(options, 'object_type'));
  const date = todayISO(now);
  const id = `obj_${nowId(now)}`;
  const currency = optionalString(options, 'currency') ?? 'CNY';
  const category = optionalString(options, 'category');

  if (objectType === 'physical') {
    const purchasedAt = optionalString(options, 'purchased_at');
    const endedAt = optionalString(options, 'ended_at');
    const requestedStatus = optionalString(options, 'status');
    const status = requestedStatus
      ? normalizePhysicalStatus(requestedStatus) ?? 'observing'
      : endedAt ? 'idle' : purchasedAt ? 'using' : 'observing';
    const physical: PhysicalObject = {
      schema_version: '0.1',
      id,
      type: 'object',
      object_type: 'physical',
      title,
      status,
      currency,
      category,
      tags: ['ownly'],
      created_at: date,
      updated_at: date,
      purchased_at: purchasedAt,
      ended_at: endedAt ?? null,
      purchase_price: amount,
      total_acquisition_cost: amount,
      include_in_net_worth: false,
      default_depreciates_to_zero: true,
      amortization_mode: 'none',
    };
    return physical;
  }

  if (objectType === 'recurring_cost') {
    const billingDay = integerOption(options, 'billing_day', { min: 1, max: 31 });
    const billingCycle = requireBillingCycle(optionalString(options, 'billing_cycle'), 'monthly');
    const recurring: RecurringCostObject = {
      schema_version: '0.1',
      id,
      type: 'object',
      object_type: 'recurring_cost',
      title,
      status: validateRecurringStatus(optionalString(options, 'status')),
      currency,
      category,
      tags: ['ownly'],
      created_at: date,
      updated_at: date,
      started_at: optionalString(options, 'started_at') ?? date,
      billing_cycle: billingCycle,
      billing_amount: amount,
      billing_currency: currency,
      billing_day: billingDay,
      payment_account: optionalString(options, 'payment_account') ?? null,
      annualized_cost: numberOption(
        options,
        'annualized_cost',
        calculateAnnualizedCost(amount, billingCycle),
      ),
    };
    return recurring;
  }

  const experience: OneTimeExperienceObject = {
    schema_version: '0.1',
    id,
    type: 'object',
    object_type: 'one_time_experience',
    title,
    status: validateExperienceStatus(optionalString(options, 'status')),
    currency,
    category,
    tags: ['ownly'],
    created_at: date,
    updated_at: date,
    budget_total: amount,
    actual_total: numberOption(options, 'actual_total'),
    ended_at: optionalString(options, 'ended_at'),
  };
  return experience;
}

function objectDue(context: CommandContext): void {
  const days = numberOption(context.options, 'days', 30) ?? 30;
  const rows = listEntries(context.dataLocation, 'object')
    .filter((entry): entry is ObjectEntry & { frontmatter: RecurringCostObject } =>
      entry.frontmatter.object_type === 'recurring_cost',
    )
    .map((entry) => {
      const nextBillingDate = calculateNextBillingDate(entry.frontmatter, context.now);
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
        days_until: nextBillingDate ? daysBetween(context.now, nextBillingDate) : null,
      };
    })
    .filter((row) => row.next_billing_date && row.days_until !== null && row.days_until <= days)
    .sort((left, right) =>
      (left.next_billing_date ?? '').localeCompare(right.next_billing_date ?? ''),
    );

  if (hasFlag(context.options, 'json')) printJson(context.io, rows);
  else {
    for (const row of rows) {
      context.io.stdout(
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
  }
}

function objectAccounts(context: CommandContext): void {
  const groups = new Map<string, AccountGroup>();

  for (const entry of listEntries(context.dataLocation, 'object')) {
    const item = entry.frontmatter;
    if (item.object_type !== 'recurring_cost' || item.status !== 'active') continue;

    const account = item.payment_account ?? '未指定支付账户';
    const current = groups.get(account) ?? {
      account,
      monthly_cost: 0,
      count: 0,
      next_billing_date: null,
      items: [],
    };
    const nextBillingDate = calculateNextBillingDate(item, context.now);

    current.monthly_cost += calculateMonthlyCost(item);
    current.count += 1;
    if (nextBillingDate) {
      current.next_billing_date = current.next_billing_date
        ? current.next_billing_date < nextBillingDate
          ? current.next_billing_date
          : nextBillingDate
        : nextBillingDate;
    }
    current.items.push({
      id: item.id,
      title: item.title,
      billing_amount: item.billing_amount,
    });
    groups.set(account, current);
  }

  const rows = [...groups.values()].sort((left, right) => right.monthly_cost - left.monthly_cost);
  if (hasFlag(context.options, 'json')) printJson(context.io, rows);
  else {
    for (const row of rows) {
      context.io.stdout(
        [row.account, `${Math.round(row.monthly_cost)}/month`, `${row.count} items`, row.next_billing_date]
          .filter(Boolean)
          .join(' | '),
      );
    }
  }
}

function objectList(context: CommandContext): void {
  let entries = listEntries(context.dataLocation, 'object');
  const status = optionalString(context.options, 'status');
  if (status) entries = entries.filter((entry) => entry.frontmatter.status === normalizeObjectStatus(entry.frontmatter, status));
  if (hasFlag(context.options, 'json')) {
    const reviews = listEntries(context.dataLocation, 'review');
    printJson(context.io, entries.map((entry) => formatAgentRow(entry, reviews)));
  } else printEntries(context.io, entries);
}

function objectSearch(context: CommandContext): void {
  const query = requiredString(context.options, 'query').toLowerCase();
  const reviews = listEntries(context.dataLocation, 'review');
  const matches = listEntries(context.dataLocation, 'object').filter((entry) => {
    const object = entry.frontmatter;
    return object.title.toLowerCase().includes(query)
      || object.category?.toLowerCase().includes(query)
      || entry.body.toLowerCase().includes(query);
  });
  printJson(context.io, matches.map((entry) => formatAgentRow(entry, reviews)));
}

function objectReviewNeeded(context: CommandContext): void {
  const reviews = listEntries(context.dataLocation, 'review');
  const entries = listEntries(context.dataLocation, 'object').filter((entry) =>
    formatAgentRow(entry, reviews).needs_review,
  );
  printJson(context.io, entries.map((entry) => formatAgentRow(entry, reviews)));
}

function objectHistory(context: CommandContext): void {
  const id = requiredString(context.options, 'id');
  const object = findEntry(context.dataLocation, 'object', { id });
  const reviews = listEntries(context.dataLocation, 'review').filter(
    (review) => review.frontmatter.target_id === object.frontmatter.id,
  );
  const logs = listEntries(context.dataLocation, 'object_log')
    .filter((log) => log.frontmatter.target_id === object.frontmatter.id)
    .sort((left, right) =>
      (left.frontmatter.occurred_at ?? left.frontmatter.created_at)
        .localeCompare(right.frontmatter.occurred_at ?? right.frontmatter.created_at),
    );

  printJson(context.io, {
    object: formatAgentRow(object, reviews),
    reviews: reviews.map((review) => stripUndefined({
      id: review.frontmatter.id,
      title: review.frontmatter.title,
      review_type: review.frontmatter.review_type,
      reviewed_at: review.frontmatter.reviewed_at,
      summary: review.frontmatter.summary,
      food_score: review.frontmatter.food_score,
      scenery_score: review.frontmatter.scenery_score,
      experience_score: review.frontmatter.experience_score,
      fileName: review.fileName,
    })),
    logs: logs.map((log) => stripUndefined({
      id: log.frontmatter.id,
      event_type: log.frontmatter.event_type,
      occurred_at: log.frontmatter.occurred_at,
      summary: log.frontmatter.summary,
      lesson: log.frontmatter.lesson,
      source: log.frontmatter.source,
      fileName: log.fileName,
    })),
  });
}

function objectLink(context: CommandContext): void {
  const objectId = requiredString(context.options, 'object_id');
  const reviewId = requiredString(context.options, 'review_id');
  const objectEntry = findEntry(context.dataLocation, 'object', { id: objectId });
  const reviewEntry = findEntry(context.dataLocation, 'review', { id: reviewId });
  const force = hasFlag(context.options, 'force');

  if (reviewEntry.frontmatter.target_id && reviewEntry.frontmatter.target_id !== objectId && !force) {
    throw new CliError(
      `Review ${reviewId} already targets ${reviewEntry.frontmatter.target_id}. Use --force to override.`,
    );
  }
  if (objectEntry.frontmatter.review_ref && objectEntry.frontmatter.review_ref !== reviewId && !force) {
    throw new CliError(
      `Object ${objectId} already has review_ref ${objectEntry.frontmatter.review_ref}. Use --force to override.`,
    );
  }

  const date = todayISO(context.now);
  const nextObject: WYQDObject = {
    ...objectEntry.frontmatter,
    review_ref: reviewId,
    updated_at: date,
  };
  const nextReview: ReviewEntry = {
    ...reviewEntry.frontmatter,
    target_id: objectId,
    target: objectEntry.frontmatter.title,
    target_type: objectEntry.frontmatter.object_type,
    updated_at: date,
  };

  const objectDirectory = ensureEntityDirectory(context.dataLocation, 'object');
  const reviewDirectory = ensureEntityDirectory(context.dataLocation, 'review');
  writeEntry(objectDirectory, objectEntry.fileName, nextObject, objectEntry.body);
  writeEntry(reviewDirectory, reviewEntry.fileName, nextReview, reviewEntry.body);
  writeAgentLog(context.dataLocation, 'object_link', objectId, objectEntry.frontmatter, nextObject);

  printJson(context.io, {
    linked: true,
    object: writeObjectResult(context.dataLocation, objectDirectory, objectEntry.fileName),
    review: reviewJsonRow(readEntry(reviewDirectory, reviewEntry.fileName, 'review')),
  });
}

function objectBatchReviewNeeded(context: CommandContext): void {
  const reviews = listEntries(context.dataLocation, 'review');
  const objects = listEntries(context.dataLocation, 'object');
  const directory = ensureEntityDirectory(context.dataLocation, 'object');
  const items: AgentObjectRow[] = [];

  for (const entry of objects) {
    const row = formatAgentRow(entry, reviews);
    if (!row.needs_review) continue;
    const existingReview = reviews.find(
      (review) => review.frontmatter.target_id === entry.frontmatter.id,
    );
    const next: WYQDObject = {
      ...entry.frontmatter,
      updated_at: todayISO(context.now),
      review_ref: existingReview?.frontmatter.id ?? entry.frontmatter.review_ref,
    };
    writeEntry(directory, entry.fileName, next, entry.body);
    items.push(writeObjectResult(context.dataLocation, directory, entry.fileName));
  }

  printJson(context.io, {
    processed: items.length,
    updated: items,
    skipped: objects.length - items.length,
    items,
  });
}

function objectAdd(context: CommandContext): void {
  const object = createObject(context.options, context.now);
  const directory = ensureEntityDirectory(context.dataLocation, 'object');
  const fileName = availableFileName(
    directory,
    `${object.created_at}--${slugify(object.title)}.md`,
  );
  writeEntry(directory, fileName, object, optionalString(context.options, 'body') ?? '## Notes\n');
  writeAgentLog(context.dataLocation, 'object_add', object.id, null, object);

  if (hasFlag(context.options, 'json')) {
    printJson(context.io, writeObjectResult(context.dataLocation, directory, fileName));
  } else printJson(context.io, { fileName, id: object.id, title: object.title });
}

function objectGet(context: CommandContext): void {
  const entry = findEntry(context.dataLocation, 'object', selectorFromOptions(context.options));
  if (hasFlag(context.options, 'json')) {
    printJson(
      context.io,
      formatAgentRow(entry, listEntries(context.dataLocation, 'review')),
    );
  } else printJson(context.io, { fileName: entry.fileName, ...entry.frontmatter });
}

function objectUpdate(context: CommandContext): void {
  const entry = findEntry(context.dataLocation, 'object', selectorFromOptions(context.options));
  let next: WYQDObject = { ...entry.frontmatter, updated_at: todayISO(context.now) };
  const newTitle = optionalString(context.options, 'new_title')
    ?? optionalString(context.options, 'title_value')
    ?? (optionalString(context.options, 'id') ? optionalString(context.options, 'title') : undefined);
  if (newTitle) next = { ...next, title: newTitle };
  const status = optionalString(context.options, 'status');
  if (status) next = { ...next, status: normalizeObjectStatus(next, status) } as WYQDObject;
  const category = optionalString(context.options, 'category');
  if (category !== undefined) next = { ...next, category };

  const amount = numberOption(context.options, 'amount');
  if (next.object_type === 'physical') {
    next = {
      ...next,
      purchased_at: optionalString(context.options, 'purchased_at') ?? next.purchased_at,
      ended_at: context.options.ended_at !== undefined
        ? optionalString(context.options, 'ended_at') ?? null
        : next.ended_at,
      purchase_price: amount ?? next.purchase_price,
      total_acquisition_cost: amount ?? next.total_acquisition_cost,
    };
  } else if (next.object_type === 'recurring_cost') {
    const requestedCycle = optionalString(context.options, 'billing_cycle');
    const billingCycle = requestedCycle
      ? requireBillingCycle(requestedCycle, next.billing_cycle ?? 'monthly')
      : next.billing_cycle;
    const billingDay = integerOption(context.options, 'billing_day', { min: 1, max: 31 });
    const billingAmount = amount ?? next.billing_amount;
    next = {
      ...next,
      started_at: optionalString(context.options, 'started_at') ?? next.started_at,
      billing_cycle: billingCycle,
      billing_day: billingDay ?? next.billing_day,
      billing_amount: billingAmount,
      payment_account: context.options.payment_account !== undefined
        ? optionalString(context.options, 'payment_account') ?? null
        : next.payment_account,
      annualized_cost: billingAmount !== undefined && billingCycle
        ? numberOption(
            context.options,
            'annualized_cost',
            calculateAnnualizedCost(billingAmount, billingCycle),
          )
        : next.annualized_cost,
    };
  } else {
    next = {
      ...next,
      budget_total: amount ?? next.budget_total,
      actual_total: numberOption(context.options, 'actual_total', next.actual_total),
      ended_at: optionalString(context.options, 'ended_at') ?? next.ended_at,
    };
  }

  const directory = ensureEntityDirectory(context.dataLocation, 'object');
  writeEntry(directory, entry.fileName, next, entry.body);
  writeAgentLog(context.dataLocation, 'object_update', next.id, entry.frontmatter, next);
  if (hasFlag(context.options, 'json')) {
    printJson(context.io, writeObjectResult(context.dataLocation, directory, entry.fileName));
  } else printJson(context.io, { fileName: entry.fileName, id: next.id, title: next.title });
}

function objectRetire(context: CommandContext): void {
  const entry = findEntry(context.dataLocation, 'object', selectorFromOptions(context.options));
  if (entry.frontmatter.object_type !== 'physical') {
    throw new CliError('object retire only supports physical objects.');
  }
  const next: PhysicalObject = {
    ...entry.frontmatter,
    status: 'idle',
    ended_at: optionalString(context.options, 'ended_at') ?? todayISO(context.now),
    updated_at: todayISO(context.now),
  };
  const directory = ensureEntityDirectory(context.dataLocation, 'object');
  writeEntry(directory, entry.fileName, next, entry.body);
  writeAgentLog(context.dataLocation, 'object_retire', next.id, entry.frontmatter, next);
  if (hasFlag(context.options, 'json')) {
    printJson(context.io, writeObjectResult(context.dataLocation, directory, entry.fileName));
  } else printJson(context.io, { fileName: entry.fileName, id: next.id, status: next.status });
}

function objectCancel(context: CommandContext): void {
  const entry = findEntry(context.dataLocation, 'object', selectorFromOptions(context.options));
  if (entry.frontmatter.object_type !== 'recurring_cost') {
    throw new CliError('object cancel only supports recurring_cost objects.');
  }
  const next: RecurringCostObject = {
    ...entry.frontmatter,
    status: 'cancelled',
    cancelled_at: optionalString(context.options, 'cancelled_at') ?? todayISO(context.now),
    cancel_reason: optionalString(context.options, 'reason') ?? '未记录',
    updated_at: todayISO(context.now),
  };
  const directory = ensureEntityDirectory(context.dataLocation, 'object');
  writeEntry(directory, entry.fileName, next, entry.body);
  writeAgentLog(context.dataLocation, 'object_cancel', next.id, entry.frontmatter, next);
  if (hasFlag(context.options, 'json')) {
    printJson(context.io, writeObjectResult(context.dataLocation, directory, entry.fileName));
  } else printJson(context.io, { fileName: entry.fileName, id: next.id, status: next.status });
}

function objectDelete(context: CommandContext): void {
  const entry = findEntry(context.dataLocation, 'object', selectorFromOptions(context.options));
  if (!hasFlag(context.options, 'yes')) {
    throw new CliError('Refusing to delete without --yes.', 'MISSING_OPTION');
  }
  const archiveFileName = archiveEntry(context.dataLocation, 'object', entry, context.now);
  writeAgentLog(context.dataLocation, 'object_delete', entry.frontmatter.id, entry.frontmatter, null);
  if (hasFlag(context.options, 'json')) {
    printJson(context.io, {
      archived: true,
      archiveFileName,
      object: formatAgentRow(entry, listEntries(context.dataLocation, 'review')),
    });
  } else {
    printJson(context.io, {
      archived: entry.fileName,
      archiveFileName,
      id: entry.frontmatter.id,
    });
  }
}

function objectRestore(context: CommandContext): void {
  const entry = findArchivedEntry(
    context.dataLocation,
    'object',
    selectorFromOptions(context.options),
  );
  const fileName = restoreArchivedEntry(context.dataLocation, 'object', entry, context.now);
  writeAgentLog(context.dataLocation, 'object_restore', entry.frontmatter.id, null, entry.frontmatter);
  if (hasFlag(context.options, 'json')) {
    printJson(context.io, {
      restored: true,
      object: writeObjectResult(
        context.dataLocation,
        ensureEntityDirectory(context.dataLocation, 'object'),
        fileName,
      ),
    });
  } else printJson(context.io, { restored: fileName, id: entry.frontmatter.id });
}

function objectLog(context: CommandContext, subCommand: string): void {
  const directory = ensureEntityDirectory(context.dataLocation, 'object_log');
  const targetId = requiredString(context.options, 'id');
  findEntry(context.dataLocation, 'object', { id: targetId });

  if (subCommand === 'add') {
    const eventType = requiredString(context.options, 'type');
    const summary = requiredString(context.options, 'summary');
    if (!isObjectLogEventType(eventType)) {
      throw new CliError(
        `Invalid event_type: ${eventType}. Allowed: ${VALID_OBJECT_LOG_EVENT_TYPES.join(', ')}`,
      );
    }
    const date = todayISO(context.now);
    const logId = `log_${nowId(context.now)}`;
    const log: ObjectLogEntry = {
      schema_version: '0.1',
      id: logId,
      type: 'object_log',
      title: summary.slice(0, 80),
      target_id: targetId,
      event_type: eventType,
      occurred_at: optionalString(context.options, 'occurred_at') ?? date,
      summary,
      lesson: optionalString(context.options, 'lesson'),
      source: 'cli',
      created_at: date,
    };
    const fileName = availableFileName(
      directory,
      `log--${date}--${logId}--${slugify(summary.slice(0, 40))}.md`,
    );
    writeEntry(
      directory,
      fileName,
      log,
      optionalString(context.options, 'body') ?? `## Log\n\n${summary}\n`,
    );
    printJson(context.io, stripUndefined({ ...log, fileName }));
    return;
  }

  if (subCommand === 'list') {
    const rows = listEntries(context.dataLocation, 'object_log')
      .filter((entry) => entry.frontmatter.target_id === targetId)
      .sort((left, right) =>
        (left.frontmatter.occurred_at ?? left.frontmatter.created_at)
          .localeCompare(right.frontmatter.occurred_at ?? right.frontmatter.created_at),
      )
      .map((entry) => stripUndefined({
        id: entry.frontmatter.id,
        type: entry.frontmatter.type,
        target_id: entry.frontmatter.target_id,
        event_type: entry.frontmatter.event_type,
        occurred_at: entry.frontmatter.occurred_at,
        summary: entry.frontmatter.summary,
        lesson: entry.frontmatter.lesson,
        source: entry.frontmatter.source,
        created_at: entry.frontmatter.created_at,
        fileName: entry.fileName,
      }));
    printJson(context.io, rows);
    return;
  }

  throw new CliError(`Unknown log command: ${subCommand}`);
}

export function objectCommand(
  context: CommandContext,
  command: string,
  logSubCommand?: string,
): void {
  if (command === 'due') return objectDue(context);
  if (command === 'accounts') return objectAccounts(context);
  if (command === 'list') return objectList(context);
  if (command === 'search') return objectSearch(context);
  if (command === 'review-needed') return objectReviewNeeded(context);
  if (command === 'history') return objectHistory(context);
  if (command === 'link') return objectLink(context);
  if (command === 'batch-review-needed') return objectBatchReviewNeeded(context);
  if (command === 'add') return objectAdd(context);
  if (command === 'get') return objectGet(context);
  if (command === 'update') return objectUpdate(context);
  if (command === 'retire') return objectRetire(context);
  if (command === 'cancel') return objectCancel(context);
  if (command === 'delete') return objectDelete(context);
  if (command === 'restore') return objectRestore(context);
  if (command === 'log') return objectLog(context, logSubCommand ?? 'list');
  throw new CliError(`Unknown object command: ${command}`);
}

export function snapshotCommand(context: CommandContext, command: string): void {
  const directory = ensureEntityDirectory(context.dataLocation, 'snapshot');
  if (command === 'list') {
    const entries = listEntries(context.dataLocation, 'snapshot');
    if (hasFlag(context.options, 'json')) {
      printJson(context.io, entries.map((entry) => ({ file: entry.fileName, ...entry.frontmatter })));
    } else printEntries(context.io, entries);
    return;
  }
  if (command === 'get') {
    const entry = findEntry(context.dataLocation, 'snapshot', selectorFromOptions(context.options));
    printJson(context.io, { fileName: entry.fileName, ...entry.frontmatter });
    return;
  }
  if (command === 'add') {
    const snapshotAt = optionalString(context.options, 'date') ?? todayISO(context.now);
    const assets = numberOption(context.options, 'assets');
    const liabilities = numberOption(context.options, 'liabilities', 0) ?? 0;
    if (assets === undefined) throw new CliError('Missing required option --assets', 'MISSING_OPTION');
    const snapshot: AccountSnapshot = {
      schema_version: '0.1',
      id: `snap_${nowId(context.now)}`,
      type: 'snapshot',
      snapshot_type: 'net_worth',
      title: `Account Snapshot ${snapshotAt}`,
      snapshot_at: snapshotAt,
      is_month_end: hasFlag(context.options, 'month_end'),
      currency: optionalString(context.options, 'currency') ?? 'CNY',
      asset_balances: [{ account: 'Total Assets', account_id: 'acct_total_assets', amount: assets }],
      liability_balances: [{ account: 'Total Liabilities', account_id: 'acct_total_liabilities', amount: liabilities }],
      total_assets: assets,
      total_liabilities: liabilities,
      net_worth: assets - liabilities,
      created_at: todayISO(context.now),
      updated_at: todayISO(context.now),
    };
    const fileName = availableFileName(directory, `snapshot--${snapshotAt}.md`);
    writeEntry(directory, fileName, snapshot, optionalString(context.options, 'body') ?? '## Notes\n');
    writeAgentLog(context.dataLocation, 'snapshot_add', snapshot.id, null, snapshot);
    printJson(context.io, { fileName, id: snapshot.id, net_worth: snapshot.net_worth });
    return;
  }
  if (command === 'update') {
    const entry = findEntry(context.dataLocation, 'snapshot', selectorFromOptions(context.options));
    const assets = numberOption(context.options, 'assets', entry.frontmatter.total_assets);
    const liabilities = numberOption(
      context.options,
      'liabilities',
      entry.frontmatter.total_liabilities ?? 0,
    ) ?? 0;
    if (assets === undefined) throw new CliError('Snapshot total assets are missing.');
    const next: AccountSnapshot = {
      ...entry.frontmatter,
      snapshot_at: optionalString(context.options, 'date') ?? entry.frontmatter.snapshot_at,
      is_month_end: context.options.month_end === undefined
        ? entry.frontmatter.is_month_end
        : hasFlag(context.options, 'month_end'),
      asset_balances: [{
        account: 'Total Assets',
        account_id: 'acct_total_assets',
        amount: assets,
        currency: entry.frontmatter.currency ?? 'CNY',
      }],
      liability_balances: [{
        account: 'Total Liabilities',
        account_id: 'acct_total_liabilities',
        amount: liabilities,
        currency: entry.frontmatter.currency ?? 'CNY',
      }],
      total_assets: assets,
      total_liabilities: liabilities,
      net_worth: assets - liabilities,
      updated_at: todayISO(context.now),
    };
    writeEntry(directory, entry.fileName, next, entry.body);
    writeAgentLog(context.dataLocation, 'snapshot_update', next.id, entry.frontmatter, next);
    printJson(context.io, { fileName: entry.fileName, id: next.id, net_worth: next.net_worth });
    return;
  }
  if (command === 'delete') {
    const entry = findEntry(context.dataLocation, 'snapshot', selectorFromOptions(context.options));
    if (!hasFlag(context.options, 'yes')) throw new CliError('Refusing to delete without --yes.', 'MISSING_OPTION');
    const archiveFileName = archiveEntry(context.dataLocation, 'snapshot', entry, context.now);
    writeAgentLog(context.dataLocation, 'snapshot_delete', entry.frontmatter.id, entry.frontmatter, null);
    printJson(context.io, { archived: entry.fileName, archiveFileName, id: entry.frontmatter.id });
    return;
  }
  if (command === 'restore') {
    const entry = findArchivedEntry(context.dataLocation, 'snapshot', selectorFromOptions(context.options));
    const fileName = restoreArchivedEntry(context.dataLocation, 'snapshot', entry, context.now);
    writeAgentLog(context.dataLocation, 'snapshot_restore', entry.frontmatter.id, null, entry.frontmatter);
    printJson(context.io, { restored: fileName, id: entry.frontmatter.id });
    return;
  }
  throw new CliError(`Unknown snapshot command: ${command}`);
}

export function reviewCommand(context: CommandContext, command: string): void {
  const directory = ensureEntityDirectory(context.dataLocation, 'review');
  if (command === 'list') {
    const entries = listEntries(context.dataLocation, 'review');
    if (hasFlag(context.options, 'json')) {
      printJson(context.io, entries.map((entry) => ({ file: entry.fileName, ...entry.frontmatter })));
    } else printEntries(context.io, entries);
    return;
  }
  if (command === 'get') {
    const entry = findEntry(context.dataLocation, 'review', selectorFromOptions(context.options));
    printJson(context.io, { fileName: entry.fileName, ...entry.frontmatter });
    return;
  }
  if (command === 'add') {
    const summary = requiredString(context.options, 'summary');
    const reviewedAt = optionalString(context.options, 'date') ?? todayISO(context.now);
    const reviewType = validateReviewType(optionalString(context.options, 'review_type'));
    const targetId = optionalString(context.options, 'target_id');
    if (['object_review', 'exit_record'].includes(reviewType) && !targetId) {
      throw new CliError(`Review type ${reviewType} requires --target-id.`, 'MISSING_OPTION');
    }
    const review: ReviewEntry = {
      schema_version: '0.1',
      id: `review_${nowId(context.now)}`,
      type: 'review',
      review_type: reviewType,
      title: optionalString(context.options, 'title') ?? `Review ${reviewedAt}`,
      target_id: targetId,
      reviewed_at: reviewedAt,
      summary,
      food_score: nullableNumberOption(context.options, 'food_score', null),
      scenery_score: nullableNumberOption(context.options, 'scenery_score', null),
      experience_score: nullableNumberOption(context.options, 'experience_score', null),
      period: optionalString(context.options, 'period') ?? reviewedAt.slice(0, 7),
      year: Number(reviewedAt.slice(0, 4)),
      created_at: todayISO(context.now),
      updated_at: todayISO(context.now),
      currency: optionalString(context.options, 'currency') ?? 'CNY',
      tags: ['ownly', 'review'],
    };
    const fileName = availableFileName(
      directory,
      `review--${reviewedAt}--${slugify(review.title)}.md`,
    );
    writeEntry(
      directory,
      fileName,
      review,
      optionalString(context.options, 'body') ?? `## Review\n\n${summary}\n`,
    );
    writeAgentLog(context.dataLocation, 'review_add', review.id, null, review);
    printJson(context.io, { fileName, id: review.id, title: review.title });
    return;
  }
  if (command === 'update') {
    const entry = findEntry(context.dataLocation, 'review', selectorFromOptions(context.options));
    const next: ReviewEntry = {
      ...entry.frontmatter,
      title: optionalString(context.options, 'id') && optionalString(context.options, 'title')
        ? optionalString(context.options, 'title') ?? entry.frontmatter.title
        : entry.frontmatter.title,
      summary: optionalString(context.options, 'summary') ?? entry.frontmatter.summary,
      food_score: nullableNumberOption(
        context.options,
        'food_score',
        entry.frontmatter.food_score ?? null,
      ),
      scenery_score: nullableNumberOption(
        context.options,
        'scenery_score',
        entry.frontmatter.scenery_score ?? null,
      ),
      experience_score: nullableNumberOption(
        context.options,
        'experience_score',
        entry.frontmatter.experience_score ?? null,
      ),
      reviewed_at: optionalString(context.options, 'date') ?? entry.frontmatter.reviewed_at,
      updated_at: todayISO(context.now),
    };
    writeEntry(
      directory,
      entry.fileName,
      next,
      optionalString(context.options, 'body') ?? entry.body,
    );
    writeAgentLog(context.dataLocation, 'review_update', next.id, entry.frontmatter, next);
    printJson(context.io, { fileName: entry.fileName, id: next.id, title: next.title });
    return;
  }
  if (command === 'delete') {
    const entry = findEntry(context.dataLocation, 'review', selectorFromOptions(context.options));
    if (!hasFlag(context.options, 'yes')) throw new CliError('Refusing to delete without --yes.', 'MISSING_OPTION');
    const archiveFileName = archiveEntry(context.dataLocation, 'review', entry, context.now);
    writeAgentLog(context.dataLocation, 'review_delete', entry.frontmatter.id, entry.frontmatter, null);
    printJson(context.io, { archived: entry.fileName, archiveFileName, id: entry.frontmatter.id });
    return;
  }
  if (command === 'restore') {
    const entry = findArchivedEntry(context.dataLocation, 'review', selectorFromOptions(context.options));
    const fileName = restoreArchivedEntry(context.dataLocation, 'review', entry, context.now);
    writeAgentLog(context.dataLocation, 'review_restore', entry.frontmatter.id, null, entry.frontmatter);
    printJson(context.io, { restored: fileName, id: entry.frontmatter.id });
    return;
  }
  throw new CliError(`Unknown review command: ${command}`);
}

export function recurringCommand(context: CommandContext, command: string): void {
  if (command !== 'list') throw new CliError(`Unknown recurring command: ${command}`);
  const entries = listEntries(context.dataLocation, 'object').filter(
    (entry): entry is ObjectEntry & { frontmatter: RecurringCostObject } =>
      entry.frontmatter.object_type === 'recurring_cost'
      && (!hasFlag(context.options, 'active') || entry.frontmatter.status === 'active'),
  );
  if (hasFlag(context.options, 'json')) {
    printJson(context.io, entries.map((entry) => formatAgentRow(entry, [])));
  } else printEntries(context.io, entries);
}

export function doctorCommand(context: CommandContext): void {
  const allEntries: StoredEntry<SupportedCliEntity>[] = [
    ...listEntries(context.dataLocation, 'object'),
    ...listEntries(context.dataLocation, 'snapshot'),
    ...listEntries(context.dataLocation, 'review'),
    ...listEntries(context.dataLocation, 'object_log'),
  ];
  const result: DoctorResult = {
    valid: true,
    entitiesChecked: 0,
    errors: [],
    warnings: [],
  };
  const seenIds = new Map<string, string>();

  for (const entry of allEntries) {
    result.entitiesChecked += 1;
    const validation = validateEntity(entry.frontmatter);
    for (const issue of validation.issues) {
      const row = { id: entry.frontmatter.id, ...issue };
      if (issue.severity === 'error') result.errors.push(row);
      else result.warnings.push(row);
    }
    const previous = seenIds.get(entry.frontmatter.id);
    if (previous) {
      result.errors.push({
        id: entry.frontmatter.id,
        field: 'id',
        message: `Duplicate entity ID found in ${previous} and ${entry.filePath}`,
        severity: 'error',
      });
    } else seenIds.set(entry.frontmatter.id, entry.filePath);
  }

  const objectIds = new Set(
    listEntries(context.dataLocation, 'object').map((entry) => entry.frontmatter.id),
  );
  for (const log of listEntries(context.dataLocation, 'object_log')) {
    if (!objectIds.has(log.frontmatter.target_id)) {
      result.warnings.push({
        id: log.frontmatter.id,
        field: 'target_id',
        message: `Log target object not found: ${log.frontmatter.target_id}`,
        severity: 'warning',
      });
    }
  }
  result.valid = result.errors.length === 0;

  if (hasFlag(context.options, 'json')) printJson(context.io, result);
  else {
    context.io.stdout(`Doctor checked ${result.entitiesChecked} entities.`);
    context.io.stdout(`Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`);
    for (const error of result.errors) context.io.stderr(`[ERROR] ${error.id ?? 'entity'}: ${error.message}`);
    for (const warning of result.warnings) context.io.warn(`[WARN] ${warning.id ?? 'entity'}: ${warning.message}`);
    if (!result.valid) throw new CliError('Doctor found data errors.', 'INVALID_INPUT');
  }
}

export function summaryCommand(context: CommandContext): void {
  const objects = listEntries(context.dataLocation, 'object').map((entry) => entry.frontmatter);
  const reviews = listEntries(context.dataLocation, 'review').map((entry) => entry.frontmatter);
  const summary = {
    total_objects: objects.length,
    physical: objects.filter((object) => object.object_type === 'physical').length,
    active_recurring_costs: objects.filter(
      (object) => object.object_type === 'recurring_cost' && object.status === 'active',
    ).length,
    travel_experiences: objects.filter(
      (object) => object.object_type === 'one_time_experience'
        && object.experience_subtype === 'travel_worldview',
    ).length,
    needs_review_count: objects.filter((object) => objectNeedsReview(object, reviews)).length,
    data_folder: join(context.dataLocation, CLI_DIRECTORIES.object),
  };

  if (hasFlag(context.options, 'json')) printJson(context.io, summary);
  else {
    context.io.stdout('Ownly local data summary:');
    context.io.stdout(`Total Objects: ${summary.total_objects}`);
    context.io.stdout(`Physical: ${summary.physical}`);
    context.io.stdout(`Active Recurring Costs: ${summary.active_recurring_costs}`);
    context.io.stdout(`Travel Experiences: ${summary.travel_experiences}`);
    context.io.stdout(`Needs Review: ${summary.needs_review_count}`);
    context.io.stdout(`Data Folder: ${summary.data_folder}`);
  }
}
