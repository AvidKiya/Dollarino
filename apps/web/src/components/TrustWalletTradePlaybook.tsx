import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  CopyCheck,
  Radar,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { NavTab } from '../lib/types';

export type PlaybookModeId = 'FUTURES' | 'SPOT' | 'DEX' | 'SNIPER' | 'COPY_TRADE';

interface PlaybookModeEntry {
  id: PlaybookModeId;
  titleFa: string;
  titleEn: string;
  ready: boolean;
  howItWorksFa: string;
  stepsFa: string[];
  ctaPath: string;
  ctaLabelFa: string;
}

interface PlaybookResponse {
  ok: boolean;
  readiness: {
    tradingMode: 'PAPER' | 'LIVE';
    executionMode: 'AUTO' | 'MANUAL_CONFIRM';
    trustConnected: boolean;
    trustVerified: boolean;
    perpConnected: boolean;
    perpVenue: string | null;
    perpEquityUsd: number;
    vaultReady: boolean;
    vaultFunded: boolean;
    vaultAllowanceUsd: number;
    paperBalanceUsd: number;
    addresses: {
      evm: string | null;
      solana: string | null;
      tron: string | null;
      ton: string | null;
    };
  };
  modes: PlaybookModeEntry[];
}

function mapCtaPathToNavTab(ctaPath: string): NavTab {
  if (ctaPath.includes('dex-trust')) return 'dex';
  if (ctaPath.includes('markets')) return 'markets';
  if (ctaPath.includes('radar')) return 'radar';
  if (ctaPath.includes('copy-trade')) return 'copy';
  if (ctaPath.includes('terminal')) return 'terminal';
  return 'dex';
}

const MODE_ICON: Record<PlaybookModeId, typeof Wallet> = {
  FUTURES: Activity,
  SPOT: Coins,
  DEX: Zap,
  SNIPER: Radar,
  COPY_TRADE: CopyCheck,
};

const MODE_SHORT_FA: Record<PlaybookModeId, string> = {
  FUTURES: 'فیوچرز Perp DEX',
  SPOT: 'اسپات چندزنجیره',
  DEX: 'ترید DEX',
  SNIPER: 'اسنایپر خودکار',
  COPY_TRADE: 'کپی‌ترید ولت/سایت',
};

const MODE_SHORT_EN: Record<PlaybookModeId, string> = {
  FUTURES: 'Perp Futures',
  SPOT: 'Multi-Chain Spot',
  DEX: 'DEX Swaps',
  SNIPER: 'Listing Sniper',
  COPY_TRADE: 'Copy Trading',
};

