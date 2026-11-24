import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Gift,
  Info,
  Link2,
  Lock,
  MessageSquareText,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { formatTomanEq } from '../lib/format';
import { tgNotifyHaptic } from '../lib/telegram';

interface ServerFeeEntry {
  id: string;
  trade_id: string | null;
  source: string;
  symbol: string;
  realized_pnl_usd: number;
  fee_pct: number;
  fee_usd: number;
  status: 'ACCRUED' | 'PENDING_VERIFY' | 'SETTLED_ONCHAIN' | 'SETTLED_PREPAID' | 'REJECTED' | 'WAIVED';
  tx_hash: string | null;
  note: string | null;
  created_at: string;
}

interface FeeEnforcementInfo {
  allowed: boolean;
  lockStatus: 'ACTIVE' | 'WARNING' | 'PENDING_REVIEW' | 'LOCKED';
  reasonFa?: string;
  reasonEn?: string;
  accruedUsd: number;
  pendingVerifyUsd: number;
  penaltyUsd: number;
  totalDueUsd: number;
  prepaidCreditUsd: number;
  graceLimitUsd: number;
  graceDeadline: string | null;
  hoursRemaining: number | null;
  latePenaltyPct: number;
  autoLockEnabled: boolean;
}

interface ServerFeePayload {
  feePct: number;
  totalProfitablePnlUsd: number;
  totalFeeUsd: number;
  accruedFeeUsd: number;
  pendingVerifyFeeUsd?: number;
  settledFeeUsd: number;
  profitableTradesCount: number;
  enforcement?: FeeEnforcementInfo;
  entries: ServerFeeEntry[];
  receivers: Record<string, string>;
  honestArchitectureNoteFa: string;
  honestArchitectureNoteEn: string;
}

