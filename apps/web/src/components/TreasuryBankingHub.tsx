import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Printer,
  Radar,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { ChainLogo, WalletLogo } from './BrandLogos';
import { ProDropdown } from './ProDropdown';
import { apiFetch } from '../lib/api';
import { formatTomanEq, getLiveUsdtIrt } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import {
  buildTreasuryTrustWalletDeepLink,
  launchTrustWalletUrl,
  sendTreasuryPaymentViaTrustWallet,
} from '../lib/trustwallet';

export interface TreasuryNetworkSpec {
  network: 'BEP20' | 'TRC20' | 'ERC20' | 'BASE' | 'ARBITRUM' | 'SOLANA' | 'TON';
  labelFa: string;
  labelEn: string;
  assets: string[];
  minDepositUsd: number;
  autoVerifySupported: boolean;
  address: string | null;
  noteFa: string;
}

export interface BankingInvoiceItem {
  invoiceNo: string;
  id: string;
  kind: 'DEPOSIT' | 'FEE_SETTLEMENT' | 'CREDIT_TOPUP';
  titleFa: string;
  titleEn: string;
  network: string;
  asset: string;
  amountUsd: number;
  senderAddress: string | null;
  receiverAddress: string | null;
  txHash: string;
  explorerUrl: string | null;
  status: 'CONFIRMED' | 'PENDING_VERIFY' | 'REJECTED';
  verifiedOnchain: boolean;
  settledDebtUsd: number;
  addedCreditUsd: number;
  note: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

interface TreasuryOptionsResponse {
  ok: boolean;
  minDepositUsd: number;
  networks: TreasuryNetworkSpec[];
  deposits: Array<{
    id: string;
    category: string;
    asset: string;
    network: string;
    amount_usd: number;
    tx_hash: string;
    status: string;
    created_at: string;
  }>;
  invoices?: BankingInvoiceItem[];
}

function networkToChainSlug(network: string): string {
  const n = network.toUpperCase();
  if (n === 'BEP20') return 'bsc';
  if (n === 'TRC20') return 'tron';
  if (n === 'ERC20') return 'ethereum';
  if (n === 'BASE') return 'base';
  if (n === 'ARBITRUM') return 'arbitrum';
  if (n === 'SOLANA') return 'solana';
  if (n === 'TON') return 'ton';
  return 'bsc';
}

export function BankingInvoiceModal({
  invoice,
  lang,
  iranRate,
  onClose,
}: {
  invoice: BankingInvoiceItem;
  lang: Lang;
  iranRate: number;
  onClose: () => void;
}) {
  const isFa = lang === 'fa';
  const statusColor =
    invoice.status === 'CONFIRMED'
      ? 'bg-emerald-500/15 text-jade border-emerald-500/35'
      : invoice.status === 'REJECTED'
        ? 'bg-rose-500/15 text-loss border-rose-500/35'
        : 'bg-amber-500/15 text-amber-400 border-amber-500/35';

  const statusText =
    invoice.status === 'CONFIRMED'
      ? isFa
        ? 'تایید و تسویه آن‌چین شده'
        : 'Confirmed On-Chain'
      : invoice.status === 'REJECTED'
        ? isFa
          ? 'رد شده'
          : 'Rejected'
        : isFa
          ? 'در انتظار تایید نهایی ⏳'
          : 'Pending Verification ⏳';

  const handleDownloadHtmlReceipt = () => {
    const html = `<!doctype html>
<html lang="${isFa ? 'fa' : 'en'}" dir="${isFa ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8" /><title>${invoice.invoiceNo} - Dollarino Invoice</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background:#f8fafc; color:#0f172a; padding:32px; }
  .card { max-width:640px; margin:0 auto; background:#fff; border:1px solid #cbd5e1; border-radius:20px; padding:28px; box-shadow:0 12px 32px rgba(15,23,42,.08); }
  .head { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:16px; margin-bottom:20px; }
  .badge { padding:6px 12px; border-radius:999px; font-weight:700; font-size:12px; background:${invoice.status === 'CONFIRMED' ? '#dcfce7;color:#15803d' : '#fef3c7;color:#b45309'}; }
  .row { display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px dashed #e2e8f0; font-size:13px; }
  .mono { font-family: ui-monospace, monospace; word-break: break-all; direction:ltr; text-align:left; }
</style></head>
<body><div class="card">
  <div class="head">
    <div><h2 style="margin:0">DOLLARINO BANKING RECEIPT</h2><div style="font-size:12px;color:#64748b">${isFa ? invoice.titleFa : invoice.titleEn}</div></div>
    <span class="badge">${statusText}</span>
  </div>
  <div class="row"><span>${isFa ? 'شماره فاکتور' : 'Invoice No'}</span><strong class="mono">${invoice.invoiceNo}</strong></div>
  <div class="row"><span>${isFa ? 'مبلغ تراکنش' : 'Amount'}</span><strong class="mono">$${invoice.amountUsd.toFixed(2)} ${invoice.asset}</strong></div>
  <div class="row"><span>${isFa ? 'معادل تومانی' : 'Toman Eq'}</span><strong>${formatTomanEq(invoice.amountUsd, iranRate)} تومان</strong></div>
  <div class="row"><span>${isFa ? 'شبکه بلاکچین' : 'Network'}</span><strong class="mono">${invoice.network}</strong></div>
  <div class="row"><span>${isFa ? 'تاریخ ثبت' : 'Created At'}</span><strong class="mono">${invoice.createdAt}</strong></div>
  ${invoice.senderAddress ? `<div class="row"><span>${isFa ? 'فرستنده' : 'From'}</span><strong class="mono">${invoice.senderAddress}</strong></div>` : ''}
  ${invoice.receiverAddress ? `<div class="row"><span>${isFa ? 'کیف‌پول کارمزد ۳٪ دلارینو' : 'Dollarino 3% Fee Receiver'}</span><strong class="mono">${invoice.receiverAddress}</strong></div>` : ''}
  <div class="row"><span>TX Hash</span><strong class="mono">${invoice.txHash}</strong></div>
  ${invoice.settledDebtUsd > 0 ? `<div class="row"><span>${isFa ? 'بدهی تسویه‌شده' : 'Debt Settled'}</span><strong class="mono">$${invoice.settledDebtUsd.toFixed(2)}</strong></div>` : ''}
  ${invoice.addedCreditUsd > 0 ? `<div class="row"><span>${isFa ? 'اعتبار اضافه‌شده' : 'Credit Added'}</span><strong class="mono">+$${invoice.addedCreditUsd.toFixed(2)}</strong></div>` : ''}
</div></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNo}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[220] bg-black/75 backdrop-blur-md p-4 grid place-items-center overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="panel rounded-[28px] max-w-lg w-full p-5 sm:p-6 space-y-4 border border-amber-400/35 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b hairline pb-3.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <WalletLogo wallet="trustwallet" size={20} />
              <span className="text-[10px] font-black tracking-[0.16em] uppercase" style={{ color: 'var(--gold)' }}>
                DOLLARINO BANKING INVOICE
              </span>
            </div>
            <h3 className="font-display font-black text-lg text-main">
              {isFa ? invoice.titleFa : invoice.titleEn}
            </h3>
            <p dir="ltr" className="text-xs font-mono text-dim">
              {invoice.invoiceNo}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5 rounded-xl">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="surface-soft rounded-2xl p-4 flex items-center justify-between gap-3 border hairline">
          <div>
            <p className="text-[11px] text-dim">{isFa ? 'مبلغ کل تراکنش' : 'Total Amount'}</p>
            <p dir="ltr" className="font-display font-black text-2xl text-main font-num mt-0.5">
              ${invoice.amountUsd.toFixed(2)} <span className="text-sm text-dim">{invoice.asset}</span>
            </p>
            {isFa && (
              <p className="text-[11px] text-jade font-bold mt-0.5">
                معادل {formatTomanEq(invoice.amountUsd, iranRate)} تومان
              </p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-[11px] font-black border ${statusColor}`}>
            {statusText}
          </span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="surface-soft rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
            <span className="text-dim">{isFa ? 'شبکه پرداخت' : 'Network'}</span>
            <span className="font-black text-main inline-flex items-center gap-1.5">
              <ChainLogo chain={networkToChainSlug(invoice.network)} size={14} />
              <span dir="ltr">{invoice.network}</span>
            </span>
          </div>
          <div className="surface-soft rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
            <span className="text-dim">{isFa ? 'زمان ثبت فاکتور' : 'Issued At'}</span>
            <span dir="ltr" className="font-mono text-main">{invoice.createdAt}</span>
          </div>
          {invoice.confirmedAt && (
            <div className="surface-soft rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
              <span className="text-dim">{isFa ? 'زمان تایید آن‌چین' : 'Confirmed At'}</span>
              <span dir="ltr" className="font-mono text-jade">{invoice.confirmedAt}</span>
            </div>
          )}
          {invoice.settledDebtUsd > 0 && (
            <div className="surface-soft rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
              <span className="text-dim">{isFa ? 'تسویه بدهی کارمزد ۳٪' : '3% Debt Settled'}</span>
              <span dir="ltr" className="font-num font-black text-jade">${invoice.settledDebtUsd.toFixed(2)}</span>
            </div>
          )}
          {invoice.addedCreditUsd > 0 && (
            <div className="surface-soft rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
              <span className="text-dim">{isFa ? 'اعتبار افزوده‌شده به کیف کارمزد' : 'Prepaid Fee Credit Added'}</span>
              <span dir="ltr" className="font-num font-black text-jade">+${invoice.addedCreditUsd.toFixed(2)}</span>
            </div>
          )}
          {invoice.senderAddress && (
            <div className="surface-soft rounded-xl px-3.5 py-2.5 space-y-1">
              <span className="text-dim block">{isFa ? 'کیف‌پول فرستنده' : 'Sender Wallet'}</span>
              <code dir="ltr" className="text-[11px] font-mono text-main break-all block">{invoice.senderAddress}</code>
            </div>
          )}
          {invoice.receiverAddress && (
            <div className="surface-soft rounded-xl px-3.5 py-2.5 space-y-1">
              <span className="text-dim block">{isFa ? 'کیف‌پول دریافت کارمزد ۳٪ دلارینو' : 'Dollarino 3% Fee Receiver'}</span>
              <code dir="ltr" className="text-[11px] font-mono text-main break-all block">{invoice.receiverAddress}</code>
            </div>
          )}
          <div className="surface-soft rounded-xl px-3.5 py-2.5 space-y-1">
            <span className="text-dim block">TX Hash</span>
            <code dir="ltr" className="text-[11px] font-mono text-main break-all block">{invoice.txHash}</code>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t hairline">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-cobalt flex-1 py-2.5 px-3 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>{isFa ? 'چاپ / PDF' : 'Print / PDF'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadHtmlReceipt}
            className="btn-gold flex-1 py-2.5 px-3 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{isFa ? 'دانلود رسید رسمی' : 'Download Receipt'}</span>
          </button>
          {invoice.explorerUrl && (
            <a
              href={invoice.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost py-2.5 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isFa ? 'اکسپلورر' : 'Explorer'}</span>
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function TreasuryBankingHub({
  lang,
  mode = 'full',
  defaultCategory = 'FEE_SETTLEMENT',
  defaultAmountUsd,
  connectedEvmAddress,
  connectedSolanaAddress,
  connectedTonAddress,
  connectedTronAddress,
  onOpenWalletTab,
  onSyncWallet,
  onAfterSuccess,
}: {
  lang: Lang;
  mode?: 'full' | 'fees';
  defaultCategory?: 'DEPOSIT' | 'FEE_SETTLEMENT' | 'CREDIT_TOPUP';
  defaultAmountUsd?: number;
  connectedEvmAddress?: string | null;
  connectedSolanaAddress?: string | null;
  connectedTonAddress?: string | null;
  connectedTronAddress?: string | null;
  onOpenWalletTab?: () => void;
  onSyncWallet?: () => Promise<void> | void;
  onAfterSuccess?: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [opts, setOpts] = useState<TreasuryOptionsResponse | null>(null);
  const [invoices, setInvoices] = useState<BankingInvoiceItem[]>([]);
  const [category, setCategory] = useState<'FEE_SETTLEMENT' | 'CREDIT_TOPUP'>(() =>
    defaultCategory === 'CREDIT_TOPUP' || (!defaultAmountUsd && defaultCategory !== 'FEE_SETTLEMENT')
      ? 'CREDIT_TOPUP'
      : 'FEE_SETTLEMENT'
  );
  const [network, setNetwork] = useState<TreasuryNetworkSpec['network']>('BEP20');
  const [asset, setAsset] = useState('USDT');
  const [amountStr, setAmountStr] = useState(() =>
    defaultAmountUsd && defaultAmountUsd > 0 ? String(Number(defaultAmountUsd.toFixed(2))) : '10'
  );
  const [manualTxHash, setManualTxHash] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoWaitLink, setAutoWaitLink] = useState<{ sendDeepLink: string; openInTrustDappUrl: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<BankingInvoiceItem | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<'ALL' | 'DEPOSIT' | 'FEE_SETTLEMENT' | 'CREDIT_TOPUP'>('ALL');
  const [budgetInfo, setBudgetInfo] = useState<{
    mode: 'FULL_BALANCE' | 'FIXED_USD' | 'PERCENT_OF_BALANCE';
    value: number;
    effectiveCapUsd: number;
    walletUsd: number;
  } | null>(null);
  const [budgetBusy, setBudgetBusy] = useState(false);
  const iranRate = getLiveUsdtIrt();

  const loadData = useCallback(async () => {
    try {
      const [optRes, invRes, dashRes] = await Promise.all([
        apiFetch<TreasuryOptionsResponse>('/api/subscriptions/treasury/options'),
        apiFetch<{ ok: boolean; invoices: BankingInvoiceItem[] }>('/api/subscriptions/invoices').catch(() => ({
          ok: true,
          invoices: [],
        })),
        mode === 'full'
          ? apiFetch<{
              config?: { bot_capital_mode?: string; bot_capital_value?: number };
              capitalBudget?: { mode?: string; value?: number; effectiveCapitalUsd?: number; walletTotalUsd?: number };
              balance?: { totalEquity?: number };
            }>('/api/trading/dashboard?lite=1').catch(() => null)
          : Promise.resolve(null),
      ]);
      setOpts(optRes);
      setInvoices(invRes.invoices || optRes.invoices || []);
      if (dashRes) {
        const bMode = (dashRes.capitalBudget?.mode || dashRes.config?.bot_capital_mode || 'FULL_BALANCE') as
          | 'FULL_BALANCE'
          | 'FIXED_USD'
          | 'PERCENT_OF_BALANCE';
        const bVal = Number(dashRes.capitalBudget?.value ?? dashRes.config?.bot_capital_value ?? 100);
        const wTot = Number(dashRes.capitalBudget?.walletTotalUsd ?? dashRes.balance?.totalEquity ?? 0);
        const eff = Number(dashRes.capitalBudget?.effectiveCapitalUsd ?? wTot);
        setBudgetInfo({ mode: bMode, value: bVal, effectiveCapUsd: eff, walletUsd: wTot });
      }
    } catch {
      // ignore initial error
    }
  }, [mode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (defaultAmountUsd && defaultAmountUsd > 0 && category === 'FEE_SETTLEMENT') {
      setAmountStr(String(Number(defaultAmountUsd.toFixed(2))));
    }
  }, [defaultAmountUsd, category]);

  const selectedSpec =
    opts?.networks.find((n) => n.network === network) ||
    ({
      network,
      labelFa: network,
      labelEn: network,
      assets: ['USDT', 'USDC'],
      minDepositUsd: 10,
      autoVerifySupported: true,
      address: null,
      noteFa: '',
    } as TreasuryNetworkSpec);

  const amountNum = Math.max(0, Number(amountStr || 0));

  const copyAddr = async (txt: string, key: string) => {
    await navigator.clipboard?.writeText(txt).catch(() => {});
    setCopiedKey(key);
    pushFloatingToast(isFa ? 'آدرس کپی شد' : 'Address copied', 'info', 2200);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const saveWalletBudgetCap = async (
    nextMode: 'FULL_BALANCE' | 'FIXED_USD' | 'PERCENT_OF_BALANCE',
    nextVal: number
  ) => {
    setBudgetBusy(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({ bot_capital_mode: nextMode, bot_capital_value: nextVal }),
      });
      pushFloatingToast(
        isFa ? 'سقف سرمایه مجاز روی Trust Wallet شخصی شما ذخیره شد!' : 'Trust Wallet bot cap updated!',
        'success'
      );
      await Promise.all([loadData(), onAfterSuccess?.()]);
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Budget save failed', 'error');
    } finally {
      setBudgetBusy(false);
    }
  };

  const recordSubmittedHash = async (txHash: string, senderAddress?: string) => {
    if (category === 'FEE_SETTLEMENT') {
      const r = await apiFetch<{ ok: boolean; status: string; invoice?: BankingInvoiceItem }>('/api/subscriptions/server-fees/settle', {
        method: 'POST',
        body: JSON.stringify({ txHash, network, asset, senderAddress, amountUsd: amountNum }),
      });
      if (r.invoice) setActiveInvoice(r.invoice);
      pushFloatingToast(
        r.status === 'SETTLED_ONCHAIN'
          ? isFa
            ? 'پرداخت شما آن‌چین تایید و تسویه کارمزد با موفقیت انجام شد!'
            : 'Payment verified on-chain & fee settled!'
          : isFa
            ? 'پرداخت ثبت شد و فاکتور صادر گردید.'
            : 'Settlement submitted & invoice issued.',
        'success'
      );
    } else {
      const r = await apiFetch<{ ok: boolean; status: string; autoConfirmed?: boolean; invoice?: BankingInvoiceItem }>(
        '/api/subscriptions/server-fees/prepay',
        {
          method: 'POST',
          body: JSON.stringify({ amountUsd: amountNum, txHash, network, asset, senderAddress }),
        }
      );
      if (r.invoice) setActiveInvoice(r.invoice);
      pushFloatingToast(
        r.autoConfirmed
          ? isFa
            ? `مبلغ $${amountNum.toFixed(2)} با موفقیت به اعتبار کارمزد ۳٪ اضافه و فاکتور صادر شد!`
            : `$${amountNum.toFixed(2)} prepaid 3% fee credit confirmed!`
          : isFa
            ? 'شارژ اعتبار کارمزد ۳٪ ثبت شد و در انتظار تایید آن‌چین است.'
            : '3% fee credit top-up submitted for verification.',
        'success'
      );
    }
    setManualTxHash('');
    setAutoWaitLink(null);
    await Promise.all([loadData(), onAfterSuccess?.()]);
  };

  const handlePayDirectWithTrustWallet = async () => {
    if (!selectedSpec.address) {
      pushFloatingToast(
        isFa ? `آدرس دریافت کارمزد برای شبکه ${network} هنوز توسط مدیر ثبت نشده است.` : `Fee receiver address for ${network} not set yet.`,
        'error'
      );
      return;
    }
    if (amountNum < (category === 'FEE_SETTLEMENT' ? 1 : 10)) {
      pushFloatingToast(
        isFa
          ? `حداقل مبلغ برای این عملیات ${category === 'FEE_SETTLEMENT' ? '۱' : '۱۰'} دلار است.`
          : `Minimum amount is $${category === 'FEE_SETTLEMENT' ? 1 : 10}.`,
        'error'
      );
      return;
    }

    setBusy(true);
    try {
      const res = await sendTreasuryPaymentViaTrustWallet({
        network,
        asset,
        receiverAddress: selectedSpec.address,
        amountUsd: amountNum,
      });

      if (res.mode === 'ONCHAIN_TX') {
        pushFloatingToast(
          isFa ? 'تراکنش ارسال شد! در حال تایید آن‌چین و صدور فاکتور...' : 'Transaction sent! Verifying on-chain...',
          'info',
          4000
        );
        await recordSubmittedHash(res.txHash, res.senderAddress);
      } else {
        setAutoWaitLink({ sendDeepLink: res.sendDeepLink, openInTrustDappUrl: res.openInTrustDappUrl });
        launchTrustWalletUrl(res.sendDeepLink, res.sendDeepLink);
        pushFloatingToast(
          isFa
            ? 'صفحه ارسال Trust Wallet با آدرس و مبلغ آماده باز شد. پس از تایید ارسال، روی «کشف خودکار تراکنش» بزنید.'
            : 'Trust Wallet send opened with pre-filled receiver & amount. Tap Auto-Verify once confirmed.',
          'info',
          6500
        );
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'USER_REJECTED' || /reject|denied|cancel/i.test(code)) {
        pushFloatingToast(isFa ? 'پرداخت در Trust Wallet لغو شد.' : 'Payment cancelled in Trust Wallet.', 'error');
      } else {
        const links = buildTreasuryTrustWalletDeepLink({
          network,
          asset,
          receiverAddress: selectedSpec.address,
          amount: amountNum,
        });
        setAutoWaitLink(links);
        pushFloatingToast(
          isFa
            ? 'درخواست مستقیم مرورگر ارسال نشد؛ از لینک مستقیم اپ Trust Wallet یا دکمه کشف خودکار زیر استفاده کنید.'
            : 'Use the Trust Wallet App deep link or Auto-Verify below.',
          'info'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAutoDetectTransfer = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        found?: boolean;
        error?: string;
        invoice?: BankingInvoiceItem;
        txHash?: string;
        amountUsd?: number;
      }>('/api/subscriptions/treasury/verify-auto', {
        method: 'POST',
        body: JSON.stringify({
          network,
          asset,
          minAmountUsd: Math.max(0.05, amountNum * 0.9),
          category,
        }),
      });
      if (res.invoice) setActiveInvoice(res.invoice);
      pushFloatingToast(
        isFa
          ? `تراکنش به مبلغ $${Number(res.amountUsd || amountNum).toFixed(2)} کشف و تایید شد و فاکتور صادر گردید!`
          : `Transfer ($${Number(res.amountUsd || amountNum).toFixed(2)}) detected & confirmed!`,
        'success'
      );
      setAutoWaitLink(null);
      await Promise.all([loadData(), onAfterSuccess?.()]);
    } catch (e) {
      pushFloatingToast(
        e instanceof Error
          ? e.message
          : isFa
            ? 'تراکنش جدیدی هنوز در بلاک‌های اخیر دیده نشد. چند ثانیه صبر کرده و دوباره بزنید.'
            : 'No recent transfer detected yet.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleManualSubmit = async () => {
    const tx = manualTxHash.trim();
    if (!tx || tx.length < 16) {
      pushFloatingToast(isFa ? 'لطفاً هش معتبر تراکنش (TX Hash) را وارد کنید.' : 'Enter a valid TX Hash.', 'error');
      return;
    }
    setBusy(true);
    try {
      await recordSubmittedHash(tx, connectedEvmAddress || undefined);
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Submit failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const visibleInvoices = invoices.filter((inv) => invoiceFilter === 'ALL' || inv.kind === invoiceFilter);
  const connectedCount = [connectedEvmAddress, connectedSolanaAddress, connectedTonAddress, connectedTronAddress].filter(
    Boolean
  ).length;
  const networkOptions = opts?.networks || [
    { network: 'BEP20' as const, labelFa: 'BSC (BEP20) — آن‌چین خودکار', labelEn: 'BSC (BEP20)', assets: ['USDT', 'USDC', 'BNB'] },
    { network: 'BASE' as const, labelFa: 'Base — آن‌چین خودکار (کارمزد ناچیز)', labelEn: 'Base', assets: ['USDC', 'ETH'] },
    { network: 'ARBITRUM' as const, labelFa: 'Arbitrum One — آن‌چین خودکار', labelEn: 'Arbitrum', assets: ['USDT', 'USDC', 'ETH'] },
    { network: 'TRC20' as const, labelFa: 'TRON (TRC20)', labelEn: 'TRON (TRC20)', assets: ['USDT', 'TRX'] },
    { network: 'ERC20' as const, labelFa: 'Ethereum (ERC20)', labelEn: 'Ethereum', assets: ['USDT', 'USDC', 'ETH'] },
    { network: 'SOLANA' as const, labelFa: 'Solana', labelEn: 'Solana', assets: ['SOL', 'USDC'] },
    { network: 'TON' as const, labelFa: 'TON Network', labelEn: 'TON', assets: ['TON', 'USDT'] },
  ];

  return (
    <div className="space-y-5">
      {/* 100% Non-Custodial Trust Wallet Personal Capital & Budget Control (Full Mode) */}
      {mode === 'full' && (
        <div className="panel rounded-[28px] p-5 sm:p-6 border border-[#0D9455]/35 bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-sky-500/[0.05] space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-[11px] font-black">
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {isFa
                    ? '۱۰۰٪ غیرامانی · بدون نیاز به واریز سرمایه به حساب سایت'
                    : '100% Non-Custodial · Zero Capital Deposits to Platform'}
                </span>
              </div>
              <h3 className="font-display font-black text-lg sm:text-xl text-main flex items-center gap-2">
                <WalletLogo wallet="trustwallet" size={22} />
                <span>
                  {isFa
                    ? 'خزانه شخصی شما = همان کیف‌پول Trust Wallet خودتان'
                    : 'Your Personal Treasury = Your Connected Trust Wallet'}
                </span>
              </h3>
              <p className="text-xs text-sub leading-relaxed">
                {isFa
                  ? 'در دلارینو هیچ‌وقت پول یا سرمایه معاملاتی خود را به حساب ما واریز نمی‌کنید! کل موجودی داخل کیف‌پول Trust Wallet شخصی خودتان باقی می‌ماند، معامله مستقیماً با ولت خودتان انجام می‌شود و فقط در پایان از سود واقعی، ۳٪ کارمزد با همین کیف‌پول تسویه می‌گردد.'
                  : 'Never deposit trading capital into a Dollarino custodial account. Your funds remain 100% inside your connected Trust Wallet, and you control exactly how much of your own wallet balance the bot is allowed to trade with.'}
              </p>
            </div>

            <div className="surface-soft rounded-2xl px-4 py-3 border hairline text-center shrink-0 space-y-0.5">
              <span className="text-[10px] font-bold text-dim block">
                {isFa ? 'موجودی Trust Wallet شما' : 'Your Trust Wallet Equity'}
              </span>
              <strong dir="ltr" className="font-num text-xl font-black text-main block">
                ${(budgetInfo?.walletUsd ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </strong>
              <span className="text-[10px] text-[#059669] dark:text-[#34D399] font-bold block">
                {connectedCount > 0
                  ? isFa
                    ? `${connectedCount} شبکه متصل`
                    : `${connectedCount} chains linked`
                  : isFa
                    ? 'ولت متصل نشده'
                    : 'Not linked yet'}
              </span>
            </div>
          </div>

          {/* Connected Personal Trust Wallet Addresses Strip */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {[
              { key: 'EVM', label: 'BSC / Base / Arbitrum / ETH', addr: connectedEvmAddress },
              { key: 'Solana', label: 'Solana (SPL)', addr: connectedSolanaAddress },
              { key: 'TON', label: 'TON Network', addr: connectedTonAddress },
              { key: 'TRON', label: 'TRON (TRC20)', addr: connectedTronAddress },
            ].map((c) => (
              <div key={c.key} className="surface-soft rounded-2xl p-3 border hairline space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-black text-main">{c.key}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                      c.addr ? 'bg-emerald-500/15 text-[#059669] dark:text-[#34D399]' : 'bg-amber-500/15 text-amber-500'
                    }`}
                  >
                    {c.addr ? (isFa ? 'متصل' : 'Linked') : isFa ? 'نیازمند اتصال' : 'Unlinked'}
                  </span>
                </div>
                <p className="text-[10px] text-dim truncate">{c.label}</p>
                <code dir="ltr" className="text-[10px] font-mono text-sub block truncate">
                  {c.addr || (isFa ? 'آدرس Trust Wallet خود را وصل کنید' : 'Connect Trust Wallet')}
                </code>
              </div>
            ))}
          </div>

          {/* Direct Cap Control on User's Own Trust Wallet */}
          <div className="surface-soft rounded-2xl p-4 border hairline space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-main">
                  {isFa
                    ? 'سقف سرمایه مجاز ربات روی همین Trust Wallet خودتان'
                    : 'Bot Capital Cap on Your Own Trust Wallet'}
                </p>
                <p className="text-[11px] text-dim">
                  {isFa
                    ? `سقف فعلی مجاز برای ربات: $${(budgetInfo?.effectiveCapUsd ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} — بدون جابجایی حتی ۱ سنت از کیف‌پولتان.`
                    : `Effective bot cap: $${(budgetInfo?.effectiveCapUsd ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} directly inside your Trust Wallet.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onSyncWallet && (
                  <button
                    type="button"
                    disabled={budgetBusy}
                    onClick={() => void onSyncWallet()}
                    className="btn-emerald px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>{connectedCount > 0 ? (isFa ? 'همگام‌سازی موجودی ولت' : 'Sync Wallet') : isFa ? 'اتصال Trust Wallet' : 'Connect Trust Wallet'}</span>
                  </button>
                )}
                {onOpenWalletTab && (
                  <button
                    type="button"
                    onClick={onOpenWalletTab}
                    className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-black"
                  >
                    {isFa ? 'مدیریت کامل آدرس‌ها ↗' : 'Manage Addresses ↗'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <button
                type="button"
                disabled={budgetBusy}
                onClick={() => void saveWalletBudgetCap('FULL_BALANCE', 100)}
                className={`px-3 py-1.5 rounded-xl font-black transition ${
                  budgetInfo?.mode === 'FULL_BALANCE' ? 'btn-cobalt' : 'panel border hairline text-dim hover:text-main'
                }`}
              >
                {isFa ? 'کل موجودی Trust Wallet' : 'Full Wallet Balance'}
              </button>
              {[50, 100, 250, 500, 1000].map((usd) => (
                <button
                  key={usd}
                  type="button"
                  disabled={budgetBusy}
                  onClick={() => void saveWalletBudgetCap('FIXED_USD', usd)}
                  className={`px-2.5 py-1.5 rounded-xl font-num font-black transition ${
                    budgetInfo?.mode === 'FIXED_USD' && Math.abs((budgetInfo?.value ?? 0) - usd) < 0.5
                      ? 'btn-cobalt'
                      : 'panel border hairline text-dim hover:text-main'
                  }`}
                >
                  ${usd}
                </button>
              ))}
              {[25, 50, 75].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  disabled={budgetBusy}
                  onClick={() => void saveWalletBudgetCap('PERCENT_OF_BALANCE', pct)}
                  className={`px-2.5 py-1.5 rounded-xl font-num font-black transition ${
                    budgetInfo?.mode === 'PERCENT_OF_BALANCE' && Math.abs((budgetInfo?.value ?? 0) - pct) < 0.5
                      ? 'btn-cobalt'
                      : 'panel border hairline text-dim hover:text-main'
                  }`}
                >
                  {pct}% {isFa ? 'ولت' : 'Wallet'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3% Profit-Share Fee Settlement & Optional Prepaid Credit Card */}
      <div className="panel rounded-[28px] p-5 sm:p-6 border border-emerald-500/25 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-jade text-[11px] font-black">
              <WalletLogo wallet="trustwallet" size={16} />
              <span>{isFa ? 'تسویه غیرحضانتی کارمزد ۳٪ سود با Trust Wallet · صدور آنی فاکتور' : 'Non-Custodial 3% Profit Fee via Trust Wallet'}</span>
            </div>
            <h3 className="font-display font-black text-lg sm:text-xl text-main">
              {isFa
                ? 'پرداخت کارمزد ۳٪ سودهای واقعی یا شارژ اعتبار کارمزد (اختیاری)'
                : '3% Real Profit Fee Settlement & Optional Prepaid Fee Credit'}
            </h3>
            <p className="text-xs text-dim leading-relaxed max-w-2xl">
              {isFa
                ? '۳ معامله سودده اول ۱۰۰٪ رایگان است. پس از آن فقط برای تسویه کارمزد ۳٪ سودهای واقعی (یا شارژ اختیاری کیف کارمزد بدون وقفه)، مستقیم با Trust Wallet خودتان پرداخت کنید و فاکتور رسمی آن‌چین بگیرید.'
                : 'Your first 3 profitable trades are 100% free. Afterwards, use Trust Wallet here solely to settle your 3% profit-share fee or optionally top up prepaid fee credit.'}
            </p>
          </div>
          <div className="surface-soft rounded-2xl px-3.5 py-2 border hairline text-center shrink-0">
            <span className="text-[10px] text-dim block">{isFa ? 'تتر ایران (زنده)' : 'Live USDT/IRT'}</span>
            <strong dir="ltr" className="font-num text-sm font-black text-jade">
              {iranRate.toLocaleString('en-US')} ت
            </strong>
          </div>
        </div>

        {/* Category Picker — Strictly 3% Profit Fee Settlement or Optional Prepaid Fee Credit (NO capital deposit!) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            {
              id: 'FEE_SETTLEMENT' as const,
              fa: 'تسویه بدهی کارمزد ۳٪ سود واقعی',
              en: 'Settle 3% Profit Fee Debt',
              subFa: 'پرداخت مستقیم با Trust Wallet فقط برای کارمزد سودهای ثبت‌شده',
            },
            {
              id: 'CREDIT_TOPUP' as const,
              fa: 'شارژ اختیاری اعتبار کارمزد ۳٪',
              en: 'Optional Prepaid 3% Fee Credit',
              subFa: 'کسر خودکار کارمزد ۳٪ سودهای آینده از اعتبار کارمزد (نه سرمایه)',
            },
          ].map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`p-3.5 rounded-2xl border text-start transition ${
                  active
                    ? 'border-emerald-500/60 bg-emerald-500/12 shadow-sm'
                    : 'surface-soft hairline hover:border-brand/40'
                }`}
              >
                <div className="font-black text-xs text-main">{isFa ? cat.fa : cat.en}</div>
                <div className="text-[10.5px] text-dim mt-0.5">{cat.subFa}</div>
              </button>
            );
          })}
        </div>

        {/* Network + Asset + Amount Controls */}
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-[11px] font-bold text-dim block mb-1.5">{isFa ? '۱. انتخاب شبکه بلاکچین' : '1. Network'}</label>
            <ProDropdown
              value={network}
              onChange={(nextNet) => {
                const castNet = nextNet as TreasuryNetworkSpec['network'];
                setNetwork(castNet);
                const spec = networkOptions.find((n) => n.network === castNet);
                if (spec?.assets?.length) setAsset(spec.assets[0]!);
              }}
              options={networkOptions.map((n) => ({
                value: n.network,
                label: isFa ? n.labelFa : n.labelEn,
              }))}
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-dim block mb-1.5">{isFa ? '۲. انتخاب ارز' : '2. Asset'}</label>
            <ProDropdown
              value={asset}
              onChange={(nextAsset) => setAsset(nextAsset)}
              options={(selectedSpec.assets || ['USDT']).map((a) => ({
                value: a,
                label: a,
              }))}
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-dim block mb-1.5">
              {isFa
                ? `۳. مبلغ دلاری (${category === 'FEE_SETTLEMENT' ? 'حداقل ۰.۰۵$' : 'حداقل ۱۰$'})`
                : `3. Amount ($${category === 'FEE_SETTLEMENT' ? ' min 0.05' : ' min 10'})`}
            </label>
            <input
              type="number"
              min={category === 'FEE_SETTLEMENT' ? 0.05 : 10}
              step="0.05"
              dir="ltr"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="field py-2.5 px-3 font-num font-black"
            />
          </div>
        </div>

        {/* Preset Quick Amount Chips + Toman Equivalent + Debt/Credit Split Preview */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-dim">{isFa ? 'مبالغ سریع:' : 'Quick:'}</span>
              {defaultAmountUsd && defaultAmountUsd > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCategory('FEE_SETTLEMENT');
                    setAmountStr(String(Number(defaultAmountUsd.toFixed(2))));
                  }}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-num font-black transition ${
                    Math.abs(amountNum - defaultAmountUsd) < 0.02 ? 'btn-emerald' : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                  }`}
                >
                  {isFa ? `دقیق بدهی ($${defaultAmountUsd.toFixed(2)})` : `Exact Due ($${defaultAmountUsd.toFixed(2)})`}
                </button>
              )}
              {[10, 25, 50, 100, 250].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmountStr(String(v))}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-num font-black transition ${
                    Number(amountStr) === v ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
                  }`}
                >
                  ${v}
                </button>
              ))}
            </div>
            {amountNum > 0 && isFa && (
              <span className="text-[11px] font-bold text-jade">
                معادل تقریبی: {formatTomanEq(amountNum, iranRate)} تومان
              </span>
            )}
          </div>

          {defaultAmountUsd && defaultAmountUsd > 0 && amountNum > 0 && (
            <div className="rounded-xl px-3 py-2 bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-jade font-bold flex items-start gap-1.5">
              <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {amountNum > defaultAmountUsd + 0.01
                  ? isFa
                    ? `با پرداخت $${amountNum.toFixed(2)}: ابتدا $${defaultAmountUsd.toFixed(2)} بدهی کارمزد شما تسویه و قفل حساب باز می‌شود، و مازاد ($${(amountNum - defaultAmountUsd).toFixed(2)}) خودکار به اعتبار پیش‌پرداخت کارمزد ۳٪ اضافه می‌گردد.`
                    : `Paying $${amountNum.toFixed(2)} settles $${defaultAmountUsd.toFixed(2)} debt first and credits $${(amountNum - defaultAmountUsd).toFixed(2)} to Prepaid 3% Fee Credit.`
                  : isFa
                    ? `کل مبلغ پرداختی ($${amountNum.toFixed(2)}) مستقیماً برای تسویه بدهی کارمزد ۳٪ شما اعمال می‌شود.`
                    : `Full $${amountNum.toFixed(2)} payment applies directly to your 3% fee debt.`}
              </span>
            </div>
          )}
        </div>

        {/* Destination Preview Bar */}
        <div className="surface-soft rounded-2xl p-3.5 border hairline flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-dim">
              <ChainLogo chain={networkToChainSlug(network)} size={14} />
              <span>{isFa ? `آدرس کیف‌پول کارمزد ۳٪ دلارینو (${network}):` : `Dollarino 3% Fee Receiver (${network}):`}</span>
              {selectedSpec.autoVerifySupported && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-jade text-[10px] font-black inline-flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  <span>{isFa ? 'تایید آنی خودکار' : 'Auto-Verify'}</span>
                </span>
              )}
            </div>
            <p dir="ltr" className="font-mono text-main break-all font-bold mt-1">
              {selectedSpec.address || (isFa ? 'هنوز توسط مدیر در پنل ادمین ثبت نشده است.' : 'Not configured in Admin yet.')}
            </p>
          </div>
          {selectedSpec.address && (
            <button
              type="button"
              onClick={() => void copyAddr(selectedSpec.address!, 'rcv')}
              className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1 shrink-0"
            >
              {copiedKey === 'rcv' ? <CheckCircle2 className="w-3.5 h-3.5 text-jade" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'rcv' ? (isFa ? 'کپی شد' : 'Copied') : isFa ? 'کپی آدرس' : 'Copy'}</span>
            </button>
          )}
        </div>

        {/* Primary Banking Action Buttons */}
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy || !selectedSpec.address}
            onClick={() => void handlePayDirectWithTrustWallet()}
            className="btn-gold py-3 px-4 rounded-2xl text-xs font-black inline-flex items-center justify-center gap-2 shadow-lg"
          >
            <CreditCard className="w-4 h-4" />
            <span>
              {busy
                ? isFa
                  ? 'در حال ارتباط با Trust Wallet...'
                  : 'Connecting Trust Wallet...'
                : isFa
                  ? `پرداخت مستقیم $${amountNum.toFixed(2)} با Trust Wallet`
                  : `Pay $${amountNum.toFixed(2)} via Trust Wallet`}
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAutoDetectTransfer()}
            className="btn-emerald py-3 px-4 rounded-2xl text-xs font-black inline-flex items-center justify-center gap-2"
          >
            <Radar className="w-4 h-4" />
            <span>
              {isFa ? 'کشف خودکار تراکنش از کیف‌پول من' : 'Auto-Detect Transfer From My Wallet'}
            </span>
          </button>
        </div>

        {/* Deep-Link Guide Box when Mobile/Non-Injected triggered */}
        {autoWaitLink && (
          <div className="rounded-2xl p-4 bg-blue-500/10 border border-blue-500/35 space-y-2.5 text-xs">
            <p className="font-black text-main flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand" />
              <span>
                {isFa
                  ? 'لینک پرداخت پیش‌پر شده آماده شد — داخل Trust Wallet تایید را بزنید و سپس دکمه «کشف خودکار تراکنش» را کلیک کنید:'
                  : 'Pre-filled Trust Wallet send ready — confirm inside app then click Auto-Detect:'}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={autoWaitLink.sendDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold px-4 py-2 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>{isFa ? 'باز کردن صفحه ارسال Trust Wallet (پر شده)' : 'Open Pre-filled Trust Send'}</span>
              </a>
              <a
                href={autoWaitLink.openInTrustDappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-cobalt px-4 py-2 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{isFa ? 'باز کردن در مرورگر داخلی Trust Wallet' : 'Open inside Trust DApp'}</span>
              </a>
            </div>
          </div>
        )}

        {/* Optional Manual TX Hash Fallback */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowManualInput((v) => !v)}
            className="text-[11px] font-bold text-dim hover:text-main underline"
          >
            {showManualInput
              ? isFa
                ? 'بستن ورود دستی TX Hash'
                : 'Hide manual TX Hash input'
              : isFa
                ? 'از صرافی یا کیف‌پول دیگر واریز کرده‌اید؟ ورود دستی TX Hash'
                : 'Paid from another wallet/exchange? Enter TX Hash manually'}
          </button>

          {showManualInput && (
            <div className="mt-2.5 flex flex-col sm:flex-row gap-2">
              <input
                dir="ltr"
                value={manualTxHash}
                onChange={(e) => setManualTxHash(e.target.value)}
                placeholder={`Paste ${network} TX Hash (0x... / Tron / Sol)...`}
                className="field flex-1 py-2 px-3 text-xs font-mono"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleManualSubmit()}
                className="btn-cobalt px-4 py-2 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isFa ? 'ثبت و صدور فاکتور' : 'Verify & Issue Invoice'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banking Invoice Ledger */}
      <div className="panel rounded-[28px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--gold)]" />
              <span>{isFa ? 'دفترچه فاکتورها و سابقه تراکنش‌های بانکی شما' : 'Your Banking Invoices & Transaction History'}</span>
            </h3>
            <p className="text-[11px] text-dim mt-0.5">
              {isFa
                ? 'تمامی تسویه‌های کارمزد ۳٪ و شارژهای اعتبار کارمزد همراه با فاکتور رسمی قابل چاپ و لینک اکسپلورر.'
                : 'Every 3% fee settlement & prepaid credit transaction with printable official invoices.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL' as const, fa: 'همه', en: 'All' },
              { id: 'FEE_SETTLEMENT' as const, fa: 'تسویه ۳٪', en: '3% Settle' },
              { id: 'CREDIT_TOPUP' as const, fa: 'اعتبار کارمزد', en: 'Fee Credit' },
              { id: 'DEPOSIT' as const, fa: 'سوابق قدیمی', en: 'Legacy' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setInvoiceFilter(f.id)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition ${
                  invoiceFilter === f.id ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
                }`}
              >
                {isFa ? f.fa : f.en}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadData()}
              className="btn-ghost p-1.5 rounded-xl"
              title={isFa ? 'بروزرسانی' : 'Refresh'}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {visibleInvoices.length === 0 ? (
          <div className="surface-soft rounded-2xl p-6 text-center text-xs text-dim">
            {isFa
              ? 'هنوز فاکتور یا تراکنشی ثبت نشده است. اولین تراکنش خود را با فرم بالا انجام دهید.'
              : 'No banking invoices recorded yet.'}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleInvoices.map((inv) => (
              <div
                key={inv.id}
                className="surface-soft rounded-2xl p-3.5 border hairline flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChainLogo chain={networkToChainSlug(inv.network)} size={15} />
                    <strong className="text-main">{isFa ? inv.titleFa : inv.titleEn}</strong>
                    <span dir="ltr" className="px-2 py-0.5 rounded-lg bg-black/15 dark:bg-white/10 font-mono text-[10px] text-dim">
                      {inv.invoiceNo}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                        inv.status === 'CONFIRMED'
                          ? 'bg-emerald-500/15 text-jade'
                          : inv.status === 'REJECTED'
                            ? 'bg-rose-500/15 text-loss'
                            : 'bg-amber-500/15 text-amber-400'
                      }`}
                    >
                      {inv.status === 'CONFIRMED' ? (
                        <ShieldCheck className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      {inv.status === 'CONFIRMED'
                        ? isFa
                          ? 'تایید آن‌چین'
                          : 'Confirmed'
                        : inv.status === 'REJECTED'
                          ? isFa
                            ? 'رد شده'
                            : 'Rejected'
                          : isFa
                            ? 'در انتظار'
                            : 'Pending'}
                    </span>
                  </div>
                  <p dir="ltr" className="text-[11px] text-dim font-mono truncate max-w-md">
                    {inv.network} · TX: {inv.txHash.slice(0, 14)}...{inv.txHash.slice(-6)} · {inv.createdAt}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-end me-1">
                    <div dir="ltr" className="font-num font-black text-sm text-main">
                      ${inv.amountUsd.toFixed(2)} {inv.asset}
                    </div>
                    {isFa && (
                      <div className="text-[10px] text-dim">{formatTomanEq(inv.amountUsd, iranRate)} ت</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveInvoice(inv)}
                    className="btn-cobalt px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{isFa ? 'فاکتور / PDF' : 'Invoice'}</span>
                  </button>
                  {inv.explorerUrl && (
                    <a
                      href={inv.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost p-1.5 rounded-xl"
                      title="Blockchain Explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeInvoice && (
        <BankingInvoiceModal
          invoice={activeInvoice}
          lang={lang}
          iranRate={iranRate}
          onClose={() => setActiveInvoice(null)}
        />
      )}
    </div>
  );
}
