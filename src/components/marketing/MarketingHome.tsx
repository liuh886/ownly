'use client';

import { useState } from 'react';
import { HomepagePreview } from './HomepagePreview';

type Language = 'en' | 'zh';

type MarketingHomeProps = {
  appHref: string;
  githubHref: string;
  obsidianHref: string;
};

const copy = {
  en: {
    nav: ['Preview', 'Why Ownly', 'Local first', 'Ways to use'],
    eyebrow: 'A local-first ownership memory',
    title: 'Know what you own. Understand what it costs. Decide what deserves to stay.',
    description:
      'Ownly turns possessions, recurring costs and important experiences into a portable decision ledger. No account is required, and your personal records remain readable Markdown on your device.',
    open: 'Open Ownly',
    preview: 'See the product',
    proof: ['No required account', 'Plain Markdown', 'Backup and restore', 'Open source'],
    quietSignal: 'A quieter way to make ownership decisions',
    facts: [
      ['42', 'active possessions'],
      ['$107', 'monthly fixed cost'],
      ['3', 'reviews due'],
    ],
    valueEyebrow: 'From memory to evidence',
    valueTitle: 'Ownly is not another inventory app.',
    valueIntro:
      'It preserves the facts behind ownership so the next purchase, renewal, transfer or exit can be based on lived evidence instead of memory.',
    values: [
      ['01', 'Remember what entered your life', 'Record physical items, subscriptions, plans and experiences in one durable, human-readable system.'],
      ['02', 'Understand the real cost', 'Bring price, recurring expense, use, condition and time into the same ownership picture.'],
      ['03', 'Review before the next decision', 'Use real experience to decide whether to keep, renew, replace, transfer or let go.'],
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
      ['web', 'Web / PWA', 'Start here', 'Use Ownly in a current desktop Chrome or Edge browser, then install the app for a focused standalone experience.'],
      ['obsidian', 'Obsidian plugin', 'Vault native', 'Work with the same records inside an Obsidian Vault while retaining direct Markdown access.'],
      ['github', 'Agent CLI', 'Fact ready', 'Use deterministic JSON commands for scripts, automation and external agents without turning Ownly into an AI assistant.'],
    ],
    boundariesTitle: 'Clear product boundaries',
    boundariesText:
      'Direct local-folder access currently targets desktop Chrome and Edge. Mobile direct-folder access is not presented as a production capability.',
    finalTitle: 'Make ownership easier to remember—and easier to reconsider.',
    finalText: 'Open the app in your browser. Your first real record can remain on your device from day one.',
    github: 'View on GitHub',
    obsidian: 'Obsidian plugin',
    footer: 'Own less. Live more. Decide better.',
  },
  zh: {
    nav: ['产品预览', '为什么是 Ownly', '本地优先', '使用方式'],
    eyebrow: '本地优先的所有权记忆系统',
    title: '记住你拥有什么，理解它付出了什么，并判断它是否仍值得留下。',
    description:
      'Ownly 将物品、持续支出和重要经历组织成可迁移的决策账本。无需注册账户，个人记录以可读的 Markdown 保存在你的设备中。',
    open: '打开 Ownly',
    preview: '查看产品',
    proof: ['无需注册账户', '纯 Markdown', '备份与恢复', '开源'],
    quietSignal: '一种更安静、更有依据的所有权决策方式',
    facts: [
      ['42', '当前物品'],
      ['¥764', '每月固定支出'],
      ['3', '待回顾'],
    ],
    valueEyebrow: '从记忆走向证据',
    valueTitle: 'Ownly 不只是另一个物品清单。',
    valueIntro:
      '它保存所有权背后的事实，让下一次购买、续费、转让或退出，不再只依赖模糊记忆。',
    values: [
      ['01', '记住什么进入了你的生活', '用一个持久、可读的系统记录物品、订阅、计划和重要经历。'],
      ['02', '理解真实成本', '把价格、持续支出、使用频率、状态和时间放在同一张所有权图景中。'],
      ['03', '在下一次决定前回顾', '根据真实经历判断保留、续费、更换、转让或放弃。'],
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
      ['web', 'Web / PWA', '推荐入口', '在桌面版 Chrome 或 Edge 中使用，并安装为专注、独立的应用窗口。'],
      ['obsidian', 'Obsidian 插件', '原生 Vault', '在 Obsidian Vault 中使用同一批记录，并保留直接查看和编辑 Markdown 的能力。'],
      ['github', 'Agent CLI', '事实就绪', '通过确定性的 JSON 命令支持脚本、自动化和外部 Agent，但 Ownly 本身不是 AI 助手。'],
    ],
    boundariesTitle: '明确的产品边界',
    boundariesText:
      '本地文件夹直连目前以桌面版 Chrome 和 Edge 为生产目标，移动端本地文件夹访问不会被包装成已经成熟的能力。',
    finalTitle: '让所有权更容易被记住，也更容易被重新审视。',
    finalText: '从浏览器打开应用，你的第一条真实记录从第一天起就可以留在自己的设备中。',
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
  const sectionLinks = ['#preview', '#why', '#local-first', '#platforms'];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f2ea] text-stone-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-stone-900/[0.07] bg-[#f5f2ea]/82 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <a href="#top" className="flex items-center gap-2.5" aria-label="Ownly home">
            <span className="grid h-9 w-9 place-items-center rounded-[0.72rem] bg-stone-950 text-sm font-semibold text-white shadow-[0_7px_18px_-8px_rgba(28,25,23,0.7)]">O</span>
            <span className="text-lg font-semibold tracking-[-0.035em]">Ownly</span>
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
              className="rounded-full border border-stone-300/80 bg-white/55 px-3 py-2 text-xs font-semibold text-stone-700 backdrop-blur transition hover:border-stone-400 hover:bg-white"
              aria-label={language === 'en' ? '切换到中文' : 'Switch to English'}
            >
              {language === 'en' ? '中文' : 'EN'}
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

      <div id="top" />
      <section className="relative flex min-h-screen items-center overflow-hidden px-5 pb-16 pt-28 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(28,25,23,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(28,25,23,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_84%)]" />
        <div className="pointer-events-none absolute -left-24 top-20 h-[32rem] w-[32rem] rounded-full bg-emerald-300/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-48 bottom-0 h-[30rem] w-[30rem] rounded-full bg-stone-300/45 blur-3xl" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-14 lg:grid-cols-[1.03fr_0.97fr] lg:items-center">
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-emerald-50/70 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-900 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
              {text.eyebrow}
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.068em] sm:text-6xl lg:text-[4.7rem]">{text.title}</h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">{text.description}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href={appHref}
                onClick={() => trackPublicCta('hero_open_app')}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_14px_36px_-14px_rgba(28,25,23,0.72)] transition hover:-translate-y-0.5 hover:bg-stone-800"
              >
                {text.open}<ArrowIcon />
              </a>
              <a
                href="#preview"
                onClick={() => trackPublicCta('hero_preview_scroll')}
                className="inline-flex items-center justify-center rounded-full border border-stone-300/90 bg-white/62 px-6 py-3.5 text-sm font-semibold text-stone-800 backdrop-blur transition hover:-translate-y-0.5 hover:border-stone-400 hover:bg-white"
              >
                {text.preview}
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-stone-500">
              {text.proof.map((item) => <span key={item} className="inline-flex items-center gap-1.5"><CheckIcon />{item}</span>)}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.16),rgba(245,242,234,0)_68%)]" />
            <div className="absolute -left-5 top-20 z-20 hidden rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-[0_16px_45px_-24px_rgba(28,25,23,0.55)] backdrop-blur-xl sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">LOCAL DATA</p>
              <p className="mt-1 text-xs font-semibold">Markdown + YAML</p>
            </div>
            <div className="absolute -right-3 bottom-16 z-20 hidden rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-[0_16px_45px_-24px_rgba(28,25,23,0.55)] backdrop-blur-xl sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">NEXT REVIEW</p>
              <p className="mt-1 text-xs font-semibold">Camera · due now</p>
            </div>

            <div className="rounded-[2.2rem] border border-stone-950/12 bg-stone-950 p-3 shadow-[0_38px_100px_-42px_rgba(28,25,23,0.78)] sm:p-4">
              <div className="overflow-hidden rounded-[1.55rem] bg-[#faf8f2]">
                <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-950 text-xs font-semibold text-white">O</span>
                    <div><p className="text-sm font-semibold">Ownly</p><p className="text-[10px] text-stone-500">{text.quietSignal}</p></div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-800">LOCAL</span>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                  {text.facts.map(([value, label]) => (
                    <div key={label} className="rounded-2xl border border-stone-200/90 bg-white p-4">
                      <p className="text-2xl font-semibold tracking-[-0.045em]">{value}</p>
                      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.11em] text-stone-400">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 px-4 pb-4 sm:grid-cols-[1.15fr_0.85fr] sm:px-5 sm:pb-5">
                  <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold">Ownership facts</p><span className="text-[10px] text-stone-400">Markdown</span></div>
                    <div className="space-y-3">
                      <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-100"><p className="text-xs font-semibold">Noise-cancelling headphones</p><p className="mt-1 text-[10px] leading-4 text-stone-500">Used 18 times · worth keeping</p></div>
                      <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-100"><p className="text-xs font-semibold">Cloud storage plan</p><p className="mt-1 text-[10px] leading-4 text-stone-500">Review in 12 days</p></div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-emerald-900 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">Decision cue</p>
                    <p className="mt-5 text-sm font-medium leading-6">Low camera use. Review before buying another lens.</p>
                    <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full w-[64%] rounded-full bg-emerald-300" /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HomepagePreview language={language} appHref={appHref} />

      <section id="why" className="scroll-mt-20 bg-white/45">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">{text.valueEyebrow}</p>
          <div className="mt-5 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <h2 className="text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">{text.valueTitle}</h2>
            <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">{text.valueIntro}</p>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {text.values.map(([number, title, description]) => (
              <article key={number} className="group rounded-[1.75rem] border border-stone-900/10 bg-[#f8f6f0] p-7 transition duration-300 hover:-translate-y-1 hover:border-stone-900/15 hover:shadow-[0_24px_55px_-38px_rgba(28,25,23,0.48)] sm:p-8">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold tracking-[0.18em] text-emerald-800">{number}</p><span className="h-8 w-8 rounded-full border border-stone-200 bg-white/70 transition group-hover:scale-110" /></div>
                <h3 className="mt-12 text-2xl font-semibold tracking-[-0.035em]">{title}</h3>
                <p className="mt-4 text-sm leading-6 text-stone-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="local-first" className="scroll-mt-20 bg-stone-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-10 lg:py-28">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">{text.localEyebrow}</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">{text.localTitle}</h2>
            <p className="mt-6 text-base leading-7 text-stone-300">{text.localText}</p>
            <div className="mt-8 space-y-3">{text.localPoints.map((point) => <div key={point} className="flex gap-3 text-sm leading-6 text-stone-200"><CheckIcon />{point}</div>)}</div>
          </div>
          <div className="rounded-[2rem] border border-white/12 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-7">
            <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-4 text-center text-sm font-semibold text-emerald-100">{text.architecture[0]}</div>
            <div className="mx-auto h-10 w-px bg-gradient-to-b from-emerald-300/60 to-white/20" />
            <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5 text-center"><p className="text-sm font-semibold">{text.architecture[1]}</p><p className="mt-1 text-xs text-stone-400">{text.architecture[2]}</p></div>
            <div className="grid grid-cols-2 gap-4 pt-10"><div className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-4 text-center text-sm text-stone-200">{text.architecture[3]}</div><div className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-4 text-center text-sm text-stone-200">{text.architecture[4]}</div></div>
          </div>
        </div>
      </section>

      <section id="platforms" className="scroll-mt-20 mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="max-w-3xl"><h2 className="text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">{text.platformsTitle}</h2><p className="mt-5 text-base leading-7 text-stone-600">{text.platformsIntro}</p></div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {text.platforms.map(([kind, title, tag, description]) => {
            const href = kind === 'web' ? appHref : kind === 'obsidian' ? obsidianHref : githubHref;
            const label = kind === 'web' ? text.open : kind === 'obsidian' ? text.obsidian : text.github;
            return (
              <article key={kind} className="flex min-h-64 flex-col rounded-[1.75rem] border border-stone-900/10 bg-white/68 p-7 shadow-[0_12px_36px_-32px_rgba(28,25,23,0.45)] sm:p-8">
                <span className="w-fit rounded-full bg-stone-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">{tag}</span>
                <h3 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">{title}</h3><p className="mt-4 text-sm leading-6 text-stone-600">{description}</p>
                <div className="mt-auto pt-8"><a href={href} onClick={() => trackPublicCta(`platform_${kind}`)} className="inline-flex items-center gap-2 text-sm font-semibold transition hover:text-emerald-800">{label}<ArrowIcon /></a></div>
              </article>
            );
          })}
        </div>
        <div className="mt-5 rounded-[1.75rem] border border-amber-900/12 bg-amber-50/70 p-7 sm:p-8"><h3 className="text-lg font-semibold">{text.boundariesTitle}</h3><p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{text.boundariesText}</p></div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:px-10 lg:pb-28">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-emerald-900 px-7 py-14 text-white shadow-[0_30px_75px_-48px_rgba(6,78,59,0.75)] sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between lg:px-16">
          <div className="max-w-3xl"><h2 className="text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">{text.finalTitle}</h2><p className="mt-5 text-base leading-7 text-emerald-100">{text.finalText}</p></div>
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
