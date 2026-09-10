import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlannerTravelMode, PlannerTrip } from '../../domain/planner';
import { applyTripFormPatch, listTripDates } from '../../domain/planner';
import {
  createShareableTripBundle,
  parseTripBundle,
  instantiateTripBundle,
  tripBundleFileName,
  type OwnlyTripBundle,
} from '../../domain/trip-bundle';
import {
  buildTripShareUrl,
  clearTripShareHash,
  OWNLY_TRIP_SHARE_HASH_KEY,
  parseTripShareHash,
} from '../../domain/trip-share-link';
import { plannerRepository } from '../../services/PlannerRepository';
import { COMMON_TIMEZONES } from '../../domain/calendar-feed';

/**
 * Chat apps truncate very long URLs. Above this length a share link is likely
 * to arrive broken, so we refuse to copy it and point at file export instead.
 */
export const TRIP_SHARE_URL_LENGTH_LIMIT = 8000;

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
  /** Raw `#ownly-trip=` payload from the location hash; decoded into the import tab. */
  incomingShareHash?: string | null;
  onDismissShare?: () => void;
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
  incomingShareHash = null,
  onDismissShare,
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
  const [timezone, setTimezone] = useState('');
  const [dayTimezones, setDayTimezones] = useState<Record<string, string>>({});
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import state
  const [rawImport, setRawImport] = useState('');
  const [importNotice, setImportNotice] = useState('');
  const [sharedBundle, setSharedBundle] = useState<OwnlyTripBundle | null>(null);
  const [sharedError, setSharedError] = useState('');
  const decodedShareHashRef = useRef<string | null>(null);

  // A share link in the URL pre-fills the import tab. Decoded once per hash;
  // a decoded bundle takes precedence over the pasted textarea below.
  useEffect(() => {
    if (!open || !incomingShareHash || decodedShareHashRef.current === incomingShareHash) return;
    decodedShareHashRef.current = incomingShareHash;
    setTab('import');
    setSharedError('');
    void parseTripShareHash(`#${OWNLY_TRIP_SHARE_HASH_KEY}=${incomingShareHash}`)
      .then((bundle) => {
        if (bundle) setSharedBundle(bundle);
        else setSharedError(zh ? '分享链接中没有行程数据。' : 'The share link carries no trip data.');
      })
      .catch((err) => {
        setSharedError(err instanceof Error ? err.message : String(err));
      });
  }, [open, incomingShareHash, zh]);

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
    setTimezone('');
    setDayTimezones({});
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
    setTimezone(trip.timezone ?? '');
    setDayTimezones({ ...(trip.day_timezones ?? {}) });
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
      const url = await buildTripShareUrl(bundle, window.location.href);
      if (url.length > TRIP_SHARE_URL_LENGTH_LIMIT) {
        setError(zh
          ? `「${trip.title}」内容较多，分享链接过长（${(url.length / 1024).toFixed(1)}KB），在聊天软件中容易被截断。请改用 📤 导出文件分享，对方在导入页粘贴即可。`
          : `"${trip.title}" is too large for a share link (${(url.length / 1024).toFixed(1)}KB) and may be truncated in chat apps. Export the file instead.`);
        return;
      }
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

    // NB: applyTripFormPatch merges over editingTrip so fields the form does not
    // own (members, fx_rates, calendar_feed, …) survive an edit — the repo upsert
    // replaces the whole trip file.
    const newTrip: PlannerTrip = applyTripFormPatch(editingTrip, {
      title: cleanTitle,
      start_date: startDate,
      end_date: endDate,
      destinations: destList.length > 0 ? destList : [cleanTitle],
      currency: currency.toUpperCase().trim() || 'THB',
      transport_mode: transportMode,
      tags: tagList,
      timezone: timezone.trim() || undefined,
      day_timezones: dayTimezones,
    }, now);

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

  const dismissShare = () => {
    setSharedBundle(null);
    setSharedError('');
    decodedShareHashRef.current = null;
    clearTripShareHash();
    onDismissShare?.();
  };

  const handleImport = async () => {
    setImportNotice('');
    setError(null);
    // A decoded share link takes precedence over the pasted textarea.
    const bundle = sharedBundle ?? importPreview.bundle;
    if (!bundle) {
      setError(importPreview.error || sharedError || (zh ? '请先粘贴有效的 Trip Bundle。' : 'Paste a valid Trip Bundle first.'));
      return;
    }
    if (disabled) {
      setError(zh ? '请先连接 Ownly 数据目录。' : 'Connect Ownly data folder first.');
      return;
    }
    setBusy(true);
    try {
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
      if (sharedBundle) dismissShare();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs">
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
                  {zh ? '目的地时区 (日历导出用)' : 'Destination Timezone (for calendar export)'}
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 focus:border-stone-950 focus:outline-hidden"
                >
                  <option value="">{zh ? '不设置（机票逻辑：时刻即当地时间）' : 'Unset (ticket logic: times are local)'}</option>
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-stone-500">
                  {zh
                    ? '就像机票：起飞写北京 08:00、落地写曼谷 12:00，各用各的当地时间。手机切到哪个时区，就按哪个时区读这个数字。设了时区则按 UTC 绝对时刻发射。'
                    : 'Like a flight ticket: 08:00 departure in Beijing, 12:00 arrival in Bangkok — each in its local time. Set a zone to export absolute UTC instants instead.'}
                </div>
              </div>

              {startDate && endDate && startDate <= endDate ? (
                <details className="rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-bold text-stone-700">
                    {zh ? '🌍 按天时区覆盖（跨国行程）' : '🌍 Per-day timezone overrides'}
                  </summary>
                  <div className="mt-1 text-[11px] text-stone-500">
                    {zh
                      ? '哪天换城市就改哪天，不改的天跟随上面的行程时区。'
                      : 'Override only the days you change cities; the rest follow the trip zone.'}
                  </div>
                  <div className="mt-2 max-h-48 space-y-1.5 overflow-auto pr-1">
                    {listTripDates(startDate, endDate).map((d) => (
                      <div key={d} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-[11px] font-semibold text-stone-600">{d}</span>
                        <select
                          value={dayTimezones[d] ?? ''}
                          onChange={(e) => setDayTimezones((prev) => {
                            const next = { ...prev };
                            if (e.target.value) next[d] = e.target.value;
                            else delete next[d];
                            return next;
                          })}
                          className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:border-stone-950 focus:outline-hidden"
                        >
                          <option value="">{zh ? '跟随行程时区' : 'Follow trip zone'}</option>
                          {COMMON_TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>{tz}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

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

              {/* Shared link card */}
              {sharedBundle ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-stone-900">🔗 {sharedBundle.trip.title}</div>
                    <button
                      type="button"
                      onClick={dismissShare}
                      className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-stone-400 hover:bg-sky-100 hover:text-stone-600"
                    >
                      {zh ? '忽略链接' : 'Dismiss'}
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] text-sky-900">
                    {zh ? '来自分享链接，可直接导入为你的行程。' : 'Shared via link; import it as your own trip.'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    <span className="rounded-full bg-white px-2 py-1">📍 {sharedBundle.places.length}</span>
                    <span className="rounded-full bg-white px-2 py-1">📅 {sharedBundle.visits.length}</span>
                    <span className="rounded-full bg-white px-2 py-1">🛣️ {sharedBundle.legs.length}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">💸 0</span>
                  </div>
                </div>
              ) : null}
              {sharedError && !sharedBundle ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  ⚠️ {sharedError}
                </div>
              ) : null}

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
                  disabled={busy || (!sharedBundle && !importPreview.bundle) || disabled}
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
