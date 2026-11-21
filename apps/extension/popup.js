const DEFAULT_API_BASE = 'https://dollarino.pages.dev';

let state = {
  apiBase: DEFAULT_API_BASE,
  extKey: '',
  isRunning: false,
  tradingMode: 'PAPER',
};

const els = {
  userMeta: document.getElementById('userMeta'),
  setupCard: document.getElementById('setupCard'),
  apiBaseInput: document.getElementById('apiBaseInput'),
  extKeyInput: document.getElementById('extKeyInput'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  settingsToggleBtn: document.getElementById('settingsToggleBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  botStateLabel: document.getElementById('botStateLabel'),
  botModeLabel: document.getElementById('botModeLabel'),
  balanceTotal: document.getElementById('balanceTotal'),
  openPnl: document.getElementById('openPnl'),
  openCount: document.getElementById('openCount'),
  toggleBotBtn: document.getElementById('toggleBotBtn'),
  killSwitchBtn: document.getElementById('killSwitchBtn'),
  positionsList: document.getElementById('positionsList'),
  openWebLink: document.getElementById('openWebLink'),
  dexSearchInput: document.getElementById('dexSearchInput'),
  dexSearchBtn: document.getElementById('dexSearchBtn'),
  dexList: document.getElementById('dexList'),
  toastText: document.getElementById('toastText'),
};

function setToast(msg) {
  els.toastText.textContent = msg;
}

async function apiFetch(path, options = {}) {
  const base = (state.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (state.extKey) headers['X-Dollarino-Extension-Key'] = state.extKey;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function loadOverview() {
  if (!state.extKey) {
    els.setupCard.classList.remove('hidden');
    els.userMeta.textContent = 'لطفاً کلید اکستنشن را وارد کنید';
    return;
  }
  try {
    const [sess, ov] = await Promise.all([apiFetch('/api/auth/session'), apiFetch('/api/trading/overview')]);
    els.setupCard.classList.add('hidden');
    const u = sess.user || {};
    els.userMeta.textContent = `${u.username || 'کاربر'} · ${u.phoneVerified ? 'احراز تاییدشده ✅' : 'در انتظار احراز'}`;
    els.openWebLink.href = (state.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');

    const cfg = ov.config || {};
    const botState = cfg.bot_state || 'STOPPED';
    state.isRunning = botState === 'RUNNING_PAPER' || botState === 'RUNNING_LIVE';
    state.tradingMode = cfg.trading_mode || 'PAPER';

    els.botStateLabel.textContent = state.isRunning ? '🟢 فعال و در حال ترید' : '⚪️ متوقف';
    els.botStateLabel.className = `state-pill ${state.isRunning ? 'running' : 'stopped'}`;
    els.botModeLabel.textContent = `${state.tradingMode} · ${cfg.strategy_key || 'AI'}`;

    const totalBal = Number(ov.balance?.total || 0);
    const openTrades = Array.isArray(ov.openTrades) ? ov.openTrades : [];
    const totalPnl = openTrades.reduce((acc, t) => acc + Number(t.unrealized_pnl || 0), 0);

    els.balanceTotal.textContent = `$${totalBal.toFixed(2)}`;
    els.openPnl.textContent = `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`;
    els.openPnl.className = totalPnl >= 0 ? 'pos-pnl pos' : 'pos-pnl neg';
    els.openCount.textContent = String(openTrades.length);

    els.toggleBotBtn.textContent = state.isRunning ? '🔴 خاموش کردن ربات' : '🟢 روشن کردن ربات';
    els.toggleBotBtn.className = `btn flex-1 ${state.isRunning ? 'btn-danger' : 'btn-success'}`;

    if (!openTrades.length) {
      els.positionsList.innerHTML = '<p class="empty">در حال حاضر معامله بازی وجود ندارد.</p>';
    } else {
      els.positionsList.innerHTML = openTrades
        .slice(0, 6)
        .map((t) => {
          const pnl = Number(t.unrealized_pnl || 0);
          return `<div class="item-row">
            <div>
              <strong>${t.symbol} · ${t.direction} ${t.leverage}x</strong>
              <div class="item-sub" dir="ltr">Entry $${t.entry_price} · SL $${t.current_stop_loss}</div>
            </div>
            <strong class="pos-pnl ${pnl >= 0 ? 'pos' : 'neg'}" dir="ltr">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</strong>
          </div>`;
        })
        .join('');
    }
    chrome.runtime.sendMessage({ type: 'SYNC_BADGE' }).catch(() => {});
    setToast('همگام‌سازی زنده برقرار است ✅');
  } catch (err) {
    setToast(`خطا: ${err.message}`);
    els.setupCard.classList.remove('hidden');
  }
}

async function loadDexTokens(query = '') {
  els.dexList.innerHTML = '<p class="empty">در حال دریافت از DexScreener...</p>';
  try {
    let pairs = [];
    if (state.extKey) {
      const url = query ? `/api/dex/search?q=${encodeURIComponent(query)}` : '/api/dex/trending';
      const data = await apiFetch(url);
      pairs = query ? data.results || [] : data.trending || [];
    } else {
      const dexUrl = query
        ? `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`
        : 'https://api.dexscreener.com/token-boosts/top/v1';
      const raw = await fetch(dexUrl).then((r) => r.json());
      if (query) {
        pairs = (raw.pairs || []).slice(0, 8);
      } else {
        const list = Array.isArray(raw) ? raw.slice(0, 6) : [];
        pairs = list.map((b) => ({
          chainId: b.chainId,
          baseToken: { symbol: b.tokenAddress.slice(0, 6), address: b.tokenAddress },
          priceUsd: null,
          liquidity: { usd: 0 },
          trustWallet: { trustWalletDappUrl: b.url, dexScreenerUrl: b.url },
        }));
      }
    }

    if (!pairs.length) {
      els.dexList.innerHTML = '<p class="empty">توکنی یافت نشد.</p>';
      return;
    }

    els.dexList.innerHTML = pairs
      .slice(0, 8)
      .map((p) => {
        const price = p.priceUsd ? `$${Number(p.priceUsd) < 0.01 ? Number(p.priceUsd).toPrecision(4) : Number(p.priceUsd).toFixed(4)}` : 'DEX';
        const twUrl = p.trustWallet?.trustWalletDappUrl || p.url || 'https://link.trustwallet.com';
        const safeScore = typeof p.safetyScore === 'number' ? ` · ایمنی ${p.safetyScore}%` : '';
        return `<div class="item-row">
          <div>
            <strong>${p.baseToken?.symbol || 'TOKEN'} <span class="badge-v">${p.chainId}</span></strong>
            <div class="item-sub" dir="ltr">${price}${safeScore}</div>
          </div>
          <a href="${twUrl}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none">🦊 سوآپ TW</a>
        </div>`;
      })
      .join('');
  } catch (err) {
    els.dexList.innerHTML = `<p class="empty">خطا در دریافت رادار DEX: ${err.message}</p>`;
  }
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const id = `tab-${btn.dataset.tab}`;
    document.getElementById(id)?.classList.add('active');
    if (btn.dataset.tab === 'dex') loadDexTokens(els.dexSearchInput.value.trim());
  });
});

els.settingsToggleBtn.addEventListener('click', () => {
  els.setupCard.classList.toggle('hidden');
});

els.saveConfigBtn.addEventListener('click', async () => {
  state.apiBase = (els.apiBaseInput.value || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  state.extKey = els.extKeyInput.value.trim();
  await chrome.storage.local.set({ apiBase: state.apiBase, extKey: state.extKey });
  setToast('در حال اتصال...');
  await loadOverview();
});

els.refreshBtn.addEventListener('click', () => {
  loadOverview();
});

els.toggleBotBtn.addEventListener('click', async () => {
  if (!state.extKey) return;
  try {
    setToast('در حال ارسال فرمان...');
    if (state.isRunning) {
      await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: false }) });
    } else {
      await apiFetch('/api/trading/bot/start', { method: 'POST', body: JSON.stringify({ mode: state.tradingMode }) });
    }
    await loadOverview();
  } catch (err) {
    setToast(`خطا: ${err.message}`);
  }
});

els.killSwitchBtn.addEventListener('click', async () => {
  if (!state.extKey) return;
  try {
    setToast('اجرای توقف اضطراری (Kill Switch)...');
    await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: true }) });
    await loadOverview();
  } catch (err) {
    setToast(`خطا: ${err.message}`);
  }
});

els.dexSearchBtn.addEventListener('click', () => {
  loadDexTokens(els.dexSearchInput.value.trim());
});

(async () => {
  const saved = await chrome.storage.local.get(['apiBase', 'extKey']);
  state.apiBase = saved.apiBase || DEFAULT_API_BASE;
  state.extKey = saved.extKey || '';
  els.apiBaseInput.value = state.apiBase;
  els.extKeyInput.value = state.extKey;
  await loadOverview();
})();
