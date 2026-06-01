export const WYQD_MEMBERSHIP_PLANS = [
  'free',
  'pro_annual',
  'pro_lifetime',
  'lifetime_early_supporter',
] as const;

export type WYQDMembershipPlan = (typeof WYQD_MEMBERSHIP_PLANS)[number];

export type WYQDLicenseKeyStatus = 'none' | 'dev_test' | 'activated';

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
  none: 'statusNoLicense',
};

const STATUS_LABELS_EN: Record<WYQDLicenseKeyStatus, string> = {
  activated: 'Activated',
  dev_test: 'Dev test key',
  none: 'No license key',
};

export function resolveWYQDMembership({
  proUnlocked,
  t,
}: ResolveWYQDMembershipInput = {}): WYQDMembershipState {
  // Sponsorship model — click to unlock, no license key required.
  if (proUnlocked) {
    return createMembershipState('pro_lifetime', 'activated', null, t);
  }
  return createMembershipState('free', 'none', null, t);
}

export function canUseWYQDProFeature(membership: Pick<WYQDMembershipState, 'isPro'>) {
  return membership.isPro;
}

export const WYQD_FREE_LIMITS = {
  objects: Infinity,
  snapshots: Infinity,
  reviews: Infinity,
} as const;

// Everyone is Pro — capacity is always unlimited.
export function checkWYQDCapacity(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _membership: Pick<WYQDMembershipState, 'isPro'>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _kind: keyof typeof WYQD_FREE_LIMITS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _currentCount: number,
): { allowed: boolean; limit: number; remaining: number } {
  return { allowed: true, limit: Infinity, remaining: Infinity };
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

