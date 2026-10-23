import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function audit(report: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'ownly-audit-'));
  try {
    const path = join(dir, 'report.json');
    writeFileSync(path, JSON.stringify(report));
    return spawnSync(process.execPath, [resolve('scripts/enforce-production-audit.mjs'), path], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
describe('dependency audit gate', () => {
  it('accepts a completed clean audit', () => {
    expect(audit({ metadata: { vulnerabilities: counts } }).status).toBe(0);
  });
  it.each([
    { error: { code: 'ENOAUDIT', summary: 'Registry audit unavailable' } },
    {},
    { metadata: { vulnerabilities: { ...counts, high: '0' } } },
  ])('rejects incomplete or invalid audit reports: %j', (report) => {
    const result = audit(report);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('did not complete');
  });
  it('blocks reported high severity vulnerabilities', () => {
    expect(audit({ metadata: { vulnerabilities: { ...counts, high: 1, total: 1 } } }).status).toBe(1);
  });
});
