import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WS-3 acceptance, mechanized: the read-only snapshot tree must have no
 * channel to any store. Hiding buttons would not satisfy this; the absence
 * of repository/workspace/action imports does. If a future change needs a
 * store here, this test forces the author to revisit the read-only claim.
 */
const READONLY_TREE = [
  'src/components/snapshot/TripSnapshotViewer.tsx',
  'src/app/trip/page.tsx',
];

const FORBIDDEN_SPECIFIERS = [
  'Repository',
  'repository',
  'ownly-workspace-context',
  'usePlannerActions',
  'usePlannerController',
  'usePlannerData',
  'upsert',
  'saveObject',
  'writeText',
  'idb-keyval',
  'services/',
];

function importSpecifiers(source: string): string[] {
  const found: string[] = [];
  const re = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) found.push(match[1]);
  return found;
}

describe('snapshot read-only boundary (WS-3)', () => {
  for (const file of READONLY_TREE) {
    it(`${file} imports no store channel`, () => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const hits = importSpecifiers(source).filter((specifier) =>
        FORBIDDEN_SPECIFIERS.some((token) => specifier.includes(token)),
      );
      expect(hits).toEqual([]);
    });
  }

  it('the viewer documents its props-in-only contract', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/snapshot/TripSnapshotViewer.tsx'),
      'utf8',
    );
    expect(source).toContain('props-in only');
  });
});
