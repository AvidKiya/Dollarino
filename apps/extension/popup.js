const DEFAULT_API_BASE = 'https://dollarino.pages.dev';

const state = {
  apiBase: DEFAULT_API_BASE,
  extKey: '',
  theme: 'dark',
  isRunning: false,
  tradingMode: 'PAPER',
  referralUrl: '',
};

const els = {
  connDot: document.getElementById('connDot'),
  userMeta: document.getElementById('userMeta'),
  themeBtn: document.getElementById('themeBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  settingsToggleBtn: document.getElementById('settingsToggleBtn'),
  apiBaseInput: document.getElementById('apiBaseInput'),
  extKeyInput: document.getElementById('extKeyInput'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  clearConfigBtn: document.getElementById('clearConfigBtn'),
  botStateLabel: document.getElementById('botStateLabel'),
  botModeLabel: document.getElementById('botModeLabel'),
  balanceTotal: document.getElementById('balanceTotal'),
  openPnl: document.getElementById('openPnl'),
  openCount: document.getElementById('openCount'),
  toggleBotBtn: document.getElementById('toggleBotBtn'),
  aiScanBtn: document.getElementById('aiScanBtn'),
  killSwitchBtn: document.getElementById('killSwitchBtn'),
  positionsList: document.getElementById('positionsList'),
  openWebLink: document.getElementById('openWebLink'),
  marketsList: document.getElementById('marketsList'),
  refreshMarketsBtn: document.getElementById('refreshMarketsBtn'),
  dexSearchInput: document.getElementById('dexSearchInput'),
  dexSearchBtn: document.getElementById('dexSearchBtn'),
  dexList: document.getElementById('dexList'),
  referralBox: document.getElementById('referralBox'),
  refTierBadge: document.getElementById('refTierBadge'),
  refCodeText: document.getElementById('refCodeText'),
  copyRefBtn: document.getElementById('copyRefBtn'),
  toastText: document.getElementById('toastText'),
};

function escHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setToast(msg) {
  els.toastText.textContent = msg;
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tabName}`));
  if (tabName === 'dex') void loadDexTokens(els.dexSearchInput.value.trim());
  if (tabName === 'markets') void loadMarkets();
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

function applyTheme(theme) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
}

async function loadOverview() {
  if (!state.extKey) {
    els.connDot.className = 'conn-dot offline';
    els.userMeta.textContent = 'در انتظار ثبت کلید اکستنشن';
    els.botStateLabel.textContent = 'متصل نشده';
    els.positionsList.innerHTML = '<p class="empty">برای مشاهده معاملات، از تب «اتصال و رفرال» کلید را ثبت کنید.</p>';
    return;
  }
  try {
    const [sess, ov] = await Promise.all([apiFetch('/api/auth/session'), apiFetch('/api/trading/overview')]);
    const u = sess.user || {};
    els.connDot.className = 'conn-dot online';
    els.userMeta.textContent = `${u.username || 'کاربر'} · ${u.phone_verified ? 'احراز تاییدشده' : 'اکستنشن متصل'}`;
    els.openWebLink.href = (state.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');

    const cfg = ov.config || {};
    const botState = cfg.bot_state || 'STOPPED';
    state.isRunning = botState === 'RUNNING_PAPER' || botState === 'RUNNING_LIVE';
    state.tradingMode = cfg.trading_mode || 'PAPER';

    els.botStateLabel.textContent = state.isRunning ? 'فعال و در حال ترید ۲۴/۷' : 'آماده و متوقف';
    els.botStateLabel.className = `state-pill ${state.isRunning ? 'running' : 'stopped'}`;
    els.botModeLabel.textContent = `${state.tradingMode} · ${cfg.market_type || 'FUTURES'}`;

    const totalBal = Number(ov.balance?.total || 0);
    const openTrades = Array.isArray(ov.openTrades) ? ov.openTrades : [];
    const totalPnl = openTrades.reduce((acc, t) => acc + Number(t.unrealized_pnl || 0), 0);

    els.balanceTotal.textContent = `$${totalBal.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    els.openPnl.textContent = `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`;
    els.openPnl.className = totalPnl >= 0 ? 'pos-pnl pos' : 'pos-pnl neg';
    els.openCount.textContent = String(openTrades.length);

    els.toggleBotBtn.textContent = state.isRunning ? 'خاموش کردن ربات' : 'روشن کردن ربات';
    els.toggleBotBtn.className = `btn flex-1 ${state.isRunning ? 'btn-danger' : 'btn-emerald'}`;

    if (!openTrades.length) {
      els.positionsList.innerHTML = '<p class="empty">در حال حاضر معامله بازی در این حساب وجود ندارد.</p>';
    } else {
      els.positionsList.innerHTML = openTrades
        .slice(0, 8)
        .map((t) => {
          const pnl = Number(t.unrealized_pnl || 0);
          return `<div class="item-row">
            <div>
              <div class="item-title">
                <span>${escHtml(t.symbol)}</span>
                <span class="badge-gold">${escHtml(t.direction)} ${escHtml(t.leverage)}x</span>
              </div>
              <div class="item-sub" dir="ltr">Entry $${escHtml(t.entry_price)} · SL $${escHtml(t.current_stop_loss)}</div>
            </div>
            <div class="item-actions">
              <strong class="pos-pnl ${pnl >= 0 ? 'pos' : 'neg'}" dir="ltr">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</strong>
              <button class="btn btn-danger btn-xs close-pos-btn" data-id="${escHtml(t.id)}">بستن</button>
            </div>
          </div>`;
        })
        .join('');
    }

    void loadReferralInfo();
    chrome.runtime.sendMessage({ type: 'SYNC_BADGE' }).catch(() => {});
    setToast('همگام‌سازی زنده برقرار است');
  } catch (err) {
    els.connDot.className = 'conn-dot offline';
    setToast(`خطای اتصال: ${err.message}`);
  }
}

async function loadReferralInfo() {
  if (!state.extKey) return;
  try {
    const res = await apiFetch('/api/subscriptions/referrals');
    const code = res.referralCode;
    if (code) {
      const base = (state.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
      state.referralUrl = `${base}/?ref=${code}`;
      els.referralBox.classList.remove('hidden');
      els.refCodeText.textContent = state.referralUrl;
      if (res.tier?.nameFa) els.refTierBadge.textContent = `${res.tier.nameFa} (${res.tier.commissionPct}%)`;
    }
  } catch {
    // ignore if older worker or unauthenticated
  }
}

async function loadMarkets() {
  els.marketsList.innerHTML = '<p class="empty">در حال دریافت نرخ زنده بازار...</p>';
  try {
    if (state.extKey) {
      const res = await apiFetch('/api/trading/markets');
      const list = Array.isArray(res.markets) ? res.markets.slice(0, 12) : [];
      if (list.length) {
        els.marketsList.innerHTML = list
          .map((m) => {
            const ch = Number(m.changePct24h || 0);
            const px = Number(m.lastPrice || 0);
            const pxStr = px >= 100 ? px.toLocaleString('en-US', { maximumFractionDigits: 2 }) : px.toFixed(px >= 1 ? 4 : 6);
            return `<div class="item-row">
              <div>
                <div class="item-title"><strong>${escHtml(m.symbol)}</strong> <span class="badge-cobalt">${escHtml(m.maxLeverage || 20)}x</span></div>
                <div class="item-sub" dir="ltr">Vol $${Math.round(Number(m.volume24h || 0)).toLocaleString()}</div>
              </div>
              <div class="text-end">
                <div class="item-title" dir="ltr">$${pxStr}</div>
                <div class="pos-pnl ${ch >= 0 ? 'pos' : 'neg'}" dir="ltr">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</div>
              </div>
            </div>`;
          })
          .join('');
        return;
      }
    }
    // Public fallback via CoinGecko simple/GeckoTerminal
    const pairs = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'TON'];
    const raw = await Promise.all(
      pairs.map((s) =>
        fetch(`https://api.coinbase.com/v2/prices/${s}-USD/spot`)
          .then((r) => r.json())
          .then((d) => ({ symbol: `${s}USDT`, price: d?.data?.amount || '0' }))
          .catch(() => ({ symbol: `${s}USDT`, price: '0' }))
      )
    );
    els.marketsList.innerHTML = raw
      .filter((x) => Number(x.price) > 0)
      .map(
        (m) => `<div class="item-row">
          <div><div class="item-title"><strong>${escHtml(m.symbol)}</strong></div><div class="item-sub">Live Spot Feed</div></div>
          <strong dir="ltr">$${Number(m.price).toLocaleString('en-US', { maximumFractionDigits: 4 })}</strong>
        </div>`
      )
      .join('');
  } catch (err) {
    els.marketsList.innerHTML = `<p class="empty">خطا در دریافت بازار: ${escHtml(err.message)}</p>`;
  }
}

async function fetchPublicDex(query = '') {
  try {
    const dexUrl = query
      ? `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`
      : 'https://api.dexscreener.com/latest/dex/search?q=PEPE';
    const raw = await fetch(dexUrl).then((r) => r.json());
    if (Array.isArray(raw?.pairs) && raw.pairs.length) {
      return raw.pairs.slice(0, 10);
    }
  } catch {
    /* fallback to GeckoTerminal */
  }
  const gUrl = query
    ? `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(query)}&include=base_token`
    : 'https://api.geckoterminal.com/api/v2/networks/trending_pools?include=base_token';
  const g = await fetch(gUrl).then((r) => r.json());
  const inc = new Map((g.included || []).map((x) => [x.id, x.attributes]));
  return (g.data || []).slice(0, 10).map((p) => {
    const a = p.attributes || {};
    const rawNet = p.relationships?.network?.data?.id || 'bsc';
    const b = inc.get(p.relationships?.base_token?.data?.id || '') || {};
    const sym = b.symbol || (a.name || '').split('/')[0]?.trim() || 'TOKEN';
    return {
      chainId: rawNet === 'eth' ? 'ethereum' : rawNet,
      baseToken: { symbol: sym, address: b.address || a.address },
      priceUsd: a.base_token_price_usd,
      liquidity: { usd: Number(a.reserve_in_usd || 0) },
      priceChange: { h24: Number(a.price_change_percentage?.h24 || 0) },
      url: `https://www.geckoterminal.com/${rawNet}/pools/${a.address}`,
    };
  });
}

async function loadDexTokens(query = '') {
  els.dexList.innerHTML = '<p class="empty">در حال دریافت از DexScreener & GeckoTerminal...</p>';
  try {
    let pairs = [];
    if (state.extKey) {
      try {
        const url = query ? `/api/dex/search?q=${encodeURIComponent(query)}` : '/api/dex/trending';
        const data = await apiFetch(url);
        pairs = query ? data.pairs || data.results || [] : data.trending || data.pairs || [];
      } catch {
        pairs = [];
      }
    }
    if (!pairs.length) {
      pairs = await fetchPublicDex(query);
    }

    if (!pairs.length) {
      els.dexList.innerHTML = '<p class="empty">توکنی با این نام یافت نشد.</p>';
      return;
    }

    els.dexList.innerHTML = pairs
      .slice(0, 10)
      .map((p) => {
        const numPx = Number(p.priceUsd || 0);
        const price = numPx > 0 ? `$${numPx < 0.01 ? numPx.toPrecision(4) : numPx.toFixed(4)}` : 'DEX';
        const liq = Number(p.liquidity?.usd || 0);
        const liqStr = liq >= 1000 ? ` · Liq $${Math.round(liq / 1000)}K` : '';
        const ch24 = Number(p.priceChange?.h24 || 0);
        const twUrl = p.trustWallet?.trustWalletDappUrl || p.url || 'https://link.trustwallet.com';
        const safeScore = typeof p.safetyScore === 'number' ? ` · ایمنی ${p.safetyScore}%` : '';
        return `<div class="item-row">
          <div>
            <div class="item-title">
              <strong>${escHtml(p.baseToken?.symbol || 'TOKEN')}</strong>
              <span class="badge-cobalt">${escHtml(p.chainId)}</span>
              <span class="pos-pnl ${ch24 >= 0 ? 'pos' : 'neg'}" dir="ltr">${ch24 >= 0 ? '+' : ''}${ch24.toFixed(1)}%</span>
            </div>
            <div class="item-sub" dir="ltr">${escHtml(price)}${escHtml(liqStr)}${escHtml(safeScore)}</div>
          </div>
          <a href="${escHtml(twUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-gold btn-xs">سوآپ TW</a>
        </div>`;
      })
      .join('');
  } catch (err) {
    els.dexList.innerHTML = `<p class="empty">خطا در رادار DEX: ${escHtml(err.message)}</p>`;
  }
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.querySelectorAll('.dex-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const q = chip.dataset.q || '';
    els.dexSearchInput.value = q;
    void loadDexTokens(q);
  });
});

