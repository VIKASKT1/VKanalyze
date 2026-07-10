import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Ban, UserCheck, Trash2, Download, ChevronLeft, ChevronRight,
  Loader2, Mail, User as UserIcon, AlertCircle, ArrowUpDown, X,
  Database, Activity, ShieldOff, Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  email_verified: boolean;
  last_login: string | null;
  last_active: string | null;
  status: 'active' | 'suspended';
  total_dashboards: number;
  total_datasets: 'local_only';
  ai_requests: 'local_only';
  storage_used: 'local_only';
  local_only_mode: 'unknown';
}

type SortKey = 'created_at' | 'email' | 'role' | 'last_login' | 'last_active';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function initials(name: string | null, email: string): string {
  const src = (name && name.trim()) || email;
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function Avatar({ name, email }: { name: string | null; email: string }) {
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-dim flex items-center justify-center text-ink text-xs font-bold flex-shrink-0">
      {initials(name, email)}
    </div>
  );
}

/** A field VKAnalyze's local-first architecture genuinely cannot report from the server. */
function LocalOnlyValue() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-paper-dimmer"
      title="This data lives only in the user's own browser (IndexedDB) and is never sent to our servers — by design, admins cannot see it."
    >
      <Info className="w-3 h-3" />
      Local only
    </span>
  );
}

interface DetailModalState {
  user: AdminUserRow;
  section: 'profile' | 'activity' | 'datasets';
}

