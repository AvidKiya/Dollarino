(() => {
  'use strict';

  const DEFAULT_BASE = 'https://dollarino.pages.dev';
  const ext = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;

  const ENGINE_META = [
    {
      id: 'CENTRAL_AI',
      labelFa: 'هوش مصنوعی دلارینو',
      shortFa: 'AI مرکزی',
      descFa: 'تحلیل چندتایم‌فریمی ۲۴ ساعته با اجماع مدل‌ها و TP/SL خودکار',
      bulletsFa: [
        'روند، ساختار قیمت و نقدینگی جفت‌ارزها را ۲۴ ساعته تحلیل می‌کند.',
        'فقط در صورت عبور اطمینان از آستانه مجاز معامله باز می‌کند.',
        '۳ تارگت سود (TP1/TP2/TP3) و ریسک‌فری خودکار دارد.',
      ],
    },
    {
      id: 'STRATEGY',
      labelFa: 'استراتژی دُرنا V1',
      shortFa: 'دُرنا V1',
      descFa: 'استراتژی ترکیبی ۸گانه با فیلترهای روند و حجم',
      bulletsFa: [
        'سیگنال‌های تکنیکال تاییدشده با مدیریت ریسک پویا اجرا می‌کند.',
        'مناسب معاملات رونددار اسپات و فیوچرز با اهرم کنترل‌شده.',
      ],
    },
    {
      id: 'MY_AI',
      labelFa: 'هوش مصنوعی شخصی من',
      shortFa: 'هوش من',
      descFa: 'اجرای قوانین اختصاصی و آموزش‌داده‌شده شما',
      bulletsFa: [
        'بر اساس پرامپت، تایم‌فریم و ارزهایی که خودتان آموزش داده‌اید عمل می‌کند.',
        'قابل آموزش و تنظیم از سایت و ربات تلگرام.',
      ],
    },
    {
      id: 'COPY_TRADE',
      labelFa: 'کپی‌ترید هوشمند',
      shortFa: 'کپی‌ترید',
      descFa: 'آینه‌سازی تریدرهای تاییدشده و نهنگ‌های آن‌چین (همراه با دمو)',
      bulletsFa: [
        'پشتیبانی همزمان از دمو شبیه‌ساز (PAPER_SIMULATOR) و حالت واقعی Trust Wallet.',
        'سقف ریسک روزانه و حداکثر پوزیشن باز به‌صورت خودکار رعایت می‌شود.',
      ],
    },
    {
      id: 'LISTING_SNIPER',
      labelFa: 'اسنایپر لیستینگ و میم‌کوین',
      shortFa: 'اسنایپر',
      descFa: 'شکار سریع استخرهای جدید DEX و لیستینگ‌ها (70 / $15k / 5)',
      bulletsFa: [
        'حداقل امتیاز امنیت پیش‌فرض ۷۰ و نقدینگی $۱۵,۰۰۰ با حداکثر ۵ پوزیشن.',
        'اسکن فوق‌سریع زیر ۵ دقیقه از GeckoTerminal و DexScreener.',
      ],
    },
  ];

  const MODE_LABELS_FA = {
    futures: 'فیوچرز',
    spot: 'اسپات',
    dex: 'DEX',
    sniper: 'اسنایپر',
    copy: 'کپی‌ترید',
  };

  const state = {
    apiBase: DEFAULT_BASE,
    authToken: '',
    extKey: '',
    theme: 'paper',
    tab: 'home',
    authTab: 'login',
    providers: {
      publicSignupEnabled: false,
      telegramOnlySignup: true,
      telegramAuthEnabled: true,
      telegramBotUsername: 'Dollarino_bot',
      passwordLoginEnabled: true,
      walletAuthEnabled: true,
      googleAuthEnabled: false,
    },
    maintenance: null,
    challenge: null, // { challengeToken, challengeType }
    authError: '',
    user: null,
    dashboard: null,
    playbook: null,
    playbookMode: 'FUTURES',
    markets: [],
    marketType: 'FUTURES',
    marketFilter: 'ALL',
    marketSearch: '',
    dexMode: 'trending', // 'trending' | 'sniper5m'
    dexPairs: [],
    dexSearchQuery: '',
    dexAnalysis: null,
    sniperConfig: null,
    copyTraders: [],
    smartWallets: [],
    copyRules: [],
    hideBalance: false,
    paperEditOpen: false,
    budgetEditOpen: false,
    twConnectOpen: false,
    sniperEditOpen: false,
    completeProfileOpen: false,
    serverBarOpen: false,
    guideEngineId: null,
    gateMode: 'PAPER',
    gateChecked: false,
    busy: false,
    toast: { msg: 'آماده اتصال', kind: 'info' },
  };

  // ---------- Storage & Browser Helpers ----------
  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        if (ext?.storage?.local) {
          if (ext.storage.local.get.length <= 1) {
            Promise.resolve(ext.storage.local.get(keys)).then((r) => resolve(r || {})).catch(() => resolve({}));
          } else {
            ext.storage.local.get(keys, (r) => resolve(r || {}));
          }
          return;
        }
      } catch { /* fallback below */ }
      const out = {};
      for (const k of keys) {
        try {
          const v = localStorage.getItem(`dlr_ext_store_${k}`);
          if (v !== null) out[k] = v;
        } catch { /* ignore */ }
      }
      resolve(out);
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      try {
        if (ext?.storage?.local) {
          if (ext.storage.local.set.length <= 1) {
            Promise.resolve(ext.storage.local.set(obj)).then(resolve).catch(resolve);
          } else {
            ext.storage.local.set(obj, resolve);
          }
          return;
        }
      } catch { /* fallback below */ }
      for (const [k, v] of Object.entries(obj)) {
        try { localStorage.setItem(`dlr_ext_store_${k}`, String(v ?? '')); } catch { /* ignore */ }
      }
      resolve();
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve) => {
      try {
        if (ext?.storage?.local) {
          if (ext.storage.local.remove.length <= 1) {
            Promise.resolve(ext.storage.local.remove(keys)).then(resolve).catch(resolve);
          } else {
            ext.storage.local.remove(keys, resolve);
          }
          return;
        }
      } catch { /* fallback below */ }
      for (const k of keys) {
        try { localStorage.removeItem(`dlr_ext_store_${k}`); } catch { /* ignore */ }
      }
      resolve();
    });
  }

  function notifyBadgeSync() {
    try {
      ext?.runtime?.sendMessage?.({ type: 'SYNC_BADGE_NOW' });
    } catch { /* ignore */ }
  }

  function openExternalUrl(url) {
    try {
      if (ext?.tabs?.create) {
        ext.tabs.create({ url });
        return;
      }
    } catch { /* fallback */ }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function esc(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtUsd(val, digits) {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '$0';
    const d = typeof digits === 'number' ? digits : Math.abs(n) < 100 && n !== 0 ? 2 : 0;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: Math.max(2, d) })}`;
  }

  function fmtToman(usd, rate) {
    const n = Number(usd || 0);
    const r = Number(rate || 290000);
    if (!Number.isFinite(n) || !Number.isFinite(r) || r <= 0) return '0';
    return Math.round(n * r).toLocaleString('en-US');
  }

  function setToast(msg, kind = 'info') {
    state.toast = { msg, kind };
    const dot = document.getElementById('dlr-toast-dot');
    const txt = document.getElementById('dlr-toast-text');
    if (dot) dot.className = `toast-dot ${kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : ''}`;
    if (txt) txt.textContent = msg;
  }

  function applyTheme(theme) {
    const t = theme === 'cosmic' || theme === 'dark' ? 'cosmic' : 'paper';
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
  }

  async function api(path, opts = {}) {
    const base = (state.apiBase || DEFAULT_BASE).replace(/\/$/, '');
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    if (state.authToken) {
      headers['Authorization'] = `Bearer ${state.authToken}`;
    } else if (state.extKey) {
      headers['X-Dollarino-Extension-Key'] = state.extKey;
    }

    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers,
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: text || `HTTP ${res.status}` };
    }

    if (res.status === 503 && json?.code === 'SITE_MAINTENANCE') {
      state.maintenance = json.maintenance || {
        enabled: true,
        titleFa: 'سایت در حال بروزرسانی است',
        messageFa: json.error || 'پلتفرم موقتاً در حال تعمیرات است.',
      };
      render();
      throw new Error(json.error || 'سایت در حال تعمیرات است');
    }

    if (res.status === 401 && !opts.skipAuthReset) {
      if (state.authToken || state.extKey) {
        state.authToken = '';
        state.extKey = '';
        state.user = null;
        state.dashboard = null;
        await storageRemove(['authToken', 'extKey']);
        notifyBadgeSync();
      }
      throw new Error(json?.error || 'نشست شما منقضی شده است؛ دوباره وارد شوید.');
    }

    if (!res.ok) {
      throw new Error(json?.error || json?.message || `خطا (${res.status})`);
    }
    return json;
  }

  // ---------- Data Loaders ----------
  async function loadPublicMeta() {
    const base = (state.apiBase || DEFAULT_BASE).replace(/\/$/, '');
    try {
      const [statusRes, provRes] = await Promise.all([
        fetch(`${base}/api/public/site-status`).then((r) => r.json()).catch(() => null),
        fetch(`${base}/api/auth/providers`).then((r) => r.json()).catch(() => null),
      ]);
      if (statusRes?.maintenance) {
        state.maintenance = statusRes.maintenance.enabled ? statusRes.maintenance : null;
      }
      if (provRes) {
        state.providers = { ...state.providers, ...provRes };
      }
    } catch { /* ignore */ }
  }

  async function refreshAllData(silent = false) {
    if (!state.authToken && !state.extKey) {
      await loadPublicMeta();
      render();
      return;
    }
    try {
      const [dash, playbook] = await Promise.all([
        api('/api/trading/dashboard'),
        api('/api/trustwallet/playbook').catch(() => null),
      ]);
      state.dashboard = dash;
      if (dash?.user) state.user = dash.user;
      if (playbook?.ok) state.playbook = playbook;
      if (dash?.config?.trading_mode === 'LIVE' || dash?.config?.trading_mode === 'PAPER') {
        state.gateMode = dash.config.trading_mode;
      }
      state.maintenance = null;
      if (!silent) setToast('همگام‌سازی V11.9.1 انجام شد ✓', 'ok');
      notifyBadgeSync();
    } catch (err) {
      if (!silent) setToast(err.message || 'خطا در اتصال', 'err');
    }
    render();
  }

  async function loadMarkets() {
    try {
      const res = await api(`/api/trading/markets?marketType=${state.marketType}`);
      state.markets = Array.isArray(res?.markets) ? res.markets : [];
      render();
    } catch (err) {
      setToast(err.message, 'err');
    }
  }

  async function loadDexAndSniper() {
    try {
      if (state.dexMode === 'sniper5m') {
        const res = await api('/api/trading/sniper');
        state.sniperConfig = res?.settings || null;
        state.dexPairs = Array.isArray(res?.candidates)
          ? res.candidates.map((c) => ({
              chainId: c.chainId,
              dexId: c.dexId,
              tokenAddress: c.tokenAddress,
              pairAddress: c.pairAddress || c.tokenAddress,
              symbol: c.symbol,
              name: c.name || c.symbol,
              priceUsd: Number(c.priceUsd || 0),
              liquidityUsd: Number(c.liquidityUsd || 0),
              volume24hUsd: Number(c.volume5mUsd || 0),
              priceChange5mPct: Number(c.change5mPct || 0),
              priceChange1hPct: Number(c.change1hPct || 0),
              priceChange24hPct: Number(c.change1hPct || 0),
              safetyScore: Number(c.safetyScore || 0),
              ageMinutes: c.ageMinutes,
              url: c.url,
            }))
          : [];
      } else if (state.dexSearchQuery.trim()) {
        const res = await api(`/api/dex/search?q=${encodeURIComponent(state.dexSearchQuery.trim())}`);
        state.dexPairs = Array.isArray(res?.pairs) ? res.pairs : [];
      } else {
        const [tr, sn] = await Promise.all([
          api('/api/dex/trending'),
          api('/api/trading/sniper').catch(() => null),
        ]);
        state.dexPairs = Array.isArray(tr?.pairs) ? tr.pairs : [];
        if (sn?.settings) state.sniperConfig = sn.settings;
      }
      render();
    } catch (err) {
      setToast(err.message, 'err');
    }
  }

  async function loadCopyData() {
    try {
      const [trRes, swRes, rlRes] = await Promise.all([
        api('/api/copy-trade/traders').catch(() => ({ traders: [] })),
        api('/api/copy-trade/smart-wallets').catch(() => ({ wallets: [] })),
        api('/api/copy-trade/rules').catch(() => ({ rules: [] })),
      ]);
      state.copyTraders = Array.isArray(trRes?.traders) ? trRes.traders : [];
      state.smartWallets = Array.isArray(swRes?.wallets) ? swRes.wallets : [];
      state.copyRules = Array.isArray(rlRes?.rules) ? rlRes.rules : [];
      render();
    } catch (err) {
      setToast(err.message, 'err');
    }
  }

  // ---------- Render Helpers ----------
  function renderTopBar() {
    const isConnected = Boolean(state.user);
    const botRunning = Boolean(state.dashboard?.config?.bot_state?.startsWith?.('RUNNING'));
    const modeLabel = !isConnected
      ? 'ورود و ثبت‌نام امن V11.9.1'
      : botRunning
        ? 'ربات روشن · حالت ساده'
        : `حالت ساده · ${state.user.username || 'کاربر'}`;
    const base = (state.apiBase || DEFAULT_BASE).replace(/\/$/, '');

    return `
      <header class="top-bar glass-panel">
        <div class="brand">
          <div class="logo-wrap">
            <img src="icons/icon-192.png" alt="Dollarino" class="brand-logo" />
            <span class="conn-dot ${isConnected ? 'online' : 'offline'}"></span>
          </div>
          <div class="brand-info">
            <div class="brand-row">
              <h1>دلارینو</h1>
              <span class="badge-cobalt">V11.9.1</span>
              ${isConnected ? `<span class="badge-emerald">${state.dashboard?.config?.trading_mode === 'LIVE' ? 'واقعی' : 'دمو'}</span>` : ''}
            </div>
            <span class="brand-sub">${esc(modeLabel)}</span>
          </div>
        </div>
        <div class="top-actions">
          <button type="button" class="icon-btn" data-action="toggle-theme" title="تغییر تم روشن/تاریک">
            ${state.theme === 'cosmic'
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.36-6.36-1.41 1.41M8.05 15.95l-1.41 1.41m10.72 0-1.41-1.41M8.05 8.05 6.64 6.64"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'}
          </button>
          <button type="button" class="icon-btn ${state.busy ? 'spinning' : ''}" data-action="refresh-all" title="بروزرسانی لحظه‌ای">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
          </button>
          <a href="${esc(base)}/?ui_mode=simple" target="_blank" rel="noreferrer" class="icon-btn" title="باز کردن در تب کامل">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
          </a>
        </div>
      </header>
    `;
  }

  function renderMaintenanceView() {
    const m = state.maintenance || {};
    return `
      <div class="viewport">
        <div class="maint-box glass-card">
          <div class="empty-icon">🛠</div>
          <span class="badge-cobalt">حالت تعمیرات و بروزرسانی فنی</span>
          <strong style="font-size:14px">${esc(m.titleFa || 'پلتفرم دلارینو در حال بروزرسانی است')}</strong>
          <p class="hint" style="margin:0">${esc(m.messageFa || 'لطفاً دقایقی دیگر مجدداً تلاش کنید.')}</p>
          ${m.eta ? `<span class="badge-emerald">زمان بازگشت: ${esc(m.eta)}</span>` : ''}
          <div class="btn-row" style="width:100%;margin-top:6px">
            <button type="button" class="btn btn-cobalt flex-1" data-action="refresh-all">بررسی مجدد وضعیت</button>
            <button type="button" class="btn btn-ghost" data-action="bypass-maint-login">ورود مدیر</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderAuthView() {
    const p = state.providers || {};
    const botUser = String(p.telegramBotUsername || 'Dollarino_bot').replace(/^@/, '');
    const base = (state.apiBase || DEFAULT_BASE).replace(/\/$/, '');

    if (state.challenge) {
      const isSecPwd = state.challenge.challengeType === 'SECONDARY_PASSWORD';
      return `
        <div class="viewport">
          <div class="glass-card" style="display:flex;flex-direction:column;gap:9px">
            <div class="card-head" style="margin-bottom:2px">
              <div class="head-title">
                <span class="head-icon cobalt">🔐</span>
                <span>${isSecPwd ? 'تایید رمز دوم امنیتی' : 'احراز هویت دوعاملی (2FA)'}</span>
              </div>
              <button type="button" class="btn btn-ghost btn-xs" data-action="cancel-2fa">بازگشت</button>
            </div>
            ${state.authError ? `<div class="auth-error">${esc(state.authError)}</div>` : ''}
            <p class="hint">${isSecPwd ? 'رمز دوم اولیه حساب مدیر را وارد کنید:' : 'کد ۶ رقمی Google Authenticator را وارد کنید:'}</p>
            <form id="dlr-2fa-form" style="display:flex;flex-direction:column;gap:8px">
              <input id="dlr-2fa-input" type="${isSecPwd ? 'password' : 'text'}" inputmode="${isSecPwd ? 'text' : 'numeric'}" dir="ltr" placeholder="${isSecPwd ? 'Secondary password' : '123456'}" required />
              <button type="submit" class="btn btn-cobalt" ${state.busy ? 'disabled' : ''}>تایید و ورود به حالت ساده</button>
            </form>
          </div>
        </div>
      `;
    }

    let bodyHtml = '';
    if (state.authTab === 'login') {
      bodyHtml = `
        <form id="dlr-login-form" style="display:flex;flex-direction:column;gap:7px">
          <label class="field">
            <span>نام کاربری یا ایمیل</span>
            <input id="dlr-login-id" type="text" dir="ltr" placeholder="username or email" required />
          </label>
          <label class="field">
            <span>رمز عبور</span>
            <input id="dlr-login-pw" type="password" dir="ltr" placeholder="••••••••" required />
          </label>
          <button type="submit" class="btn btn-cobalt" ${state.busy ? 'disabled' : ''}>ورود به حساب و حالت ساده</button>
        </form>
        <div class="btn-row" style="margin-top:8px">
          ${p.telegramAuthEnabled ? `<button type="button" class="btn btn-emerald btn-sm flex-1" data-action="open-url" data-url="https://t.me/${esc(botUser)}?start=web_auth">🤖 ورود با ربات تلگرام</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm flex-1" data-action="open-url" data-url="${esc(base)}/?auth_screen=1&auth_mode=login">🦊 کیف‌پول / گوگل در وب</button>
        </div>
      `;
    } else if (state.authTab === 'register') {
      if (p.publicSignupEnabled) {
        bodyHtml = `
          <form id="dlr-reg-form" style="display:flex;flex-direction:column;gap:6px">
            <label class="field">
              <span>نام کاربری (انگلیسی)</span>
              <input id="dlr-reg-user" type="text" dir="ltr" minlength="2" placeholder="ali_trader" required />
            </label>
            <label class="field">
              <span>ایمیل</span>
              <input id="dlr-reg-email" type="email" dir="ltr" placeholder="ali@example.com" required />
            </label>
            <label class="field">
              <span>رمز عبور (حداقل ۶ کاراکتر)</span>
              <input id="dlr-reg-pw" type="password" dir="ltr" minlength="6" placeholder="••••••" required />
            </label>
            <label class="field">
              <span>کد معرف (اختیاری)</span>
              <input id="dlr-reg-ref" type="text" dir="ltr" placeholder="DLR-XXXXXX" />
            </label>
            <button type="submit" class="btn btn-emerald" ${state.busy ? 'disabled' : ''}>ثبت‌نام سریع و ورود به حالت ساده</button>
          </form>
        `;
      } else {
        bodyHtml = `
          <div class="auth-info">
            ${p.telegramOnlySignup
              ? '🔐 ثبت‌نام عمومی با ایمیل در حال حاضر توسط مدیریت روی حالت «ثبت‌نام اختصاصی تلگرام / کیف‌پول» قرار دارد. با یک کلیک در ربات رسمی ثبت‌نام و کد ورود آنی دریافت کنید:'
              : '🔐 ثبت‌نام مستقیم ایمیل در تنظیمات سایت غیرفعال است؛ از ربات تلگرام یا ثبت‌نام غیرمتمرکز کیف‌پول استفاده کنید:'}
          </div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <button type="button" class="btn btn-emerald" data-action="open-url" data-url="https://t.me/${esc(botUser)}?start=web_auth">🤖 ثبت‌نام ۱-کلیکی در ربات تلگرام</button>
            <button type="button" class="btn btn-cobalt" data-action="open-url" data-url="${esc(base)}/?tw_signup=1&auth_screen=1">🛡 ثبت‌نام سریع با Trust Wallet</button>
          </div>
        `;
      }
    } else {
      bodyHtml = `
        <form id="dlr-key-form" style="display:flex;flex-direction:column;gap:7px">
          <label class="field">
            <span>کلید اکستنشن (از سایت بخش سرویس‌ها یا ربات تلگرام)</span>
            <input id="dlr-ext-key-input" type="password" dir="ltr" placeholder="dlr_ext_..." value="${esc(state.extKey)}" required />
          </label>
          <button type="submit" class="btn btn-cobalt" ${state.busy ? 'disabled' : ''}>اتصال فوری با کلید</button>
        </form>
      `;
    }

    return `
      <div class="viewport">
        <div class="auth-hero dot-grid-light" style="margin-bottom:9px">
          <div class="hero-content">
            <div class="hero-badge-row">
              <span class="hero-pill"><span class="pulse-dot emerald"></span> دلارینو V11.9.1</span>
              <span class="hero-tag">حالت ساده + دمو رایگان</span>
            </div>
            <h2 class="hero-h2">ورود و ثبت‌نام مستقیم در اکستنشن</h2>
            <p class="hero-desc">کنترل ۵ موتور همزمان، تراز یکپارچه ۵ بخش، رادار DEX/اسنایپر و حساب دمو/واقعی Trust Wallet بدون اشتراک ماهانه.</p>
          </div>
        </div>

        <div class="glass-card">
          <div class="auth-tabs">
            <button type="button" class="auth-tab-btn ${state.authTab === 'login' ? 'active' : ''}" data-action="set-auth-tab" data-tab="login">ورود</button>
            <button type="button" class="auth-tab-btn ${state.authTab === 'register' ? 'active' : ''}" data-action="set-auth-tab" data-tab="register">ثبت‌نام</button>
            <button type="button" class="auth-tab-btn ${state.authTab === 'key' ? 'active' : ''}" data-action="set-auth-tab" data-tab="key">کلید اکستنشن</button>
          </div>
          ${state.authError ? `<div class="auth-error">${esc(state.authError)}</div>` : ''}
          ${bodyHtml}
          <div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px">
            <button type="button" class="btn btn-ghost btn-xs" style="width:100%" data-action="toggle-server-bar">
              🌐 آدرس سرور: ${esc(base)} (${state.serverBarOpen ? 'بستن' : 'تغییر'})
            </button>
            ${state.serverBarOpen ? `
              <div style="margin-top:7px;display:flex;flex-direction:column;gap:5px">
                <div class="preset-row">
                  <button type="button" class="chip" data-action="set-api-preset" data-url="https://dollarino.pages.dev">Pages</button>
                  <button type="button" class="chip" data-action="set-api-preset" data-url="http://localhost:5173">localhost:5173</button>
                  <button type="button" class="chip" data-action="set-api-preset" data-url="http://127.0.0.1:8787">127.0.0.1:8787</button>
                </div>
                <div class="ref-row">
                  <input id="dlr-api-base-input" type="url" dir="ltr" value="${esc(state.apiBase)}" />
                  <button type="button" class="btn btn-cobalt btn-xs" data-action="save-api-base">ذخیره</button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderSegmentedNav() {
    const tabs = [
      { id: 'home', label: 'حالت ساده', idx: 0 },
      { id: 'markets', label: 'بازارها', idx: 1 },
      { id: 'dex', label: 'رادار و اسنایپ', idx: 2 },
      { id: 'account', label: 'کپی و حساب', idx: 3 },
    ];
    const activeIdx = tabs.find((t) => t.id === state.tab)?.idx ?? 0;
    const isRtl = document.documentElement.dir === 'rtl' || getComputedStyle(document.documentElement).direction === 'rtl';
    const xPct = isRtl ? -activeIdx * 100 : activeIdx * 100;
    return `
      <nav class="seg-nav glass-panel">
        <div class="seg-thumb" style="transform:translateX(${xPct}%)"></div>
        ${tabs.map((t) => `
          <button type="button" class="seg-tab ${state.tab === t.id ? 'active' : ''}" data-action="switch-tab" data-tab="${t.id}">
            <span>${t.label}</span>
          </button>
        `).join('')}
      </nav>
    `;
  }

  function renderPendingPopupsBanner(popups) {
    if (!Array.isArray(popups) || !popups.length) return '';
    return popups.slice(0, 2).map((p) => `
      <div class="popup-banner">
        <div class="card-head" style="margin-bottom:2px">
          <strong>📢 ${esc(p.title_fa || p.title_en || 'اطلاعیه مدیریت')}</strong>
          <button type="button" class="btn btn-emerald btn-xs" data-action="ack-popup" data-id="${esc(p.id)}">متوجه شدم ✓</button>
        </div>
        <div style="font-size:11px;color:var(--sub);line-height:1.55">${esc(p.body_fa || p.body_en || '')}</div>
      </div>
    `).join('');
  }

  function renderOnboardingGate(cfg, user) {
    const modeSelected = Boolean(cfg?.trading_mode_selected);
    const riskAccepted = Boolean(user?.risk_terms_accepted_at);
    if (modeSelected && riskAccepted) return '';
    const demoBal = Number(cfg?.paper_balance ?? cfg?.custom_paper_balance ?? 10000);
    return `
      <section class="gate-card">
        <div class="card-head" style="margin-bottom:0">
          <div class="head-title">
            <span class="head-icon amber">🛡</span>
            <span>گام الزامی پیش از اولین معامله</span>
          </div>
          <span class="badge-cobalt">${!modeSelected ? 'انتخاب حساب' : 'تایید قوانین'}</span>
        </div>
        <p class="hint" style="margin:0">پیش از روشن کردن ربات یا باز شدن اولین معامله، حساب و قوانین ریسک را تایید کنید:</p>
        <div class="gate-mode-grid">
          <button type="button" class="gate-mode-btn ${state.gateMode === 'PAPER' ? 'active-paper' : ''}" data-action="set-gate-mode" data-mode="PAPER">
            <strong style="font-size:11px">🧪 دمو آزمایشی</strong>
            <span style="font-size:10px;color:var(--dim)">${fmtUsd(demoBal, 0)} رایگان · بدون ریسک</span>
          </button>
          <button type="button" class="gate-mode-btn ${state.gateMode === 'LIVE' ? 'active-live' : ''}" data-action="set-gate-mode" data-mode="LIVE">
            <strong style="font-size:11px">🛡 واقعی Trust Wallet</strong>
            <span style="font-size:10px;color:var(--dim)">غیرامانی · ۳ برد اول ۰٪ کارمزد</span>
          </button>
        </div>
        <label class="check-row">
          <input type="checkbox" id="dlr-gate-check" ${state.gateChecked ? 'checked' : ''} />
          <span>قوانین غیرامانی بودن کیف‌پول، عدم تضمین سود و مسئولیت ریسک (۳٪ کارمزد سود واقعی پس از ۳ معامله سودده اول) را می‌پذیرم.</span>
        </label>
        <button type="button" class="btn btn-emerald" ${!state.gateChecked || state.busy ? 'disabled' : ''} data-action="confirm-gate">
          تایید قوانین، ثبت حالت و شروع ✓
        </button>
      </section>
    `;
  }

  function renderHomeTab() {
    const d = state.dashboard || {};
    const cfg = d.config || {};
    const user = state.user || {};
    const bal = d.balance || {};
    const pb = d.portfolioBreakdown || null;
    const iranRate = Number(d.iranRate?.usdtIrt || 290000);
    const feeSum = d.serverFeeSummary || {};
    const feeEnf = feeSum.enforcement || {};
    const activeEngines = Array.isArray(d.activeEngines) ? d.activeEngines : [];
    const isRunning = Boolean(cfg.bot_state?.startsWith?.('RUNNING'));
    const isLive = cfg.trading_mode === 'LIVE';
    const isManual = cfg.trade_execution_mode === 'MANUAL_CONFIRM';
    const demoBal = Number(cfg.paper_balance ?? cfg.custom_paper_balance ?? 10000);
    const totalEq = Number(pb?.totalEquityUsd ?? bal.total ?? demoBal);
    const pbNetUsd = pb ? Number(pb.realizedPnlUsd ?? 0) + Number(pb.unrealizedPnlUsd ?? 0) : 0;
    const freeTradesRem = Number(feeSum.freeTradesRemaining ?? 3);
    const freeTradesLim = Number(feeSum.freeTradesLimit ?? 3);
    const openTrades = Array.isArray(d.openTrades) ? d.openTrades : [];
    const openDex = Array.isArray(d.openDexTrades) ? d.openDexTrades : [];
    const openCopy = Array.isArray(d.openCopyPositionsV2) ? d.openCopyPositionsV2 : [];
    const openPerp = Array.isArray(d.openPerpOrders) ? d.openPerpOrders : [];
    const totalOpenCount = openTrades.length + openDex.length + openCopy.length + openPerp.length;
    const base = (state.apiBase || DEFAULT_BASE).replace(/\/$/, '');

    // Fee Lock/Warning Banner
    const feeWarnHtml = (feeEnf.lockStatus === 'LOCKED' || feeEnf.lockStatus === 'WARNING') ? `
      <div class="fee-warn-banner">
        <strong>${feeEnf.lockStatus === 'LOCKED'
          ? `🔒 ورود جدید واقعی تا تسویه کارمزد ۳٪ (${fmtUsd(feeEnf.totalDueUsd, 2)}) متوقف است`
          : `⏳ مهلت تسویه کارمزد ۳٪: ${feeEnf.hoursRemaining ?? 72} ساعت (${fmtUsd(feeEnf.totalDueUsd, 2)})`}</strong>
        <div style="margin-top:5px">
          <button type="button" class="btn btn-emerald btn-xs" data-action="open-url" data-url="${esc(base)}/?tab=pricing">تسویه سریع در سایت</button>
        </div>
      </div>
    ` : '';

    // Hero Card
    const capMode = cfg.bot_budget_mode === 'FIXED_USD' ? 'FIXED_USD' : 'FULL_BALANCE';
    const budgetUsd = Number(cfg.bot_budget_usd || 0);
    const maxLev = Number(cfg.max_leverage || 10);

    const heroHtml = `
      <section class="hero-cobalt dot-grid-light">
        <div class="hero-content">
          <div class="hero-badge-row">
            <span class="hero-pill">
              <span class="pulse-dot ${isRunning ? 'emerald' : ''}"></span>
              ${isRunning ? 'ربات روشن و فعال' : 'آماده شروع'}
            </span>
            <div style="display:flex;align-items:center;gap:4px">
              <span class="hero-tag">${isLive ? '🛡 واقعی Trust Wallet' : '🧪 دمو قابل تنظیم'}</span>
              <button type="button" class="btn btn-glass-light btn-xs" data-action="toggle-hide-bal" title="نمایش/مخفی موجودی">
                ${state.hideBalance ? '👁‍🗨' : '👁'}
              </button>
            </div>
          </div>

          <div class="hero-balance-row">
            <div>
              <span class="hero-sublabel">${isLive ? 'موجودی واقعی (Trust Wallet)' : 'موجودی کیف‌پول دمو ($50–$10M)'}</span>
              <div class="hero-balance tabular" dir="ltr">${state.hideBalance ? '••••••' : fmtUsd(totalEq)}</div>
              <div class="hero-irt">${state.hideBalance ? '•••• تومان' : `≈ ${fmtToman(totalEq, iranRate)} تومان`}</div>
            </div>
            <div style="text-align:end">
              <span class="hero-tag">${feeSum.feeExempt ? '۰٪ کارمزد (مدیریت)' : `${freeTradesRem}/${freeTradesLim} برد اول رایگان · ۳٪ کارمزد`}</span>
              ${!isLive ? `
                <div style="margin-top:6px">
                  <button type="button" class="btn btn-glass-light btn-xs" data-action="toggle-paper-edit">✏️ تغییر مبلغ دمو</button>
                </div>
              ` : ''}
            </div>
          </div>

          ${state.paperEditOpen && !isLive ? `
            <div class="inline-editor" style="margin-bottom:9px;background:rgba(5,12,32,0.45);border-color:rgba(255,255,255,0.28);color:#fff">
              <div class="preset-row">
                ${[100, 1000, 10000, 100000].map((v) => `
                  <button type="button" class="btn btn-glass-light btn-xs" data-action="apply-paper-bal" data-val="${v}">$${v.toLocaleString('en-US')}</button>
                `).join('')}
              </div>
              <div class="ref-row">
                <input id="dlr-paper-input" type="number" min="50" max="10000000" dir="ltr" value="${Math.round(demoBal)}" style="background:rgba(2,6,23,0.7);color:#fff;border-color:rgba(255,255,255,0.28)" />
                <button type="button" class="btn btn-emerald btn-xs" data-action="apply-paper-custom">اعمال</button>
              </div>
            </div>
          ` : ''}

          <div class="hero-metrics">
            <div class="hero-metric-box">
              <span>آزاد / قابل ترید</span>
              <strong dir="ltr">${state.hideBalance ? '•••' : fmtUsd(pb?.freeBalanceUsd ?? bal.available ?? totalEq, 2)}</strong>
            </div>
            <div class="hero-metric-box">
              <span>معاملات باز</span>
              <strong dir="ltr">${totalOpenCount} (${fmtUsd(pb?.lockedMarginUsd ?? 0, 0)})</strong>
            </div>
            <div class="hero-metric-box">
              <span>سود خالص</span>
              <strong dir="ltr" style="color:${pbNetUsd >= 0 ? '#6ee7b7' : '#fda4af'}">
                ${pbNetUsd >= 0 ? '+' : '-'}${fmtUsd(Math.abs(pbNetUsd), 2)}
              </strong>
            </div>
          </div>

          <div class="budget-strip">
            <div class="budget-strip-row">
              <span>💼 سرمایه مجاز ربات: <strong>${capMode === 'FIXED_USD' && budgetUsd > 0 ? fmtUsd(budgetUsd, 0) : 'کل موجودی'}</strong> · اهرم: <strong>${cfg.use_signal_leverage ? 'پیشنهادی' : `${maxLev}×`}</strong></span>
              <button type="button" class="btn btn-glass-light btn-xs" data-action="toggle-budget-edit">تنظیم</button>
            </div>
            ${state.budgetEditOpen ? `
              <div class="form-grid-2" style="margin-top:3px">
                <input id="dlr-budget-input" type="number" min="0" dir="ltr" value="${capMode === 'FIXED_USD' ? budgetUsd : 0}" placeholder="0 = کل موجودی" style="background:rgba(2,6,23,0.7);color:#fff;border-color:rgba(255,255,255,0.25);padding:5px 8px;font-size:11px" />
                <input id="dlr-lev-input" type="number" min="1" max="100" dir="ltr" value="${maxLev}" placeholder="اهرم (1-100)" style="background:rgba(2,6,23,0.7);color:#fff;border-color:rgba(255,255,255,0.25);padding:5px 8px;font-size:11px" />
              </div>
              <div class="btn-row">
                <button type="button" class="btn btn-emerald btn-xs flex-1" data-action="save-budget-lev">ذخیره بودجه و اهرم</button>
                <button type="button" class="btn btn-glass-light btn-xs" data-action="set-auto-lev">اهرم پیشنهادی</button>
              </div>
            ` : ''}
          </div>
        </div>
      </section>
    `;

    // Mode & Execution Bar + Primary Action Dock
    const modeDockHtml = `
      <div class="mode-bar">
        <div class="mode-seg">
          <button type="button" class="mode-pill-btn ${!isLive ? 'active-amber' : ''}" data-action="set-exec-mode" data-trading="PAPER">🧪 دمو</button>
          <button type="button" class="mode-pill-btn ${isLive ? 'active-emerald' : ''}" data-action="set-exec-mode" data-trading="LIVE">🛡 واقعی</button>
        </div>
        <div class="mode-seg">
          <button type="button" class="mode-pill-btn ${!isManual ? 'active' : ''}" data-action="set-exec-mode" data-exec="AUTO">⚡ خودکار ۲۴/۷</button>
          <button type="button" class="mode-pill-btn ${isManual ? 'active-amber' : ''}" data-action="set-exec-mode" data-exec="MANUAL_CONFIRM">✋ قبلش بپرسه</button>
        </div>
      </div>

      <div class="control-dock glass-panel">
        <button type="button" class="btn ${isRunning ? 'btn-danger' : 'btn-emerald'} flex-1" data-action="${isRunning ? 'bot-stop' : 'bot-start'}" ${state.busy ? 'disabled' : ''}>
          ${isRunning ? '🔴 توقف ربات' : '🟢 روشن کردن ربات'}
        </button>
        <button type="button" class="btn btn-cobalt" data-action="ai-scan" ${state.busy ? 'disabled' : ''}>⚡️ شکار AI</button>
        <button type="button" class="btn btn-danger-soft btn-sm" data-action="kill-switch" ${state.busy ? 'disabled' : ''} title="توقف اضطراری و بستن معاملات">🛑</button>
      </div>
    `;

    // Step 1: 5 Concurrent Engines (Default OFF + Guide Buttons)
    const enginesHtml = `
      <section class="glass-card">
        <div class="card-head">
          <div class="head-title">
            <span class="head-icon cobalt">🎛</span>
            <span>قدم ۱: ۵ موتور ترید همزمان</span>
          </div>
          <span class="badge-emerald">${activeEngines.length}/5 فعال</span>
        </div>
        <p class="hint" style="margin-bottom:7px">برای ایمنی سرمایه، پیش‌فرض همه خاموش هستند. هر کدام را روشن کنید همزمان کار می‌کنند:</p>
        <div class="engine-card-grid">
          ${ENGINE_META.map((eng) => {
            const on = activeEngines.includes(eng.id);
            return `
              <div class="engine-row-card ${on ? 'active' : ''}">
                <div class="engine-row-left">
                  <span class="engine-dot" style="${on ? 'background:var(--jade);box-shadow:0 0 8px var(--jade)' : ''}"></span>
                  <div class="engine-row-info">
                    <strong>${esc(eng.labelFa)}</strong>
                    <span>${esc(eng.descFa)}</span>
                  </div>
                </div>
                <div class="engine-row-actions">
                  <button type="button" class="help-dot-btn" data-action="show-engine-guide" data-engine="${eng.id}" title="راهنمای موتور">؟</button>
                  <button type="button" class="toggle-pill ${on ? 'on' : ''}" data-action="toggle-engine" data-engine="${eng.id}">
                    ${on ? 'روشن' : 'خاموش'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;

    // Unified 5-Mode Accounting Breakdown
    const modes = pb?.modes || null;
    const accountingHtml = modes ? `
      <section class="glass-card">
          <div class="card-head">
            <div class="head-title">
              <span class="head-icon emerald">📊</span>
              <span>تراز یکپارچه ۵ موتور سرمایه‌گذاری</span>
            </div>
            ${pb.reconciliationOk ? '<span class="badge-emerald">تطبیق دقیق ✓</span>' : ''}
          </div>
        <div class="acct-summary-bar" dir="ltr">
          <span>آزاد: <strong>${fmtUsd(pb.freeBalanceUsd, 2)}</strong></span>
          <span>+</span>
          <span>درگیر: <strong>${fmtUsd(pb.lockedMarginUsd, 2)}</strong></span>
          <span>+</span>
          <span>باز: <strong style="color:${pb.unrealizedPnlUsd >= 0 ? 'var(--jade)' : 'var(--rose)'}">${pb.unrealizedPnlUsd >= 0 ? '+' : '-'}${fmtUsd(Math.abs(pb.unrealizedPnlUsd), 2)}</strong></span>
          <span>=</span>
          <strong>${fmtUsd(pb.totalEquityUsd, 2)}</strong>
        </div>
        <div class="acct-grid">
          ${['futures', 'spot', 'dex', 'sniper', 'copy'].map((k) => {
            const m = modes[k];
            if (!m) return '';
            const net = Number(m.realizedPnlUsd || 0) + Number(m.unrealizedPnlUsd || 0);
            return `
              <div class="acct-card">
                <div class="acct-card-top">
                  <span>${esc(MODE_LABELS_FA[k] || m.labelFa || k)}</span>
                  <span class="badge-cobalt">${Number(m.openCount || 0)} باز</span>
                </div>
                <div class="acct-card-row"><span>درگیر:</span><strong dir="ltr">${fmtUsd(m.lockedMarginUsd, 2)}</strong></div>
                <div class="acct-card-row">
                  <span>سود خالص:</span>
                  <strong dir="ltr" style="color:${net >= 0 ? 'var(--jade)' : 'var(--rose)'}">
                    ${net >= 0 ? '+' : '-'}${fmtUsd(Math.abs(net), 2)}
                  </strong>
                </div>
                <div class="acct-card-row"><span>بسته: ${Number(m.closedCount || 0)}</span><span dir="ltr">WR ${Number(m.winRatePct || 0).toFixed(0)}%</span></div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    ` : '';

    // Trust Wallet Playbook & Connect Drawer
    const twReady = state.playbook?.readiness || {};
    const twModes = Array.isArray(state.playbook?.modes) ? state.playbook.modes : [];
    const activePlaybook = twModes.find((m) => m.id === state.playbookMode) || twModes[0];
    const playbookHtml = `
      <section class="glass-card">
        <div class="card-head">
          <div class="head-title">
            <span class="head-icon cobalt">🛡</span>
            <span>راهنما و اتصال Trust Wallet (۵ بخش)</span>
          </div>
          <button type="button" class="btn btn-cobalt btn-xs" data-action="toggle-tw-connect">
            ${twReady.trustConnected ? 'ویرایش ولت ✓' : 'اتصال ولت'}
          </button>
        </div>
        <div class="preset-row" style="margin-bottom:7px">
          <span class="badge-${twReady.trustConnected ? 'emerald' : 'cobalt'}">EVM/Multichain: ${twReady.trustConnected ? 'متصل ✓' : 'ثبت‌نشده'}</span>
          <span class="badge-${twReady.perpConnected ? 'emerald' : 'cobalt'}">Perp DEX: ${twReady.perpConnected ? 'آماده ✓' : 'نیاز به اتصال'}</span>
          <span class="badge-${twReady.vaultReady ? 'emerald' : 'cobalt'}">کپی‌ولت: ${twReady.vaultReady ? 'آماده ✓' : 'تنظیم‌نشده'}</span>
        </div>

        ${state.twConnectOpen ? `
          <form id="dlr-tw-form" class="inline-editor" style="margin-bottom:8px">
            <label class="field" style="margin-bottom:4px">
              <span>آدرس EVM (ETH / BSC / Base / Arbitrum)</span>
              <input id="dlr-tw-evm" type="text" dir="ltr" placeholder="0x..." value="${esc(twReady.addresses?.evm || user.trust_wallet_address || '')}" />
            </label>
            <div class="form-grid-2">
              <input id="dlr-tw-sol" type="text" dir="ltr" placeholder="Solana address" value="${esc(twReady.addresses?.solana || user.trust_wallet_solana || '')}" />
              <input id="dlr-tw-tron" type="text" dir="ltr" placeholder="TRON (T...)" value="${esc(twReady.addresses?.tron || user.trust_wallet_tron || '')}" />
            </div>
            <input id="dlr-tw-ton" type="text" dir="ltr" placeholder="TON address (UQ.../EQ...)" value="${esc(twReady.addresses?.ton || user.trust_wallet_ton || '')}" />
            <button type="submit" class="btn btn-emerald btn-xs">ذخیره آدرس‌های غیرامانی Trust Wallet</button>
          </form>
        ` : ''}

        ${twModes.length ? `
          <div class="playbook-tabs">
            ${twModes.map((m) => `
              <button type="button" class="chip ${activePlaybook?.id === m.id ? 'active' : ''}" data-action="set-playbook-mode" data-mode="${esc(m.id)}">
                ${m.ready ? '✓ ' : ''}${esc(m.titleFa || m.id)}
              </button>
            `).join('')}
          </div>
          ${activePlaybook ? `
            <div class="auth-info" style="margin:0">
              <strong>${esc(activePlaybook.titleFa)}</strong>
              <p style="margin:3px 0 0;color:var(--sub)">${esc(activePlaybook.howItWorksFa)}</p>
            </div>
          ` : ''}
        ` : ''}
      </section>
    `;

    // Unified Open Positions across all 4 sources
    const posRows = [
      ...openTrades.map((t) => ({
        kind: 'CEX',
        id: t.id,
        symbol: t.symbol,
        dir: t.direction,
        sub: `${t.market_type || 'FUTURES'} ${t.leverage || 1}x · مارجین ${fmtUsd(t.margin_used, 2)}`,
        pnl: Number(t.unrealized_pnl || 0),
        closeAction: 'close-cex',
      })),
      ...openDex.map((t) => ({
        kind: 'DEX',
        id: t.id,
        symbol: t.token_symbol || t.pair_address || 'DEX',
        dir: t.direction || 'BUY',
        sub: `${String(t.chain_id || '').toUpperCase()} · ${fmtUsd(t.amount_usd, 2)}`,
        pnl: Number(t.unrealized_pnl_usd || 0),
        closeAction: 'close-dex',
      })),
      ...openCopy.map((t) => ({
        kind: 'COPY',
        id: t.id,
        symbol: t.token_symbol || t.token_name || 'COPY',
        dir: t.direction || 'LONG',
        sub: `${t.trader_label || 'Copy'} (${t.execution_mode === 'PAPER_SIMULATOR' ? 'دمو' : 'واقعی'}) · ${fmtUsd(t.entry_amount_usd, 2)}`,
        pnl: Number(t.unrealized_pnl_usd || 0),
        closeAction: 'close-copy',
      })),
      ...openPerp.map((t) => ({
        kind: 'PERP',
        id: t.id,
        symbol: t.symbol || 'PERP',
        dir: t.direction || 'LONG',
        sub: `${t.venue || 'Perp'} ${t.leverage || 1}x · ${fmtUsd(t.margin_usd, 2)}`,
        pnl: Number(t.unrealized_pnl_usd || 0),
        closeAction: 'close-perp',
      })),
    ];

    const positionsHtml = `
      <section class="glass-card">
        <div class="card-head">
          <div class="head-title">
            <span class="head-icon emerald">📈</span>
            <span>معاملات باز یکپارچه (${posRows.length})</span>
          </div>
          ${posRows.length ? `
            <div style="display:flex;gap:4px">
              <button type="button" class="btn btn-emerald btn-xs" data-action="close-batch" data-scope="ALL_PROFITABLE">جمع سودها</button>
              <button type="button" class="btn btn-danger-soft btn-xs" data-action="close-batch" data-scope="ALL_LOSING">بستن ضررها</button>
            </div>
          ` : ''}
        </div>
        <div class="list-box">
          ${posRows.length ? posRows.map((p) => `
            <div class="item-row">
              <div class="row-left">
                <span class="coin-avatar" style="background:linear-gradient(135deg,#2563eb,#0a34a6)">${esc(String(p.symbol).slice(0, 3))}</span>
                <div style="min-width:0">
                  <div class="item-title">
                    <span>${esc(p.symbol)}</span>
                    <span class="dir-pill ${String(p.dir).toUpperCase() === 'SHORT' || String(p.dir).toUpperCase() === 'SELL' ? 'short' : 'long'}">${esc(p.dir)}</span>
                    <span class="badge-cobalt">${p.kind}</span>
                  </div>
                  <div class="item-sub">${esc(p.sub)}</div>
                </div>
              </div>
              <div class="item-actions">
                <span class="pos-pnl ${p.pnl >= 0 ? 'pos' : 'neg'}" dir="ltr">${p.pnl >= 0 ? '+' : '-'}${fmtUsd(Math.abs(p.pnl), 2)}</span>
                <button type="button" class="btn btn-danger-soft btn-xs" data-action="${p.closeAction}" data-id="${esc(p.id)}">بستن</button>
              </div>
            </div>
          `).join('') : `
            <div class="empty-card">
              <div class="empty-icon">📭</div>
              <p>هیچ معامله بازی در ۴ بخش (فیوچرز/اسپات، DEX، کپی‌ترید، Perp) فعال نیست.</p>
            </div>
          `}
        </div>
      </section>
    `;

    return `
      <div class="viewport">
        <div class="tab-panel active">
          ${renderPendingPopupsBanner(d.pendingPopups)}
          ${renderOnboardingGate(cfg, user)}
          ${feeWarnHtml}
          ${heroHtml}
          ${modeDockHtml}
          ${enginesHtml}
          ${accountingHtml}
          ${playbookHtml}
          ${positionsHtml}
        </div>
      </div>
    `;
  }

  function renderMarketsTab() {
    const q = state.marketSearch.trim().toLowerCase();
    let list = [...state.markets];
    if (q) {
      list = list.filter((m) => String(m.symbol || '').toLowerCase().includes(q) || String(m.baseAsset || '').toLowerCase().includes(q));
    }
    if (state.marketFilter === 'GAINERS') {
      list = list.filter((m) => Number(m.priceChangePercent24h || 0) > 0).sort((a, b) => Number(b.priceChangePercent24h || 0) - Number(a.priceChangePercent24h || 0));
    } else if (state.marketFilter === 'LOSERS') {
      list = list.filter((m) => Number(m.priceChangePercent24h || 0) < 0).sort((a, b) => Number(a.priceChangePercent24h || 0) - Number(b.priceChangePercent24h || 0));
    }
    const base = (state.apiBase || DEFAULT_BASE).replace(/\/$/, '');

    return `
      <div class="viewport">
        <div class="tab-panel active">
          <section class="glass-card">
            <div class="card-head">
              <div class="head-title"><span class="head-icon cobalt">📡</span><span>بازارهای زنده Trust Wallet</span></div>
              <div class="mode-seg" style="width:135px">
                <button type="button" class="mode-pill-btn ${state.marketType === 'FUTURES' ? 'active' : ''}" data-action="set-market-type" data-mkt="FUTURES">فیوچرز</button>
                <button type="button" class="mode-pill-btn ${state.marketType === 'SPOT' ? 'active' : ''}" data-action="set-market-type" data-mkt="SPOT">اسپات</button>
              </div>
            </div>
            <div class="search-wrap">
              <input id="dlr-mkt-search" type="search" placeholder="جستجوی نماد (BTC، ETH، SOL...)" value="${esc(state.marketSearch)}" />
            </div>
            <div class="chip-row">
              <button type="button" class="chip ${state.marketFilter === 'ALL' ? 'active' : ''}" data-action="set-mkt-filter" data-filter="ALL">همه (${state.markets.length})</button>
              <button type="button" class="chip ${state.marketFilter === 'GAINERS' ? 'active' : ''}" data-action="set-mkt-filter" data-filter="GAINERS">برترین رشد</button>
              <button type="button" class="chip ${state.marketFilter === 'LOSERS' ? 'active' : ''}" data-action="set-mkt-filter" data-filter="LOSERS">بیشترین افت</button>
            </div>
            <div class="list-box tall">
              ${list.length ? list.slice(0, 45).map((m) => {
                const chg = Number(m.priceChangePercent24h || 0);
                const px = Number(m.lastPrice || 0);
                const pxStr = px >= 1 ? px.toLocaleString('en-US', { maximumFractionDigits: 4 }) : px.toPrecision(4);
                return `
                  <div class="item-row">
                    <div class="row-left">
                      <span class="coin-avatar" style="background:linear-gradient(135deg,#2563eb,#1652f0)">${esc(String(m.baseAsset || m.symbol).slice(0, 3))}</span>
                      <div>
                        <div class="item-title">${esc(m.symbol)}</div>
                        <div class="item-sub" dir="ltr">$${pxStr}</div>
                      </div>
                    </div>
                    <div class="item-actions">
                      <span class="pct-pill ${chg >= 0 ? 'pos' : 'neg'}" dir="ltr">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>
                      <button type="button" class="btn btn-cobalt btn-xs" data-action="open-url" data-url="${esc(base)}/?tab=terminal&symbol=${encodeURIComponent(m.symbol)}">چارت</button>
                    </div>
                  </div>
                `;
              }).join('') : '<div class="empty-card"><p>در حال دریافت لیست بازارها...</p></div>'}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderDexTab() {
    const sn = state.sniperConfig || { enabled: false, minSafetyScore: 70, minLiquidityUsd: 15000, maxOpenPositions: 5, budgetUsd: 25, maxPairAgeMinutes: 5 };
    return `
      <div class="viewport">
        <div class="tab-panel active">
          <section class="glass-card">
            <div class="card-head">
              <div class="head-title"><span class="head-icon amber">🎯</span><span>رادار DEX و اسنایپر زیر ۵ دقیقه</span></div>
              <button type="button" class="btn btn-ghost btn-xs" data-action="toggle-sniper-edit">⚙️ تنظیمات (${Number(sn.minSafetyScore || 70)} / ${Math.round(Number(sn.minLiquidityUsd || 15000) / 1000)}k / ${Number(sn.maxOpenPositions || 5)})</button>
            </div>

            ${state.sniperEditOpen ? `
              <form id="dlr-sniper-form" class="inline-editor" style="margin-bottom:8px">
                <div class="form-grid-2">
                  <label class="field" style="margin:0"><span>حداقل امتیاز امنیت</span><input id="dlr-sn-score" type="number" min="20" max="95" dir="ltr" value="${Number(sn.minSafetyScore ?? 70)}" /></label>
                  <label class="field" style="margin:0"><span>حداقل نقدینگی ($)</span><input id="dlr-sn-liq" type="number" min="1000" dir="ltr" value="${Number(sn.minLiquidityUsd ?? 15000)}" /></label>
                  <label class="field" style="margin:0"><span>حداکثر پوزیشن (تا ۲۵)</span><input id="dlr-sn-max" type="number" min="1" max="25" dir="ltr" value="${Number(sn.maxOpenPositions ?? 5)}" /></label>
                  <label class="field" style="margin:0"><span>بودجه هر شکار ($)</span><input id="dlr-sn-budget" type="number" min="5" dir="ltr" value="${Number(sn.budgetUsd ?? 25)}" /></label>
                </div>
                <label class="check-row"><input id="dlr-sn-enabled" type="checkbox" ${sn.enabled ? 'checked' : ''} /><span>اسنایپر خودکار فعال باشد</span></label>
                <button type="submit" class="btn btn-emerald btn-xs">ذخیره تنظیمات اسنایپر</button>
              </form>
            ` : ''}

            <div class="mode-seg" style="margin-bottom:8px">
              <button type="button" class="mode-pill-btn ${state.dexMode === 'trending' ? 'active' : ''}" data-action="set-dex-mode" data-mode="trending">🔥 توکن‌های داغ DEX</button>
              <button type="button" class="mode-pill-btn ${state.dexMode === 'sniper5m' ? 'active-emerald' : ''}" data-action="set-dex-mode" data-mode="sniper5m">⚡ اسنایپر زیر ۵ دقیقه</button>
            </div>

            ${state.dexMode === 'trending' ? `
              <form id="dlr-dex-search-form" class="search-row">
                <input id="dlr-dex-q" type="search" placeholder="نام توکن یا آدرس قرارداد (Contract)..." value="${esc(state.dexSearchQuery)}" />
                <button type="submit" class="btn btn-cobalt btn-sm">جستجو</button>
              </form>
            ` : ''}

            ${state.dexAnalysis ? `
              <div class="dex-verdict-box">
                <div class="dex-verdict-head">
                  <span>🧠 تحلیل AI: ${esc(state.dexAnalysis.symbol || '')} (${esc(state.dexAnalysis.verdict || '')})</span>
                  <button type="button" class="btn btn-ghost btn-xs" data-action="clear-dex-ai">بستن</button>
                </div>
                <div>${esc(state.dexAnalysis.summaryFa || '')}</div>
              </div>
            ` : ''}

            <div class="list-box tall">
              ${state.dexPairs.length ? state.dexPairs.slice(0, 20).map((p, idx) => {
                const score = Number(p.safetyScore ?? 72);
                const chg = Number(p.priceChange24hPct ?? p.priceChange1hPct ?? 0);
                const ageTxt = typeof p.ageMinutes === 'number' ? ` · ${Math.max(1, Math.round(p.ageMinutes))}m` : '';
                return `
                  <div class="item-row">
                    <div class="row-left">
                      <span class="coin-avatar" style="background:linear-gradient(135deg,#059669,#047857)">${esc(String(p.symbol || 'TK').slice(0, 3))}</span>
                      <div style="min-width:0">
                        <div class="item-title">
                          <span>${esc(p.symbol)}</span>
                          <span class="badge-cobalt">${esc(String(p.chainId || '').toUpperCase())}${ageTxt}</span>
                        </div>
                        <div class="item-sub">نقدینگی ${fmtUsd(p.liquidityUsd, 0)} · امنیت ${score}/100</div>
                      </div>
                    </div>
                    <div class="item-actions">
                      <span class="pct-pill ${chg >= 0 ? 'pos' : 'neg'}" dir="ltr">${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%</span>
                      <button type="button" class="btn btn-ghost btn-xs" data-action="dex-ai" data-idx="${idx}">AI</button>
                      <button type="button" class="btn btn-emerald btn-xs" data-action="dex-buy" data-idx="${idx}">خرید $${Number(sn.budgetUsd || 25)}</button>
                    </div>
                  </div>
                `;
              }).join('') : '<div class="empty-card"><p>موردی یافت نشد — روی بروزرسانی بزنید.</p></div>'}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderAccountTab() {
    const user = state.user || {};
    const d = state.dashboard || {};
    const fee = d.serverFeeSummary || {};
    const isPaperCopy = d.config?.trading_mode !== 'LIVE';
    const base = (state.apiBase || DEFAULT_BASE).replace(/\/$/, '');
    const refLink = `${base}/?ref=${encodeURIComponent(user.referral_code || '')}`;

    return `
      <div class="viewport">
        <div class="tab-panel active">
          <section class="glass-card profile-card">
            <div class="profile-row">
              <div class="avatar-circle">${esc((user.username || 'D').slice(0, 1).toUpperCase())}</div>
              <div style="flex:1;min-width:0">
                <div class="profile-name-row">
                  <strong>${esc(user.display_name || user.username || 'کاربر دلارینو')}</strong>
                  <span class="badge-emerald">${user.phone_verified ? 'تاییدشده ✓' : 'فعال'}</span>
                </div>
                <div class="item-sub" dir="ltr">${esc(user.email || '')}</div>
              </div>
              <button type="button" class="btn btn-danger-soft btn-xs" data-action="logout">خروج</button>
            </div>
            ${Number(user.profile_completed ?? 1) === 0 ? `
              <div style="margin-top:8px">
                <button type="button" class="btn btn-cobalt btn-xs" style="width:100%" data-action="toggle-complete-profile">تکمیل نام کاربری، ایمیل و رمز عبور</button>
              </div>
            ` : ''}
            ${state.completeProfileOpen ? `
              <form id="dlr-complete-form" class="inline-editor" style="margin-top:8px">
                <input id="dlr-cp-user" type="text" dir="ltr" placeholder="نام کاربری جدید" value="${esc(user.username || '')}" required />
                <input id="dlr-cp-email" type="email" dir="ltr" placeholder="ایمیل واقعی" required />
                <input id="dlr-cp-pw" type="password" dir="ltr" minlength="6" placeholder="رمز عبور جدید (حداقل ۶ کاراکتر)" required />
                <button type="submit" class="btn btn-emerald btn-xs">ذخیره مشخصات حساب</button>
              </form>
            ` : ''}
          </section>

          <section class="glass-card">
            <div class="card-head">
              <div class="head-title"><span class="head-icon emerald">🏆</span><span>کپی‌ترید و شبیه‌ساز دمو</span></div>
              <span class="badge-${isPaperCopy ? 'cobalt' : 'emerald'}">${isPaperCopy ? 'حالت PAPER_SIMULATOR فعال' : 'حالت واقعی Trust'}</span>
            </div>
            <div class="list-box">
              ${state.copyTraders.slice(0, 4).map((t) => `
                <div class="item-row">
                  <div>
                    <div class="item-title">${esc(t.display_name)} <span class="badge-emerald">+${Number(t.roi_30d_pct || 0).toFixed(0)}%</span></div>
                    <div class="item-sub">برد ${Number(t.win_rate || 0)}% · ${esc(t.specialty || '')}</div>
                  </div>
                  <button type="button" class="btn btn-cobalt btn-xs" data-action="follow-trader" data-id="${esc(t.id)}">فالو ۱-کلیک</button>
                </div>
              `).join('')}
              ${state.smartWallets.slice(0, 3).map((w) => `
                <div class="item-row">
                  <div>
                    <div class="item-title">🐋 ${esc(w.display_name)} <span class="badge-cobalt">${esc(String(w.chain_id || '').toUpperCase())}</span></div>
                    <div class="item-sub">۳۰روزه +${Number(w.roi_30d_pct || 0).toFixed(0)}% · برد ${Number(w.win_rate || 0)}%</div>
                  </div>
                  <button type="button" class="btn btn-emerald btn-xs" data-action="follow-smart-wallet" data-id="${esc(w.id)}" data-chain="${esc(w.chain_id)}" data-label="${esc(w.display_name)}">
                    ${isPaperCopy ? 'کپی دمو' : 'کپی ۱-کلیک'}
                  </button>
                </div>
              `).join('')}
            </div>
          </section>

          <section class="glass-card referral-card">
            <div class="card-head">
              <div class="head-title"><span class="head-icon cobalt">💎</span><span>کارمزد ۳٪ سود و لینک دعوت</span></div>
              <span class="badge-emerald">${Number(fee.freeTradesRemaining ?? 3)}/${Number(fee.freeTradesLimit ?? 3)} رایگان</span>
            </div>
            <p class="hint">معوق: ${fmtUsd(fee.accruedFeeUsd ?? 0, 2)} · تسویه‌شده: ${fmtUsd(fee.settledFeeUsd ?? 0, 2)}</p>
            <div class="ref-row">
              <code dir="ltr">${esc(refLink)}</code>
              <button type="button" class="btn btn-cobalt btn-xs" data-action="copy-text" data-text="${esc(refLink)}">کپی</button>
            </div>
          </section>

          <section class="glass-card">
            <div class="card-head">
              <div class="head-title"><span class="head-icon cobalt">🔑</span><span>کلید همگام‌سازی اکستنشن</span></div>
              <button type="button" class="btn btn-ghost btn-xs" data-action="gen-ext-key">${state.extKey ? 'کلید جدید' : 'تولید کلید'}</button>
            </div>
            ${state.extKey ? `
              <div class="ref-row">
                <code dir="ltr">${esc(state.extKey)}</code>
                <button type="button" class="btn btn-cobalt btn-xs" data-action="copy-text" data-text="${esc(state.extKey)}">کپی</button>
              </div>
            ` : '<p class="hint" style="margin:0">شما با نشست رمزنگاری‌شده JWT متصل هستید. در صورت نیاز می‌توانید کلید اکستنشن هم تولید کنید.</p>'}
          </section>
        </div>
      </div>
    `;
  }

  function renderGuideModal() {
    if (!state.guideEngineId) return '';
    const eng = ENGINE_META.find((e) => e.id === state.guideEngineId);
    if (!eng) return '';
    return `
      <div class="ext-modal-backdrop" data-action="close-modal">
        <div class="ext-modal-card">
          <div class="card-head" style="margin-bottom:0">
            <strong>📘 راهنمای ${esc(eng.labelFa)}</strong>
            <button type="button" class="btn btn-ghost btn-xs" data-action="close-modal">بستن</button>
          </div>
          <p class="hint" style="margin:0">${esc(eng.descFa)}</p>
          <ul style="margin:0;padding-inline-start:18px;font-size:11px;line-height:1.7;color:var(--sub)">
            ${eng.bulletsFa.map((b) => `<li>${esc(b)}</li>`).join('')}
          </ul>
          <button type="button" class="btn btn-emerald" data-action="enable-from-guide" data-engine="${eng.id}">فعال‌سازی این موتور ✓</button>
        </div>
      </div>
    `;
  }

  function renderFooter() {
    const dotCls = state.toast.kind === 'ok' ? 'ok' : state.toast.kind === 'err' ? 'err' : '';
    return `
      <footer class="foot glass-panel">
        <div class="foot-status">
          <span id="dlr-toast-dot" class="toast-dot ${dotCls}"></span>
          <span id="dlr-toast-text">${esc(state.toast.msg)}</span>
        </div>
        <span dir="ltr">V11.9.1</span>
      </footer>
    `;
  }

  function render() {
    const root = document.getElementById('dlr-app');
    if (!root) return;

    let body = '';
    if (state.maintenance && !state.user) {
      body = renderMaintenanceView();
    } else if (!state.user) {
      body = renderAuthView();
    } else {
      let tabContent = '';
      if (state.tab === 'home') tabContent = renderHomeTab();
      else if (state.tab === 'markets') tabContent = renderMarketsTab();
      else if (state.tab === 'dex') tabContent = renderDexTab();
      else tabContent = renderAccountTab();
      body = `${renderSegmentedNav()}${tabContent}`;
    }

    root.innerHTML = `${renderTopBar()}${body}${renderFooter()}${renderGuideModal()}`;
    bindDynamicInputs();
  }

  function bindDynamicInputs() {
    const gateCheck = document.getElementById('dlr-gate-check');
    if (gateCheck) {
      gateCheck.addEventListener('change', () => {
        state.gateChecked = gateCheck.checked;
        render();
      });
    }

    const mktSearch = document.getElementById('dlr-mkt-search');
    if (mktSearch) {
      mktSearch.addEventListener('input', () => {
        state.marketSearch = mktSearch.value;
        const pos = mktSearch.selectionStart;
        render();
        const el = document.getElementById('dlr-mkt-search');
        if (el) { el.focus(); if (pos !== null) el.setSelectionRange(pos, pos); }
      });
    }

    const loginForm = document.getElementById('dlr-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = document.getElementById('dlr-login-id')?.value?.trim() || '';
        const password = document.getElementById('dlr-login-pw')?.value || '';
        state.busy = true;
        state.authError = '';
        render();
        try {
          const res = await api('/api/auth/login', {
            method: 'POST',
            skipAuthReset: true,
            body: JSON.stringify({ identifier, password }),
          });
          if (res.requires2fa && res.challengeToken) {
            state.challenge = { challengeToken: res.challengeToken, challengeType: res.challengeType || 'TOTP' };
            setToast('کد تایید مرحله دوم را وارد کنید', 'info');
          } else if (res.token) {
            state.authToken = res.token;
            state.user = res.user || { username: identifier };
            await storageSet({ authToken: res.token });
            await refreshAllData();
          }
        } catch (err) {
          state.authError = err.message;
          setToast(err.message, 'err');
        } finally {
          state.busy = false;
          render();
        }
      });
    }

    const twoFaForm = document.getElementById('dlr-2fa-form');
    if (twoFaForm) {
      twoFaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = document.getElementById('dlr-2fa-input')?.value?.trim() || '';
        if (!val || !state.challenge) return;
        state.busy = true;
        state.authError = '';
        render();
        try {
          const isSec = state.challenge.challengeType === 'SECONDARY_PASSWORD';
          const res = await api(isSec ? '/api/auth/verify-secondary-password' : '/api/auth/2fa/verify-login', {
            method: 'POST',
            skipAuthReset: true,
            body: JSON.stringify(
              isSec
                ? { challengeToken: state.challenge.challengeToken, secondaryPassword: val }
                : { challengeToken: state.challenge.challengeToken, code: val, clientTimestampMs: Date.now() }
            ),
          });
          if (res.token) {
            state.challenge = null;
            state.authToken = res.token;
            state.user = res.user;
            await storageSet({ authToken: res.token });
            await refreshAllData();
          }
        } catch (err) {
          state.authError = err.message;
        } finally {
          state.busy = false;
          render();
        }
      });
    }

    const regForm = document.getElementById('dlr-reg-form');
    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('dlr-reg-user')?.value?.trim() || '';
        const email = document.getElementById('dlr-reg-email')?.value?.trim() || '';
        const password = document.getElementById('dlr-reg-pw')?.value || '';
        const referralCode = document.getElementById('dlr-reg-ref')?.value?.trim() || undefined;
        state.busy = true;
        state.authError = '';
        render();
        try {
          const res = await api('/api/auth/register', {
            method: 'POST',
            skipAuthReset: true,
            body: JSON.stringify({ username, email, password, referralCode }),
          });
          if (res.token) {
            state.authToken = res.token;
            state.user = res.user;
            await storageSet({ authToken: res.token });
            setToast('ثبت‌نام با موفقیت انجام شد ✓', 'ok');
            await refreshAllData();
          }
        } catch (err) {
          state.authError = err.message;
          setToast(err.message, 'err');
        } finally {
          state.busy = false;
          render();
        }
      });
    }

    const keyForm = document.getElementById('dlr-key-form');
    if (keyForm) {
      keyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = document.getElementById('dlr-ext-key-input')?.value?.trim() || '';
        if (!key.startsWith('dlr_ext_')) {
          state.authError = 'کلید باید با dlr_ext_ شروع شود.';
          render();
          return;
        }
        state.busy = true;
        state.authError = '';
        state.extKey = key;
        state.authToken = '';
        render();
        try {
          const res = await api('/api/auth/session', { skipAuthReset: true });
          if (!res?.authenticated || !res.user) throw new Error('کلید اکستنشن نامعتبر است.');
          state.user = res.user;
          await storageSet({ extKey: key });
          await storageRemove(['authToken']);
          await refreshAllData();
        } catch (err) {
          state.extKey = '';
          state.authError = err.message;
        } finally {
          state.busy = false;
          render();
        }
      });
    }

    const twForm = document.getElementById('dlr-tw-form');
    if (twForm) {
      twForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const address = document.getElementById('dlr-tw-evm')?.value?.trim() || '';
        const solanaAddress = document.getElementById('dlr-tw-sol')?.value?.trim() || '';
        const tronAddress = document.getElementById('dlr-tw-tron')?.value?.trim() || '';
        const tonAddress = document.getElementById('dlr-tw-ton')?.value?.trim() || '';
        try {
          state.busy = true;
          await api('/api/trustwallet/connect', {
            method: 'POST',
            body: JSON.stringify({
              ...(address ? { address } : {}),
              ...(solanaAddress ? { solanaAddress } : {}),
              ...(tronAddress ? { tronAddress } : {}),
              ...(tonAddress ? { tonAddress } : {}),
            }),
          });
          state.twConnectOpen = false;
          setToast('آدرس‌های Trust Wallet ذخیره شدند ✓', 'ok');
          await refreshAllData(true);
        } catch (err) {
          setToast(err.message, 'err');
        } finally {
          state.busy = false;
          render();
        }
      });
    }

    const sniperForm = document.getElementById('dlr-sniper-form');
    if (sniperForm) {
      sniperForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          state.busy = true;
          await api('/api/trading/sniper', {
            method: 'POST',
            body: JSON.stringify({
              enabled: Boolean(document.getElementById('dlr-sn-enabled')?.checked),
              minSafetyScore: Number(document.getElementById('dlr-sn-score')?.value || 70),
              minLiquidityUsd: Number(document.getElementById('dlr-sn-liq')?.value || 15000),
              maxOpenPositions: Number(document.getElementById('dlr-sn-max')?.value || 5),
              budgetUsd: Number(document.getElementById('dlr-sn-budget')?.value || 25),
              maxPairAgeMinutes: 5,
            }),
          });
          state.sniperEditOpen = false;
          setToast('تنظیمات اسنایپر ذخیره شد ✓', 'ok');
          await loadDexAndSniper();
        } catch (err) {
          setToast(err.message, 'err');
        } finally {
          state.busy = false;
          render();
        }
      });
    }

    const dexSearchForm = document.getElementById('dlr-dex-search-form');
    if (dexSearchForm) {
      dexSearchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        state.dexSearchQuery = document.getElementById('dlr-dex-q')?.value?.trim() || '';
        await loadDexAndSniper();
      });
    }

    const cpForm = document.getElementById('dlr-complete-form');
    if (cpForm) {
      cpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('dlr-cp-user')?.value?.trim() || '';
        const email = document.getElementById('dlr-cp-email')?.value?.trim() || '';
        const password = document.getElementById('dlr-cp-pw')?.value || '';
        try {
          state.busy = true;
          const res = await api('/api/auth/complete-profile', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
          });
          if (res?.user) state.user = res.user;
          state.completeProfileOpen = false;
          setToast('مشخصات حساب تکمیل شد ✓', 'ok');
          await refreshAllData(true);
        } catch (err) {
          setToast(err.message, 'err');
        } finally {
          state.busy = false;
          render();
        }
      });
    }
  }

  // ---------- Event Delegation ----------
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest?.('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'toggle-theme') {
      applyTheme(state.theme === 'cosmic' ? 'paper' : 'cosmic');
      await storageSet({ theme: state.theme });
      render();
      return;
    }

    if (action === 'refresh-all') {
      state.busy = true;
      render();
      await refreshAllData();
      if (state.tab === 'markets') await loadMarkets();
      else if (state.tab === 'dex') await loadDexAndSniper();
      else if (state.tab === 'account') await loadCopyData();
      state.busy = false;
      render();
      return;
    }

    if (action === 'bypass-maint-login') {
      state.maintenance = null;
      state.authTab = 'login';
      render();
      return;
    }

    if (action === 'open-url') {
      openExternalUrl(btn.dataset.url);
      return;
    }

    if (action === 'set-auth-tab') {
      state.authTab = btn.dataset.tab || 'login';
      state.authError = '';
      render();
      return;
    }

    if (action === 'cancel-2fa') {
      state.challenge = null;
      state.authError = '';
      render();
      return;
    }

    if (action === 'toggle-server-bar') {
      state.serverBarOpen = !state.serverBarOpen;
      render();
      return;
    }

    if (action === 'set-api-preset') {
      state.apiBase = btn.dataset.url || DEFAULT_BASE;
      await storageSet({ apiBase: state.apiBase });
      await loadPublicMeta();
      setToast(`سرور: ${state.apiBase}`, 'ok');
      render();
      return;
    }

    if (action === 'save-api-base') {
      const val = document.getElementById('dlr-api-base-input')?.value?.trim();
      if (val && /^https?:\/\//i.test(val)) {
        state.apiBase = val.replace(/\/$/, '');
        await storageSet({ apiBase: state.apiBase });
        await loadPublicMeta();
        setToast(`سرور ذخیره شد: ${state.apiBase}`, 'ok');
        render();
      }
      return;
    }

    if (action === 'switch-tab') {
      state.tab = btn.dataset.tab || 'home';
      render();
      if (state.tab === 'markets' && !state.markets.length) void loadMarkets();
      if (state.tab === 'dex' && !state.dexPairs.length) void loadDexAndSniper();
      if (state.tab === 'account') void loadCopyData();
      return;
    }

    if (action === 'toggle-hide-bal') {
      state.hideBalance = !state.hideBalance;
      render();
      return;
    }

    if (action === 'toggle-paper-edit') {
      state.paperEditOpen = !state.paperEditOpen;
      render();
      return;
    }

    if (action === 'apply-paper-bal' || action === 'apply-paper-custom') {
      const val = action === 'apply-paper-bal'
        ? Number(btn.dataset.val || 10000)
        : Number(document.getElementById('dlr-paper-input')?.value || 10000);
      try {
        state.busy = true;
        await api('/api/trading/wallet/reset', { method: 'POST', body: JSON.stringify({ balance: val }) });
        state.paperEditOpen = false;
        setToast(`موجودی دمو روی ${fmtUsd(val, 0)} تنظیم شد ✓`, 'ok');
        await refreshAllData(true);
      } catch (err) {
        setToast(err.message, 'err');
      } finally {
        state.busy = false;
        render();
      }
      return;
    }

    if (action === 'toggle-budget-edit') {
      state.budgetEditOpen = !state.budgetEditOpen;
      render();
      return;
    }

    if (action === 'save-budget-lev' || action === 'set-auto-lev') {
      const bVal = Number(document.getElementById('dlr-budget-input')?.value || 0);
      const lVal = Math.max(1, Math.min(100, Math.round(Number(document.getElementById('dlr-lev-input')?.value || 10))));
      try {
        state.busy = true;
        const payload = action === 'set-auto-lev'
          ? { use_signal_leverage: true }
          : {
              bot_budget_mode: bVal > 0 ? 'FIXED_USD' : 'FULL_BALANCE',
              bot_budget_usd: bVal > 0 ? bVal : 0,
              max_leverage: lVal,
              use_signal_leverage: false,
            };
        await api('/api/trading/config', { method: 'PATCH', body: JSON.stringify(payload) });
        state.budgetEditOpen = false;
        setToast('بودجه و اهرم ذخیره شد ✓', 'ok');
        await refreshAllData(true);
      } catch (err) {
        setToast(err.message, 'err');
      } finally {
        state.busy = false;
        render();
      }
      return;
    }

    if (action === 'set-gate-mode') {
      state.gateMode = btn.dataset.mode === 'LIVE' ? 'LIVE' : 'PAPER';
      render();
      return;
    }

    if (action === 'confirm-gate') {
      try {
        state.busy = true;
        await api('/api/trading/accept-risk-terms', {
          method: 'POST',
          body: JSON.stringify({ tradingMode: state.gateMode }),
        });
        setToast('قوانین و حالت حساب با موفقیت ثبت شد ✓', 'ok');
        await refreshAllData(true);
      } catch (err) {
        setToast(err.message, 'err');
      } finally {
        state.busy = false;
        render();
      }
      return;
    }

    if (action === 'ack-popup') {
      try {
        await api(`/api/trading/popups/${encodeURIComponent(btn.dataset.id)}/ack`, { method: 'POST' });
        await refreshAllData(true);
      } catch (err) {
        setToast(err.message, 'err');
      }
      return;
    }

    if (action === 'set-exec-mode') {
      try {
        state.busy = true;
        const payload = {};
        if (btn.dataset.trading) payload.tradingMode = btn.dataset.trading;
        if (btn.dataset.exec) payload.executionMode = btn.dataset.exec;
        await api('/api/trustwallet/execution-mode', { method: 'POST', body: JSON.stringify(payload) });
        setToast('حالت اجرا بروزرسانی شد ✓', 'ok');
        await refreshAllData(true);
      } catch (err) {
        setToast(err.message, 'err');
      } finally {
        state.busy = false;
        render();
      }
      return;
    }

    if (action === 'bot-start' || action === 'bot-stop' || action === 'ai-scan' || action === 'kill-switch') {
      try {
        state.busy = true;
        render();
        if (action === 'bot-start') {
          const engines = state.dashboard?.activeEngines || [];
          await api('/api/trading/bot/start', {
            method: 'POST',
            body: JSON.stringify({ activeEngines: engines, scanScope: 'ALL_MARKET' }),
          });
          setToast('ربات با موفقیت روشن شد 🟢', 'ok');
        } else if (action === 'bot-stop') {
          await api('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: false }) });
          setToast('ربات متوقف شد 🔴', 'ok');
        } else if (action === 'ai-scan') {
          await api('/api/trading/ai-scan-now', { method: 'POST', body: JSON.stringify({}) });
          setToast('اسکن فوری AI انجام شد ⚡', 'ok');
        } else {
          await api('/api/trading/bot/kill-switch', { method: 'POST', body: JSON.stringify({}) });
          setToast('Kill Switch اجرا شد 🛑', 'ok');
        }
        await refreshAllData(true);
      } catch (err) {
        setToast(err.message, 'err');
      } finally {
        state.busy = false;
        render();
      }
      return;
    }

    if (action === 'toggle-engine' || action === 'enable-from-guide') {
      const engine = btn.dataset.engine;
      const cur = new Set(state.dashboard?.activeEngines || []);
      const enabled = action === 'enable-from-guide' ? true : !cur.has(engine);
      try {
        await api('/api/trading/engines/toggle', { method: 'POST', body: JSON.stringify({ engine, enabled }) });
        state.guideEngineId = null;
        setToast(enabled ? 'موتور فعال شد 🟢' : 'موتور خاموش شد ⚪️', 'ok');
        await refreshAllData(true);
      } catch (err) {
        setToast(err.message, 'err');
      }
      return;
    }

    if (action === 'show-engine-guide') {
      state.guideEngineId = btn.dataset.engine || null;
      render();
      return;
    }

    if (action === 'close-modal') {
      if (ev.target === btn || btn.closest('.ext-modal-card')) {
        if (btn.classList.contains('ext-modal-backdrop') && ev.target !== btn) return;
        state.guideEngineId = null;
        render();
      }
      return;
    }

    if (action === 'toggle-tw-connect') {
      state.twConnectOpen = !state.twConnectOpen;
      render();
      return;
    }

    if (action === 'set-playbook-mode') {
      state.playbookMode = btn.dataset.mode || 'FUTURES';
      render();
      return;
    }

    if (action === 'close-cex' || action === 'close-dex' || action === 'close-copy' || action === 'close-perp') {
      const id = btn.dataset.id;
      try {
        state.busy = true;
        if (action === 'close-cex') await api(`/api/trading/positions/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify({}) });
        if (action === 'close-dex') await api(`/api/trustwallet/dex-trades/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify({}) });
        if (action === 'close-copy') await api(`/api/copy-trade/positions-v2/${encodeURIComponent(id)}/action`, { method: 'POST', body: JSON.stringify({ action: 'CLOSE' }) });
        if (action === 'close-perp') await api(`/api/dex/perp-orders/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify({}) });
        setToast('معامله بسته شد ✓', 'ok');
        await refreshAllData(true);
      } catch (err) {
        setToast(err.message, 'err');
      } finally {
        state.busy = false;
        render();
      }
      return;
    }

    if (action === 'close-batch') {
      try {
        state.busy = true;
        await api('/api/trading/positions/close-batch', { method: 'POST', body: JSON.stringify({ scope: btn.dataset.scope }) });
        setToast('بستن یکجای معاملات انجام شد ✓', 'ok');
        await refreshAllData(true);
      } catch (err) {
        setToast(err.message, 'err');
      } finally {
        state.busy = false;
        render();
      }
      return;
    }

    if (action === 'set-market-type') {
      state.marketType = btn.dataset.mkt === 'SPOT' ? 'SPOT' : 'FUTURES';
      await loadMarkets();
      return;
    }

    if (action === 'set-mkt-filter') {
      state.marketFilter = btn.dataset.filter || 'ALL';
      render();
      return;
    }

    if (action === 'toggle-sniper-edit') {
      state.sniperEditOpen = !state.sniperEditOpen;
      render();
      return;
    }

    if (action === 'set-dex-mode') {
      state.dexMode = btn.dataset.mode === 'sniper5m' ? 'sniper5m' : 'trending';
      await loadDexAndSniper();
      return;
    }

    if (action === 'clear-dex-ai') {
      state.dexAnalysis = null;
      render();
      return;
    }

    if (action === 'dex-ai' || action === 'dex-buy') {
      const pair = state.dexPairs[Number(btn.dataset.idx)];
      if (!pair) return;
      try {
        state.busy = true;
        render();
        if (action === 'dex-ai') {
          const res = await api('/api/dex/ai-analyze', { method: 'POST', body: JSON.stringify({ pair }) });
          state.dexAnalysis = { ...(res?.analysis || {}), symbol: pair.symbol };
          setToast('تحلیل هوش مصنوعی آماده شد ✓', 'ok');
        } else {
          const budget = Number(state.sniperConfig?.budgetUsd || 25);
          await api('/api/dex/direct-buy', { method: 'POST', body: JSON.stringify({ pair, amountUsd: budget }) });
          setToast(`سفارش خرید ${pair.symbol} ($${budget}) ثبت شد ✓`, 'ok');
          await refreshAllData(true);
        }
      } catch (err) {
        setToast(err.message, 'err');
      } finally {
        state.busy = false;
        render();
      }
      return;
    }

    if (action === 'follow-trader') {
      try {
        await api('/api/copy-trade/follow', { method: 'POST', body: JSON.stringify({ traderId: btn.dataset.id, allocationUsd: 100 }) });
        setToast('تریدر فالو شد ✓', 'ok');
        await loadCopyData();
      } catch (err) {
        setToast(err.message, 'err');
      }
      return;
    }

    if (action === 'follow-smart-wallet') {
      try {
        const isPaper = state.dashboard?.config?.trading_mode !== 'LIVE';
        await api('/api/copy-trade/rules', {
          method: 'POST',
          body: JSON.stringify({
            traderKind: 'SMART_WALLET',
            traderId: btn.dataset.id,
            traderLabel: btn.dataset.label,
            chainId: btn.dataset.chain || 'solana',
            executionMode: isPaper ? 'PAPER_SIMULATOR' : 'TRUST_ONE_CLICK',
            allocatedMarginUsd: 100,
            orderSizeUsd: 25,
          }),
        });
        setToast(`قانون کپی ${isPaper ? 'دمو ' : ''}ثبت شد ✓`, 'ok');
        await loadCopyData();
      } catch (err) {
        setToast(err.message, 'err');
      }
      return;
    }

    if (action === 'toggle-complete-profile') {
      state.completeProfileOpen = !state.completeProfileOpen;
      render();
      return;
    }

    if (action === 'gen-ext-key') {
      try {
        const res = await api('/api/auth/extension-key', { method: 'POST', body: JSON.stringify({ rotate: Boolean(state.extKey) }) });
        if (res?.key) {
          state.extKey = res.key;
          await storageSet({ extKey: res.key });
          setToast('کلید اکستنشن بروزرسانی شد ✓', 'ok');
          render();
        }
      } catch (err) {
        setToast(err.message, 'err');
      }
      return;
    }

    if (action === 'copy-text') {
      try {
        await navigator.clipboard.writeText(btn.dataset.text || '');
        setToast('کپی شد ✓', 'ok');
      } catch {
        setToast('امکان کپی خودکار نبود', 'err');
      }
      return;
    }

    if (action === 'logout') {
      await api('/api/auth/logout', { method: 'POST', skipAuthReset: true }).catch(() => {});
      state.authToken = '';
      state.extKey = '';
      state.user = null;
      state.dashboard = null;
      state.playbook = null;
      await storageRemove(['authToken', 'extKey']);
      notifyBadgeSync();
      await loadPublicMeta();
      setToast('خروج انجام شد', 'info');
      render();
    }
  });

  // ---------- Boot ----------
  async function boot() {
    const stored = await storageGet(['apiBase', 'authToken', 'extKey', 'theme']);
    if (stored.apiBase) state.apiBase = stored.apiBase;
    if (stored.authToken) state.authToken = stored.authToken;
    if (stored.extKey) state.extKey = stored.extKey;
    applyTheme(stored.theme || 'paper');

    await loadPublicMeta();
    if (state.authToken || state.extKey) {
      try {
        const sess = await api('/api/auth/session', { skipAuthReset: true });
        if (sess?.authenticated && sess.user) {
          state.user = sess.user;
          await refreshAllData(true);
          return;
        }
      } catch { /* fall through to unauthenticated state */ }
      state.authToken = '';
      state.extKey = '';
      await storageRemove(['authToken', 'extKey']);
    }
    render();
  }

  void boot();
})();
