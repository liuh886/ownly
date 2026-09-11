'use client';

import { useEffect, useRef, useState } from 'react';
import { formatPlacePriceInTripCurrency, PLANNER_KIND_ICONS, PLANNER_KIND_LABELS, type PlannerPlaceKind, type PlannerTripPlace } from '@/domain/planner';
import { formatDistanceBadge, getDisplayTags, placeMeta } from './planner-home-shared';
import { useEscapeKey } from './use-escape-key';
import type { PlannerControllerReturn } from './usePlannerController';

const KIND_OPTIONS: PlannerPlaceKind[] = [
  'attraction',
  'food',
  'cafe',
  'experience',
  'shopping',
  'stay',
  'transit',
  'service',
  'other',
];

export interface ResearchPoolSectionProps {
  zh: PlannerControllerReturn['zh'];
  language: PlannerControllerReturn['language'];
  sortedPendingCandidates: PlannerControllerReturn['sortedPendingCandidates'];
  pendingCandidates: PlannerControllerReturn['pendingCandidates'];
  droppedPlaces: PlannerControllerReturn['droppedPlaces'];
  activeFilter: PlannerControllerReturn['activeFilter'];
  setActiveFilter: PlannerControllerReturn['setActiveFilter'];
  filterChips: PlannerControllerReturn['filterChips'];
  poolSearch: PlannerControllerReturn['poolSearch'];
  setPoolSearch: PlannerControllerReturn['setPoolSearch'];
  candidateSortMode: PlannerControllerReturn['candidateSortMode'];
  setCandidateSortMode: PlannerControllerReturn['setCandidateSortMode'];
  lastStopCoords: PlannerControllerReturn['lastStopCoords'];
  lastScheduledStop: PlannerControllerReturn['lastScheduledStop'];
  capturePending: PlannerControllerReturn['capturePending'];
  busy: PlannerControllerReturn['busy'];
  syncCapture: PlannerControllerReturn['syncCapture'];
  candidateHotels: PlannerControllerReturn['candidateHotels'];
  visibleSuspectedPairs: PlannerControllerReturn['visibleSuspectedPairs'];
  isMultiSelectMode: PlannerControllerReturn['isMultiSelectMode'];
  setIsMultiSelectMode: PlannerControllerReturn['setIsMultiSelectMode'];
  selectedCandidateIds: PlannerControllerReturn['selectedCandidateIds'];
  setSelectedCandidateIds: PlannerControllerReturn['setSelectedCandidateIds'];
  isBatchOperating: PlannerControllerReturn['isBatchOperating'];
  handleDeduplicatePlaces: PlannerControllerReturn['handleDeduplicatePlaces'];
  handleSelectAllCandidates: PlannerControllerReturn['handleSelectAllCandidates'];
  handleDeselectAllCandidates: PlannerControllerReturn['handleDeselectAllCandidates'];
  handleBatchMergeCandidates: PlannerControllerReturn['handleBatchMergeCandidates'];
  handleBatchScheduleCandidates: PlannerControllerReturn['handleBatchScheduleCandidates'];
  handleBatchShelveCandidates: PlannerControllerReturn['handleBatchShelveCandidates'];
  handleBatchDeleteCandidates: PlannerControllerReturn['handleBatchDeleteCandidates'];
  toggleSelectCandidate: PlannerControllerReturn['toggleSelectCandidate'];
  candidateDistances: PlannerControllerReturn['candidateDistances'];
  visitCountByPlaceId: PlannerControllerReturn['visitCountByPlaceId'];
  selectedTrip: PlannerControllerReturn['selectedTrip'];
  schedulePlace: PlannerControllerReturn['schedulePlace'];
  handleDropPlace: PlannerControllerReturn['handleDropPlace'];
  handleDeletePlace: PlannerControllerReturn['handleDeletePlace'];
  handleRestorePlace: PlannerControllerReturn['handleRestorePlace'];
  handleChangePlaceKind: PlannerControllerReturn['handleChangePlaceKind'];
  handleUpdatePlaceFields: PlannerControllerReturn['handleUpdatePlaceFields'];
  highlightedPlaceId: string | null;
  setHighlightedPlaceId: (value: string | null) => void;
  setDraggingPlaceId: (value: string | null) => void;
  setGuideOpen: (open: boolean) => void;
  setIsImportModalOpen: (open: boolean) => void;
  setIsHotelModalOpen: (open: boolean) => void;
  setIsSuspectedModalOpen: (open: boolean) => void;
  disabled: boolean;
  className?: string;
}

