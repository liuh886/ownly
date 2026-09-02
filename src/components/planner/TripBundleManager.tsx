'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/core/i18n-context';
import type { PlannerTrip } from '@/domain/planner';
import {
  createShareableTripBundle,
  instantiateTripBundle,
  parseTripBundle,
  tripBundleFileName,
  type OwnlyTripBundle,
} from '@/domain/trip-bundle';
import {
  buildTripShareUrl,
  clearTripShareHash,
  extractTripSharePayload,
  parseTripShareHash,
} from '@/domain/trip-share-link';
import { plannerRepository } from '@/services/PlannerRepository';

interface TripBundleManagerProps {
  disabled?: boolean;
  onImported?: (tripId: string) => void;
}

type PanelMode = 'share' | 'import';

function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyText(content: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = content;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

function bundleSummary(bundle: OwnlyTripBundle | null) {
  return {
    places: bundle?.places.length ?? 0,
    visits: bundle?.visits.length ?? 0,
    legs: bundle?.legs.length ?? 0,
  };
}

export function TripBundleManager({ disabled = false, onImported }: TripBundleManagerProps) {
  const { language } = useI18n();
  const zh = language === 'zh';
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PanelMode>('share');
  const [trips, setTrips] = useState<PlannerTrip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [rawImport, setRawImport] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [incomingBundle, setIncomingBundle] = useState<OwnlyTripBundle | null>(null);
  const [incomingError, setIncomingError] = useState('');

  useEffect(() => {
    const syncIncomingShare = () => {
      const payload = extractTripSharePayload(window.location.hash);
      if (!payload) {
        setIncomingBundle(null);
        setIncomingError('');
        return;
      }
      void parseTripShareHash(window.location.hash)
        .then((bundle) => {
          setIncomingBundle(bundle);
          setIncomingError('');
        })
        .catch((err) => {
          setIncomingBundle(null);
          setIncomingError(err instanceof Error ? err.message : String(err));
        });
    };
    syncIncomingShare();
    window.addEventListener('hashchange', syncIncomingShare);
    return () => window.removeEventListener('hashchange', syncIncomingShare);
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      try {
        await plannerRepository.initialize();
        const nextTrips = await plannerRepository.listTrips();
        nextTrips.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
        if (!active) return;
        setTrips(nextTrips);
        setSelectedTripId((current) => current || nextTrips[0]?.id || '');
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { active = false; };
  }, [open]);

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  );

  const importPreview = useMemo(() => {
    if (!rawImport.trim()) return { bundle: null as OwnlyTripBundle | null, error: '' };
    try {
      return { bundle: parseTripBundle(rawImport), error: '' };
    } catch (err) {
      return { bundle: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [rawImport]);

  const incomingScheduledTitles = useMemo(() => {
    if (!incomingBundle) return [];
    const placeById = new Map(incomingBundle.places.map((place) => [place.id, place] as const));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const visit of [...incomingBundle.visits].sort((a, b) => `${a.date}:${a.sort_order}`.localeCompare(`${b.date}:${b.sort_order}`))) {
      const place = placeById.get(visit.place_id);
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      result.push(place.title);
      if (result.length >= 6) break;
    }
    return result;
  }, [incomingBundle]);

  const resetMessages = () => {
    setNotice('');
    setError('');
  };

  const buildSelectedBundle = async (): Promise<OwnlyTripBundle> => {
    if (!selectedTrip) throw new Error(zh ? '请先选择一个行程。' : 'Select a trip first.');
    const [places, visits, legs] = await Promise.all([
      plannerRepository.listPlaces(),
      plannerRepository.listVisits(),
      plannerRepository.listLegs(),
    ]);
    return createShareableTripBundle(selectedTrip, places, visits, legs);
  };

  const persistBundleCopy = async (bundle: OwnlyTripBundle) => {
    if (disabled) throw new Error(zh ? '请先连接 Ownly 数据目录，再复制这个 Trip。' : 'Connect Ownly before copying this Trip.');
    const copy = instantiateTripBundle(bundle);
    const report = await plannerRepository.importBundle(copy);
    onImported?.(copy.trip.id);
    return { copy, report };
  };

  const handleGenerateShareLink = async (nativeShare: boolean) => {
    resetMessages();
    setBusy(true);
    try {
      const bundle = await buildSelectedBundle();
      const url = await buildTripShareUrl(bundle, window.location.href);
      setShareUrl(url);
      if (nativeShare && navigator.share) {
        await navigator.share({
          title: bundle.trip.title,
          text: zh ? `我把「${bundle.trip.title}」的可编辑行程分享给你，点开可直接复制到 Ownly。` : `Editable Ownly trip: ${bundle.trip.title}`,
          url,
        });
        setNotice(zh ? '✓ 已打开系统分享。' : '✓ System share opened.');
      } else {
        await copyText(url);
        setNotice(zh ? '✓ Trip 分享链接已复制。' : '✓ Trip share link copied.');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadBundle = async () => {
    resetMessages();
    setBusy(true);
    try {
      const bundle = await buildSelectedBundle();
      downloadTextFile(JSON.stringify(bundle, null, 2), tripBundleFileName(bundle.trip.title));
      setNotice(zh ? '✓ 已下载 .ownly-trip.json。' : '✓ Bundle downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyBundle = async () => {
    resetMessages();
    setBusy(true);
    try {
      const bundle = await buildSelectedBundle();
      await copyText(JSON.stringify(bundle, null, 2));
      setNotice(zh ? '✓ Trip Bundle JSON 已复制。' : '✓ Trip Bundle JSON copied.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImportBundle = async () => {
    resetMessages();
    if (!importPreview.bundle) {
      setError(importPreview.error || (zh ? '请先粘贴或上传有效的 Trip Bundle。' : 'Paste or upload a valid Trip Bundle first.'));
      return;
    }
    setBusy(true);
    try {
      const { copy, report } = await persistBundleCopy(importPreview.bundle);
      if (report.failed.length > 0) {
        const failSummary = report.failed.map((f) => f.title).join(', ');
        setNotice(zh ? `⚠ 已导入「${copy.trip.title}」；${report.failed.length} 项失败：${failSummary}` : `⚠ Imported "${copy.trip.title}"; ${report.failed.length} failed: ${failSummary}`);
      } else {
        setNotice(zh ? `✓ 已导入「${copy.trip.title}」；费用账本为空。` : `✓ Imported "${copy.trip.title}"; ledger is empty.`);
      }
      setRawImport('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCloneIncoming = async () => {
    if (!incomingBundle) return;
    setIncomingError('');
    setBusy(true);
    try {
      await persistBundleCopy(incomingBundle);
      clearTripShareHash();
      setIncomingBundle(null);
    } catch (err) {
      setIncomingError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const closeIncoming = () => {
    clearTripShareHash();
    setIncomingBundle(null);
    setIncomingError('');
  };

  const summary = bundleSummary(importPreview.bundle);
  const incomingSummary = bundleSummary(incomingBundle);
  const destinations = incomingBundle?.trip.destinations?.filter(Boolean).join(' · ') || '';

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { resetMessages(); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🔗 {zh ? '分享 / 导入 Trip' : 'Share / Import Trip'}
      </button>

      {(incomingBundle || incomingError) ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
            <div className="border-b border-stone-100 bg-linear-to-br from-emerald-50 to-sky-50 px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">Ownly Shared Trip</div>
                  <h2 className="mt-1 text-xl font-extrabold text-stone-950">{incomingBundle?.trip.title || (zh ? 'Trip 分享链接' : 'Shared Trip')}</h2>
                  {incomingBundle ? <p className="mt-1 text-xs text-stone-600">{incomingBundle.trip.start_date} → {incomingBundle.trip.end_date}{destinations ? ` · ${destinations}` : ''}</p> : null}
                </div>
                <button type="button" onClick={closeIncoming} className="rounded-full bg-white/80 p-2 text-stone-500 shadow-xs hover:bg-white">✕</button>
              </div>
            </div>
            <div className="max-h-[72vh] overflow-y-auto p-5">
              {incomingError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">⚠️ {incomingError}</div>
              ) : incomingBundle ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2">
                    {[['📍', incomingSummary.places, zh ? '地点' : 'Places'], ['📅', incomingSummary.visits, zh ? '日程' : 'Visits'], ['🛣️', incomingSummary.legs, zh ? '路线' : 'Routes'], ['💸', 0, zh ? '费用' : 'Expenses']].map(([icon, value, label]) => (
                      <div key={String(label)} className="rounded-xl bg-stone-50 p-2.5 text-center"><div className="text-lg font-black text-stone-900">{icon} {value}</div><div className="text-[9px] text-stone-500">{label}</div></div>
                    ))}
                  </div>
                  {incomingScheduledTitles.length > 0 ? <div><div className="text-[11px] font-bold text-stone-700">{zh ? '已经安排的部分地点' : 'Some scheduled stops'}</div><div className="mt-2 flex flex-wrap gap-1.5">{incomingScheduledTitles.map((title) => <span key={title} className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-medium text-stone-700">📍 {title}</span>)}</div></div> : null}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] leading-5 text-emerald-900"><strong>{zh ? '这是一份可编辑副本，不是实时协作。' : 'This creates an editable copy, not live collaboration.'}</strong>{' '}{zh ? '复制后所有 ID 都会重新生成；费用、付款、同行成员和日历 token 均未包含。' : 'All IDs are regenerated. Expenses, payments, member names and calendar tokens are excluded.'}</div>
                  <button type="button" disabled={busy || disabled} onClick={() => void handleCloneIncoming()} className="w-full rounded-2xl bg-emerald-700 px-4 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-300">{busy ? (zh ? '复制中…' : 'Copying…') : disabled ? (zh ? '先连接 Ownly 数据目录' : 'Connect Ownly first') : (zh ? '✦ 复制到我的 Ownly' : '✦ Copy to my Ownly')}</button>
                  <p className="text-center text-[9.5px] text-stone-400">{zh ? '打开链接只会预览；点击上方按钮后才写入你的 Ownly。' : 'Opening the link is read-only; nothing is written until you copy it.'}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4"><div><h2 className="text-base font-bold text-stone-900">🔗 {zh ? 'Ownly Trip 分享与复制' : 'Ownly Trip Sharing'}</h2><p className="mt-0.5 text-[11px] text-stone-500">{zh ? '分享链接优先；Bundle 文件作为离线兜底。' : 'Share by link first; Bundle files are the offline fallback.'}</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">✕</button></div>
            <div className="grid grid-cols-2 border-b border-stone-100 bg-stone-50/70 p-1.5"><button type="button" onClick={() => { resetMessages(); setMode('share'); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'share' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}`}>{zh ? '📤 分享我的 Trip' : '📤 Share Trip'}</button><button type="button" onClick={() => { resetMessages(); setMode('import'); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'import' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}`}>{zh ? '📥 导入 Trip' : '📥 Import Trip'}</button></div>
            <div className="max-h-[72vh] overflow-y-auto p-5">
              {notice ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{notice}</div> : null}
              {error ? <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">⚠️ {error}</div> : null}
              {mode === 'share' ? (
                <div className="space-y-4">
                  <div><label className="text-xs font-bold text-stone-700">{zh ? '选择要分享的行程' : 'Choose a trip'}</label><select value={selectedTripId} onChange={(event) => { setSelectedTripId(event.target.value); setShareUrl(''); }} className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900">{trips.length === 0 ? <option value="">{zh ? '暂无行程' : 'No trips'}</option> : null}{trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title} · {trip.start_date} → {trip.end_date}</option>)}</select></div>
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3"><div className="text-xs font-bold text-sky-900">🛡️ {zh ? '自动排除私人账本信息' : 'Private ledger data is excluded'}</div><p className="mt-1.5 text-[10px] leading-4 text-sky-700">{zh ? '费用、付款、AA、同行成员和日历 token 不会进入分享内容；地点、日程、路线、标签和备注会保留。链接数据位于 URL fragment。' : 'Expenses, payments, member names and calendar tokens are excluded. Places, schedule, routes, tags and notes remain in the URL fragment.'}</p></div>
                  <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy || !selectedTrip} onClick={() => void handleGenerateShareLink(false)} className="rounded-xl bg-stone-950 px-3 py-3 text-xs font-bold text-white disabled:opacity-40">{busy ? '…' : (zh ? '🔗 生成并复制分享链接' : '🔗 Generate & copy link')}</button><button type="button" disabled={busy || !selectedTrip} onClick={() => void handleGenerateShareLink(true)} className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-xs font-bold text-stone-700 disabled:opacity-40">{zh ? '📲 系统分享链接' : '📲 Share link'}</button></div>
                  {shareUrl ? <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-emerald-800">✓ {zh ? '链接已生成' : 'Link ready'}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${shareUrl.length > 18000 ? 'bg-amber-100 text-amber-800' : 'bg-white text-stone-500'}`}>{Math.ceil(shareUrl.length / 1024)} KB</span></div><div className="mt-2 flex gap-2"><input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-mono text-[9px] text-stone-500"/><button type="button" onClick={() => void copyText(shareUrl)} className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-[10px] font-bold text-white">{zh ? '复制' : 'Copy'}</button></div>{shareUrl.length > 18000 ? <p className="mt-2 text-[9.5px] text-amber-700">{zh ? '链接较长，部分聊天应用可能截断；遇到这种情况请使用 Bundle 文件。' : 'Some chat apps may truncate this long URL; use the Bundle file fallback.'}</p> : null}</div> : null}
                  <details className="rounded-xl border border-stone-200 bg-stone-50/60 p-3"><summary className="cursor-pointer text-[11px] font-bold text-stone-600">{zh ? '更多方式 / 离线兜底' : 'More / offline fallback'}</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy || !selectedTrip} onClick={() => void handleDownloadBundle()} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700">{zh ? '⬇️ 下载 Bundle' : '⬇️ Download Bundle'}</button><button type="button" disabled={busy || !selectedTrip} onClick={() => void handleCopyBundle()} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700">{zh ? '📋 复制 JSON' : '📋 Copy JSON'}</button></div></details>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] text-emerald-900">{zh ? '链接是主入口；这里保留 Bundle 文件/JSON 导入。导入后会生成独立 ID，费用账本从空白开始。' : 'Links are the primary flow. Bundle file/JSON import remains available and creates independent IDs with an empty ledger.'}</div>
                  <label className="block cursor-pointer rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-center"><span className="block text-xl">📁</span><span className="mt-1 block text-xs font-bold text-stone-700">{zh ? '选择 .ownly-trip.json 文件' : 'Choose .ownly-trip.json file'}</span><input type="file" accept=".json,.ownly-trip.json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setRawImport).catch((err) => setError(String(err))); }} /></label>
                  <textarea value={rawImport} onChange={(event) => setRawImport(event.target.value)} placeholder={'{\n  "kind": "ownly.trip.bundle", ...\n}'} rows={7} className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-[10px] leading-4 text-stone-700" />
                  {rawImport ? importPreview.bundle ? <div className="rounded-xl border border-stone-200 bg-white p-3"><div className="text-sm font-bold text-stone-900">{importPreview.bundle.trip.title}</div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px]"><span className="rounded-full bg-stone-100 px-2 py-1">📍 {summary.places}</span><span className="rounded-full bg-stone-100 px-2 py-1">📅 {summary.visits}</span><span className="rounded-full bg-stone-100 px-2 py-1">🛣️ {summary.legs}</span><span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">💸 0</span></div></div> : <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">⚠️ {importPreview.error}</div> : null}
                  <button type="button" disabled={busy || !importPreview.bundle || disabled} onClick={() => void handleImportBundle()} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-xs font-bold text-white disabled:bg-stone-300">{busy ? (zh ? '导入中…' : 'Importing…') : disabled ? (zh ? '先连接 Ownly 数据目录' : 'Connect Ownly first') : (zh ? '✓ 导入为我的可编辑 Trip' : '✓ Import as editable Trip')}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
