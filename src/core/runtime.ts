import { GIT_SHA } from './git-sha';

export const WYQD_CORE_TARGET_VERSION = '1.1.0' as const;

export const WYQD_PRODUCT_SLOGAN = 'Own less, Live more, Decide better' as const;

export const WYQD_PRODUCT_POSITIONING =
  'Obsidian-native, local-first decision ledger for possessions, subscriptions, and experiences.' as const;

export const WYQD_SCHEMA_VERSION = '0.1' as const;

export const WYQD_RUNTIME_TARGETS = ['web', 'obsidian'] as const;

export type WYQDRuntimeTarget = (typeof WYQD_RUNTIME_TARGETS)[number];

export interface WYQDRuntimeInfo {
  coreTargetVersion: typeof WYQD_CORE_TARGET_VERSION;
  schemaVersion: typeof WYQD_SCHEMA_VERSION;
  runtimeTarget: WYQDRuntimeTarget;
  gitSha: string;
}

export function createWYQDRuntimeInfo(runtimeTarget: WYQDRuntimeTarget): WYQDRuntimeInfo {
  return {
    coreTargetVersion: WYQD_CORE_TARGET_VERSION,
    schemaVersion: WYQD_SCHEMA_VERSION,
    runtimeTarget,
    gitSha: GIT_SHA,
  };
}
