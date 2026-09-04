/**
 * Trip migration v0.1 → v0.2
 *
 * Example: when Trip gains new required fields or structural changes.
 */
import type { Migration } from './index';

export const tripV0_1_to_V0_2: Migration = {
  from: '0.1',
  to: '0.2',
  transform: (entity: Record<string, unknown>) => {
    return {
      ...entity,
      schema_version: '0.2',
    };
  },
};
