import { resolveEngineDisplayLabel } from '@dollarino/core';

export type ProfitCardPeriod = '24H' | '7D' | '30D' | '3M' | '6M' | '1Y' | 'ALL' | 'TRADE';
export type ProfitCardTradeSource = 'ALL' | 'PERP' | 'DEX' | 'COPY';

export interface UnifiedSettledTrade {
  id: string;
  tradeSource: 'PERP' | 'DEX' | 'COPY';
  mode: 'LIVE' | 'PAPER';
  symbol: string;
  baseSymbol: string;
  direction: string;
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  marginUsd: number;
  realizedPnlUsd: number;
  roiPct: number;
  exchangeProvider: string;
  engineKey: string;
  engineLabel: string;
  signalName: string;
  tokenAddress?: string;
  chainId?: string;
  tokenImageUrl?: string;
  closedAt: string;
}

export const ALL_CARD_PERIODS: ProfitCardPeriod[] = ['24H', '7D', '30D', '3M', '6M', '1Y', 'ALL', 'TRADE'];
export const ALL_CARD_SOURCES: ProfitCardTradeSource[] = ['ALL', 'PERP', 'DEX', 'COPY'];

export function normalizeCardPeriod(raw: unknown): ProfitCardPeriod {
  const up = String(raw || '7D').trim().toUpperCase();
  if (ALL_CARD_PERIODS.includes(up as ProfitCardPeriod)) return up as ProfitCardPeriod;
  return '7D';
}

export function normalizeCardSource(raw: unknown): ProfitCardTradeSource {
  const up = String(raw || 'ALL').trim().toUpperCase();
  if (ALL_CARD_SOURCES.includes(up as ProfitCardTradeSource)) return up as ProfitCardTradeSource;
  return 'ALL';
}

export function extractBaseCoin(symbol: string): string {
  const up = String(symbol || 'BTC').trim().toUpperCase();
  const slashParts = up.split(/[/:_-]/);
  const first = slashParts[0] || up;
  const cleaned = first.replace(/(USDT|USDC|BUSD|FDUSD|PERP|USD)$/i, '');
  return cleaned || first || 'BTC';
}

