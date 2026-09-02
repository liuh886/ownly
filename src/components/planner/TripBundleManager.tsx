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

function bundleSummary(bundle: OwnlyTripBundle | null): { places: number; visits: number; legs: number } {
  return {
    places: bundle?.places.length ?? 0,
    visits: bundle?.visits.length ?? 0,
    legs: bundle?.legs.length ?? 0,
  };
}

function destinationText(bundle: OwnlyTripBundle | null): string {
  return bundle?.trip.destinations?.filter(Boolean).join(' · ') || '';
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
      if (!extractTripSharePayload(window.location.hash)) {
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

  useEffect(() => {
    setShareUrl('');
  }, [selectedTripId]);

  const importPreview = useMemo(() => {
    if (!rawImport.trim()) return { bundle: null as OwnlyTripBundle | null, error: '' };
    try {
      return { bundle: parseTripBundle(rawImport), error: '' };
    } catch (err) {
      return { bundle: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [rawImport]);

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
    if (disabled) {
      throw new Error(zh ? '请先连接 Ownly 数据目录，再复制这个 Trip。' : 'Connect an Ownly data folder before copying this Trip.');
    }
    const copy = instantiateTripBundle(bundle);
    await plannerRepository.upsertTrip(copy.trip);
    await plannerRepository.upsertPlaces(copy.places);
    for (const visit of copy.visits) await plannerRepository.upsertVisit(visit);
    for (const leg of copy.legs) await plannerRepository.upsertLeg(leg);
    onImported?.(copy.trip.id);
    return copy;
  };

  const handleGenerateShareLink = async (openSystemShare = false) => {
    resetMessages();
    setBusy(true);
    try {
      const bundle = await buildSelectedBundle();
      const url = await buildTripShareUrl(bundle, window.location.href);
      setShareUrl(url);
      if (openSystemShare && navigator.share) {
        await navigator.share({
          title: bundle.trip.title,
          text: zh ? `我把「${bundle.trip.title}」的可编辑行程分享给你，点开可直接复制到 Ownly。` : `Editable Ownly trip: ${bundle.trip.title}`,
          url,
        });
        setNotice(zh ? '✓ 已打开系统分享。' : '✓ System share opened.');
      } else {
        await copyText(url);
        setNotice(zh ? '✓ Trip 分享链接已复制；对方点开后可预览并复制到自己的 Ownly。' : '✓ Trip share link copied.');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await copyText(shareUrl);
      setNotice(zh ? '✓ 分享链接已复制。' : '✓ Share link copied.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopyBundle = async () => {
    resetMessages();
    setBusy(true);
    try {
      const bundle = await buildSelectedBundle();
      await copyText(JSON.stringify(bundle, null, 2));
      setNotice(zh ? '✓ 已复制可导入 Trip Bundle；费用、付款和成员信息均未包含。' : '✓ Importable Trip Bundle copied. Ledger and member data are excluded.');
    } catch (err) {
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
      setNotice(zh ? '✓ 已下载 .ownly-trip.json。' : '✓ .ownly-trip.json downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File | null) => {
    resetMessages();
    if (!file) return;
    try {
      setRawImport(await file.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      const copy = await persistBundleCopy(importPreview.bundle);
      setNotice(
        zh
          ? `✓ 已导入「${copy.trip.title}」：${copy.places.length} 个地点、${copy.visits.length} 个日程访问；费用账本为空。`
          : `✓ Imported “${copy.trip.title}” with ${copy.places.length} places and ${copy.visits.length} visits. Ledger is empty.`,
      );
      setRawImport('');
      const nextTrips = await plannerRepository.listTrips();
      nextTrips.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
      setTrips(nextTrips);
      setSelectedTripId(copy.trip.id);
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
      setNotice(zh ? '✓ 已复制到你的 Ownly，可以继续编辑。' : '✓ Copied to your Ownly and ready to edit.');
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
  const incomingScheduledTitles = useMemo(() => {
    if (!incomingBundle) return [];
    const placeById = new Map(incomingBundle.places.map((place) => [place.id, place] as const));
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const visit of [...incomingBundle.visits].sort((a, b) => `${a.date}:${a.sort_order}`.localeCompare(`${b.date}:${b.sort_order}`))) {
      const place = placeById.get(visit.place_id);
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      titles.push(place.title);
      if (titles.length >= 6) break;
    }
    return titles;
  }, [incomingBundle]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { resetMessages(); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>🔗</span>
        <span>{zh ? '分享 / 导入 Trip' : 'Share / Import Trip'}</span>
      </button>

      {(incomingBundle || incomingError) ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
            <div className="border-b border-stone-100 bg-linear-to-br from-emerald-50 to-sky-50 px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">Ownly Shared Trip</div>
                  <h2 className="mt-1 text-xl font-extrabold text-stone-950">{incomingBundle?.trip.title || (zh ? 'Trip 分享链接' : 'Shared Trip')}</h2>
                  {incomingBundle ? (
                    <p className="mt-1 text-xs text-stone-600">
                      {incomingBundle.trip.start_date} → {incomingBundle.trip.end_date}
                      {destinationText(incomingBundle) ? ` · ${destinationText(incomingBundle)}` : ''}
                    </p>
                  ) : null}
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
                    <div className="rounded-xl bg-stone-50 p-2.5 text-center"><div className="text-lg font-black text-stone-900">{incomingSummary.places}</div><div className="text-[9px] text-stone-500">{zh ? '地点' : 'Places'}</div></div>
                    <div className="rounded-xl bg-stone-50 p-2.5 text-center"><div className="text-lg font-black text-stone-900">{incomingSummary.visits}</div><div className="text-[9px] text-stone-500">{zh ? '日程' : 'Visits'}</div></div>
                    <div className="rounded-xl bg-stone-50 p-2.5 text-center"><div className="text-lg font-black text-stone-900">{incomingSummary.legs}</div><div className="text-[9px] text-stone-500">{zh ? '路线段' : 'Routes'}</div></div>
                    <div className="rounded-xl bg-emerald-50 p-2.5 text-center"><div className="text-lg font-black text-emerald-800">0</div><div className="text-[9px] text-emerald-700">{zh ? '费用' : 'Expenses'}</div></div>
                  </div>

                  {incomingScheduledTitles.length > 0 ? (
                    <div>
                      <div className="text-[11px] font-bold text-stone-700">{zh ? '行程里已经安排了' : 'Already scheduled'}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {incomingScheduledTitles.map((title) => <span key={title} className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-medium text-stone-700">📍 {title}</span>)}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] leading-5 text-emerald-900">
                    <strong>{zh ? '这是一份可编辑副本，不是协作链接。' : 'This creates an editable copy, not a live collaboration link.'}</strong>{' '}
                    {zh ? '复制后所有 ID 会重新生成，你的修改不会影响分享者。费用、付款、同行成员和日历 token 均未包含。' : 'All IDs are regenerated. Expenses, payments, member names and calendar tokens are excluded.'}
                  </div>

                  <button
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => void handleCloneIncoming()}
                    className="w-full rounded-2xl bg-emerald-700 px-4 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-300"
                  >
                    {busy ? (zh ? '复制中…' : 'Copying…') : (disabled ? (zh ? '先连接 Ownly 数据目录' : 'Connect Ownly first') : (zh ? '✦ 复制到我的 Ownly' : '✦ Copy to my Ownly'))}
                  </button>
                  <p className="text-center text-[9.5px] leading-4 text-stone-400">
                    {zh ? '打开链接只会预览；只有点击上方按钮后，行程才会写入你的 Ownly。' : 'Opening the link is read-only. Data is written only after you explicitly copy the Trip.'}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-stone-900">{zh ? '🔗 Ownly Trip 分享与复制' : '🔗 Ownly Trip Sharing'}</h2>
                <p className="mt-0.5 text-[11px] text-stone-500">{zh ? '分享链接优先；Bundle 文件作为离线兜底。' : 'Share by link first; Bundle files remain the offline fallback.'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">✕</button>
            </div>

            <div className="grid grid-cols-2 border-b border-stone-100 bg-stone-50/70 p-1.5">
              <button type="button" onClick={() => { resetMessages(); setMode('share'); }} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === 'share' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}>{zh ? '📤 分享我的 Trip' : '📤 Share Trip'}</button>
              <button type="button" onClick={() => { resetMessages(); setMode('import'); }} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === 'import' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}>{zh ? '📥 导入别人 Trip' : '📥 Import Trip'}</button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto p-5">
              {notice ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{notice}</div> : null}
              {error ? <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">⚠️ {error}</div> : null}

              {mode === 'share' ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-stone-700">{zh ? '选择要分享的行程' : 'Choose a trip to share'}</label>
                    <select value={selectedTripId} onChange={(event) => setSelectedTripId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 outline-hidden focus:border-stone-900">
                      {trips.length === 0 ? <option value="">{zh ? '暂无行程' : 'No trips'}</option> : null}
                      {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title} · {trip.start_date} → {trip.end_date}</option>)}
                    </select>
                  </div>

                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                    <div className="text-xs font-bold text-sky-900">🛡️ {zh ? '分享时自动清理' : 'Automatically removed before sharing'}</div>
                    <div className="mt-1.5 grid gap-1 text-[11px] text-sky-800 sm:grid-cols-2">
                      <span>✓ {zh ? '全部费用 / 垫付 / 付款流水' : 'All expense and payment records'}</span><span>✓ {zh ? '同行成员名单' : 'Companion/member names'}</span><span>✓ {zh ? 'AA 清算结果' : 'AA settlement state'}</span><span>✓ {zh ? '日历订阅 token' : 'Calendar subscription token'}</span>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-sky-700/80">{zh ? '地点、候选池、日程、路线、标签和备注会保留。链接数据放在 URL fragment 中，不作为请求参数发送给站点服务器。' : 'Places, schedule, routes, tags and notes remain. The bundle lives in the URL fragment rather than a server request parameter.'}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={busy || !selectedTrip} onClick={() => void handleGenerateShareLink(false)} className="rounded-xl bg-stone-950 px-3 py-3 text-xs font-bold text-white transition hover:bg-stone-800 disabled:opacity-40">{busy ? '…' : (zh ? '🔗 生成并复制分享链接' : '🔗 Generate & copy link')}</button>
                    <button type="button" disabled={busy || !selectedTrip} onClick={() => void handleGenerateShareLink(true)} className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-40">{zh ? '📲 系统分享链接' : '📲 Share link'}</button>
                  </div>

                  {shareUrl ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-emerald-800">✓ {zh ? '分享链接已生成' : 'Share link ready'}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${shareUrl.length > 18000 ? 'bg-amber-100 text-amber-800' : 'bg-white text-stone-500'}`}>{Math.ceil(shareUrl.length / 1024)} KB</span></div>
                      <div className="mt-2 flex gap-2"><input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-mono text-[9px] text-stone-500"/><button type="button" onClick={() => void handleCopyShareUrl()} className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-[10px] font-bold text-white">{zh ? '复制链接' : 'Copy'}</button></div>
                      {shareUrl.length > 18000 ? <p className="mt-2 text-[9.5px] leading-4 text-amber-700">{zh ? '这个 Trip 内容较多，分享链接偏长；部分聊天应用可能截断超长链接，遇到这种情况请改发下面的 Bundle 文件。' : 'This Trip creates a long URL. Some chat apps may truncate it; use the Bundle file fallback if needed.'}</p> : null}
                    </div>
                  ) : null}

                  <details className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                    <summary className="cursor-pointer text-[11px] font-bold text-stone-600">{zh ? '更多分享方式 / 离线兜底' : 'More sharing options / offline fallback'}</summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy || !selectedTrip} onClick={() => void handleDownloadBundle()} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700">{zh ? '⬇️ 下载 Bundle' : '⬇️ Download Bundle'}</button><button type="button" disabled={busy || !selectedTrip} onClick={() => void handleCopyBundle()} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700">{zh ? '📋 复制 JSON' : '📋 Copy JSON'}</button></div>
                  </details>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] leading-5 text-emerald-900"><strong>{zh ? '分享链接是主入口；这里保留文件导入。' : 'Share links are the primary path; file import remains available.'}</strong>{' '}{zh ? '所有实体 ID 会重新生成，费用账本从空白开始。' : 'All entity IDs are regenerated and the ledger starts empty.'}</div>
                  <label className="block cursor-pointer rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-center transition hover:border-emerald-300 hover:bg-emerald-50/30"><span className="block text-xl">📁</span><span className="mt-1 block text-xs font-bold text-stone-700">{zh ? '选择 .ownly-trip.json 文件' : 'Choose .ownly-trip.json file'}</span><input type="file" accept=".json,.ownly-trip.json,application/json" className="hidden" onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)} /></label>
                  <div><div className="mb-1.5 flex items-center justify-between"><label className="text-xs font-bold text-stone-700">{zh ? '或粘贴 Trip Bundle JSON' : 'Or paste Trip Bundle JSON'}</label>{rawImport ? <button type="button" onClick={() => setRawImport('')} className="text-[10px] font-semibold text-stone-400 hover:text-stone-700">{zh ? '清空' : 'Clear'}</button> : null}</div><textarea value={rawImport} onChange={(event) => setRawImport(event.target.value)} placeholder={'{\n  "kind": "ownly.trip.bundle",\n  "version": 1, ...\n}'} rows={7} className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-[10px] leading-4 text-stone-700 outline-hidden focus:border-stone-900" /></div>
                  {rawImport ? (importPreview.bundle ? <div className="rounded-xl border border-stone-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-stone-900">{importPreview.bundle.trip.title}</div><div className="mt-0.5 text-[10px] text-stone-500">{importPreview.bundle.trip.start_date} → {importPreview.bundle.trip.end_date}</div></div><span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-800">✓ {zh ? 'Bundle 有效' : 'Valid bundle'}</span></div><div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-stone-600"><span className="rounded-full bg-stone-100 px-2 py-1">📍 {summary.places} {zh ? '地点' : 'places'}</span><span className="rounded-full bg-stone-100 px-2 py-1">📅 {summary.visits} {zh ? '日程访问' : 'visits'}</span><span className="rounded-full bg-stone-100 px-2 py-1">🛣️ {summary.legs} {zh ? '路线段' : 'legs'}</span><span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">💸 0 {zh ? '费用' : 'expenses'}</span></div></div> : <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">⚠️ {importPreview.error}</div>) : null}
                  <button type="button" disabled={busy || !importPreview.bundle || disabled} onClick={() => void handleImportBundle()} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-300">{busy ? (zh ? '导入中…' : 'Importing…') : (disabled ? (zh ? '先连接 Ownly 数据目录' : 'Connect Ownly first') : (zh ? '✓ 导入为我的可编辑 Trip' : '✓ Import as editable Trip'))}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
