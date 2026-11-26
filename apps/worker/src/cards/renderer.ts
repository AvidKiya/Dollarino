import { initWasm, Resvg } from '@resvg/resvg-wasm';
import QRCode from 'qrcode';
import { DOLLARINO_LOGO_PNG_B64, VAZIRMATN_BOLD_TTF_B64 } from '../assets/card-assets.js';

let wasmReadyPromise: Promise<boolean> | null = null;
let cachedFontBytes: Uint8Array | null = null;

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function getFontBytes(): Uint8Array {
  if (!cachedFontBytes) {
    cachedFontBytes = b64ToUint8(VAZIRMATN_BOLD_TTF_B64);
  }
  return cachedFontBytes;
}

export async function ensureResvgReady(): Promise<boolean> {
  if (wasmReadyPromise) return wasmReadyPromise;
  wasmReadyPromise = (async () => {
    try {
      const mod = await import('@resvg/resvg-wasm/index_bg.wasm');
      await initWasm(mod.default as unknown as WebAssembly.Module);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already initialized/i.test(msg)) return true;
      try {
        const fsMod = await import('node:fs');
        const modCreate = await import('node:module');
        const req = modCreate.createRequire(import.meta.url);
        const wasmPath = req.resolve('@resvg/resvg-wasm/index_bg.wasm');
        const buf = fsMod.readFileSync(wasmPath);
        await initWasm(buf);
        return true;
      } catch (nodeErr) {
        const nMsg = nodeErr instanceof Error ? nodeErr.message : String(nodeErr);
        if (/already initialized/i.test(nMsg)) return true;
        return false;
      }
    }
  })();
  return wasmReadyPromise;
}

function escXml(v: string): string {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanSvgText(v: string, maxLen = 42): string {
  const cleaned = String(v || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sliced = cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
  const bidiFixed = /^[\u0660-\u0669\u06F0-\u06F9]/.test(sliced) && /[\u0600-\u06FF]/.test(sliced) ? `\u200F${sliced}` : sliced;
  return escXml(bidiFixed);
}

export function fmtSignedUsd(val: number): string {
  const n = Number.isFinite(val) ? val : 0;
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n >= 0 ? '+' : '-'}$${abs}`;
}

export function fmtSignedPct(val: number): string {
  const n = Number.isFinite(val) ? val : 0;
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`;
}

export function fmtPriceUsd(val: number | null | undefined): string {
  const n = Number(val || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toPrecision(4)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export function periodLabelFa(period: string): string {
  switch (String(period || '').toUpperCase()) {
    case '24H':
      return 'گزارش ۲۴ ساعته';
    case '7D':
      return 'گزارش هفتگی';
    case '30D':
      return 'گزارش ماهانه';
    case '3M':
      return 'گزارش ۳ ماهه';
    case '6M':
      return 'گزارش ۶ ماهه';
    case '1Y':
      return 'گزارش سالانه';
    case 'TRADE':
      return 'کارت تک‌معامله';
    default:
      return 'گزارش کل دوره';
  }
}

export function tradeSourceLabelFa(source?: string): string {
  switch (String(source || 'ALL').toUpperCase()) {
    case 'PERP':
      return 'فیوچرز و اسپات';
    case 'DEX':
      return 'تراست‌ولت و دکس';
    case 'COPY':
      return 'کپی‌ترید هوشمند';
    default:
      return 'همه معاملات';
  }
}

interface ThemePalette {
  bg1: string;
  bg2: string;
  bg3: string;
  border: string;
  accent: string;
  panelBg: string;
  panelBorder: string;
  muted: string;
}

const CARD_PALETTES: Record<string, ThemePalette> = {
  dark: {
    bg1: '#050e28',
    bg2: '#0b1e4d',
    bg3: '#040917',
    border: 'rgba(56, 225, 255, 0.28)',
    accent: '#38e1ff',
    panelBg: 'rgba(255, 255, 255, 0.055)',
    panelBorder: 'rgba(255, 255, 255, 0.14)',
    muted: '#94a3b8',
  },
  gold: {
    bg1: '#231906',
    bg2: '#151006',
    bg3: '#090805',
    border: 'rgba(240, 185, 11, 0.35)',
    accent: '#f0b90b',
    panelBg: 'rgba(240, 185, 11, 0.06)',
    panelBorder: 'rgba(240, 185, 11, 0.22)',
    muted: '#d6c394',
  },
  emerald: {
    bg1: '#04251b',
    bg2: '#073124',
    bg3: '#03120d',
    border: 'rgba(16, 217, 163, 0.35)',
    accent: '#10d9a3',
    panelBg: 'rgba(16, 217, 163, 0.06)',
    panelBorder: 'rgba(16, 217, 163, 0.22)',
    muted: '#99d5c4',
  },
  violet: {
    bg1: '#1a0c38',
    bg2: '#121338',
    bg3: '#060718',
    border: 'rgba(168, 85, 247, 0.36)',
    accent: '#c084fc',
    panelBg: 'rgba(168, 85, 247, 0.07)',
    panelBorder: 'rgba(192, 132, 252, 0.22)',
    muted: '#bfb5db',
  },
};

const COIN_COLORS: Record<string, [string, string]> = {
  BTC: ['#f7931a', '#b45309'],
  ETH: ['#627eea', '#3730a3'],
  SOL: ['#9945ff', '#14f195'],
  BNB: ['#f3ba2f', '#a16207'],
  TON: ['#0098ea', '#0369a1'],
  TRX: ['#ef0027', '#991b1b'],
  XRP: ['#0284c7', '#1e293b'],
  DOGE: ['#c2a633', '#854d0e'],
  PEPE: ['#22c55e', '#15803d'],
  BONK: ['#f97316', '#c2410c'],
  SUI: ['#4da2ff', '#1d4ed8'],
  AVAX: ['#e84142', '#991b1b'],
  ADA: ['#0033ad', '#1e3a8a'],
  LINK: ['#375bd2', '#1e40af'],
  ARB: ['#28a0f0', '#1e3a8a'],
  OP: ['#ff0420', '#991b1b'],
  USDT: ['#26a17b', '#065f46'],
};

function renderSectionIcon(
  kind: 'engine' | 'signal' | 'winrate' | 'trades' | 'pf' | 'venue' | 'clock' | 'entry' | 'exit',
  x: number,
  y: number,
  size: number,
  color: string
): string {
  const s = size / 24;
  let inner = '';
  switch (kind) {
    case 'engine':
      inner = `<rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="${color}" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="${color}"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
      break;
    case 'signal':
      inner = `<circle cx="12" cy="12" r="2.2" fill="${color}"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
      break;
    case 'winrate':
      inner = `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="${color}" stroke-width="2"/><circle cx="12" cy="12" r="1.8" fill="${color}"/>`;
      break;
    case 'trades':
      inner = `<path d="M12 3l9 4.5-9 4.5-9-4.5z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/><path d="M3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case 'pf':
      inner = `<path d="M3 17l6-6 4 4 8-8" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 7h5v5" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case 'venue':
      inner = `<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
      break;
    case 'entry':
      inner = `<circle cx="12" cy="12" r="8.5" fill="none" stroke="${color}" stroke-width="2"/><path d="M12 8v8M9 13l3 3 3-3" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case 'exit':
      inner = `<circle cx="12" cy="12" r="8.5" fill="none" stroke="${color}" stroke-width="2"/><path d="M12 16V8M9 11l3-3 3 3" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    default:
      inner = `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
  }
  return `<g transform="translate(${x}, ${y}) scale(${s.toFixed(3)})">${inner}</g>`;
}

function renderCoinBadgeSvg(
  symbol: string,
  cx: number,
  cy: number,
  radius: number,
  tokenLogoDataUri?: string | null,
  clipId = 'coinClip'
): string {
  const ticker = String(symbol || 'BTC').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'BTC';
  const [c1, c2] = COIN_COLORS[ticker] ?? ['#1652f0', '#0ea5e9'];
  const fontSize = ticker.length >= 4 ? Math.round(radius * 0.5) : Math.round(radius * 0.64);
  const gradId = `${clipId}_g`;

  if (tokenLogoDataUri && tokenLogoDataUri.startsWith('data:image/')) {
    const d = radius * 2;
    return `
      <defs>
        <clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${radius - 4}"/></clipPath>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${radius + 3}" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.3)" stroke-width="2.5"/>
      <circle cx="${cx}" cy="${cy}" r="${radius - 3}" fill="#0b152c"/>
      <image href="${tokenLogoDataUri}" x="${cx - radius + 4}" y="${cy - radius + 4}" width="${d - 8}" height="${d - 8}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>
    `;
  }

  return `
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${radius + 3}" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.28)" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${cy}" r="${radius - 2}" fill="url(#${gradId})"/>
    <circle cx="${cx}" cy="${cy}" r="${radius - 7}" fill="none" stroke="rgba(255,255,255,0.26)" stroke-width="1.5"/>
    <text x="${cx}" y="${cy + Math.round(fontSize * 0.34)}" text-anchor="middle" font-family="Vazirmatn" font-size="${fontSize}" fill="#ffffff">${escXml(ticker)}</text>
  `;
}

function renderVectorQrGroup(url: string, x: number, y: number, boxSize: number): string {
  try {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const pad = 10;
    const cell = (boxSize - pad * 2) / count;
    let d = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.modules.get(r, c)) {
          const px = (x + pad + c * cell).toFixed(2);
          const py = (y + pad + r * cell).toFixed(2);
          const w = (cell + 0.15).toFixed(2);
          d += `M${px},${py}h${w}v${w}h-${w}z`;
        }
      }
    }
    return `
      <rect x="${x}" y="${y}" width="${boxSize}" height="${boxSize}" rx="18" fill="#ffffff"/>
      <path d="${d}" fill="#071127"/>
    `;
  } catch {
    return `<rect x="${x}" y="${y}" width="${boxSize}" height="${boxSize}" rx="18" fill="#ffffff"/>`;
  }
}