/**
 * Inline edit zone for one pool card (edit mode only). Three compact rows —
 * kind, price, note — sharing one dashed box so the card barely grows.
 * Price/note keep local drafts and commit on blur / Enter; drafts resync
 * when the underlying place changes unless the field is being typed in.
 */
function PoolPlaceEditZone({
  place,
  zh,
  onKindChange,
  onSaveFields,
}: {
  place: PlannerTripPlace;
  zh: boolean;
  onKindChange: (kind: PlannerPlaceKind) => void;
  onSaveFields: (patch: { observed_price?: string; why?: string }) => void;
}) {
  const [priceDraft, setPriceDraft] = useState(place.observed_price ?? '');
  const [noteDraft, setNoteDraft] = useState(place.why ?? '');
  const priceRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (document.activeElement === priceRef.current) return;
    setPriceDraft(place.observed_price ?? '');
  }, [place.id, place.observed_price]);
  useEffect(() => {
    if (document.activeElement === noteRef.current) return;
    setNoteDraft(place.why ?? '');
  }, [place.id, place.why]);
  return (
    <div
      className="mt-2 space-y-1.5 rounded-lg border border-dashed border-sky-300 bg-sky-50/60 px-2 py-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
        <span className="shrink-0 font-semibold">🏷️ {zh ? '分类' : 'Kind'}</span>
        <select
          value={place.kind}
          onChange={(e) => onKindChange(e.target.value as PlannerPlaceKind)}
          className="min-w-0 flex-1 cursor-pointer rounded-md border border-sky-200 bg-white px-1 py-0.5 text-[11px] font-semibold text-stone-800"
          title={zh ? '纠正分类（后续抓取不会覆盖）' : 'Correct kind (future captures keep it)'}
        >
          {KIND_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {PLANNER_KIND_ICONS[kind]} {zh ? PLANNER_KIND_LABELS[kind].zh : PLANNER_KIND_LABELS[kind].en}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
        <span className="shrink-0 font-semibold">💰 {zh ? '价格' : 'Price'}</span>
        <input
          ref={priceRef}
          value={priceDraft}
          onChange={(e) => setPriceDraft(e.target.value)}
          onBlur={() => onSaveFields({ observed_price: priceDraft })}
          onKeyDown={(e) => { if (e.key === 'Enter') priceRef.current?.blur(); }}
          placeholder={zh ? '如 350 / ฿350' : 'e.g. 350'}
          className="min-w-0 flex-1 rounded-md border border-sky-200 bg-white px-1 py-0.5 text-[11px] text-stone-800 placeholder:text-stone-400"
        />
      </label>
      <label className="flex items-start gap-1.5 text-[11px] text-stone-600">
        <span className="shrink-0 pt-0.5 font-semibold">💡 {zh ? '备注' : 'Note'}</span>
        <textarea
          ref={noteRef}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => onSaveFields({ why: noteDraft })}
          rows={2}
          placeholder={zh ? '为什么值得去…' : 'Why go…'}
          className="min-w-0 flex-1 resize-none rounded-md border border-sky-200 bg-white px-1 py-0.5 text-[11px] leading-5 text-stone-800 placeholder:text-stone-400"
        />
      </label>
    </div>
  );
}

