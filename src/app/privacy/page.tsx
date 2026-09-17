import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Ownly — Privacy Policy',
  description:
    'Ownly is a local-first personal ledger. This policy covers on-device storage, extension permissions, third parties, and user rights.',
  robots: {
    index: true,
    follow: true,
  },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-stone-950">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-stone-600">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8" style={{ colorScheme: 'light' }}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-stone-400">Ownly</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">Privacy Policy</h1>
      <dl className="mt-4 grid gap-1 text-xs text-stone-500 sm:grid-cols-2">
        <div><dt className="inline font-medium text-stone-700">Effective date: </dt><dd className="inline">2026-09-17</dd></div>
        <div><dt className="inline font-medium text-stone-700">Policy version: </dt><dd className="inline">2026-09-17 (covers Ownly Capture 1.0.0)</dd></div>
        <div><dt className="inline font-medium text-stone-700">Contact / support: </dt><dd className="inline"><a className="underline hover:text-stone-900" href="https://github.com/liuh886/ownly/issues">github.com/liuh886/ownly/issues</a></dd></div>
        <div><dt className="inline font-medium text-stone-700">Source: </dt><dd className="inline"><a className="underline hover:text-stone-900" href="https://github.com/liuh886/ownly/blob/main/PRIVACY.md">PRIVACY.md</a></dd></div>
      </dl>

      <Section title="Local-first storage">
        <p>
          Ownly stores your data as plain Markdown in an <strong>Ownly data folder</strong> you
          select (<code>Ownly/Objects</code>, <code>Accounts</code>, <code>Snapshots</code>,{' '}
          <code>Reviews</code>, <code>Logs</code>, <code>Archive</code>). Ownly hosts no personal
          ledger data and requires no Ownly cloud account or sync service.
        </p>
        <p>
          If you point your folder at a provider you control (Dropbox, Google Drive, OneDrive,
          iCloud Drive), that provider syncs the files under its own policy. Ownly never touches
          those providers&apos; APIs or credentials. In the browser, folder access uses the File
          System Access API, only for reading and writing your Ownly Markdown files.
        </p>
      </Section>

      <Section title="Network">
        <p>
          The core app never sends ledger data to an Ownly server. Hosted analytics events must not
          contain Markdown contents, filenames, paths, amounts, form values, reviews, snapshots, or
          tool results.
        </p>
      </Section>

      <Section title="Ownly Capture (browser extension)">
        <p>
          Ownly Capture is a Chromium MV3 side panel for collecting your own travel research.
          English is the store default; switching language in-panel never changes the data model.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Local queue</strong> (<code>ownlyCaptureStateV3</code> in <code>chrome.storage.local</code>): pending handoff only — collections, places, active collection id, settings. Only the background worker writes it.</li>
          <li><strong>Google Maps enrichment</strong>: on your one-click request, resolves the captured place to public facts (Place ID, coordinates, rating, hours, address). Your ledger is never uploaded.</li>
          <li><strong>Reference FX</strong> (<code>open.er-api.com</code>): display-only conversion using USD-pivot rates. Raw price text is never rewritten; no ledger data is sent with rate requests.</li>
          <li><strong>Export</strong>: Markdown/JSON download or clipboard copy is an explicit on-device action. Nothing is uploaded; no account needed.</li>
        </ul>
      </Section>

      <Section title="Extension permissions">
        <ul className="list-disc space-y-2 pl-5">
          <li><code>sidePanel</code> — open the Capture panel from the toolbar action.</li>
          <li><code>storage</code> — persist the queue and language on-device.</li>
          <li><code>scripting</code> — run place extraction on supported travel hosts and the FX tooltip.</li>
          <li><code>activeTab</code> — read the active tab URL/title once per capture or currency re-detect.</li>
          <li><code>tabs</code> — find an open Maps tab for context and reuse an open Planner tab for handoff. Page contents are never read via this permission.</li>
        </ul>
        <p>
          The selection FX tooltip matches all pages so conversion works on any merchant page, but
          it is <strong>off by default</strong> (opt-in toggle), converts locally for display only,
          and never exfiltrates page content.
        </p>
      </Section>

      <Section title="Third parties and retention">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Google Maps</strong> (regional domains): place lookup for the captured place; governed by Google&apos;s policy. Ownly keeps only facts you save.</li>
          <li><strong>open.er-api.com</strong>: rate-table request with no ledger content (no amounts, names, notes, identifiers); cached on-device.</li>
          <li><strong>Your own sync provider</strong> (if any): your Markdown files, synced by its client under its policy.</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>
          No sale of personal data, no ads. Access everything (plain Markdown + in-panel queue),
          delete it (in-panel delete, clear extension storage, or uninstall), and withdraw consent
          anytime (FX toggle off, or remove the extension). Planner Markdown stays in your folder
          until you archive or delete it there.
        </p>
      </Section>
    </main>
  );
}
