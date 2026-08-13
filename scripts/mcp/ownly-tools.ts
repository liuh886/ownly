import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateEntity } from '../../src/domain/schema';
import type {
  RecurringCostObject,
  WYQDObjectStatus,
  WYQDObjectType,
} from '../../src/domain/types';
import {
  calculateMonthlyCost,
  calculateNextBillingDate,
  daysBetween,
  formatAgentRow,
  objectNeedsReview,
  stripUndefined,
} from '../cli/domain';
import {
  CLI_DIRECTORIES,
  parseStoredMarkdown,
  readEntry,
} from '../cli/storage';
import {
  CliError,
  type DoctorIssueRow,
  type DoctorResult,
  type ObjectEntry,
  type ReviewEntryFile,
  type StoredEntry,
  type SupportedCliEntity,
  type SupportedCliEntityType,
} from '../cli/types';

export type OwnlyMcpErrorCode =
  | 'DATA_DIR_NOT_CONFIGURED'
  | 'OWNLY_FOLDER_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'DATA_INVALID'
  | 'IO_ERROR';

export class OwnlyMcpError extends Error {
  readonly code: OwnlyMcpErrorCode;

  constructor(message: string, code: OwnlyMcpErrorCode) {
    super(message);
    this.name = 'OwnlyMcpError';
    this.code = code;
  }
}

export interface OwnlyMcpErrorPayload {
  code: OwnlyMcpErrorCode;
  message: string;
}

export interface SearchOwnlyOptions {
  objectType?: WYQDObjectType;
  status?: WYQDObjectStatus;
}

export interface RecurringCostOptions {
  activeOnly?: boolean;
  category?: string;
  account?: string;
}

interface DoctorScannedEntry {
  entityType: SupportedCliEntityType;
  fileName: string;
  frontmatter: SupportedCliEntity;
}

const ENTITY_TYPES: readonly SupportedCliEntityType[] = [
  'object',
  'snapshot',
  'review',
  'object_log',
];

function fsErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function wrapFsError(error: unknown, operation: string): OwnlyMcpError {
  const code = fsErrorCode(error);
  if (code === 'EACCES' || code === 'EPERM') {
    return new OwnlyMcpError(
      `Ownly does not have permission to ${operation}.`,
      'PERMISSION_DENIED',
    );
  }
  return new OwnlyMcpError(`Ownly could not ${operation}.`, 'IO_ERROR');
}

export function toOwnlyMcpErrorPayload(error: unknown): OwnlyMcpErrorPayload {
  if (error instanceof OwnlyMcpError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof CliError) {
    if (error.code === 'NOT_FOUND') {
      return { code: 'NOT_FOUND', message: 'Requested Ownly record was not found.' };
    }
    if (error.code === 'IO_ERROR') {
      return { code: 'IO_ERROR', message: 'Ownly could not read the requested local record.' };
    }
    return { code: 'DATA_INVALID', message: 'Ownly local data failed validation.' };
  }
  return { code: 'IO_ERROR', message: 'Ownly could not complete the local read.' };
}

export function resolveOwnlyDataLocation(input: string | undefined): string {
  const trimmed = input?.trim();
  if (!trimmed) {
    throw new OwnlyMcpError(
      'Configure --data-dir <path> or OWNLY_DATA_DIR before starting Ownly MCP.',
      'DATA_DIR_NOT_CONFIGURED',
    );
  }

  const dataLocation = resolve(trimmed);
  const ownlyRoot = join(dataLocation, 'Ownly');
  const objectsDirectory = join(dataLocation, CLI_DIRECTORIES.object);

  try {
    if (!existsSync(ownlyRoot) || !statSync(ownlyRoot).isDirectory()) {
      throw new OwnlyMcpError(
        'The configured location does not contain an Ownly data folder.',
        'OWNLY_FOLDER_NOT_FOUND',
      );
    }
    if (!existsSync(objectsDirectory) || !statSync(objectsDirectory).isDirectory()) {
      throw new OwnlyMcpError(
        'The configured Ownly data folder is missing its Objects directory.',
        'OWNLY_FOLDER_NOT_FOUND',
      );
    }
    readdirSync(objectsDirectory);
  } catch (error) {
    if (error instanceof OwnlyMcpError) throw error;
    throw wrapFsError(error, 'read the configured Ownly data folder');
  }

  return dataLocation;
}

