import { useState, useCallback } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import type { WYQDDoctorReport } from '@/core/doctor';
import { runWYQDDoctor, inspectReviewRefRepairs, applyReviewRefRepairs, type RepairPlan } from '@/core/doctor';
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
  const [repairPlan, setRepairPlan] = useState<RepairPlan | null>(null);
  const [lastRepairResult, setLastRepairResult] = useState<string | null>(null);

  const runDoctor = useCallback(async () => {
    setDoctorLoading(true);
    setRepairPlan(null);
    setLastRepairResult(null);
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

  const previewRepairs = useCallback(async () => {
    setRepairLoading(true);
    try {
      const plan = await inspectReviewRefRepairs(repository as Parameters<typeof inspectReviewRefRepairs>[0]);
      setRepairPlan(plan);
    } catch {
      setRepairPlan(null);
    } finally {
      setRepairLoading(false);
    }
  }, [repository]);

  const cancelPreview = useCallback(() => {
    setRepairPlan(null);
  }, []);

  const applyRepairs = useCallback(async () => {
    if (!repairPlan) return;
    setRepairLoading(true);
    setRepairPlan(null);
    try {
      const result = await applyReviewRefRepairs(
        repository as Parameters<typeof applyReviewRefRepairs>[0],
        repairPlan,
      );
      setLastRepairResult(
        t('doctorRepairDone')
          .replace('{fixed}', String(result.fixedMismatches))
          .replace('{cleared}', String(result.clearedDangling)),
      );
      // Re-run doctor to refresh findings (but don't clear repair result)
      const report = await runWYQDDoctor(repository, undefined, t);
      setDoctorReport(report);
    } catch {
      setLastRepairResult(null);
    } finally {
      setRepairLoading(false);
    }
  }, [repository, t, repairPlan]);

  const totalRepairs = repairPlan ? repairPlan.mismatches.length + repairPlan.dangling.length : 0;

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>{t('doctor')}</h3>
        <div className="flex gap-2">
          {hasRefWarnings && !repairPlan ? (
            <button
              type="button"
              onClick={() => void previewRepairs()}
              disabled={repairLoading || doctorLoading}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {repairLoading ? t('doctorRepairing') : t('doctorRepairPreview')}
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
          {/* Durable repair result */}
          {lastRepairResult ? (
            <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {lastRepairResult}
            </div>
          ) : null}
          {/* Repair preview */}
          {repairPlan && totalRepairs > 0 ? (
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-3 text-xs space-y-1.5">
              <div className="font-medium text-amber-800">
                {t('doctorRepairChanges').replace('{count}', String(totalRepairs))}
              </div>
              {repairPlan.mismatches.map((item) => (
                <div key={item.objectId} className="text-amber-700">
                  {t('doctorRepairSync').replace('{title}', item.objectTitle)} ({item.fileName})
                </div>
              ))}
              {repairPlan.dangling.map((item) => (
                <div key={item.objectId} className="text-amber-700">
                  {t('doctorRepairClear').replace('{title}', item.objectTitle)} ({item.fileName})
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => void applyRepairs()}
                  disabled={repairLoading}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-40"
                >
                  {repairLoading ? t('doctorRepairing') : t('doctorRepairApply')}
                </button>
                <button
                  type="button"
                  onClick={cancelPreview}
                  disabled={repairLoading}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-40"
                >
                  {t('doctorRepairCancel')}
                </button>
              </div>
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
