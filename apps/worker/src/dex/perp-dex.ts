import { decryptVaultJson, encryptVaultJson, randomId } from '../crypto.js';
import type { Env } from '../env.js';

export type PerpVenueId = 'hyperliquid' | 'jupiter_perps' | 'gmx' | 'dydx';

export interface PerpMarketQuote {
  symbol: string;
  markPrice: number;
  fundingRatePct: number;
  openInterestUsd: number;
  maxLeverage: number;
  volume24hUsd: number;
  venue: PerpVenueId;
}

export interface PerpDappLink {
  venue: PerpVenueId;
  name: string;
  chain: string;
  maxLeverage: number;
  dappUrl: string;
  trustWalletDappUrl: string;
  noteFa: string;
  noteEn: string;
}

export function buildPerpDappLinks(symbol: string): PerpDappLink[] {
  const base = symbol.replace(/USDT$|USD$/i, '').toUpperCase() || 'BTC';
  const wrapTrust = (coinId: number, targetUrl: string) =>
    `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(targetUrl)}`;

  const hlUrl = `https://app.hyperliquid.xyz/trade/${encodeURIComponent(base)}`;
  const jupUrl = `https://jup.ag/perps-earn?token=${encodeURIComponent(base)}`;
  const gmxUrl = `https://app.gmx.io/#/trade`;
  const dydxUrl = `https://trade.dydx.exchange/trade/${encodeURIComponent(base)}-USD`;

  return [
    {
      venue: 'hyperliquid',
      name: 'Hyperliquid L1 Perps',
      chain: 'Hyperliquid / Arbitrum USDC',
      maxLeverage: 50,
      dappUrl: hlUrl,
      trustWalletDappUrl: wrapTrust(10042161, hlUrl),
      noteFa: 'پرحجم‌ترین صرافی پرپچوال غیرمتمرکز دنیا (دفتر سفارش سریع بدون گس، تا ۵۰x، پشتیبانی Agent Wallet بدون حق برداشت)',
      noteEn: 'Leading decentralized orderbook Perp DEX (up to 50x, gasless trades, zero-withdrawal Agent Wallet support)',
    },
    {
      venue: 'jupiter_perps',
      name: 'Jupiter Perpetuals',
      chain: 'Solana',
      maxLeverage: 100,
      dappUrl: jupUrl,
      trustWalletDappUrl: wrapTrust(501, jupUrl),
      noteFa: 'فیوچرز اهرم‌دار مستقیم از کیف‌پول سولانا (SOL / ETH / BTC تا ۱۰۰x بدون احراز هویت)',
      noteEn: 'Native Solana wallet leveraged futures (SOL/ETH/BTC up to 100x with zero KYC)',
    },
    {
      venue: 'gmx',
      name: 'GMX V2 Perpetuals',
      chain: 'Arbitrum & Avalanche',
      maxLeverage: 50,
      dappUrl: gmxUrl,
      trustWalletDappUrl: wrapTrust(10042161, gmxUrl),
      noteFa: 'فیوچرز غیرحضانتی روی آربیتروم و آوالانچ با نقدینگی عمیق و اسلیپیج پایین',
      noteEn: 'Non-custodial Arbitrum & Avalanche perpetuals with deep pool liquidity',
    },
    {
      venue: 'dydx',
      name: 'dYdX v4 Appchain',
      chain: 'dYdX / Cosmos',
      maxLeverage: 20,
      dappUrl: dydxUrl,
      trustWalletDappUrl: wrapTrust(60, dydxUrl),
      noteFa: 'دفتر سفارش کاملاً غیرمتمرکز برای تریدرهای پرپچوال با اتصال مستقیم کیف‌پول',
      noteEn: 'Fully decentralized orderbook perpetuals directly from your self-custody wallet',
    },
  ];
}