function entityDirectory(dataLocation: string, entityType: SupportedCliEntityType): string {
  return join(dataLocation, CLI_DIRECTORIES[entityType]);
}

function listEntriesReadOnly<K extends SupportedCliEntityType>(
  dataLocation: string,
  entityType: K,
): StoredEntry[] {
  const directory = entityDirectory(dataLocation, entityType);
  if (!existsSync(directory)) return [];

  let fileNames: string[];
  try {
    fileNames = readdirSync(directory)
      .filter((fileName) => fileName.endsWith('.md'))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    throw wrapFsError(error, `read Ownly ${entityType} records`);
  }

  return fileNames.map((fileName) => {
    try {
      return readEntry(directory, fileName, entityType);
    } catch (error) {
      if (error instanceof CliError) {
        throw new OwnlyMcpError(
          `Ownly could not validate ${entityType} record ${fileName}.`,
          'DATA_INVALID',
        );
      }
      throw wrapFsError(error, `read Ownly ${entityType} record ${fileName}`);
    }
  });
}

function objectEntries(dataLocation: string): ObjectEntry[] {
  return listEntriesReadOnly(dataLocation, 'object') as ObjectEntry[];
}

function reviewEntries(dataLocation: string): ReviewEntryFile[] {
  return listEntriesReadOnly(dataLocation, 'review') as ReviewEntryFile[];
}

function findObject(dataLocation: string, id: string): ObjectEntry {
  const match = objectEntries(dataLocation).find((entry) => entry.frontmatter.id === id);
  if (!match) throw new OwnlyMcpError('Ownly object was not found.', 'NOT_FOUND');
  return match;
}

function compactObject(entry: ObjectEntry, reviews: readonly ReviewEntryFile[]): Record<string, unknown> {
  const object = entry.frontmatter;
  const agentRow = formatAgentRow(entry, reviews);
  const base = {
    id: object.id,
    title: object.title,
    object_type: object.object_type,
    status: object.status,
    category: object.category,
    currency: object.currency,
    created_at: object.created_at,
    updated_at: object.updated_at,
    regret_score: object.regret_score,
    review_ref: object.review_ref ?? null,
    has_review: agentRow.has_review,
    needs_review: agentRow.needs_review,
  };

  if (object.object_type === 'physical') {
    return stripUndefined({
      ...base,
      brand: object.brand,
      model: object.model,
      seeded_at: object.seeded_at,
      observed_at: object.observed_at,
      purchased_at: object.purchased_at,
      first_used_at: object.first_used_at,
      ended_at: object.ended_at,
      purchase_price: object.purchase_price,
      total_acquisition_cost: object.total_acquisition_cost,
      sale_price: object.sale_price,
      realized_experience_cost: object.realized_experience_cost,
      condition: object.condition,
      location: object.location,
    });
  }

  if (object.object_type === 'recurring_cost') {
    return stripUndefined({
      ...base,
      provider: object.provider,
      plan: object.plan,
      started_at: object.started_at,
      paused_at: object.paused_at,
      cancelled_at: object.cancelled_at,
      billing_cycle: object.billing_cycle,
      billing_amount: object.billing_amount,
      billing_currency: object.billing_currency ?? object.currency,
      billing_day: object.billing_day,
      annualized_cost: object.annualized_cost,
      payment_account: object.payment_account,
      is_essential: object.is_essential,
      replacement: object.replacement,
      cancel_reason: object.cancel_reason,
    });
  }

  return stripUndefined({
    ...base,
    experience_subtype: object.experience_subtype,
    planned_at: object.planned_at,
    started_at: object.started_at,
    ended_at: object.ended_at,
    reviewed_at: object.reviewed_at,
    location: object.location,
    locations: object.locations,
    budget_total: object.budget_total,
    actual_total: object.actual_total,
    worldview_tags: object.worldview_tags,
  });
}

