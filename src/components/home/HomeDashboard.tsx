import { motion, type Variants } from 'framer-motion';
import type { AccountSnapshot, HomeMetrics, WYQDObject } from '@/domain/types';
import type { ObjectListFocus } from '@/components/objects/ObjectList';

import { HomeOwnSection } from './HomeOwnSection';
import { HomeCostSection } from './HomeCostSection';
import { HomeReviewSection } from './HomeReviewSection';
import { HomeDataScaleSection } from './HomeDataScaleSection';
import { HomeDoctorSection } from './HomeDoctorSection';

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
  metrics,
  objects,
  snapshots,
  onOpenObjects,
}: {
  metrics: HomeMetrics;
  objects: WYQDObject[];
  snapshots: AccountSnapshot[];
  onOpenObjects: (focus: Omit<ObjectListFocus, 'token'>) => void;
}) {
  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-5"
    >
      <HomeOwnSection
        metrics={metrics}
        snapshots={snapshots}
        itemVariants={itemVariants}
      />
      <HomeCostSection
        metrics={metrics}
        objects={objects}
        itemVariants={itemVariants}
        onOpenObjects={onOpenObjects}
      />
      <HomeReviewSection
        objects={objects}
        itemVariants={itemVariants}
      />
      <HomeDataScaleSection
        metrics={metrics}
        objects={objects}
        snapshots={snapshots}
        itemVariants={itemVariants}
      />
      <HomeDoctorSection itemVariants={itemVariants} />
    </motion.section>
  );
}
