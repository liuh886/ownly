export const WYQD_MEMBERSHIP_PLANS = [
  'free',
  'pro_annual',
  'pro_lifetime',
  'lifetime_early_supporter',
] as const;

export type WYQDMembershipPlan = (typeof WYQD_MEMBERSHIP_PLANS)[number];

export type WYQDLicenseKeyStatus = 'none' | 'dev_test' | 'activated' | 'invalid';

export interface WYQDMembershipState {
  plan: WYQDMembershipPlan;
  status: WYQDLicenseKeyStatus;
  isPro: boolean;
  licenseKeyLast4: string | null;
  planLabel: string;
  statusLabel: string;
  upgradeMessage: string;
}

export interface ResolveWYQDMembershipInput {
  licenseKey?: string | null;
  proUnlocked?: boolean;
  licenseSource?: string;
  t?: (key: string) => string;
}

// Dev/test keys — never shown in production UI
const DEV_TEST_KEYS: Record<string, WYQDMembershipPlan> = {
  'OWNLY-PRO-ANNUAL-TEST': 'pro_annual',
  'OWNLY-LIFETIME-EARLY-SUPPORTER-TEST': 'lifetime_early_supporter',
};

const PLAN_LABEL_KEYS: Record<WYQDMembershipPlan, string> = {
  free: 'planFree',
  pro_annual: 'planProAnnual',
  pro_lifetime: 'planProLifetime',
  lifetime_early_supporter: 'planLifetimeEarlySupporter',
};

const PLAN_LABELS_EN: Record<WYQDMembershipPlan, string> = {
  free: 'Free',
  pro_annual: 'Pro Annual',
  pro_lifetime: 'Pro Lifetime',
  lifetime_early_supporter: 'Lifetime Early Supporter',
};

const STATUS_LABEL_KEYS: Record<WYQDLicenseKeyStatus, string> = {
  activated: 'statusActivated',
  dev_test: 'statusDevTest',
  invalid: 'statusInvalid',
  none: 'statusNoLicense',
};

const STATUS_LABELS_EN: Record<WYQDLicenseKeyStatus, string> = {
  activated: 'Activated',
  dev_test: 'Dev test key',
  invalid: 'Invalid key',
  none: 'No license key',
};

export function resolveWYQDMembership({
  licenseKey,
  proUnlocked,
  t,
}: ResolveWYQDMembershipInput = {}): WYQDMembershipState {
  // 1. proUnlocked flag — set after successful Gumroad verify or special key
  if (proUnlocked) {
    return createMembershipState('pro_lifetime', 'activated', licenseKey ? last4(licenseKey) : null, t);
  }

  // 2. Dev/test keys (only for local testing)
  const normalizedKey = normalizeWYQDLicenseKey(licenseKey);
  if (normalizedKey) {
    const testPlan = DEV_TEST_KEYS[normalizedKey];
    if (testPlan) return createMembershipState(testPlan, 'dev_test', last4(normalizedKey), t);
  }

  return createMembershipState('free', 'none', null, t);
}

export function normalizeWYQDLicenseKey(licenseKey?: string | null) {
  return (licenseKey ?? '').trim();
}

export function canUseWYQDProFeature(membership: Pick<WYQDMembershipState, 'isPro'>) {
  return membership.isPro;
}

export const WYQD_FREE_LIMITS = {
  objects: 200,
  snapshots: 30,
  reviews: 100,
} as const;

export function checkWYQDCapacity(
  membership: Pick<WYQDMembershipState, 'isPro'>,
  kind: keyof typeof WYQD_FREE_LIMITS,
  currentCount: number,
): { allowed: boolean; limit: number; remaining: number } {
  if (membership.isPro) return { allowed: true, limit: Infinity, remaining: Infinity };
  const limit = WYQD_FREE_LIMITS[kind];
  return { allowed: currentCount < limit, limit, remaining: Math.max(0, limit - currentCount) };
}

function createMembershipState(
  plan: WYQDMembershipPlan,
  status: WYQDLicenseKeyStatus,
  licenseKeyLast4: string | null,
  t?: (key: string) => string,
): WYQDMembershipState {
  const isPro = plan !== 'free';

  return {
    plan,
    status,
    isPro,
    licenseKeyLast4,
    planLabel: t ? t(PLAN_LABEL_KEYS[plan]) : PLAN_LABELS_EN[plan],
    statusLabel: t ? t(STATUS_LABEL_KEYS[status]) : STATUS_LABELS_EN[status],
    upgradeMessage: isPro
      ? (t ? t('proMembershipActive') : 'Pro membership is active.')
      : (t ? t('freeUpgradeMessage') : 'Free tier includes 200 objects, 30 snapshots, and 100 reviews. Upgrade to Pro for unlimited.'),
  };
}

function last4(value: string) {
  return value.slice(-4);
}
