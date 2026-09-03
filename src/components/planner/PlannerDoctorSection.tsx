import { useCallback, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { CARD_CLASS, SECTION_TITLE_CLASS } from '@/lib/ui-constants';
import { checkPlannerIntegrity, type PlannerIntegrityReport } from '@/domain/planner-integrity';
import { plannerRepository } from '@/services/PlannerRepository';

export function PlannerDoctorSection({ itemVariants }: { itemVariants?: Variants }) {
  const [report, setReport] = useState<PlannerIntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setLastResult(null);
    try {
      const [trips, places, visits] = await Promise.all([
        plannerRepository.listTrips(),
        plannerRepository.listPlaces(),
        plannerRepository.listVisits(),
      ]);
      const r = checkPlannerIntegrity({ trips, places, visits });
      setReport(r);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyFix = useCallback(async () => {
    if (!report?.fixable.length) return;
    setRepairing(true);
    try {
      const result = await plannerRepository.reconstructOrphanPlaces();
      setLastResult(`已修复 ${result.reconstructed.length} 个孤儿 Visit，失败 ${result.failed.length} 个`);
      await runCheck();
    } catch {
      setLastResult(null);
    } finally {
      setRepairing(false);
    }
  }, [report, runCheck]);

  const hasFixable = (report?.fixable.length ?? 0) > 0;

  return (
    <motion.section variants={itemVariants}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className={SECTION_TITLE_CLASS}>数据健康 · Planner</h3>
        <div className="flex gap-2">
          {hasFixable ? (
            <button
              type="button"
              onClick={() => void applyFix()}
              disabled={repairing || loading}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {repairing ? '修复中...' : `自动修复 (${report!.fixable.length})`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={loading || repairing}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? '检查中...' : '运行检查'}
          </button>
        </div>
      </div>
      {report ? (
        <div className={CARD_CLASS}>
          <div className="flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${report.summary.errors > 0 ? 'bg-red-500' : report.summary.warnings > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <span className="text-sm font-medium text-stone-950">
              {report.summary.errors === 0 && report.summary.warnings === 0
                ? `✓ ${report.summary.places} places · ${report.summary.visits} visits · 0 异常`
                : `${report.summary.errors} 错误 · ${report.summary.warnings} 警告 · ${report.summary.infos} 提示 · ${report.summary.places} places`}
            </span>
          </div>
          {lastResult ? <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{lastResult}</div> : null}
          {report.issues.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {report.issues.slice(0, 20).map((iss, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${iss.severity === 'error' ? 'bg-red-500' : iss.severity === 'warning' ? 'bg-amber-500' : 'bg-stone-300'}`} />
                  <span className="text-stone-600">[{iss.category}] {iss.message}</span>
                </div>
              ))}
              {report.issues.length > 20 ? <div className="text-xs text-stone-400">…还有 {report.issues.length - 20} 项</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </motion.section>
  );
}
