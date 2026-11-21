import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  Gift,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { buildTrustWalletDappOpenUrl, sendBep20UsdtViaTrustWallet } from '../lib/trustwallet';

export interface UserEntitlement {
  hasPaidPlan: boolean;
  planCode: string;
  planNameFa: string;
  planNameEn: string;
  status: string;
  allowPaperDemo: boolean;
  allowAiTrading: boolean;
  allowCodexbot: boolean;
  allowCopyTrade: boolean;
  allowLiveTrading: boolean;
  daysRemaining: number;
  expiresAt: string | null;
  subscriptionRequired: boolean;
}

interface PlanRow {
  code: string;
  name_fa: string;
  name_en: string;
  description_fa: string | null;
  description_en: string | null;
  price_usd: number;
  price_toman: number;
  duration_days: number;
  features_json: string;
  is_popular: number;
}

interface SubOrder {
  id: string;
  plan_code: string;
  name_fa?: string;
  name_en?: string;
  status: string;
  payment_method: string;
  payment_reference: string | null;
  amount_usd: number;
  admin_note: string | null;
  expires_at: string | null;
  created_at: string;
}

export function SubscriptionPage({
  lang,
  onRefreshDashboard,
}: {
  lang: Lang;
  onRefreshDashboard: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [entitlement, setEntitlement] = useState<UserEntitlement | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [payCfg, setPayCfg] = useState<Record<string, string>>({});
  const [selectedPlan, setSelectedPlan] = useState<PlanRow | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'TRUST_WALLET_BEP20' | 'USDT_TRC20' | 'CARD_TO_CARD'>('TRUST_WALLET_BEP20');
  const [paymentRef, setPaymentRef] = useState('');
  const [payerNote, setPayerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [referral, setReferral] = useState<{
    referralCode: string;
    totalReferred: number;
    rewardDaysEarned: number;
    referrals: Array<{ username: string; created_at: string }>;
  } | null>(null);

  const loadData = async () => {
    const [res, refRes] = await Promise.all([
      apiFetch<{
        entitlement: UserEntitlement;
        plans: PlanRow[];
        orders: SubOrder[];
        paymentConfig: Record<string, string>;
      }>('/api/subscriptions/me'),
      apiFetch<{
        referralCode: string;
        totalReferred: number;
        rewardDaysEarned: number;
        referrals: Array<{ username: string; created_at: string }>;
      }>('/api/subscriptions/referrals').catch(() => null),
    ]);
    setEntitlement(res.entitlement);
    setPlans(res.plans);
    setOrders(res.orders);
    setPayCfg(res.paymentConfig);
    if (refRes) setReferral(refRes);
    if (!selectedPlan) {
      const def = res.plans.find((p) => p.code === 'pro_monthly') || res.plans.find((p) => p.price_usd > 0) || null;
      setSelectedPlan(def);
    }
  };

  const redeemGift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!giftCode.trim()) return;
    setRedeeming(true);
    setMsg(null);
    try {
      const r = await apiFetch<{ ok: boolean; durationDays: number; expiresAt: string }>('/api/subscriptions/redeem-gift', {
        method: 'POST',
        body: JSON.stringify({ code: giftCode.trim() }),
      });
      setGiftCode('');
      setMsg(
        isFa
          ? `کد هدیه فعال شد! ${r.durationDays} روز اشتراک به حساب شما اضافه گردید.`
          : `Gift code redeemed! +${r.durationDays} days added to your subscription.`
      );
      await loadData();
      await onRefreshDashboard();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Gift code invalid');
    } finally {
      setRedeeming(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const copyText = (val: string, key: string) => {
    void navigator.clipboard?.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  };

  const submitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || selectedPlan.price_usd <= 0) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; autoVerified?: boolean; message?: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planCode: selectedPlan.code,
          paymentMethod,
          paymentReference: paymentRef.trim(),
          payerNote: payerNote.trim(),
        }),
      });
      setPaymentRef('');
      setPayerNote('');
      setMsg(
        res.autoVerified
          ? isFa
            ? '✅ تراکنش بلاک‌چین تایید خودکار شد و اشتراک شما هم‌اکنون فعال گردید!'
            : '✅ Blockchain transaction auto-verified! Your subscription is now ACTIVE.'
          : res.message ||
            (isFa
              ? 'سفارش اشتراک با موفقیت ثبت شد! پس از بررسی و تایید مدیر، اشتراک شما فوراً فعال می‌شود.'
              : 'Subscription order submitted! Once verified by admin, your Pro/VIP license activates immediately.')
      );
      await loadData();
      await onRefreshDashboard();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInstantTrustWalletPay = async () => {
    if (!selectedPlan || selectedPlan.price_usd <= 0) return;
    const toAddr = (payCfg.trust_wallet_evm_receiver || '').trim();
    if (!toAddr || !toAddr.startsWith('0x')) {
      setMsg(
        isFa
          ? 'آدرس دریافت BEP20 در پنل ادمین تنظیم نشده است. لطفاً روش TRC20 یا کارت به کارت را انتخاب کنید.'
          : 'Platform BEP20 receiver address is not configured yet.'
      );
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const txHash = await sendBep20UsdtViaTrustWallet({ toAddress: toAddr, amountUsdt: selectedPlan.price_usd });
      setPaymentRef(txHash);
      const res = await apiFetch<{ ok?: boolean; autoVerified?: boolean; message?: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planCode: selectedPlan.code,
          paymentMethod: 'TRUST_WALLET_BEP20',
          paymentReference: txHash,
          payerNote: 'Instant Trust Wallet DApp Pay',
        }),
      });
      setMsg(
        res.autoVerified
          ? isFa
            ? `✅ پرداخت Trust Wallet با TX ${txHash.slice(0, 12)}... تایید آن‌چین شد و اشتراک فعال گردید!`
            : `✅ Trust Wallet payment verified on-chain (${txHash.slice(0, 12)}...)!`
          : res.message ||
            (isFa
              ? `✅ تراکنش ${txHash.slice(0, 12)}... ارسال و ثبت شد! پس از تایید بلاک BSC اشتراک فوراً فعال می‌شود.`
              : `Transaction submitted (${txHash.slice(0, 12)}...).`)
      );
      await loadData();
      await onRefreshDashboard();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'NO_INJECTED_WALLET') {
        window.open(buildTrustWalletDappOpenUrl(`${window.location.origin}/?tab=pricing`), '_blank', 'noopener,noreferrer');
        setMsg(
          isFa
            ? 'در مرورگر فعلی افزونه کیف‌پول یافت نشد؛ صفحه در اپلیکیشن Trust Wallet DApp باز می‌شود یا پس از واریز، هش تراکنش (TXID) را ثبت کنید.'
            : 'Opening inside Trust Wallet DApp Browser...'
        );
      } else {
        setMsg(code || 'Trust Wallet payment cancelled');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero License Banner */}
      <div className="hero-cobalt p-6 text-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Crown className={`w-6 h-6 ${entitlement?.hasPaidPlan ? 'text-[#55ff94]' : 'text-[#fde047]'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black">
                {isFa ? entitlement?.planNameFa || 'وضعیت اشتراک' : entitlement?.planNameEn || 'Subscription Status'}
              </h1>
              <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-white/15">
                {entitlement?.hasPaidPlan
                  ? isFa
                    ? `فعال · ${entitlement.daysRemaining} روز`
                    : `ACTIVE · ${entitlement.daysRemaining}d`
                  : isFa
                    ? 'بدون اشتراک فعال'
                    : 'Subscription Required'}
              </span>
            </div>
            <p className="text-xs text-white/80 mt-1">
              {entitlement?.hasPaidPlan
                ? isFa
                  ? 'دسترسی کامل به ترید هوشمند اتومات، هوش مصنوعی من، کپی‌ترید تاییدشده، استراتژی شخصی و صرافی‌های Toobit و KCEX فعال است.'
                  : 'Full access unlocked: Auto AI Trading, My Trainable AI, Verified Copy-Trade, Custom IDE & Live Toobit/KCEX.'
                : isFa
                  ? 'برای استفاده از ترید هوشمند، هوش مصنوعی من، کپی‌ترید تاییدشده و استراتژی شخصی، ابتدا یکی از اشتراک‌های زیر را انتخاب و فعال کنید.'
                  : 'Activate a subscription plan below to unlock Auto AI Trading, My AI, Verified Copy-Trade, and Custom Strategies.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { ok: entitlement?.hasPaidPlan, label: isFa ? 'ترید هوشمند اتومات AI' : 'Auto AI Trading' },
            { ok: entitlement?.allowAiTrading, label: isFa ? 'هوش مصنوعی من' : 'My Trainable AI' },
            { ok: entitlement?.allowCopyTrade, label: isFa ? 'کپی‌ترید تاییدشده' : 'Verified Copy-Trade' },
            { ok: entitlement?.allowLiveTrading, label: isFa ? 'اتصال صرافی Toobit / KCEX' : 'Live Toobit & KCEX' },
          ].map((e) => (
            <span
              key={e.label}
              className={`px-3 py-1 rounded-xl inline-flex items-center gap-1 font-bold ${
                e.ok ? 'bg-[#059669] text-white shadow' : 'bg-white/10 text-white/60'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {e.label}
            </span>
          ))}
        </div>
      </div>

      {msg && (
        <div className="surface-card p-4 border-brand text-xs text-main font-semibold">
          {msg}
        </div>
      )}

      {/* Paid & Free Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.filter((p) => p.price_usd > 0).map((p) => {
          let feats: string[] = [];
          try {
            feats = JSON.parse(p.features_json) as string[];
          } catch {
            feats = [];
          }
          const isSelected = selectedPlan?.code === p.code;
          const isCurrent = entitlement?.planCode === p.code;

          return (
            <div
              key={p.code}
              className={`p-6 rounded-3xl flex flex-col justify-between gap-4 transition ${
                p.is_popular ? 'hero-cobalt text-white' : 'surface-card'
              } ${isSelected && !p.is_popular ? 'ring-2 ring-[#1464F6]' : ''}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-black text-base ${p.is_popular ? 'text-white' : 'text-main'}`}>
                    {isFa ? p.name_fa : p.name_en}
                  </span>
                  {p.is_popular ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black">
                      {isFa ? 'محبوب‌ترین' : 'POPULAR'}
                    </span>
                  ) : null}
                </div>

                <div>
                  <div className="flex items-baseline gap-2 font-mono-num">
                    <span className={`text-3xl font-black ${p.is_popular ? 'text-white' : 'text-main'}`}>
                      ${p.price_usd}
                    </span>
                    <span className={`text-xs ${p.is_popular ? 'text-white/75' : 'text-dim'}`}>
                      / {p.duration_days} {isFa ? 'روز' : 'days'}
                    </span>
                  </div>
                  {p.price_toman > 0 && (
                    <p className={`text-xs font-extrabold mt-1 ${p.is_popular ? 'text-[#7dffb0]' : 'text-signal'}`}>
                      {p.price_toman.toLocaleString()} {isFa ? 'تومان' : 'Toman'}
                    </p>
                  )}
                </div>

                <p className={`text-xs leading-relaxed ${p.is_popular ? 'text-white/85' : 'text-sub'}`}>
                  {isFa ? p.description_fa : p.description_en}
                </p>

                <ul className={`space-y-2 pt-3 border-t text-xs ${p.is_popular ? 'border-white/20' : ''}`}>
                  {feats.map((f, i) => (
                    <li key={i} className={`flex items-start gap-2 ${p.is_popular ? 'text-white' : 'text-sub'}`}>
                      <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${p.is_popular ? 'text-[#55ff94]' : 'text-signal'}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => setSelectedPlan(p)}
                className={`w-full py-3 rounded-2xl font-extrabold text-xs transition ${
                  p.is_popular
                    ? 'bg-[#059669] hover:bg-[#047857] text-white shadow'
                    : isSelected
                      ? 'btn-emerald'
                      : 'btn-cobalt'
                }`}
              >
                {isSelected
                  ? isFa ? 'انتخاب‌شده برای پرداخت ↓' : 'Selected ↓'
                  : isCurrent
                    ? isFa ? 'تمدید این پلن' : 'Renew Plan'
                    : isFa ? 'خرید و فعال‌سازی اشتراک' : 'Select Plan'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Gift Code + Referral Invite Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <form onSubmit={redeemGift} className="panel rounded-[26px] p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl btn-gold grid place-items-center shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-main">
                {isFa ? 'کد هدیه یا تخفیف دارید؟' : 'Have a Gift Code?'}
              </h3>
              <p className="text-[11px] text-dim">
                {isFa ? 'کد را وارد کنید تا اشتراک شما فوراً فعال شود' : 'Redeem your instant activation code'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={giftCode}
              onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
              placeholder="DLRXXXXXX"
              dir="ltr"
              className="field font-mono-num text-xs flex-1"
            />
            <button
              type="submit"
              disabled={redeeming || !giftCode.trim()}
              className="btn-emerald px-4 py-2.5 rounded-xl text-xs font-black shrink-0"
            >
              {redeeming ? '...' : isFa ? 'فعالسازی' : 'Redeem'}
            </button>
          </div>
        </form>

        <div className="panel rounded-[26px] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl btn-cobalt grid place-items-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-main">
                  {isFa ? 'دعوت از دوستان = روزهای هدیه اشتراک' : 'Invite Friends = Bonus Days'}
                </h3>
                <p className="text-[11px] text-dim">
                  {isFa
                    ? `${referral?.totalReferred ?? 0} دعوت موفق · ${referral?.rewardDaysEarned ?? 0} روز هدیه`
                    : `${referral?.totalReferred ?? 0} invited · ${referral?.rewardDaysEarned ?? 0} bonus days`}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              dir="ltr"
              value={
                typeof window !== 'undefined' && referral?.referralCode
                  ? `${window.location.origin}/?ref=${referral.referralCode}`
                  : 'Loading...'
              }
              className="field font-mono-num text-xs flex-1"
            />
            <button
              type="button"
              onClick={() =>
                copyText(
                  typeof window !== 'undefined' && referral?.referralCode
                    ? `${window.location.origin}/?ref=${referral.referralCode}`
                    : '',
                  'ref'
                )
              }
              className="btn-cobalt px-4 py-2.5 rounded-xl text-xs font-black shrink-0 inline-flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied === 'ref' ? (isFa ? 'کپی شد!' : 'Copied!') : isFa ? 'کپی لینک' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Checkout Panel */}
      {selectedPlan && selectedPlan.price_usd > 0 && (
        <div className="surface-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-black text-main flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand" />
              <span>
                {isFa
                  ? `پرداخت و فعال‌سازی: ${selectedPlan.name_fa} ($${selectedPlan.price_usd})`
                  : `Checkout: ${selectedPlan.name_en} ($${selectedPlan.price_usd})`}
              </span>
            </h2>
            <span className="text-xs text-sub font-semibold">
              {isFa
                ? `ربات رسمی پشتیبانی: ${payCfg.telegram_support && !/Dollarino_admin/i.test(payCfg.telegram_support) ? payCfg.telegram_support : '@Dollarino_bot'}`
                : `Official Support Bot: ${payCfg.telegram_support && !/Dollarino_admin/i.test(payCfg.telegram_support) ? payCfg.telegram_support : '@Dollarino_bot'}`}
            </span>
          </div>

          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-main">
            {isFa
              ? '⚠️ هشدار امنیتی: دلارینو هیچ اکانت پیوی شخصی برای دریافت وجه یا پشتیبانی ندارد. پرداخت را فقط به آدرس‌های داخل همین صفحه انجام دهید و در صورت نیاز فقط با پشتیبانی آنلاین سایت یا ربات @Dollarino_bot در ارتباط باشید.'
              : '⚠️ Security Notice: Dollarino has NO personal DM support account. Only pay to addresses shown here and contact us via Online Support or @Dollarino_bot.'}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <button
              type="button"
              onClick={() => setPaymentMethod('TRUST_WALLET_BEP20')}
              className={`p-4 rounded-2xl border text-start flex items-center gap-3 transition ${
                paymentMethod === 'TRUST_WALLET_BEP20' ? 'btn-gold' : 'surface-soft text-sub'
              }`}
            >
              <Wallet className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-extrabold">{isFa ? '🦊 Trust Wallet (BEP20)' : 'Trust Wallet (BEP20)'}</div>
                <div className="text-[11px] opacity-90">${selectedPlan.price_usd} USDT · کارمزد ناچیز</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('USDT_TRC20')}
              className={`p-4 rounded-2xl border text-start flex items-center gap-3 transition ${
                paymentMethod === 'USDT_TRC20' ? 'btn-emerald' : 'surface-soft text-sub'
              }`}
            >
              <Wallet className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-extrabold">{isFa ? 'پرداخت با تتر (USDT · TRC20)' : 'Tether USDT (TRC20)'}</div>
                <div className="text-[11px] opacity-90">${selectedPlan.price_usd} USDT</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('CARD_TO_CARD')}
              className={`p-4 rounded-2xl border text-start flex items-center gap-3 transition ${
                paymentMethod === 'CARD_TO_CARD' ? 'btn-cobalt' : 'surface-soft text-sub'
              }`}
            >
              <CreditCard className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-extrabold">{isFa ? 'پرداخت کارت به کارت (تومانی)' : 'Card-to-Card (Toman)'}</div>
                <div className="text-[11px] opacity-90">{selectedPlan.price_toman.toLocaleString()} {isFa ? 'تومان' : 'Toman'}</div>
              </div>
            </button>
          </div>

          <div className="p-4 rounded-2xl surface-soft border flex flex-wrap items-center justify-between gap-3 text-xs">
            {paymentMethod === 'TRUST_WALLET_BEP20' ? (
              <div className="space-y-1 min-w-0">
                <div className="text-sub">{isFa ? 'آدرس کیف‌پول دریافت Trust Wallet (شبکه BSC / BEP20):' : 'Trust Wallet USDT BEP20 Address:'}</div>
                <div className="font-mono-num text-sm font-black text-main break-all" dir="ltr">
                  {payCfg.trust_wallet_evm_receiver || (isFa ? 'هنوز در پنل ادمین تنظیم نشده' : 'Set trust_wallet_evm_receiver in Admin')}
                </div>
              </div>
            ) : paymentMethod === 'USDT_TRC20' ? (
              <div className="space-y-1 min-w-0">
                <div className="text-sub">{isFa ? 'آدرس کیف‌پول تتر (TRC20):' : 'USDT TRC20 Address:'}</div>
                <div className="font-mono-num text-sm font-black text-main break-all" dir="ltr">
                  {payCfg.usdt_trc20_wallet || 'Set USDT wallet in Admin Panel'}
                </div>
              </div>
            ) : (
              <div className="space-y-1 min-w-0">
                <div className="text-sub">
                  {isFa ? `شماره کارت (${payCfg.iran_card_holder || 'مدیریت دلارینو'}):` : `Bank Card (${payCfg.iran_card_holder || 'Admin'}):`}
                </div>
                <div className="font-mono-num text-sm font-black text-main" dir="ltr">
                  {payCfg.iran_card_number || '6037-9975-0000-0000'}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 shrink-0">
              {paymentMethod === 'TRUST_WALLET_BEP20' && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleInstantTrustWalletPay()}
                  className="px-4 py-2 rounded-xl btn-gold font-black inline-flex items-center gap-1.5"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>{isFa ? '🦊 پرداخت مستقیم از Trust Wallet' : 'Instant Pay in Trust Wallet'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  copyText(
                    paymentMethod === 'TRUST_WALLET_BEP20'
                      ? payCfg.trust_wallet_evm_receiver || ''
                      : paymentMethod === 'USDT_TRC20'
                        ? payCfg.usdt_trc20_wallet || ''
                        : payCfg.iran_card_number || '',
                    'addr'
                  )
                }
                className="px-3.5 py-2 rounded-xl surface-card border text-main font-bold inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5 text-brand" />
                <span>{copied === 'addr' ? (isFa ? 'کپی شد!' : 'Copied!') : isFa ? 'کپی' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <form onSubmit={submitCheckout} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <input
              required
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder={
                paymentMethod === 'TRUST_WALLET_BEP20'
                  ? isFa
                    ? 'هش تراکنش BEP20 (0x...)...'
                    : 'Paste BSC BEP20 TX Hash (0x...)...'
                  : paymentMethod === 'USDT_TRC20'
                    ? isFa
                      ? 'هش تراکنش (TXID)...'
                      : 'Paste USDT TRC20 TXID...'
                    : isFa
                      ? 'شماره پیگیری / ۴ رقم آخر کارت...'
                      : 'Paste tracking code...'
              }
              className="surface-input rounded-xl px-3.5 py-2.5 font-mono-num"
            />
            <input
              value={payerNote}
              onChange={(e) => setPayerNote(e.target.value)}
              placeholder={isFa ? 'آیدی تلگرام یا توضیحات (اختیاری)' : 'Telegram @handle (optional)'}
              className="surface-input rounded-xl px-3.5 py-2.5"
            />
            <button
              disabled={submitting}
              type="submit"
              className="px-5 py-2.5 rounded-xl btn-emerald font-extrabold flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{submitting ? '...' : isFa ? 'ثبت پرداخت و ارسال برای تایید' : 'Submit Payment Reference'}</span>
            </button>
          </form>
        </div>
      )}

      {orders.length > 0 && (
        <div className="surface-card p-5 space-y-3 text-xs">
          <h3 className="font-black text-sm text-main flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand" />
            <span>{isFa ? 'سوابق سفارش اشتراک' : 'Subscription Orders'}</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-[11px] text-dim border-b">
                <tr>
                  <th className="py-2 text-start">{isFa ? 'پلن' : 'Plan'}</th>
                  <th className="py-2 text-start">{isFa ? 'روش' : 'Method'}</th>
                  <th className="py-2 text-start">{isFa ? 'کد پیگیری' : 'Reference'}</th>
                  <th className="py-2 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                  <th className="py-2 text-end">{isFa ? 'تاریخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono-num">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 font-sans font-bold text-main">{isFa ? o.name_fa || o.plan_code : o.name_en || o.plan_code}</td>
                    <td className="py-2.5 text-sub">{o.payment_method}</td>
                    <td className="py-2.5 text-sub max-w-[200px] truncate">{o.payment_reference || '-'}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold ${
                          o.status === 'ACTIVE'
                            ? 'badge-signal'
                            : o.status === 'PENDING_REVIEW'
                              ? 'bg-[#FF8A00]/15 text-flame'
                              : 'bg-rose-500/15 text-loss'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-end text-dim">{o.created_at.slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