els.settingsToggleBtn.addEventListener('click', () => switchTab('sync'));

els.themeBtn.addEventListener('click', async () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  await chrome.storage.local.set({ theme: state.theme });
});

els.saveConfigBtn.addEventListener('click', async () => {
  state.apiBase = (els.apiBaseInput.value || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  state.extKey = els.extKeyInput.value.trim();
  await chrome.storage.local.set({ apiBase: state.apiBase, extKey: state.extKey });
  setToast('در حال تست و همگام‌سازی...');
  await loadOverview();
  if (els.connDot.classList.contains('online')) switchTab('bot');
});

els.clearConfigBtn.addEventListener('click', async () => {
  state.extKey = '';
  els.extKeyInput.value = '';
  await chrome.storage.local.remove('extKey');
  els.referralBox.classList.add('hidden');
  await loadOverview();
  setToast('کلید اکستنشن پاک شد');
});

els.refreshBtn.addEventListener('click', () => {
  setToast('در حال بروزرسانی...');
  void loadOverview();
});

els.refreshMarketsBtn.addEventListener('click', () => void loadMarkets());

els.toggleBotBtn.addEventListener('click', async () => {
  if (!state.extKey) return switchTab('sync');
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

els.aiScanBtn.addEventListener('click', async () => {
  if (!state.extKey) return switchTab('sync');
  try {
    els.aiScanBtn.disabled = true;
    setToast('هوش مصنوعی در حال اسکن بازار...');
    await apiFetch('/api/trading/ai-scan-now', { method: 'POST', body: JSON.stringify({ autoExecute: false }) });
    setToast('اسکن هوشمند AI انجام شد');
  } catch (err) {
    setToast(`خطا: ${err.message}`);
  } finally {
    els.aiScanBtn.disabled = false;
  }
});

els.killSwitchBtn.addEventListener('click', async () => {
  if (!state.extKey) return switchTab('sync');
  try {
    setToast('اجرای توقف اضطراری...');
    await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: true }) });
    await loadOverview();
  } catch (err) {
    setToast(`خطا: ${err.message}`);
  }
});

els.positionsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.close-pos-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!id || !state.extKey) return;
  try {
    btn.disabled = true;
    setToast('در حال بستن پوزیشن...');
    await apiFetch(`/api/trading/positions/${encodeURIComponent(id)}/close`, { method: 'POST' });
    await loadOverview();
  } catch (err) {
    setToast(`خطا: ${err.message}`);
    btn.disabled = false;
  }
});

els.dexSearchBtn.addEventListener('click', () => void loadDexTokens(els.dexSearchInput.value.trim()));
els.dexSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void loadDexTokens(els.dexSearchInput.value.trim());
});

els.copyRefBtn.addEventListener('click', () => {
  if (!state.referralUrl) return;
  navigator.clipboard.writeText(state.referralUrl).catch(() => {});
  setToast('لینک رفرال کپی شد');
});

(async () => {
  const saved = await chrome.storage.local.get(['apiBase', 'extKey', 'theme']);
  state.apiBase = saved.apiBase || DEFAULT_API_BASE;
  state.extKey = saved.extKey || '';
  applyTheme(saved.theme || 'dark');
  els.apiBaseInput.value = state.apiBase;
  els.extKeyInput.value = state.extKey;
  await loadOverview();
})();