export function buildTokenDisplayIconUrl(baseSymbol: string, chainId?: string, tokenAddress?: string): string {
  const cleanChain = String(chainId || '').trim().toLowerCase();
  const cleanAddr = String(tokenAddress || '').trim();
  if (cleanChain && cleanAddr && !cleanAddr.startsWith('0x0000')) {
    return `https://dd.dexscreener.com/ds-data/tokens/${encodeURIComponent(cleanChain)}/${encodeURIComponent(cleanAddr)}.png`;
  }
  const lower = extractBaseCoin(baseSymbol).toLowerCase();
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${encodeURIComponent(lower)}.png`;
}

function classifyEngineKey(strategyKey?: string | null, signalSource?: string | null, note?: string | null): string {
  const sk = String(strategyKey || '').toLowerCase();
  const src = String(signalSource || '').toUpperCase();
  const nt = String(note || '').toLowerCase();
  if (sk === 'copy_trade' || src.includes('COPY')) return 'COPY_TRADE';
  if (sk === 'listing_sniper' || nt.includes('sniper') || nt.includes('اسنایپر') || src.includes('SNIPER')) return 'LISTING_SNIPER';
  if (sk === 'my_custom_ai' || src.includes('MY_AI') || src.includes('CUSTOM_AI')) return 'MY_AI';
  if (sk === 'ai_autonomous_agent' || src.includes('AI')) return 'CENTRAL_AI';
  return sk || 'dollarino_v01';
}

function resolveSignalDisplayName(
  signalSource?: string | null,
  signalEngineLabel?: string | null,
  strategyKey?: string | null,
  fallbackNote?: string | null
): string {
  if (signalEngineLabel && signalEngineLabel.trim()) return signalEngineLabel.trim();
  const src = String(signalSource || '').trim().toUpperCase();
  if (src === 'TRADINGVIEW') return 'TradingView Webhook';
  if (src === 'TELEGRAM_CHANNEL') return 'کانال سیگنال تلگرام';
  if (src === 'AI_AUTONOMOUS' || src === 'CENTRAL_AI') return 'سیگنال هوشمند دُرّبین AI';
  if (src === 'MY_AI') return 'هوش مصنوعی شخصی کاربر';
  if (src === 'COPY_TRADE') return 'سیگنال کپی‌ترید';
  if (src === 'SNIPER' || src === 'LISTING_SNIPER') return 'رادار اسنایپر لیستینگ';
  if (src === 'TERMINAL' || src === 'MANUAL') return 'سفارش مستقیم پایانه';
  if (fallbackNote && fallbackNote.trim()) return fallbackNote.trim().slice(0, 48);
  return resolveEngineDisplayLabel(strategyKey || 'dollarino_v01');
}

function periodCutoffMs(period: ProfitCardPeriod, nowMs: number): number | null {
  switch (period) {
    case '24H':
      return nowMs - 24 * 3600_000;
    case '7D':
      return nowMs - 7 * 86400_000;
    case '30D':
      return nowMs - 30 * 86400_000;
    case '3M':
      return nowMs - 90 * 86400_000;
    case '6M':
      return nowMs - 180 * 86400_000;
    case '1Y':
      return nowMs - 365 * 86400_000;
    default:
      return null;
  }
}

function parseSqlIsoMs(raw: string | null | undefined): number {
  if (!raw) return 0;
  const norm = raw.includes('T') || raw.endsWith('Z') ? raw : raw.replace(' ', 'T') + 'Z';
  const t = Date.parse(norm);
  return Number.isFinite(t) ? t : 0;
}

export async function listUnifiedClosedTrades(
  db: D1Database,
  userId: string,
  opts: {
    mode?: 'LIVE' | 'PAPER' | 'ALL';
    tradeSource?: ProfitCardTradeSource;
    period?: ProfitCardPeriod;
    tradeId?: string;
    limit?: number;
  } = {}
): Promise<UnifiedSettledTrade[]> {
  const tradeSource = normalizeCardSource(opts.tradeSource);
  const period = normalizeCardPeriod(opts.period);
  const modeFilter = opts.mode === 'LIVE' || opts.mode === 'PAPER' ? opts.mode : 'ALL';
  const nowMs = Date.now();
  const cutoffMs = period === 'TRADE' ? null : periodCutoffMs(period, nowMs);
  const limit = Math.max(1, Math.min(200, Number(opts.limit || 120)));

  const includePerp = tradeSource === 'ALL' || tradeSource === 'PERP';
  const includeDex = tradeSource === 'ALL' || tradeSource === 'DEX';
  const includeCopy = tradeSource === 'ALL' || tradeSource === 'COPY';

  const [perpRows, dexRows, copyRows] = await Promise.all([
    includePerp
      ? db
          .prepare(
            `SELECT t.id, t.mode, t.symbol, t.direction, t.exchange_provider, t.strategy_key,
                    t.entry_price, t.exit_price, t.leverage, t.realized_pnl, t.margin_used, t.closed_at,
                    s.source AS signal_source, s.engine_label AS signal_engine
             FROM trades t
             LEFT JOIN signals s ON s.id = t.signal_id
             WHERE t.user_id = ? AND t.status = 'CLOSED'
             ORDER BY t.closed_at DESC LIMIT ?`
          )
          .bind(userId, limit)
          .all<{
            id: string;
            mode: 'LIVE' | 'PAPER';
            symbol: string;
            direction: string;
            exchange_provider: string;
            strategy_key: string | null;
            entry_price: string | number;
            exit_price: string | number | null;
            leverage: number;
            realized_pnl: string | number;
            margin_used: string | number;
            closed_at: string;
            signal_source: string | null;
            signal_engine: string | null;
          }>()
          .catch(() => ({ results: [] }))
      : Promise.resolve({ results: [] }),

    includeDex
      ? db
          .prepare(
            `SELECT id, chain_id, dex_id, token_address, token_symbol, direction,
                    amount_usd, entry_price_usd, exit_price_usd, realized_pnl_usd, realized_pnl_pct,
                    tx_hash, note, closed_at
             FROM dex_trades
             WHERE user_id = ? AND status = 'CLOSED'
             ORDER BY closed_at DESC LIMIT ?`
          )
          .bind(userId, limit)
          .all<{
            id: string;
            chain_id: string;
            dex_id: string | null;
            token_address: string;
            token_symbol: string;
            direction: string;
            amount_usd: number;
            entry_price_usd: number;
            exit_price_usd: number | null;
            realized_pnl_usd: number;
            realized_pnl_pct: number;
            tx_hash: string | null;
            note: string | null;
            closed_at: string;
          }>()
          .catch(() => ({ results: [] }))
      : Promise.resolve({ results: [] }),

    includeCopy
      ? db
          .prepare(
            `SELECT id, execution_mode, chain_id, dex_name, token_address, token_symbol, direction,
                    margin_usd, entry_price_usd, current_price_usd, pnl_usd, pnl_pct, trader_label, tx_hash, closed_at
             FROM copy_positions_v2
             WHERE user_id = ? AND status = 'CLOSED'
             ORDER BY closed_at DESC LIMIT ?`
          )
          .bind(userId, limit)
          .all<{
            id: string;
            execution_mode: string;
            chain_id: string;
            dex_name: string;
            token_address: string;
            token_symbol: string;
            direction: string;
            margin_usd: number;
            entry_price_usd: number;
            current_price_usd: number;
            pnl_usd: number;
            pnl_pct: number;
            trader_label: string;
            tx_hash: string | null;
            closed_at: string;
          }>()
          .catch(() => ({ results: [] }))
      : Promise.resolve({ results: [] }),
  ]);

  const out: UnifiedSettledTrade[] = [];

  for (const r of perpRows.results || []) {
    const mode: 'LIVE' | 'PAPER' = r.mode === 'PAPER' ? 'PAPER' : 'LIVE';
    const margin = Math.max(0, Number(r.margin_used || 0));
    const pnl = Number(r.realized_pnl || 0);
    const roi = margin > 0 ? (pnl / margin) * 100 : 0;
    const base = extractBaseCoin(r.symbol);
    const engineKey = classifyEngineKey(r.strategy_key, r.signal_source);
    const engineLabel = resolveEngineDisplayLabel(r.strategy_key || 'dollarino_v01');
    const signalName = resolveSignalDisplayName(r.signal_source, r.signal_engine, r.strategy_key);
    out.push({
      id: r.id,
      tradeSource: 'PERP',
      mode,
      symbol: r.symbol,
      baseSymbol: base,
      direction: (r.direction || 'LONG').toUpperCase(),
      leverage: Math.max(1, Number(r.leverage || 1)),
      entryPrice: Number(r.entry_price || 0),
      exitPrice: Number(r.exit_price || r.entry_price || 0),
      marginUsd: margin,
      realizedPnlUsd: pnl,
      roiPct: Number(roi.toFixed(2)),
      exchangeProvider: (r.exchange_provider || (mode === 'PAPER' ? 'PAPER' : 'TOOBIT')).toUpperCase(),
      engineKey,
      engineLabel,
      signalName,
      tokenImageUrl: buildTokenDisplayIconUrl(base),
      closedAt: r.closed_at,
    });
  }

  for (const d of dexRows.results || []) {
    const isPaper =
      Boolean(d.tx_hash && d.tx_hash.startsWith('PAPER_')) ||
      /PAPER|DEMO|دمو|شبیه‌ساز/i.test(String(d.note || ''));
    const mode: 'LIVE' | 'PAPER' = isPaper ? 'PAPER' : 'LIVE';
    const margin = Math.max(0, Number(d.amount_usd || 0));
    const pnl = Number(d.realized_pnl_usd || 0);
    const roi = Number(d.realized_pnl_pct || (margin > 0 ? (pnl / margin) * 100 : 0));
    const base = extractBaseCoin(d.token_symbol);
    const isSniper = /sniper|اسنایپر|لیستینگ|boom/i.test(String(d.note || ''));
    const engineKey = isSniper ? 'LISTING_SNIPER' : 'DEX_RADAR';
    const engineLabel = isSniper ? 'اسنایپر لیستینگ و میم‌کوین' : 'رادار آن‌چین DEX & تراست‌ولت';
    const signalName = d.note ? String(d.note).replace(/^(PAPER|LIVE)\s*[-:]\s*/i, '').slice(0, 48) : `DexScreener · ${(d.dex_id || d.chain_id).toUpperCase()}`;
    out.push({
      id: d.id,
      tradeSource: 'DEX',
      mode,
      symbol: `${base}/${(d.chain_id || 'DEX').toUpperCase()}`,
      baseSymbol: base,
      direction: (d.direction || 'BUY').toUpperCase(),
      leverage: 1,
      entryPrice: Number(d.entry_price_usd || 0),
      exitPrice: Number(d.exit_price_usd || d.entry_price_usd || 0),
      marginUsd: margin,
      realizedPnlUsd: pnl,
      roiPct: Number(roi.toFixed(2)),
      exchangeProvider: `${(d.chain_id || 'DEX').toUpperCase()}${d.dex_id ? ` · ${d.dex_id.toUpperCase()}` : ''}`,
      engineKey,
      engineLabel,
      signalName,
      tokenAddress: d.token_address,
      chainId: d.chain_id,
      tokenImageUrl: buildTokenDisplayIconUrl(base, d.chain_id, d.token_address),
      closedAt: d.closed_at,
    });
  }

  for (const cp of copyRows.results || []) {
    const isPaper =
      cp.execution_mode === 'PAPER_SIM' ||
      Boolean(cp.tx_hash && cp.tx_hash.startsWith('PAPER_'));
    const mode: 'LIVE' | 'PAPER' = isPaper ? 'PAPER' : 'LIVE';
    const margin = Math.max(0, Number(cp.margin_usd || 0));
    const pnl = Number(cp.pnl_usd || 0);
    const roi = Number(cp.pnl_pct || (margin > 0 ? (pnl / margin) * 100 : 0));
    const base = extractBaseCoin(cp.token_symbol);
    out.push({
      id: cp.id,
      tradeSource: 'COPY',
      mode,
      symbol: `${base}/${(cp.chain_id || 'DEX').toUpperCase()}`,
      baseSymbol: base,
      direction: (cp.direction || 'BUY').toUpperCase(),
      leverage: 1,
      entryPrice: Number(cp.entry_price_usd || 0),
      exitPrice: Number(cp.current_price_usd || cp.entry_price_usd || 0),
      marginUsd: margin,
      realizedPnlUsd: pnl,
      roiPct: Number(roi.toFixed(2)),
      exchangeProvider: `${(cp.chain_id || 'SOL').toUpperCase()} · ${(cp.dex_name || 'DEX').toUpperCase()}`,
      engineKey: 'COPY_TRADE',
      engineLabel: 'کپی‌ترید هوشمند V2',
      signalName: `کپی از ${cp.trader_label}`,
      tokenAddress: cp.token_address,
      chainId: cp.chain_id,
      tokenImageUrl: buildTokenDisplayIconUrl(base, cp.chain_id, cp.token_address),
      closedAt: cp.closed_at,
    });
  }

  const filtered = out.filter((item) => {
    if (modeFilter !== 'ALL' && item.mode !== modeFilter) return false;
    if (opts.tradeId && period === 'TRADE') return item.id === opts.tradeId;
    if (cutoffMs !== null) {
      const ts = parseSqlIsoMs(item.closedAt);
      if (ts > 0 && ts < cutoffMs) return false;
    }
    return true;
  });

  filtered.sort((a, b) => parseSqlIsoMs(a.closedAt) - parseSqlIsoMs(b.closedAt));
  return filtered;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

const TOKEN_DATA_URI_CACHE = new Map<string, { uri: string | null; exp: number }>();

export async function resolveTokenLogoPngDataUri(opts: {
  baseSymbol?: string;
  chainId?: string;
  tokenAddress?: string;
  tokenImageUrl?: string;
}): Promise<string | null> {
  const base = extractBaseCoin(opts.baseSymbol || '');
  if (!base) return null;
  const key = `${base}:${opts.chainId || ''}:${opts.tokenAddress || ''}:${opts.tokenImageUrl || ''}`;
  const cached = TOKEN_DATA_URI_CACHE.get(key);
  if (cached && cached.exp > Date.now()) return cached.uri;

  const candidates: string[] = [];
  if (opts.tokenImageUrl && /^https:\/\/.+\.(png|jpg|jpeg)(\?.*)?$/i.test(opts.tokenImageUrl)) {
    candidates.push(opts.tokenImageUrl);
  }
  if (opts.chainId && opts.tokenAddress && !opts.tokenAddress.startsWith('0x0000')) {
    candidates.push(
      `https://dd.dexscreener.com/ds-data/tokens/${encodeURIComponent(opts.chainId.toLowerCase())}/${encodeURIComponent(opts.tokenAddress)}.png`
    );
  }
  const lower = base.toLowerCase();
  candidates.push(
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${encodeURIComponent(lower)}.png`,
    `https://assets.coincap.io/assets/icons/${encodeURIComponent(lower)}@2x.png`
  );

  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1800) });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('image/png') && !ct.includes('image/jpeg') && !ct.includes('image/jpg')) continue;
      const ab = await res.arrayBuffer();
      if (ab.byteLength < 64 || ab.byteLength > 512_000) continue;
      const mime = ct.includes('jpeg') || ct.includes('jpg') ? 'image/jpeg' : 'image/png';
      const uri = `data:${mime};base64,${arrayBufferToBase64(ab)}`;
      TOKEN_DATA_URI_CACHE.set(key, { uri, exp: Date.now() + 60 * 60_000 });
      return uri;
    } catch {
      /* try next candidate */
    }
  }

  TOKEN_DATA_URI_CACHE.set(key, { uri: null, exp: Date.now() + 10 * 60_000 });
  return null;
}
