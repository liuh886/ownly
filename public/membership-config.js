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
      zh: 'Ownly 保持本地优先。登录用于账户权益和轻量偏好；你的知识库仍保存在本地。',
      en: 'Ownly stays local-first. Sign in for account access and lightweight preferences; your knowledge base stays local.',
    },
    privacyNote: {
      zh: 'Markdown、附件、归档和本地目录不会自动上传。',
      en: 'Markdown, attachments, archives, and local folders are not uploaded automatically.',
    },
    proUpgrade: {
      title: { zh: 'Free 与 Ownly Pro', en: 'Free and Ownly Pro' },
      freeTitle: { zh: '核心本地功能保持免费', en: 'Core local features stay free' },
      freeFeatures: [
        { zh: '继续使用本地知识库、Markdown、附件与归档', en: 'Keep using your local knowledge base, Markdown, attachments, and archives' },
      ],
      proTitle: { zh: 'Ownly Pro', en: 'Ownly Pro' },
      proFeatures: [
        { zh: '激活 Ownly Pro 身份；现有本地核心功能继续免费', en: 'Activate Ownly Pro status while existing local core features remain free' },
      ],
      note: {
        zh: 'Ownly Pro 当前不锁定或减少任何现有本地核心功能。',
        en: 'Ownly Pro does not lock or reduce any existing local core feature.',
      },
      checkoutDescription: {
        zh: 'US$1/月开通 Ownly Pro。现有本地核心功能继续免费。',
        en: 'Ownly Pro is US$1/month. Existing local core features remain free.',
      },
      ctaTitle: { zh: '开通 Ownly Pro', en: 'Upgrade to Ownly Pro' },
    },
    feedbackEnabled: false,
  });
})();
