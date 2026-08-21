import { resolve } from 'node:path';
import { resolveOwnlyDataRoot } from '../shared/data-root';
import {
  CliError,
  type CliErrorCode,
  type CliOptions,
  type ParsedCliArgs,
} from './types';

export function parseArgs(argv: readonly string[]): ParsedCliArgs {
  const options: CliOptions = {};
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const rawOption = token.slice(2);
    const equalsIndex = rawOption.indexOf('=');
    const rawKey = equalsIndex >= 0 ? rawOption.slice(0, equalsIndex) : rawOption;
    const inlineValue = equalsIndex >= 0 ? rawOption.slice(equalsIndex + 1) : undefined;
    const key = rawKey.replaceAll('-', '_');
    const next = argv[index + 1];

    if (!key) throw new CliError('Option name cannot be empty.');

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
    } else if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }

  return { options, positionals };
}

export function hasFlag(options: CliOptions, key: string): boolean {
  const value = options[key];
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toLowerCase();
  return !['false', '0', 'no', 'off', ''].includes(normalized);
}

export function optionalString(options: CliOptions, key: string): string | undefined {
  const value = options[key];
  if (value === undefined || value === false || value === '') return undefined;
  if (value === true) {
    throw new CliError(`Option --${key.replaceAll('_', '-')} requires a value.`, 'MISSING_OPTION');
  }
  return value;
}

export function requiredString(options: CliOptions, key: string): string {
  const value = optionalString(options, key);
  if (value === undefined) {
    throw new CliError(
      `Missing required option --${key.replaceAll('_', '-')}`,
      'MISSING_OPTION',
    );
  }
  return value;
}

export function numberOption(
  options: CliOptions,
  key: string,
  fallback?: number,
): number | undefined {
  const raw = optionalString(options, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CliError(
      `Option --${key.replaceAll('_', '-')} must be a number.`,
      'INVALID_INPUT',
    );
  }
  return value;
}

export function nullableNumberOption(
  options: CliOptions,
  key: string,
  fallback: number | null,
): number | null {
  const raw = optionalString(options, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CliError(
      `Option --${key.replaceAll('_', '-')} must be a number.`,
      'INVALID_INPUT',
    );
  }
  return value;
}

export function integerOption(
  options: CliOptions,
  key: string,
  bounds?: { min?: number; max?: number },
): number | undefined {
  const value = numberOption(options, key);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) {
    throw new CliError(
      `Option --${key.replaceAll('_', '-')} must be an integer.`,
      'INVALID_INPUT',
    );
  }
  if (bounds?.min !== undefined && value < bounds.min) {
    throw new CliError(
      `Option --${key.replaceAll('_', '-')} must be at least ${bounds.min}.`,
      'INVALID_INPUT',
    );
  }
  if (bounds?.max !== undefined && value > bounds.max) {
    throw new CliError(
      `Option --${key.replaceAll('_', '-')} must be at most ${bounds.max}.`,
      'INVALID_INPUT',
    );
  }
  return value;
}

export function getDataLocation(options: CliOptions, env: NodeJS.ProcessEnv): string {
  const root = optionalString(options, 'vault') ?? env.OWNLY_VAULT ?? env.WYQD_VAULT;
  if (!root) {
    throw new CliError(
      'Missing local data location. Pass --vault <path> or set OWNLY_VAULT.',
      'VAULT_NOT_FOUND',
    );
  }
  return resolveOwnlyDataRoot(resolve(root), { allowCreateDefault: true });
}

export function asCliError(
  error: unknown,
  fallbackCode: CliErrorCode = 'INVALID_INPUT',
): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof Error) return new CliError(error.message, fallbackCode);
  return new CliError(String(error), fallbackCode);
}
