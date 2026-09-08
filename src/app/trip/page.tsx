'use client';

import { useRef, useState } from 'react';
import { TripSnapshotViewer } from '@/components/snapshot/TripSnapshotViewer';
import { parseTripSnapshot, type OwnlyTripSnapshot } from '@/domain/trip-snapshot';

export default function TripSnapshotPage() {
  const [snapshot, setSnapshot] = useState<OwnlyTripSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      setSnapshot(parseTripSnapshot(await file.text()));
    } catch (err) {
      setSnapshot(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center sm:p-12">
        <div className="text-4xl">📱</div>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-stone-950">
          {language === 'zh' ? '打开行程快照' : 'Open a trip snapshot'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          {language === 'zh'
            ? '在桌面端 Planner 点「导出 → 手机快照」，把 .ownly-trip-snapshot.json 传到手机后在此打开。只读浏览，不写回、不上传。'
            : 'Export “Phone snapshot” from the desktop Planner, transfer the .ownly-trip-snapshot.json file to your phone, and open it here. Read-only; nothing is written back or uploaded.'}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="min-h-11 rounded-xl bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
          >
            {language === 'zh' ? '选择快照文件' : 'Choose snapshot file'}
          </button>
          <button
            type="button"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="min-h-11 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-600"
          >
            {language === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleFile(file);
          }}
        />
        {error ? (
          <div role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto flex max-w-3xl items-center justify-end gap-2 px-4 pt-3 sm:px-6">
        <button
          type="button"
          onClick={() => { setSnapshot(null); setError(null); }}
          className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200"
        >
          {language === 'zh' ? '打开其他快照' : 'Open another'}
        </button>
        <button
          type="button"
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
          className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200"
        >
          {language === 'zh' ? 'EN' : '中文'}
        </button>
      </div>
      <TripSnapshotViewer snapshot={snapshot} language={language} />
    </div>
  );
}
