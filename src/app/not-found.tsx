function getBasePath(): string {
  const configured = process.env.OWNLY_BASE_PATH?.trim() ?? '';
  if (!configured || configured === '/') return '';
  return `/${configured.replace(/^\/+|\/+$/g, '')}`;
}

const basePath = getBasePath();

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f1e9] px-5 text-stone-950">
      <section className="w-full max-w-2xl rounded-[2rem] border border-stone-900/10 bg-white/70 p-8 text-center shadow-[0_24px_80px_-48px_rgba(28,25,23,0.55)] sm:p-12">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-stone-950 text-lg font-semibold text-white">O</span>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">404 · Ownly</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">This record is not here.</h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-stone-600">
          The page may have moved. Return to the product page, or open the local-first Web app directly.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={`${basePath}/`} className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-800">
            Product page
          </a>
          <a href={`${basePath}/app/`} className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800 transition hover:border-stone-400">
            Open Ownly
          </a>
        </div>
      </section>
    </main>
  );
}
