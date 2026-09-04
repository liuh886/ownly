/**
 * Expense migration v0.1 → v0.2
 *
 * When TripMember model is introduced (P1-6), this migration will:
 * - Convert string-based member references to member IDs
 * - Restructure payments array
 */
import type { Migration } from './index';

export const expenseV0_1_to_V0_2: Migration = {
  from: '0.1',
  to: '0.2',
  transform: (entity: Record<string, unknown>) => {
    return {
      ...entity,
      schema_version: '0.2',
    };
  },
};
