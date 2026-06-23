import { useState, useCallback } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import type { WYQDDoctorReport } from '@/core/doctor';
import { runWYQDDoctor, autoRepairReviewRefs } from '@/core/doctor';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';

export function HomeDoctorSection({
  itemVariants,
}: {
  itemVariants: Variants;
}) {
  const { t } = useI18n();
  const { repository } = useOwnlyWorkspace();
  const [doctorReport, setDoctorReport] = useState<WYQDDoctorReport | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);

  const runDoctor = useCallback(async () => {
    setDoctorLoading(true);
    setRepairMessage(null);
    try {
      const report = await runWYQDDoctor(repository, undefined, t);
      setDoctorReport(report);
    } catch {
      setDoctorReport(null);
    } finally {
      setDoctorLoading(false);
    }
  }, [repository, t]);

  const hasRefWarnings =
    doctorReport?.findings.some(
      (f) => f.id === 'object.review_ref.mismatch' || f.id === 'object.review_ref.missing',
    ) ?? false;

  const runRepair = useCallback(async () => {
    setRepairLoading(true);
    setRepairMessage(null);
    try {
      const result = await autoRepairReviewRefs(repository as Parameters<typeof autoRepairReviewRefs>[0]);
      setRepairMessage(
        t('doctorRepairDone')
          .replace('{fixed}', String(result.fixedMismatches))
          .replace('{cleared}', String(result.clearedDangling)),
      );
      // Re-run doctor to refresh findings
      await runDoctor();
    } catch {
      setRepairMessage(null);
    } finally {
      setRepairLoading(false);
    }
  }, [repository, t, runDoctor]);

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>{t('doctor')}</h3>
        <div className="flex gap-2">
          {hasRefWarnings ? (
            <button
              type="button"
              onClick={() => void runRepair()}
              disabled={repairLoading || doctorLoading}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {repairLoading ? t('doctorRepairing') : t('doctorRepair')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void runDoctor()}
            disabled={doctorLoading || repairLoading}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {doctorLoading ? t('doctorRunning') : t('runDoctor')}
          </button>
        </div>
      </div>
      {doctorReport ? (
        <div className={CARD_CLASS}>
          <div className="flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${doctorReport.summary.error > 0 ? 'bg-red-500' : doctorReport.summary.warning > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <span className="text-sm font-medium text-stone-950">
              {doctorReport.summary.error === 0 && doctorReport.summary.warning === 0
                ? t('doctorPassed')
                : `${doctorReport.summary.error} ${t('errors')}, ${doctorReport.summary.warning} ${t('warnings')}, ${doctorReport.summary.info} ${t('info')}`}
            </span>
          </div>
          {repairMessage ? (
            <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {repairMessage}
            </div>
          ) : null}
          {doctorReport.findings.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {doctorReport.findings.map((finding, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${finding.severity === 'error' ? 'bg-red-500' : finding.severity === 'warning' ? 'bg-amber-500' : 'bg-stone-300'}`} />
                  <span className="text-stone-600">{finding.message}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </motion.section>
  );
}
