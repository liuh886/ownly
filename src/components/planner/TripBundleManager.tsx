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
      setNotice(zh ? '✓ 已下载 .ownly-trip.json，可直接发给其他 Ownly 用户。' : '✓ .ownly-trip.json downloaded and ready to share.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleNativeShare = async () => {
    resetMessages();
    setBusy(true);
    try {
      const bundle = await buildSelectedBundle();
      const json = JSON.stringify(bundle, null, 2);
      const file = new File([json], tripBundleFileName(bundle.trip.title), { type: 'application/json' });
      const shareData: ShareData = {
        title: bundle.trip.title,
        text: zh ? 'Ownly 可编辑旅行行程' : 'Editable Ownly Trip',
        files: [file],
      };
      if (!navigator.share || (navigator.canShare && !navigator.canShare(shareData))) {
        downloadTextFile(json, file.name);
        setNotice(zh ? '当前浏览器不支持系统分享，已改为下载 Trip Bundle。' : 'System share is unavailable; downloaded the Trip Bundle instead.');
        return;
      }
      await navigator.share(shareData);
      setNotice(zh ? '✓ 已打开系统分享。' : '✓ System share opened.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File | null) => {
    resetMessages();
    if (!file) return;
    try {
      const text = await file.text();
      setRawImport(text);
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
      const copy = instantiateTripBundle(importPreview.bundle);
      await plannerRepository.upsertTrip(copy.trip);
      await plannerRepository.upsertPlaces(copy.places);
      for (const visit of copy.visits) await plannerRepository.upsertVisit(visit);
      for (const leg of copy.legs) await plannerRepository.upsertLeg(leg);

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
      onImported?.(copy.trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const summary = bundleSummary(importPreview.bundle);

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

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-stone-900">{zh ? '🔗 Ownly Trip 分享与复制' : '🔗 Ownly Trip Sharing'}</h2>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  {zh ? '把完整旅行规划复制给另一位用户，并保持可编辑。' : 'Clone a complete editable trip into another Ownly workspace.'}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">✕</button>
            </div>

            <div className="grid grid-cols-2 border-b border-stone-100 bg-stone-50/70 p-1.5">
              <button
                type="button"
                onClick={() => { resetMessages(); setMode('share'); }}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === 'share' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}
              >
                {zh ? '📤 分享我的 Trip' : '📤 Share Trip'}
              </button>
              <button
                type="button"
                onClick={() => { resetMessages(); setMode('import'); }}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === 'import' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}
              >
                {zh ? '📥 导入别人 Trip' : '📥 Import Trip'}
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto p-5">
              {notice ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{notice}</div> : null}
              {error ? <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">⚠️ {error}</div> : null}

              {mode === 'share' ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-stone-700">{zh ? '选择要分享的行程' : 'Choose a trip to share'}</label>
                    <select
                      value={selectedTripId}
                      onChange={(event) => setSelectedTripId(event.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 outline-hidden focus:border-stone-900"
                    >
                      {trips.length === 0 ? <option value="">{zh ? '暂无行程' : 'No trips'}</option> : null}
                      {trips.map((trip) => (
                        <option key={trip.id} value={trip.id}>{trip.title} · {trip.start_date} → {trip.end_date}</option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                    <div className="text-xs font-bold text-sky-900">🛡️ {zh ? '分享时自动清理' : 'Automatically removed before sharing'}</div>
                    <div className="mt-1.5 grid gap-1 text-[11px] text-sky-800 sm:grid-cols-2">
                      <span>✓ {zh ? '全部费用 / 垫付 / 付款流水' : 'All expense and payment records'}</span>
                      <span>✓ {zh ? '同行成员名单' : 'Companion/member names'}</span>
                      <span>✓ {zh ? 'AA 清算结果' : 'AA settlement state'}</span>
                      <span>✓ {zh ? '日历订阅 token' : 'Calendar subscription token'}</span>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-sky-700/80">
                      {zh ? '地点、候选池、日程、路线、标签和备注会保留。请注意：地点备注属于 Trip 内容，如果其中写了私人信息，请分享前自行检查。' : 'Places, research pool, schedule, routes, tags and notes are preserved. Review free-text notes for private information before sharing.'}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <button type="button" disabled={busy || !selectedTrip} onClick={() => void handleNativeShare()} className="rounded-xl bg-stone-950 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-stone-800 disabled:opacity-40">
                      {busy ? '…' : (zh ? '📲 系统分享' : '📲 Share')}
                    </button>
                    <button type="button" disabled={busy || !selectedTrip} onClick={() => void handleDownloadBundle()} className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-40">
                      {zh ? '⬇️ 下载 Bundle' : '⬇️ Download'}
                    </button>
                    <button type="button" disabled={busy || !selectedTrip} onClick={() => void handleCopyBundle()} className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-40">
                      {zh ? '📋 复制 JSON' : '📋 Copy JSON'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] leading-5 text-emerald-900">
                    <strong>{zh ? '导入后会创建一份独立副本。' : 'Import creates an independent copy.'}</strong>{' '}
                    {zh ? '所有 Trip / Place / Visit / Leg ID 都会重新生成，因此你可以在自己的 Ownly 中任意编辑，不会和分享者的数据发生关联。费用账本从空白开始。' : 'All entity IDs are regenerated, so the imported trip can be edited independently. The expense ledger starts empty.'}
                  </div>

                  <label className="block cursor-pointer rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-center transition hover:border-emerald-300 hover:bg-emerald-50/30">
                    <span className="block text-xl">📁</span>
                    <span className="mt-1 block text-xs font-bold text-stone-700">{zh ? '选择 .ownly-trip.json 文件' : 'Choose .ownly-trip.json file'}</span>
                    <input type="file" accept=".json,.ownly-trip.json,application/json" className="hidden" onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)} />
                  </label>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-bold text-stone-700">{zh ? '或粘贴 Trip Bundle JSON' : 'Or paste Trip Bundle JSON'}</label>
                      {rawImport ? <button type="button" onClick={() => setRawImport('')} className="text-[10px] font-semibold text-stone-400 hover:text-stone-700">{zh ? '清空' : 'Clear'}</button> : null}
                    </div>
                    <textarea
                      value={rawImport}
                      onChange={(event) => setRawImport(event.target.value)}
                      placeholder={'{\n  "kind": "ownly.trip.bundle",\n  "version": 1, ...\n}'}
                      rows={7}
                      className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-[10px] leading-4 text-stone-700 outline-hidden focus:border-stone-900"
                    />
                  </div>

                  {rawImport ? (
                    importPreview.bundle ? (
                      <div className="rounded-xl border border-stone-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-stone-900">{importPreview.bundle.trip.title}</div>
                            <div className="mt-0.5 text-[10px] text-stone-500">{importPreview.bundle.trip.start_date} → {importPreview.bundle.trip.end_date}</div>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-800">✓ {zh ? 'Bundle 有效' : 'Valid bundle'}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-stone-600">
                          <span className="rounded-full bg-stone-100 px-2 py-1">📍 {summary.places} {zh ? '地点' : 'places'}</span>
                          <span className="rounded-full bg-stone-100 px-2 py-1">📅 {summary.visits} {zh ? '日程访问' : 'visits'}</span>
                          <span className="rounded-full bg-stone-100 px-2 py-1">🛣️ {summary.legs} {zh ? '路线段' : 'legs'}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">💸 0 {zh ? '费用' : 'expenses'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">⚠️ {importPreview.error}</div>
                    )
                  ) : null}

                  <button
                    type="button"
                    disabled={busy || !importPreview.bundle}
                    onClick={() => void handleImportBundle()}
                    className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-300"
                  >
                    {busy ? (zh ? '导入中…' : 'Importing…') : (zh ? '✓ 导入为我的可编辑 Trip' : '✓ Import as editable Trip')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
