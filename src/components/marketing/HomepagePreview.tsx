'use client';

import { useState } from 'react';

type Language = 'en' | 'zh';
type PreviewTab = 'overview' | 'objects' | 'reviews';

type HomepagePreviewProps = {
  language: Language;
  appHref: string;
};

const copy = {
  en: {
    eyebrow: 'Product preview',
    title: 'See the decision system before opening the app.',
    description:
      'Fictional data shows how Ownly connects ownership, recurring cost, use and review. Nothing here requests folder access or saves changes.',
    open: 'Open the real app',
    note: 'Sample data · no permission · no persistence',
    tabs: { overview: 'Overview', objects: 'Objects', reviews: 'Reviews' },
    metrics: [
      ['Monthly fixed cost', '$107'],
      ['Active possessions', '42'],
      ['Reviews due', '3'],
      ['Tracked experience', '18 mo'],
    ],
    recent: 'Recent ownership facts',
    recentItems: [
      ['Noise-cancelling headphones', '18 uses · worth keeping', 'Keep'],
      ['Cloud storage plan', '$119.88 / year · review in 12 days', 'Review'],
      ['Weekend camera', '$1,240 acquired · low recent use', 'Observe'],
    ],
    cue: 'Decision cue',
    cueText: 'The camera has been used twice in six months. Review the lived experience before buying another lens.',
    costs: 'Recurring cost map',
    costRows: [
      ['Cloud storage', '$9.99 / month', 'Essential'],
      ['Music service', '$10.99 / month', 'Review'],
      ['Design software', '$19.99 / month', 'Active'],
      ['Gym membership', '$65 / month', 'Used 3×'],
    ],
    objectsTitle: 'Objects are decisions, not inventory rows.',
    objectsIntro: 'Each record combines acquisition facts, real use, condition, cost and the next decision point.',
    objects: [
      ['Sony WH-1000XM5', 'Physical item', '$349', 'Using', '18 uses · excellent condition'],
      ['iCloud+', 'Recurring cost', '$119.88 / yr', 'Active', 'Review in 12 days'],
      ['Kyoto autumn trip', 'Experience', '$1,860', 'Reviewed', '9.2 / 10 experience score'],
      ['Weekend camera', 'Physical item', '$1,240', 'Idle', '2 uses in 6 months'],
    ],
    reviewsTitle: 'Turn lived experience into the next decision.',
    reviewsIntro: 'Reviews connect cost and use with a clear keep, renew, transfer or exit action.',
    reviews: [
      ['Weekend camera', 'Due now', 'Low use', 'Decide whether to keep or transfer before another lens purchase.'],
      ['Cloud storage plan', 'In 12 days', 'Renewal', 'Confirm storage need and compare the annual plan before renewal.'],
      ['Kyoto autumn trip', 'Completed', 'Experience', 'Food 8.7 · scenery 9.5 · overall experience 9.2.'],
    ],
  },
  zh: {
    eyebrow: '产品预览',
    title: '进入应用之前，先看清 Ownly 如何支持决策。',
    description:
      '这里使用虚构数据展示 Ownly 如何连接所有权、持续支出、真实使用和回顾。不会请求文件夹权限，也不会保存任何修改。',
    open: '打开真实应用',
    note: '示例数据 · 无需权限 · 不保存修改',
    tabs: { overview: '总览', objects: '对象', reviews: '回顾' },
    metrics: [
      ['每月固定支出', '¥764'],
      ['当前物品', '42'],
      ['待回顾', '3'],
      ['持续记录', '18 个月'],
    ],
    recent: '最近的所有权事实',
    recentItems: [
      ['降噪耳机', '已使用 18 次 · 值得保留', '保留'],
      ['云存储订阅', '¥828 / 年 · 12 天后回顾', '回顾'],
      ['周末相机', '购入 ¥8,900 · 最近使用较少', '观察'],
    ],
    cue: '决策提示',
    cueText: '这台相机半年只使用了两次。购买下一支镜头前，先回顾真实使用体验。',
    costs: '持续支出图谱',
    costRows: [
      ['云存储', '¥69 / 月', '必要'],
      ['音乐服务', '¥88 / 月', '回顾'],
      ['设计软件', '¥138 / 月', '使用中'],
      ['健身会员', '¥469 / 月', '本月 3 次'],
    ],
    objectsTitle: '对象不是库存行，而是一项持续发生的决定。',
    objectsIntro: '每条记录把购入事实、真实使用、状态、成本和下一次决策放在一起。',
    objects: [
      ['Sony WH-1000XM5', '实物', '¥2,499', '使用中', '已使用 18 次 · 状态良好'],
      ['iCloud+', '持续支出', '¥828 / 年', '有效', '12 天后回顾'],
      ['京都秋日旅行', '经历', '¥13,300', '已回顾', '体验评分 9.2 / 10'],
      ['周末相机', '实物', '¥8,900', '闲置', '半年使用 2 次'],
    ],
    reviewsTitle: '把真实体验转化为下一次决定。',
    reviewsIntro: '回顾把成本和使用连接起来，形成保留、续费、转让或退出的明确行动。',
    reviews: [
      ['周末相机', '现在', '低使用', '在购买新镜头前，判断应继续保留还是转让。'],
      ['云存储订阅', '12 天后', '续费', '续费前确认存储需求，并比较年度方案。'],
      ['京都秋日旅行', '已完成', '经历', '饮食 8.7 · 风景 9.5 · 综合体验 9.2。'],
    ],
  },
} as const;

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomepagePreview({ language, appHref }: HomepagePreviewProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>('overview');
  const text = copy[language];

  return (
    <section id="preview" className="relative min-h-screen scroll-mt-20 overflow-hidden border-y border-stone-900/8 bg-[#ebe7dc] px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(16,185,129,0.11),transparent_32%),radial-gradient(circle_at_84%_82%,rgba(28,25,23,0.08),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">{text.eyebrow}</p>
            <h2 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-5xl">{text.title}</h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-stone-600">{text.description}</p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <span className="rounded-full border border-stone-900/10 bg-white/60 px-4 py-2 text-xs font-medium text-stone-500 backdrop-blur">{text.note}</span>
            <a href={appHref} className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(28,25,23,0.55)] transition hover:-translate-y-0.5 hover:bg-stone-800">
              {text.open}<ArrowIcon />
            </a>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-[2.1rem] border border-stone-950/12 bg-stone-950 p-2.5 shadow-[0_40px_110px_-48px_rgba(28,25,23,0.72)] sm:p-3.5">
          <div className="grid min-h-[610px] overflow-hidden rounded-[1.55rem] bg-[#f8f6f0] lg:grid-cols-[210px_1fr]">
            <aside className="border-b border-stone-200 bg-white/72 p-5 backdrop-blur lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-[0.65rem] bg-stone-950 text-xs font-semibold text-white shadow-sm">O</span>
                <div><p className="text-sm font-semibold">Ownly</p><p className="text-[9px] font-medium tracking-[0.12em] text-stone-400">LOCAL PREVIEW</p></div>
              </div>
              <nav className="mt-7 grid grid-cols-3 gap-2 lg:grid-cols-1" aria-label={text.eyebrow}>
                {(Object.keys(text.tabs) as PreviewTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${activeTab === tab ? 'bg-stone-950 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'}`}
                  >
                    {text.tabs[tab]}
                  </button>
                ))}
              </nav>
              <div className="mt-8 hidden rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-4 text-xs leading-5 text-emerald-900 lg:block">
                Markdown + YAML<br />Local data folder<br />No hosted database
              </div>
            </aside>

            <div className="p-4 sm:p-6 lg:p-8">
              {activeTab === 'overview' ? (
                <div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {text.metrics.map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-[0_1px_0_rgba(28,25,23,0.02)]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">{label}</p>
                        <p className="mt-3 text-2xl font-semibold tracking-[-0.045em]">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                    <section className="rounded-2xl border border-stone-200 bg-white p-5">
                      <h3 className="text-sm font-semibold">{text.recent}</h3>
                      <div className="mt-4 space-y-3">
                        {text.recentItems.map(([title, meta, tag]) => (
                          <div key={title} className="flex items-center justify-between gap-4 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-100">
                            <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-stone-500">{meta}</p></div>
                            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-stone-600 ring-1 ring-stone-200">{tag}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                    <div className="space-y-4">
                      <section className="rounded-2xl bg-emerald-900 p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.cue}</p>
                        <p className="mt-5 text-sm font-medium leading-6">{text.cueText}</p>
                        <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full w-[64%] rounded-full bg-emerald-300" /></div>
                      </section>
                      <section className="rounded-2xl border border-stone-200 bg-white p-5">
                        <h3 className="text-sm font-semibold">{text.costs}</h3>
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
                  <h3 className="text-3xl font-semibold tracking-[-0.04em]">{text.objectsTitle}</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{text.objectsIntro}</p>
                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {text.objects.map(([title, kind, cost, status, note]) => (
                      <article key={title} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(28,25,23,0.4)]">
                        <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">{kind}</span><span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-semibold text-stone-600">{status}</span></div>
                        <h4 className="mt-6 text-lg font-semibold">{title}</h4><p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{cost}</p><p className="mt-4 text-xs leading-5 text-stone-500">{note}</p>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeTab === 'reviews' ? (
                <div>
                  <h3 className="text-3xl font-semibold tracking-[-0.04em]">{text.reviewsTitle}</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{text.reviewsIntro}</p>
                  <div className="mt-8 space-y-3">
                    {text.reviews.map(([title, timing, kind, description]) => (
                      <article key={title} className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div><div className="flex flex-wrap items-center gap-2"><h4 className="text-base font-semibold">{title}</h4><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-100">{kind}</span></div><p className="mt-2 text-xs leading-5 text-stone-500">{description}</p></div>
                        <span className="text-xs font-semibold text-stone-500">{timing}</span>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
