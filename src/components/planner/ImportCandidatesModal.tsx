'use client';

import { useCallback, useState } from 'react';
import type { PlannerTripPlace } from '@/domain/planner';
import { getPlannerKindLabel, parseImportPayload, PLANNER_KIND_ICONS } from '@/domain/planner';
import { plannerRepository } from '@/services/PlannerRepository';

interface ImportCandidatesModalProps {
  open: boolean;
  onClose: () => void;
  tripId: string;
  tripTitle: string;
  onImportSuccess: (importedCount: number) => void;
  language?: 'zh' | 'en';
}

export function ImportCandidatesModal({
  open,
  onClose,
  tripId,
  tripTitle,
  onImportSuccess,
  language = 'zh',
}: ImportCandidatesModalProps) {
  const zh = language === 'zh';
  const [inputText, setInputText] = useState('');
  const [parsedPlaces, setParsedPlaces] = useState<PlannerTripPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleTextChange = useCallback(
    (text: string) => {
      setInputText(text);
      setErrorMsg('');
      if (!text.trim()) {
        setParsedPlaces([]);
        return;
      }
      try {
        const results = parseImportPayload(text, tripId);
        setParsedPlaces(results);
      } catch (err) {
        console.warn('[ImportModal] parse error:', err);
        setParsedPlaces([]);
      }
    },
    [tripId],
  );

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = String(e.target?.result || '');
        handleTextChange(content);
      };
      reader.onerror = () => {
        setErrorMsg(zh ? '文件读取失败' : 'Failed to read file');
      };
      reader.readAsText(file);
    },
    [handleTextChange, zh],
  );

  const handleConfirmImport = useCallback(async () => {
    if (parsedPlaces.length === 0 || busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      await plannerRepository.initialize();
      const report = await plannerRepository.importExternalCandidates(parsedPlaces);
      const importedCount = report.created.length + report.updated.length;
      onImportSuccess(importedCount);
      if (report.failed.length > 0) {
        const importedIds = new Set([...report.created, ...report.updated]);
        const remaining = parsedPlaces.filter((place) => !importedIds.has(place.id));
        setParsedPlaces(remaining);
        const reasons = report.failed.map((item) => `${item.title}: ${item.reason}`).join(zh ? '；' : '; ');
        setErrorMsg(zh
          ? `已写入 ${importedCount} 个，拒绝 ${report.failed.length} 个：${reasons}`
          : `Imported ${importedCount}; rejected ${report.failed.length}: ${reasons}`);
        return;
      }
      setInputText('');
      setParsedPlaces([]);
      onClose();
    } catch (err) {
      console.warn('[ImportModal] import error:', err);
      setErrorMsg(zh ? '写入数据目录失败，请检查文件权限。' : 'Failed to write to data directory.');
    } finally {
      setBusy(false);
    }
  }, [parsedPlaces, busy, onImportSuccess, onClose, zh]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-3 sm:p-6 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
              <span>📥</span>
              <span>{zh ? '导入外部研究候选' : 'Import Research Candidates'}</span>
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {zh
                ? `导入候选地点至「${tripTitle}」的 Research Pool (支持 Obsidian / 剪贴板 / Google Maps / KML / CSV / JSON)`
                : `Import places into Research Pool for "${tripTitle}"`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-stone-700">
                {zh ? '粘贴地点文本、链接或数据：' : 'Paste text, links, or payload:'}
              </label>
              <label className="cursor-pointer text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition">
                <span>📁 {zh ? '上传文件 (.json / .csv / .kml / .txt)' : 'Upload File'}</span>
                <input
                  type="file"
                  accept=".json,.csv,.kml,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => handleTextChange(e.target.value)}
              rows={6}
              placeholder={
                zh
                  ? '支持以下格式直接粘贴：\n1. Google Maps 分享链接 (每行一个)\n2. 纯文本地点清单 (- 浅草寺\\n- 东京塔)\n3. Google 我的地图导出的 KML 或 CSV 文本\n4. Ownly Capture 导出的 JSON 数组'
                  : 'Paste Google Maps links, bulleted place names, KML, CSV, or JSON array.'
              }
              className="w-full rounded-xl border border-stone-200 p-3 text-xs font-mono text-stone-800 outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
            />
          </div>

          {errorMsg ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
              ⚠️ {errorMsg}
            </div>
          ) : null}

          {/* Parsed Preview */}
          {parsedPlaces.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">
                  {zh ? `解析成功：共 ${parsedPlaces.length} 个候选地点` : `Parsed ${parsedPlaces.length} places`}
                </span>
                <span className="text-[11px] text-stone-400">
                  {zh ? '将以 candidate 状态加入灵感池' : 'Will be added as candidates'}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/50 p-2 space-y-1.5 divide-y divide-stone-100">
                {parsedPlaces.map((p, i) => (
                  <div key={p.id || i} className="flex items-center justify-between pt-1.5 first:pt-0 text-xs">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="shrink-0">{PLANNER_KIND_ICONS[p.kind] || '📍'}</span>
                      <span className="font-semibold text-stone-900 truncate">{p.title}</span>
                      <span className="text-[10px] text-stone-500 rounded bg-stone-200/60 px-1 py-0.2">
                        {getPlannerKindLabel(p.kind, language)}
                      </span>
                    </div>
                    {p.address ? (
                      <span className="text-[10px] text-stone-400 truncate max-w-[180px]" title={p.address}>
                        {p.address}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : inputText.trim() ? (
            <p className="text-xs text-amber-600">
              {zh ? '未能从输入文本中识别出有效地点，请检查格式。' : 'No places detected from input.'}
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-stone-100 bg-stone-50 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition"
          >
            {zh ? '取消' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmImport()}
            disabled={parsedPlaces.length === 0 || busy}
            className="rounded-lg bg-stone-950 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-40 transition"
          >
            {busy
              ? (zh ? '导入中…' : 'Importing…')
              : (zh ? `确认导入 ${parsedPlaces.length} 个地点` : `Import ${parsedPlaces.length} Places`)}
          </button>
        </div>
      </div>
    </div>
  );
}
