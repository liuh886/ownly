(() => {
  'use strict';

  const isOwnlyApp = window.location.pathname.startsWith('/ownly/app/');

  window.HaoAccountConfig = Object.freeze({
    enabled: isOwnlyApp,
    billingEnabled: true,
    referralEnabled: true,
    appName: 'Ownly',
    productCode: 'ownly',
    entitlementCode: 'ownly.pro',
    supabaseUrl: 'https://blgwlycfcwvsupmqyqwn.supabase.co',
    supabasePublishableKey: 'sb_publishable_n1Va-c_alpkQ0zNuJYUaxA_J0u68RVW',
    checkoutFunctionUrl: 'https://blgwlycfcwvsupmqyqwn.supabase.co/functions/v1/create-checkout-session',
    portalFunctionUrl: 'https://blgwlycfcwvsupmqyqwn.supabase.co/functions/v1/create-portal-session',
    redirectUrl: 'https://liuh886.github.io/ownly/app/',
    mountSelectors: ['[data-account-slot]'],
    compactTrigger: false,
    title: {
      zh: 'Ownly 账户',
      en: 'Ownly account',
    },
    description: {
      zh: 'Ownly 保持本地优先。登录只用于统一身份、轻量偏好和 Pro 权益，不会把你的知识库上传到共享账户。',
      en: 'Ownly stays local-first. Sign-in is only for identity, lightweight preferences, and Pro access; your knowledge base is never uploaded to the shared account.',
    },
    privacyNote: {
      zh: 'Markdown、附件、归档和本地目录不会上传到共享账户。',
      en: 'Markdown, attachments, archives, and local folders are never uploaded to the shared account.',
    },
    proUpgrade: {
      title: { zh: 'Free 与 Ownly Pro', en: 'Free and Ownly Pro' },
      freeTitle: { zh: '核心本地功能保持免费', en: 'Core local features stay free' },
      freeFeatures: [
        { zh: '继续使用本地知识库、Markdown、附件与归档', en: 'Keep using your local knowledge base, Markdown, attachments, and archives' },
      ],
      proTitle: { zh: '支持产品持续开发', en: 'Support continued development' },
      proFeatures: [
        { zh: '保留 Ownly Pro 身份并支持高级能力持续开发', en: 'Keep Ownly Pro status and support continued development of advanced capabilities' },
        { zh: '未来正式上线的高级模板、数据健康与增强导出能力将进入 Pro', en: 'Future released advanced templates, data-health, and enhanced export capabilities will be included in Pro' },
      ],
      note: {
        zh: '当前 Pro 不会减少或锁住现有 Free 核心功能。',
        en: 'Pro does not remove or lock any existing Free core feature.',
      },
      checkoutDescription: {
        zh: 'US$1/月支持 Ownly 持续维护并激活 Pro 身份。现有本地核心功能继续免费。',
        en: 'US$1/month supports Ownly maintenance and activates Pro status. Existing local core features remain free.',
      },
      ctaTitle: { zh: '开通 Ownly Pro', en: 'Upgrade to Ownly Pro' },
    },
    feedbackEnabled: false,
  });
})();
