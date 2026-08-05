(() => {
  'use strict';

  const config = window.HaoMembershipConfig || {};
  if (!config.enabled) return;
  if (config.pathPrefix && !window.location.pathname.startsWith(config.pathPrefix)) return;

  const state = {
    client: null,
    user: null,
    entitlements: new Set(),
    loading: true,
    error: '',
    open: false,
  };

  let ui = null;

  const isChinese = () => document.documentElement.lang.toLowerCase().startsWith('zh');
  const copy = () => isChinese()
    ? {
        account: '账户',
        title: `${config.appName || '应用'} 账户`,
        optional: '可选账户',
        intro: config.privacyNote || '账户仅用于验证会员权益，现有本地功能保持不变。',
        google: '使用 Google 登录',
        email: '邮箱地址',
        send: '发送登录链接',
        sent: '登录链接已发送，请检查邮箱。',
        free: 'FREE',
        pro: 'PRO',
        upgrade: '升级 · US$1/月',
        manage: '管理订阅',
        refresh: '刷新权益',
        signOut: '退出登录',
        close: '关闭账户窗口',
        busy: '正在处理…',
        unavailable: '账户服务暂时不可用，当前功能不受影响。',
        signedIn: '登录成功。',
        billingPending: '支付开关尚未启用，当前功能保持不变。',
      }
    : {
        account: 'Account',
        title: `${config.appName || 'App'} account`,
        optional: 'OPTIONAL ACCOUNT',
        intro: config.privacyNote || 'The account only verifies membership access. Existing local features stay unchanged.',
        google: 'Continue with Google',
        email: 'Email address',
        send: 'Send sign-in link',
        sent: 'Sign-in link sent. Check your inbox.',
        free: 'FREE',
        pro: 'PRO',
        upgrade: 'Upgrade · US$1/month',
        manage: 'Manage subscription',
        refresh: 'Refresh access',
        signOut: 'Sign out',
        close: 'Close account dialog',
        busy: 'Working…',
        unavailable: 'Account service is unavailable. Current features remain available.',
        signedIn: 'Signed in.',
        billingPending: 'Billing is not enabled yet. Current features remain unchanged.',
      };

  function snapshot() {
    return Object.freeze({
      configured: true,
      loading: state.loading,
      user: state.user,
      entitlements: [...state.entitlements],
      isPro: state.entitlements.has(config.entitlementCode),
      error: state.error,
    });
  }

  function emit() {
    window.dispatchEvent(new CustomEvent('hao:membership-changed', { detail: snapshot() }));
  }

  function can(code) {
    return state.entitlements.has(String(code || ''));
  }

  async function getClient() {
    if (state.client) return state.client;
    const sdk = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    state.client = sdk.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
    return state.client;
  }

  async function refreshEntitlements() {
    state.entitlements = new Set();
    if (!state.user) {
      render();
      emit();
      return snapshot();
    }
    const client = await getClient();
    const { data, error } = await client
      .from('entitlements')
      .select('entitlement_code,active,valid_until')
      .eq('user_id', state.user.id);
    if (error) throw error;
    const now = Date.now();
    (data || []).forEach((row) => {
      const validUntil = row.valid_until ? new Date(row.valid_until).getTime() : null;
      if (row.active && (!validUntil || validUntil > now)) state.entitlements.add(row.entitlement_code);
    });
    render();
    emit();
    return snapshot();
  }

  async function handleSession(session) {
    state.user = session?.user || null;
    state.error = '';
    try {
      await refreshEntitlements();
    } catch (error) {
      state.error = error?.message || String(error);
      render();
      emit();
    }
  }

  async function signInWithGoogle() {
    setLoading(true);
    try {
      const client = await getClient();
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: config.redirectUrl || window.location.href },
      });
      if (error) throw error;
    } catch (error) {
      state.error = error?.message || String(error);
      setLoading(false);
    }
  }

  async function signInWithEmail(email) {
    const normalized = String(email || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) return;
    setLoading(true);
    try {
      const client = await getClient();
      const { error } = await client.auth.signInWithOtp({
        email: normalized,
        options: {
          emailRedirectTo: config.redirectUrl || window.location.href,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      ui.status.textContent = copy().sent;
      ui.status.dataset.kind = 'success';
    } catch (error) {
      state.error = error?.message || String(error);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    try {
      const client = await getClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      state.user = null;
      state.entitlements = new Set();
      state.error = '';
    } catch (error) {
      state.error = error?.message || String(error);
    } finally {
      setLoading(false);
      emit();
    }
  }

  async function callBilling(url) {
    if (!config.billingEnabled || !url || !state.user) return;
    setLoading(true);
    try {
      const client = await getClient();
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Authentication session is unavailable');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: config.supabasePublishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product_code: config.productCode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || `Membership request failed (${response.status})`);
      window.location.assign(payload.url);
    } catch (error) {
      state.error = error?.message || String(error);
      setLoading(false);
    }
  }

  function setLoading(value) {
    state.loading = Boolean(value);
    render();
  }

  function openDialog() {
    state.open = true;
    render();
  }

  function closeDialog() {
    state.open = false;
    render();
    ui.launcher.focus();
  }

  function render() {
    if (!ui) return;
    const text = copy();
    const signedIn = Boolean(state.user);
    const isPro = can(config.entitlementCode);

    ui.launcher.textContent = isPro ? text.pro : text.account;
    ui.launcher.dataset.tier = isPro ? 'pro' : 'free';
    ui.backdrop.hidden = !state.open;
    ui.kicker.textContent = text.optional;
    ui.title.textContent = text.title;
    ui.close.setAttribute('aria-label', text.close);
    ui.intro.textContent = text.intro;
    ui.guest.hidden = signedIn;
    ui.account.hidden = !signedIn;
    ui.google.textContent = state.loading ? text.busy : text.google;
    ui.email.placeholder = text.email;
    ui.emailSubmit.textContent = state.loading ? text.busy : text.send;
    ui.emailSubmit.disabled = state.loading;
    ui.accountEmail.textContent = state.user?.email || state.user?.id || '';
    ui.tier.textContent = isPro ? text.pro : text.free;
    ui.tier.dataset.tier = isPro ? 'pro' : 'free';
    ui.upgrade.textContent = state.loading ? text.busy : text.upgrade;
    ui.manage.textContent = state.loading ? text.busy : text.manage;
    ui.refresh.textContent = text.refresh;
    ui.signOut.textContent = text.signOut;
    ui.upgrade.hidden = !config.billingEnabled || isPro || !config.checkoutFunctionUrl;
    ui.manage.hidden = !config.billingEnabled || !isPro || !config.portalFunctionUrl;
    ui.billingNote.textContent = config.billingEnabled ? '' : text.billingPending;
    ui.billingNote.hidden = config.billingEnabled;
    ui.error.textContent = state.error ? `${text.unavailable} ${state.error}` : '';
    ui.error.hidden = !state.error;
    [ui.google, ui.email, ui.upgrade, ui.manage, ui.refresh, ui.signOut]
      .forEach((element) => { element.disabled = state.loading; });
  }

  function createUi() {
    const root = document.createElement('div');
    root.id = 'hao-membership-root';
    root.innerHTML = `
      <button type="button" class="hao-membership-launcher" data-hao-launcher></button>
      <div class="hao-membership-backdrop" data-hao-backdrop hidden>
        <section class="hao-membership-dialog" role="dialog" aria-modal="true" aria-labelledby="hao-membership-title">
          <header>
            <div>
              <p data-hao-kicker></p>
              <h2 id="hao-membership-title" data-hao-title></h2>
            </div>
            <button type="button" class="hao-membership-close" data-hao-close>×</button>
          </header>
          <p class="hao-membership-intro" data-hao-intro></p>
          <div data-hao-guest>
            <button type="button" class="hao-membership-primary" data-hao-google></button>
            <form class="hao-membership-email" data-hao-email-form>
              <input type="email" autocomplete="email" required data-hao-email>
              <button type="submit" data-hao-email-submit></button>
            </form>
          </div>
          <div data-hao-account hidden>
            <div class="hao-membership-account-card">
              <span data-hao-tier></span>
              <strong data-hao-account-email></strong>
            </div>
            <div class="hao-membership-actions">
              <button type="button" class="hao-membership-primary" data-hao-upgrade></button>
              <button type="button" data-hao-manage></button>
              <button type="button" data-hao-refresh></button>
              <button type="button" data-hao-sign-out></button>
            </div>
          </div>
          <small data-hao-billing-note></small>
          <p class="hao-membership-status" role="status" aria-live="polite" data-hao-status></p>
          <p class="hao-membership-error" data-hao-error hidden></p>
        </section>
      </div>`;
    document.body.appendChild(root);

    ui = {
      root,
      launcher: root.querySelector('[data-hao-launcher]'),
      backdrop: root.querySelector('[data-hao-backdrop]'),
      kicker: root.querySelector('[data-hao-kicker]'),
      title: root.querySelector('[data-hao-title]'),
      close: root.querySelector('[data-hao-close]'),
      intro: root.querySelector('[data-hao-intro]'),
      guest: root.querySelector('[data-hao-guest]'),
      google: root.querySelector('[data-hao-google]'),
      emailForm: root.querySelector('[data-hao-email-form]'),
      email: root.querySelector('[data-hao-email]'),
      emailSubmit: root.querySelector('[data-hao-email-submit]'),
      account: root.querySelector('[data-hao-account]'),
      tier: root.querySelector('[data-hao-tier]'),
      accountEmail: root.querySelector('[data-hao-account-email]'),
      upgrade: root.querySelector('[data-hao-upgrade]'),
      manage: root.querySelector('[data-hao-manage]'),
      refresh: root.querySelector('[data-hao-refresh]'),
      signOut: root.querySelector('[data-hao-sign-out]'),
      billingNote: root.querySelector('[data-hao-billing-note]'),
      status: root.querySelector('[data-hao-status]'),
      error: root.querySelector('[data-hao-error]'),
    };

    ui.launcher.addEventListener('click', openDialog);
    ui.close.addEventListener('click', closeDialog);
    ui.backdrop.addEventListener('click', (event) => {
      if (event.target === ui.backdrop) closeDialog();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.open) closeDialog();
    });
    ui.google.addEventListener('click', () => void signInWithGoogle());
    ui.emailForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void signInWithEmail(ui.email.value);
    });
    ui.upgrade.addEventListener('click', () => void callBilling(config.checkoutFunctionUrl));
    ui.manage.addEventListener('click', () => void callBilling(config.portalFunctionUrl));
    ui.refresh.addEventListener('click', () => void refreshEntitlements());
    ui.signOut.addEventListener('click', () => void signOut());
    render();
  }

  async function initialise() {
    createUi();
    try {
      const client = await getClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      await handleSession(data.session);
      client.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => void handleSession(session), 0);
      });
      if (new URLSearchParams(window.location.search).get('billing') === 'success') {
        ui.status.textContent = copy().signedIn;
        ui.status.dataset.kind = 'success';
        window.setTimeout(() => void refreshEntitlements(), 1500);
      }
    } catch (error) {
      state.error = error?.message || String(error);
    } finally {
      setLoading(false);
      emit();
    }
  }

  window.HaoMembership = Object.freeze({
    getState: snapshot,
    can,
    open: openDialog,
    refresh: refreshEntitlements,
  });

  void initialise();
})();
