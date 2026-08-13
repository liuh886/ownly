import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createOwnlyBackup, serializeOwnlyBackup } from '../../src/core/data-portability';
import { validateEntity } from '../../src/domain/schema';
import type {
  AccountSnapshot,
  BillingCycle,
  ObjectLogEntry,
  ObjectLogEventType,
  OneTimeExperienceStatus,
  PhysicalObject,
  RecurringCostObject,
  RecurringCostStatus,
  ReviewEntry,
  ReviewType,
  TravelLocation,
  WYQDObject,
} from '../../src/domain/types';
import {
  calculateAnnualizedCost,
  nowId,
  slugify,
  todayISO,
} from '../cli/domain';
import { NodeOwnlyTextFileAdapter } from '../cli/node-portability-adapter';
import {
  archiveEntry,
  availableFileName,
  ensureEntityDirectory,
  findArchivedEntry,
  findEntry,
  restoreArchivedEntry,
  writeAgentLog,
  writeEntry,
} from '../cli/storage';

export type OwnlyMutationErrorCode =
  | 'WRITE_DISABLED'
  | 'OPERATION_NOT_FOUND'
  | 'OPERATION_EXPIRED'
  | 'CONFLICT'
  | 'INVALID_INPUT';

export class OwnlyMutationError extends Error {
  readonly code: OwnlyMutationErrorCode;

  constructor(message: string, code: OwnlyMutationErrorCode) {
    super(message);
    this.name = 'OwnlyMutationError';
    this.code = code;
  }
}

export interface CreateObjectInput {
  object_type: 'physical' | 'recurring_cost' | 'one_time_experience';
  title: string;
  amount: number;
  currency?: string;
  category?: string;
  status?: string;
  body?: string;
  purchased_at?: string;
  ended_at?: string;
  billing_cycle?: BillingCycle;
  billing_day?: number;
  started_at?: string;
  payment_account?: string;
  annualized_cost?: number;
  actual_total?: number;
  experience_subtype?: string;
  location?: TravelLocation;
}

export interface UpdateObjectInput {
  id: string;
  title?: string;
  status?: string;
  category?: string;
  amount?: number;
  purchased_at?: string;
  ended_at?: string | null;
  billing_cycle?: BillingCycle;
  billing_day?: number;
  started_at?: string;
  payment_account?: string | null;
  annualized_cost?: number;
  actual_total?: number;
}

export interface AddObjectLogInput {
  id: string;
  event_type: ObjectLogEventType;
  summary: string;
  occurred_at?: string;
  lesson?: string;
  source?: string;
  body?: string;
}

export interface CreateReviewInput {
  review_type: ReviewType;
  summary: string;
  title?: string;
  target_id?: string;
  reviewed_at?: string;
  regret_score?: number | null;
  food_score?: number | null;
  scenery_score?: number | null;
  experience_score?: number | null;
  body?: string;
}

export interface CreateSnapshotInput {
  assets: number;
  liabilities?: number;
  date?: string;
  currency?: string;
  is_month_end?: boolean;
  body?: string;
}

export interface PreparedOwnlyOperation {
  operation_id: string;
  action: string;
  expires_at: string;
  preview: Record<string, unknown>;
  write_enabled: boolean;
}

export interface CommittedOwnlyOperation {
  operation_id: string;
  action: string;
  status: 'committed';
  backup_file: string;
  result: Record<string, unknown>;
}

interface PendingOperation extends PreparedOwnlyOperation {
  execute: () => Record<string, unknown>;
}

export interface OwnlyWriteServiceOptions {
  allowWrite?: boolean;
  now?: () => Date;
  operationTtlMs?: number;
}

