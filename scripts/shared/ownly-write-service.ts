import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
import { serializeMarkdownEntity } from '../../src/data/frontmatter';
import { NodeOwnlyTextFileAdapter } from '../cli/node-portability-adapter';
import {
  PLANNER_DIRECTORIES,
  findPlannerEntry,
  listPlannerLegs,
  listPlannerPlaces,
  listPlannerTrips,
  listPlannerVisits,
} from '../cli/planner-storage';
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
import {
  plannerTripLegFileName,
  type FxSettings,
  type PlannerTrip,
  type PlannerTripLeg,
  type PlannerTripPlace,
  type TripExpenseItem,
} from '../../src/domain/planner';
import { exportTripToICalProMarkdown } from '../../src/domain/ical-pro';
import { createPlannerTripVisit, materializePlannerScheduledPlaces, plannerTripVisitFileName, sortPlannerScheduledPlaces, type PlannerTripVisit } from '../../src/domain/planner-visits';
import { evaluatePlannerScheduleProposal, type PlannerScheduleProposalItem } from '../../src/domain/planner-schedule';

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

  // ── Planner operations ────────────────────────────────────────────────

  private plannerPlaceEntry(placeId: string) {
    const entry = findPlannerEntry(listPlannerPlaces(this.dataLocation), placeId);
    if (!entry) {
      throw new OwnlyMutationError(`Planner place was not found: ${placeId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    return entry;
  }

  private tripBaseFx(): FxSettings {
    return { base: 'CNY', overrides: undefined };
  }

  private plannerVisitEntry(visitId: string) {
    const entry = findPlannerEntry(listPlannerVisits(this.dataLocation), visitId);
    if (!entry) {
      throw new OwnlyMutationError(`Planner visit was not found: ${visitId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    return entry;
  }

  prepareAddVisit(placeId: string, date: string, sortOrder?: number, locked = false): PreparedOwnlyOperation {
    const placeEntry = this.plannerPlaceEntry(placeId);
    const place = placeEntry.frontmatter;
    if (place.state === 'dropped') throw new OwnlyMutationError('Dropped places cannot be scheduled.', 'INVALID_INPUT');
    const visits = listPlannerVisits(this.dataLocation).map((entry) => entry.frontmatter as PlannerTripVisit);
    const order = sortOrder ?? visits
      .filter((visit) => visit.trip_id === place.trip_id && visit.date === date)
      .reduce((max, visit) => Math.max(max, visit.sort_order), -1) + 1;
    const visit = createPlannerTripVisit(place, date, order, { locked }, this.now(), randomUUID());
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.visits);
    const fileName = plannerTripVisitFileName(visit.id);
    const filePath = join(directory, fileName);
    const expected = fingerprint(filePath);
    return this.prepare('planner_add_visit', { place: { id: place.id, title: place.title }, visit }, () => {
      assertUnchanged(filePath, expected);
      mkdirSync(directory, { recursive: true });
      writeFileSync(filePath, serializeMarkdownEntity(visit, ''), 'utf8');
      writeAgentLog(this.dataLocation, 'planner_add_visit', visit.id, null, visit);
      return { visit_id: visit.id, place_id: place.id, date: visit.date, sort_order: visit.sort_order };
    });
  }

  prepareRemoveVisit(visitId: string): PreparedOwnlyOperation {
    const entry = this.plannerVisitEntry(visitId);
    const before = entry.frontmatter as PlannerTripVisit;
    const expected = fingerprint(entry.filePath);
    return this.prepare('planner_remove_visit', { before, after: null }, () => {
      assertUnchanged(entry.filePath, expected);
      unlinkSync(entry.filePath);
      writeAgentLog(this.dataLocation, 'planner_remove_visit', visitId, before, null);
      return { visit_id: visitId, removed: true };
    });
  }

  prepareReorderDay(date: string, visitId: string, delta: -1 | 1): PreparedOwnlyOperation {
    const entries = listPlannerVisits(this.dataLocation)
      .filter((entry) => entry.frontmatter.date === date)
      .sort((left, right) => left.frontmatter.sort_order - right.frontmatter.sort_order);
    const index = entries.findIndex((entry) => entry.frontmatter.id === visitId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= entries.length) {
      throw new OwnlyMutationError('Reorder target is out of bounds for this day.', 'INVALID_INPUT');
    }
    const reordered = [...entries];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    const targets = reordered
      .map((entry, sort_order) => ({
        entry,
        next: { ...entry.frontmatter, sort_order, updated_at: this.now().toISOString() } as PlannerTripVisit,
        expected: fingerprint(entry.filePath),
      }))
      .filter(({ entry, next }) => entry.frontmatter.sort_order !== next.sort_order);
    return this.prepare('planner_reorder_day', {
      date,
      changes: targets.map(({ next }) => ({ visit_id: next.id, place_id: next.place_id, sort_order: next.sort_order })),
    }, () => {
      for (const targetItem of targets) assertUnchanged(targetItem.entry.filePath, targetItem.expected);
      for (const targetItem of targets) writeEntry(dirname(targetItem.entry.filePath), targetItem.entry.fileName, targetItem.next, targetItem.entry.body);
      return { date, updated: targets.length };
    });
  }

  prepareApplyTravelTimeOptimization(
    tripId: string,
    date: string,
    orderedVisitIds: string[],
    legs: PlannerTripLeg[],
    summary: { original_minutes: number; optimized_minutes: number; saved_minutes: number; used_manual_pairs: string[] },
  ): PreparedOwnlyOperation {
    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) =>
      entry.frontmatter.trip_id === tripId && entry.frontmatter.date === date,
    );
    const current = [...visitEntries]
      .sort((left, right) => left.frontmatter.sort_order - right.frontmatter.sort_order)
      .map((entry) => entry.frontmatter as PlannerTripVisit);
    if (orderedVisitIds.length !== current.length || new Set(orderedVisitIds).size !== current.length) {
      throw new OwnlyMutationError('Optimized order must contain every visit exactly once.', 'INVALID_INPUT');
    }
    const currentIds = new Set(current.map((visit) => visit.id));
    if (orderedVisitIds.some((id) => !currentIds.has(id))) {
      throw new OwnlyMutationError('Optimized order contains a visit outside this trip/day.', 'INVALID_INPUT');
    }
    const places = listPlannerPlaces(this.dataLocation)
      .filter((entry) => entry.frontmatter.trip_id === tripId)
      .map((entry) => entry.frontmatter as PlannerTripPlace);
    const projected = sortPlannerScheduledPlaces(materializePlannerScheduledPlaces(places, current));
    projected.forEach((scheduledVisit, index) => {
      if ((index === 0 || scheduledVisit.locked || scheduledVisit.is_anchor) && orderedVisitIds[index] !== scheduledVisit.visit_id) {
        throw new OwnlyMutationError(`${scheduledVisit.title} is fixed and cannot move during travel-time optimization.`, 'INVALID_INPUT');
      }
    });

    const timestamp = this.now().toISOString();
    const orderById = new Map(orderedVisitIds.map((id, index) => [id, index] as const));
    const visitTargets = visitEntries
      .map((entry) => ({
        entry,
        next: { ...entry.frontmatter, sort_order: orderById.get(entry.frontmatter.id)!, updated_at: timestamp } as PlannerTripVisit,
        expected: fingerprint(entry.filePath),
      }))
      .filter(({ entry, next }) => entry.frontmatter.sort_order !== next.sort_order);

    const tripPlaceIds = new Set(places.map((place) => place.id));
    const existingLegs = listPlannerLegs(this.dataLocation);
    const existingById = new Map(existingLegs.map((entry) => [entry.frontmatter.id, entry.frontmatter] as const));
    const legDirectory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.legs);
    const normalizedLegs = legs.map((leg) => {
      if (leg.trip_id !== tripId || !tripPlaceIds.has(leg.from_place_id) || !tripPlaceIds.has(leg.to_place_id) || leg.from_place_id === leg.to_place_id) {
        throw new OwnlyMutationError(`Invalid travel leg endpoints: ${leg.from_place_id} → ${leg.to_place_id}`, 'INVALID_INPUT');
      }
      if (!Number.isInteger(leg.duration_minutes) || leg.duration_minutes <= 0 || leg.duration_minutes > 1440) {
        throw new OwnlyMutationError('Travel duration must be an integer between 1 and 1440 minutes.', 'INVALID_INPUT');
      }
      const existing = existingById.get(leg.id);
      return { ...leg, created_at: existing?.created_at ?? leg.created_at ?? timestamp, updated_at: timestamp };
    });
    const legTargets = normalizedLegs.map((leg) => {
      const filePath = join(legDirectory, plannerTripLegFileName(leg.id));
      return { leg, filePath, expected: fingerprint(filePath) };
    });

    return this.prepare('planner_optimize_day_travel_time', {
      trip_id: tripId,
      date,
      ...summary,
      order: orderedVisitIds,
      refreshed_legs: normalizedLegs.map((leg) => ({ from: leg.from_place_id, to: leg.to_place_id, minutes: leg.duration_minutes })),
    }, () => {
      for (const target of visitTargets) assertUnchanged(target.entry.filePath, target.expected);
      for (const target of legTargets) assertUnchanged(target.filePath, target.expected);
      for (const target of visitTargets) writeFileSync(target.entry.filePath, serializeMarkdownEntity(target.next, target.entry.body), 'utf8');
      if (legTargets.length > 0) mkdirSync(legDirectory, { recursive: true });
      for (const target of legTargets) {
        writeFileSync(target.filePath, serializeMarkdownEntity(target.leg, ''), 'utf8');
        writeAgentLog(this.dataLocation, 'planner_optimize_day_travel_time_leg', target.leg.id, existingById.get(target.leg.id) ?? null, target.leg);
      }
      writeAgentLog(this.dataLocation, 'planner_optimize_day_travel_time', `${tripId}:${date}`, current.map((visit) => visit.id), orderedVisitIds);
      return { trip_id: tripId, date, updated_visits: visitTargets.length, refreshed_legs: legTargets.length, saved_minutes: summary.saved_minutes };
    });
  }

  prepareSetStaySpan(hotelPlaceId: string, dates: string[]): PreparedOwnlyOperation {
    const hotelEntry = findPlannerEntry(listPlannerPlaces(this.dataLocation), hotelPlaceId);
    if (!hotelEntry || hotelEntry.frontmatter.kind !== 'stay' || hotelEntry.frontmatter.state === 'dropped') {
      throw new OwnlyMutationError(`Hotel place was not found: ${hotelPlaceId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    const hotel = hotelEntry.frontmatter;
    const dateSet = new Set(dates);
    const placeById = new Map(
      listPlannerPlaces(this.dataLocation)
        .filter((entry) => entry.frontmatter.trip_id === hotel.trip_id)
        .map((entry) => [entry.frontmatter.id, entry.frontmatter] as const),
    );
    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === hotel.trip_id);
    const stale = visitEntries.filter((entry) => dateSet.has(entry.frontmatter.date) && placeById.get(entry.frontmatter.place_id)?.kind === 'stay');
    const timestamp = this.now();
    const created = dates.map((date) => createPlannerTripVisit(hotel, date, 0, {
      locked: true,
      is_anchor: true,
      anchor_type: 'stay_checkin',
    }, timestamp, randomUUID()));
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.visits);
    const createTargets = created.map((visit) => {
      const fileName = plannerTripVisitFileName(visit.id);
      const filePath = join(directory, fileName);
      return { visit, fileName, filePath, expected: fingerprint(filePath) };
    });
    const staleTargets = stale.map((entry) => ({ entry, expected: fingerprint(entry.filePath) }));

    return this.prepare(
      'planner_set_stay_span',
      {
        hotel: hotel.title,
        dates,
        creates: created.map((visit) => ({ visit_id: visit.id, date: visit.date })),
        retires_visit_ids: stale.map((entry) => entry.frontmatter.id),
      },
      () => {
        for (const target of staleTargets) assertUnchanged(target.entry.filePath, target.expected);
        for (const target of createTargets) assertUnchanged(target.filePath, target.expected);
        for (const target of staleTargets) unlinkSync(target.entry.filePath);
        mkdirSync(directory, { recursive: true });
        for (const target of createTargets) writeFileSync(target.filePath, serializeMarkdownEntity(target.visit, ''), 'utf8');
        return { hotel_id: hotelPlaceId, nights: dates.length, retired_visits: stale.length, created_visits: created.length };
      },
    );
  }

  prepareDropPlannerPlace(placeId: string): PreparedOwnlyOperation {
    const entry = this.plannerPlaceEntry(placeId);
    const before = entry.frontmatter;
    const next = { ...before, state: 'dropped' as const };
    const expected = fingerprint(entry.filePath);
    return this.prepare('planner_drop_place', { before, after: next }, () => {
      assertUnchanged(entry.filePath, expected);
      writeEntry(dirname(entry.filePath), entry.fileName, next, entry.body);
      writeAgentLog(this.dataLocation, 'planner_drop_place', placeId, before, next);
      return { id: placeId, state: next.state };
    });
  }

  prepareAddExpense(input: TripExpenseItem): PreparedOwnlyOperation {
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.expenses);
    const fileName = `expense--${input.id}.md`;
    return this.prepare('planner_add_expense', { expense: input }, () => {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, fileName), serializeMarkdownEntity({ schema_version: '0.1', type: 'trip_expense', ...input }, ''), 'utf8');
      writeAgentLog(this.dataLocation, 'planner_add_expense', input.id, null, input);
      return { id: input.id, amount: input.amount, currency: input.currency };
    });
  }

  prepareSetFxRates(tripId: string, rates: Record<string, number>): PreparedOwnlyOperation {
    const tripEntry = findPlannerEntry(listPlannerTrips(this.dataLocation), tripId);
    if (!tripEntry) {
      throw new OwnlyMutationError(`Trip was not found: ${tripId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    const before = tripEntry.frontmatter;
    const next = { ...before, fx_rates: rates, updated_at: todayISO(this.now()) };
    const expected = fingerprint(tripEntry.filePath);
    return this.prepare('planner_set_fx_rates', { before_rates: before.fx_rates ?? {}, rates }, () => {
      assertUnchanged(tripEntry.filePath, expected);
      writeEntry(dirname(tripEntry.filePath), tripEntry.fileName, next, tripEntry.body);
      writeAgentLog(this.dataLocation, 'planner_set_fx_rates', tripId, before.fx_rates ?? {}, rates);
      return { trip_id: tripId, fx_rates: rates };
    });
  }

  preparePlannerUpsertTravelLegs(
    inputLegs: PlannerTripLeg[],
    action = 'planner_set_travel_legs',
  ): PreparedOwnlyOperation {
    if (inputLegs.length === 0) throw new OwnlyMutationError('At least one travel leg is required.', 'INVALID_INPUT');
    const tripId = inputLegs[0].trip_id;
    if (inputLegs.some((leg) => leg.trip_id !== tripId)) {
      throw new OwnlyMutationError('All travel legs in one operation must belong to the same trip.', 'INVALID_INPUT');
    }
    const tripEntry = findPlannerEntry(listPlannerTrips(this.dataLocation), tripId);
    if (!tripEntry) throw new OwnlyMutationError(`Trip was not found: ${tripId}`, 'INVALID_INPUT');
    const placeIds = new Set(
      listPlannerPlaces(this.dataLocation)
        .map((entry) => entry.frontmatter)
        .filter((place) => place.trip_id === tripId)
        .map((place) => place.id),
    );
    const existingById = new Map(
      listPlannerLegs(this.dataLocation)
        .map((entry) => [entry.frontmatter.id, entry.frontmatter] as const),
    );
    const now = this.now().toISOString();
    const normalized = inputLegs.map((leg) => {
      if (!placeIds.has(leg.from_place_id) || !placeIds.has(leg.to_place_id) || leg.from_place_id === leg.to_place_id) {
        throw new OwnlyMutationError(`Invalid travel leg endpoints: ${leg.from_place_id} → ${leg.to_place_id}`, 'INVALID_INPUT');
      }
      if (!Number.isInteger(leg.duration_minutes) || leg.duration_minutes <= 0 || leg.duration_minutes > 1440) {
        throw new OwnlyMutationError('Travel duration must be an integer between 1 and 1440 minutes.', 'INVALID_INPUT');
      }
      if (leg.distance_meters !== undefined && (!Number.isInteger(leg.distance_meters) || leg.distance_meters < 0)) {
        throw new OwnlyMutationError('Travel distance must be a non-negative integer number of meters.', 'INVALID_INPUT');
      }
      const existing = existingById.get(leg.id);
      return {
        ...leg,
        created_at: existing?.created_at ?? leg.created_at ?? now,
        updated_at: now,
      };
    });
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.legs);
    const targets = normalized.map((leg) => {
      const filePath = join(directory, plannerTripLegFileName(leg.id));
      return { leg, filePath, expected: fingerprint(filePath) };
    });
    return this.prepare(action, { trip_id: tripId, legs: normalized }, () => {
      mkdirSync(directory, { recursive: true });
      for (const target of targets) {
        assertUnchanged(target.filePath, target.expected);
        writeFileSync(target.filePath, serializeMarkdownEntity(target.leg, ''), 'utf8');
        writeAgentLog(this.dataLocation, action, target.leg.id, existingById.get(target.leg.id) ?? null, target.leg);
      }
      return { trip_id: tripId, written: normalized.length, legs: normalized };
    });
  }

  preparePlannerApplyScheduleProposal(
    tripId: string,
    proposal: { visits: PlannerScheduleProposalItem[] },
  ): PreparedOwnlyOperation {
    const tripEntry = findPlannerEntry(listPlannerTrips(this.dataLocation), tripId);
    if (!tripEntry) throw new OwnlyMutationError(`Trip was not found: ${tripId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    const trip = tripEntry.frontmatter as unknown as PlannerTrip;
    const placeEntries = listPlannerPlaces(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === tripId);
    const places = placeEntries.map((entry) => entry.frontmatter as PlannerTripPlace);
    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === tripId);
    const currentVisits = visitEntries.map((entry) => entry.frontmatter as PlannerTripVisit);
    const normalized = proposal.visits.map((item) => ({ ...item, visit_id: item.visit_id?.trim() || `visit:${randomUUID()}` }));
    const evaluation = evaluatePlannerScheduleProposal(trip, places, currentVisits, normalized);
    const errors = evaluation.issues.filter((issue) => issue.severity === 'error');
    if (errors.length > 0) {
      throw new OwnlyMutationError(`Schedule proposal is invalid: ${errors.map((issue) => issue.message).join(' | ')}`, 'INVALID_INPUT' as OwnlyMutationErrorCode);
    }
    const nextById = new Map(evaluation.visits.map((visit) => [visit.id, visit] as const));
    const existingById = new Map(visitEntries.map((entry) => [entry.frontmatter.id, entry] as const));
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.visits);
    const timestamp = this.now().toISOString();
    const targets = normalized.map((item) => {
      const id = item.visit_id!;
      const existing = existingById.get(id);
      const evaluated = nextById.get(id)!;
      const next: PlannerTripVisit = {
        ...evaluated,
        created_at: existing?.frontmatter.created_at ?? timestamp,
        updated_at: timestamp,
      };
      const fileName = existing?.fileName ?? plannerTripVisitFileName(id);
      const filePath = existing?.filePath ?? join(directory, fileName);
      return { existing, next, fileName, filePath, expected: fingerprint(filePath) };
    }).filter(({ existing, next }) => !existing || JSON.stringify(existing.frontmatter) !== JSON.stringify(next));
    if (targets.length === 0) throw new OwnlyMutationError('Schedule proposal does not change any Planner visit.', 'INVALID_INPUT' as OwnlyMutationErrorCode);
    const warnings = evaluation.issues.filter((issue) => issue.severity === 'warning');

    return this.prepare('planner_apply_schedule_proposal', {
      trip_id: tripId,
      updated_count: targets.length,
      warnings,
      visits: targets.map(({ next }) => ({
        visit_id: next.id,
        place_id: next.place_id,
        date: next.date,
        start: next.start,
        duration_minutes: next.duration_minutes,
        sort_order: next.sort_order,
        locked: next.locked,
      })),
    }, () => {
      for (const target of targets) assertUnchanged(target.filePath, target.expected);
      mkdirSync(directory, { recursive: true });
      for (const target of targets) writeFileSync(target.filePath, serializeMarkdownEntity(target.next, target.existing?.body ?? ''), 'utf8');
      writeAgentLog(this.dataLocation, 'planner_apply_schedule_proposal', tripId, null, { updated_count: targets.length, warnings });
      return { trip_id: tripId, applied_count: targets.length, warnings };
    });
  }

  preparePlannerSaveICalMarkdown(tripId: string): PreparedOwnlyOperation {
    const tripEntry = findPlannerEntry(listPlannerTrips(this.dataLocation), tripId);
    if (!tripEntry) {
      throw new OwnlyMutationError(`Trip was not found: ${tripId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    const trip = tripEntry.frontmatter as unknown as PlannerTrip;
    const placeEntries = listPlannerPlaces(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === tripId);
    const places = placeEntries.map((entry) => entry.frontmatter as unknown as PlannerTripPlace);
    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === tripId);
    const visits = visitEntries.map((entry) => entry.frontmatter as PlannerTripVisit);
    const markdown = exportTripToICalProMarkdown(trip, places, visits);
    const expectedTrip = fingerprint(tripEntry.filePath);
    const expectedPlaces = new Map(placeEntries.map((entry) => [entry.filePath, fingerprint(entry.filePath)] as const));
    const expectedVisits = new Map(visitEntries.map((entry) => [entry.filePath, fingerprint(entry.filePath)] as const));
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.trips);
    const fileName = `trip--${trip.id}.itinerary.md`;
    const targetPath = join(directory, fileName);

    return this.prepare(
      'planner_save_ical_markdown',
      { trip_id: tripId, target_file: fileName, length: markdown.length },
      () => {
        assertUnchanged(tripEntry.filePath, expectedTrip);
        for (const entry of placeEntries) assertUnchanged(entry.filePath, expectedPlaces.get(entry.filePath)!);
        for (const entry of visitEntries) assertUnchanged(entry.filePath, expectedVisits.get(entry.filePath)!);
        mkdirSync(directory, { recursive: true });
        writeFileSync(targetPath, markdown, 'utf8');
        writeAgentLog(this.dataLocation, 'planner_save_ical_markdown', tripId, null, { file_name: fileName });
        return { trip_id: tripId, file_name: fileName, file_path: targetPath, saved: true };
      },
    );
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