export function SubscriptionPage({
  lang,
  onRefreshDashboard,
}: {
  lang: Lang;
  onRefreshDashboard: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [ledger, setLedger] = useState<ServerFeePayload | null>(null);
  const [iranRate, setIranRate] = useState<number>(74500);
  const [txHash, setTxHash] = useState('');
  const [prepayAmount, setPrepayAmount] = useState('10');
  const [prepayTxHash, setPrepayTxHash] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [referral, setReferral] = useState<{
    referralCode: string;
    inviteUrl?: string;
    telegramInviteUrl?: string;
    inviteTextFa?: string;
    inviteTextEn?: string;
    tier?: string;
    commissionPct?: number;
    nonWithdrawable?: boolean;
    minFriendBalanceUsd?: number;
    activationBonusReferrerUsd?: number;
    activationBonusFriendUsd?: number;
    feeCreditBalanceUsd?: number;
    referralFeeCreditEarnedUsd?: number;
    nonWithdrawablePolicyFa?: string;
    nonWithdrawablePolicyEn?: string;
    balanceUsd?: number;
    totalEarnedUsd?: number;
    totalReferred: number;
    qualifiedReferred?: number;
    flaggedCount?: number;
    referrals: Array<{
      id?: string;
      username: string;
      commission_usd?: number;
      status?: string;
      qualificationStatus?: 'QUALIFIED_ACTIVE' | 'PENDING_BALANCE_OR_TRADE' | 'FLAGGED_DUPLICATE';
      friendHasMinBalance?: boolean;
      friendLiveTradesCount?: number;
    }>;
  } | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);

  const loadAll = async () => {
    try {
      const [feeRes, rateRes, refRes] = await Promise.all([
        apiFetch<ServerFeePayload>('/api/subscriptions/server-fees'),
        apiFetch<{ usdtIrt: number }>('/api/public/usdt-irt-rate').catch(() => ({ usdtIrt: 74500 })),
        apiFetch<typeof referral>('/api/subscriptions/referrals').catch(() => null),
      ]);
      setLedger(feeRes);
      if (rateRes?.usdtIrt) setIranRate(rateRes.usdtIrt);
      if (refRes) setReferral(refRes);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleSettle = async () => {
    if (txHash.trim().length < 32) {
      setMsg(isFa ? 'فرمت هش تراکنش (TX Hash) معتبر نیست — هش واقعی بلاکچین را وارد کنید.' : 'Enter a valid blockchain TX Hash.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; settledCount: number; status?: string }>('/api/subscriptions/server-fees/settle', {
        method: 'POST',
        body: JSON.stringify({ txHash }),
      });
      tgNotifyHaptic('success');
      setMsg(
        res.status === 'PENDING_VERIFY'
          ? isFa
            ? 'تراکنش شما ثبت شد و در انتظار تایید آن‌چین / ادمین جهت بازگشایی حساب قرار گرفت ⏳'
            : 'Settlement TX submitted and queued for verification ⏳'
          : isFa
            ? `${res.settledCount} ردیف کارمزد سرور تسویه و حساب کاملاً آزاد شد ✅`
            : `Settled ${res.settledCount} fee entries ✅`
      );
      setTxHash('');
      await loadAll();
      await onRefreshDashboard();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Settlement failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePrepay = async () => {
    const amt = Number(prepayAmount || 0);
    if (!Number.isFinite(amt) || amt < 1) {
      setMsg(isFa ? 'حداقل مبلغ شارژ اعتبار کارمزد ۱ دلار است.' : 'Minimum credit top-up is $1.');
      return;
    }
    if (prepayTxHash.trim().length < 32) {
      setMsg(isFa ? 'لطفاً هش تراکنش معتبر شارژ اعتبار را وارد کنید.' : 'Enter valid prepay TX Hash.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; autoConfirmed: boolean }>('/api/subscriptions/server-fees/prepay', {
        method: 'POST',
        body: JSON.stringify({ amountUsd: amt, txHash: prepayTxHash }),
      });
      tgNotifyHaptic('success');
      setMsg(
        res.autoConfirmed
          ? isFa
            ? `اعتبار پیش‌پرداخت $${amt} تایید و شارژ شد ✅`
            : `$${amt} prepaid fee credit confirmed ✅`
          : isFa
            ? `درخواست شارژ $${amt} ثبت شد و پس از تایید، کارمزد ۵٪ خودکار از آن کسر می‌شود ⏳`
            : `Prepay request ($${amt}) submitted for verification ⏳`
      );
      setPrepayTxHash('');
      await loadAll();
      await onRefreshDashboard();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Prepay failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRedeemGift = async () => {
    if (!giftCode.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean }>('/api/subscriptions/redeem-gift', {
        method: 'POST',
        body: JSON.stringify({ code: giftCode }),
      });
      if (res.ok) {
        setMsg(isFa ? 'کد هدیه با موفقیت ثبت شد ✅' : 'Gift code redeemed ✅');
        setGiftCode('');
        await onRefreshDashboard();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const copyText = (val: string, key: string) => {
    void navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  };

  const enf = ledger?.enforcement;

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Banner: Free Forever + 5% Only On Real Profit */}
      <div className="panel rounded-3xl p-6 border hairline flex flex-col md:flex-row items-center gap-6">
        <img
          src="/images/transparent/rocket-profit-3d.png"
          alt="Dollarino 5% Profit Only"
          className="h-28 w-28 object-contain shrink-0"
        />
        <div className="flex-1 text-center md:text-start space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-xs font-black">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isFa ? 'اشتراک ماهانه حذف شد · ۱۰۰٪ رایگان برای همه' : 'Zero Monthly Subscriptions · 100% Free Access'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-main">
            {isFa
              ? 'فقط ۵٪ کارمزد سرور از سود معاملات واقعی (اشتراک و دمو = رایگان!)'
              : '5% Server Fee Strictly on Real Profits (Subscription & Demo = $0)'}
          </h1>
          <p className="text-xs sm:text-sm text-sub leading-relaxed">
            {isFa
              ? 'در دلارینو تمام امکانات رایگان است و ۹۵٪ سود معاملات متعلق به شماست. تا سقف ۲ دلار بدهی (معادل ۴۰ دلار سود واقعی!) کاملاً آزاد هستید و پس از آن ۷۲ ساعت فرصت تسویه دارید؛ در صورت عدم تسویه، ربات لایو تا تسویه یا شارژ اعتبار قفل می‌شود و جریمه دیرکرد اعمال می‌گردد.'
              : 'All tools are 100% free and you keep 95% of real profits. You get a $2.00 fee grace limit ($40+ real profits) + 72h settlement window; unpaid overdue balances pause LIVE trading and apply a late surcharge until settled.'}
          </p>
        </div>
      </div>

      {/* Live Fee Enforcement Status Alert (Lock / Warning / Pending Review / Active Credit) */}
      {enf && enf.lockStatus === 'LOCKED' && (
        <div className="rounded-3xl p-5 bg-rose-500/15 border border-rose-500/40 flex items-start gap-3">
          <Lock className="w-6 h-6 text-[#DC2626] dark:text-[#FB7185] shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-black text-sm text-[#DC2626] dark:text-[#FB7185]">
              {isFa
                ? `🔒 معاملات واقعی تا تسویه $${enf.totalDueUsd.toFixed(2)} قفل شد (بدهی: $${enf.accruedUsd.toFixed(2)} + جریمه دیرکرد: $${enf.penaltyUsd.toFixed(2)})`
                : `🔒 Live Trading Locked ($${enf.totalDueUsd.toFixed(2)} overdue: $${enf.accruedUsd.toFixed(2)} + $${enf.penaltyUsd.toFixed(2)} late fee)`}
            </p>
            <p className="text-main leading-relaxed">
              {isFa ? enf.reasonFa : enf.reasonEn}
            </p>
          </div>
        </div>
      )}

      {enf && enf.lockStatus === 'WARNING' && (
        <div className="rounded-3xl p-5 bg-amber-500/15 border border-amber-500/40 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-[#D97706] dark:text-[#FBBF24] shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-black text-sm text-[#D97706] dark:text-[#FBBF24] flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>
                {isFa
                  ? `⏳ مهلت تسویه کارمزد ۵٪: ${enf.hoursRemaining ?? 72} ساعت تا قفل شدن ربات واقعی و اعمال جریمه ${enf.latePenaltyPct}%!`
                  : `⏳ Settlement Grace Window: ${enf.hoursRemaining ?? 72}h remaining before LIVE lock & ${enf.latePenaltyPct}% late fee!`}
              </span>
            </p>
            <p className="text-main">
              {isFa
                ? `مبلغ کارمزد معوق شما به سقف $${enf.graceLimitUsd.toFixed(2)} رسیده است ($${enf.accruedUsd.toFixed(2)} معوق). لطفاً پیش از پایان مهلت تسویه کنید.`
                : `Your unpaid 5% fees ($${enf.accruedUsd.toFixed(2)}) reached the $${enf.graceLimitUsd.toFixed(2)} grace cap. Settle before deadline to avoid auto-pause.`}
            </p>
          </div>
        </div>
      )}

      {enf && enf.lockStatus === 'PENDING_REVIEW' && (
        <div className="rounded-3xl p-5 bg-sky-500/15 border border-sky-500/35 flex items-start gap-3">
          <Clock className="w-5 h-5 text-[#0D47A1] dark:text-[#60A5FA] shrink-0 mt-0.5" />
          <div className="text-xs text-main">
            <p className="font-black">
              {isFa
                ? `⏳ تراکنش تسویه به مبلغ $${enf.pendingVerifyUsd.toFixed(2)} ثبت شده و در صف تایید است.`
                : `⏳ Settlement TX ($${enf.pendingVerifyUsd.toFixed(2)}) is awaiting verification.`}
            </p>
          </div>
        </div>
      )}

      {/* Honest Non-Custodial Technical Architecture Disclosure */}
      <div className="rounded-3xl p-5 bg-sky-500/10 border border-sky-500/30 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#0D47A1] dark:text-[#60A5FA] shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <p className="font-black text-main">
            {isFa ? 'توضیح فنی کاملاً صادقانه درباره امنیت Trust Wallet، سقف بدهی و کنترل کارمزد:' : 'Honest Non-Custodial Security & Fee Enforcement Model:'}
          </p>
          <p className="text-sub leading-relaxed">
            {isFa
              ? `دلارینو هیچ‌گاه به کلید خصوصی Trust Wallet شما دسترسی ندارد و نمی‌تواند خودسرانه پول برداشت کند. برای عدالت و جلوگیری از سوءاستفاده، تا سقف $${enf?.graceLimitUsd ?? 2} کارمزد معوق آزاد است؛ اگر پس از ۷۲ ساعت تسویه نشود، جریمه ${enf?.latePenaltyPct ?? 25}% اعمال و اجرای معاملات واقعی خودکار متوقف می‌شود (شبیه‌ساز دمو $10,000 همیشه آزاد است). همچنین می‌توانید اعتبار پیش‌پرداخت شارژ کنید تا هیچ‌وقت متوقف نشوید.`
              : `Dollarino never accesses your Trust Wallet keys. To prevent abuse, users receive a $${enf?.graceLimitUsd ?? 2} grace credit + 72h settlement window. Overdue balances trigger a ${enf?.latePenaltyPct ?? 25}% late surcharge and automatically pause LIVE execution until settled (Demo remains free).`}
          </p>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="panel rounded-3xl p-4 border hairline space-y-1">
          <p className="text-[11px] font-bold text-dim">{isFa ? 'اعتبار پیش‌پرداخت کارمزد' : 'Prepaid Fee Credit'}</p>
          <p className="text-2xl font-black text-[#059669] dark:text-[#34D399]" dir="ltr">
            ${(enf?.prepaidCreditUsd ?? 0).toFixed(2)}
          </p>
          <p className="text-[10px] text-dim">{isFa ? 'کسر اتومات ۵٪ از اعتبار' : 'Auto-deducts 5% fees'}</p>
        </div>
        <div className="panel rounded-3xl p-4 border hairline space-y-1">
          <p className="text-[11px] font-bold text-dim">{isFa ? 'معاملات سودده واقعی' : 'Winning Live Trades'}</p>
          <p className="text-2xl font-black text-main" dir="ltr">{ledger?.profitableTradesCount ?? 0}</p>
          <p className="text-[10px] text-dim" dir="ltr">+${(ledger?.totalProfitablePnlUsd ?? 0).toFixed(2)} PnL</p>
        </div>
        <div className="panel rounded-3xl p-4 border hairline space-y-1">
          <p className="text-[11px] font-bold text-dim">{isFa ? 'کارمزد معوق + جریمه' : 'Due (Fee + Penalty)'}</p>
          <p className={`text-2xl font-black ${(enf?.totalDueUsd ?? 0) >= (enf?.graceLimitUsd ?? 2) ? 'text-[#DC2626] dark:text-[#FB7185]' : 'text-[#D97706] dark:text-[#FBBF24]'}`} dir="ltr">
            ${(enf?.totalDueUsd ?? ledger?.accruedFeeUsd ?? 0).toFixed(2)}
          </p>
          <p className="text-[10px] text-dim">
            {isFa ? `معادل ${formatTomanEq(enf?.totalDueUsd ?? ledger?.accruedFeeUsd ?? 0, iranRate)} تومان` : `≈ ${formatTomanEq(enf?.totalDueUsd ?? 0, iranRate)} IRT`}
          </p>
        </div>
        <div className="panel rounded-3xl p-4 border hairline space-y-1">
          <p className="text-[11px] font-bold text-dim">{isFa ? 'سقف آزاد بدهی' : 'Grace Limit'}</p>
          <p className="text-2xl font-black text-main" dir="ltr">${(enf?.graceLimitUsd ?? 2).toFixed(2)}</p>
          <p className="text-[10px] text-dim">{isFa ? 'سپس ۷۲ ساعت مهلت تسویه' : 'Then 72h grace window'}</p>
        </div>
        <div className="panel rounded-3xl p-4 border hairline space-y-1">
          <p className="text-[11px] font-bold text-dim">{isFa ? 'کل تسویه‌شده' : 'Settled Total'}</p>
          <p className="text-2xl font-black text-main" dir="ltr">${(ledger?.settledFeeUsd ?? 0).toFixed(2)}</p>
          <p className="text-[10px] text-dim">{isFa ? 'تاییدشده روی بلاکچین' : 'Verified on-chain'}</p>
        </div>
      </div>

      {/* Settle Accrued Fee OR Prepay Credit via Trust Wallet */}
      <div className="panel rounded-3xl p-5 border hairline space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#0D47A1] dark:text-[#60A5FA]" />
            <span>{isFa ? 'تسویه بدهی یا شارژ اعتبار پیش‌پرداخت کارمزد ۵٪ (Trust Wallet)' : 'Settle Fee Debt or Top-Up Prepaid Credit'}</span>
          </h2>
          <span className="text-[11px] font-bold text-dim">
            {isFa ? `نرخ لحظه‌ای تتر ایران: ${iranRate.toLocaleString('en-US')} تومان` : `Iran Rate: ${iranRate.toLocaleString('en-US')} IRT`}
          </span>
        </div>

        {ledger?.receivers?.trust_wallet_evm_receiver || (ledger?.receivers?.usdt_trc20_wallet && !ledger.receivers.usdt_trc20_wallet.includes('YourTRC20WalletAddress')) ? (
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            {ledger?.receivers?.trust_wallet_evm_receiver && (
              <div className="rounded-2xl p-3 surface-soft border hairline flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-dim">BEP20 / EVM Trust Wallet</p>
                  <p dir="ltr" className="font-mono text-main truncate">{ledger.receivers.trust_wallet_evm_receiver}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(ledger.receivers.trust_wallet_evm_receiver!, 'evm')}
                  className="px-2.5 py-1 rounded-xl bg-[#0D47A1] text-white text-[10px] font-black shrink-0"
                >
                  {copied === 'evm' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
            {ledger?.receivers?.usdt_trc20_wallet && !ledger.receivers.usdt_trc20_wallet.includes('YourTRC20WalletAddress') && (
              <div className="rounded-2xl p-3 surface-soft border hairline flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-dim">USDT TRC20</p>
                  <p dir="ltr" className="font-mono text-main truncate">{ledger.receivers.usdt_trc20_wallet}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(ledger.receivers.usdt_trc20_wallet!, 'trc')}
                  className="px-2.5 py-1 rounded-xl bg-[#0D47A1] text-white text-[10px] font-black shrink-0"
                >
                  {copied === 'trc' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl p-3.5 bg-amber-500/10 border border-amber-500/30 text-xs text-amber-500 font-bold">
            {isFa
              ? '⚠️ آدرس ولت دریافت کارمزد (TRC20 / BEP20) هنوز توسط مدیر پلتفرم ثبت نشده است.'
              : '⚠️ Settlement receiver wallet (TRC20 / BEP20) has not been configured in Admin yet.'}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Settle Unpaid Debt */}
          <div className="rounded-2xl p-4 surface-soft border hairline space-y-2.5">
            <p className="text-xs font-black text-main flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-[#D97706]" />
              <span>{isFa ? '۱. تسویه بدهی معوق + باز کردن قفل حساب:' : '1. Settle Accrued Balance & Unlock:'}</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                dir="ltr"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder={isFa ? 'هش تراکنش واقعی (0x... یا TRC20/SOL)' : 'Real Settlement TX Hash'}
                className="input-pro flex-1 rounded-xl px-3 py-2 text-xs font-mono"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSettle()}
                className="px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-black inline-flex items-center justify-center gap-1.5 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isFa ? 'ثبت تسویه' : 'Submit TX'}</span>
              </button>
            </div>
          </div>

          {/* Prepay Fee Credit */}
          <div className="rounded-2xl p-4 surface-soft border hairline space-y-2.5">
            <p className="text-xs font-black text-main flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#059669]" />
              <span>{isFa ? '۲. شارژ اعتبار پیش‌پرداخت (کسر خودکار ۵٪ بدون توقف):' : '2. Top-Up Prepaid Credit (Never Pauses):'}</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                min={1}
                step={1}
                dir="ltr"
                value={prepayAmount}
                onChange={(e) => setPrepayAmount(e.target.value)}
                className="input-pro w-20 rounded-xl px-3 py-2 text-xs font-mono font-bold"
              />
              <input
                dir="ltr"
                value={prepayTxHash}
                onChange={(e) => setPrepayTxHash(e.target.value)}
                placeholder={isFa ? 'هش تراکنش شارژ اعتبار ($)' : 'Credit Top-up TX Hash'}
                className="input-pro flex-1 rounded-xl px-3 py-2 text-xs font-mono"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePrepay()}
                className="px-4 py-2 rounded-xl bg-[#0D47A1] hover:bg-[#1565C0] text-white text-xs font-black shrink-0"
              >
                {isFa ? 'شارژ اعتبار' : 'Add Credit'}
              </button>
            </div>
          </div>
        </div>

        {msg && (
          <div className="rounded-2xl px-4 py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-main">
            {msg}
          </div>
        )}

        {/* Ledger Entries */}
        <div className="space-y-2 pt-2">
          <p className="text-xs font-black text-main">{isFa ? 'تاریخچه دقیق کارمزد ۵٪ معاملات سودده و اعتبار:' : '5% Profit-Share & Credit Ledger:'}</p>
          {ledger?.entries && ledger.entries.length > 0 ? (
            <div className="space-y-2">
              {ledger.entries.map((item) => (
                <div key={item.id} className="rounded-2xl p-3 surface-soft border hairline flex items-center justify-between gap-3 flex-wrap text-xs">
                  <div>
                    <p className="font-black text-main">
                      {item.symbol} <span className="text-dim font-normal">({item.source})</span>
                    </p>
                    <p className="text-[11px] text-dim">{item.note || item.created_at}</p>
                  </div>
                  <div className="text-end" dir="ltr">
                    <p className="font-black text-[#059669] dark:text-[#34D399]">
                      {item.source === 'PREPAY_CREDIT'
                        ? `Credit +$${Number(item.fee_usd).toFixed(2)}`
                        : `Profit +$${Number(item.realized_pnl_usd).toFixed(2)} → 5% Fee: $${Number(item.fee_usd).toFixed(4)}`}
                    </p>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.status === 'SETTLED_ONCHAIN' || item.status === 'SETTLED_PREPAID'
                        ? 'bg-emerald-500/15 text-[#059669]'
                        : item.status === 'REJECTED'
                          ? 'bg-rose-500/15 text-[#DC2626]'
                          : item.status === 'PENDING_VERIFY'
                            ? 'bg-sky-500/15 text-[#0D47A1] dark:text-[#60A5FA]'
                            : 'bg-amber-500/15 text-[#D97706]'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl p-4 surface-soft border hairline text-xs text-dim flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>
                {isFa
                  ? 'هنوز کارمزد ۵٪ معوقی ثبت نشده است (تمام ابزارهای تحلیل و شبیه‌ساز دمو ۱۰٬۰۰۰ دلاری کاملاً رایگان هستند).'
                  : 'No accrued 5% server fees yet—the $10,000 Demo Simulator and all analytics tools remain 100% free.'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Referral Banner, Invite Kit & Anti-Fraud Prepaid Fee Credit Hub */}
      <div className="panel rounded-3xl p-5 sm:p-6 border hairline space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-[11px] font-black mb-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>{isFa ? 'دعوت دوستان · پاداش اعتبار پیش‌پرداخت کارمزد ۵٪' : 'Invite Friends · Non-Withdrawable 5% Fee Credit'}</span>
            </div>
            <h2 className="font-display font-black text-lg text-main">
              {isFa ? 'دوستانت را دعوت کن؛ کارمزد معاملاتت رایگان شود!' : 'Invite Real Traders & Earn Free 5% Fee Credits'}
            </h2>
            <p className="text-xs text-sub mt-1 leading-relaxed max-w-3xl">
              {isFa
                ? referral?.nonWithdrawablePolicyFa ||
                  'جوایز رفرال نقدی و قابل برداشت نیستند و فقط به اعتبار پیش‌پرداخت کارمزد ۵٪ سود شما اضافه می‌شوند. پاداش زمانی آزاد می‌شود که دوست دعوت‌شده حداقل ۱۰ دلار موجودی واقعی داشته باشد و معامله واقعی (LIVE) انجام دهد؛ حساب‌های تکراری مسدود می‌شوند.'
                : referral?.nonWithdrawablePolicyEn ||
                  'Referral rewards are strictly non-withdrawable and go directly to your Prepaid 5% Fee Credit once your invited friend holds >= $10 real balance and completes a real LIVE trade.'}
            </p>
          </div>
          {referral && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="surface-soft rounded-2xl px-3.5 py-2 border hairline text-center">
                <p className="text-[10px] text-dim font-bold">{isFa ? 'اعتبار کارمزد رفرال' : 'Earned Credit'}</p>
                <p dir="ltr" className="font-num font-black text-sm text-[#059669] dark:text-[#34D399]">
                  +${Number(referral.referralFeeCreditEarnedUsd ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="surface-soft rounded-2xl px-3.5 py-2 border hairline text-center">
                <p className="text-[10px] text-dim font-bold">{isFa ? 'دوستان فعال / کل' : 'Active / Total'}</p>
                <p dir="ltr" className="font-num font-black text-sm text-main">
                  {referral.qualifiedReferred ?? 0} / {referral.totalReferred ?? 0}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Visual Promo Banner + Download Personalized PNG Banner */}
        <div
          dir="ltr"
          className="relative rounded-3xl overflow-hidden border hairline shadow-lg bg-[#061233] min-h-[250px] sm:min-h-[270px] flex items-stretch justify-end"
        >
          <img
            src="/images/referral-invite-banner.png?v=105"
            alt="Dollarino Referral Banner"
            className="absolute inset-0 w-full h-full object-cover object-left opacity-30 sm:opacity-100 pointer-events-none select-none"
          />
          <div className="relative z-10 w-full sm:w-[64%] bg-gradient-to-l from-[#061233]/95 via-[#061233]/75 to-transparent p-5 sm:p-7 flex flex-col justify-between items-end gap-4">
            <div dir={isFa ? 'rtl' : 'ltr'} className="max-w-md text-start space-y-2 text-white">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black">
                <Sparkles className="w-3 h-3" />
                <span>{isFa ? 'بدون اشتراک ماهانه · شبیه‌ساز $۱۰,۰۰۰ رایگان' : '$0 Monthly Sub · Free $10K Demo'}</span>
              </span>
              <h3 className="font-display font-black text-base sm:text-xl leading-snug text-white">
                {isFa
                  ? '+۲ دلار اعتبار کارمزد برای شما و +۱ دلار برای دوستتان!'
                  : '+$2.00 Fee Credit For You & +$1.00 For Your Friend!'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-200 leading-relaxed">
                {isFa
                  ? '+ ۲۰٪ سهم اعتبار از کارمزد معاملات سودده واقعی دوستتان (اعتبار غیرقابل برداشت، پس از شارژ ۱۰$ و اولین ترید واقعی)'
                  : '+ 20% fee-credit share from your friend’s profitable live trades (non-withdrawable; requires >=$10 balance & live trade)'}
              </p>
            </div>
            <div dir={isFa ? 'rtl' : 'ltr'} className="flex flex-wrap items-center justify-end gap-2">
              <span
                dir="ltr"
                className="px-3.5 py-2 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 font-mono-num font-black text-xs text-white"
              >
                CODE: {referral?.referralCode || 'DLRXHSOW'}
              </span>
              <button
                type="button"
                disabled={bannerBusy || !referral}
                onClick={async () => {
                  if (!referral) return;
                  setBannerBusy(true);
                  try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 1200;
                    canvas.height = 630;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      const img = new window.Image();
                      img.crossOrigin = 'anonymous';
                      await new Promise<void>((res) => {
                        img.onload = () => res();
                        img.onerror = () => res();
                        img.src = '/images/referral-invite-banner.png?v=105';
                      });
                      ctx.fillStyle = '#061233';
                      ctx.fillRect(0, 0, 1200, 630);
                      if (img.naturalWidth > 0) {
                        ctx.drawImage(img, 0, 0, 1200, 630);
                      }
                      const grad = ctx.createLinearGradient(480, 0, 1200, 0);
                      grad.addColorStop(0, 'rgba(6, 18, 51, 0.0)');
                      grad.addColorStop(0.45, 'rgba(6, 18, 51, 0.86)');
                      grad.addColorStop(1, 'rgba(6, 18, 51, 0.98)');
                      ctx.fillStyle = grad;
                      ctx.fillRect(0, 0, 1200, 630);

                      ctx.fillStyle = '#34D399';
                      ctx.font = 'bold 26px sans-serif';
                      ctx.textAlign = 'right';
                      ctx.fillText('DOLLARINO V10 · AI + TRUST WALLET', 1135, 95);

                      ctx.fillStyle = '#FFFFFF';
                      ctx.font = 'bold 46px sans-serif';
                      ctx.fillText(isFa ? 'ترید هوشمند روی Trust Wallet شخصی' : 'Smart Auto-Trading on Trust Wallet', 1135, 175);

                      ctx.fillStyle = '#E2E8F0';
                      ctx.font = '26px sans-serif';
                      ctx.fillText(isFa ? 'اشتراک ماهانه صفر · ۹۵٪ سود برای شما (فقط ۵٪ کارمزد سرور)' : '$0 Subscription · 5% Fee Only on Real Profit (Keep 95%)', 1135, 235);
                      ctx.fillText(isFa ? 'هدیه اعتبار کارمزد با اولین ترید واقعی ($۱۰+)' : '+$1.00 Welcome Fee Credit on First Live Trade ($10+)', 1135, 285);

                      ctx.fillStyle = 'rgba(255,255,255,0.14)';
                      ctx.fillRect(620, 355, 515, 92);
                      ctx.strokeStyle = 'rgba(52,211,153,0.75)';
                      ctx.lineWidth = 2;
                      ctx.strokeRect(620, 355, 515, 92);

                      ctx.fillStyle = '#FBBF24';
                      ctx.font = 'bold 34px monospace';
                      ctx.fillText(`CODE: ${referral.referralCode}`, 1105, 415);

                      ctx.fillStyle = '#93C5FD';
                      ctx.font = '22px monospace';
                      ctx.fillText('@Dollarino_bot  |  @Dollarino_official', 1135, 540);

                      const a = document.createElement('a');
                      a.download = `dollarino-invite-${referral.referralCode}.png`;
                      a.href = canvas.toDataURL('image/png');
                      a.click();
                      tgNotifyHaptic('success');
                    }
                  } finally {
                    setBannerBusy(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-lg transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{bannerBusy ? '...' : isFa ? 'دانلود تصویر بنر اختصاصی (PNG)' : 'Download Banner PNG'}</span>
              </button>
              {referral?.telegramInviteUrl && (
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(referral.telegramInviteUrl)}&text=${encodeURIComponent(isFa ? referral.inviteTextFa || '' : referral.inviteTextEn || '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-xs font-black inline-flex items-center gap-1.5 shadow-lg transition"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ارسال مستقیم در تلگرام' : 'Share on Telegram'}</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Copyable Code, Links & Ready Invite Text + Gift Code Redeem */}
        {referral && (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="surface-soft rounded-2xl p-4 border hairline space-y-3 text-xs min-w-0 overflow-hidden">
              <p className="font-black text-main flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-[#0D47A1] dark:text-[#60A5FA]" />
                <span>{isFa ? 'کد معرف و لینک‌های اختصاصی شما' : 'Your Personal Invite Code & Links'}</span>
              </p>

              <div className="flex items-center justify-between gap-2 panel rounded-xl p-2.5 border hairline">
                <span className="font-bold text-dim">{isFa ? 'کد دعوت:' : 'Invite Code:'}</span>
                <div className="flex items-center gap-2">
                  <code dir="ltr" className="font-mono-num font-black text-main text-sm">{referral.referralCode}</code>
                  <button
                    type="button"
                    onClick={() => copyText(referral.referralCode, 'ref_code')}
                    className="px-2.5 py-1 rounded-lg bg-[#059669] text-white text-[10px] font-bold inline-flex items-center gap-1"
                  >
                    {copied === 'ref_code' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied === 'ref_code' ? (isFa ? 'کپی شد' : 'Copied') : isFa ? 'کپی' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 panel rounded-xl p-2.5 border hairline">
                <span className="font-bold text-dim shrink-0">{isFa ? 'لینک ربات تلگرام:' : 'Telegram Link:'}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <code dir="ltr" className="font-mono-num text-[11px] text-sub truncate">{referral.telegramInviteUrl}</code>
                  <button
                    type="button"
                    onClick={() => copyText(referral.telegramInviteUrl || '', 'ref_tg')}
                    className="px-2.5 py-1 rounded-lg bg-[#0D47A1] text-white text-[10px] font-bold shrink-0"
                  >
                    {copied === 'ref_tg' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 panel rounded-xl p-2.5 border hairline">
                <span className="font-bold text-dim shrink-0">{isFa ? 'لینک وب‌سایت:' : 'Web Invite Link:'}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <code dir="ltr" className="font-mono-num text-[11px] text-sub truncate">{referral.inviteUrl}</code>
                  <button
                    type="button"
                    onClick={() => copyText(referral.inviteUrl || '', 'ref_web')}
                    className="px-2.5 py-1 rounded-lg bg-[#0D47A1] text-white text-[10px] font-bold shrink-0"
                  >
                    {copied === 'ref_web' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-dim inline-flex items-center gap-1">
                    <MessageSquareText className="w-3.5 h-3.5 text-[#F59E0B]" />
                    <span>{isFa ? 'متن آماده ارسال به دوستان:' : 'Ready-to-Share Invite Message:'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText(isFa ? referral.inviteTextFa || '' : referral.inviteTextEn || '', 'ref_text')}
                    className="px-3 py-1 rounded-lg btn-emerald text-[10px] font-black inline-flex items-center gap-1"
                  >
                    {copied === 'ref_text' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied === 'ref_text' ? (isFa ? 'متن کپی شد!' : 'Copied!') : isFa ? 'کپی کل متن دعوت' : 'Copy Invite Text'}</span>
                  </button>
                </div>
                <pre className="panel rounded-xl p-3 border hairline text-[11px] text-sub whitespace-pre-wrap leading-relaxed font-sans max-h-40 overflow-y-auto">
                  {isFa ? referral.inviteTextFa : referral.inviteTextEn}
                </pre>
              </div>
            </div>

            <div className="space-y-4 min-w-0">
              {/* Invited Friends Anti-Fraud Qualification Status */}
              <div className="surface-soft rounded-2xl p-4 border hairline space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black text-main flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#059669] dark:text-[#34D399]" />
                    <span>{isFa ? 'وضعیت دوستان دعوت‌شده و کنترل ضدتقلب' : 'Invited Friends & Anti-Fraud Status'}</span>
                  </p>
                  <span className="text-[10px] font-bold text-dim">
                    {isFa ? 'شرط: ≥$۱۰ + ترید واقعی' : 'Rule: ≥$10 + Live Trade'}
                  </span>
                </div>

                {referral.referrals.length === 0 ? (
                  <p className="text-dim py-4 text-center">
                    {isFa
                      ? 'هنوز دوستی با کد شما وارد نشده است. بنر بالا یا متن آماده را به اشتراک بگذارید!'
                      : 'No invited friends yet—share your banner or invite message above!'}
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {referral.referrals.map((fr, idx) => {
                      const qStatus = fr.qualificationStatus || (fr.status === 'REWARDED' ? 'QUALIFIED_ACTIVE' : fr.status === 'FLAGGED_DUPLICATE' ? 'FLAGGED_DUPLICATE' : 'PENDING_BALANCE_OR_TRADE');
                      return (
                        <div key={fr.id || idx} className="panel rounded-xl px-3 py-2 border hairline flex items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-main">{fr.username}</span>
                            <span className="block text-[10px] text-dim">
                              {isFa
                                ? `موجودی ≥۱۰$: ${fr.friendHasMinBalance ? 'بله ✅' : 'خیر'} · ترید واقعی: ${fr.friendLiveTradesCount ?? 0}`
                                : `Bal ≥$10: ${fr.friendHasMinBalance ? 'Yes' : 'No'} · Live Trades: ${fr.friendLiveTradesCount ?? 0}`}
                            </span>
                          </div>
                          <div className="text-end">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                qStatus === 'QUALIFIED_ACTIVE'
                                  ? 'bg-emerald-500/15 text-[#059669] dark:text-[#34D399]'
                                  : qStatus === 'FLAGGED_DUPLICATE'
                                    ? 'bg-rose-500/15 text-[#DC2626] dark:text-[#FB7185]'
                                    : 'bg-amber-500/15 text-[#D97706] dark:text-[#FBBF24]'
                              }`}
                            >
                              {qStatus === 'QUALIFIED_ACTIVE'
                                ? isFa
                                  ? `فعال (+$${Number(fr.commission_usd || 0).toFixed(2)})`
                                  : `Active (+$${Number(fr.commission_usd || 0).toFixed(2)})`
                                : qStatus === 'FLAGGED_DUPLICATE'
                                  ? isFa
                                    ? 'حساب تکراری (مسدود)'
                                    : 'Duplicate Blocked'
                                  : isFa
                                    ? 'در انتظار شارژ ۱۰$ و ترید'
                                    : 'Needs $10+ & Live Trade'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Promo / Fee Credit Code */}
              <div className="surface-soft rounded-2xl p-4 border hairline space-y-2.5 text-xs">
                <p className="font-black text-main flex items-center gap-2">
                  <Gift className="w-4 h-4 text-[#F59E0B]" />
                  <span>{isFa ? 'کد هدیه یا اعتبار کارمزد ۵٪' : 'Promo / Fee Credit Code'}</span>
                </p>
                <div className="flex gap-2">
                  <input
                    dir="ltr"
                    value={giftCode}
                    onChange={(e) => setGiftCode(e.target.value)}
                    placeholder="DOLLARINO2026"
                    className="input-pro flex-1 rounded-xl px-3 py-2 text-xs font-mono uppercase"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRedeemGift()}
                    className="px-4 py-2 rounded-xl bg-[#0D47A1] text-white text-xs font-black"
                  >
                    {isFa ? 'اعمال کد' : 'Apply'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
