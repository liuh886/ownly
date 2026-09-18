export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-5 dark:bg-stone-950">
      <div className="w-full max-w-md" role="status" aria-label="Loading Ownly">
        <div className="flex items-center gap-3">
          <div className="ownly-skeleton h-10 w-10 shrink-0 rounded-xl" aria-hidden="true" />
          <div className="flex-1 space-y-2">
            <div className="ownly-skeleton h-3 w-2/3 rounded-full" aria-hidden="true" />
            <div className="ownly-skeleton h-3 w-1/3 rounded-full" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="ownly-skeleton h-20 rounded-xl" aria-hidden="true" />
          <div className="ownly-skeleton h-20 rounded-xl" aria-hidden="true" />
          <div className="ownly-skeleton h-20 rounded-xl" aria-hidden="true" />
        </div>
        <p className="mt-4 text-center text-xs font-medium text-stone-500">Loading Ownly…</p>
      </div>
    </div>
  );
}
