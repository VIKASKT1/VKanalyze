import { useState, useEffect } from 'react';
import { Clock, Upload, MessageSquare, FileText, Download, Wand2, Database, Search, Trash2, RefreshCw } from 'lucide-react';
import { loadActivityLog, clearActivityLog } from '../../lib/supabase';

interface Props {
  datasetName?: string;
}

interface ActivityEntry {
  id: string;
  dataset_name: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

const ACTION_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  upload:       { icon: Upload,       color: 'text-accent-bright',   bg: 'bg-accent/10' },
  ai_chat:      { icon: MessageSquare,color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ai_insights:  { icon: MessageSquare,color: 'text-purple-400', bg: 'bg-purple-500/10' },
  report:       { icon: FileText,     color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
  export:       { icon: Download,     color: 'text-sky-400',    bg: 'bg-sky-500/10' },
  clean:        { icon: Wand2,        color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  sql_query:    { icon: Database,     color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  default:      { icon: Clock,        color: 'text-paper-dim',  bg: 'bg-ink-raised' },
};

function getActionMeta(action: string) {
  for (const [key, val] of Object.entries(ACTION_META)) {
    if (action.startsWith(key)) return val;
  }
  return ACTION_META['default'];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ActivityTab({ datasetName }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [filterAction, setFilterAction] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [datasetName]);

  async function load() {
    setLoading(true);
    try {
      const data = await loadActivityLog(datasetName);
      setEntries((data ?? []) as ActivityEntry[]);
    } catch {
      // Non-critical — show empty state
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setShowClearConfirm(true);
  }

  async function confirmClearAll() {
    setShowClearConfirm(false);
    await clearActivityLog();
    setEntries([]);
  }

  const filtered = entries.filter(e => {
    const matchSearch = !search || e.action.toLowerCase().includes(search.toLowerCase()) || (e.details ?? '').toLowerCase().includes(search.toLowerCase());
    const matchAction = !filterAction || e.action.startsWith(filterAction);
    return matchSearch && matchAction;
  });

  const actionTypes = [...new Set(entries.map(e => e.action.split('_')[0]))];

  const grouped: Record<string, ActivityEntry[]> = {};
  for (const e of filtered) {
    const date = new Date(e.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(e);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-paper">Activity History</h2>
          <p className="text-sm text-paper-dim mt-0.5">{entries.length} total events recorded</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper-dim hover:text-paper transition">
            <RefreshCw className="w-4 h-4" />
          </button>
          {entries.length > 0 && (
            <button onClick={clearAll} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink-raised hover:bg-red-500/10 text-paper-dim hover:text-red-400 text-sm transition">
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search activity…"
            className="w-full pl-9 pr-3 py-2 bg-ink-surface border border-ink-border text-paper text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterAction('')} className={`px-3 py-2 rounded-lg text-xs font-medium transition ${!filterAction ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}>All</button>
          {actionTypes.map(t => {
            const meta = getActionMeta(t);
            return (
              <button key={t} onClick={() => setFilterAction(filterAction === t ? '' : t)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition capitalize ${filterAction === t ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}>
                <meta.icon className="w-3.5 h-3.5" />{t}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Clock className="w-10 h-10 text-paper-dimmer mb-3" />
          <p className="text-paper-dim font-medium">No activity recorded yet</p>
          <p className="text-paper-dim text-sm mt-1">Actions like uploads, AI requests, and exports will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-paper-dim uppercase tracking-wide mb-3">{date}</p>
              <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden divide-y divide-ink-border">
                {items.map(e => {
                  const meta = getActionMeta(e.action);
                  const Icon = meta.icon;
                  return (
                    <div key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-ink-raised/30 transition">
                      <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-paper capitalize">{e.action.replace(/_/g, ' ')}</span>
                          {e.dataset_name && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-ink-raised text-paper-dim">{e.dataset_name}</span>
                          )}
                        </div>
                        {e.details && <p className="text-xs text-paper-dim mt-0.5">{e.details}</p>}
                      </div>
                      <span className="text-xs text-paper-dim flex-shrink-0">{timeAgo(e.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-ink-raised border border-ink-borderStrong rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-paper mb-2">Clear Activity History?</h3>
            <p className="text-sm text-paper-dim mb-5">This will permanently delete all activity logs. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 text-sm text-paper-dim hover:text-paper transition">Cancel</button>
              <button onClick={confirmClearAll} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-paper rounded-lg transition">Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