export function getOwnlySummary(dataLocation: string): Record<string, unknown> {
  const objects = objectEntries(dataLocation).map((entry) => entry.frontmatter);
  const reviews = reviewEntries(dataLocation).map((entry) => entry.frontmatter);
  const snapshots = listEntriesReadOnly(dataLocation, 'snapshot')
    .map((entry) => entry.frontmatter)
    .filter((entry) => entry.type === 'snapshot');
  const doctor = getOwnlyDoctor(dataLocation);
  const latestSnapshotAt = snapshots
    .map((snapshot) => snapshot.snapshot_at)
    .sort((left, right) => right.localeCompare(left))[0];

  return stripUndefined({
    total_objects: objects.length,
    physical: objects.filter((object) => object.object_type === 'physical').length,
    active_recurring_costs: objects.filter(
      (object) => object.object_type === 'recurring_cost' && object.status === 'active',
    ).length,
    one_time_experiences: objects.filter(
      (object) => object.object_type === 'one_time_experience',
    ).length,
    needs_review_count: objects.filter((object) => objectNeedsReview(object, reviews)).length,
    latest_snapshot_at: latestSnapshotAt,
    health: {
      valid: doctor.valid,
      entities_checked: doctor.entitiesChecked,
      error_count: doctor.errors.length,
      warning_count: doctor.warnings.length,
    },
  });
}

export function searchOwnly(
  dataLocation: string,
  query: string,
  options: SearchOwnlyOptions = {},
): Record<string, unknown>[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    throw new OwnlyMcpError('Search query cannot be empty.', 'INVALID_INPUT');
  }

  const reviews = reviewEntries(dataLocation);
  return objectEntries(dataLocation)
    .filter((entry) => {
      const object = entry.frontmatter;
      if (options.objectType && object.object_type !== options.objectType) return false;
      if (options.status && object.status !== options.status) return false;
      return object.title.toLowerCase().includes(normalizedQuery)
        || object.category?.toLowerCase().includes(normalizedQuery)
        || entry.body.toLowerCase().includes(normalizedQuery);
    })
    .map((entry) => compactObject(entry, reviews));
}

export function getOwnlyObject(dataLocation: string, id: string): Record<string, unknown> {
  const reviews = reviewEntries(dataLocation);
  return compactObject(findObject(dataLocation, id), reviews);
}

export function getOwnlyObjectHistory(dataLocation: string, id: string): Record<string, unknown> {
  const object = findObject(dataLocation, id);
  const reviews = reviewEntries(dataLocation).filter(
    (review) => review.frontmatter.target_id === object.frontmatter.id,
  );
  const logs = listEntriesReadOnly(dataLocation, 'object_log')
    .filter(
      (entry) => entry.frontmatter.type === 'object_log'
        && entry.frontmatter.target_id === object.frontmatter.id,
    )
    .sort((left, right) => {
      if (left.frontmatter.type !== 'object_log' || right.frontmatter.type !== 'object_log') return 0;
      const leftDate = left.frontmatter.occurred_at ?? left.frontmatter.created_at;
      const rightDate = right.frontmatter.occurred_at ?? right.frontmatter.created_at;
      return leftDate.localeCompare(rightDate);
    });

  return {
    object: compactObject(object, reviews),
    reviews: reviews.map((review) => stripUndefined({
      id: review.frontmatter.id,
      title: review.frontmatter.title,
      review_type: review.frontmatter.review_type,
      target_id: review.frontmatter.target_id,
      reviewed_at: review.frontmatter.reviewed_at,
      exited_at: review.frontmatter.exited_at,
      exit_type: review.frontmatter.exit_type,
      sale_price: review.frontmatter.sale_price,
      transfer_fee: review.frontmatter.transfer_fee,
      realized_experience_cost: review.frontmatter.realized_experience_cost,
      food_rank: review.frontmatter.food_rank,
      scenery_rank: review.frontmatter.scenery_rank,
      experience_rank: review.frontmatter.experience_rank,
      food_score: review.frontmatter.food_score,
      scenery_score: review.frontmatter.scenery_score,
      experience_score: review.frontmatter.experience_score,
      regret_score: review.frontmatter.regret_score,
      summary: review.frontmatter.summary,
      period: review.frontmatter.period,
      year: review.frontmatter.year,
    })),
    logs: logs.map((entry) => {
      if (entry.frontmatter.type !== 'object_log') return {};
      return stripUndefined({
        id: entry.frontmatter.id,
        event_type: entry.frontmatter.event_type,
        occurred_at: entry.frontmatter.occurred_at,
        summary: entry.frontmatter.summary,
        lesson: entry.frontmatter.lesson,
        source: entry.frontmatter.source,
        created_at: entry.frontmatter.created_at,
      });
    }),
  };
}

