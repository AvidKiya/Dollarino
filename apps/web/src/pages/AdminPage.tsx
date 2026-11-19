import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  Gift,
  KeyRound,
  Send,
  Settings,
  Shield,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface AdminOverview {
  users: Array<{
    id: string;
    email: string;
    username: string;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
    telegram_username: string | null;
    created_at: string;
  }>;
  stats: {
    totalUsers: number;
    signalsCount: number;
    botsCount: number;
    trades: { total: number; open_count: number; total_pnl: number } | null;
  };
  settings: Record<string, string>;
}

interface SubOrder {
  id: string;
  user_id: string;
  email: string;
  username: string;
  plan_code: string;
  name_fa: string | null;
  name_en: string | null;
  status: string;
  payment_method: string;
  payment_reference: string | null;
  amount_usd: number;
  amount_toman: number;
  created_at: string;
}

interface PlanRow {
  code: string;
  price_usd: number;
  price_toman: number;
}

export function AdminPage({
  lang,
  currentUser,
  onUserUpdated,
}: {
  lang: Lang;
  currentUser: { id: string; email: string; username: string; role: string };
  onUserUpdated: () => void;
}) {
  const isFa = lang === 'fa';
  const isOwnerOrAdmin = currentUser.role === 'owner' || currentUser.role === 'admin';
  const [data, setData] = useState<AdminOverview | null>(null);
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [helpText, setHelpText] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  // Personal Profile & Password form
  const [username, setUsername] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Manual Grant State
  const [grantEmail, setGrantEmail] = useState('');
  const [grantPlan, setGrantPlan] = useState('pro_monthly');
  const [grantDays, setGrantDays] = useState(30);

  // Payment & Pricing Config State
  const [payCfg, setPayCfg] = useState({
    subscriptionRequired: true,
    usdtTrc20Wallet: '',
    iranCardNumber: '',
    iranCardHolder: '',
    telegramSupport: '@Dollarinoofficial',
    proPriceUsd: 29,
    proPriceToman: 1950000,
    vipPriceUsd: 59,
    vipPriceToman: 3950000,
  });

  const load = async () => {
    if (!isOwnerOrAdmin) return;
    const [ov, ordRes, subMe] = await Promise.all([
      apiFetch<AdminOverview>('/api/admin/overview'),
      apiFetch<{ orders: SubOrder[] }>('/api/subscriptions/admin/orders').catch(() => ({ orders: [] })),
      apiFetch<{ plans: PlanRow[]; paymentConfig: Record<string, string> }>('/api/subscriptions/me').catch(() => null),
    ]);
    setData(ov);
    setOrders(ordRes.orders);
    setHelpText(ov.settings.help_text || '');

    if (subMe) {
      const pro = subMe.plans.find((p) => p.code === 'pro_monthly');
      const vip = subMe.plans.find((p) => p.code === 'vip_quarterly');
      setPayCfg({
        subscriptionRequired: (subMe.paymentConfig.subscription_required ?? 'true') !== 'false',
        usdtTrc20Wallet: subMe.paymentConfig.usdt_trc20_wallet || '',
        iranCardNumber: subMe.paymentConfig.iran_card_number || '',
        iranCardHolder: subMe.paymentConfig.iran_card_holder || '',
        telegramSupport: subMe.paymentConfig.telegram_support || '@Dollarinoofficial',
        proPriceUsd: pro?.price_usd ?? 29,
        proPriceToman: pro?.price_toman ?? 1950000,
        vipPriceUsd: vip?.price_usd ?? 59,
        vipPriceToman: vip?.price_toman ?? 3950000,
      });
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [isOwnerOrAdmin]);

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ username }) });
    setMsg(isFa ? 'نام کاربری ذخیره شد.' : 'Username updated.');
    onUserUpdated();
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch('/api/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setCurrentPassword('');
    setNewPassword('');
    setMsg(isFa ? 'رمز عبور با موفقیت تغییر یافت.' : 'Password updated securely.');
  };

  const reviewOrder = async (orderId: string, decision: 'APPROVE' | 'REJECT') => {
    setMsg(null);
    await apiFetch(`/api/subscriptions/admin/orders/${orderId}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    setMsg(decision === 'APPROVE' ? 'Subscription approved & activated!' : 'Order rejected.');
    await load();
    onUserUpdated();
  };

  const grantSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const res = await apiFetch<{ email: string; days: number }>('/api/subscriptions/admin/grant', {
      method: 'POST',
      body: JSON.stringify({ emailOrUserId: grantEmail, planCode: grantPlan, days: grantDays }),
    });
    setGrantEmail('');
    setMsg(`Granted ${res.days}d ${grantPlan} to ${res.email}!`);
    await load();
  };

  const savePayConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch('/api/subscriptions/admin/config', {
      method: 'PATCH',
      body: JSON.stringify(payCfg),
    });
    setMsg(isFa ? 'تنظیمات پرداخت و تعرفه اشتراک‌ها ذخیره شد.' : 'Subscription payment & pricing settings saved.');
    await load();
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className="p-3.5 rounded-2xl bg-[#2563eb]/15 border border-[#2563eb]/35 text-xs text-[#9eb7ff]">{msg}</div>
      )}

      {/* Account Profile & Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <form onSubmit={updateProfile} className="card-tt p-5 rounded-3xl space-y-3">
          <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#27cd86]" />
            <span>{isFa ? 'پروفایل حساب کاربری' : 'Account Profile'}</span>
          </h3>
          <div className="text-[#8f99aa]">
            Email: <span className="text-white font-mono-num">{currentUser.email}</span> · Role:{' '}
            <span className="uppercase text-[#27cd86] font-bold">{currentUser.role}</span>
          </div>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2"
            />
            <button type="submit" className="px-4 py-2 rounded-xl bg-[#27cd86] text-[#080a0e] font-bold">
              {isFa ? 'ذخیره' : 'Save'}
            </button>
          </div>
        </form>

        <form onSubmit={updatePassword} className="card-tt p-5 rounded-3xl space-y-3">
          <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#f59f14]" />
            <span>{isFa ? 'تغییر رمز عبور' : 'Security & Password'}</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current Password"
              className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2"
            />
            <input
              required
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New Password (min 6)"
              className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-xl bg-[#2563eb] text-white font-bold">
            {isFa ? 'به‌روزرسانی رمز عبور' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Owner/Admin Subscription & System Management */}
      {isOwnerOrAdmin && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card-tt p-4 rounded-2xl">
              <div className="text-xs text-[#8f99aa]">{isFa ? 'کل کاربران' : 'Total Users'}</div>
              <div className="text-xl font-extrabold font-mono-num text-white mt-1">{data.stats.totalUsers}</div>
            </div>
            <div className="card-tt p-4 rounded-2xl">
              <div className="text-xs text-[#8f99aa]">{isFa ? 'سفارش اشتراک در انتظار' : 'Pending Orders'}</div>
              <div className="text-xl font-extrabold font-mono-num text-[#f59f14] mt-1">
                {orders.filter((o) => o.status === 'PENDING_REVIEW').length}
              </div>
            </div>
            <div className="card-tt p-4 rounded-2xl">
              <div className="text-xs text-[#8f99aa]">{isFa ? 'کل معاملات' : 'Total Trades'}</div>
              <div className="text-xl font-extrabold font-mono-num text-white mt-1">{data.stats.trades?.total ?? 0}</div>
            </div>
            <div className="card-tt p-4 rounded-2xl">
              <div className="text-xs text-[#8f99aa]">{isFa ? 'سیگنال‌ها' : 'Signals Logged'}</div>
              <div className="text-xl font-extrabold font-mono-num text-white mt-1">{data.stats.signalsCount}</div>
            </div>
          </div>

          {/* 1. Subscription Orders Review Table */}
          <div className="card-tt p-5 rounded-3xl space-y-3 overflow-x-auto">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Crown className="w-4 h-4 text-[#f59f14]" />
              <span>{isFa ? 'سفارش‌های خرید اشتراک (تایید / رد)' : 'Subscription Orders (Approve / Reject)'}</span>
            </h3>
            {orders.length === 0 ? (
              <p className="text-xs text-[#6c7689] py-3">
                {isFa ? 'هنوز سفارشی ثبت نشده است.' : 'No subscription orders submitted yet.'}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-[#6c7689] border-b border-[#181d28]">
                  <tr>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'کاربر' : 'User'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'پلن' : 'Plan'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'روش و کد پیگیری' : 'Payment Ref'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                    <th className="py-2.5 px-2 text-end">{isFa ? 'عملیات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#151a24]">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-3 px-2">
                        <div className="font-semibold text-white">{o.username}</div>
                        <div className="text-[11px] text-[#6c7689]">{o.email}</div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-bold text-[#9eb7ff]">{isFa ? o.name_fa || o.plan_code : o.name_en || o.plan_code}</div>
                        <div className="text-[11px] font-mono-num text-[#6c7689]">
                          ${o.amount_usd} / {o.amount_toman?.toLocaleString()}T
                        </div>
                      </td>
                      <td className="py-3 px-2 font-mono-num text-[11px]">
                        <span className="text-[#9aa5b5]">{o.payment_method}</span>
                        <div className="text-white break-all max-w-[200px]">{o.payment_reference || '-'}</div>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            o.status === 'ACTIVE'
                              ? 'bg-[#27cd86]/15 text-[#27cd86]'
                              : o.status === 'PENDING_REVIEW'
                                ? 'bg-[#f59f14]/15 text-[#f59f14]'
                                : 'bg-[#eb493d]/15 text-[#eb493d]'
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-end space-x-1.5">
                        {o.status === 'PENDING_REVIEW' && (
                          <>
                            <button
                              onClick={() => void reviewOrder(o.id, 'APPROVE')}
                              className="px-2.5 py-1.5 rounded-xl bg-[#27cd86] text-[#080a0e] font-bold inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isFa ? 'تایید' : 'Approve'}</span>
                            </button>
                            <button
                              onClick={() => void reviewOrder(o.id, 'REJECT')}
                              className="px-2.5 py-1.5 rounded-xl bg-[#eb493d]/20 text-[#eb493d] font-bold inline-flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{isFa ? 'رد' : 'Reject'}</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 2. Manual Grant + Payment/Pricing Config */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <form onSubmit={grantSubscription} className="card-tt p-5 rounded-3xl space-y-3">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#27cd86]" />
                <span>{isFa ? 'فعال‌سازی دستی اشتراک برای کاربر' : 'Manual Subscription Grant'}</span>
              </h3>
              <input
                required
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder={isFa ? 'ایمیل یا ID کاربر' : 'User Email or ID'}
                className="w-full bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={grantPlan}
                  onChange={(e) => setGrantPlan(e.target.value)}
                  className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5"
                >
                  <option value="pro_monthly">Pro Monthly</option>
                  <option value="vip_quarterly">VIP Quarterly</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={grantDays}
                  onChange={(e) => setGrantDays(Number(e.target.value))}
                  className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num"
                />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-[#27cd86] text-[#080a0e] font-extrabold">
                {isFa ? 'اعطای اشتراک فعال' : 'Grant Active Subscription'}
              </button>
            </form>

            <form onSubmit={savePayConfig} className="card-tt p-5 rounded-3xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#3b82f6]" />
                  <span>{isFa ? 'تنظیمات کیف‌پول پرداخت و قیمت پلن‌ها' : 'Payment Wallet & Plan Pricing'}</span>
                </h3>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <input
                    type="checkbox"
                    checked={payCfg.subscriptionRequired}
                    onChange={(e) => setPayCfg({ ...payCfg, subscriptionRequired: e.target.checked })}
                  />
                  <span>{isFa ? 'اجبار اشتراک پولی' : 'Require Paid Plan'}</span>
                </label>
              </div>
              <input
                value={payCfg.usdtTrc20Wallet}
                onChange={(e) => setPayCfg({ ...payCfg, usdtTrc20Wallet: e.target.value })}
                placeholder="USDT TRC20 Wallet Address"
                className="w-full bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2 font-mono-num"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={payCfg.iranCardNumber}
                  onChange={(e) => setPayCfg({ ...payCfg, iranCardNumber: e.target.value })}
                  placeholder="Card Number (6037-...)"
                  className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2 font-mono-num"
                />
                <input
                  value={payCfg.iranCardHolder}
                  onChange={(e) => setPayCfg({ ...payCfg, iranCardHolder: e.target.value })}
                  placeholder="Card Holder Name"
                  className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input
                  type="number"
                  value={payCfg.proPriceUsd}
                  onChange={(e) => setPayCfg({ ...payCfg, proPriceUsd: Number(e.target.value) })}
                  placeholder="Pro $"
                  className="bg-[#080a0e] border border-[#222836] rounded-xl px-2.5 py-2 font-mono-num"
                />
                <input
                  type="number"
                  value={payCfg.proPriceToman}
                  onChange={(e) => setPayCfg({ ...payCfg, proPriceToman: Number(e.target.value) })}
                  placeholder="Pro Toman"
                  className="bg-[#080a0e] border border-[#222836] rounded-xl px-2.5 py-2 font-mono-num"
                />
                <input
                  type="number"
                  value={payCfg.vipPriceUsd}
                  onChange={(e) => setPayCfg({ ...payCfg, vipPriceUsd: Number(e.target.value) })}
                  placeholder="VIP $"
                  className="bg-[#080a0e] border border-[#222836] rounded-xl px-2.5 py-2 font-mono-num"
                />
                <input
                  type="number"
                  value={payCfg.vipPriceToman}
                  onChange={(e) => setPayCfg({ ...payCfg, vipPriceToman: Number(e.target.value) })}
                  placeholder="VIP Toman"
                  className="bg-[#080a0e] border border-[#222836] rounded-xl px-2.5 py-2 font-mono-num"
                />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-[#2563eb] text-white font-bold">
                {isFa ? 'ذخیره تنظیمات مالی و پلن‌ها' : 'Save Pricing & Payment Info'}
              </button>
            </form>
          </div>

          {/* 3. Instance Users */}
          <div className="card-tt p-5 rounded-3xl overflow-x-auto">
            <h3 className="text-sm font-extrabold mb-3 flex items-center gap-2 text-white">
              <Users className="w-4 h-4 text-[#3b82f6]" />
              <span>{isFa ? 'مدیریت کاربران و ادمین‌ها' : 'Instance Users & Admin Controls'}</span>
            </h3>
            <table className="w-full text-xs">
              <thead className="text-[#6c7689] border-b border-[#181d28]">
                <tr>
                  <th className="py-2 px-2 text-start">User</th>
                  <th className="py-2 px-2 text-start">Telegram</th>
                  <th className="py-2 px-2 text-start">Role</th>
                  <th className="py-2 px-2 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#151a24]">
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-2">
                      {u.username} <span className="text-[#6c7689]">({u.email})</span>
                    </td>
                    <td className="py-2.5 px-2 font-mono-num">{u.telegram_id || '-'}</td>
                    <td className="py-2.5 px-2">
                      <span className="px-2 py-0.5 rounded bg-[#151a24] text-[#c5cede]">{u.role}</span>
                    </td>
                    <td className="py-2.5 px-2 text-end space-x-2">
                      {u.role !== 'owner' && (
                        <>
                          {currentUser.role === 'owner' && (
                            <button
                              onClick={async () => {
                                await apiFetch(`/api/admin/users/${u.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ role: u.role === 'admin' ? 'user' : 'admin' }),
                                });
                                void load();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#2563eb]/20 text-[#9eb7ff]"
                            >
                              {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/users/${u.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ is_blocked: !u.is_blocked }),
                              });
                              void load();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#eb493d]/20 text-[#eb493d]"
                          >
                            {u.is_blocked ? 'Unblock' : 'Block'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="card-tt p-5 rounded-3xl space-y-3">
              <h3 className="font-extrabold text-sm flex items-center gap-2 text-white">
                <Shield className="w-4 h-4 text-[#27cd86]" />
                <span>{isFa ? 'ویرایش متن راهنمای ربات تلگرام' : 'Telegram Bot Help Message'}</span>
              </h3>
              <textarea
                rows={4}
                value={helpText}
                onChange={(e) => setHelpText(e.target.value)}
                className="w-full bg-[#080a0e] border border-[#222836] rounded-2xl p-3"
              />
              <button
                onClick={async () => {
                  await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ help_text: helpText }) });
                  setMsg('Help message updated.');
                }}
                className="px-4 py-2 rounded-xl bg-[#27cd86] text-[#080a0e] font-bold"
              >
                Save Help Text
              </button>
            </div>

            <div className="card-tt p-5 rounded-3xl space-y-3">
              <h3 className="font-extrabold text-sm flex items-center gap-2 text-white">
                <Send className="w-4 h-4 text-[#f59f14]" />
                <span>{isFa ? 'ارسال پیام همگانی به کاربران تلگرام' : 'Telegram Broadcast'}</span>
              </h3>
              <textarea
                rows={4}
                value={broadcast}
                onChange={(e) => setBroadcast(e.target.value)}
                placeholder="Write announcement..."
                className="w-full bg-[#080a0e] border border-[#222836] rounded-2xl p-3"
              />
              <button
                onClick={async () => {
                  const res = await apiFetch<{ sent: number }>('/api/admin/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({ message: broadcast }),
                  });
                  setBroadcast('');
                  setMsg(`Broadcast sent to ${res.sent} Telegram users.`);
                }}
                className="px-4 py-2 rounded-xl bg-[#2563eb] text-white font-bold"
              >
                Send Broadcast
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