export interface ProfitCardRenderInput {
  cardId: string;
  displayName: string;
  mode: 'LIVE' | 'PAPER';
  period: string;
  tradeSource?: 'ALL' | 'PERP' | 'DEX' | 'COPY';
  tradesCount: number;
  winRate: number;
  netPnlUsd: number;
  roiPct: number;
  profitFactor: number;
  exchangeProvider: string;
  strategyName: string;
  engineKey?: string;
  cardStyle?: string;
  symbol?: string;
  baseSymbol?: string;
  direction?: string;
  leverage?: number;
  entryPrice?: number | null;
  exitPrice?: number | null;
  signalName?: string;
  bestSymbol?: string;
  bestRoiPct?: number;
  tokenLogoDataUri?: string | null;
  startDate?: string;
  endDate?: string;
  issuedAt: string;
  layout?: 'horizontal' | 'vertical';
}

export function buildProfitCardSvg(input: ProfitCardRenderInput): string {
  const layout = input.layout === 'vertical' ? 'vertical' : 'horizontal';
  const W = layout === 'vertical' ? 1080 : 1200;
  const H = layout === 'vertical' ? 1920 : 675; // True 9:16 Story & 16:9 Landscape
  const palette = CARD_PALETTES[String(input.cardStyle || 'dark')] ?? CARD_PALETTES.dark!;
  const isProfit = input.netPnlUsd >= 0;
  const isLive = input.mode === 'LIVE';
  const isSingleTrade = String(input.period).toUpperCase() === 'TRADE';

  const pnlColor = isProfit ? '#10d9a3' : '#fb7185';
  const pnlSoft = isProfit ? 'rgba(16, 217, 163, 0.12)' : 'rgba(251, 113, 133, 0.12)';
  const stampColor = isLive ? '#10d9a3' : '#f59e0b';
  const stampTitleFa = isLive ? 'حساب واقعی تاییدشده' : 'حساب دمو آزمایشی';
  const stampSubEn = isLive ? 'LIVE REAL VERIFIED' : 'DEMO / PAPER SIMULATION';

  const roiStr = fmtSignedPct(input.roiPct);
  const pnlStr = `${fmtSignedUsd(input.netPnlUsd)} USDT`;
  const pfStr = input.profitFactor >= 99 ? 'MAX' : Number(input.profitFactor || 0).toFixed(2);
  const wrStr = `${Number(input.winRate || 0).toFixed(1)}%`;
  const dateStr = (input.issuedAt || '').slice(0, 10) || 'LIVE';
  const verifyUrl = `https://dollarino.pages.dev/verify-card/${encodeURIComponent(input.cardId)}`;

  const mainTicker = input.baseSymbol || input.bestSymbol || (input.symbol ? input.symbol.split(/[/:_-]/)[0] : '') || 'BTC';
  const symbolFull = input.symbol || (input.bestSymbol ? `${input.bestSymbol}/USDT` : 'ALL MARKETS');
  const periodHeroTitle = `TOP ASSET · ${mainTicker}${typeof input.bestRoiPct === 'number' ? ` (${fmtSignedPct(input.bestRoiPct)})` : ''}`;
  const dirUpper = String(input.direction || 'LONG').toUpperCase();
  const isShortDir = dirUpper === 'SHORT' || dirUpper === 'SELL';
  const dirColor = isShortDir ? '#fb7185' : '#10d9a3';
  const levBadge = Number(input.leverage || 1) > 1 ? `${dirUpper} ${input.leverage}X` : dirUpper;
  const entryStr = fmtPriceUsd(input.entryPrice);
  const exitStr = fmtPriceUsd(input.exitPrice);
  const engineTitle = cleanSvgText(input.strategyName || 'Dollarino AI', 32);
  const signalTitle = cleanSvgText(
    input.signalName || (isSingleTrade ? input.strategyName : tradeSourceLabelFa(input.tradeSource)) || 'Dollarino Signal',
    34
  );
  const venueTitle = cleanSvgText(String(input.exchangeProvider || 'TRUST WALLET').toUpperCase(), 34);
  const traderTitle = cleanSvgText(input.displayName || 'Trader', 28);

  const logoSize = layout === 'vertical' ? 600 : 420;
  const logoX = Math.round((W - logoSize) / 2);
  const logoY = Math.round((H - logoSize) / 2);

  // Subtle decorative equity curve
  const wavePath = isProfit
    ? layout === 'vertical'
      ? 'M 90 730 C 260 720, 340 650, 480 620 C 610 595, 720 490, 990 420'
      : 'M 64 335 C 240 325, 340 275, 490 255 C 630 235, 760 175, 1136 135'
    : layout === 'vertical'
      ? 'M 90 470 C 260 510, 420 580, 620 630 C 780 670, 900 710, 990 735'
      : 'M 64 175 C 260 205, 440 265, 650 300 C 820 325, 970 350, 1136 365';

  if (layout === 'vertical') {
    // TRUE 9:16 INSTAGRAM / TELEGRAM STORY (1080 x 1920)
    const qrBox = renderVectorQrGroup(verifyUrl, W - 244, H - 252, 176);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgV" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bg1}"/>
      <stop offset="55%" stop-color="${palette.bg2}"/>
      <stop offset="100%" stop-color="${palette.bg3}"/>
    </linearGradient>
    <radialGradient id="glowV1" cx="0.18" cy="0.24" r="0.65">
      <stop offset="0%" stop-color="${pnlColor}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${palette.bg1}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowV2" cx="0.85" cy="0.78" r="0.6">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${palette.bg3}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bgV)"/>
  <rect width="${W}" height="${H}" fill="url(#glowV1)"/>
  <rect width="${W}" height="${H}" fill="url(#glowV2)"/>

  <!-- Subtle outer frame -->
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="46" fill="none" stroke="${palette.border}" stroke-width="3"/>

  <!-- Watermark Dollarino Logo -->
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" opacity="0.085"/>

  <!-- Top Header -->
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="68" y="68" width="84" height="84"/>
  <text x="170" y="106" font-family="Vazirmatn" font-size="34" fill="#ffffff">کارت سود دلارینو</text>
  <text x="170" y="144" font-family="Vazirmatn" font-size="22" fill="${palette.accent}">DOLLARINO VERIFIED CARD</text>

  <!-- Account Mode Pill -->
  <rect x="${W - 368}" y="76" width="300" height="64" rx="32" fill="rgba(0,0,0,0.34)" stroke="${stampColor}" stroke-width="2.5"/>
  <circle cx="${W - 336}" cy="108" r="8" fill="${stampColor}"/>
  <text x="${W - 200}" y="117" text-anchor="middle" font-family="Vazirmatn" font-size="24" fill="${stampColor}">${stampTitleFa}</text>

  <!-- Sub-Header Band: Trader & Period / Source -->
  <rect x="68" y="190" width="${W - 136}" height="106" rx="26" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  <text x="98" y="236" font-family="Vazirmatn" font-size="24" fill="${palette.muted}">TRADER</text>
  <text x="98" y="274" font-family="Vazirmatn" font-size="30" fill="#ffffff">${traderTitle}</text>

  <text x="${W - 98}" y="236" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="${palette.accent}">${escXml(periodLabelFa(input.period))}</text>
  <text x="${W - 98}" y="274" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="#e2e8f0">${escXml(tradeSourceLabelFa(input.tradeSource))}</text>

  ${
    isSingleTrade
      ? `
  <!-- Single Trade Token Header -->
  <rect x="68" y="324" width="${W - 136}" height="164" rx="32" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderCoinBadgeSvg(mainTicker, 162, 406, 56, input.tokenLogoDataUri, 'coinV')}
  <text x="242" y="395" font-family="Vazirmatn" font-size="44" fill="#ffffff">${cleanSvgText(symbolFull, 18)}</text>
  <text x="242" y="442" font-family="Vazirmatn" font-size="24" fill="${palette.muted}">${venueTitle}</text>
  <rect x="${W - 294}" y="370" width="198" height="68" rx="20" fill="rgba(0,0,0,0.32)" stroke="${dirColor}" stroke-width="2.5"/>
  <text x="${W - 195}" y="414" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="${dirColor}">${escXml(levBadge)}</text>
  `
      : `
  <!-- Period Summary Banner -->
  <rect x="68" y="324" width="${W - 136}" height="128" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderCoinBadgeSvg(mainTicker, 146, 388, 44, input.tokenLogoDataUri, 'coinVP')}
  <text x="210" y="382" font-family="Vazirmatn" font-size="25" fill="#ffffff">${cleanSvgText(periodHeroTitle, 30)}</text>
  <text x="210" y="420" font-family="Vazirmatn" font-size="21" fill="${palette.muted}">${venueTitle}</text>
  <text x="${W - 98}" y="382" text-anchor="end" font-family="Vazirmatn" font-size="22" fill="${palette.muted}">موتور غالب</text>
  <text x="${W - 98}" y="422" text-anchor="end" font-family="Vazirmatn" font-size="28" fill="${palette.accent}">${engineTitle}</text>
  `
  }

  <!-- Main Hero ROI & PnL Box -->
  <rect x="68" y="${isSingleTrade ? 516 : 482}" width="${W - 136}" height="348" rx="38" fill="${pnlSoft}" stroke="${pnlColor}" stroke-width="2.5"/>
  <path d="${wavePath}" fill="none" stroke="${pnlColor}" stroke-width="4" opacity="0.28" stroke-linecap="round"/>
  <text x="${W / 2}" y="${isSingleTrade ? 584 : 550}" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="#e2e8f0">بازده خالص و سود تسویه‌شده</text>
  <text x="${W / 2}" y="${isSingleTrade ? 718 : 684}" text-anchor="middle" font-family="Vazirmatn" font-size="124" fill="${pnlColor}">${escXml(roiStr)}</text>
  <text x="${W / 2}" y="${isSingleTrade ? 802 : 768}" text-anchor="middle" font-family="Vazirmatn" font-size="48" fill="#ffffff">${escXml(pnlStr)}</text>

  <!-- Tilted Verification Stamp -->
  <g transform="translate(${W / 2}, ${isSingleTrade ? 934 : 906}) rotate(-7)">
    <rect x="-270" y="-42" width="540" height="84" rx="20" fill="rgba(5,12,30,0.82)" stroke="${stampColor}" stroke-width="4"/>
    <text x="0" y="10" text-anchor="middle" font-family="Vazirmatn" font-size="26" fill="${stampColor}">${escXml(stampSubEn)}</text>
  </g>

  ${
    isSingleTrade
      ? `
  <!-- Entry & Exit Price Strip -->
  <rect x="68" y="1008" width="448" height="190" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('entry', 100, 1042, 34, '#38bdf8')}
  <text x="484" y="1070" text-anchor="end" font-family="Vazirmatn" font-size="25" fill="${palette.muted}">قیمت ورود</text>
  <text x="292" y="1146" text-anchor="middle" font-family="Vazirmatn" font-size="42" fill="#ffffff">${escXml(entryStr)}</text>

  <rect x="564" y="1008" width="448" height="190" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('exit', 596, 1042, 34, pnlColor)}
  <text x="980" y="1070" text-anchor="end" font-family="Vazirmatn" font-size="25" fill="${palette.muted}">قیمت خروج</text>
  <text x="788" y="1146" text-anchor="middle" font-family="Vazirmatn" font-size="42" fill="${pnlColor}">${escXml(exitStr)}</text>

  <!-- Engine & Signal Details -->
  <rect x="68" y="1224" width="448" height="190" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('engine', 100, 1258, 34, palette.accent)}
  <text x="484" y="1286" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="${palette.muted}">موتور فعال</text>
  <text x="292" y="1358" text-anchor="middle" font-family="Vazirmatn" font-size="30" fill="#ffffff">${engineTitle}</text>

  <rect x="564" y="1224" width="448" height="190" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('signal', 596, 1258, 34, '#f0b90b')}
  <text x="980" y="1286" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="${palette.muted}">منبع سیگنال</text>
  <text x="788" y="1358" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="#ffffff">${signalTitle}</text>

  <!-- Venue & Date Strip -->
  <rect x="68" y="1440" width="448" height="162" rx="26" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('venue', 100, 1472, 32, '#10d9a3')}
  <text x="484" y="1498" text-anchor="end" font-family="Vazirmatn" font-size="23" fill="${palette.muted}">صرافی / شبکه</text>
  <text x="292" y="1560" text-anchor="middle" font-family="Vazirmatn" font-size="30" fill="#ffffff">${venueTitle}</text>

  <rect x="564" y="1440" width="448" height="162" rx="26" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('clock', 596, 1472, 32, '#93c5fd')}
  <text x="980" y="1498" text-anchor="end" font-family="Vazirmatn" font-size="23" fill="${palette.muted}">تاریخ تسویه</text>
  <text x="788" y="1560" text-anchor="middle" font-family="Vazirmatn" font-size="34" fill="#e2e8f0">${escXml(dateStr)}</text>
  `
      : `
  <!-- 2x2 Metrics Grid for Period Card -->
  <rect x="68" y="984" width="448" height="198" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('winrate', 100, 1018, 34, '#10d9a3')}
  <text x="484" y="1046" text-anchor="end" font-family="Vazirmatn" font-size="25" fill="${palette.muted}">نرخ موفقیت</text>
  <text x="292" y="1126" text-anchor="middle" font-family="Vazirmatn" font-size="54" fill="#ffffff">${escXml(wrStr)}</text>

  <rect x="564" y="984" width="448" height="198" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('trades', 596, 1018, 34, '#38e1ff')}
  <text x="980" y="1046" text-anchor="end" font-family="Vazirmatn" font-size="25" fill="${palette.muted}">تعداد معاملات</text>
  <text x="788" y="1126" text-anchor="middle" font-family="Vazirmatn" font-size="54" fill="#ffffff">${input.tradesCount}</text>

  <rect x="68" y="1210" width="448" height="198" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('pf', 100, 1244, 34, '#f0b90b')}
  <text x="484" y="1272" text-anchor="end" font-family="Vazirmatn" font-size="25" fill="${palette.muted}">ضریب سود</text>
  <text x="292" y="1352" text-anchor="middle" font-family="Vazirmatn" font-size="54" fill="#fbbf24">${escXml(pfStr)}</text>

  <rect x="564" y="1210" width="448" height="198" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('clock', 596, 1244, 34, '#93c5fd')}
  <text x="980" y="1272" text-anchor="end" font-family="Vazirmatn" font-size="25" fill="${palette.muted}">تاریخ صدور</text>
  <text x="788" y="1352" text-anchor="middle" font-family="Vazirmatn" font-size="42" fill="#e2e8f0">${escXml(dateStr)}</text>

  <!-- Engine & Signal Origin Bar -->
  <rect x="68" y="1436" width="${W - 136}" height="166" rx="28" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('engine', 102, 1468, 32, palette.accent)}
  <text x="150" y="1496" font-family="Vazirmatn" font-size="24" fill="${palette.muted}">ENGINE</text>
  <text x="150" y="1536" font-family="Vazirmatn" font-size="28" fill="#ffffff">${engineTitle}</text>

  ${renderSectionIcon('signal', W - 138, 1468, 32, '#f0b90b')}
  <text x="${W - 154}" y="1496" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="${palette.muted}">${input.signalName ? 'منبع و سیگنال' : 'پوشش معاملات'}</text>
  <text x="${W - 154}" y="1536" text-anchor="end" font-family="Vazirmatn" font-size="26" fill="${palette.accent}">${signalTitle}</text>
  `
  }

  <!-- Verification Footer with QR -->
  <rect x="68" y="${H - 274}" width="${W - 136}" height="218" rx="30" fill="rgba(0,0,0,0.34)" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${qrBox}
  <text x="102" y="${H - 212}" font-family="Vazirmatn" font-size="26" fill="#ffffff">Verify ID: ${escXml(input.cardId)}</text>
  <text x="102" y="${H - 166}" font-family="Vazirmatn" font-size="22" fill="#10d9a3">HMAC-SHA256 SERVER VERIFIED</text>
  <text x="102" y="${H - 118}" font-family="Vazirmatn" font-size="24" fill="${palette.accent}">@Dollarino_official · @Dollarino_bot</text>
  <text x="102" y="${H - 82}" font-family="Vazirmatn" font-size="20" fill="${palette.muted}">dollarino.pages.dev</text>
</svg>`;
  }

  // HORIZONTAL 16:9 LANDSCAPE (1200 x 675)
  const qrBoxH = renderVectorQrGroup(verifyUrl, W - 178, H - 176, 114);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgH" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bg1}"/>
      <stop offset="55%" stop-color="${palette.bg2}"/>
      <stop offset="100%" stop-color="${palette.bg3}"/>
    </linearGradient>
    <radialGradient id="glowH" cx="0.22" cy="0.45" r="0.65">
      <stop offset="0%" stop-color="${pnlColor}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${palette.bg1}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bgH)"/>
  <rect width="${W}" height="${H}" fill="url(#glowH)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="34" fill="none" stroke="${palette.border}" stroke-width="2.5"/>

  <!-- Watermark Dollarino Logo -->
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" opacity="0.085"/>

  <!-- Top Bar -->
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="52" y="42" width="64" height="64"/>
  <text x="130" y="72" font-family="Vazirmatn" font-size="28" fill="#ffffff">کارت سود دلارینو</text>
  <text x="130" y="102" font-family="Vazirmatn" font-size="19" fill="${palette.accent}">${escXml(periodLabelFa(input.period))} · ${escXml(tradeSourceLabelFa(input.tradeSource))}</text>

  <text x="${W - 328}" y="70" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="#ffffff">${traderTitle}</text>
  <text x="${W - 328}" y="100" text-anchor="end" font-family="Vazirmatn" font-size="19" fill="${palette.muted}">${venueTitle}</text>

  <rect x="${W - 306}" y="46" width="256" height="54" rx="27" fill="rgba(0,0,0,0.34)" stroke="${stampColor}" stroke-width="2"/>
  <circle cx="${W - 278}" cy="73" r="6" fill="${stampColor}"/>
  <text x="${W - 166}" y="81" text-anchor="middle" font-family="Vazirmatn" font-size="20" fill="${stampColor}">${stampTitleFa}</text>

  <!-- Left Hero Zone -->
  <path d="${wavePath}" fill="none" stroke="${pnlColor}" stroke-width="3.5" opacity="0.22" stroke-linecap="round"/>

  ${
    isSingleTrade
      ? `
  ${renderCoinBadgeSvg(mainTicker, 102, 184, 42, input.tokenLogoDataUri, 'coinH')}
  <text x="164" y="176" font-family="Vazirmatn" font-size="36" fill="#ffffff">${cleanSvgText(symbolFull, 18)}</text>
  <rect x="164" y="192" width="170" height="36" rx="14" fill="rgba(0,0,0,0.32)" stroke="${dirColor}" stroke-width="2"/>
  <text x="249" y="217" text-anchor="middle" font-family="Vazirmatn" font-size="20" fill="${dirColor}">${escXml(levBadge)}</text>
  <text x="58" y="316" font-family="Vazirmatn" font-size="96" fill="${pnlColor}">${escXml(roiStr)}</text>
  <text x="58" y="378" font-family="Vazirmatn" font-size="38" fill="#ffffff">${escXml(pnlStr)}</text>
  `
      : `
  ${renderCoinBadgeSvg(mainTicker, 98, 178, 38, input.tokenLogoDataUri, 'coinHP')}
  <text x="154" y="176" font-family="Vazirmatn" font-size="23" fill="#ffffff">${cleanSvgText(periodHeroTitle, 30)}</text>
  <text x="154" y="206" font-family="Vazirmatn" font-size="20" fill="${palette.accent}">${engineTitle}</text>
  <text x="58" y="316" font-family="Vazirmatn" font-size="98" fill="${pnlColor}">${escXml(roiStr)}</text>
  <text x="58" y="378" font-family="Vazirmatn" font-size="38" fill="#ffffff">${escXml(pnlStr)}</text>
  `
  }

  <!-- Right Hero Card: Engine & Signal (Single Trade) or Stamp (Period) -->
  ${
    isSingleTrade
      ? `
  <rect x="650" y="138" width="498" height="238" rx="26" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('engine', 682, 166, 26, palette.accent)}
  <text x="720" y="185" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">موتور معاملاتی فعال</text>
  <text x="1116" y="224" text-anchor="end" font-family="Vazirmatn" font-size="26" fill="#ffffff">${engineTitle}</text>

  <line x1="680" y1="252" x2="1118" y2="252" stroke="${palette.panelBorder}" stroke-width="1.5"/>
  ${renderSectionIcon('signal', 682, 276, 26, '#f0b90b')}
  <text x="720" y="295" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">منبع سیگنال و تاییدیه</text>
  <text x="1116" y="336" text-anchor="end" font-family="Vazirmatn" font-size="25" fill="${palette.accent}">${signalTitle}</text>
  `
      : `
  <g transform="translate(902, 250) rotate(-9)">
    <rect x="-220" y="-42" width="440" height="84" rx="18" fill="rgba(5,12,30,0.8)" stroke="${stampColor}" stroke-width="4"/>
    <text x="0" y="10" text-anchor="middle" font-family="Vazirmatn" font-size="24" fill="${stampColor}">${escXml(stampSubEn)}</text>
  </g>
  `
  }

  <!-- Bottom 4 Metric Tiles -->
  ${
    isSingleTrade
      ? `
  <rect x="52" y="408" width="234" height="122" rx="22" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('entry', 72, 424, 24, '#38bdf8')}
  <text x="266" y="444" text-anchor="end" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">قیمت ورود</text>
  <text x="169" y="498" text-anchor="middle" font-family="Vazirmatn" font-size="27" fill="#ffffff">${escXml(entryStr)}</text>

  <rect x="302" y="408" width="234" height="122" rx="22" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('exit', 322, 424, 24, pnlColor)}
  <text x="516" y="444" text-anchor="end" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">قیمت خروج</text>
  <text x="419" y="498" text-anchor="middle" font-family="Vazirmatn" font-size="27" fill="${pnlColor}">${escXml(exitStr)}</text>

  <rect x="552" y="408" width="234" height="122" rx="22" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('venue', 572, 424, 24, '#f0b90b')}
  <text x="766" y="444" text-anchor="end" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">صرافی / شبکه</text>
  <text x="669" y="498" text-anchor="middle" font-family="Vazirmatn" font-size="21" fill="#ffffff">${cleanSvgText(venueTitle, 18)}</text>

  <rect x="802" y="408" width="202" height="122" rx="22" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('clock', 822, 424, 24, '#93c5fd')}
  <text x="984" y="444" text-anchor="end" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">تاریخ تسویه</text>
  <text x="903" y="498" text-anchor="middle" font-family="Vazirmatn" font-size="22" fill="#e2e8f0">${escXml(dateStr)}</text>
  `
      : `
  <rect x="52" y="408" width="228" height="122" rx="22" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('winrate', 72, 424, 24, '#10d9a3')}
  <text x="260" y="444" text-anchor="end" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">نرخ موفقیت</text>
  <text x="166" y="500" text-anchor="middle" font-family="Vazirmatn" font-size="36" fill="#ffffff">${escXml(wrStr)}</text>

  <rect x="298" y="408" width="228" height="122" rx="22" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('trades', 318, 424, 24, '#38e1ff')}
  <text x="506" y="444" text-anchor="end" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">تعداد معاملات</text>
  <text x="412" y="500" text-anchor="middle" font-family="Vazirmatn" font-size="36" fill="#ffffff">${input.tradesCount}</text>

  <rect x="544" y="408" width="228" height="122" rx="22" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('pf', 564, 424, 24, '#f0b90b')}
  <text x="752" y="444" text-anchor="end" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">ضریب سود</text>
  <text x="658" y="500" text-anchor="middle" font-family="Vazirmatn" font-size="36" fill="#fbbf24">${escXml(pfStr)}</text>

  <rect x="790" y="408" width="214" height="122" rx="22" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="2"/>
  ${renderSectionIcon('clock', 808, 424, 24, '#93c5fd')}
  <text x="986" y="444" text-anchor="end" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">تاریخ صدور</text>
  <text x="897" y="500" text-anchor="middle" font-family="Vazirmatn" font-size="26" fill="#e2e8f0">${escXml(dateStr)}</text>
  `
  }

  ${qrBoxH}

  <!-- Bottom Footer -->
  <text x="56" y="592" font-family="Vazirmatn" font-size="20" fill="#ffffff">Verify ID: ${escXml(input.cardId)}  ·  HMAC-SHA256 VERIFIED</text>
  <text x="56" y="624" font-family="Vazirmatn" font-size="20" fill="${palette.accent}">@Dollarino_official · @Dollarino_bot · dollarino.pages.dev</text>
  <text x="${W - 200}" y="624" text-anchor="end" font-family="Vazirmatn" font-size="18" fill="${palette.muted}">${signalTitle}</text>
</svg>`;
}