function recurringEntries(dataLocation: string): Array<ObjectEntry & { frontmatter: RecurringCostObject }> {
  return objectEntries(dataLocation).filter(
    (entry): entry is ObjectEntry & { frontmatter: RecurringCostObject } =>
      entry.frontmatter.object_type === 'recurring_cost',
  );
}

export function getOwnlyRecurringCosts(
  dataLocation: string,
  options: RecurringCostOptions = {},
): Record<string, unknown>[] {
  const reviews = reviewEntries(dataLocation);
  return recurringEntries(dataLocation)
    .filter((entry) => !options.activeOnly || entry.frontmatter.status === 'active')
    .filter((entry) => !options.category || entry.frontmatter.category === options.category)
    .filter((entry) => !options.account || entry.frontmatter.payment_account === options.account)
    .map((entry) => compactObject(entry, reviews));
}

export function getOwnlyRecurringDue(
  dataLocation: string,
  days: number,
  now = new Date(),
): Record<string, unknown>[] {
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    throw new OwnlyMcpError('days must be an integer between 0 and 365.', 'INVALID_INPUT');
  }

  return recurringEntries(dataLocation)
    .map((entry) => {
      const recurring = entry.frontmatter;
      const nextBillingDate = calculateNextBillingDate(recurring, now);
      const daysUntil = nextBillingDate ? daysBetween(now, nextBillingDate) : null;
      return stripUndefined({
        id: recurring.id,
        title: recurring.title,
        provider: recurring.provider,
        plan: recurring.plan,
        status: recurring.status,
        billing_amount: recurring.billing_amount,
        billing_currency: recurring.billing_currency ?? recurring.currency,
        billing_cycle: recurring.billing_cycle,
        billing_day: recurring.billing_day,
        annualized_cost: recurring.annualized_cost,
        payment_account: recurring.payment_account,
        next_billing_date: nextBillingDate,
        days_until: daysUntil,
      });
    })
    .filter((row) => {
      const daysUntil = row.days_until;
      return typeof daysUntil === 'number' && daysUntil >= 0 && daysUntil <= days;
    })
    .sort((left, right) =>
      String(left.next_billing_date ?? '').localeCompare(String(right.next_billing_date ?? '')),
    );
}

export function getOwnlyRecurringByAccount(
  dataLocation: string,
  now = new Date(),
): Record<string, unknown>[] {
  const groups = new Map<string, {
    account: string;
    totals: Map<string, { monthly: number; annualized: number }>;
    nextBillingDate: string | null;
    items: Array<Record<string, unknown>>;
  }>();

  for (const entry of recurringEntries(dataLocation)) {
    const recurring = entry.frontmatter;
    if (recurring.status !== 'active') continue;

    const account = recurring.payment_account ?? 'Unspecified';
    const currency = recurring.billing_currency ?? recurring.currency ?? 'UNKNOWN';
    const group = groups.get(account) ?? {
      account,
      totals: new Map(),
      nextBillingDate: null,
      items: [] as Array<Record<string, unknown>>,
    };
    const totals = group.totals.get(currency) ?? { monthly: 0, annualized: 0 };
    const monthlyCost = calculateMonthlyCost(recurring);
    const annualizedCost = recurring.annualized_cost ?? monthlyCost * 12;
    totals.monthly += monthlyCost;
    totals.annualized += annualizedCost;
    group.totals.set(currency, totals);

    const nextBillingDate = calculateNextBillingDate(recurring, now);
    if (nextBillingDate) {
      group.nextBillingDate = group.nextBillingDate && group.nextBillingDate < nextBillingDate
        ? group.nextBillingDate
        : nextBillingDate;
    }

    group.items.push(stripUndefined({
      id: recurring.id,
      title: recurring.title,
      billing_amount: recurring.billing_amount,
      billing_currency: currency,
      billing_cycle: recurring.billing_cycle,
      monthly_cost: monthlyCost,
      next_billing_date: nextBillingDate,
    }));
    groups.set(account, group);
  }

  return [...groups.values()]
    .map((group) => ({
      account: group.account,
      recurring_count: group.items.length,
      monthly_costs: [...group.totals.entries()]
        .map(([currency, totals]) => ({
          currency,
          monthly_cost: totals.monthly,
          annualized_cost: totals.annualized,
        }))
        .sort((left, right) => left.currency.localeCompare(right.currency)),
      next_billing_date: group.nextBillingDate,
      items: group.items,
    }))
    .sort((left, right) => left.account.localeCompare(right.account));
}

