import { useEffect, useState } from 'react';
import { KeyRound, Send, Shield, UserCheck, Users } from 'lucide-react';
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

export function AdminPage({
  lang,
  currentUser,
  onUserUpdated,
}: {
  lang: Lang;
  currentUser: { id: string; email: string; username: string; role: string };
  onUserUpdated: () => void;
}) {
  const isOwnerOrAdmin = currentUser.role === 'owner' || currentUser.role === 'admin';
  const [data, setData] = useState<AdminOverview | null>(null);
  const [helpText, setHelpText] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  // Personal Profile & Password form
  const [username, setUsername] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const load = async () => {
    if (!isOwnerOrAdmin) return;
    const res = await apiFetch<AdminOverview>('/api/admin/overview');
    setData(res);
    setHelpText(res.settings.help_text || '');
  };

  useEffect(() => {
    load().catch(() => {});
  }, [isOwnerOrAdmin]);

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ username }) });
    setMsg(lang === 'fa' ? 'نام کاربری ذخیره شد.' : 'Username updated.');
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
    setMsg(lang === 'fa' ? 'رمز عبور با موفقیت تغییر یافت.' : 'Password updated securely.');
  };

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs text-blue-200">{msg}</div>}

      {/* Account Profile & Security (Available for ALL Users) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <form onSubmit={updateProfile} className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'fa' ? 'پروفایل حساب کاربری' : 'Account Profile'}</span>
          </h3>
          <div className="text-slate-400">Email: <span className="text-white font-mono-num">{currentUser.email}</span> · Role: <span className="uppercase text-emerald-300">{currentUser.role}</span></div>
          <div className="flex gap-2">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" />
            <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold">Save</button>
          </div>
        </form>

        <form onSubmit={updatePassword} className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <span>{lang === 'fa' ? 'تغییر رمز عبور' : 'Security & Password'}</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current Password" className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" />
            <input required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New Password (min 6)" className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" />
          </div>
          <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold">Update Password</button>
        </form>
      </div>

      {/* Owner/Admin System Management */}
      {isOwnerOrAdmin && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400">Total Users</div>
              <div className="text-xl font-bold font-mono-num">{data.stats.totalUsers}</div>
            </div>
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400">Personal Bots</div>
              <div className="text-xl font-bold font-mono-num">{data.stats.botsCount}</div>
            </div>
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400">Total Trades</div>
              <div className="text-xl font-bold font-mono-num">{data.stats.trades?.total ?? 0}</div>
            </div>
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400">Signals Logged</div>
              <div className="text-xl font-bold font-mono-num">{data.stats.signalsCount}</div>
            </div>
          </div>

          <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 overflow-x-auto">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span>{lang === 'fa' ? 'مدیریت کاربران و ادمین‌ها' : 'Instance Users & Admin Controls'}</span>
            </h3>
            <table className="w-full text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2 text-start">User</th>
                  <th className="py-2 px-2 text-start">Telegram</th>
                  <th className="py-2 px-2 text-start">Role</th>
                  <th className="py-2 px-2 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-2">{u.username} <span className="text-slate-500">({u.email})</span></td>
                    <td className="py-2.5 px-2 font-mono-num">{u.telegram_id || '-'}</td>
                    <td className="py-2.5 px-2"><span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">{u.role}</span></td>
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
                              className="px-2 py-1 rounded bg-blue-600/20 text-blue-300"
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
                            className="px-2 py-1 rounded bg-rose-600/20 text-rose-300"
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
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>{lang === 'fa' ? 'ویرایش متن راهنمای ربات تلگرام' : 'Telegram Bot Help Message'}</span>
              </h3>
              <textarea rows={4} value={helpText} onChange={(e) => setHelpText(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3" />
              <button
                onClick={async () => {
                  await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ help_text: helpText }) });
                  setMsg('Help message updated.');
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold"
              >
                Save Help Text
              </button>
            </div>

            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-400" />
                <span>{lang === 'fa' ? 'ارسال پیام همگانی به کاربران تلگرام' : 'Telegram Broadcast'}</span>
              </h3>
              <textarea rows={4} value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="Write announcement..." className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3" />
              <button
                onClick={async () => {
                  const res = await apiFetch<{ sent: number }>('/api/admin/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({ message: broadcast }),
                  });
                  setBroadcast('');
                  setMsg(`Broadcast sent to ${res.sent} Telegram users.`);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold"
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
