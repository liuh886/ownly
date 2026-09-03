'use client';

import type { OwnlyCollectionExportV1 } from '@/domain/capture';
import { capturePlaceToPlannerPlace } from '@/domain/capture';
import { plannerRepository } from '@/services/PlannerRepository';
import { trackCollectionEvent } from '@/lib/collection-analytics';
import { useCallback, useEffect, useState } from 'react';

export function CollectionPreview({
  data,
  onImported,
}: {
  data: OwnlyCollectionExportV1;
  onImported?: (count: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const places = data.places.slice(0, 20);
  const hasMore = data.places.length > 20;

  useEffect(() => {
    trackCollectionEvent({ type: 'preview_viewed', collectionId: data.collection.id, placeCount: data.collection.place_count });
  }, [data.collection.id, data.collection.place_count]);

  const handleImport = useCallback(async () => {
    trackCollectionEvent({ type: 'import_clicked', collectionId: data.collection.id, placeCount: data.collection.place_count });
    setBusy(true);
    setResult(null);
    try {
      // Need a trip — for preview we create/import into a default trip or prompt user
      // For now, assume user has a trip; if not, create one
      const trips = await plannerRepository.listTrips();
      let tripId = trips[0]?.id;
      if (!tripId) {
        // Create a trip from collection title
        const now = new Date().toISOString().slice(0, 10);
        const trip = {
          schema_version: '0.1' as const,
          type: 'trip' as const,
          id: `trip-${Date.now()}`,
          title: data.collection.title,
          status: 'planning' as const,
          start_date: now,
          end_date: now,
          destinations: [],
          created_at: new Date().toISOString(),
        };
        await plannerRepository.upsertTrip(trip as never);
        tripId = trip.id;
      }
      const plannerPlaces = data.places.map((p) => capturePlaceToPlannerPlace(p, tripId!, data.provenance) as never);
      const report = await plannerRepository.importCapturedPlaces(plannerPlaces as never);
      const created = report.created.length + report.updated.length;
      trackCollectionEvent({ type: 'import_succeeded', collectionId: data.collection.id, created, failed: report.failed.length });
      setResult(`已导入 ${created} 个地点` + (report.failed.length ? `，失败 ${report.failed.length} 个` : ''));
      onImported?.(created);
    } catch (e) {
      setResult(e instanceof Error ? e.message : '导入失败');
    } finally {
      setBusy(false);
    }
  }, [data, onImported]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-950">{data.collection.title}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {data.collection.place_count} places · {data.exported_at.slice(0, 10)}
          {data.provenance?.creator ? ` · 来自 ${data.provenance.creator}` : ''}
        </p>
        <p className="mt-1 text-xs text-stone-400">{data.collection.source_url ?? ''}</p>
      </header>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={busy}
          className="rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-40"
        >
          {busy ? '导入中...' : '导入到我的行程'}
        </button>
        {result ? <span className="self-center text-sm text-emerald-700">{result}</span> : null}
      </div>

      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {places.map((p) => (
          <li key={p.id} className="flex gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-sm">📍</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-stone-950">{p.title}</div>
              {p.address ? <div className="mt-0.5 text-xs text-stone-500">{p.address}</div> : null}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.inferred_kind ? <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">{p.inferred_kind}</span> : null}
                {p.rating ? <span className="text-xs text-amber-600">★ {p.rating}</span> : null}
                {(p.user?.tags ?? []).slice(0, 3).map((t) => (
                  <span key={t} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">{t}</span>
                ))}
              </div>
            </div>
            {p.source.url ? (
              <a href={p.source.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-stone-400 underline">
                地图
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {hasMore ? <p className="mt-3 text-center text-xs text-stone-400">还有 {data.places.length - 20} 个地点未展示，导入后查看全部</p> : null}
    </div>
  );
}
