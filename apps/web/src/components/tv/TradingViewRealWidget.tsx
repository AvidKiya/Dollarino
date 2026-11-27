import { useEffect, useId, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { Timeframe } from '@dollarino/core';
import type { Lang } from '../../lib/i18n';

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

let tvScriptPromise: Promise<void> | null = null;

function loadTradingViewScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.TradingView?.widget) return Promise.resolve();
  if (tvScriptPromise) return tvScriptPromise;

  tvScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-dollarino-tv="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('TV_SCRIPT_LOAD_FAILED')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.dataset.dollarinoTv = '1';
    script.onload = () => resolve();
    script.onerror = () => {
      tvScriptPromise = null;
      reject(new Error('TV_SCRIPT_LOAD_FAILED'));
    };
    document.head.appendChild(script);
  });

  return tvScriptPromise;
}

const TV_INTERVAL_MAP: Record<string, string> = {
  '1m': '1',
  '3m': '3',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '1d': 'D',
  '1w': 'W',
};

const EXCHANGE_OPTIONS = ['BINANCE', 'BYBIT', 'OKX', 'BITGET', 'MEXC', 'KUCOIN', 'GATEIO'] as const;

export function mapToTradingViewSymbol(symbol: string, exchangeHint?: string): string {
  const clean = (symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pair = clean.endsWith('USDT') || clean.endsWith('USD') ? clean : `${clean}USDT`;
  const ex = (exchangeHint || 'BINANCE').toUpperCase();
  if (ex === 'BYBIT' || ex === 'OKX' || ex === 'BITGET' || ex === 'MEXC' || ex === 'KUCOIN' || ex === 'GATEIO') {
    return `${ex}:${pair}`;
  }
  return `BINANCE:${pair}`;
}

export function TradingViewRealWidget({
  symbol,
  timeframe,
  lang,
  height = 460,
  isLight = false,
}: {
  symbol: string;
  timeframe: Timeframe;
  lang: Lang;
  height?: number;
  isLight?: boolean;
}) {
  const isFa = lang === 'fa';
  const rawId = useId();
  const containerId = useMemo(() => `dlr_tv_${rawId.replace(/[^a-zA-Z0-9_-]/g, '_')}`, [rawId]);
  const [exchangeVenue, setExchangeVenue] = useState<string>('BINANCE');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);

  const tvSymbol = useMemo(() => mapToTradingViewSymbol(symbol, exchangeVenue), [symbol, exchangeVenue]);
  const tvInterval = TV_INTERVAL_MAP[timeframe] ?? '15';

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    void loadTradingViewScript()
      .then(() => {
        if (cancelled) return;
        const hostEl = document.getElementById(containerId);
        if (!hostEl || !window.TradingView?.widget) {
          setStatus('error');
          return;
        }
        hostEl.innerHTML = '';
        new window.TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: tvInterval,
          timezone: isFa ? 'Asia/Tehran' : 'Etc/UTC',
          theme: isLight ? 'light' : 'dark',
          style: '1',
          locale: isFa ? 'fa_IR' : 'en',
          enable_publishing: false,
          allow_symbol_change: true,
          withdateranges: true,
          hide_side_toolbar: false,
          hide_top_toolbar: false,
          save_image: true,
          details: false,
          hotlist: false,
          calendar: false,
          container_id: containerId,
          toolbar_bg: isLight ? '#f8fafc' : '#0b1020',
          studies: ['Volume@tv-basicstudies'],
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [containerId, tvSymbol, tvInterval, isFa, isLight, retryCount]);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-[var(--soft)]/80 border hairline text-[11px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-main">
            {isFa ? 'داده مستقیم TradingView:' : 'TradingView Feed:'}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {EXCHANGE_OPTIONS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setExchangeVenue(ex)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition ${
                  exchangeVenue === ex ? 'btn-cobalt text-white' : 'bg-[var(--panel)] text-dim hover:text-main border hairline'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10.5px] font-bold text-brand hover:underline"
        >
          <span>{isFa ? 'باز کردن تمام‌صفحه در TradingView' : 'Open on TradingView'}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div
        className="relative w-full rounded-2xl overflow-hidden border hairline bg-[var(--panel)]"
        style={{ height }}
      >
        <div id={containerId} className="w-full h-full" />
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[var(--panel)]/95 space-y-3">
            <p className="text-xs font-bold text-main">
              {isFa
                ? 'امکان بارگذاری مستقیم ویجت TradingView در این شبکه نبود (فیلتر یا بدون اینترنت). از تب «سوپرچارت Quant + AI + Pine» استفاده کنید.'
                : 'Could not reach s3.tradingview.com in this network. Switch to Quant Superchart (AI + Pine) or retry.'}
            </p>
            <button
              type="button"
              onClick={() => setRetryCount((n) => n + 1)}
              className="btn-cobalt px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isFa ? 'تلاش مجدد' : 'Retry'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
