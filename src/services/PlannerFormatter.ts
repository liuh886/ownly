/**
 * P2: Formatter — 数据 → 展示/导出 格式，不碰业务判定
 */
import { createShareableTripBundle } from '@/domain/trip-bundle';
import { buildCollectionExport } from '@/domain/capture';

export const PlannerFormatter = {
  toShareableBundle: createShareableTripBundle,
  toCollectionExport: buildCollectionExport,
};
