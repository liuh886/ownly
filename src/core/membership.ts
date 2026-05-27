export const WYQD_MEMBERSHIP_PLANS = [
  'free',
  'pro_annual',
  'lifetime_early_supporter',
] as const;

export type WYQDMembershipPlan = (typeof WYQD_MEMBERSHIP_PLANS)[number];

export type WYQDLicenseKeyStatus = 'none' | 'active_test_key' | 'invalid_local_key';

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
}

const LOCAL_TEST_LICENSE_KEYS: Record<string, WYQDMembershipPlan> = {
  'OWNLY-PRO-ANNUAL-TEST': 'pro_annual',
  'OWNLY-LIFETIME-EARLY-SUPPORTER-TEST': 'lifetime_early_supporter',
};

const PLAN_LABELS: Record<WYQDMembershipPlan, string> = {
  free: 'Free',
  pro_annual: 'Pro Annual',
  lifetime_early_supporter: 'Lifetime Early Supporter',
};

const FREE_UPGRADE_MESSAGE =
  'Free tier includes 200 objects, 30 snapshots, and 100 reviews. Upgrade to Pro for unlimited.';

export function resolveWYQDMembership({
  licenseKey,
}: ResolveWYQDMembershipInput = {}): WYQDMembershipState {
  const normalizedKey = normalizeWYQDLicenseKey(licenseKey);

  if (!normalizedKey) {
    return createMembershipState('free', 'none', null);
  }

  const plan = LOCAL_TEST_LICENSE_KEYS[normalizedKey];
  if (!plan) {
    return createMembershipState('free', 'invalid_local_key', last4(normalizedKey));
  }

  return createMembershipState(plan, 'active_test_key', last4(normalizedKey));
}

export function normalizeWYQDLicenseKey(licenseKey?: string | null) {
  return (licenseKey ?? '').trim().toUpperCase();
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
      ? 'Pro membership is active for local alpha testing.'
      : FREE_UPGRADE_MESSAGE,
  };
}

function getStatusLabel(status: WYQDLicenseKeyStatus) {
  if (status === 'active_test_key') {
    return 'Active local test key';
  }

  if (status === 'invalid_local_key') {
    return 'Invalid local test key';
  }

  return 'No license key';
}

function last4(value: string) {
  return value.slice(-4);
}
