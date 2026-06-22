export function InsightCard({
  label,
  title,
  value,
  detail,
  onSelect,
}: {
  label: string;
  title: string;
  value: string;
  detail: string;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className="mt-2 min-h-10 text-sm font-semibold leading-snug text-stone-950">{title}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="font-mono text-lg font-semibold tracking-tight text-stone-950">{value}</span>
        <span className="text-right text-xs text-stone-500">{detail}</span>
      </div>
    </>
  );

  if (!onSelect) {
    return (
      <div className="wyqd-card-insight flex flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="wyqd-card-insight wyqd-card-insight--clickable flex flex-col rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:border-stone-300/70 hover:bg-stone-50/60"
    >
      {content}
    </button>
  );
}