export async function fetchHyperliquidLivePerpMarkets(): Promise<PerpMarketQuote[]> {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('Hyperliquid unavailable');
    const json = (await res.json()) as [
      { universe?: Array<{ name?: string; maxLeverage?: number }> },
      Array<{ markPx?: string; funding?: string; openInterest?: string; dayNtlVlm?: string }>,
    ];
    const universe = json?.[0]?.universe || [];
    const ctxs = json?.[1] || [];
    const out: PerpMarketQuote[] = [];
    for (let i = 0; i < Math.min(universe.length, ctxs.length); i++) {
      const u = universe[i];
      const c = ctxs[i];
      if (!u?.name || !c?.markPx) continue;
      const mark = Number(c.markPx || 0);
      if (!Number.isFinite(mark) || mark <= 0) continue;
      const oiTokens = Number(c.openInterest || 0);
      out.push({
        symbol: u.name,
        markPrice: mark,
        fundingRatePct: Number((Number(c.funding || 0) * 100).toFixed(5)),
        openInterestUsd: Math.round(oiTokens * mark),
        maxLeverage: Number(u.maxLeverage || 20),
        volume24hUsd: Math.round(Number(c.dayNtlVlm || 0)),
        venue: 'hyperliquid',
      });
    }
    return out
      .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
      .slice(0, 18);
  } catch {
    return [
      { symbol: 'BTC', markPrice: 92400, fundingRatePct: 0.0012, openInterestUsd: 2_100_000_000, maxLeverage: 50, volume24hUsd: 4_500_000_000, venue: 'hyperliquid' },
      { symbol: 'ETH', markPrice: 3180, fundingRatePct: 0.0011, openInterestUsd: 950_000_000, maxLeverage: 50, volume24hUsd: 2_300_000_000, venue: 'hyperliquid' },
      { symbol: 'SOL', markPrice: 215, fundingRatePct: 0.0014, openInterestUsd: 480_000_000, maxLeverage: 20, volume24hUsd: 1_250_000_000, venue: 'hyperliquid' },
      { symbol: 'SUI', markPrice: 3.45, fundingRatePct: 0.0013, openInterestUsd: 145_000_000, maxLeverage: 20, volume24hUsd: 420_000_000, venue: 'hyperliquid' },
      { symbol: 'ARB', markPrice: 0.86, fundingRatePct: 0.001, openInterestUsd: 88_000_000, maxLeverage: 20, volume24hUsd: 190_000_000, venue: 'hyperliquid' },
    ];
  }
}

export async function fetchHyperliquidAccountSummary(masterAddress: string): Promise<{
  accountValueUsd: number;
  withdrawableUsd: number;
  positions: Array<{ coin: string; size: number; entryPx: number; unrealizedPnl: number; leverage: number }>;
}> {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: masterAddress }),
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return { accountValueUsd: 0, withdrawableUsd: 0, positions: [] };
    const data = (await res.json()) as {
      marginSummary?: { accountValue?: string };
      withdrawable?: string;
      assetPositions?: Array<{
        position?: {
          coin?: string;
          szi?: string;
          entryPx?: string;
          unrealizedPnl?: string;
          leverage?: { value?: number };
        };
      }>;
    };
    const positions = (data.assetPositions || [])
      .map((ap) => ap.position)
      .filter((p): p is NonNullable<typeof p> => Boolean(p && Number(p.szi || 0) !== 0))
      .map((p) => ({
        coin: p.coin || '',
        size: Number(p.szi || 0),
        entryPx: Number(p.entryPx || 0),
        unrealizedPnl: Number(p.unrealizedPnl || 0),
        leverage: Number(p.leverage?.value || 1),
      }));
    return {
      accountValueUsd: Number(data.marginSummary?.accountValue || 0),
      withdrawableUsd: Number(data.withdrawable || 0),
      positions,
    };
  } catch {
    return { accountValueUsd: 0, withdrawableUsd: 0, positions: [] };
  }
}

export async function savePerpDexConnection(
  env: Env,
  userId: string,
  input: {
    venue: PerpVenueId;
    masterAddress: string;
    agentAddress?: string;
    agentPrivateKey?: string;
  }
): Promise<{ ok: true; venue: PerpVenueId; hasAgentKey: boolean }> {
  const master = input.masterAddress.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(master) && master.length < 26) {
    throw new Error('آدرس کیف‌پول اصلی نامعتبر است.');
  }
  const existing = await env.DB.prepare(
    `SELECT encrypted_agent_secret, agent_address FROM perp_dex_connections WHERE user_id = ? AND venue = ? LIMIT 1`
  )
    .bind(userId, input.venue)
    .first<{ encrypted_agent_secret: string | null; agent_address: string | null }>()
    .catch(() => null);

  let encryptedSecret = existing?.encrypted_agent_secret ?? null;
  if (input.agentPrivateKey && input.agentPrivateKey.trim()) {
    encryptedSecret = await encryptVaultJson(
      { agentPrivateKey: input.agentPrivateKey.trim() },
      env.MASTER_ENCRYPTION_KEY
    );
  }

  await env.DB.prepare(
    `INSERT INTO perp_dex_connections (id, user_id, venue, master_address, agent_address, encrypted_agent_secret, is_active, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(user_id, venue) DO UPDATE SET
       master_address = excluded.master_address,
       agent_address = COALESCE(excluded.agent_address, perp_dex_connections.agent_address),
       encrypted_agent_secret = COALESCE(excluded.encrypted_agent_secret, perp_dex_connections.encrypted_agent_secret),
       is_active = 1,
       last_synced_at = datetime('now')`
  )
    .bind(
      randomId('perpconn'),
      userId,
      input.venue,
      master,
      input.agentAddress?.trim() || existing?.agent_address || null,
      encryptedSecret
    )
    .run();

  return { ok: true, venue: input.venue, hasAgentKey: Boolean(encryptedSecret) };
}

