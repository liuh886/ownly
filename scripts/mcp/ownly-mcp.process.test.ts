import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const mcpEntry = join(process.cwd(), 'packages', 'mcp', 'dist', 'index.js');

describe('Ownly MCP process contract smoke test', () => {
  it('prints help and exits with code 0 on --help', () => {
    const result = spawnSync(process.execPath, [mcpEntry, '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Ownly MCP');
    expect(result.stdout).toContain('--data-dir');
  });

  it('exits with non-zero error code when missing required data-dir', () => {
    const result = spawnSync(process.execPath, [mcpEntry], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, OWNLY_DATA_DIR: '' },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DATA_DIR_NOT_CONFIGURED');
  });

  it('accepts --data-dir and initializes stdio server', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ownly-mcp-test-'));
    mkdirSync(join(tempDir, 'Objects'), { recursive: true });

    const result = spawnSync(process.execPath, [mcpEntry, '--data-dir', tempDir], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 1000,
    });

    expect(result.stderr).toContain('Ownly MCP running locally over stdio');
  });
});
