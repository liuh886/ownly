'use client';

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

  if (!checked) return <div className="mx-auto max-w-3xl p-12 text-center text-sm text-stone-500">加载中…</div>;
  if (!data) return <div className="mx-auto max-w-3xl p-12 text-center text-sm text-stone-500">链接无效或已过期</div>;
  return <CollectionPreview data={data} />;
}
