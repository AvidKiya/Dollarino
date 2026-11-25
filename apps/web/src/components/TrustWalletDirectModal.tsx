import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, ShieldCheck, Smartphone, Wallet, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { launchTrustWalletUrl, type TrustWalletDappHandoff } from '../lib/trustwallet';
import { WalletLogo } from './BrandLogos';

export function TrustWalletDirectModal({
  open,
  lang,
  handoff,
  mobileLaunched,
  busyRetry,
  errorText,
  onRetryInjected,
  onConnected,
  onGoToWalletPage,
  onClose,
}: {
  open: boolean;
  lang: Lang;
  handoff: TrustWalletDappHandoff | null;
  mobileLaunched: boolean;
  busyRetry: boolean;
  errorText: string | null;
  onRetryInjected: () => Promise<void>;
  onConnected: () => Promise<void>;
  onGoToWalletPage: () => void;
  onClose: () => void;
}) {
  const isFa = lang === 'fa';
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [syncedNotice, setSyncedNotice] = useState(false);

  useEffect(() => {
    if (!open || !handoff?.universalLink) {
      setQrDataUrl(null);
      return;
    }
    let active = true;
    void QRCode.toDataURL(handoff.universalLink, {
      width: 240,
      margin: 2,
      color: { dark: '#07122D', light: '#FFFFFF' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [open, handoff?.universalLink]);

  // Poll backend so as soon as Trust Wallet on phone completes tw_autoconnect=1, this screen jumps to the Wallet page automatically
  useEffect(() => {
    if (!open) {
      setSyncedNotice(false);
      return;
    }
    let stopped = false;
    const poll = async () => {
      try {
        const res = await apiFetch<{
          connected: boolean;
          wallet?: { evmAddress?: string | null; solanaAddress?: string | null; tronAddress?: string | null; tonAddress?: string | null };
        }>('/api/trustwallet/status');
        if (!stopped && res.connected) {
          setSyncedNotice(true);
          await onConnected();
        }
      } catch {
        // ignore polling error
      }
    };
    const iv = window.setInterval(() => void poll(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(iv);
    };
  }, [open, onConnected]);

  if (!open) return null;

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/55 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[28px] p-5 sm:p-6 liquid-ai-sheet shadow-2xl space-y-4 text-main relative pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={isFa ? 'بستن' : 'Close'}
          className="absolute top-4 end-4 w-8 h-8 rounded-full surface-soft border hairline flex items-center justify-center text-dim hover:text-main transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pe-8">
          <div className="w-11 h-11 rounded-2xl dz-logo-pill flex items-center justify-center shrink-0">
            <WalletLogo wallet="trustwallet" size={26} />
          </div>
          <div>
            <h3 className="font-display font-black text-base sm:text-lg text-main">
              {isFa ? 'اتصال مستقیم به Trust Wallet' : 'Direct Trust Wallet Connect'}
            </h3>
            <p className="text-[11px] text-dim">
              {isFa
                ? 'اتصال یکجای همه آدرس‌ها (EVM · Solana · TON · TRON)'
                : 'Connect all chain addresses (EVM · Solana · TON · TRON)'}
            </p>
          </div>
        </div>

        {syncedNotice ? (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-bold text-jade flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>
              {isFa
                ? 'کیف‌پول Trust Wallet متصل شد! در حال انتقال به صفحه کیف‌پول...'
                : 'Trust Wallet connected! Redirecting to your Wallet hub...'}
            </span>
          </div>
        ) : (
          <>
            <div className="p-3.5 rounded-2xl surface-soft border hairline text-xs leading-relaxed text-dim space-y-1.5">
              {mobileLaunched ? (
                <p className="text-main font-bold flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#00C8FF] shrink-0" />
                  <span>
                    {isFa
                      ? 'اپ Trust Wallet در حال باز شدن است؛ داخل Trust Wallet اتصال را تایید کنید تا خودکار به صفحه ولت منتقل شوید.'
                      : 'Opening Trust Wallet app — confirm connection inside Trust Wallet to sync automatically.'}
                  </span>
                </p>
              ) : (
                <p>
                  {isFa
                    ? 'افزونه مرورگر Trust Wallet در این صفحه فعال نیست. با اسکن QR کد زیر با اپ Trust Wallet موبایل (یا زدن دکمه باز کردن اپ)، همه آدرس‌های شما خودکار متصل و وارد صفحه ولت می‌شوید.'
                    : 'No browser wallet extension detected here. Scan this QR code with Trust Wallet mobile (or open the app directly) to auto-connect all addresses.'}
                </p>
              )}
              {errorText && <p className="text-[11px] font-bold text-amber-500">{errorText}</p>}
            </div>

            {qrDataUrl && (
              <div className="flex flex-col items-center gap-2 py-1">
                <div className="p-3 rounded-2xl bg-white shadow-lg border border-blue-200/60">
                  <img src={qrDataUrl} alt="Trust Wallet Direct QR" className="w-44 h-44 block rounded-lg" />
                </div>
                <span className="text-[11px] font-bold text-dim inline-flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-[#1652F0]" />
                  {isFa
                    ? 'اسکن با دوربین یا بخش Wallet در اپلیکیشن Trust Wallet'
                    : 'Scan with Trust Wallet mobile app to auto-login & connect'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              {handoff && (
                <button
                  type="button"
                  onClick={() => launchTrustWalletUrl(handoff.universalLink, handoff.deepLink)}
                  className="btn-cobalt w-full py-3 rounded-2xl text-xs font-black inline-flex items-center justify-center gap-2 shadow-md"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{isFa ? 'باز کردن مستقیم در اپلیکیشن Trust Wallet' : 'Open Directly in Trust Wallet App'}</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void onRetryInjected()}
                  disabled={busyRetry}
                  className="btn-emerald py-2.5 px-3 rounded-2xl text-[11px] font-black inline-flex items-center justify-center gap-1.5"
                >
                  {busyRetry ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{isFa ? 'اتصال افزونه مرورگر' : 'Retry Browser Wallet'}</span>
                </button>
                <a
                  href="https://trustwallet.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="surface-soft border hairline hover:opacity-90 py-2.5 px-3 rounded-2xl text-[11px] font-black inline-flex items-center justify-center gap-1.5 text-main"
                >
                  <Download className="w-3.5 h-3.5 text-[#1652F0]" />
                  <span>{isFa ? 'نصب Trust Wallet' : 'Get Trust Wallet'}</span>
                </a>
              </div>

              <button
                type="button"
                onClick={onGoToWalletPage}
                className="w-full py-2.5 rounded-2xl surface-soft border hairline text-[11px] font-bold text-dim hover:text-main inline-flex items-center justify-center gap-1.5 transition"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>{isFa ? 'رفتن به صفحه کیف‌پول (وارد کردن دستی یا مدیریت)' : 'Go to Wallet Page'}</span>
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-dim pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-jade" />
              <span>
                {isFa
                  ? 'اتصال کاملاً غیرحضانتی · بدون دسترسی برداشت · همگام‌سازی خودکار زنده'
                  : '100% Non-custodial · Zero withdraw access · Live sync enabled'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