export function TrustWalletTradePlaybook({
  lang,
  focusMode = 'FUTURES',
  compact = false,
  defaultExpanded,
  onNavigate,
}: {
  lang: Lang;
  focusMode?: PlaybookModeId;
  compact?: boolean;
  defaultExpanded?: boolean;
  onNavigate?: (tab: NavTab) => void;
}) {
  const isFa = lang === 'fa';
  const [data, setData] = useState<PlaybookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<PlaybookModeId>(focusMode);
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded ?? !compact);

  useEffect(() => {
    setSelectedMode(focusMode);
  }, [focusMode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<PlaybookResponse>('/api/trustwallet/playbook')
      .then((res) => {
        if (!cancelled && res?.ok) setData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const readiness = data?.readiness;
  const activeMode = data?.modes.find((m) => m.id === selectedMode) ?? data?.modes[0];

  return (
    <div className="panel rounded-3xl border hairline overflow-hidden">
      {/* Header Bar */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-start hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[#0500FF]/15 text-[#6875FF] flex items-center justify-center shrink-0 border border-[#0500FF]/25">
            <Wallet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm font-black text-main">
                {isFa ? 'راهنمای جامع ترید با Trust Wallet و حساب دمو در ۵ بخش' : 'Trust Wallet & Demo Playbook Across All 5 Modes'}
              </strong>
              {readiness && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    readiness.tradingMode === 'LIVE'
                      ? readiness.trustConnected
                        ? 'bg-emerald-500/15 text-jade'
                        : 'bg-amber-500/15 text-amber-400'
                      : 'bg-sky-500/15 text-sky-400'
                  }`}
                >
                  {readiness.tradingMode === 'LIVE'
                    ? readiness.trustConnected
                      ? isFa
                        ? 'کیف‌پول متصل ✅'
                        : 'Trust Connected ✅'
                      : isFa
                        ? 'نیازمند اتصال ولت'
                        : 'Connect Wallet'
                    : isFa
                      ? 'حالت دمو فعال 🧪'
                      : 'Demo Active 🧪'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-dim truncate">
              {isFa
                ? 'نحوه اجرای خودکار ۲۴/۷ و تایید ۱-کلیک در فیوچرز، اسپات، DEX، اسنایپر و کپی‌ترید'
                : 'How 24/7 autonomous & 1-tap Trust Wallet signing work across Futures, Spot, DEX, Sniper & Copy'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs font-bold text-dim">
          <span>{expanded ? (isFa ? 'بستن' : 'Collapse') : isFa ? 'مشاهده راهنما' : 'Open Guide'}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 pt-2 border-t hairline space-y-4">
          {/* Quick Readiness Strip */}
          {readiness && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="surface-soft rounded-2xl p-3 border hairline">
                <span className="text-[10px] text-dim block">{isFa ? 'اتصال Trust Wallet' : 'Trust Wallet'}</span>
                <strong className={`text-xs font-black inline-flex items-center gap-1 mt-0.5 ${readiness.trustConnected ? 'text-jade' : 'text-amber-400'}`}>
                  {readiness.trustConnected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  {readiness.trustConnected ? (isFa ? 'متصل و تاییدشده' : 'Connected') : isFa ? 'متصل نشده' : 'Not Connected'}
                </strong>
              </div>
              <div className="surface-soft rounded-2xl p-3 border hairline">
                <span className="text-[10px] text-dim block">{isFa ? 'اتصال فیوچرز غیرمتمرکز' : 'Perp DEX (Agent)'}</span>
                <strong className={`text-xs font-black inline-flex items-center gap-1 mt-0.5 ${readiness.perpConnected ? 'text-jade' : 'text-dim'}`}>
                  <Activity className="w-3.5 h-3.5" />
                  {readiness.perpConnected
                    ? `${readiness.perpVenue || 'Hyperliquid'} ($${readiness.perpEquityUsd.toFixed(0)})`
                    : isFa
                      ? 'غیرفعال (در بخش کیف‌پول فعال کنید)'
                      : 'Inactive'}
                </strong>
              </div>
              <div className="surface-soft rounded-2xl p-3 border hairline">
                <span className="text-[10px] text-dim block">{isFa ? 'خزانه اتوترید ۲۴/۷ (Vault)' : '24/7 Auto Copy Vault'}</span>
                <strong className={`text-xs font-black inline-flex items-center gap-1 mt-0.5 ${readiness.vaultFunded ? 'text-jade' : 'text-dim'}`}>
                  <Bot className="w-3.5 h-3.5" />
                  {readiness.vaultFunded
                    ? `${isFa ? 'سقف فعال:' : 'Cap:'} $${readiness.vaultAllowanceUsd.toFixed(0)}`
                    : readiness.vaultReady
                      ? isFa
                        ? 'ساخته‌شده (نیازمند سقف/شارژ)'
                        : 'Created (No allowance)'
                      : isFa
                        ? 'آماده ساخت خودکار'
                        : 'Ready to setup'}
                </strong>
              </div>
              <div className="surface-soft rounded-2xl p-3 border hairline">
                <span className="text-[10px] text-dim block">{isFa ? 'حالت اجرا و موجودی دمو' : 'Execution & Demo'}</span>
                <strong className="text-xs font-black text-main inline-flex items-center gap-1 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {readiness.executionMode === 'AUTO' ? (isFa ? 'اتوماتیک' : 'AUTO') : isFa ? 'تایید ۱-کلیک' : '1-Tap'} ·{' '}
                    <span dir="ltr" className="font-num">${readiness.paperBalanceUsd.toLocaleString()}</span>
                  </span>
                </strong>
              </div>
            </div>
          )}

          {/* 5 Mode Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {(['FUTURES', 'SPOT', 'DEX', 'SNIPER', 'COPY_TRADE'] as PlaybookModeId[]).map((id) => {
              const Icon = MODE_ICON[id];
              const mData = data?.modes.find((m) => m.id === id);
              const active = selectedMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedMode(id)}
                  className={`px-3 py-2 rounded-2xl text-xs font-bold border inline-flex items-center gap-1.5 transition ${
                    active
                      ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-sm'
                      : 'surface-soft text-dim hairline hover:text-main'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{isFa ? MODE_SHORT_FA[id] : MODE_SHORT_EN[id]}</span>
                  {mData && (
                    <span
                      className={`w-2 h-2 rounded-full ${mData.ready ? 'bg-emerald-400' : 'bg-amber-400'}`}
                      title={mData.ready ? 'Ready' : 'Setup needed'}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Mode Detailed Card */}
          {loading && !activeMode ? (
            <div className="surface-soft rounded-2xl p-6 text-center text-xs text-dim">
              {isFa ? 'در حال بارگذاری راهنمای زنده کیف‌پول...' : 'Loading Trust Wallet playbook...'}
            </div>
          ) : activeMode ? (
            <div className="surface-soft rounded-2xl p-4 sm:p-5 border hairline space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-black text-main">
                  {isFa ? activeMode.titleFa : activeMode.titleEn}
                </h4>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                    activeMode.ready ? 'bg-emerald-500/15 text-jade' : 'bg-amber-500/15 text-amber-400'
                  }`}
                >
                  {activeMode.ready
                    ? isFa
                      ? 'آماده ترید در حالت فعلی ✅'
                      : 'Ready for Current Mode ✅'
                    : isFa
                      ? 'نیازمند اتصال کیف‌پول واقعی ⚠️'
                      : 'Needs Live Wallet Setup ⚠️'}
                </span>
              </div>

              <p className="text-xs text-sub leading-relaxed">{activeMode.howItWorksFa}</p>

              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-black text-dim">
                  {isFa ? 'مراحل گام‌به‌گام اجرا:' : 'Step-by-Step Execution:'}
                </p>
                <div className="space-y-1.5">
                  {activeMode.stepsFa.map((st, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-main">
                      <span className="w-5 h-5 rounded-lg bg-[#0D47A1]/20 text-brand font-black font-num text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{st}</span>
                    </div>
                  ))}
                </div>
              </div>

              {onNavigate && (
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t hairline">
                  <span className="text-[11px] text-dim">
                    {isFa
                      ? 'کلیدهای خصوصی Trust Wallet همیشه فقط نزد شما می‌مانند؛ دلارینو هیچ دسترسی به برداشت ندارد.'
                      : 'Non-custodial: Your Trust Wallet keys always remain yours with zero withdrawal permission.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate(mapCtaPathToNavTab(activeMode.ctaPath))}
                    className="btn-cobalt px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <span>{activeMode.ctaLabelFa}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
