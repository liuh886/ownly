import { useState, useCallback } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useI18n } from '@/core/i18n-context';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import type { WYQDDoctorReport } from '@/core/doctor';
import { runWYQDDoctor } from '@/core/doctor';
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

  const runDoctor = useCallback(async () => {
    setDoctorLoading(true);
    try {
      const report = await runWYQDDoctor(repository, undefined, t);
      setDoctorReport(report);
    } catch {
      setDoctorReport(null);
    } finally {
      setDoctorLoading(false);
    }
  }, [repository, t]);

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>{t('doctor')}</h3>
        <button
          type="button"
          onClick={() => void runDoctor()}
          disabled={doctorLoading}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {doctorLoading ? t('doctorRunning') : t('runDoctor')}
        </button>
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
