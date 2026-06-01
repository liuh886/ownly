'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Ownly Web App Error:', error);
  }, [error]);

  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center bg-stone-50 p-6 text-center">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm max-w-md w-full space-y-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Something went wrong</h2>
          <p className="mt-2 text-sm text-stone-500">
            An unexpected error occurred while loading the workspace. This may be due to a local data parsing issue or a browser environment problem.
          </p>
        </div>
        <button
          onClick={() => reset()}
          className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
