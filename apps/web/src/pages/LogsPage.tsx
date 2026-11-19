import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface AuditLog {
  id: string;
  category: string;
  level: string;
  symbol: string | null;
  message: string;
  details_json: string | null;
  created_at: string;
}

export function LogsPage({ lang }: { lang: Lang }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [category, setCategory] = useState('ALL');
  const [query, setQuery] = useState('');

  const load = async () => {
    const path = category === 'ALL' ? '/api/trading/logs' : `/api/trading/logs?category=${category}`;
    const res = await apiFetch<{ logs: AuditLog[] }>(path);
    setLogs(res.logs);
  };

  useEffect(() => {
    void load();
  }, [category]);

  const filtered = logs.filter((l) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return l.message.toLowerCase().includes(q) || (l.symbol ?? '').toLowerCase().includes(q) || l.category.toLowerCase().includes(q);
  });

  return (
    <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {['ALL', 'ORDER', 'RISK', 'AI', 'SYSTEM', 'TELEGRAM'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium ${
                category === cat ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute start-2.5 top-2.5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang === 'fa' ? 'جستجو در لاگ‌ها...' : 'Filter logs...'}
              className="bg-slate-950 border border-slate-800 rounded-xl ps-8 pe-3 py-1.5"
            />
          </div>
          <button onClick={load} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto text-xs font-mono-num">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-slate-500">No audit events recorded yet.</div>
        ) : (
          filtered.map((l) => (
            <div key={l.id} className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      l.level === 'ERROR'
                        ? 'bg-rose-500/20 text-rose-300'
                        : l.level === 'WARN'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {l.level}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">{l.category}</span>
                  {l.symbol && <span className="text-cyan-300 font-bold">{l.symbol}</span>}
                </div>
                <span className="text-slate-500 text-[10px]">{l.created_at}</span>
              </div>
              <div className="text-slate-200">{l.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
