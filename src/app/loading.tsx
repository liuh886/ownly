export default function Loading() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-stone-50">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative flex h-12 w-12 items-center justify-center">
          <div className="absolute h-full w-full animate-ping rounded-full bg-stone-200 opacity-75"></div>
          <div className="relative h-8 w-8 rounded-full bg-stone-900"></div>
        </div>
        <div className="text-sm font-medium text-stone-500 animate-pulse">Loading Ownly…</div>
      </div>
    </div>
  );
}
