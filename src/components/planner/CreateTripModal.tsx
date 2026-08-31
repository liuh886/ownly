import React, { useState } from 'react';
import type { PlannerTravelMode, PlannerTrip } from '../../domain/planner';

interface CreateTripModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (trip: PlannerTrip) => Promise<void>;
  language?: 'zh' | 'en';
}

const COMMON_CURRENCIES = ['THB', 'JPY', 'CNY', 'USD', 'EUR', 'GBP', 'SGD', 'MYR', 'KRW', 'TWD', 'HKD', 'AUD'];

export function CreateTripModal({
  open,
  onClose,
  onCreate,
  language = 'zh',
}: CreateTripModalProps) {
  const zh = language === 'zh';
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [destinations, setDestinations] = useState('');
  const [currency, setCurrency] = useState('THB');
  const [transportMode, setTransportMode] = useState<PlannerTravelMode>('transit');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

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
      id: crypto.randomUUID(),
      title: cleanTitle,
      status: 'planning',
      start_date: startDate,
      end_date: endDate,
      destinations: destList.length > 0 ? destList : [cleanTitle],
      currency: currency.toUpperCase().trim() || 'THB',
      transport_mode: transportMode,
      tags: tagList,
      created_at: now,
      updated_at: now,
    };

    setBusy(true);
    setError(null);
    try {
      await onCreate(newTrip);
      onClose();
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
              {zh ? '创建新旅行行程' : 'Create New Trip'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error ? (
            <div className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
              ⚠️ {error}
            </div>
          ) : null}

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

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
            >
              {zh ? '取消' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-stone-950 px-5 py-2 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50 transition"
            >
              {busy ? (zh ? '创建中…' : 'Creating…') : (zh ? '确认创建行程' : 'Create Trip')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
