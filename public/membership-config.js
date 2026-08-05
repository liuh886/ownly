(() => {
  'use strict';

  window.HaoMembershipConfig = Object.freeze({
    enabled: true,
    billingEnabled: false,
    pathPrefix: '/ownly/app/',
    appName: 'Ownly',
    productCode: 'ownly',
    entitlementCode: 'ownly.pro',
    supabaseUrl: 'https://blgwlycfcwvsupmqyqwn.supabase.co',
    supabasePublishableKey: 'sb_publishable_n1Va-c_alpkQ0zNuJYUaxA_J0u68RVW',
    checkoutFunctionUrl: 'https://blgwlycfcwvsupmqyqwn.supabase.co/functions/v1/create-checkout-session',
    portalFunctionUrl: 'https://blgwlycfcwvsupmqyqwn.supabase.co/functions/v1/create-portal-session',
    redirectUrl: 'https://liuh886.github.io/ownly/app/',
    privacyNote: 'Ownly records remain in your local data folder. The account only verifies membership access.',
    privacyNoteZh: 'Ownly 记录始终保存在你的本地数据目录中，账户仅用于验证会员权益。',
  });
})();
