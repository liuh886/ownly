import type {
  WYQDObject,
  PhysicalObject,
  RecurringCostObject,
  OneTimeExperienceObject,
  Account,
  AccountSnapshot,
  ReviewEntry,
  ObjectLogEntry,
  ObjectLogEventType,
} from './types';
import type {
  PlannerTrip,
  PlannerTripPlace,
  PlannerTripLeg,
  TripExpenseItem,
} from './planner';
import type { PlannerTripVisit } from './planner-visits';
import { CURRENT_SCHEMA_VERSION } from './schema/common';

export const VALID_OBJECT_LOG_EVENT_TYPES: readonly ObjectLogEventType[] = [
  'usage', 'issue', 'maintenance', 'regret', 'lesson', 'comparison', 'exit_note',
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

export function validateBaseEntity(entity: { id?: string; title?: string; created_at?: string; schema_version?: string }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!entity.id || typeof entity.id !== 'string') issues.push({ field: 'id', message: 'Missing or invalid ID', severity: 'error' });
  if (!entity.title || typeof entity.title !== 'string') issues.push({ field: 'title', message: 'Missing or invalid title', severity: 'error' });
  if (!entity.created_at || typeof entity.created_at !== 'string') issues.push({ field: 'created_at', message: 'Missing or invalid created_at', severity: 'error' });
  if (!entity.schema_version) {
    issues.push({ field: 'schema_version', message: 'Missing schema_version', severity: 'error' });
  } else if (entity.schema_version !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schema_version', message: `Unsupported schema version: ${entity.schema_version}`, severity: 'error' });
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
  if (!log.event_type) {
    issues.push({ field: 'event_type', message: 'Missing event_type', severity: 'error' });
  } else if (!VALID_OBJECT_LOG_EVENT_TYPES.includes(log.event_type)) {
    issues.push({ field: 'event_type', message: `Invalid event_type: ${log.event_type}. Allowed: ${VALID_OBJECT_LOG_EVENT_TYPES.join(', ')}`, severity: 'error' });
  }
  if (!log.summary) issues.push({ field: 'summary', message: 'Missing summary', severity: 'error' });
  return createResult(issues);
}

export function validateTrip(trip: PlannerTrip): ValidationResult {
  const issues = validateBaseEntity(trip);
  if (!trip.status) {
    issues.push({ field: 'status', message: 'Missing trip status', severity: 'error' });
  } else if (!['planning', 'active', 'completed'].includes(trip.status)) {
    issues.push({ field: 'status', message: `Invalid trip status: ${trip.status}. Allowed: planning, active, completed`, severity: 'error' });
  }
  if (!trip.start_date) {
    issues.push({ field: 'start_date', message: 'Missing start_date', severity: 'error' });
  } else if (!DATE_REGEX.test(trip.start_date)) {
    issues.push({ field: 'start_date', message: `Invalid start_date format (must be YYYY-MM-DD): ${trip.start_date}`, severity: 'error' });
  }
  if (!trip.end_date) {
    issues.push({ field: 'end_date', message: 'Missing end_date', severity: 'error' });
  } else if (!DATE_REGEX.test(trip.end_date)) {
    issues.push({ field: 'end_date', message: `Invalid end_date format (must be YYYY-MM-DD): ${trip.end_date}`, severity: 'error' });
  }
  if (trip.start_date && trip.end_date && trip.start_date > trip.end_date) {
    issues.push({ field: 'end_date', message: `Trip end_date (${trip.end_date}) cannot be before start_date (${trip.start_date})`, severity: 'error' });
  }
  if (!Array.isArray(trip.destinations)) {
    issues.push({ field: 'destinations', message: 'Trip destinations must be an array', severity: 'error' });
  }
  return createResult(issues);
}

export function validateTripPlace(place: PlannerTripPlace): ValidationResult {
  const issues = validateBaseEntity(place);
  if (!place.trip_id || typeof place.trip_id !== 'string') {
    issues.push({ field: 'trip_id', message: 'Missing trip_id', severity: 'error' });
  }
  if (!place.kind) {
    issues.push({ field: 'kind', message: 'Missing kind', severity: 'error' });
  } else if (!['attraction', 'food', 'cafe', 'stay', 'shopping', 'transit', 'experience', 'service', 'other'].includes(place.kind)) {
    issues.push({ field: 'kind', message: `Invalid place kind: ${place.kind}`, severity: 'error' });
  }
  if (!place.state) {
    issues.push({ field: 'state', message: 'Missing state', severity: 'error' });
  } else if (!['candidate', 'done', 'dropped'].includes(place.state)) {
    issues.push({ field: 'state', message: `Invalid place state: ${place.state}. Allowed: candidate, done, dropped`, severity: 'error' });
  }
  if (!place.source_provider) {
    issues.push({ field: 'source_provider', message: 'Missing source_provider', severity: 'error' });
  } else if (!['google_maps', 'google_travel', 'booking', 'agoda', 'tabelog', 'xiaohongshu', 'other'].includes(place.source_provider)) {
    issues.push({ field: 'source_provider', message: `Invalid source_provider: ${place.source_provider}`, severity: 'error' });
  }
  if (place.source_url === undefined || typeof place.source_url !== 'string') {
    issues.push({ field: 'source_url', message: 'Missing or invalid source_url', severity: 'error' });
  }
  if (place.tags !== undefined && !Array.isArray(place.tags)) {
    issues.push({ field: 'tags', message: 'Place tags must be an array', severity: 'error' });
  }
  if (place.signals !== undefined && !Array.isArray(place.signals)) {
    issues.push({ field: 'signals', message: 'Place signals must be an array', severity: 'error' });
  }
  if (place.risks !== undefined && !Array.isArray(place.risks)) {
    issues.push({ field: 'risks', message: 'Place risks must be an array', severity: 'error' });
  }
  return createResult(issues);
}

export function validateTripVisit(visit: PlannerTripVisit): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!visit.id || typeof visit.id !== 'string') issues.push({ field: 'id', message: 'Missing ID', severity: 'error' });
  if (!visit.trip_id || typeof visit.trip_id !== 'string') issues.push({ field: 'trip_id', message: 'Missing trip_id', severity: 'error' });
  if (!visit.place_id || typeof visit.place_id !== 'string') issues.push({ field: 'place_id', message: 'Missing place_id', severity: 'error' });
  if (!visit.date) {
    issues.push({ field: 'date', message: 'Missing date', severity: 'error' });
  } else if (!DATE_REGEX.test(visit.date)) {
    issues.push({ field: 'date', message: `Invalid date format (must be YYYY-MM-DD): ${visit.date}`, severity: 'error' });
  }
  if (typeof visit.sort_order !== 'number' || !Number.isInteger(visit.sort_order) || visit.sort_order < 0) {
    issues.push({ field: 'sort_order', message: 'Missing or invalid non-negative sort_order integer', severity: 'error' });
  }
  if (visit.duration_minutes !== undefined && (typeof visit.duration_minutes !== 'number' || !Number.isFinite(visit.duration_minutes) || visit.duration_minutes < 0)) {
    issues.push({ field: 'duration_minutes', message: 'Invalid duration_minutes', severity: 'error' });
  }
  if (!visit.created_at || typeof visit.created_at !== 'string') issues.push({ field: 'created_at', message: 'Missing created_at', severity: 'error' });
  if (!visit.schema_version) {
    issues.push({ field: 'schema_version', message: 'Missing schema_version', severity: 'error' });
  } else if (visit.schema_version !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schema_version', message: `Unsupported schema version: ${visit.schema_version}`, severity: 'error' });
  }
  return createResult(issues);
}

