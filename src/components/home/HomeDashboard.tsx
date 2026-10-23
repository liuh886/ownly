import { useI18n } from '@/core/i18n-context';
import { matchesCurrency } from '@/domain/currency';
import { calculateHomeMetrics } from '@/domain/calculations';
import { motion, type Variants } from 'framer-motion';
import type { AccountSnapshot, HomeMetrics, WYQDObject } from '@/domain/types';
import type { ObjectListFocus } from '@/components/objects/ObjectList';

import { HomeOwnSection } from './HomeOwnSection';
import { HomeRepaymentSection } from './HomeRepaymentSection';
import { HomeCostSection } from './HomeCostSection';
import { HomeReviewSection } from './HomeReviewSection';
import { HomeDataScaleSection } from './HomeDataScaleSection';
import { HomeDoctorSection } from './HomeDoctorSection';
import { PlannerDoctorSection } from '@/components/planner/PlannerDoctorSection';
import { TrustStatusSection } from '@/components/data-safety/TrustStatusSection';
import { SampleDataSection } from '@/components/data-safety/SampleDataSection';

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springTransition,
  },
};

export function HomeDashboard({
  objects,
  snapshots,
  onOpenObjects,
  onOpenTrip,
  onOpenAccounts,
}: {
  metrics: HomeMetrics;
  objects: WYQDObject[];
  snapshots: AccountSnapshot[];
  onOpenObjects: (focus: Omit<ObjectListFocus, 'token'>) => void;
  onOpenTrip?: (tripId: string) => void;
  onOpenAccounts?: () => void;
}) {
  const { t, currency } = useI18n();
  const financialObjects = objects.filter((object) => matchesCurrency(object, currency));
  const financialSnapshots = snapshots.filter((snapshot) => matchesCurrency(snapshot, currency));
  const scopedMetrics = { ...calculateHomeMetrics(financialObjects, financialSnapshots, currency), ownedPhysicalCount: objects.filter((object) => object.object_type === 'physical' && ['purchased', 'using'].includes(object.status)).length, activeSubscriptionCount: objects.filter((object) => object.object_type === 'recurring_cost' && object.status === 'active').length };
  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-5"
    >
      <p className="text-xs text-stone-500">{t('financialCurrencyScope').replace('{currency}', currency)}</p>
      <HomeOwnSection
        metrics={scopedMetrics}
        snapshots={financialSnapshots}
        itemVariants={itemVariants}
      />
      <HomeRepaymentSection
        snapshots={financialSnapshots}
        itemVariants={itemVariants}
        onOpenAccounts={onOpenAccounts}
      />
      <HomeCostSection
        metrics={scopedMetrics}
        objects={objects}
        snapshots={financialSnapshots}
        itemVariants={itemVariants}
        onOpenObjects={onOpenObjects}
      />
      <HomeReviewSection
        objects={objects}
        itemVariants={itemVariants}
      />
      <HomeDataScaleSection
        metrics={scopedMetrics}
        objects={objects}
        snapshots={snapshots}
        itemVariants={itemVariants}
      />
      <HomeDoctorSection itemVariants={itemVariants} />
      <PlannerDoctorSection itemVariants={itemVariants} onOpenTrip={onOpenTrip} />
      <TrustStatusSection itemVariants={itemVariants} />
      <SampleDataSection itemVariants={itemVariants} />
    </motion.section>
  );
}