export function ResearchPoolSection(props: ResearchPoolSectionProps) {
  const {
    zh,
    language,
    sortedPendingCandidates,
    pendingCandidates,
    droppedPlaces,
    activeFilter,
    setActiveFilter,
    filterChips,
    poolSearch,
    setPoolSearch,
    candidateSortMode,
    setCandidateSortMode,
    lastStopCoords,
    lastScheduledStop,
    capturePending,
    busy,
    syncCapture,
    candidateHotels,
    visibleSuspectedPairs,
    isMultiSelectMode,
    setIsMultiSelectMode,
    selectedCandidateIds,
    setSelectedCandidateIds,
    isBatchOperating,
    handleDeduplicatePlaces,
    handleSelectAllCandidates,
    handleDeselectAllCandidates,
    handleBatchMergeCandidates,
    handleBatchScheduleCandidates,
    handleBatchShelveCandidates,
    handleBatchDeleteCandidates,
    toggleSelectCandidate,
    candidateDistances,
    visitCountByPlaceId,
    selectedTrip,
    schedulePlace,
    handleDropPlace,
    handleDeletePlace,
    handleRestorePlace,
    handleChangePlaceKind,
    handleUpdatePlaceFields,
    highlightedPlaceId,
    setHighlightedPlaceId,
    setDraggingPlaceId,
    setGuideOpen,
    setIsImportModalOpen,
    setIsHotelModalOpen,
    setIsSuspectedModalOpen,
    disabled,
    className = 'mt-4 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm flex flex-col transition-all',
  } = props;
  const [tidyMenuOpen, setTidyMenuOpen] = useState(false);
  useEscapeKey(tidyMenuOpen, () => setTidyMenuOpen(false));
  // Edit mode (entered from 整理): cards expose an inline edit zone
  // (kind + price + note) for quick corrections without opening anything.
  const [isEditMode, setIsEditMode] = useState(false);
  return (
    <>
    {/* Horizontal Full-Width Candidate Research Pool below Day Skeleton and Map Workspace */}
    <section
      id="research-pool-section"
      className={className}
    >
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/90 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🗂️</span>
            <h2 className="text-sm font-semibold text-stone-900">{zh ? '行程候选池' : 'Research Pool'}</h2>
            <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-xs font-bold text-stone-700">
              {sortedPendingCandidates.length}/{activeFilter === 'dropped' ? droppedPlaces.length : pendingCandidates.length}
            </span>
            {droppedPlaces.length > 0 ? (
              <span className="rounded-full bg-stone-200/60 px-2 py-0.5 text-xs font-semibold text-stone-600" title={zh ? '暂不考虑地点数' : 'Shelved places count'}>
                {zh ? '暂不考虑' : 'Shelved'} {droppedPlaces.length}
              </span>
            ) : null}
          </div>
          <p className="hidden lg:block text-xs text-stone-400">
            {zh ? '所有候选地点，可直接排入当天或拖拽至日程（排入后仍保留在池中）' : 'All candidates. Schedule to day or drag. Places stay in pool after scheduling.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {/* Inline Search */}
          <div className="relative">
            <input
              type="text"
              value={poolSearch}
              onChange={(e) => setPoolSearch(e.target.value)}
              placeholder={zh ? '🔍 搜索候选地点、区域或标签...' : '🔍 Search candidates, areas, tags...'}
              className="w-44 sm:w-60 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-hidden"
            />
            {poolSearch ? (
              <button
                type="button"
                onClick={() => setPoolSearch('')}
                className="absolute right-2 top-1.5 text-xs text-stone-400 hover:text-stone-700"
              >
                ✕
              </button>
            ) : null}
          </div>

          {/* Candidate Pool Sort Selector */}
          <select
            value={candidateSortMode}
            onChange={(e) => setCandidateSortMode(e.target.value as 'default' | 'distance' | 'must' | 'rating')}
            aria-label={zh ? '候选池排序' : 'Sort candidates'}
            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 focus:border-stone-400 focus:outline-hidden shadow-2xs"
          >
            <option value="default">{zh ? '⚡ 默认排序' : '⚡ Default'}</option>
            <option value="distance" disabled={!lastStopCoords}>
              {zh
                ? (lastScheduledStop ? `📍 距上一站最近 (${lastScheduledStop.title.slice(0, 7)})` : '📍 距上一站最近')
                : (lastScheduledStop ? `📍 Closest to last stop (${lastScheduledStop.title.slice(0, 7)})` : '📍 Closest to last stop')}
            </option>
            <option value="must">{zh ? '🎯 优先必去 (Must)' : '🎯 Priority (Must)'}</option>
            <option value="rating">{zh ? '⭐ 评分最高 (Rating)' : '⭐ Highest Rating'}</option>
          </select>

          {/* Capture Sync */}
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-0.5 shadow-2xs">
            {capturePending !== null && capturePending > 0 ? (
              <span className="px-1.5 text-[10px] font-bold text-amber-700">{capturePending}</span>
            ) : null}
            <button
              type="button"
              onClick={() => capturePending === null ? setGuideOpen(true) : void syncCapture()}
              disabled={busy}
              className="rounded-md px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100 transition disabled:opacity-50"
              title={capturePending === null ? (zh ? '未检测到扩展' : 'Extension offline') : (zh ? '同步 Capture 候选' : 'Sync Capture candidates')}
            >
              {capturePending === null ? (zh ? '🔌 扩展' : '🔌 Ext') : (zh ? '🔄 同步' : '🔄 Sync')}
            </button>
          </div>

          {/* Import */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-stone-700 shadow-2xs transition hover:bg-stone-50 hover:text-stone-900"
            title={zh ? '从剪贴板、链接、KML、CSV 或 JSON 导入候选' : 'Import candidates from clipboard, links, KML, CSV, or JSON'}
          >
            <span>📥</span>
            <span>{zh ? '导入' : 'Import'}</span>
          </button>

          {/* Multi-dimensional Hotel Compare */}
          {candidateHotels.length > 0 ? (
            <button
              type="button"
              onClick={() => setIsHotelModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 shadow-2xs hover:bg-amber-100 transition"
            >
              <span>🏨</span>
              <span>{zh ? `住宿比选 (${candidateHotels.length})` : `Compare Stays (${candidateHotels.length})`}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Category & Tag Filter Chips Bar */}
          {filterChips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-100 bg-stone-50/50 px-4 py-2">
              {filterChips.map((f) => {
                const isSelected = activeFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      const nextFilter = isSelected && f.id !== 'all' ? 'all' : f.id;
                      setActiveFilter(nextFilter);
                      if (nextFilter === 'dropped') {
                        setIsMultiSelectMode(false);
                        setSelectedCandidateIds(new Set());
                      }
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold transition ${
                      isSelected
                        ? 'bg-stone-900 text-white shadow-2xs'
                        : f.type === 'kind'
                        ? 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                        : f.type === 'tag'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {f.label} ({f.count})
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Layer 1: 待安排 Primary Candidate Cards Grid */}
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-semibold text-stone-700">
                {activeFilter === 'dropped'
                  ? (zh ? '暂不考虑' : 'Shelved')
                  : (zh ? '待安排地点' : 'Pending Scheduling')}
                <span className="ml-1.5 text-[11px] font-normal text-stone-400">
                  ({sortedPendingCandidates.length})
                </span>
              </h3>
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTidyMenuOpen((prev) => !prev)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition flex items-center gap-1 shadow-2xs ${
                      isMultiSelectMode || isEditMode
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                    }`}
                    title={zh ? '整理：多选、去重、疑似合并与信息编辑' : 'Tidy up: multi-select, dedupe, merge and edit'}
                    aria-expanded={tidyMenuOpen}
                  >
                    🧹 {zh ? '整理' : 'Tidy'} ▾
                  </button>
                  {tidyMenuOpen ? (
                    <>
                      <div className="fixed inset-0 z-40 cursor-default" onClick={() => setTidyMenuOpen(false)} />
                      <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-xl">
                        <button
                          type="button"
                          disabled={activeFilter === 'dropped'}
                          onClick={() => {
                            setIsMultiSelectMode((prev) => !prev);
                            setSelectedCandidateIds(new Set());
                            setIsEditMode(false);
                            setTidyMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35"
                          title={zh ? '开启批量选择与删除模式' : 'Toggle multi-select mode'}
                        >
                          ☑️ {isMultiSelectMode ? (zh ? '退出多选' : 'Exit Select') : (zh ? '批量多选' : 'Select')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = !isEditMode;
                            setIsEditMode(next);
                            if (next) {
                              setIsMultiSelectMode(false);
                              setSelectedCandidateIds(new Set());
                            }
                            setTidyMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                          title={zh ? '开启卡片信息编辑（分类等），后续抓取不会覆盖手改项' : 'Edit card info (kind, …); manual edits survive future captures'}
                        >
                          ✏️ {isEditMode ? (zh ? '退出编辑' : 'Exit Edit') : (zh ? '编辑信息' : 'Edit Info')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setTidyMenuOpen(false); void handleDeduplicatePlaces(); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                          title={zh ? '扫描并清理当前行程的重复地点' : 'Scan and merge duplicate places'}
                        >
                          🧹 {zh ? '一键去重' : 'Deduplicate'}
                        </button>
                        {visibleSuspectedPairs.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => { setTidyMenuOpen(false); setIsSuspectedModalOpen(true); }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-bold text-amber-900 hover:bg-amber-50"
                            title={zh ? '查看并合并疑似重复的同类地点' : 'Review and merge suspected duplicate places'}
                          >
                            ✨ {zh ? `合并疑似同类 (${visibleSuspectedPairs.length})` : `Suspected Duplicates (${visibleSuspectedPairs.length})`}
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {isMultiSelectMode && activeFilter !== 'dropped' ? (
              <div className="sticky top-2 z-20 mb-4 flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-stone-800 bg-stone-950/95 px-4 py-2.5 text-white shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-emerald-400">
                    ✓ {zh ? `已选 ${selectedCandidateIds.size} 项` : `${selectedCandidateIds.size} selected`}
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAllCandidates}
                    className="text-xs font-medium text-stone-300 hover:text-white underline underline-offset-2 transition"
                  >
                    {zh ? '全选' : 'Select All'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllCandidates}
                    className="text-xs font-medium text-stone-300 hover:text-white underline underline-offset-2 transition"
                  >
                    {zh ? '清空' : 'Clear'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {selectedCandidateIds.size >= 2 ? (
                    <button
                      type="button"
                      onClick={() => void handleBatchMergeCandidates()}
                      disabled={isBatchOperating || disabled}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-35 transition shadow-xs"
                    >
                      ✨ {zh ? '合并同类' : 'Merge'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleBatchScheduleCandidates()}
                    disabled={selectedCandidateIds.size === 0 || isBatchOperating || disabled}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-35 transition shadow-xs"
                  >
                    {isBatchOperating ? (zh ? '处理中...' : 'Processing...') : `+ ${zh ? '排入当天' : 'Schedule'}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBatchShelveCandidates()}
                    disabled={selectedCandidateIds.size === 0 || isBatchOperating || disabled}
                    className="rounded-lg bg-stone-800 border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-700 disabled:opacity-35 transition"
                  >
                    🙈 {zh ? '暂不考虑' : 'Shelve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBatchDeleteCandidates()}
                    disabled={selectedCandidateIds.size === 0 || isBatchOperating || disabled}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-35 transition shadow-xs"
                  >
                    🗑️ {zh ? '批量删除' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMultiSelectMode(false);
                      setSelectedCandidateIds(new Set());
                    }}
                    className="rounded-lg border border-stone-700 bg-stone-900 px-2 py-1.5 text-xs text-stone-400 hover:text-white transition"
                    title={zh ? '退出多选' : 'Exit Select'}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : null}

            {sortedPendingCandidates.length === 0 ? (
              <div className="py-12 text-center text-xs text-stone-400">
                <p className="text-3xl mb-2">📭</p>
                <p className="font-medium text-stone-600">
                  {pendingCandidates.length === 0
                    ? (zh ? '当前行程暂无候选地点，浏览地图或导入收藏夹即可添加。' : 'No candidates yet.')
                    : (zh ? '没有匹配的候选地点。' : 'No matching candidates.')}
                </p>
                {pendingCandidates.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(true)}
                    className="mt-3 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    {zh ? '📥 导入候选' : '📥 Import candidates'}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {sortedPendingCandidates.map((place) => (
                  <article
                    key={place.id}
                    draggable={!isMultiSelectMode && place.state !== 'dropped'}
                    onClick={() => {
                      if (isMultiSelectMode && place.state !== 'dropped') toggleSelectCandidate(place.id);
                    }}
                    onDragStart={(event) => {
                      if (isMultiSelectMode || place.state === 'dropped') return;
                      event.dataTransfer.setData('text/plain', place.id);
                      event.dataTransfer.dropEffect = 'move';
                      setDraggingPlaceId(place.id);
                    }}
                    onDragEnd={() => setDraggingPlaceId(null)}
                    onMouseEnter={() => setHighlightedPlaceId(place.id)}
                    onMouseLeave={() => setHighlightedPlaceId(null)}
                    className={`group flex flex-col justify-between rounded-xl border p-3.5 transition-all duration-150 ${
                      isMultiSelectMode && place.state !== 'dropped'
                        ? selectedCandidateIds.has(place.id)
                          ? 'border-emerald-500 ring-2 ring-emerald-400 bg-emerald-50/60 shadow-xs cursor-pointer'
                          : 'border-stone-200 bg-white hover:border-stone-300 cursor-pointer shadow-2xs'
                        : highlightedPlaceId === place.id
                        ? 'border-emerald-500 ring-2 ring-emerald-300/60 bg-emerald-50/30 shadow-xs cursor-grab active:cursor-grabbing'
                        : isEditMode
                        ? 'border-sky-300 bg-sky-50/40 hover:border-sky-400 shadow-2xs cursor-grab active:cursor-grabbing'
                        : 'border-stone-200/90 bg-white hover:border-stone-300 hover:shadow-xs cursor-grab active:cursor-grabbing'
                    }`}
                  >
                    <div>
                      {/* Card Header Row */}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 truncate">
                          {isMultiSelectMode && place.state !== 'dropped' ? (
                            <input
                              type="checkbox"
                              checked={selectedCandidateIds.has(place.id)}
                              onChange={() => toggleSelectCandidate(place.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                            />
                          ) : null}
                          <h3 className="truncate text-xs font-bold text-stone-900 leading-snug" title={place.title}>
                            {place.title}
                          </h3>
                        </div>
                      </div>

                      {/* Meta Line */}
                      <p className="mt-0.5 truncate text-[11px] text-stone-400">{placeMeta(place, language)}</p>

                      {/* Edit zone (edit mode only): kind + price + note in one compact box */}
                      {isEditMode ? (
                        <PoolPlaceEditZone
                          place={place}
                          zh={zh}
                          onKindChange={(kind) => void handleChangePlaceKind(place.id, kind)}
                          onSaveFields={(patch) => void handleUpdatePlaceFields(place.id, patch)}
                        />
                      ) : null}

                      {/* Badges and Tags Cluster */}
                      <div className="mt-2 flex flex-wrap gap-1 items-center">
                        {candidateDistances.has(place.id) ? (
                          <span
                            className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800"
                            title={zh ? `距当天最后一站「${lastScheduledStop?.title}」的直线距离` : `Distance to ${lastScheduledStop?.title}`}
                          >
                            📍 {formatDistanceBadge(candidateDistances.get(place.id)!, zh)}
                          </span>
                        ) : null}
                        {(visitCountByPlaceId.get(place.id) || 0) > 0 ? (
                          <span className="rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800">
                            📅 {zh ? `已排 ${visitCountByPlaceId.get(place.id)}次` : `${visitCountByPlaceId.get(place.id)}x scheduled`}
                          </span>
                        ) : null}
                        {place.priority === 'must' ? (
                          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800">
                            🎯 {zh ? '必去' : 'Must'}
                          </span>
                        ) : null}
                        {place.observed_rating ? (
                          <span className="rounded-full bg-amber-50 border border-amber-200/60 px-1.5 py-0.2 text-[9.5px] font-bold text-amber-800">
                            ★ {place.observed_rating}
                          </span>
                        ) : null}
                        {formatPlacePriceInTripCurrency(place, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates) ? (
                          <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[9.5px] font-semibold text-stone-600">
                            {formatPlacePriceInTripCurrency(place, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates)}
                          </span>
                        ) : null}
                          {place.source_category ? (
                            <span className="rounded-full border border-stone-200 bg-stone-50 px-1.5 py-0.2 text-[9.5px] font-medium text-stone-600">
                              {place.source_category}
                            </span>
                          ) : null}
                        {getDisplayTags(place.tags).map((tag) => (
                          <span key={tag} className="rounded-full border border-stone-200 bg-stone-50 px-1.5 py-0.2 text-[9.5px] font-medium text-stone-600">
                            🏷️ {tag}
                          </span>
                        ))}
                          {place.signals?.map((signal) => (
                            <span key={signal} className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.2 text-[9.5px] font-medium text-emerald-800">
                              ✅ {signal}
                            </span>
                          ))}
                        {place.risks?.map((risk) => (
                          <span key={risk} className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.2 text-[9.5px] font-medium text-amber-800">
                            ⚠️ {risk}
                          </span>
                        ))}
                      </div>

                      {/* Research Note / Why Quote */}
                      {place.why ? (
                        <p className="mt-2 line-clamp-2 rounded-md bg-stone-50/80 px-2 py-1 text-xs text-stone-700 leading-relaxed" title={place.why}>
                          💡 {place.why}
                        </p>
                      ) : null}
                    </div>

                    {/* Card Footer Toolbar */}
                    <div className="mt-2 flex items-center justify-between gap-1 border-t border-stone-100/90 pt-2">
                      <div className="flex flex-wrap items-center gap-1 text-[9.5px]">
                        {place.phone ? (
                          <a
                            href={`tel:${place.phone}`}
                            className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-700 hover:bg-stone-200 transition"
                            title={`📞 ${place.phone}`}
                          >
                            📞
                          </a>
                        ) : null}
                        {place.menu_url ? (
                          <a
                            href={place.menu_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-700 hover:bg-stone-200 transition"
                            title={zh ? '查看菜单' : 'Menu'}
                          >
                            📖 {zh ? '菜单' : 'Menu'}
                          </a>
                        ) : null}
                        {place.reservation_url ? (
                          <a
                            href={place.reservation_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                            title={zh ? '官方预订' : 'Reserve'}
                          >
                            🎟️ {zh ? '预订' : 'Reserve'}
                          </a>
                        ) : null}
                          {place.source_url ? (
                            <a
                              href={place.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition"
                              title={zh ? '在 Google Maps 中查看' : 'View on Maps'}
                            >
                              🗺️
                            </a>
                          ) : null}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {place.state === 'dropped' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRestorePlace(place.id);
                            }}
                            className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 transition"
                            title={zh ? '取回到候选池' : 'Restore to candidate pool'}
                          >
                            ↩️ {zh ? '取回' : 'Restore'}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void schedulePlace(place.id);
                              }}
                              className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold transition shadow-2xs ${
                                (visitCountByPlaceId.get(place.id) || 0) > 0
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 ring-1 ring-emerald-500/50'
                                  : 'bg-stone-900 text-white hover:bg-stone-800'
                              }`}
                              title={
                                (visitCountByPlaceId.get(place.id) || 0) > 0
                                  ? (zh ? `已排入行程（已排 ${visitCountByPlaceId.get(place.id)} 次，点击可再次排入所选日期）` : `Already scheduled (${visitCountByPlaceId.get(place.id)}x, click to add again)`)
                                  : (zh ? '排入所选日期' : 'Schedule to selected day')
                              }
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDropPlace(place.id);
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-xs text-stone-400 hover:text-stone-700 hover:border-stone-300 transition shadow-2xs"
                              title={zh ? '暂不考虑' : 'Shelve'}
                            >
                              🙈
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeletePlace(place.id, place.title);
                          }}
                          className="flex h-6 w-6 items-center justify-center text-xs text-stone-300 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                          title={zh ? '彻底从行程中删除此地点' : 'Delete place permanently'}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Layer 2 (formerly scheduled collapsible) removed — scheduled places now stay in main pool with 📅 badge */}

    </section>
    </>
  );
}
