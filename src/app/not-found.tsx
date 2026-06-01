import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center bg-stone-50 p-6 text-center">
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm max-w-md w-full space-y-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100">
          <svg className="h-6 w-6 text-stone-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Page not found</h2>
          <p className="mt-2 text-sm text-stone-500">
            The page or path you requested does not exist in the Ownly workspace.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
