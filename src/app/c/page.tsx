'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import { CollectionPreview } from '@/components/collection/CollectionPreview';
import { getCollectionShareTokenFromUrl, parseCollectionShareToken } from '@/domain/collection-share';
import type { OwnlyCollectionExportV1 } from '@/domain/capture';

export default function CollectionPage() {
  const [data, setData] = useState<OwnlyCollectionExportV1 | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const url = window.location.href;
    const token = getCollectionShareTokenFromUrl(url) ?? new URLSearchParams(window.location.search).get('token');
    if (token) {
      const parsed = parseCollectionShareToken(token);
      setData(parsed);
    }
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <div className="mx-auto max-w-3xl p-12" role="status" aria-label="加载中">
        <div className="ownly-skeleton h-8 w-1/3 rounded-full" aria-hidden="true" />
        <div className="ownly-skeleton mt-4 h-40 rounded-xl" aria-hidden="true" />
        <p className="mt-4 text-center text-sm text-stone-500">加载中…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl p-12 text-center">
        <p className="text-sm text-stone-500">链接无效或已过期</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-11 touch-manipulation rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition duration-150 active:scale-[0.97] hover:bg-stone-50"
        >
          重新加载
        </button>
      </div>
    );
  }
  return <CollectionPreview data={data} />;
}
