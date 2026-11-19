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
    <div className="surface-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {['ALL', 'ORDER', 'RISK', 'AI', 'SYSTEM', 'TELEGRAM'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-bold transition ${
                category === cat ? 'btn-cobalt' : 'surface-soft text-sub hover:text-main'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-dim absolute start-2.5 top-2.5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang === 'fa' ? 'جستجو در لاگ‌ها...' : 'Filter logs...'}
              className="surface-input rounded-xl ps-8 pe-3 py-1.5"
            />
          </div>
          <button onClick={load} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl surface-soft border text-main font-bold">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto text-xs font-mono-num">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-dim">No audit events recorded yet.</div>
        ) : (
          filtered.map((l) => (
            <div key={l.id} className="p-3.5 rounded-2xl surface-soft border space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                      l.level === 'ERROR'
                        ? 'bg-rose-500/15 text-loss'
                        : l.level === 'WARN'
                          ? 'bg-[#FF8A00]/15 text-flame'
                          : 'bg-[#10D856]/15 text-signal'
                    }`}
                  >
                    {l.level}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg surface-card text-sub text-[10px] font-bold">{l.category}</span>
                  {l.symbol && <span className="text-brand font-bold">{l.symbol}</span>}
                </div>
                <span className="text-dim text-[10px]">{l.created_at}</span>
              </div>
              <div className="text-main">{l.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
