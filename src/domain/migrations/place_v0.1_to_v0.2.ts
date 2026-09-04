/**
 * Place migration v0.1 → v0.2
 *
 * Example migration demonstrating the pattern.
 * When the Place model changes in a future breaking change,
 * add a migration here that transforms old-format entities.
 *
 * Current v0.1 Place has no schedule fields (those moved to Visit in #135).
 * This migration is a no-op placeholder showing how to add future migrations.
 */
import type { Migration } from './index';

export const placeV0_1_to_V0_2: Migration = {
  from: '0.1',
  to: '0.2',
  transform: (entity: Record<string, unknown>) => {
    return {
      ...entity,
      schema_version: '0.2',
    };
  },
};
