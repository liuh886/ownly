import type {
  AccountSnapshot,
  ObjectLogEntry,
  ReviewEntry,
  WYQDEntityType,
  WYQDObject,
  WYQDObjectStatus,
  WYQDObjectType,
} from '../../src/domain/types';

export type SupportedCliEntityType = Exclude<WYQDEntityType, 'account'>;

export interface EntityByType {
  object: WYQDObject;
  snapshot: AccountSnapshot;
  review: ReviewEntry;
  object_log: ObjectLogEntry;
}

export type SupportedCliEntity = EntityByType[SupportedCliEntityType];

export type CliOptionValue = string | boolean;
export type CliOptions = Record<string, CliOptionValue | undefined>;

export interface ParsedCliArgs {
  options: CliOptions;
  positionals: string[];
}

export type CliErrorCode =
  | 'INVALID_INPUT'
  | 'MISSING_OPTION'
  | 'NOT_FOUND'
  | 'VAULT_NOT_FOUND'
  | 'IO_ERROR';

export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly exitCode: number;

  constructor(message: string, code: CliErrorCode = 'INVALID_INPUT', exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export interface StoredEntry<T extends SupportedCliEntity = SupportedCliEntity> {
  fileName: string;
  filePath: string;
  frontmatter: T;
  body: string;
}

export interface AgentObjectRow {
  id: string;
  title: string;
  object_type: WYQDObjectType;
  status: WYQDObjectStatus;
  category?: string;
  fileName: string;
  created_at: string;
  updated_at?: string;
  review_ref: string | null;
  has_review: boolean;
  needs_review: boolean;
  purchase_price?: number;
  total_acquisition_cost?: number;
  sale_price?: number;
  purchased_at?: string;
  ended_at?: string | null;
  billing_amount?: number;
  billing_cycle?: string;
  annualized_cost?: number;
  payment_account?: string | null;
  started_at?: string;
  budget_total?: number;
  actual_total?: number;
  experience_subtype?: string;
  location?: {
    city?: string;
    country?: string;
    country_code?: string;
  };
}

export interface ReviewJsonRow {
  id: string;
  title: string;
  review_type: string;
  target_id?: string;
  fileName: string;
}

export interface DoctorIssueRow {
  id?: string;
  field?: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface DoctorResult {
  valid: boolean;
  entitiesChecked: number;
  errors: DoctorIssueRow[];
  warnings: DoctorIssueRow[];
}

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  warn(text: string): void;
}

export const processCliIo: CliIo = {
  stdout: (text) => console.log(text),
  stderr: (text) => console.error(text),
  warn: (text) => console.warn(text),
};
