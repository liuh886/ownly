'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/core/i18n-context';

type MarketingHomeProps = {
  appHref: string;
  githubHref: string;
  obsidianHref: string;
  brandMarkHref: string;
};

type WindowChromeProps = {
  brandMarkHref: string;
  label: string;
  children: ReactNode;
  className?: string;
};

const copy = {
  en: {
    nav: ['Understand cost', 'Review decisions', 'Your data'],
    open: 'Open Ownly',
    heroTitle: 'Know what you own. Decide what deserves to stay.',
    heroDescription:
      'Ownly keeps possessions, subscriptions and important experiences in one decision ledger you control, so real use—not vague memory—can guide what stays, renews or leaves.',
    seeHow: 'See how it works',
    proof: ['Markdown you control', 'No required account', 'Backup and restore'],
    overviewLabel: 'Ownership overview',
    today: 'Today',
    overviewTitle: 'What deserves attention today',
    overviewMetrics: [
      ['42', 'active possessions'],
      ['$107', 'monthly subscription cost'],
      ['3', 'reviews due'],
    ],
    overviewItems: [
      ['Noise-cancelling headphones', '18 uses · excellent condition', 'Keep'],
      ['Cloud storage', '$119.88 / year · renews in 12 days', 'Review'],
      ['Weekend camera', '2 uses in 6 months', 'Observe'],
    ],
    decisionCue: 'Decision cue',
    decisionCueText: 'Review the camera before buying another lens.',
    costTitle: 'Price is only the beginning.',
    costDescription:
      'Ownly places purchase price, usage cost and subscription cost beside real use. A cheap object that is never used and an expensive object used every day should not look the same.',
    costWindowLabel: 'Cost and use',
    physicalTitle: 'Noise-cancelling headphones',
    physicalMeta: 'Physical item · using',
    purchasePrice: 'Purchase price',
    purchaseValue: '$349',
    usageCost: 'Daily usage cost',
    usageValue: '$0.64',
    uses: 'Recorded uses',
    usesValue: '18',
    usageHistory: 'Usage history',
    sixMonths: '6 months',
    usageMonths: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
    subscriptionTitle: 'Subscriptions',
    subscriptionRows: [
      ['Cloud storage', '$9.99 / mo', 'Essential'],
      ['Music service', '$10.99 / mo', 'Review'],
      ['Design software', '$19.99 / mo', 'Active'],
      ['Gym membership', '$65 / mo', 'Low use'],
    ],
    reviewTitle: 'Review before the next purchase or renewal.',
    reviewDescription:
      'A review turns accumulated facts into one clear action: keep, renew, transfer, archive or exit. Ownly does not decide for you; it preserves the evidence needed to decide well.',
    reviewWindowLabel: 'Review queue',
    dueNow: 'Due now',
    lowUse: 'Low use',
    cameraReview: 'Weekend camera',
    cameraReviewText: 'Used twice in six months. Decide whether it still earns its place before another lens purchase.',
    keep: 'Keep',
    transfer: 'Transfer',
    later: 'Review later',
    nextReviews: 'Next reviews',
    usesSixMonths: 'uses / 6 mo',
    acquired: 'acquired',
    daysOwned: 'days owned',
    portableNoteTitle: 'Markdown + YAML',
    portableNoteText: 'Readable, searchable and portable beyond the app.',
    reviewRows: [
      ['Cloud storage', '12 days', 'Renewal'],
      ['Kyoto autumn trip', 'Complete', 'Experience'],
      ['Noise-cancelling headphones', '45 days', 'Condition'],
    ],
    localTitle: 'Your data, your folder, your choice.',
    localText:
      'Ownly does not host your personal ledger. Keep the same readable Markdown in a local folder, an Obsidian Vault, or a personal cloud folder you already control. Your sync provider handles synchronization; Ownly keeps one data model.',
    trust: ['Markdown + YAML', 'No Ownly-hosted database', 'Versioned backup', 'Your cloud if you want one'],
    finalTitle: 'Know what deserves to stay.',
    finalText: 'Start with one real object. Keep the record in a folder you control from day one.',
    github: 'GitHub',
    obsidian: 'Obsidian plugin',
    footer: 'Own less. Live more. Decide better.',
    sample: 'Sample data · no folder access',
  },
  zh: {
    nav: ['理解成本', '完成回顾', '你的数据'],
    open: '打开 Ownly',
    heroTitle: '记住你拥有什么，决定什么值得留下。',
    heroDescription:
      'Ownly 将实物、订阅和重要经历放进一份由你控制的决策账本，让真实使用而不是模糊记忆，决定什么值得保留、续费或离开。',
    seeHow: '查看工作方式',
    proof: ['你控制的 Markdown', '无需强制账户', '备份与恢复'],
    overviewLabel: '所有权总览',
    today: '今天',
    overviewTitle: '今天，什么最值得关注',
    overviewMetrics: [
      ['42', '当前物品'],
      ['¥764', '月均订阅成本'],
      ['3', '待回顾'],
    ],
    overviewItems: [
      ['降噪耳机', '已使用 18 次 · 状态良好', '保留'],
      ['云存储', '¥828 / 年 · 12 天后续费', '回顾'],
      ['周末相机', '半年使用 2 次', '观察'],
    ],
    decisionCue: '决策提示',
    decisionCueText: '购买下一支镜头前，先回顾这台相机。',
    costTitle: '价格只是成本的起点。',
    costDescription:
      'Ownly 将购入价格、使用成本、订阅成本与真实使用放在一起。便宜但从未使用的物品，不应与昂贵却每天使用的物品看起来一样。',
    costWindowLabel: '成本与使用',
    physicalTitle: '降噪耳机',
    physicalMeta: '实物 · 使用中',
    purchasePrice: '购入价格',
    purchaseValue: '¥2,499',
    usageCost: '日均使用成本',
    usageValue: '¥4.58',
    uses: '已记录使用',
    usesValue: '18 次',
    usageHistory: '使用记录',
    sixMonths: '6 个月',
    usageMonths: ['3月', '4月', '5月', '6月', '7月', '8月'],
    subscriptionTitle: '订阅',
    subscriptionRows: [
      ['云存储', '¥69 / 月', '必要'],
      ['音乐服务', '¥88 / 月', '回顾'],
      ['设计软件', '¥138 / 月', '使用中'],
      ['健身会员', '¥469 / 月', '低使用'],
    ],
    reviewTitle: '在下一次购买或续费之前，先完成回顾。',
    reviewDescription:
      '回顾把积累的事实转化为一个清晰行动：保留、续费、转让、归档或退出。Ownly 不替你决定，而是保存做出好决定所需的证据。',
    reviewWindowLabel: '回顾队列',
    dueNow: '现在到期',
    lowUse: '低使用',
    cameraReview: '周末相机',
    cameraReviewText: '半年只使用两次。购买下一支镜头前，判断它是否仍值得占据生活空间。',
    keep: '保留',
    transfer: '转让',
    later: '稍后回顾',
    nextReviews: '接下来的回顾',
    usesSixMonths: '半年使用次数',
    acquired: '购入价格',
    daysOwned: '持有天数',
    portableNoteTitle: 'Markdown + YAML',
    portableNoteText: '可阅读、可检索，也可在 Ownly 之外继续使用。',
    reviewRows: [
      ['云存储', '12 天', '续费'],
      ['京都秋日旅行', '已完成', '经历'],
      ['降噪耳机', '45 天', '状态'],
    ],
    localTitle: '你的数据，你的目录，由你决定。',
    localText:
      'Ownly 不托管你的个人账本。同一份可读 Markdown 可以放在普通本地目录、Obsidian Vault，或你自己控制的个人云盘目录中。同步由你的服务商负责，Ownly 始终保持一套数据模型。',
    trust: ['Markdown + YAML', '无 Ownly 托管数据库', '版本化备份', '需要时使用你的云盘'],
    finalTitle: '看清什么值得留下。',
    finalText: '从一个真实对象开始，从第一天起就把记录保存在你自己控制的目录中。',
    github: 'GitHub',
    obsidian: 'Obsidian 插件',
    footer: 'Own less. Live more. Decide better.',
    sample: '示例数据 · 不请求文件夹权限',
  },
} as const;