export interface SignalClosedCardRenderInput {
  cardId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  engineLabel: string;
  mode: 'LIVE' | 'PAPER';
  entryPrice: string;
  exitPrice: string;
  pnlUsd: number;
  pnlPct: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  trailingActive: boolean;
  trailingSlPrice?: string;
  closeReason: string;
  openedAt: string;
  closedAt: string;
  tokenLogoDataUri?: string | null;
  layout?: 'horizontal' | 'vertical';
}

export function buildSignalClosedCardSvg(input: SignalClosedCardRenderInput): string {
  const layout = input.layout === 'vertical' ? 'vertical' : 'horizontal';
  const W = layout === 'vertical' ? 1080 : 1200;
  const H = layout === 'vertical' ? 1920 : 675; // True 9:16 Story & 16:9 Landscape
  const isWin = input.pnlUsd >= 0;
  const accent = isWin ? '#10d9a3' : '#fb7185';
  const accentSoft = isWin ? 'rgba(16, 217, 163, 0.14)' : 'rgba(251, 113, 133, 0.14)';
  const isLive = input.mode === 'LIVE';
  const stampColor = isLive ? '#10d9a3' : '#f59e0b';
  const stampLabel = isLive ? 'LIVE SIGNAL VERIFIED' : 'DEMO / PAPER SIGNAL';

  const roiStr = fmtSignedPct(input.pnlPct);
  const pnlStr = fmtSignedUsd(input.pnlUsd);
  const logoSize = layout === 'vertical' ? 580 : 420;
  const logoX = Math.round((W - logoSize) / 2);
  const logoY = Math.round((H - logoSize) / 2);

  const baseTicker = String(input.symbol || 'BTC').split(/[/:_-]/)[0]?.replace(/(USDT|USDC|USD)$/i, '') || 'BTC';
  const tp1Lbl = input.tp1Hit ? 'فعال شد' : 'در انتظار';
  const tp2Lbl = input.tp2Hit ? 'فعال شد' : 'در انتظار';
  const tp3Lbl = input.tp3Hit ? 'تکمیل شد' : 'در انتظار';
  const trailLbl = input.trailingActive
    ? input.trailingSlPrice || 'Risk-Free'
    : input.trailingSlPrice || 'Fixed SL';
  const engClean = cleanSvgText(input.engineLabel);

  if (layout === 'vertical') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgSCV" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#040b1f"/>
      <stop offset="100%" stop-color="#0b1c45"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgSCV)"/>
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" rx="44" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3"/>
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" opacity="0.09"/>

  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="76" y="74" width="84" height="84"/>
  <text x="180" y="112" font-family="Vazirmatn" font-size="34" fill="#ffffff">نتیجه بسته شدن سیگنال دلارینو</text>
  <text x="180" y="152" font-family="Vazirmatn" font-size="24" fill="#38bdf8">${engClean}</text>

  ${renderCoinBadgeSvg(baseTicker, 136, 272, 54, input.tokenLogoDataUri, 'sigCoinV')}
  <text x="214" y="268" font-family="Vazirmatn" font-size="52" fill="#ffffff">${escXml(input.symbol)}</text>
  <text x="214" y="312" font-family="Vazirmatn" font-size="28" fill="${accent}">${input.direction} · ${input.leverage}X</text>

  <rect x="76" y="366" width="${W - 152}" height="340" rx="36" fill="${accentSoft}" stroke="${accent}" stroke-width="2.5"/>
  <text x="${W / 2}" y="440" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="#e2e8f0">${isWin ? 'تبریک! تارگت با سود بسته شد' : 'معامله با مدیریت ریسک بسته شد'}</text>
  <text x="${W / 2}" y="576" text-anchor="middle" font-family="Vazirmatn" font-size="120" fill="${accent}">${escXml(roiStr)}</text>
  <text x="${W / 2}" y="662" text-anchor="middle" font-family="Vazirmatn" font-size="46" fill="#ffffff">${escXml(pnlStr)} USDT</text>

  <g transform="translate(${W / 2}, 785) rotate(-8)">
    <rect x="-260" y="-44" width="520" height="88" rx="18" fill="rgba(4,11,31,0.78)" stroke="${stampColor}" stroke-width="4.5"/>
    <text x="0" y="12" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="${stampColor}">${escXml(stampLabel)}</text>
  </g>

  <!-- TP1 / TP2 / TP3 / Trailing SL Badges -->
  <rect x="76" y="888" width="445" height="175" rx="26" fill="rgba(255,255,255,0.07)" stroke="${input.tp1Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="298" y="952" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="#94a3b8">TP1</text>
  <text x="298" y="1014" text-anchor="middle" font-family="Vazirmatn" font-size="34" fill="${input.tp1Hit ? '#10d9a3' : '#cbd5e1'}">${tp1Lbl}</text>

  <rect x="559" y="888" width="445" height="175" rx="26" fill="rgba(255,255,255,0.07)" stroke="${input.tp2Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="781" y="952" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="#94a3b8">TP2</text>
  <text x="781" y="1014" text-anchor="middle" font-family="Vazirmatn" font-size="34" fill="${input.tp2Hit ? '#10d9a3' : '#cbd5e1'}">${tp2Lbl}</text>

  <rect x="76" y="1090" width="445" height="175" rx="26" fill="rgba(255,255,255,0.07)" stroke="${input.tp3Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="298" y="1154" text-anchor="middle" font-family="Vazirmatn" font-size="28" fill="#94a3b8">TP3</text>
  <text x="298" y="1216" text-anchor="middle" font-family="Vazirmatn" font-size="34" fill="${input.tp3Hit ? '#10d9a3' : '#cbd5e1'}">${tp3Lbl}</text>

  <rect x="559" y="1090" width="445" height="175" rx="26" fill="rgba(255,255,255,0.07)" stroke="${input.trailingActive ? '#38bdf8' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="781" y="1154" text-anchor="middle" font-family="Vazirmatn" font-size="26" fill="#94a3b8">${input.trailingActive ? 'Trailing SL فعال' : 'Stop Loss'}</text>
  <text x="781" y="1216" text-anchor="middle" font-family="Vazirmatn" font-size="30" fill="${input.trailingActive ? '#38bdf8' : '#cbd5e1'}">${escXml(trailLbl)}</text>

  <!-- Prices & Times -->
  <rect x="76" y="1310" width="${W - 152}" height="320" rx="30" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="${W - 110}" y="1394" text-anchor="end" font-family="Vazirmatn" font-size="32" fill="#e2e8f0">Entry: ${escXml(input.entryPrice)}  ·  Exit: ${escXml(input.exitPrice)}</text>
  <text x="${W - 110}" y="1464" text-anchor="end" font-family="Vazirmatn" font-size="26" fill="#94a3b8">Opened: ${escXml(input.openedAt.slice(0, 19).replace('T', ' '))} UTC</text>
  <text x="${W - 110}" y="1528" text-anchor="end" font-family="Vazirmatn" font-size="26" fill="#94a3b8">Closed: ${escXml(input.closedAt.slice(0, 19).replace('T', ' '))} UTC</text>
  <text x="${W - 110}" y="1592" text-anchor="end" font-family="Vazirmatn" font-size="24" fill="#38bdf8">${escXml(input.closeReason)}</text>

  <text x="76" y="${H - 88}" font-family="Vazirmatn" font-size="24" fill="#94a3b8">Card: ${escXml(input.cardId.slice(0, 18))}</text>
  <text x="${W - 76}" y="${H - 88}" text-anchor="end" font-family="Vazirmatn" font-size="26" fill="#38bdf8">@Dollarino_official · dollarino.pages.dev</text>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgSCH" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#040b1f"/>
      <stop offset="100%" stop-color="#0b1c45"/>
    </linearGradient>
    <radialGradient id="glowSCH" cx="0.22" cy="0.45" r="0.65">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#040b1f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgSCH)"/>
  <rect width="${W}" height="${H}" fill="url(#glowSCH)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="34" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2.5"/>
  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" opacity="0.09"/>

  <image href="data:image/png;base64,${DOLLARINO_LOGO_PNG_B64}" x="54" y="44" width="62" height="62"/>
  <text x="132" y="76" font-family="Vazirmatn" font-size="28" fill="#ffffff">نتیجه بسته شدن سیگنال دلارینو</text>
  <text x="132" y="106" font-family="Vazirmatn" font-size="20" fill="#38bdf8">${engClean}</text>

  ${renderCoinBadgeSvg(baseTicker, W - 390, 74, 30, input.tokenLogoDataUri, 'sigCoinH')}
  <text x="${W - 54}" y="76" text-anchor="end" font-family="Vazirmatn" font-size="32" fill="#ffffff">${escXml(input.symbol)} · ${input.direction} · ${input.leverage}X</text>
  <text x="${W - 54}" y="110" text-anchor="end" font-family="Vazirmatn" font-size="20" fill="#94a3b8">Entry: ${escXml(input.entryPrice)}  ·  Exit: ${escXml(input.exitPrice)}</text>

  <text x="60" y="205" font-family="Vazirmatn" font-size="22" fill="#e2e8f0">${isWin ? 'تبریک! معامله با سود بسته شد' : 'معامله با مدیریت ریسک بسته شد'}</text>
  <text x="60" y="316" font-family="Vazirmatn" font-size="104" fill="${accent}">${escXml(roiStr)}</text>
  <text x="60" y="384" font-family="Vazirmatn" font-size="40" fill="#ffffff">${escXml(pnlStr)} USDT</text>

  <g transform="translate(880, 275) rotate(-11)">
    <rect x="-240" y="-42" width="480" height="84" rx="18" fill="rgba(4,11,31,0.74)" stroke="${stampColor}" stroke-width="4.5"/>
    <text x="0" y="11" text-anchor="middle" font-family="Vazirmatn" font-size="25" fill="${stampColor}">${escXml(stampLabel)}</text>
  </g>

  <!-- 4 TP & Trailing SL Boxes -->
  <rect x="54" y="438" width="256" height="114" rx="20" fill="rgba(255,255,255,0.06)" stroke="${input.tp1Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="182" y="482" text-anchor="middle" font-family="Vazirmatn" font-size="21" fill="#94a3b8">TP1</text>
  <text x="182" y="524" text-anchor="middle" font-family="Vazirmatn" font-size="25" fill="${input.tp1Hit ? '#10d9a3' : '#cbd5e1'}">${tp1Lbl}</text>

  <rect x="332" y="438" width="256" height="114" rx="20" fill="rgba(255,255,255,0.06)" stroke="${input.tp2Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="460" y="482" text-anchor="middle" font-family="Vazirmatn" font-size="21" fill="#94a3b8">TP2</text>
  <text x="460" y="524" text-anchor="middle" font-family="Vazirmatn" font-size="25" fill="${input.tp2Hit ? '#10d9a3' : '#cbd5e1'}">${tp2Lbl}</text>

  <rect x="610" y="438" width="256" height="114" rx="20" fill="rgba(255,255,255,0.06)" stroke="${input.tp3Hit ? '#10d9a3' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="738" y="482" text-anchor="middle" font-family="Vazirmatn" font-size="21" fill="#94a3b8">TP3</text>
  <text x="738" y="524" text-anchor="middle" font-family="Vazirmatn" font-size="25" fill="${input.tp3Hit ? '#10d9a3' : '#cbd5e1'}">${tp3Lbl}</text>

  <rect x="888" y="438" width="258" height="114" rx="20" fill="rgba(255,255,255,0.06)" stroke="${input.trailingActive ? '#38bdf8' : 'rgba(255,255,255,0.14)'}" stroke-width="2"/>
  <text x="1017" y="482" text-anchor="middle" font-family="Vazirmatn" font-size="20" fill="#94a3b8">${input.trailingActive ? 'Trailing SL فعال' : 'Stop Loss'}</text>
  <text x="1017" y="524" text-anchor="middle" font-family="Vazirmatn" font-size="24" fill="${input.trailingActive ? '#38bdf8' : '#cbd5e1'}">${escXml(trailLbl)}</text>

  <text x="56" y="618" font-family="Vazirmatn" font-size="19" fill="#94a3b8">${escXml(input.closedAt.slice(0, 19).replace('T', ' '))} UTC · ${escXml(input.closeReason)}</text>
  <text x="${W - 56}" y="618" text-anchor="end" font-family="Vazirmatn" font-size="22" fill="#38bdf8">@Dollarino_official · dollarino.pages.dev</text>
</svg>`;
}

export async function renderSvgToPngBuffer(svg: string): Promise<Uint8Array | null> {
  const ok = await ensureResvgReady();
  if (!ok) return null;
  try {
    const resvg = new Resvg(svg, {
      font: {
        fontBuffers: [getFontBytes()],
        defaultFontFamily: 'Vazirmatn',
      },
    });
    const rendered = resvg.render();
    return rendered.asPng();
  } catch {
    return null;
  }
}

export async function renderProfitCardPng(input: ProfitCardRenderInput): Promise<Uint8Array | null> {
  return renderSvgToPngBuffer(buildProfitCardSvg(input));
}

export async function renderSignalClosedCardPng(input: SignalClosedCardRenderInput): Promise<Uint8Array | null> {
  return renderSvgToPngBuffer(buildSignalClosedCardSvg(input));
}