export function validateTripLeg(leg: PlannerTripLeg): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!leg.id || typeof leg.id !== 'string') issues.push({ field: 'id', message: 'Missing ID', severity: 'error' });
  if (!leg.trip_id || typeof leg.trip_id !== 'string') issues.push({ field: 'trip_id', message: 'Missing trip_id', severity: 'error' });
  if (!leg.from_place_id || typeof leg.from_place_id !== 'string') issues.push({ field: 'from_place_id', message: 'Missing from_place_id', severity: 'error' });
  if (!leg.to_place_id || typeof leg.to_place_id !== 'string') issues.push({ field: 'to_place_id', message: 'Missing to_place_id', severity: 'error' });
  if (!leg.mode) {
    issues.push({ field: 'mode', message: 'Missing mode', severity: 'error' });
  } else if (!['driving', 'motorcycle', 'walking', 'bicycling', 'transit'].includes(leg.mode)) {
    issues.push({ field: 'mode', message: `Invalid mode: ${leg.mode}. Allowed: driving, motorcycle, walking, bicycling, transit`, severity: 'error' });
  }
  if (typeof leg.duration_minutes !== 'number' || !Number.isFinite(leg.duration_minutes) || leg.duration_minutes < 0) {
    issues.push({ field: 'duration_minutes', message: 'Missing or negative duration_minutes', severity: 'error' });
  }
  if (leg.source && !['heuristic', 'manual', 'openrouteservice'].includes(leg.source)) {
    issues.push({ field: 'source', message: `Invalid leg source: ${leg.source}`, severity: 'error' });
  }
  if (!leg.created_at || typeof leg.created_at !== 'string') issues.push({ field: 'created_at', message: 'Missing created_at', severity: 'error' });
  if (!leg.schema_version) {
    issues.push({ field: 'schema_version', message: 'Missing schema_version', severity: 'error' });
  } else if (leg.schema_version !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schema_version', message: `Unsupported schema version: ${leg.schema_version}`, severity: 'error' });
  }
  return createResult(issues);
}

