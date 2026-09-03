import { CollectionPreview } from '@/components/collection/CollectionPreview';
import { parseCollectionShareToken } from '@/domain/collection-share';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = parseCollectionShareToken(token);
  if (!data) return { title: 'Collection not found — Ownly' };
  return {
    title: `${data.collection.title} — Ownly Collection`,
    description: `${data.collection.place_count} places · ${data.places.slice(0, 3).map((p) => p.title).join(' / ')}`,
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = parseCollectionShareToken(token);
  if (!data) {
    return <div className="mx-auto max-w-3xl p-12 text-center text-sm text-stone-500">链接无效或已过期</div>;
  }
  return <CollectionPreview data={data} />;
}
