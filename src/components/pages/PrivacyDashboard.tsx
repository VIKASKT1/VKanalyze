import { useState, useEffect } from 'react';
import {
  Shield, Trash2, AlertTriangle, CheckCircle, Database,
  LayoutDashboard, Activity, MessageSquare, Key, RefreshCw, Lock,
  HardDrive, Cloud, Brain, ShieldOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  listDatasetPrivacy, setDatasetPrivacyLevel, type DatasetPrivacyRecord, type PrivacyLevel,
} from '../../lib/privacy';
import { estimateLocalUsage, idbClear, STORES } from '../../lib/db';
import { usePrivacy } from '../../lib/PrivacyContext';
import OverlayPageNav from '../OverlayPageNav';

interface Props {
  onNavigate: (page: string) => void;
  onBackToWorkspace?: () => void;
}

export default function PrivacyDashboard({ onNavigate, onBackToWorkspace }: Props) {
  const [stats, setStats] = useState({
    sessions: 0,
    chatMessages: 0,
    dashboards: 0,
    activityLogs: 0,
    versions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [clearing, setClearing] = useState<string | null>(null);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [datasets, setDatasets] = useState<DatasetPrivacyRecord[]>([]);
  const [localUsage, setLocalUsage] = useState<{ usageBytes: number; quotaBytes: number } | null>(null);
  const { settings, setLocalOnlyMode } = usePrivacy();

  useEffect(() => { loadStats(); loadLocalData(); }, []);

  async function loadLocalData() {
    const [ds, usage] = await Promise.all([listDatasetPrivacy(), estimateLocalUsage()]);
    setDatasets(ds.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    setLocalUsage(usage);
  }

  async function changeLevel(datasetId: string, datasetName: string, level: PrivacyLevel) {
    await setDatasetPrivacyLevel(datasetId, datasetName, level);
    loadLocalData();
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function loadStats() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [s, c, d, a, v] = await Promise.all([
      supabase.from('analysis_sessions').select('id', { count: 'exact', head: false }).eq('user_id', user.id),
      supabase.from('chat_messages').select('id', { count: 'exact', head: false }).eq('user_id', user.id),
      supabase.from('dashboards').select('id', { count: 'exact', head: false }).eq('user_id', user.id),
      supabase.from('activity_log').select('id', { count: 'exact', head: false }).eq('user_id', user.id),
      supabase.from('dataset_versions').select('id', { count: 'exact', head: false }).eq('user_id', user.id),
    ]);
    setStats({
      sessions: s.count ?? 0,
      chatMessages: c.count ?? 0,
      dashboards: d.count ?? 0,
      activityLogs: a.count ?? 0,
      versions: v.count ?? 0,
    });
    setLoading(false);
  }

  async function clearData(type: string) {
    setClearing(type);
    try {
      if (type === 'activity') await idbClear(STORES.ACTIVITY);
      if (type === 'chat') await idbClear(STORES.CHAT);
      if (type === 'sessions') await idbClear(STORES.SESSIONS);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (type === 'activity') await supabase.from('activity_log').delete().eq('user_id', user.id);
        if (type === 'chat') await supabase.from('chat_messages').delete().eq('user_id', user.id);
        if (type === 'sessions') await supabase.from('analysis_sessions').delete().eq('user_id', user.id);
        if (type === 'versions') await supabase.from('dataset_versions').delete().eq('user_id', user.id);
        if (type === 'dashboards') await supabase.from('dashboards').delete().eq('user_id', user.id);
      }
      setCleared(prev => new Set([...prev, type]));
      await loadStats();
      await loadLocalData();
    } catch { /* ignore */ }
    setClearing(null);
    setConfirmDelete(null);
  }

  async function deleteAccount() {
    if (deleteAccountConfirm !== 'DELETE') return;
    setDeletingAccount(true);
    setDeleteAccountError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDeleteAccountError('No active session. Please sign in again.');
        setDeletingAccount(false);
        return;
      }

      // The Edge Function deletes every user-owned table (including
      // profiles) and the auth.users row itself under the service-role
      // key — it must succeed before anything else happens. Deleting data
      // client-side first (the old behavior) meant a failed/undeployed
      // function left the auth account behind with no visible error.
      const res = await supabase.functions.invoke('delete-user', {
        body: { user_id: user.id },
      });

      if (res.error || res.data?.error) {
        setDeleteAccountError(res.error?.message ?? res.data?.error ?? 'Account deletion failed. Please try again.');
        setDeletingAccount(false);
        return;
      }

      // Edge Function succeeded: clear local IndexedDB and sign out everywhere.
      await Promise.allSettled(Object.values(STORES).map(store => idbClear(store)));
      await supabase.auth.signOut({ scope: 'global' });
      onNavigate('account-deleted');
    } catch (err) {
      setDeleteAccountError(err instanceof Error ? err.message : 'An unexpected error occurred. Account was NOT deleted.');
      setDeletingAccount(false);
    }
  }

  const DATA_ITEMS = [
    { id: 'sessions', label: 'Analysis Sessions', count: stats.sessions, icon: Database, desc: 'Saved dataset analysis sessions' },
    { id: 'chat', label: 'AI Chat Messages', count: stats.chatMessages, icon: MessageSquare, desc: 'Conversation history with the AI assistant' },
    { id: 'dashboards', label: 'Saved Dashboards', count: stats.dashboards, icon: LayoutDashboard, desc: 'Custom dashboard widget layouts' },
    { id: 'versions', label: 'Dataset Versions', count: stats.versions, icon: Key, desc: 'Dataset snapshot version history' },
    { id: 'activity', label: 'Activity Logs', count: stats.activityLogs, icon: Activity, desc: 'Record of actions performed in the app' },
  ];

  return (
    <div className="min-h-screen bg-ink text-paper">
      <OverlayPageNav title="Privacy" onNavigate={onNavigate} onBackToWorkspace={onBackToWorkspace} />

      <main id="main-content" className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-paper">Privacy Dashboard</h1>
            <p className="text-paper-dim text-sm">Manage your stored data and account</p>
          </div>
        </div>

        {/* Privacy notice */}
        <div className="p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl mb-6">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-300 mb-1">Local-First Architecture</p>
              <p className="text-sm text-paper-dim leading-relaxed">
                Parsing, statistics, SQL, and exports always run in your browser. Datasets default to
                "Local Only" — AI use and cloud sync require your explicit choice, per dataset, below.
              </p>
            </div>
          </div>
        </div>

        {/* Local Only Mode + storage usage */}
        <div className="bg-ink-surface border border-ink-border rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldOff className={`w-4 h-4 ${settings.localOnlyMode ? 'text-emerald-400' : 'text-paper-dim'}`} />
              <h3 className="text-base font-semibold text-paper">Local Only Mode</h3>
            </div>
            <button
              onClick={() => setLocalOnlyMode(!settings.localOnlyMode)}
              className={`relative w-11 h-6 rounded-full transition-colors ${settings.localOnlyMode ? 'bg-emerald-600' : 'bg-ink-borderStrong'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.localOnlyMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <p className="text-xs text-paper-dim mb-4">
            {settings.localOnlyMode
              ? 'On — no AI requests, no cloud sync, for every dataset, right now.'
              : 'Off — datasets set to "AI Enabled" or "Cloud Sync Enabled" below may use the network.'}
          </p>
          <div className="flex items-center gap-2 text-xs text-paper-dim">
            <HardDrive className="w-3.5 h-3.5" />
            {localUsage
              ? `~${formatBytes(localUsage.usageBytes)} stored locally in this browser (IndexedDB)`
              : 'Local storage usage unavailable in this browser'}
          </div>
        </div>

        {/* Per-dataset privacy levels */}
        <div className="bg-ink-surface border border-ink-border rounded-2xl p-6 mb-6">
          <h3 className="text-base font-semibold text-paper mb-4">Dataset Privacy Levels</h3>
          {datasets.length === 0 ? (
            <p className="text-sm text-paper-dim">No datasets analyzed in this browser yet.</p>
          ) : (
            <div className="space-y-3">
              {datasets.map(ds => (
                <div key={ds.datasetId} className="p-4 bg-ink-raised/50 rounded-xl">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <span className="text-sm font-medium text-paper truncate">{ds.datasetName}</span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {([
                        { level: 'local' as const, label: '🔒 Local', icon: Lock },
                        { level: 'ai' as const, label: '🤖 AI', icon: Brain },
                        { level: 'cloud' as const, label: '☁ Cloud', icon: Cloud },
                      ]).map(opt => (
                        <button
                          key={opt.level}
                          onClick={() => changeLevel(ds.datasetId, ds.datasetName, opt.level)}
                          className={`px-2 py-1 rounded-lg text-xs font-medium transition border ${
                            ds.level === opt.level
                              ? 'bg-accent border-accent text-ink'
                              : 'bg-ink-raised border-ink-borderStrong text-paper-dim hover:border-ink-borderStrong'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-paper-dim">
                    <span>Stored locally: <span className="text-paper/90">Yes</span></span>
                    <span>Cloud sync: <span className="text-paper/90">{ds.cloudSyncEnabled ? 'On' : 'Off'}</span></span>
                    <span>Last AI use: <span className="text-paper/90">{ds.lastAIUsage ? new Date(ds.lastAIUsage).toLocaleDateString() : 'Never'}</span></span>
                    <span>Last cloud sync: <span className="text-paper/90">{ds.lastCloudSync ? new Date(ds.lastCloudSync).toLocaleDateString() : 'Never'}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stored data */}
        <div className="bg-ink-surface border border-ink-border rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-paper">Stored In The Cloud</h3>
              <p className="text-xs text-paper-dim mt-0.5">Only datasets set to "Cloud Sync Enabled" contribute here — others stay local.</p>
            </div>
            <button onClick={loadStats} className="p-1.5 rounded-lg hover:bg-ink-raised transition flex-shrink-0">
              <RefreshCw className={`w-4 h-4 text-paper-dim ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {DATA_ITEMS.map(item => (
                <div key={item.id} className="flex items-center gap-4 p-4 bg-ink-raised/50 rounded-xl">
                  <item.icon className="w-4 h-4 text-accent-bright flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-paper">{item.label}</div>
                    <div className="text-xs text-paper-dim">{item.desc}</div>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${item.count > 0 ? 'text-paper' : 'text-paper-dimmer'}`}>{item.count}</span>
                  {item.count > 0 && (
                    <button
                      onClick={() => setConfirmDelete(item.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear
                    </button>
                  )}
                  {cleared.has(item.id) && (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confirm clear dialog */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-ink-surface border border-ink-borderStrong rounded-2xl p-6 max-w-sm w-full">
              <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
              <h3 className="text-lg font-bold text-paper mb-2">Clear {DATA_ITEMS.find(d => d.id === confirmDelete)?.label}?</h3>
              <p className="text-paper-dim text-sm mb-5">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => clearData(confirmDelete)}
                  disabled={clearing === confirmDelete}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-paper text-sm font-semibold rounded-xl transition"
                >
                  {clearing === confirmDelete ? 'Clearing…' : 'Clear Data'}
                </button>
                <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm rounded-xl transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete account */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
          <h3 className="text-base font-semibold text-red-300 mb-2 flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Delete Account
          </h3>
          <p className="text-paper-dim text-sm mb-5">
            This will permanently delete all your data including sessions, chat history, dashboards, and your account. This cannot be undone.
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={deleteAccountConfirm}
              onChange={e => setDeleteAccountConfirm(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              className="w-full bg-ink-raised border border-red-500/30 text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-paper-dimmer"
            />
            {deleteAccountError && (
              <p className="text-sm text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {deleteAccountError}
              </p>
            )}
            <button
              onClick={deleteAccount}
              disabled={deleteAccountConfirm !== 'DELETE' || deletingAccount}
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-30 text-paper text-sm font-semibold rounded-xl transition"
            >
              {deletingAccount ? 'Deleting…' : 'Delete My Account'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