function fingerprint(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertUnchanged(path: string, expected: string | null): void {
  if (fingerprint(path) !== expected) {
    throw new OwnlyMutationError(
      'The target changed after the preview was prepared. Prepare a new operation.',
      'CONFLICT',
    );
  }
}

function assertValidEntity(entity: object): void {
  const validation = validateEntity(entity);
  if (!validation.valid) {
    const details = validation.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.field ?? 'entity'}: ${issue.message}`)
      .join('; ');
    throw new OwnlyMutationError(`Entity validation failed. ${details}`, 'INVALID_INPUT');
  }
}

function physicalStatus(value: string | undefined, fallback: PhysicalObject['status']): PhysicalObject['status'] {
  const allowed: PhysicalObject['status'][] = [
    'seeded', 'observing', 'purchased', 'using', 'idle', 'transferred', 'discarded',
  ];
  if (!value) return fallback;
  if (!allowed.includes(value as PhysicalObject['status'])) {
    throw new OwnlyMutationError(`Invalid physical status: ${value}`, 'INVALID_INPUT');
  }
  return value as PhysicalObject['status'];
}

function recurringStatus(value: string | undefined, fallback: RecurringCostStatus): RecurringCostStatus {
  const allowed: RecurringCostStatus[] = ['seeded', 'active', 'paused', 'cancelled'];
  if (!value) return fallback;
  if (!allowed.includes(value as RecurringCostStatus)) {
    throw new OwnlyMutationError(`Invalid recurring status: ${value}`, 'INVALID_INPUT');
  }
  return value as RecurringCostStatus;
}

function experienceStatus(
  value: string | undefined,
  fallback: OneTimeExperienceStatus,
): OneTimeExperienceStatus {
  const allowed: OneTimeExperienceStatus[] = ['planned', 'in_progress', 'completed', 'reviewed'];
  if (!value) return fallback;
  if (!allowed.includes(value as OneTimeExperienceStatus)) {
    throw new OwnlyMutationError(`Invalid experience status: ${value}`, 'INVALID_INPUT');
  }
  return value as OneTimeExperienceStatus;
}

export class OwnlyWriteService {
  private readonly pending = new Map<string, PendingOperation>();
  private readonly completed = new Map<string, CommittedOwnlyOperation>();
  private readonly allowWrite: boolean;
  private readonly now: () => Date;
  private readonly operationTtlMs: number;

  constructor(
    private readonly dataLocation: string,
    options: OwnlyWriteServiceOptions = {},
  ) {
    this.allowWrite = options.allowWrite ?? false;
    this.now = options.now ?? (() => new Date());
    this.operationTtlMs = options.operationTtlMs ?? 10 * 60 * 1000;
  }

  private prepare(
    action: string,
    preview: Record<string, unknown>,
    execute: () => Record<string, unknown>,
  ): PreparedOwnlyOperation {
    const operationId = randomUUID();
    const expiresAt = new Date(this.now().getTime() + this.operationTtlMs).toISOString();
    const operation: PendingOperation = {
      operation_id: operationId,
      action,
      expires_at: expiresAt,
      preview,
      write_enabled: this.allowWrite,
      execute,
    };
    this.pending.set(operationId, operation);
    return {
      operation_id: operation.operation_id,
      action: operation.action,
      expires_at: operation.expires_at,
      preview: operation.preview,
      write_enabled: operation.write_enabled,
    };
  }

  private async createSafetyBackup(operationId: string): Promise<string> {
    const createdAt = this.now();
    const backup = await createOwnlyBackup(
      new NodeOwnlyTextFileAdapter(this.dataLocation),
      { runtime: 'mcp', ownly_version: '0.2.0' },
      createdAt,
    );
    const backupDirectory = join(dirname(this.dataLocation), 'Ownly Backups');
    mkdirSync(backupDirectory, { recursive: true });
    const fileName = `ownly-mcp-${createdAt.toISOString().replace(/[:.]/g, '-')}-${operationId}.json`;
    const target = join(backupDirectory, fileName);
    const temporary = `${target}.tmp-${process.pid}`;
    writeFileSync(temporary, serializeOwnlyBackup(backup), 'utf8');
    renameSync(temporary, target);
    return fileName;
  }

  async commit(operationId: string): Promise<CommittedOwnlyOperation> {
    const completed = this.completed.get(operationId);
    if (completed) return completed;
    const operation = this.pending.get(operationId);
    if (!operation) {
      throw new OwnlyMutationError('Prepared operation was not found.', 'OPERATION_NOT_FOUND');
    }
    if (new Date(operation.expires_at).getTime() < this.now().getTime()) {
      this.pending.delete(operationId);
      throw new OwnlyMutationError('Prepared operation has expired.', 'OPERATION_EXPIRED');
    }
    if (!this.allowWrite) {
      throw new OwnlyMutationError(
        'Ownly MCP writes are disabled. Restart with --allow-write or OWNLY_MCP_ALLOW_WRITE=1.',
        'WRITE_DISABLED',
      );
    }

    const backupFile = await this.createSafetyBackup(operationId);
    const result = operation.execute();
    const committed: CommittedOwnlyOperation = {
      operation_id: operationId,
      action: operation.action,
      status: 'committed',
      backup_file: backupFile,
      result,
    };
    this.pending.delete(operationId);
    this.completed.set(operationId, committed);
    return committed;
  }

  discard(operationId: string): Record<string, unknown> {
    if (this.completed.has(operationId)) {
      return { operation_id: operationId, discarded: false, reason: 'already_committed' };
    }
    return { operation_id: operationId, discarded: this.pending.delete(operationId) };
  }

  prepareCreateObject(input: CreateObjectInput): PreparedOwnlyOperation {
    const now = this.now();
    const date = todayISO(now);
    const id = `obj_${nowId(now)}`;
    const currency = input.currency ?? 'CNY';
    let object: WYQDObject;

    if (input.object_type === 'physical') {
      const defaultStatus: PhysicalObject['status'] = input.ended_at
        ? 'idle'
        : input.purchased_at ? 'using' : 'observing';
      object = {
        schema_version: '0.1', id, type: 'object', object_type: 'physical',
        title: input.title, status: physicalStatus(input.status, defaultStatus), currency,
        category: input.category, tags: ['ownly'], created_at: date, updated_at: date,
        purchased_at: input.purchased_at, ended_at: input.ended_at ?? null,
        purchase_price: input.amount, total_acquisition_cost: input.amount,
        include_in_net_worth: false, default_depreciates_to_zero: true,
        amortization_mode: 'none',
      };
    } else if (input.object_type === 'recurring_cost') {
      const cycle = input.billing_cycle ?? 'monthly';
      object = {
        schema_version: '0.1', id, type: 'object', object_type: 'recurring_cost',
        title: input.title, status: recurringStatus(input.status, 'active'), currency,
        category: input.category, tags: ['ownly'], created_at: date, updated_at: date,
        started_at: input.started_at ?? date, billing_cycle: cycle,
        billing_amount: input.amount, billing_currency: currency,
        billing_day: input.billing_day, payment_account: input.payment_account ?? null,
        annualized_cost: input.annualized_cost ?? calculateAnnualizedCost(input.amount, cycle),
      };
    } else {
      object = {
        schema_version: '0.1', id, type: 'object', object_type: 'one_time_experience',
        title: input.title, status: experienceStatus(input.status, 'planned'), currency,
        category: input.category, tags: ['ownly'], created_at: date, updated_at: date,
        budget_total: input.amount, actual_total: input.actual_total,
        ended_at: input.ended_at, experience_subtype: input.experience_subtype,
        location: input.location,
      };
    }
    assertValidEntity(object);
    const directory = ensureEntityDirectory(this.dataLocation, 'object');
    const fileName = availableFileName(directory, `${date}--${slugify(object.title)}.md`);
    const filePath = join(directory, fileName);
    const expected = fingerprint(filePath);
    return this.prepare('create_object', { before: null, after: object }, () => {
      assertUnchanged(filePath, expected);
      writeEntry(directory, fileName, object, input.body ?? '## Notes\n');
      writeAgentLog(this.dataLocation, 'object_add', object.id, null, object);
      return { id: object.id, file_name: fileName, object };
    });
  }

  prepareUpdateObject(input: UpdateObjectInput): PreparedOwnlyOperation {
    const entry = findEntry(this.dataLocation, 'object', { id: input.id });
    const before = entry.frontmatter;
    let next: WYQDObject;
    const common = {
      title: input.title ?? before.title,
      category: input.category ?? before.category,
      updated_at: todayISO(this.now()),
    };
    if (before.object_type === 'physical') {
      next = {
        ...before,
        ...common,
        status: physicalStatus(input.status, before.status),
        purchase_price: input.amount ?? before.purchase_price,
        total_acquisition_cost: input.amount ?? before.total_acquisition_cost,
        purchased_at: input.purchased_at ?? before.purchased_at,
        ended_at: input.ended_at === undefined ? before.ended_at : input.ended_at,
      };
    } else if (before.object_type === 'recurring_cost') {
      const cycle = input.billing_cycle ?? before.billing_cycle;
      const amount = input.amount ?? before.billing_amount;
      next = {
        ...before,
        ...common,
        status: recurringStatus(input.status, before.status),
        billing_cycle: cycle,
        billing_day: input.billing_day ?? before.billing_day,
        billing_amount: amount,
        started_at: input.started_at ?? before.started_at,
        payment_account: input.payment_account === undefined
          ? before.payment_account : input.payment_account,
        annualized_cost: input.annualized_cost
          ?? (amount !== undefined && cycle ? calculateAnnualizedCost(amount, cycle) : before.annualized_cost),
      };
    } else {
      next = {
        ...before,
        ...common,
        status: experienceStatus(input.status, before.status),
        budget_total: input.amount ?? before.budget_total,
        actual_total: input.actual_total ?? before.actual_total,
        ended_at: input.ended_at === undefined ? before.ended_at : input.ended_at ?? undefined,
      };
    }
    assertValidEntity(next);
    const expected = fingerprint(entry.filePath);
    return this.prepare('update_object', { before, after: next }, () => {
      assertUnchanged(entry.filePath, expected);
      writeEntry(dirname(entry.filePath), entry.fileName, next, entry.body);
      writeAgentLog(this.dataLocation, 'object_update', next.id, before, next);
      return { id: next.id, file_name: entry.fileName, object: next };
    });
  }

  prepareRetireObject(id: string, endedAt?: string): PreparedOwnlyOperation {
    const entry = findEntry(this.dataLocation, 'object', { id });
    if (entry.frontmatter.object_type !== 'physical') {
      throw new OwnlyMutationError('Only physical objects can be retired.', 'INVALID_INPUT');
    }
    const next: PhysicalObject = {
      ...entry.frontmatter,
      status: 'idle',
      ended_at: endedAt ?? todayISO(this.now()),
      updated_at: todayISO(this.now()),
    };
    const expected = fingerprint(entry.filePath);
    return this.prepare('retire_object', { before: entry.frontmatter, after: next }, () => {
      assertUnchanged(entry.filePath, expected);
      writeEntry(dirname(entry.filePath), entry.fileName, next, entry.body);
      writeAgentLog(this.dataLocation, 'object_retire', id, entry.frontmatter, next);
      return { id, status: next.status, ended_at: next.ended_at };
    });
  }

  prepareCancelRecurring(id: string, reason?: string, cancelledAt?: string): PreparedOwnlyOperation {
    const entry = findEntry(this.dataLocation, 'object', { id });
    if (entry.frontmatter.object_type !== 'recurring_cost') {
      throw new OwnlyMutationError('Only recurring costs can be cancelled.', 'INVALID_INPUT');
    }
    const next: RecurringCostObject = {
      ...entry.frontmatter,
      status: 'cancelled',
      cancelled_at: cancelledAt ?? todayISO(this.now()),
      cancel_reason: reason ?? 'Not recorded',
      updated_at: todayISO(this.now()),
    };
    const expected = fingerprint(entry.filePath);
    return this.prepare('cancel_recurring_cost', { before: entry.frontmatter, after: next }, () => {
      assertUnchanged(entry.filePath, expected);
      writeEntry(dirname(entry.filePath), entry.fileName, next, entry.body);
      writeAgentLog(this.dataLocation, 'object_cancel', id, entry.frontmatter, next);
      return { id, status: next.status, cancelled_at: next.cancelled_at };
    });
  }

  prepareAddObjectLog(input: AddObjectLogInput): PreparedOwnlyOperation {
    findEntry(this.dataLocation, 'object', { id: input.id });
    const now = this.now();
    const date = todayISO(now);
    const log: ObjectLogEntry = {
      schema_version: '0.1', id: `log_${nowId(now)}`, type: 'object_log',
      title: input.summary.slice(0, 80), target_id: input.id,
      event_type: input.event_type, occurred_at: input.occurred_at ?? date,
      summary: input.summary, lesson: input.lesson, source: input.source ?? 'mcp',
      created_at: date,
    };
    assertValidEntity(log);
    const directory = ensureEntityDirectory(this.dataLocation, 'object_log');
    const fileName = availableFileName(
      directory,
      `log--${date}--${log.id}--${slugify(input.summary.slice(0, 40))}.md`,
    );
    const filePath = join(directory, fileName);
    return this.prepare('add_object_log', { before: null, after: log }, () => {
      assertUnchanged(filePath, null);
      writeEntry(directory, fileName, log, input.body ?? `## Log\n\n${input.summary}\n`);
      writeAgentLog(this.dataLocation, 'object_log_add', log.id, null, log);
      return { id: log.id, file_name: fileName, log };
    });
  }

  prepareCreateReview(input: CreateReviewInput): PreparedOwnlyOperation {
    if (['object_review', 'exit_record'].includes(input.review_type) && !input.target_id) {
      throw new OwnlyMutationError(`${input.review_type} requires target_id.`, 'INVALID_INPUT');
    }
    if (input.target_id) findEntry(this.dataLocation, 'object', { id: input.target_id });
    const now = this.now();
    const date = todayISO(now);
    const reviewedAt = input.reviewed_at ?? date;
    const review: ReviewEntry = {
      schema_version: '0.1', id: `review_${nowId(now)}`, type: 'review',
      review_type: input.review_type, title: input.title ?? `Review ${reviewedAt}`,
      target_id: input.target_id, reviewed_at: reviewedAt, summary: input.summary,
      regret_score: input.regret_score, food_score: input.food_score,
      scenery_score: input.scenery_score, experience_score: input.experience_score,
      period: reviewedAt.slice(0, 7), year: Number(reviewedAt.slice(0, 4)),
      created_at: date, updated_at: date, tags: ['ownly', 'review'],
    };
    assertValidEntity(review);
    const directory = ensureEntityDirectory(this.dataLocation, 'review');
    const fileName = availableFileName(
      directory,
      `review--${reviewedAt}--${slugify(review.title)}.md`,
    );
    const filePath = join(directory, fileName);
    return this.prepare('create_review', { before: null, after: review }, () => {
      assertUnchanged(filePath, null);
      writeEntry(directory, fileName, review, input.body ?? `## Review\n\n${input.summary}\n`);
      writeAgentLog(this.dataLocation, 'review_add', review.id, null, review);
      return { id: review.id, file_name: fileName, review };
    });
  }

  prepareCreateSnapshot(input: CreateSnapshotInput): PreparedOwnlyOperation {
    const now = this.now();
    const date = todayISO(now);
    const snapshotAt = input.date ?? date;
    const liabilities = input.liabilities ?? 0;
    const snapshot: AccountSnapshot = {
      schema_version: '0.1', id: `snap_${nowId(now)}`, type: 'snapshot',
      snapshot_type: 'net_worth', title: `Account Snapshot ${snapshotAt}`,
      snapshot_at: snapshotAt, is_month_end: input.is_month_end ?? false,
      currency: input.currency ?? 'CNY',
      asset_balances: [{ account: 'Total Assets', account_id: 'acct_total_assets', amount: input.assets }],
      liability_balances: [{ account: 'Total Liabilities', account_id: 'acct_total_liabilities', amount: liabilities }],
      total_assets: input.assets, total_liabilities: liabilities,
      net_worth: input.assets - liabilities, created_at: date, updated_at: date,
    };
    assertValidEntity(snapshot);
    const directory = ensureEntityDirectory(this.dataLocation, 'snapshot');
    const fileName = availableFileName(directory, `snapshot--${snapshotAt}.md`);
    const filePath = join(directory, fileName);
    return this.prepare('create_snapshot', { before: null, after: snapshot }, () => {
      assertUnchanged(filePath, null);
      writeEntry(directory, fileName, snapshot, input.body ?? '## Notes\n');
      writeAgentLog(this.dataLocation, 'snapshot_add', snapshot.id, null, snapshot);
      return { id: snapshot.id, file_name: fileName, snapshot };
    });
  }

  prepareArchiveObject(id: string): PreparedOwnlyOperation {
    const entry = findEntry(this.dataLocation, 'object', { id });
    const expected = fingerprint(entry.filePath);
    return this.prepare('archive_object', { before: entry.frontmatter, after: null }, () => {
      assertUnchanged(entry.filePath, expected);
      const archiveFile = archiveEntry(this.dataLocation, 'object', entry, this.now());
      writeAgentLog(this.dataLocation, 'object_delete', id, entry.frontmatter, null);
      return { id, archived: true, archive_file: archiveFile };
    });
  }

  prepareRestoreObject(id: string): PreparedOwnlyOperation {
    const entry = findArchivedEntry(this.dataLocation, 'object', { id });
    const expected = fingerprint(entry.filePath);
    return this.prepare('restore_object', { before: null, after: entry.frontmatter }, () => {
      assertUnchanged(entry.filePath, expected);
      const fileName = restoreArchivedEntry(this.dataLocation, 'object', entry, this.now());
      writeAgentLog(this.dataLocation, 'object_restore', id, null, entry.frontmatter);
      return { id, restored: true, file_name: fileName };
    });
  }
}
