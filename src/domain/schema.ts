import type {
  WYQDObject,
  PhysicalObject,
  RecurringCostObject,
  OneTimeExperienceObject,
  Account,
  AccountSnapshot,
  ReviewEntry,
  ObjectLogEntry,
  BaseEntity
} from './types';

export type ValidationSeverity = 'warning' | 'error';

export interface ValidationIssue {
  field?: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

function createResult(issues: ValidationIssue[]): ValidationResult {
  return {
    valid: !issues.some(i => i.severity === 'error'),
    issues
  };
}

export function validateBaseEntity(entity: BaseEntity): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!entity.id) issues.push({ field: 'id', message: 'Missing ID', severity: 'error' });
  if (!entity.title) issues.push({ field: 'title', message: 'Missing title', severity: 'error' });
  if (!entity.created_at) issues.push({ field: 'created_at', message: 'Missing created_at', severity: 'error' });
  if (!entity.schema_version) {
    issues.push({ field: 'schema_version', message: 'Missing schema_version', severity: 'error' });
  } else if (entity.schema_version !== '0.1') {
    issues.push({ field: 'schema_version', message: `Unsupported schema version: ${entity.schema_version}`, severity: 'warning' });
  }
  return issues;
}

export function validatePhysical(obj: PhysicalObject): ValidationResult {
  const issues = validateBaseEntity(obj);
  
  if (['purchased', 'using'].includes(obj.status) && !obj.purchased_at) {
    issues.push({ field: 'purchased_at', message: 'Status is purchased/using but purchased_at is missing', severity: 'error' });
  }
  
  if (['idle', 'transferred', 'discarded'].includes(obj.status) && !obj.ended_at) {
    issues.push({ field: 'ended_at', message: `Status is ${obj.status} but ended_at is missing`, severity: 'error' });
  }

  const acquisitionCost = obj.total_acquisition_cost || 0;
  if (obj.sale_price !== undefined && acquisitionCost > 0 && obj.sale_price > acquisitionCost * 1.5) {
    issues.push({ field: 'sale_price', message: 'Sale price is significantly higher than acquisition cost', severity: 'warning' });
  }

  return createResult(issues);
}

export function validateRecurring(obj: RecurringCostObject): ValidationResult {
  const issues = validateBaseEntity(obj);

  if (obj.status === 'active') {
    if (obj.billing_amount === undefined) issues.push({ field: 'billing_amount', message: 'Active recurring cost must have billing_amount', severity: 'error' });
    if (!obj.billing_cycle) issues.push({ field: 'billing_cycle', message: 'Active recurring cost must have billing_cycle', severity: 'error' });
    if (!obj.started_at) issues.push({ field: 'started_at', message: 'Active recurring cost must have started_at', severity: 'error' });
  }

  if (obj.billing_day !== undefined) {
    if (obj.billing_day < 1 || obj.billing_day > 31) {
      issues.push({ field: 'billing_day', message: 'Billing day must be between 1 and 31', severity: 'error' });
    }
  }

  return createResult(issues);
}

export function validateExperience(obj: OneTimeExperienceObject): ValidationResult {
  const issues = validateBaseEntity(obj);

  if (['completed', 'reviewed'].includes(obj.status) && !obj.ended_at) {
    issues.push({ field: 'ended_at', message: `Status is ${obj.status} but ended_at is missing`, severity: 'error' });
  }

  if (obj.experience_subtype === 'travel_worldview' || obj.experience_subtype?.startsWith('travel_')) {
    const loc = obj.location;
    if (!loc || (!loc.country && !loc.city && !loc.country_code)) {
      issues.push({ field: 'location', message: 'Travel experience must have country, city, or country_code', severity: 'error' });
    }
  }

  return createResult(issues);
}

export function validateObject(obj: WYQDObject): ValidationResult {
  switch (obj.object_type) {
    case 'physical': return validatePhysical(obj);
    case 'recurring_cost': return validateRecurring(obj);
    case 'one_time_experience': return validateExperience(obj);
    default:
      return createResult([{ message: `Unknown object type: ${(obj as unknown as Record<string, unknown>).object_type}`, severity: 'error' }]);
  }
}

export function validateAccount(account: Account): ValidationResult {
  const issues = validateBaseEntity(account);
  if (!account.account_type) issues.push({ field: 'account_type', message: 'Missing account_type', severity: 'error' });
  return createResult(issues);
}

export function validateSnapshot(snapshot: AccountSnapshot): ValidationResult {
  const issues = validateBaseEntity(snapshot);
  if (!snapshot.snapshot_at) issues.push({ field: 'snapshot_at', message: 'Missing snapshot_at', severity: 'error' });
  return createResult(issues);
}

export function validateReview(review: ReviewEntry): ValidationResult {
  const issues = validateBaseEntity(review);
  if (!review.review_type) issues.push({ field: 'review_type', message: 'Missing review_type', severity: 'error' });

  if (['object_review', 'exit_record'].includes(review.review_type) && !review.target_id) {
    issues.push({ field: 'target_id', message: 'Missing target_id', severity: 'error' });
  }

  return createResult(issues);
}

export function validateObjectLog(log: ObjectLogEntry): ValidationResult {
  const issues = validateBaseEntity(log);
  if (!log.target_id) issues.push({ field: 'target_id', message: 'Missing target_id', severity: 'error' });
  if (!log.event_type) issues.push({ field: 'event_type', message: 'Missing event_type', severity: 'error' });
  if (!log.summary) issues.push({ field: 'summary', message: 'Missing summary', severity: 'error' });
  return createResult(issues);
}

export function validateEntity(entity: unknown): ValidationResult {
  if (!entity || typeof entity !== 'object') {
    return createResult([{ message: 'Entity is not an object', severity: 'error' }]);
  }
  
  const entityRecord = entity as Record<string, unknown>;
  
  switch (entityRecord.type) {
    case 'object': return validateObject(entity as WYQDObject);
    case 'account': return validateAccount(entity as Account);
    case 'snapshot': return validateSnapshot(entity as AccountSnapshot);
    case 'review': return validateReview(entity as ReviewEntry);
    case 'object_log': return validateObjectLog(entity as ObjectLogEntry);
    default:
      return createResult([{ field: 'type', message: `Unknown entity type: ${entityRecord.type}`, severity: 'error' }]);
  }
}
