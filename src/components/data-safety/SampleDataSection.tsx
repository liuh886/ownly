'use client';

/**
 * "Remove all example data" control.
 *
 * Placed in the Trust center rather than next to the loader, because the loader
 * lives in two one-shot onboarding surfaces (the first-run guide and the
 * Planner empty state) that both disappear once real content exists — a user who
 * loaded the example set and then closed the guide had no way back to it. This
 * section is always reachable and only renders when `sample`-tagged records are
 * actually present, so it costs nothing for users who never loaded any.
 *
 * The section is inert without a connected folder: the example set only ever
 * reaches disk through the opt-in connected path, and scanning a detached
 * in-memory store would report a demo session's worth of records as if they
 * were the user's own.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { useI18n } from '@/core/i18n-context';
import { getWYQDRuntimeCapabilities } from '@/core/runtime-capabilities';
import {
  formatSampleBreakdown,
  formatSampleCleared,
  getSampleDataCopy,
} from '@/core/sample-data-copy';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import { trackOwnlyEvent } from '@/lib/analytics';
import {
  clearSampleData,
  findSampleData,
  type SampleDataInventory,
} from '@/services/sampleDataInventory';

export function SampleDataSection({ itemVariants }: { itemVariants: Variants }) {
  const { language } = useI18n();
  const copy = getSampleDataCopy(language);
  const { runtimeTarget, isConnected, showNotice } = useOwnlyWorkspace();
  const isBrowserRuntime = getWYQDRuntimeCapabilities(runtimeTarget).dataRuntime === 'browser';

  const [inventory, setInventory] = useState<SampleDataInventory | null>(null);
  const [clearing, setClearing] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const scan = useCallback(async () => {
    if (!isConnected) {
      setInventory(null);
      return;
    }
    try {
      setInventory(await findSampleData());
    } catch {
      setInventory(null);
    }
  }, [isConnected]);

  // Deferred past mount to satisfy set-state-in-effect, matching the trust
  // status rows above. Re-scan when a folder connects and when another
  // data-safety action reports a change, so the count cannot go stale.
  useEffect(() => {
    const timer = window.setTimeout(() => void scan(), 0);
    return () => window.clearTimeout(timer);
  }, [scan]);

  useEffect(() => {
    const refresh = () => void scan();
    window.addEventListener('ownly:data-changed', refresh);
    return () => window.removeEventListener('ownly:data-changed', refresh);
  }, [scan]);

  const handleClear = useCallback(async () => {
    const confirmed = await confirm({
      title: copy.confirmTitle,
      message: copy.confirmMessage,
      confirmLabel: copy.confirmLabel,
      cancelLabel: copy.cancelLabel,
      destructive: true,
    });
    if (!confirmed) return;

    setClearing(true);
    try {
      const cleared = await clearSampleData();
      trackOwnlyEvent('sample_data_cleared', {
        objects: cleared.objects,
        snapshots: cleared.snapshots,
        reviews: cleared.reviews,
        trips: cleared.trips,
      });
      showNotice(cleared.total === 0 ? copy.clearedNone : formatSampleCleared(copy, cleared));
      await scan();
    } catch {
      showNotice(copy.error);
    } finally {
      setClearing(false);
    }
  }, [confirm, copy, scan, showNotice]);

  if (!isBrowserRuntime || !isConnected) return null;
  if (!inventory || inventory.total === 0) return null;

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 px-1">
        <h3 className={SECTION_TITLE_CLASS}>{copy.title}</h3>
      </div>

      <div className={CARD_CLASS}>
        <p className="text-xs leading-5 text-stone-600">{copy.lede}</p>
        <p className="mt-2 text-xs font-semibold text-stone-800">
          {formatSampleBreakdown(copy, inventory)}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-stone-500">{copy.demoNote}</p>

        <button
          type="button"
          onClick={() => void handleClear()}
          disabled={clearing}
          className="mt-3 min-h-10 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {clearing ? copy.clearing : copy.cta}
        </button>
      </div>

      {dialog}
    </motion.section>
  );
}