export default function AdminUsersTab({
  onContactUser,
}: {
  onContactUser: (user: { id: string; email: string }) => void;
}) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionPending, setActionPending] = useState<string | null>(null); // `${userId}:${action}`
  const [detail, setDetail] = useState<DetailModalState | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // We fetch a generously large page from the Edge Function (it returns
      // already-paginated server-side), then sort/paginate client-side for
      // instant column-sort interaction without a round trip per click.
      const res = await supabase.functions.invoke('admin-list-users', {
        body: { search, page: 0, page_size: 500 },
      });
      if (res.error || res.data?.error) {
        setError(res.error?.message ?? res.data?.error ?? 'Failed to load users.');
        setUsers([]);
        setTotal(0);
        return;
      }
      setUsers((res.data?.users ?? []) as AdminUserRow[]);
      setTotal(res.data?.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error loading users.');
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(0); }, [search]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    const copy = [...users];
    copy.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortKey) {
        case 'email': av = a.email.toLowerCase(); bv = b.email.toLowerCase(); break;
        case 'role': av = a.role; bv = b.role; break;
        case 'created_at': av = a.created_at; bv = b.created_at; break;
        case 'last_login': av = a.last_login ?? ''; bv = b.last_login ?? ''; break;
        case 'last_active': av = a.last_active ?? ''; bv = b.last_active ?? ''; break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [users, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function handleSuspendActivate(user: AdminUserRow, suspend: boolean) {
    const key = `${user.id}:${suspend ? 'suspend' : 'activate'}`;
    setActionPending(key);
    try {
      const res = await supabase.functions.invoke('admin-update-user-status', {
        body: { user_id: user.id, suspended: suspend },
      });
      if (res.error || res.data?.error) {
        alert(`Failed to ${suspend ? 'suspend' : 'activate'} user: ${res.error?.message ?? res.data?.error ?? 'Unknown error'}`);
      } else {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: suspend ? 'suspended' : 'active' } : u));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Unexpected error.');
    } finally {
      setActionPending(null);
    }
  }

  async function handleDelete(user: AdminUserRow) {
    if (!confirm(`Permanently delete ${user.email}?\n\nThis deletes their auth account and all associated server-side data. This cannot be undone.`)) return;
    const key = `${user.id}:delete`;
    setActionPending(key);
    try {
      const res = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: user.id },
      });
      if (res.error || res.data?.error) {
        alert(`Failed to delete user: ${res.error?.message ?? res.data?.error ?? 'Unknown error'}`);
      } else {
        setUsers(prev => prev.filter(u => u.id !== user.id));
        setTotal(t => Math.max(0, t - 1));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Unexpected error.');
    } finally {
      setActionPending(null);
    }
  }

  function exportCSV() {
    const header = ['ID', 'Email', 'Name', 'Role', 'Status', 'Created', 'Email Verified', 'Last Login', 'Last Active', 'Total Dashboards'];
    const rows = sorted.map(u => [
      u.id, u.email, u.full_name ?? '', u.role, u.status, u.created_at,
      String(u.email_verified), u.last_login ?? '', u.last_active ?? '', String(u.total_dashboards),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'vkanalyze-users.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <button
      onClick={() => toggleSort(sortKeyName)}
      className={`flex items-center gap-1 hover:text-paper transition-colors ${sortKey === sortKeyName ? 'text-accent-bright' : ''}`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2.5 bg-ink-surface border border-ink-border rounded-lg text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition"
          />
        </div>
        <button
          onClick={exportCSV}
          disabled={loading || sorted.length === 0}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-ink-raised border border-ink-border text-paper-dim hover:text-paper text-sm font-medium transition disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      <p className="text-xs text-paper-dim flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        Total Datasets, AI Requests, Storage Used, and Local Only Mode are tracked entirely in each
        user's own browser (IndexedDB) and never sent to our servers — they're not shown here because
        admins genuinely cannot see them, not because of a bug.
      </p>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={fetchUsers} className="ml-auto underline hover:no-underline">Retry</button>
        </div>
      )}

      <div className="bg-ink-surface border border-ink-border rounded-2xl overflow-hidden">
        <div className="hidden lg:grid grid-cols-[2fr,90px,90px,110px,110px,130px,170px] text-xs text-paper-dim uppercase tracking-wide border-b border-ink-border px-4 py-2.5 bg-ink-surface/50">
          <SortHeader label="User" sortKeyName="email" />
          <SortHeader label="Role" sortKeyName="role" />
          <span>Status</span>
          <SortHeader label="Joined" sortKeyName="created_at" />
          <SortHeader label="Last Login" sortKeyName="last_login" />
          <SortHeader label="Last Active" sortKeyName="last_active" />
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-paper-dim">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading users…</span>
          </div>
        ) : paged.length === 0 ? (
          <div className="text-center py-16 text-paper-dim text-sm">
            {search ? `No users match "${search}".` : 'No registered users yet.'}
          </div>
        ) : (
          paged.map(u => {
            const pendingKey = (action: string) => actionPending === `${u.id}:${action}`;
            return (
              <div
                key={u.id}
                className={`grid grid-cols-[1fr,auto] lg:grid-cols-[2fr,90px,90px,110px,110px,130px,170px] items-center gap-y-2 px-4 py-3 border-b border-ink-border/50 last:border-0 hover:bg-ink-raised/30 transition ${u.status === 'suspended' ? 'opacity-70' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={u.full_name} email={u.email} />
                  <div className="min-w-0">
                    <p className="text-sm text-paper truncate">{u.full_name || u.email || 'No name set'}</p>
                    <p className="text-xs text-paper-dim truncate">{u.email}</p>
                    <p className="text-xs text-paper-dimmer truncate lg:hidden mt-0.5">
                      {u.role} · {u.status} · Joined {fmtDate(u.created_at)}
                    </p>
                  </div>
                </div>
                <span className="hidden lg:block text-xs text-paper-dim capitalize">{u.role}</span>
                <span className="hidden lg:block">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${
                    u.status === 'suspended' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {u.status}
                  </span>
                </span>
                <span className="hidden lg:block text-xs text-paper-dim">{fmtDate(u.created_at)}</span>
                <span className="hidden lg:block text-xs text-paper-dim">{fmtDate(u.last_login)}</span>
                <span className="hidden lg:block text-xs text-paper-dim">{fmtDate(u.last_active)}</span>

                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => setDetail({ user: u, section: 'profile' })}
                    className="p-1.5 rounded-lg bg-ink-raised/70 hover:bg-ink-borderStrong text-paper/90 transition"
                    title="View Profile"
                  >
                    <UserIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDetail({ user: u, section: 'activity' })}
                    className="p-1.5 rounded-lg bg-ink-raised/70 hover:bg-ink-borderStrong text-paper/90 transition"
                    title="View Activity"
                  >
                    <Activity className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDetail({ user: u, section: 'datasets' })}
                    className="p-1.5 rounded-lg bg-ink-raised/70 hover:bg-ink-borderStrong text-paper/90 transition"
                    title="View Uploaded Datasets"
                  >
                    <Database className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onContactUser({ id: u.id, email: u.email })}
                    className="p-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent-bright transition"
                    title="Contact User"
                  >
                    <Mail className="w-3.5 h-3.5" />
                  </button>
                  {u.status === 'suspended' ? (
                    <button
                      onClick={() => handleSuspendActivate(u, false)}
                      disabled={pendingKey('activate')}
                      className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition disabled:opacity-50"
                      title="Activate"
                    >
                      {pendingKey('activate') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSuspendActivate(u, true)}
                      disabled={pendingKey('suspend')}
                      className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition disabled:opacity-50"
                      title="Suspend"
                    >
                      {pendingKey('suspend') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(u)}
                    disabled={pendingKey('delete')}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition disabled:opacity-50"
                    title="Delete User (permanent)"
                  >
                    {pendingKey('delete') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!loading && sorted.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-paper-dim">
            {total} user{total === 1 ? '' : 's'} · Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded bg-ink-raised hover:bg-ink-borderStrong text-paper-dim disabled:opacity-30 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded bg-ink-raised hover:bg-ink-borderStrong text-paper-dim disabled:opacity-30 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {detail && <UserDetailModal state={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

interface ActivityRow { action: string; dataset_name: string | null; details: string | null; created_at: string }
interface DatasetVersionRow { dataset_name: string; version_number: number; label: string; row_count: number | null; column_count: number | null; created_at: string }
interface DashboardRow { name: string; dataset_name: string | null; created_at: string }

function UserDetailModal({ state, onClose }: { state: DetailModalState; onClose: () => void }) {
  const { user, section } = state;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [datasetVersions, setDatasetVersions] = useState<DatasetVersionRow[]>([]);
  const [dashboards, setDashboards] = useState<DashboardRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (section === 'profile') { setLoading(false); return; }
    setLoading(true);
    setError('');
    supabase.functions.invoke('admin-user-detail', { body: { user_id: user.id, section } })
      .then(res => {
        if (cancelled) return;
        if (res.error || res.data?.error) {
          setError(res.error?.message ?? res.data?.error ?? 'Failed to load details.');
          return;
        }
        if (section === 'activity') setActivity((res.data?.activity ?? []) as ActivityRow[]);
        if (section === 'datasets') {
          setDatasetVersions((res.data?.dataset_versions ?? []) as DatasetVersionRow[]);
          setDashboards((res.data?.dashboards ?? []) as DashboardRow[]);
        }
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unexpected error.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.id, section]);

  const titles: Record<typeof section, string> = {
    profile: 'User Profile',
    activity: 'Activity Log',
    datasets: 'Datasets & Dashboards',
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-ink-surface border border-ink-borderStrong rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={user.full_name} email={user.email} />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-paper truncate">{titles[section]}</h3>
              <p className="text-xs text-paper-dim truncate">{user.full_name || user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ink-raised text-paper-dim transition flex-shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 -mx-2 px-2">
          {section === 'profile' && (
            <div className="space-y-3">
              {[
                ['Email', user.email],
                ['Name', user.full_name || '—'],
                ['Role', user.role],
                ['Status', user.status],
                ['Email Verified', user.email_verified ? 'Yes' : 'No'],
                ['Created', fmtDateTime(user.created_at)],
                ['Last Login', fmtDateTime(user.last_login)],
                ['Last Active', fmtDateTime(user.last_active)],
                ['Total Dashboards', String(user.total_dashboards)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm py-2 border-b border-ink-border/50 last:border-0">
                  <span className="text-paper-dim">{label}</span>
                  <span className="text-paper text-right">{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-paper-dim">Local Only Mode</span>
                <LocalOnlyValue />
              </div>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-paper-dim">Total Datasets (local)</span>
                <LocalOnlyValue />
              </div>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-paper-dim">AI Requests (local)</span>
                <LocalOnlyValue />
              </div>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-paper-dim">Storage Used (local)</span>
                <LocalOnlyValue />
              </div>
            </div>
          )}

          {section !== 'profile' && loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-paper-dim">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}

          {section !== 'profile' && !loading && error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {section === 'activity' && !loading && !error && (
            activity.length === 0 ? (
              <div className="text-center py-12 text-paper-dim text-sm">No activity recorded for this user yet.</div>
            ) : (
              <div className="space-y-2">
                {activity.map((a, i) => (
                  <div key={i} className="px-3 py-2.5 bg-ink-raised/50 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-paper capitalize">{a.action.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-paper-dim flex-shrink-0">{fmtDateTime(a.created_at)}</span>
                    </div>
                    {(a.dataset_name || a.details) && (
                      <p className="text-xs text-paper-dim mt-0.5 truncate">{a.details || a.dataset_name}</p>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {section === 'datasets' && !loading && !error && (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-paper-dim uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Info className="w-3 h-3" />
                  Saved dataset versions (server-recorded)
                </p>
                <p className="text-xs text-paper-dimmer mb-3">
                  VKAnalyze parses uploaded files entirely in the browser — raw files and most working
                  datasets never reach our servers. This list only shows datasets the user explicitly
                  saved as a named version; it is not a complete record of everything they've uploaded.
                </p>
                {datasetVersions.length === 0 ? (
                  <div className="text-center py-6 text-paper-dim text-sm bg-ink-raised/30 rounded-lg">No saved dataset versions.</div>
                ) : (
                  <div className="space-y-2">
                    {datasetVersions.map((v, i) => (
                      <div key={i} className="px-3 py-2.5 bg-ink-raised/50 rounded-lg flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-paper truncate">{v.dataset_name} <span className="text-paper-dim">v{v.version_number}</span></p>
                          <p className="text-xs text-paper-dim truncate">{v.label} · {v.row_count ?? '—'} rows × {v.column_count ?? '—'} cols</p>
                        </div>
                        <span className="text-xs text-paper-dim flex-shrink-0">{fmtDate(v.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-paper-dim uppercase tracking-wide mb-2">Dashboards</p>
                {dashboards.length === 0 ? (
                  <div className="text-center py-6 text-paper-dim text-sm bg-ink-raised/30 rounded-lg">No dashboards created.</div>
                ) : (
                  <div className="space-y-2">
                    {dashboards.map((d, i) => (
                      <div key={i} className="px-3 py-2.5 bg-ink-raised/50 rounded-lg flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-paper truncate">{d.name}</p>
                          {d.dataset_name && <p className="text-xs text-paper-dim truncate">{d.dataset_name}</p>}
                        </div>
                        <span className="text-xs text-paper-dim flex-shrink-0">{fmtDate(d.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {user.status === 'suspended' && (
          <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 flex-shrink-0">
            <ShieldOff className="w-3.5 h-3.5 flex-shrink-0" />
            This account is currently suspended.
          </div>
        )}
      </div>
    </div>
  );
}
