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
          : 'group min-w-0 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-premium hover:-translate-y-0.5'
      }
    >
      <div className="text-[11px] font-bold tracking-wider text-stone-400 uppercase">{label}</div>
      <div
        className={`mt-1.5 break-words font-black tracking-tighter text-stone-950 ${
          featured ? 'text-4xl' : 'text-2xl'
        }`}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-stone-500">
          <span className="inline-block h-1 w-1 rounded-full bg-stone-300" />
          {hint}
        </div>
      ) : null}
    </div>
  );
}