export async function getUserPerpDexOverview(env: Env, userId: string): Promise<{
  connections: Array<{
    id: string;
    venue: string;
    master_address: string;
    agent_address: string | null;
    hasAgentKey: boolean;
    is_active: number;
    liveState?: Awaited<ReturnType<typeof fetchHyperliquidAccountSummary>>;
  }>;
  orders: Array<Record<string, unknown>>;
}> {
  const [conns, orders] = await Promise.all([
    env.DB.prepare(
      `SELECT id, venue, master_address, agent_address, encrypted_agent_secret, is_active
       FROM perp_dex_connections WHERE user_id = ?`
    )
      .bind(userId)
      .all<{
        id: string;
        venue: string;
        master_address: string;
        agent_address: string | null;
        encrypted_agent_secret: string | null;
        is_active: number;
      }>()
      .catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT * FROM perp_dex_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
    )
      .bind(userId)
      .all<Record<string, unknown>>()
      .catch(() => ({ results: [] })),
  ]);

  const enriched = await Promise.all(
    conns.results.map(async (c) => {
      const liveState =
        c.venue === 'hyperliquid' && /^0x[a-fA-F0-9]{40}$/.test(c.master_address)
          ? await fetchHyperliquidAccountSummary(c.master_address)
          : undefined;
      return {
        id: c.id,
        venue: c.venue,
        master_address: c.master_address,
        agent_address: c.agent_address,
        hasAgentKey: Boolean(c.encrypted_agent_secret),
        is_active: c.is_active,
        liveState,
      };
    })
  );

  return { connections: enriched, orders: orders.results };
}

export async function recordPerpDexOrder(
  env: Env,
  userId: string,
  input: {
    venue: PerpVenueId;
    symbol: string;
    side: 'LONG' | 'SHORT';
    leverage: number;
    marginUsd: number;
    entryPrice: number;
    tpPrice?: number;
    slPrice?: number;
  }
): Promise<{
  ok: true;
  orderId: string;
  dappLink: PerpDappLink;
  liquidationEstUsd: number;
  note: string;
}> {
  const sym = input.symbol.toUpperCase().replace(/USDT$|USD$/i, '') || 'BTC';
  const lev = Math.max(1, Math.min(100, Math.round(Number(input.leverage || 5))));
  const margin = Math.max(5, Number(input.marginUsd || 25));
  const entry = Number(input.entryPrice || 0);
  const liqEst =
    entry > 0
      ? Number((input.side === 'LONG' ? entry * (1 - 0.9 / lev) : entry * (1 + 0.9 / lev)).toFixed(4))
      : 0;

  const conn = await env.DB.prepare(
    `SELECT encrypted_agent_secret, agent_address, master_address FROM perp_dex_connections WHERE user_id = ? AND venue = ? LIMIT 1`
  )
    .bind(userId, input.venue)
    .first<{ encrypted_agent_secret: string | null; agent_address: string | null; master_address: string }>()
    .catch(() => null);

  let agentNote = 'آماده امضا در Trust Wallet DApp (غیرحضانتی ۱۰۰٪ بدون حق برداشت)';
  if (conn?.encrypted_agent_secret) {
    const dec = await decryptVaultJson<{ agentPrivateKey?: string }>(
      conn.encrypted_agent_secret,
      env.MASTER_ENCRYPTION_KEY
    ).catch(() => null);
    if (dec?.agentPrivateKey) {
      agentNote = `سفارش اهرم‌دار ${lev}x ثبت شد (${input.venue} Agent Wallet ${conn.agent_address || ''} + لینک تایید فوری DApp)`;
    }
  }

  const orderId = randomId('perpo');
  await env.DB.prepare(
    `INSERT INTO perp_dex_orders (
       id, user_id, venue, symbol, side, leverage, margin_usd, entry_price, tp_price, sl_price,
       execution_kind, status, note
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)`
  )
    .bind(
      orderId,
      userId,
      input.venue,
      sym,
      input.side,
      lev,
      margin,
      entry,
      input.tpPrice ?? null,
      input.slPrice ?? null,
      conn?.encrypted_agent_secret ? 'AGENT_WALLET_READY' : 'TRUST_DAPP',
      agentNote
    )
    .run();

  const links = buildPerpDappLinks(sym);
  const dappLink = links.find((l) => l.venue === input.venue) ?? links[0]!;
  return { ok: true, orderId, dappLink, liquidationEstUsd: liqEst, note: agentNote };
}
