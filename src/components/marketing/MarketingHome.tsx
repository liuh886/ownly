'use client';

import { useState } from 'react';

type Language = 'en' | 'zh';

type MarketingHomeProps = {
  appHref: string;
  githubHref: string;
  obsidianHref: string;
};

const copy = {
  en: {
    nav: ['Why Ownly', 'How it works', 'Local first', 'Ways to use'],
    eyebrow: 'A local-first ownership memory',
    title: 'Know what you own. Understand what it costs. Decide what deserves to stay.',
    description:
      'Ownly turns possessions, recurring costs and important experiences into a portable decision ledger. No account is required, and your personal records remain readable Markdown on your device.',
    open: 'Open Ownly',
    preview: 'Explore the preview',
    proof: ['No required account', 'Plain Markdown', 'Backup and restore', 'Open source'],
    dashboard: {
      label: 'Your ownership, made legible',
      recurring: 'Annual recurring cost',
      recurringValue: '$1,284',
      possessions: 'Active possessions',
      possessionsValue: '42',
      reviews: 'Reviews due',
      reviewsValue: '3',
      cue: 'Decision cue',
      cueText: 'The camera has been used twice in six months. Review before buying another lens.',
      itemOne: 'Noise-cancelling headphones',
      itemOneMeta: 'Used 18 times · worth keeping',
      itemTwo: 'Cloud storage plan',
      itemTwoMeta: '$119.88 / year · review in 12 days',
    },
    valueTitle: 'Ownly is not another inventory app.',
    valueIntro:
      'It preserves the facts behind ownership so the next purchase, renewal, transfer or exit can be based on lived evidence instead of memory.',
    values: [
      ['01', 'Remember what entered your life', 'Record physical items, subscriptions, plans and experiences in one durable, human-readable system.'],
      ['02', 'Understand the real cost', 'Bring price, recurring expense, use, condition and time into the same ownership picture.'],
      ['03', 'Review before the next decision', 'Use real experience to decide whether to keep, renew, replace, transfer or let go.'],
    ],
    workflowTitle: 'A simple decision loop',
    workflowIntro: 'Ownly follows the life of a decision rather than treating every record as a static list item.',
    workflow: [
      ['Record', 'Capture what you acquired, planned or committed to.'],
      ['Use', 'Log meaningful use, issues, maintenance and lessons.'],
      ['Review', 'Compare cost and experience when a decision is due.'],
      ['Decide', 'Keep, renew, replace, transfer, archive or exit with evidence.'],
    ],
    localEyebrow: 'Your facts should remain yours',
    localTitle: 'Local first is an operating model, not a slogan.',
    localText:
      'Ownly works directly with an Ownly data folder. Records stay in Markdown with YAML frontmatter, so they can be inspected, searched, backed up and migrated without a proprietary hosted database.',
    localPoints: [
      'No mandatory cloud account or personal-data upload',
      'Versioned backup, validation, restore and migration',
      'One data model across Web/PWA, Obsidian and the Agent CLI',
      'Fact-ready data that remains useful outside Ownly',
    ],
    architecture: ['Ownly Web / PWA', 'Local Ownly data folder', 'Markdown + YAML', 'Obsidian', 'Agent CLI'],
    platformsTitle: 'Use Ownly your way',
    platformsIntro:
      'The Web app and installed PWA share one browser runtime. Obsidian and the CLI provide deeper access to the same local facts.',
    platforms: [
      ['web', 'Web / PWA', 'Start here', 'Use Ownly in a current desktop Chrome or Edge browser, then install it as a focused standalone app.'],
      ['obsidian', 'Obsidian plugin', 'Vault native', 'Work with the same records inside an Obsidian Vault while retaining direct Markdown access.'],
      ['github', 'Agent CLI', 'Fact ready', 'Use deterministic JSON commands for scripts, automation and external agents without turning Ownly into an AI assistant.'],
    ],
    boundariesTitle: 'Clear product boundaries',
    boundariesText:
      'Direct local-folder access currently targets desktop Chrome and Edge. Unsupported browsers can inspect the public site and preview, but mobile direct-folder access is not presented as a production capability.',
    finalTitle: 'Make ownership easier to remember—and easier to reconsider.',
    finalText: 'Start in the browser. Your first real record can remain on your device from day one.',
    github: 'View on GitHub',
    obsidian: 'Obsidian plugin',
    footer: 'Own less. Live more. Decide better.',
  },
  zh: {
    nav: ['为什么是 Ownly', '如何工作', '本地优先', '使用方式'],
    eyebrow: '本地优先的所有权记忆系统',
    title: '记住你拥有什么，理解它付出了什么，并判断它是否仍值得留下。',
    description:
      'Ownly 将物品、持续支出和重要经历组织成可迁移的决策账本。无需注册账户，个人记录以可读的 Markdown 保存在你的设备中。',
    open: '打开 Ownly',
    preview: '查看产品预览',
    proof: ['无需注册账户', '纯 Markdown', '备份与恢复', '开源'],
    dashboard: {
      label: '让所有权变得清晰',
      recurring: '年度持续支出',
      recurringValue: '¥9,240',
      possessions: '当前物品',
      possessionsValue: '42',
      reviews: '待回顾',
      reviewsValue: '3',
      cue: '决策提示',
      cueText: '这台相机半年只使用了两次。购买下一支镜头前，先完成一次回顾。',
      itemOne: '降噪耳机',
      itemOneMeta: '已使用 18 次 · 值得保留',
      itemTwo: '云存储订阅',
      itemTwoMeta: '¥828 / 年 · 12 天后回顾',
    },
    valueTitle: 'Ownly 不只是另一个物品清单。',
    valueIntro:
      '它保存所有权背后的事实，让下一次购买、续费、转让或退出，不再只依赖模糊记忆。',
    values: [
      ['01', '记住什么进入了你的生活', '用一个持久、可读的系统记录物品、订阅、计划和重要经历。'],
      ['02', '理解真实成本', '把价格、持续支出、使用频率、状态和时间放在同一张所有权图景中。'],
      ['03', '在下一次决定前回顾', '根据真实经历判断保留、续费、更换、转让或放弃。'],
    ],
    workflowTitle: '一个简单的决策闭环',
    workflowIntro: 'Ownly 关注一项决定的完整生命周期，而不是把每条记录变成静态清单。',
    workflow: [
      ['记录', '记录你购入、计划或承诺的对象。'],
      ['使用', '补充关键使用、问题、维护和经验。'],
      ['回顾', '在决定到来时，对照成本与真实体验。'],
      ['决定', '有依据地保留、续费、更换、转让、归档或退出。'],
    ],
    localEyebrow: '你的事实应该始终属于你',
    localTitle: '本地优先是一套运行方式，而不是口号。',
    localText:
      'Ownly 直接使用本地 Ownly 数据文件夹。记录以 Markdown 和 YAML frontmatter 保存，无需依赖专有云数据库，也能被阅读、检索、备份和迁移。',
    localPoints: [
      '无需强制云账户，也不上传个人记录',
      '内置版本化备份、校验、恢复和迁移',
      'Web/PWA、Obsidian 与 Agent CLI 共用同一数据模型',
      '即使离开 Ownly，事实数据仍然可用',
    ],
    architecture: ['Ownly Web / PWA', '本地 Ownly 数据文件夹', 'Markdown + YAML', 'Obsidian', 'Agent CLI'],
    platformsTitle: '选择适合你的使用方式',
    platformsIntro:
      'Web 应用与安装后的 PWA 使用同一浏览器运行时；Obsidian 和 CLI 则提供对同一批本地事实的更深层访问。',
    platforms: [
      ['web', 'Web / PWA', '推荐入口', '在当前桌面版 Chrome 或 Edge 中直接使用，也可以安装为专注、独立的应用窗口。'],
      ['obsidian', 'Obsidian 插件', '原生 Vault', '在 Obsidian Vault 中使用同一批记录，并保留直接查看和编辑 Markdown 的能力。'],
      ['github', 'Agent CLI', '事实就绪', '通过确定性的 JSON 命令支持脚本、自动化和外部 Agent，但 Ownly 本身不是 AI 助手。'],
    ],
    boundariesTitle: '明确的产品边界',
    boundariesText:
      '本地文件夹直连目前以桌面版 Chrome 和 Edge 为生产目标。不支持的浏览器仍可浏览介绍页和产品预览，但移动端本地文件夹访问不会被包装成已经成熟的能力。',
    finalTitle: '让所有权更容易被记住，也更容易被重新审视。',
    finalText: '从浏览器开始，你的第一条真实记录从第一天起就可以留在自己的设备中。',
    github: '查看 GitHub',
    obsidian: 'Obsidian 插件',
    footer: 'Own less. Live more. Decide better.',
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
    <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none">
      <path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarketingHome({ appHref, githubHref, obsidianHref }: MarketingHomeProps) {
  const [language, setLanguage] = useState<Language>('en');
  const text = copy[language];
  const demoHref = `${appHref}?demo=1`;
  const sectionLinks = ['#why', '#workflow', '#local-first', '#platforms'];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f1e9] text-stone-950">
      <header className="sticky top-0 z-40 border-b border-stone-900/8 bg-[#f4f1e9]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <a href="#top" className="flex items-center gap-2.5" aria-label="Ownly home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-950 text-sm font-semibold text-white">O</span>
            <span className="text-lg font-semibold tracking-[-0.03em]">Ownly</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-stone-600 lg:flex" aria-label="Primary navigation">
            {text.nav.map((label, index) => (
              <a key={label} className="transition hover:text-stone-950" href={sectionLinks[index]}>{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
              className="rounded-full border border-stone-300 bg-white/60 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-white"
              aria-label={language === 'en' ? '切换到中文' : 'Switch to English'}
            >
              {language === 'en' ? '中文' : 'EN'}
            </button>
            <a
              href={appHref}
              onClick={() => trackPublicCta('header_open_app')}
              className="hidden items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 sm:flex"
            >
              {text.open}<ArrowIcon />
            </a>
          </div>
        </div>
      </header>

      <div id="top" />
      <section className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-28">
        <div className="relative z-10">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">{text.eyebrow}</p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[0.96] tracking-[-0.065em] sm:text-6xl lg:text-7xl">{text.title}</h1>
          <p className="mt-7 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">{text.description}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href={appHref}
              onClick={() => trackPublicCta('hero_open_app')}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-stone-800"
            >
              {text.open}<ArrowIcon />
            </a>
            <a
              href={demoHref}
              onClick={() => trackPublicCta('hero_preview')}
              className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white/70 px-6 py-3.5 text-sm font-semibold text-stone-800 transition hover:-translate-y-0.5 hover:border-stone-400 hover:bg-white"
            >
              {text.preview}
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-stone-500">
            {text.proof.map((item) => <span key={item} className="inline-flex items-center gap-1.5"><CheckIcon />{item}</span>)}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-12 -z-10 rounded-full bg-[radial-gradient(circle,rgba(5,150,105,0.16),rgba(244,241,233,0)_68%)]" />
          <div className="rounded-[2rem] border border-stone-900/10 bg-stone-950 p-3 shadow-[0_30px_90px_-35px_rgba(28,25,23,0.5)] sm:p-4">
            <div className="overflow-hidden rounded-[1.45rem] bg-[#f8f6f0]">
              <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-950 text-xs font-semibold text-white">O</span>
                  <div><p className="text-sm font-semibold">Ownly</p><p className="text-[10px] text-stone-500">{text.dashboard.label}</p></div>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-800">LOCAL</span>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                {[
                  [text.dashboard.recurring, text.dashboard.recurringValue],
                  [text.dashboard.possessions, text.dashboard.possessionsValue],
                  [text.dashboard.reviews, text.dashboard.reviewsValue],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-stone-400">{label}</p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 px-4 pb-4 sm:grid-cols-[1.1fr_0.9fr] sm:px-5 sm:pb-5">
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold">Recent ownership facts</p><span className="text-[10px] text-stone-400">Markdown</span></div>
                  <div className="space-y-3">
                    <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs font-semibold">{text.dashboard.itemOne}</p><p className="mt-1 text-[10px] leading-4 text-stone-500">{text.dashboard.itemOneMeta}</p></div>
                    <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs font-semibold">{text.dashboard.itemTwo}</p><p className="mt-1 text-[10px] leading-4 text-stone-500">{text.dashboard.itemTwoMeta}</p></div>
                  </div>
                </div>
                <div className="rounded-2xl bg-emerald-900 p-4 text-white">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.dashboard.cue}</p>
                  <p className="mt-5 text-sm font-medium leading-6">{text.dashboard.cueText}</p>
                  <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full w-[64%] rounded-full bg-emerald-300" /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="why" className="border-y border-stone-900/8 bg-white/45">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="max-w-3xl"><h2 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{text.valueTitle}</h2><p className="mt-5 text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">{text.valueIntro}</p></div>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {text.values.map(([number, title, description]) => (
              <article key={number} className="rounded-3xl border border-stone-900/10 bg-[#f8f6f0] p-7 sm:p-8">
                <p className="text-xs font-semibold tracking-[0.18em] text-emerald-800">{number}</p>
                <h3 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">{title}</h3>
                <p className="mt-4 text-sm leading-6 text-stone-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
          <div><h2 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{text.workflowTitle}</h2><p className="mt-5 max-w-xl text-base leading-7 text-stone-600">{text.workflowIntro}</p></div>
          <div className="grid gap-px overflow-hidden rounded-3xl border border-stone-900/10 bg-stone-200 sm:grid-cols-2">
            {text.workflow.map(([title, description], index) => (
              <div key={title} className="bg-[#f8f6f0] p-7 sm:p-8">
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-emerald-800">0{index + 1}</span><span className="h-px w-12 bg-stone-300" /></div>
                <h3 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">{title}</h3><p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="local-first" className="bg-stone-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-10 lg:py-28">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">{text.localEyebrow}</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{text.localTitle}</h2>
            <p className="mt-6 text-base leading-7 text-stone-300">{text.localText}</p>
            <div className="mt-8 space-y-3">{text.localPoints.map((point) => <div key={point} className="flex gap-3 text-sm leading-6 text-stone-200"><CheckIcon />{point}</div>)}</div>
          </div>
          <div className="rounded-[2rem] border border-white/12 bg-white/[0.04] p-5 sm:p-7">
            <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-4 text-center text-sm font-semibold text-emerald-100">{text.architecture[0]}</div>
            <div className="mx-auto h-10 w-px bg-white/20" />
            <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5 text-center"><p className="text-sm font-semibold">{text.architecture[1]}</p><p className="mt-1 text-xs text-stone-400">{text.architecture[2]}</p></div>
            <div className="grid grid-cols-2 gap-4 pt-10"><div className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-4 text-center text-sm text-stone-200">{text.architecture[3]}</div><div className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-4 text-center text-sm text-stone-200">{text.architecture[4]}</div></div>
          </div>
        </div>
      </section>

      <section id="platforms" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="max-w-3xl"><h2 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{text.platformsTitle}</h2><p className="mt-5 text-base leading-7 text-stone-600">{text.platformsIntro}</p></div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {text.platforms.map(([kind, title, tag, description]) => {
            const href = kind === 'web' ? appHref : kind === 'obsidian' ? obsidianHref : githubHref;
            const label = kind === 'web' ? text.open : kind === 'obsidian' ? text.obsidian : text.github;
            return (
              <article key={kind} className="flex min-h-64 flex-col rounded-3xl border border-stone-900/10 bg-white/65 p-7 sm:p-8">
                <span className="w-fit rounded-full bg-stone-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">{tag}</span>
                <h3 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">{title}</h3><p className="mt-4 text-sm leading-6 text-stone-600">{description}</p>
                <div className="mt-auto pt-8"><a href={href} onClick={() => trackPublicCta(`platform_${kind}`)} className="inline-flex items-center gap-2 text-sm font-semibold hover:text-emerald-800">{label}<ArrowIcon /></a></div>
              </article>
            );
          })}
        </div>
        <div className="mt-5 rounded-3xl border border-amber-900/12 bg-amber-50/70 p-7 sm:p-8"><h3 className="text-lg font-semibold">{text.boundariesTitle}</h3><p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{text.boundariesText}</p></div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:px-10 lg:pb-28">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-emerald-900 px-7 py-14 text-white sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between lg:px-16">
          <div className="max-w-3xl"><h2 className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{text.finalTitle}</h2><p className="mt-5 text-base leading-7 text-emerald-100">{text.finalText}</p></div>
          <a href={appHref} onClick={() => trackPublicCta('final_open_app')} className="mt-8 inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-emerald-950 transition hover:-translate-y-0.5 lg:mt-0">{text.open}<ArrowIcon /></a>
        </div>
      </section>

      <footer className="border-t border-stone-900/8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div><span className="font-semibold text-stone-900">Ownly</span><span className="ml-3">{text.footer}</span></div>
          <div className="flex items-center gap-5"><a className="transition hover:text-stone-950" href={githubHref}>{text.github}</a><a className="transition hover:text-stone-950" href={obsidianHref}>{text.obsidian}</a><span>© {new Date().getFullYear()}</span></div>
        </div>
      </footer>
    </main>
  );
}
