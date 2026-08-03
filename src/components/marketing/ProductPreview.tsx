'use client';

import { useState } from 'react';
import { useI18n } from '@/core/i18n-context';

type PreviewTab = 'overview' | 'objects' | 'reviews';

type ProductPreviewProps = {
  appHref: string;
  homeHref: string;
};

const previewCopy = {
  en: {
    demo: 'Product preview',
    demoNote: 'Sample data only · no folder permission requested · nothing is saved',
    back: 'Back to product page',
    start: 'Start with my data',
    nav: {
      overview: 'Overview',
      objects: 'Objects',
      reviews: 'Reviews',
    },
    heading: 'A calm view of what you own and what deserves attention.',
    subheading:
      'This preview uses fictional records to show Ownly’s decision workflow. The real app reads and writes only the local Ownly data folder you choose.',
    metrics: [
      ['Monthly fixed cost', '$107'],
      ['Active possessions', '42'],
      ['Reviews due', '3'],
      ['Tracked experience', '18 mo'],
    ],
    cue: 'Decision cue',
    cueText:
      'The camera has been used twice in six months. Review the real experience before buying another lens.',
    recent: 'Recent ownership facts',
    recentItems: [
      ['Noise-cancelling headphones', 'Used 18 times · worth keeping', 'Keep'],
      ['Cloud storage plan', '$119.88 / year · review in 12 days', 'Review'],
      ['Weekend camera', '$1,240 acquired · low recent use', 'Observe'],
    ],
    costTitle: 'Recurring cost map',
    costRows: [
      ['Cloud storage', '$9.99 / month', 'Essential'],
      ['Music service', '$10.99 / month', 'Review'],
      ['Design software', '$19.99 / month', 'Active'],
      ['Gym membership', '$65 / month', 'Used 3×'],
    ],
    objectsTitle: 'Objects are decisions, not inventory rows.',
    objectsIntro:
      'Each record combines acquisition facts, use, condition, recurring cost and the next decision point.',
    objects: [
      ['Sony WH-1000XM5', 'Physical item', '$349', 'Using', '18 uses · excellent condition'],
      ['iCloud+', 'Recurring cost', '$119.88 / yr', 'Active', 'Review in 12 days'],
      ['Kyoto autumn trip', 'Experience', '$1,860', 'Reviewed', '9.2 / 10 experience score'],
      ['Weekend camera', 'Physical item', '$1,240', 'Idle', '2 uses in 6 months'],
    ],
    reviewsTitle: 'Turn lived experience into the next decision.',
    reviewsIntro:
      'Reviews connect costs and use with a clear keep, renew, replace, transfer or exit decision.',
    reviews: [
      ['Weekend camera', 'Due now', 'Low use', 'Decide whether to keep or transfer before another lens purchase.'],
      ['Cloud storage plan', 'In 12 days', 'Renewal', 'Confirm storage need and compare the annual plan before renewal.'],
      ['Kyoto autumn trip', 'Completed', 'Experience', 'Food 8.7 · scenery 9.5 · overall experience 9.2.'],
    ],
    local: 'In the real app, every fact remains readable Markdown in your local folder.',
  },
  zh: {
    demo: '产品预览',
    demoNote: '仅使用示例数据 · 不请求文件夹权限 · 不保存任何修改',
    back: '返回产品主页',
    start: '开始使用我的数据',
    nav: {
      overview: '总览',
      objects: '对象',
      reviews: '回顾',
    },
    heading: '用一个安静、清晰的界面，看见你拥有什么，以及什么值得重新审视。',
    subheading:
      '本预览使用虚构记录展示 Ownly 的决策工作流。真实应用只会读写你主动选择的本地 Ownly 数据文件夹。',
    metrics: [
      ['每月固定支出', '¥764'],
      ['当前物品', '42'],
      ['待回顾', '3'],
      ['持续记录', '18 个月'],
    ],
    cue: '决策提示',
    cueText: '这台相机半年只使用了两次。购买下一支镜头前，先回顾真实使用体验。',
    recent: '最近的所有权事实',
    recentItems: [
      ['降噪耳机', '已使用 18 次 · 值得保留', '保留'],
      ['云存储订阅', '¥828 / 年 · 12 天后回顾', '回顾'],
      ['周末相机', '购入 ¥8,900 · 最近使用较少', '观察'],
    ],
    costTitle: '持续支出图谱',
    costRows: [
      ['云存储', '¥69 / 月', '必要'],
      ['音乐服务', '¥88 / 月', '回顾'],
      ['设计软件', '¥138 / 月', '使用中'],
      ['健身会员', '¥469 / 月', '本月 3 次'],
    ],
    objectsTitle: '对象不是库存行，而是一项持续发生的决定。',
    objectsIntro: '每条记录把购入事实、使用、状态、持续成本和下一次决策放在一起。',
    objects: [
      ['Sony WH-1000XM5', '实物', '¥2,499', '使用中', '已使用 18 次 · 状态良好'],
      ['iCloud+', '持续支出', '¥828 / 年', '有效', '12 天后回顾'],
      ['京都秋日旅行', '经历', '¥13,300', '已回顾', '体验评分 9.2 / 10'],
      ['周末相机', '实物', '¥8,900', '闲置', '半年使用 2 次'],
    ],
    reviewsTitle: '把真实体验转化为下一次决定。',
    reviewsIntro: '回顾把成本和使用连接起来，形成保留、续费、更换、转让或退出的明确判断。',
    reviews: [
      ['周末相机', '现在', '低使用', '在购买新镜头前，判断应继续保留还是转让。'],
      ['云存储订阅', '12 天后', '续费', '续费前确认存储需求，并比较年度方案。'],
      ['京都秋日旅行', '已完成', '经历', '饮食 8.7 · 风景 9.5 · 综合体验 9.2。'],
    ],
    local: '在真实应用中，每一条事实都以可读的 Markdown 留在你的本地文件夹。',
  },
} as const;

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProductPreview({ appHref, homeHref }: ProductPreviewProps) {
  const { language } = useI18n();
  const [activeTab, setActiveTab] = useState<PreviewTab>('overview');
  const text = previewCopy[language];

  return (
    <main className="min-h-screen bg-[#f4f1e9] text-stone-950">
      <div className="border-b border-emerald-900/10 bg-emerald-50 px-4 py-2 text-center text-xs font-medium text-emerald-900">
        <span className="font-semibold">{text.demo}</span>
        <span className="mx-2 text-emerald-700/40">·</span>
        {text.demoNote}
      </div>

      <header className="border-b border-stone-900/8 bg-[#f4f1e9]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <a href={homeHref} className="flex items-center gap-2.5" aria-label={text.back}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-950 text-sm font-semibold text-white">O</span>
            <span className="text-lg font-semibold tracking-[-0.03em]">Ownly</span>
          </a>
          <div className="flex items-center gap-3">
            <a className="hidden text-sm font-medium text-stone-600 hover:text-stone-950 sm:block" href={homeHref}>{text.back}</a>
            <a href={appHref} className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800">
              {text.start}<ArrowIcon />
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">{text.demo}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">{text.heading}</h1>
          <p className="mt-5 text-base leading-7 text-stone-600">{text.subheading}</p>
        </div>

        <div className="mt-10 overflow-hidden rounded-[2rem] border border-stone-900/10 bg-stone-950 p-2 shadow-[0_30px_90px_-35px_rgba(28,25,23,0.45)] sm:p-3">
          <div className="grid min-h-[650px] overflow-hidden rounded-[1.45rem] bg-[#f8f6f0] lg:grid-cols-[220px_1fr]">
            <aside className="border-b border-stone-200 bg-white/70 p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-950 text-xs font-semibold text-white">O</span>
                <div><p className="text-sm font-semibold">Ownly</p><p className="text-[10px] text-stone-400">LOCAL PREVIEW</p></div>
              </div>
              <nav className="mt-6 grid grid-cols-3 gap-2 lg:grid-cols-1" aria-label={text.demo}>
                {(Object.keys(text.nav) as PreviewTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${activeTab === tab ? 'bg-stone-950 text-white' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'}`}
                  >
                    {text.nav[tab]}
                  </button>
                ))}
              </nav>
              <div className="mt-8 hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900 lg:block">
                {text.local}
              </div>
            </aside>

            <div className="p-4 sm:p-6 lg:p-8">
              {activeTab === 'overview' ? (
                <div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {text.metrics.map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-stone-200 bg-white p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">{label}</p>
                        <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                    <section className="rounded-2xl border border-stone-200 bg-white p-5">
                      <h2 className="text-sm font-semibold">{text.recent}</h2>
                      <div className="mt-4 space-y-3">
                        {text.recentItems.map(([title, meta, tag]) => (
                          <div key={title} className="flex items-center justify-between gap-4 rounded-xl bg-stone-50 p-4">
                            <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-stone-500">{meta}</p></div>
                            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-stone-600 ring-1 ring-stone-200">{tag}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                    <div className="space-y-4">
                      <section className="rounded-2xl bg-emerald-900 p-5 text-white">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.cue}</p>
                        <p className="mt-5 text-sm font-medium leading-6">{text.cueText}</p>
                        <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full w-[64%] rounded-full bg-emerald-300" /></div>
                      </section>
                      <section className="rounded-2xl border border-stone-200 bg-white p-5">
                        <h2 className="text-sm font-semibold">{text.costTitle}</h2>
                        <div className="mt-4 space-y-3">
                          {text.costRows.map(([name, amount, status]) => (
                            <div key={name} className="flex items-center justify-between gap-3 text-xs">
                              <div><p className="font-semibold text-stone-800">{name}</p><p className="mt-0.5 text-stone-400">{status}</p></div>
                              <span className="font-medium text-stone-600">{amount}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === 'objects' ? (
                <div>
                  <h2 className="text-3xl font-semibold tracking-[-0.04em]">{text.objectsTitle}</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{text.objectsIntro}</p>
                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {text.objects.map(([title, kind, cost, status, note]) => (
                      <article key={title} className="rounded-2xl border border-stone-200 bg-white p-5">
                        <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">{kind}</span><span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-semibold text-stone-600">{status}</span></div>
                        <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                        <p className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{cost}</p>
                        <p className="mt-4 text-xs leading-5 text-stone-500">{note}</p>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeTab === 'reviews' ? (
                <div>
                  <h2 className="text-3xl font-semibold tracking-[-0.04em]">{text.reviewsTitle}</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{text.reviewsIntro}</p>
                  <div className="mt-8 space-y-4">
                    {text.reviews.map(([title, due, kind, decision], index) => (
                      <article key={title} className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-[48px_1fr_auto] sm:items-center">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-stone-950 text-sm font-semibold text-white">0{index + 1}</span>
                        <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{title}</h3><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">{kind}</span></div><p className="mt-2 text-xs leading-5 text-stone-500">{decision}</p></div>
                        <span className="text-xs font-semibold text-stone-500">{due}</span>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-3xl bg-emerald-900 px-6 py-7 text-white sm:flex-row sm:items-center">
          <p className="max-w-2xl text-sm leading-6 text-emerald-100">{text.local}</p>
          <a href={appHref} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:-translate-y-0.5">
            {text.start}<ArrowIcon />
          </a>
        </div>
      </section>
    </main>
  );
}
