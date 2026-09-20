import { describe, expect, it } from 'vitest';
import { resolvePoolEmptyReason } from './pool-empty-state';

describe('resolvePoolEmptyReason', () => {
  it('returns null while any candidate is visible', () => {
    expect(resolvePoolEmptyReason(5, 3)).toBeNull();
    expect(resolvePoolEmptyReason(1, 1)).toBeNull();
  });

  it('reports "empty" when the trip has no candidates at all', () => {
    expect(resolvePoolEmptyReason(0, 0)).toBe('empty');
  });

  it('reports "filtered" when candidates exist but filters/search hid them', () => {
    expect(resolvePoolEmptyReason(5, 0)).toBe('filtered');
    expect(resolvePoolEmptyReason(1, 0)).toBe('filtered');
  });
});