function trackPublicCta(id: string) {
  if (typeof window === 'undefined') return;
  const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer;
  dataLayer?.push({ event: 'ownly_public_cta', cta_id: id });
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none">
      <path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WindowChrome({ brandMarkHref, label, children, className = '' }: WindowChromeProps) {
  return (
    <div className={`overflow-hidden rounded-[2rem] border border-stone-950/12 bg-stone-950 p-2.5 shadow-[0_38px_100px_-44px_rgba(28,25,23,0.78)] sm:p-3 ${className}`}>
      <div className="overflow-hidden rounded-[1.45rem] bg-[#faf8f2]">
        <div className="flex items-center justify-between border-b border-stone-200/90 bg-white/75 px-4 py-3.5 backdrop-blur sm:px-5">
          <div className="flex items-center gap-2.5">
            <img src={brandMarkHref} alt="" className="h-8 w-8 rounded-[0.65rem]" />
            <div>
              <p className="text-sm font-semibold tracking-[-0.02em]">Ownly</p>
              <p className="text-[9px] font-medium uppercase tracking-[0.13em] text-stone-400">{label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-stone-200" />
            <span className="h-2 w-2 rounded-full bg-stone-200" />
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function OverviewWindow({ brandMarkHref, text }: { brandMarkHref: string; text: typeof copy.en | typeof copy.zh }) {
  return (
    <WindowChrome brandMarkHref={brandMarkHref} label={text.overviewLabel}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800">{text.today}</p>
            <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">{text.overviewTitle}</h2>
          </div>
          <span className="hidden rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-medium text-stone-500 sm:inline-flex">{text.sample}</span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          {text.overviewMetrics.map(([value, label]) => (
            <div key={label} className="rounded-2xl border border-stone-200/90 bg-white p-3 sm:p-4">
              <p className="text-xl font-semibold tracking-[-0.045em] sm:text-2xl">{value}</p>
              <p className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.1em] text-stone-400 sm:text-[10px]">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="rounded-2xl border border-stone-200 bg-white p-3.5 sm:p-4">
            <div className="space-y-2.5">
              {text.overviewItems.map(([title, meta, state]) => (
                <div key={title} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2.5 ring-1 ring-stone-100">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-stone-900">{title}</p>
                    <p className="mt-0.5 truncate text-[10px] text-stone-500">{meta}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[9px] font-semibold text-stone-600 ring-1 ring-stone-200">{state}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-44 flex-col rounded-2xl bg-emerald-900 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-emerald-200">{text.decisionCue}</p>
            <p className="mt-5 text-sm font-medium leading-6">{text.decisionCueText}</p>
            <div className="mt-auto pt-7">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full w-[64%] rounded-full bg-emerald-300" /></div>
            </div>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

function CostWindow({ brandMarkHref, text }: { brandMarkHref: string; text: typeof copy.en | typeof copy.zh }) {
  const bars = [38, 58, 44, 72, 62, 88];
  return (
    <WindowChrome brandMarkHref={brandMarkHref} label={text.costWindowLabel}>
      <div className="grid min-h-[520px] lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border-b border-stone-200 p-4 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-800">{text.physicalMeta}</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">{text.physicalTitle}</h3>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-100">18×</span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2.5">
            {[
              [text.purchasePrice, text.purchaseValue],
              [text.usageCost, text.usageValue],
              [text.uses, text.usesValue],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-stone-200 bg-white p-3.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-stone-400">{label}</p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.04em] sm:text-xl">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold">{text.usageHistory}</p><span className="text-[9px] uppercase tracking-[0.12em] text-stone-400">{text.sixMonths}</span></div>
            <div className="mt-6 flex h-36 items-end gap-2.5">
              {bars.map((height, index) => (
                <div key={text.usageMonths[index]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="w-full rounded-t-md bg-emerald-700/90" style={{ height: `${height}%` }} />
                  <span className="text-[9px] text-stone-400">{text.usageMonths[index]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white/48 p-4 sm:p-6">
          <div className="flex items-center justify-between"><h3 className="text-base font-semibold">{text.subscriptionTitle}</h3><span className="text-xs font-semibold text-stone-500">{text.overviewMetrics[1][0]}</span></div>
          <div className="mt-5 space-y-3">
            {text.subscriptionRows.map(([name, amount, state], index) => (
              <div key={name} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-sm font-semibold">{name}</p><p className="mt-1 text-[10px] text-stone-400">{state}</p></div>
                  <p className="text-xs font-semibold text-stone-600">{amount}</p>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${index === 3 ? 'bg-amber-400' : 'bg-emerald-600'}`} style={{ width: `${[82, 54, 71, 24][index]}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

function ReviewWindow({ brandMarkHref, text }: { brandMarkHref: string; text: typeof copy.en | typeof copy.zh }) {
  return (
    <WindowChrome brandMarkHref={brandMarkHref} label={text.reviewWindowLabel}>
      <div className="grid min-h-[510px] lg:grid-cols-[1.08fr_0.92fr]">
        <div className="border-b border-stone-200 p-4 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-red-50 px-3 py-1.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-100">{text.dueNow}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-100">{text.lowUse}</span>
          </div>
          <h3 className="mt-6 text-3xl font-semibold tracking-[-0.05em]">{text.cameraReview}</h3>
          <p className="mt-4 max-w-xl text-sm leading-6 text-stone-600">{text.cameraReviewText}</p>

          <div className="mt-7 grid grid-cols-3 gap-2.5">
            <button type="button" className="rounded-xl bg-stone-950 px-3 py-3 text-xs font-semibold text-white">{text.keep}</button>
            <button type="button" className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-xs font-semibold text-stone-700">{text.transfer}</button>
            <button type="button" className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-xs font-semibold text-stone-500">{text.later}</button>
          </div>

          <div className="mt-7 rounded-2xl bg-stone-950 p-4 text-white">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-xl font-semibold">2</p><p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-stone-400">{text.usesSixMonths}</p></div>
              <div><p className="text-xl font-semibold">$1,240</p><p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-stone-400">{text.acquired}</p></div>
              <div><p className="text-xl font-semibold">183</p><p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-stone-400">{text.daysOwned}</p></div>
            </div>
          </div>
        </div>

        <div className="bg-white/50 p-4 sm:p-6">
          <h3 className="text-base font-semibold">{text.nextReviews}</h3>
          <div className="mt-5 space-y-3">
            {text.reviewRows.map(([title, timing, kind], index) => (
              <div key={title} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-xs font-semibold text-stone-600">0{index + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{title}</p><p className="mt-1 text-[10px] text-stone-400">{kind}</p></div>
                <span className="shrink-0 text-xs font-semibold text-stone-500">{timing}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
            <strong>{text.portableNoteTitle}</strong><br />{text.portableNoteText}
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

export function MarketingHome({ appHref, githubHref, obsidianHref, brandMarkHref }: MarketingHomeProps) {
  const { language, setLanguage } = useI18n();
  const text = copy[language];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f3ec] text-stone-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-stone-900/[0.06] bg-[#f6f3ec]/84 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <a href="#top" className="flex items-center gap-2.5" aria-label="Ownly home">
            <img src={brandMarkHref} alt="" className="h-9 w-9 rounded-[0.72rem]" />
            <span className="text-lg font-semibold tracking-[-0.04em]">Ownly</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-stone-500 lg:flex" aria-label="Primary navigation">
            <a className="transition hover:text-stone-950" href="#preview">{text.nav[0]}</a>
            <a className="transition hover:text-stone-950" href="#review">{text.nav[1]}</a>
            <a className="transition hover:text-stone-950" href="#local">{text.nav[2]}</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
              className="rounded-full border border-stone-300/80 bg-white/60 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-white"
              aria-label={language === 'en' ? '切换到中文' : 'Switch to English'}
            >
              {language === 'en' ? 'ZH' : 'EN'}
            </button>
            <a
              href={appHref}
              onClick={() => trackPublicCta('header_open_app')}
              className="hidden items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_-10px_rgba(28,25,23,0.7)] transition hover:-translate-y-px hover:bg-stone-800 sm:flex"
            >
              {text.open}<ArrowIcon />
            </a>
          </div>
        </div>
      </header>

      <section id="top" data-ownly-scene="overview" className="relative flex min-h-screen items-center overflow-hidden px-5 pb-16 pt-28 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(28,25,23,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(28,25,23,0.03)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />
        <div className="pointer-events-none absolute -left-40 top-16 h-[34rem] w-[34rem] rounded-full bg-emerald-300/14 blur-3xl" />
        <div className="pointer-events-none absolute -right-52 bottom-0 h-[32rem] w-[32rem] rounded-full bg-stone-300/45 blur-3xl" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.07em] sm:text-6xl lg:text-[4.75rem]">{text.heroTitle}</h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">{text.heroDescription}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href={appHref} onClick={() => trackPublicCta('hero_open_app')} className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_14px_36px_-14px_rgba(28,25,23,0.72)] transition hover:-translate-y-0.5 hover:bg-stone-800">{text.open}<ArrowIcon /></a>
              <a href="#preview" onClick={() => trackPublicCta('hero_preview_scroll')} className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white/65 px-6 py-3.5 text-sm font-semibold text-stone-800 transition hover:-translate-y-0.5 hover:border-stone-400 hover:bg-white">{text.seeHow}</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-stone-500">
              {text.proof.map((item) => <span key={item} className="inline-flex items-center gap-1.5"><CheckIcon />{item}</span>)}
            </div>
          </div>
          <OverviewWindow brandMarkHref={brandMarkHref} text={text} />
        </div>
      </section>

      <section id="preview" data-ownly-scene="cost" className="relative flex min-h-screen scroll-mt-20 items-center overflow-hidden border-y border-stone-900/[0.07] bg-white/58 px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="pointer-events-none absolute right-[-14rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-emerald-200/20 blur-3xl" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[0.68fr_1.32fr] lg:items-center">
          <div>
            <h2 className="max-w-xl text-4xl font-semibold leading-[1] tracking-[-0.06em] sm:text-5xl">{text.costTitle}</h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-stone-600">{text.costDescription}</p>
            <div className="mt-8 h-px w-16 bg-emerald-600" />
          </div>
          <CostWindow brandMarkHref={brandMarkHref} text={text} />
        </div>
      </section>

      <section id="review" data-ownly-scene="review" className="relative flex min-h-screen scroll-mt-20 items-center overflow-hidden bg-[#ebe7dc] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="pointer-events-none absolute -left-40 bottom-[-14rem] h-[34rem] w-[34rem] rounded-full bg-stone-400/24 blur-3xl" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[1.28fr_0.72fr] lg:items-center">
          <ReviewWindow brandMarkHref={brandMarkHref} text={text} />
          <div className="lg:order-2">
            <h2 className="max-w-xl text-4xl font-semibold leading-[1] tracking-[-0.06em] sm:text-5xl">{text.reviewTitle}</h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-stone-600">{text.reviewDescription}</p>
            <a href={appHref} onClick={() => trackPublicCta('review_open_app')} className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-stone-950 transition hover:text-emerald-800">{text.open}<ArrowIcon /></a>
          </div>
        </div>
      </section>

      <section id="local" className="scroll-mt-20 bg-stone-950 px-5 py-16 text-white sm:px-8 lg:px-10 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">{text.localTitle}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-300 sm:text-base sm:leading-7">{text.localText}</p>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
              {text.trust.map((item) => <div key={item} className="bg-stone-950 px-4 py-5 text-center text-xs font-medium text-stone-200">{item}</div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#f6f3ec] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 rounded-[2rem] bg-emerald-900 px-7 py-12 text-white shadow-[0_30px_75px_-48px_rgba(6,78,59,0.75)] sm:px-12 lg:flex-row lg:items-end lg:justify-between lg:px-16">
          <div>
            <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">{text.finalTitle}</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-emerald-100">{text.finalText}</p>
          </div>
          <a href={appHref} onClick={() => trackPublicCta('final_open_app')} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-emerald-950 transition hover:-translate-y-0.5">{text.open}<ArrowIcon /></a>
        </div>
      </section>

      <footer className="border-t border-stone-900/[0.07] bg-[#f6f3ec]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div><span className="font-semibold text-stone-900">Ownly</span><span className="ml-3">{text.footer}</span></div>
          <div className="flex items-center gap-5"><a className="transition hover:text-stone-950" href={githubHref}>{text.github}</a><a className="transition hover:text-stone-950" href={obsidianHref}>{text.obsidian}</a><span>© {new Date().getFullYear()}</span></div>
        </div>
      </footer>
    </main>
  );
}
