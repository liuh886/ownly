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
}

// Dev/test keys — never shown in production UI
const DEV_TEST_KEYS: Record<string, WYQDMembershipPlan> = {
  'OWNLY-PRO-ANNUAL-TEST': 'pro_annual',
  'OWNLY-LIFETIME-EARLY-SUPPORTER-TEST': 'lifetime_early_supporter',
};

const PLAN_LABELS: Record<WYQDMembershipPlan, string> = {
  free: 'Free',
  pro_annual: 'Pro Annual',
  pro_lifetime: 'Pro Lifetime',
  lifetime_early_supporter: 'Lifetime Early Supporter',
};

const FREE_UPGRADE_MESSAGE =
  'Free tier includes 200 objects, 30 snapshots, and 100 reviews. Upgrade to Pro for unlimited.';

export function resolveWYQDMembership({
  licenseKey,
  proUnlocked,
}: ResolveWYQDMembershipInput = {}): WYQDMembershipState {
  // 1. proUnlocked flag — set after successful Gumroad verify or special key
  if (proUnlocked) {
    return createMembershipState('pro_lifetime', 'activated', licenseKey ? last4(licenseKey) : null);
  }

  // 2. Dev/test keys (only for local testing)
  const normalizedKey = normalizeWYQDLicenseKey(licenseKey);
  if (normalizedKey) {
    const testPlan = DEV_TEST_KEYS[normalizedKey];
    if (testPlan) return createMembershipState(testPlan, 'dev_test', last4(normalizedKey));
  }

  return createMembershipState('free', 'none', null);
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
): WYQDMembershipState {
  const isPro = plan !== 'free';

  return {
    plan,
    status,
    isPro,
    licenseKeyLast4,
    planLabel: PLAN_LABELS[plan],
    statusLabel: getStatusLabel(status),
    upgradeMessage: isPro
      ? 'Pro membership is active.'
      : FREE_UPGRADE_MESSAGE,
  };
}

function getStatusLabel(status: WYQDLicenseKeyStatus) {
  switch (status) {
    case 'activated':
      return 'Activated';
    case 'dev_test':
      return 'Dev test key';
    case 'invalid':
      return 'Invalid key';
    default:
      return 'No license key';
  }
}

function last4(value: string) {
  return value.slice(-4);
}
