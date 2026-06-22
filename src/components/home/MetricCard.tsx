import { MUTED_TEXT_CLASS } from '@/lib/ui-constants';

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  featured?: boolean;
}

export function MetricCard({ label, value, hint, featured }: MetricCardProps) {
  return (
    <div
      className={
        featured
          ? 'py-2'
          : 'group min-w-0 rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-all duration-200 hover:border-stone-300'
      }
    >
      <div className={MUTED_TEXT_CLASS}>{label}</div>
      <div
        className={`mt-1 break-words font-mono font-semibold tracking-tight text-stone-950 ${
          featured ? 'text-2xl' : 'text-xl'
        }`}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
          <span className="inline-block h-1 w-1 rounded-full bg-stone-300" />
          {hint}
        </div>
      ) : null}
    </div>
  );
}