export function validateTripExpense(expense: TripExpenseItem & { schema_version?: string }): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!expense.id || typeof expense.id !== 'string') issues.push({ field: 'id', message: 'Missing ID', severity: 'error' });
  if (!expense.trip_id || typeof expense.trip_id !== 'string') issues.push({ field: 'trip_id', message: 'Missing trip_id', severity: 'error' });
  if (!expense.title || typeof expense.title !== 'string') issues.push({ field: 'title', message: 'Missing title', severity: 'error' });
  if (!expense.category) {
    issues.push({ field: 'category', message: 'Missing category', severity: 'error' });
  } else if (!['stay', 'food', 'transit', 'ticket', 'shopping', 'other'].includes(expense.category)) {
    issues.push({ field: 'category', message: `Invalid category: ${expense.category}`, severity: 'error' });
  }
  if (typeof expense.amount !== 'number' || expense.amount < 0 || Number.isNaN(expense.amount) || !Number.isFinite(expense.amount)) {
    issues.push({ field: 'amount', message: 'Missing or invalid amount', severity: 'error' });
  }
  if (!expense.currency || typeof expense.currency !== 'string') {
    issues.push({ field: 'currency', message: 'Missing currency', severity: 'error' });
  }
  if (!expense.paid_by || typeof expense.paid_by !== 'string') {
    issues.push({ field: 'paid_by', message: 'Missing paid_by', severity: 'error' });
  }
  if (expense.schema_version && expense.schema_version !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schema_version', message: `Unsupported schema version: ${expense.schema_version}`, severity: 'error' });
  }
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
    case 'trip': return validateTrip(entity as PlannerTrip);
    case 'trip_place': return validateTripPlace(entity as PlannerTripPlace);
    case 'trip_visit': return validateTripVisit(entity as PlannerTripVisit);
    case 'trip_leg': return validateTripLeg(entity as PlannerTripLeg);
    case 'trip_expense': return validateTripExpense(entity as TripExpenseItem);
    default:
      return createResult([{ field: 'type', message: `Unknown entity type: ${entityRecord.type}`, severity: 'error' }]);
  }
}
