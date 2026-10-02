import type { WYQDLanguage } from './i18n';

export interface SampleDataCopy {
  title: string;
  /** Rendered only when at least one `sample`-tagged record exists. */
  lede: string;
  breakdown: string;
  cta: string;
  confirmTitle: string;
  confirmMessage: string;
  confirmLabel: string;
  cancelLabel: string;
  clearing: string;
  cleared: string;
  clearedNone: string;
  error: string;
  demoNote: string;
}

const COPY: Record<WYQDLanguage, SampleDataCopy> = {
  en: {
    title: 'Example data',
    lede:
      'These records came from the bundled example set, not from you. They are tagged `sample`, so this only ever touches records carrying that tag — anything you wrote yourself is left alone.',
    breakdown: '{objects} objects · {snapshots} snapshots · {reviews} reviews · {trips} trips',
    cta: 'Remove all example data',
    confirmTitle: 'Remove all example data?',
    confirmMessage:
      'Objects, snapshots and reviews are archived, so you can restore them from the Archive panel if you change your mind. Trips have no archive and are deleted permanently, along with their places, daily plans, travel legs and expenses. Records you created yourself are not affected.',
    confirmLabel: 'Remove example data',
    cancelLabel: 'Keep it',
    clearing: 'Removing…',
    cleared: 'Example data removed: {objects} objects, {snapshots} snapshots, {reviews} reviews, {trips} trips.',
    clearedNone: 'No example data left to remove.',
    error: 'Could not remove the example data.',
    demoNote:
      'Demo mode needs none of this — it keeps the same example set in memory only, and it disappears when you close the tab or connect a folder.',
  },
  zh: {
    title: '示例数据',
    lede:
      '这些记录来自内置示例，不是你自己录入的。它们都带 `sample` 标签，所以这里只会处理带该标签的记录 —— 你自己写的内容不受影响。',
    breakdown: '{objects} 个实体物品 · {snapshots} 份账户快照 · {reviews} 篇复盘 · {trips} 段行程',
    cta: '清除全部示例数据',
    confirmTitle: '清除全部示例数据？',
    confirmMessage:
      '实体物品、账户快照和复盘会移入归档，之后可以从归档面板恢复。行程没有归档机制，将被永久删除，其地点、日程、交通段和费用一并移除。你自己创建的记录不受影响。',
    confirmLabel: '清除示例数据',
    cancelLabel: '先留着',
    clearing: '正在清除…',
    cleared: '示例数据已清除：{objects} 个实体物品、{snapshots} 份账户快照、{reviews} 篇复盘、{trips} 段行程。',
    clearedNone: '没有需要清除的示例数据。',
    error: '清除示例数据失败。',
    demoNote:
      '演示模式不需要这一步 —— 它把同一套示例只放在内存里，关闭标签页或连接数据目录后就会消失。',
  },
};

export function getSampleDataCopy(language: WYQDLanguage): SampleDataCopy {
  return COPY[language];
}

export function formatSampleBreakdown(
  copy: SampleDataCopy,
  counts: { objects: number; snapshots: number; reviews: number; trips: number },
): string {
  return copy.breakdown
    .replace('{objects}', String(counts.objects))
    .replace('{snapshots}', String(counts.snapshots))
    .replace('{reviews}', String(counts.reviews))
    .replace('{trips}', String(counts.trips));
}

export function formatSampleCleared(
  copy: SampleDataCopy,
  counts: { objects: number; snapshots: number; reviews: number; trips: number },
): string {
  return copy.cleared
    .replace('{objects}', String(counts.objects))
    .replace('{snapshots}', String(counts.snapshots))
    .replace('{reviews}', String(counts.reviews))
    .replace('{trips}', String(counts.trips));
}
