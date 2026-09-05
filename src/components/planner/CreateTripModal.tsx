import React, { useMemo, useState } from 'react';
import type { PlannerTravelMode, PlannerTrip } from '../../domain/planner';
import {
  createShareableTripBundle,
  parseTripBundle,
  instantiateTripBundle,
  tripBundleFileName,
  type OwnlyTripBundle,
} from '../../domain/trip-bundle';
import { plannerRepository } from '../../services/PlannerRepository';

type TabMode = 'manage' | 'create' | 'import';

interface CreateTripModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (trip: PlannerTrip) => Promise<void>;
  onImported?: (tripId: string) => void;
  onDeleteTrip?: (tripId: string) => Promise<void>;
  trips?: PlannerTrip[];
  language?: 'zh' | 'en';
  disabled?: boolean;
}

const COMMON_CURRENCIES = ['THB', 'JPY', 'CNY', 'USD', 'EUR', 'GBP', 'SGD', 'MYR', 'KRW', 'TWD', 'HKD', 'AUD'];

export function CreateTripModal({
  open,
  onClose,
  onCreate,
  onImported,
  onDeleteTrip,
  trips = [],
  language = 'zh',
  disabled = false,
}: CreateTripModalProps) {
  const zh = language === 'zh';
  const [tab, setTab] = useState<TabMode>('manage');
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [editingTrip, setEditingTrip] = useState<PlannerTrip | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [destinations, setDestinations] = useState('');
  const [currency, setCurrency] = useState('THB');
  const [transportMode, setTransportMode] = useState<PlannerTravelMode>('transit');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import state
  const [rawImport, setRawImport] = useState('');
  const [importNotice, setImportNotice] = useState('');

  const importPreview = useMemo(() => {
    if (!rawImport.trim()) return { bundle: null as OwnlyTripBundle | null, error: '' };
    try {
      return { bundle: parseTripBundle(rawImport), error: '' };
    } catch (err) {
      return { bundle: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [rawImport]);

  const importSummary = useMemo(() => ({
    places: importPreview.bundle?.places.length ?? 0,
    visits: importPreview.bundle?.visits.length ?? 0,
    legs: importPreview.bundle?.legs.length ?? 0,
  }), [importPreview.bundle]);

  if (!open) return null;

  const resetForm = () => {
    setTitle('');
    setStartDate('');
    setEndDate('');
    setDestinations('');
    setCurrency('THB');
    setTransportMode('transit');
    setTags('');
    setError(null);
    setRawImport('');
    setImportNotice('');
    setEditingTrip(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const startEdit = (trip: PlannerTrip) => {
    setEditingTrip(trip);
    setTitle(trip.title);
    setStartDate(trip.start_date);
    setEndDate(trip.end_date);
    setDestinations(trip.destinations.join(', '));
    setCurrency(trip.currency ?? 'THB');
    setTransportMode(trip.transport_mode ?? 'transit');
    setTags((trip.tags ?? []).join(', '));
    setTab('create');
  };

  const handleExportTrip = async (trip: PlannerTrip) => {
    setActionBusy(trip.id);
    setError(null);
    try {
      const [allPlaces, allVisits, allLegs] = await Promise.all([
        plannerRepository.listPlaces(),
        plannerRepository.listVisits(),
        plannerRepository.listLegs(),
      ]);
      const bundle = createShareableTripBundle(trip, allPlaces, allVisits, allLegs);
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = tripBundleFileName(trip.title);
      a.click();
      URL.revokeObjectURL(url);
      setImportNotice(zh ? `已导出「${trip.title}」` : `Exported "${trip.title}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(null);
    }
  };

  const handleShareTrip = async (trip: PlannerTrip) => {
    setActionBusy(trip.id);
    setError(null);
    try {
      const [allPlaces, allVisits, allLegs] = await Promise.all([
        plannerRepository.listPlaces(),
        plannerRepository.listVisits(),
        plannerRepository.listLegs(),
      ]);
      const bundle = createShareableTripBundle(trip, allPlaces, allVisits, allLegs);
      const json = JSON.stringify(bundle);
      const b64 = typeof Buffer !== 'undefined' ? Buffer.from(json).toString('base64') : btoa(unescape(encodeURIComponent(json)));
      const token = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const url = `${window.location.origin}${window.location.pathname}#tripShare=${token}`;
      await navigator.clipboard.writeText(url);
      setImportNotice(zh ? `分享链接已复制「${trip.title}」` : `Share link copied for "${trip.title}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(zh ? '请输入行程名称。' : 'Please enter a trip title.');
      return;
    }
    if (!startDate || !endDate) {
      setError(zh ? '请选择出发和结束日期。' : 'Please select start and end dates.');
      return;
    }
    if (startDate > endDate) {
      setError(zh ? '结束日期不能早于出发日期。' : 'End date cannot be earlier than start date.');
      return;
    }

    const now = new Date().toISOString();
    const destList = destinations.split(/[,，、]/).map((d) => d.trim()).filter(Boolean);
    const tagList = tags.split(/[,，、]/).map((t) => t.trim()).filter(Boolean);

    const newTrip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: editingTrip?.id ?? crypto.randomUUID(),
      title: cleanTitle,
      status: editingTrip?.status ?? 'planning',
      start_date: startDate,
      end_date: endDate,
      destinations: destList.length > 0 ? destList : [cleanTitle],
      currency: currency.toUpperCase().trim() || 'THB',
      transport_mode: transportMode,
      tags: tagList,
      created_at: editingTrip?.created_at ?? now,
      updated_at: now,
    };

    setBusy(true);
    setError(null);
    try {
      await onCreate(newTrip);
      setEditingTrip(null);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setImportNotice('');
    setError(null);
    if (!importPreview.bundle) {
      setError(importPreview.error || (zh ? '请先粘贴有效的 Trip Bundle。' : 'Paste a valid Trip Bundle first.'));
      return;
    }
    if (disabled) {
      setError(zh ? '请先连接 Ownly 数据目录。' : 'Connect Ownly data folder first.');
      return;
    }
    setBusy(true);
    try {
      const bundle = importPreview.bundle;
      const copy = instantiateTripBundle(bundle);
      const report = await plannerRepository.importBundle(copy);
      if (report.failed.length > 0) {
        const failSummary = report.failed.map((f) => f.title).join(', ');
        setImportNotice(
          zh
            ? `⚠ 已导入「${copy.trip.title}」；${report.failed.length} 项失败：${failSummary}`
            : `⚠ Imported "${copy.trip.title}"; ${report.failed.length} failed: ${failSummary}`,
        );
      } else {
        onImported?.(copy.trip.id);
        setImportNotice(zh ? `✓ 已导入「${copy.trip.title}」；费用账本为空。` : `✓ Imported "${copy.trip.title}"; ledger is empty.`);
      }
      setRawImport('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">✈️</span>
            <h2 className="text-base font-bold text-stone-900">
              {zh ? '行程管理' : 'Manage Trips'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 border-b border-stone-100 bg-stone-50/70 p-1.5 mt-4 rounded-lg">
          <button
            type="button"
            onClick={() => { setTab('manage'); setError(null); setImportNotice(''); }}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
              tab === 'manage' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            📋 {zh ? '管理' : 'Manage'}
          </button>
          <button
            type="button"
            onClick={() => { setTab('create'); setError(null); setImportNotice(''); }}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
              tab === 'create' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            ✨ {zh ? '新建' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => { setTab('import'); setError(null); setImportNotice(''); }}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
              tab === 'import' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            📥 {zh ? '导入' : 'Import'}
          </button>
        </div>

        <div className="mt-4">
          {error ? (
            <div className="mb-3 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
              ⚠️ {error}
            </div>
          ) : null}

          {importNotice ? (
            <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 border border-emerald-200">
              {importNotice}
            </div>
          ) : null}

          {tab === 'manage' ? (
            <div className="space-y-3">
              {trips.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">
                  {zh ? '暂无行程，去新建一个吧' : 'No trips yet — create one'}
                </div>
              ) : (
                <ul className="max-h-80 space-y-2 overflow-auto pr-1">
                  {trips.map((trip) => (
                    <li key={trip.id} className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-stone-900">{trip.title}</div>
                        <div className="text-[11px] text-stone-500">{trip.start_date} → {trip.end_date} · {trip.destinations.join(', ')}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => startEdit(trip)} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50" title={zh ? '编辑' : 'Edit'}>✏️</button>
                        <button type="button" disabled={actionBusy === trip.id} onClick={() => void handleExportTrip(trip)} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50" title={zh ? '导出' : 'Export'}>📤</button>
                        <button type="button" disabled={actionBusy === trip.id} onClick={() => void handleShareTrip(trip)} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50" title={zh ? '分享' : 'Share'}>🔗</button>
                        <button
                          type="button"
                          disabled={deleteBusy === trip.id}
                          onClick={async () => {
                            const ok = window.confirm(zh ? `确定删除行程「${trip.title}」？该操作会同步删除其下的地点、日程与费用，且不可撤销。` : `Delete trip "${trip.title}"? This will also delete its places, visits and expenses.`);
                            if (!ok) return;
                            setError(null);
                            setDeleteBusy(trip.id);
                            try {
                              if (onDeleteTrip) await onDeleteTrip(trip.id);
                              else await plannerRepository.deleteTrip(trip.id);
                              setImportNotice(zh ? `已删除「${trip.title}」` : `Deleted "${trip.title}"`);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : String(err));
                            } finally {
                              setDeleteBusy(null);
                            }
                          }}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          title={zh ? '删除' : 'Delete'}
                        >
                          {deleteBusy === trip.id ? '…' : '🗑️'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end border-t border-stone-100 pt-3">
                <button type="button" onClick={handleClose} className="rounded-lg border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50">
                  {zh ? '关闭' : 'Close'}
                </button>
              </div>
            </div>
          ) : tab === 'create' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  {zh ? '行程名称 *' : 'Trip Title *'}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={zh ? '例如：Thailand 2026 曼谷普吉' : 'e.g. Thailand 2026'}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-950 focus:outline-hidden"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    {zh ? '出发日期 *' : 'Start Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:border-stone-950 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    {zh ? '结束日期 *' : 'End Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:border-stone-950 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Destinations */}
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  {zh ? '目的地城市 (逗号分隔)' : 'Destinations (comma-separated)'}
                </label>
                <input
                  type="text"
                  value={destinations}
                  onChange={(e) => setDestinations(e.target.value)}
                  placeholder={zh ? '例如：Bangkok, Chiang Mai, Pattaya' : 'e.g. Tokyo, Kyoto, Osaka'}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-950 focus:outline-hidden"
                />
              </div>

              {/* Currency & Transport Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    {zh ? '行程本币 (Currency)' : 'Base Currency'}
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:border-stone-950 focus:outline-hidden"
                  >
                    {COMMON_CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    {zh ? '主要出行方式' : 'Transport Mode'}
                  </label>
                  <select
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value as PlannerTravelMode)}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:border-stone-950 focus:outline-hidden"
                  >
                    <option value="transit">{zh ? '🚇 公共交通 / 打车' : '🚇 Transit'}</option>
                    <option value="driving">{zh ? '🚗 自驾租车' : '🚗 Driving'}</option>
                    <option value="motorcycle">{zh ? '🛵 摩托车 / 电瓶车' : '🛵 Motorcycle'}</option>
                    <option value="walking">{zh ? '🚶 步行慢游' : '🚶 Walking'}</option>
                    <option value="bicycling">{zh ? '🚲 骑行' : '🚲 Bicycling'}</option>
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  {zh ? '标签 (可选，逗号分隔)' : 'Tags (optional)'}
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder={zh ? '例如：度假, 美食打卡' : 'e.g. vacation, food'}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-950 focus:outline-hidden"
                />
              </div>

              {editingTrip ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">✏️ {zh ? `正在编辑「${editingTrip.title}」` : `Editing "${editingTrip.title}"`}</div>
              ) : null}
              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                {editingTrip ? (
                  <button type="button" onClick={() => { setEditingTrip(null); resetForm(); }} className="rounded-lg border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50">
                    {zh ? '取消编辑' : 'Cancel edit'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                  >
                    {zh ? '取消' : 'Cancel'}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-stone-950 px-5 py-2 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50 transition"
                >
                  {busy ? (zh ? '保存中…' : 'Saving…') : editingTrip ? (zh ? '保存修改' : 'Save changes') : (zh ? '确认创建行程' : 'Create Trip')}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Import Info */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] text-emerald-900">
                {zh
                  ? '粘贴 Trip Bundle JSON 数据导入现有行程。导入后会生成独立 ID，费用账本从空白开始。'
                  : 'Paste Trip Bundle JSON to import an existing trip. All IDs are regenerated with an empty ledger.'}
              </div>

              {/* Textarea */}
              <textarea
                value={rawImport}
                onChange={(e) => setRawImport(e.target.value)}
                placeholder={'{\n  "kind": "ownly.trip.bundle", ...\n}'}
                rows={8}
                className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-[10px] leading-4 text-stone-700 focus:border-stone-950 focus:outline-hidden"
              />

              {/* Preview */}
              {rawImport ? (
                importPreview.bundle ? (
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <div className="text-sm font-bold text-stone-900">{importPreview.bundle.trip.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                      <span className="rounded-full bg-stone-100 px-2 py-1">📍 {importSummary.places}</span>
                      <span className="rounded-full bg-stone-100 px-2 py-1">📅 {importSummary.visits}</span>
                      <span className="rounded-full bg-stone-100 px-2 py-1">🛣️ {importSummary.legs}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">💸 0</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                    ⚠️ {importPreview.error}
                  </div>
                )
              ) : null}

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  {zh ? '取消' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={busy || !importPreview.bundle || disabled}
                  onClick={() => void handleImport()}
                  className="rounded-lg bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50 transition"
                >
                  {busy
                    ? (zh ? '导入中…' : 'Importing…')
                    : disabled
                      ? (zh ? '请先连接数据目录' : 'Connect data folder')
                      : (zh ? '✓ 导入为我的行程' : '✓ Import as my trip')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