export function getOwnlyReviewNeeded(dataLocation: string): Record<string, unknown>[] {
  const reviews = reviewEntries(dataLocation);
  return objectEntries(dataLocation)
    .filter((entry) => formatAgentRow(entry, reviews).needs_review)
    .map((entry) => compactObject(entry, reviews));
}

function doctorIssue(
  message: string,
  severity: DoctorIssueRow['severity'],
  field?: string,
  id?: string,
): DoctorIssueRow {
  return stripUndefined({ message, severity, field, id });
}

function scanDoctorEntries(
  dataLocation: string,
  result: DoctorResult,
): DoctorScannedEntry[] {
  const scanned: DoctorScannedEntry[] = [];

  for (const entityType of ENTITY_TYPES) {
    const directory = entityDirectory(dataLocation, entityType);
    if (!existsSync(directory)) {
      result.errors.push(doctorIssue(
        `Required Ownly directory is missing: ${CLI_DIRECTORIES[entityType]}`,
        'error',
        'directory',
      ));
      continue;
    }

    let fileNames: string[];
    try {
      fileNames = readdirSync(directory)
        .filter((fileName) => fileName.endsWith('.md'))
        .sort((left, right) => left.localeCompare(right));
    } catch (error) {
      const wrapped = wrapFsError(error, `read Ownly ${entityType} records`);
      result.errors.push(doctorIssue(wrapped.message, 'error', 'directory'));
      continue;
    }

    for (const fileName of fileNames) {
      result.entitiesChecked += 1;
      try {
        const content = readFileSync(join(directory, fileName), 'utf8');
        const parsed = parseStoredMarkdown(content, fileName, entityType);
        const validation = validateEntity(parsed.frontmatter);
        for (const issue of validation.issues) {
          const row = doctorIssue(
            `${fileName}: ${issue.message}`,
            issue.severity,
            issue.field,
            parsed.frontmatter.id,
          );
          if (issue.severity === 'error') result.errors.push(row);
          else result.warnings.push(row);
        }
        scanned.push({
          entityType,
          fileName,
          frontmatter: parsed.frontmatter as SupportedCliEntity,
        });
      } catch (error) {
        const payload = toOwnlyMcpErrorPayload(error);
        result.errors.push(doctorIssue(
          `${fileName}: ${payload.message}`,
          'error',
          'record',
        ));
      }
    }
  }

  return scanned;
}

export function getOwnlyDoctor(dataLocation: string): DoctorResult {
  const result: DoctorResult = {
    valid: true,
    entitiesChecked: 0,
    errors: [],
    warnings: [],
  };
  const scanned = scanDoctorEntries(dataLocation, result);
  const seenIds = new Map<string, string>();

  for (const entry of scanned) {
    const previous = seenIds.get(entry.frontmatter.id);
    const current = `${entry.entityType}/${entry.fileName}`;
    if (previous) {
      result.errors.push(doctorIssue(
        `Duplicate entity ID found in ${previous} and ${current}.`,
        'error',
        'id',
        entry.frontmatter.id,
      ));
    } else {
      seenIds.set(entry.frontmatter.id, current);
    }
  }

  const objectIds = new Set(
    scanned
      .filter((entry) => entry.frontmatter.type === 'object')
      .map((entry) => entry.frontmatter.id),
  );
  for (const entry of scanned) {
    if (entry.frontmatter.type !== 'object_log') continue;
    if (!objectIds.has(entry.frontmatter.target_id)) {
      result.warnings.push(doctorIssue(
        `Log target object not found: ${entry.frontmatter.target_id}`,
        'warning',
        'target_id',
        entry.frontmatter.id,
      ));
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}
