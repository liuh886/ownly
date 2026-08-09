(() => {
  'use strict';

  const isOwnlyApp = window.location.pathname.startsWith('/ownly/app/');

  window.HaoAccountConfig = Object.freeze({
    enabled: isOwnlyApp,
    billingEnabled: true,
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
      zh: '账户用于统一身份、保存轻量偏好，并为未来高级模板、数据健康与导出能力建立权益基础。',
      en: 'Your account provides one identity, keeps lightweight preferences, and prepares access for future advanced templates, data health, and export tools.',
    },
    privacyNote: {
      zh: 'Ownly 仍是本地优先产品。Markdown、附件、归档和本地目录不会上传到共享账户。',
      en: 'Ownly remains local-first. Markdown, attachments, archives, and local folders are never uploaded to the shared account.',
    },
    features: [
      { zh: '未来解锁高级模板与数据健康检查', en: 'Prepare for advanced templates and data-health checks' },
      { zh: '未来增强导出、迁移与工作流能力', en: 'Prepare for enhanced export, migration, and workflows' },
      { zh: '与其他 Hao Apps 共用同一登录身份', en: 'Use the same identity across Hao Apps' },
    ],
    feedbackEnabled: false,
  });
})();
