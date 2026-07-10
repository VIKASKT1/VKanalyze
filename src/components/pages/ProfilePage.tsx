import { useState, useEffect } from 'react';
import { Calendar, Database, MessageSquare, Key, Save, CheckCircle, AlertCircle, Eye, EyeOff, Shield, Monitor, Smartphone, Globe, Clock, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isLocalOnlyMode, loadLocalSessions, countAllLocalChatMessages, countAllLocalVersions } from '../../lib/privacy';
import { idbClear, STORES } from '../../lib/db';
import type { StoreName } from '../../lib/db';
import OverlayPageNav from '../OverlayPageNav';

interface Props {
  onNavigate: (page: string) => void;
  onBackToWorkspace?: () => void;
}

export default function ProfilePage({ onNavigate, onBackToWorkspace }: Props) {
  const [user, setUser] = useState<{ email: string; id: string; created_at: string; full_name: string } | null>(null);
  const [stats, setStats] = useState({ sessions: 0, chats: 0, versions: 0 });
  const [loginHistory, setLoginHistory] = useState<Array<{ id: string; event_type: string; user_agent: string; created_at: string }>>([]);
  const [displayName, setDisplayName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });
  const [pwStatus, setPwStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [pwError, setPwError] = useState('');

  // Account deletion state
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) {
        setUser({
          email: u.email ?? '',
          id: u.id,
          created_at: u.created_at,
          full_name: u.user_metadata?.full_name ?? '',
        });
        setDisplayName(u.user_metadata?.full_name ?? '');

        (async () => {
          if (await isLocalOnlyMode()) {
            const [localSessions, chatCount, versionCount] = await Promise.all([
              loadLocalSessions(),
              countAllLocalChatMessages(),
              countAllLocalVersions(),
            ]);
            setStats({ sessions: localSessions.length, chats: chatCount, versions: versionCount });
            return;
          }
          const [s, c, v] = await Promise.all([
            supabase.from('analysis_sessions').select('id', { count: 'exact', head: false }).eq('user_id', u.id),
            supabase.from('chat_messages').select('id', { count: 'exact', head: false }).eq('user_id', u.id),
            supabase.from('dataset_versions').select('id', { count: 'exact', head: false }).eq('user_id', u.id),
          ]);
          setStats({ sessions: s.count ?? 0, chats: c.count ?? 0, versions: v.count ?? 0 });
        })();

        supabase.from('login_history')
          .select('id, event_type, user_agent, created_at')
          .eq('user_id', u.id)
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data }) => {
            if (data) setLoginHistory(data as Array<{ id: string; event_type: string; user_agent: string; created_at: string }>);
          });
      }
    });
  }, []);

  async function saveProfile() {
    setSaveStatus('saving');
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
    setSaveStatus(error ? 'error' : 'success');
    setTimeout(() => setSaveStatus('idle'), 3000);
  }

  async function changePassword() {
    setPwError('');
    if (!pwForm.newPw || pwForm.newPw !== pwForm.confirm) {
      setPwError('Passwords do not match.');
      return;
    }
    if (pwForm.newPw.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    setPwStatus('saving');
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
    if (error) {
      setPwError(error.message);
      setPwStatus('error');
    } else {
      setPwStatus('success');
      setPwForm({ current: '', newPw: '', confirm: '' });
    }
    setTimeout(() => setPwStatus('idle'), 3000);
  }

  async function deleteAccount() {
    if (!user) return;
    if (deleteConfirm.trim().toLowerCase() !== 'delete my account') {
      setDeleteError('Please type "delete my account" to confirm.');
      return;
    }

    setDeleteStatus('deleting');
    setDeleteError('');

    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setDeleteError('No active session. Please sign in again.');
        setDeleteStatus('error');
        return;
      }

      // Call the Edge Function — must succeed or we abort
      const res = await supabase.functions.invoke('delete-user', {
        body: { user_id: user.id },
      });

      if (res.error || res.data?.error) {
        const msg = res.error?.message ?? res.data?.error ?? 'Account deletion failed. Please try again.';
        setDeleteError(msg);
        setDeleteStatus('error');
        return;
      }

      // Edge function succeeded: clear all local IndexedDB data
      const storeNames = Object.values(STORES) as StoreName[];
      await Promise.allSettled(storeNames.map(s => idbClear(s)));

      // Sign out and invalidate all sessions
      await supabase.auth.signOut({ scope: 'global' });

      // Redirect to the account-deleted confirmation screen
      onNavigate('account-deleted');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'An unexpected error occurred. Account was NOT deleted.');
      setDeleteStatus('error');
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-paper">
      <OverlayPageNav title="Profile" onNavigate={onNavigate} onBackToWorkspace={onBackToWorkspace} />

      <main id="main-content" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-paper mb-1">Your Profile</h1>
          <p className="text-paper-dim">Manage your account settings and view usage statistics.</p>
        </div>

        {/* Account info */}
        <div className="bg-ink-surface border border-ink-border rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-dim flex items-center justify-center text-paper font-bold text-xl flex-shrink-0">
              {(user.full_name || user.email)[0].toUpperCase()}
            </div>
            <div>
              <div className="text-xl font-bold text-paper">{user.full_name || 'No name set'}</div>
              <div className="text-sm text-paper-dim">{user.email}</div>
              <div className="text-xs text-paper-dim mt-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { icon: Database, label: 'Sessions', value: stats.sessions, color: 'text-accent-bright' },
              { icon: MessageSquare, label: 'AI Chats', value: stats.chats, color: 'text-purple-400' },
              { icon: Key, label: 'Versions', value: stats.versions, color: 'text-emerald-400' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="text-center p-3 bg-ink-raised/50 rounded-xl">
                <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                <div className="text-lg font-bold text-paper">{value}</div>
                <div className="text-xs text-paper-dim">{label}</div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-paper-dim mb-1.5">Display Name</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="flex-1 bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
              />
              <button
                onClick={saveProfile}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink text-sm font-semibold rounded-lg transition"
              >
                {saveStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'success' ? 'Saved!' : 'Save'}
              </button>
            </div>
            {saveStatus === 'error' && (
              <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Failed to save. Try again.</p>
            )}
          </div>
        </div>

        {/* Change password */}
        <div className="bg-ink-surface border border-ink-border rounded-2xl p-6">
          <h3 className="text-base font-semibold text-paper mb-4 flex items-center gap-2">
            <Key className="w-4 h-4 text-accent-bright" />
            Change Password
          </h3>
          <div className="space-y-3">
            {(['newPw', 'confirm'] as const).map(field => (
              <div key={field}>
                <label className="block text-xs font-medium text-paper-dim mb-1.5">
                  {field === 'newPw' ? 'New Password' : 'Confirm New Password'}
                </label>
                <div className="relative">
                  <input
                    type={showPw[field === 'newPw' ? 'new' : 'confirm'] ? 'text' : 'password'}
                    value={pwForm[field]}
                    onChange={e => setPwForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={field === 'newPw' ? 'At least 6 characters' : 'Repeat new password'}
                    className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => ({ ...p, [field === 'newPw' ? 'new' : 'confirm']: !p[field === 'newPw' ? 'new' : 'confirm'] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-dim hover:text-paper"
                  >
                    {showPw[field === 'newPw' ? 'new' : 'confirm'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            {pwError && (
              <div className="flex items-center gap-2 text-red-400 text-xs p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {pwError}
              </div>
            )}
            {pwStatus === 'success' && (
              <div className="flex items-center gap-2 text-emerald-400 text-xs p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <CheckCircle className="w-3.5 h-3.5" />
                Password changed successfully!
              </div>
            )}
            <button
              onClick={changePassword}
              disabled={pwStatus === 'saving' || !pwForm.newPw}
              className="w-full py-2.5 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink text-sm font-semibold rounded-xl transition"
            >
              {pwStatus === 'saving' ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </div>

        {/* Login History */}
        <div className="bg-ink-surface border border-ink-border rounded-2xl p-6">
          <h3 className="text-base font-semibold text-paper mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent-bright" />
            Login History
          </h3>
          {loginHistory.length === 0 ? (
            <p className="text-sm text-paper-dim py-4 text-center">No login history recorded yet.</p>
          ) : (
            <div className="divide-y divide-ink-border">
              {loginHistory.map(entry => {
                const eventType: Record<string, { label: string; color: string }> = {
                  sign_in: { label: 'Sign In', color: 'text-emerald-400 bg-emerald-500/10' },
                  sign_out: { label: 'Sign Out', color: 'text-paper-dim bg-ink-raised' },
                  password_change: { label: 'Password Changed', color: 'text-amber-400 bg-amber-500/10' },
                  failed_attempt: { label: 'Failed Attempt', color: 'text-red-400 bg-red-500/10' },
                };
                const ev = eventType[entry.event_type] ?? { label: entry.event_type, color: 'text-paper-dim bg-ink-raised' };
                const ua = entry.user_agent ?? '';
                const isMobile = /Mobile|Android|iPhone/i.test(ua);
                const browser = /Chrome/i.test(ua) ? 'Chrome' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : /Edge/i.test(ua) ? 'Edge' : 'Unknown';
                const os = /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : /Android/i.test(ua) ? 'Android' : /iPhone|iOS/i.test(ua) ? 'iOS' : 'Unknown';

                return (
                  <div key={entry.id} className="flex items-center gap-4 py-3">
                    <div className="w-9 h-9 rounded-lg bg-ink-raised flex items-center justify-center flex-shrink-0">
                      {isMobile ? <Smartphone className="w-4 h-4 text-accent-bright" /> : <Monitor className="w-4 h-4 text-accent-bright" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ev.color}`}>{ev.label}</span>
                        <span className="text-xs text-paper-dim">{browser} on {os}</span>
                      </div>
                      <p className="text-xs text-paper-dim mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(entry.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <Globe className="w-4 h-4 text-paper-dimmer flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Danger Zone: Account Deletion ── */}
        <div className="bg-ink-surface border border-red-900/50 rounded-2xl p-6">
          <h3 className="text-base font-semibold text-red-400 mb-2 flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Danger Zone
          </h3>
          <p className="text-sm text-paper-dim mb-4">
            Permanently delete your account, all data, AI history, dashboards, and sessions. This cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 text-sm font-medium rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
              Delete My Account
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-paper/90">
                Type <span className="font-mono text-red-400 font-semibold">delete my account</span> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="delete my account"
                className="w-full bg-ink-raised border border-red-600/40 text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-paper-dimmer"
                disabled={deleteStatus === 'deleting'}
              />
              {deleteError && (
                <div className="flex items-start gap-2 text-red-400 text-xs p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirm(''); setDeleteError(''); setDeleteStatus('idle'); }}
                  disabled={deleteStatus === 'deleting'}
                  className="flex-1 py-2.5 bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm font-medium rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={deleteStatus === 'deleting' || deleteConfirm.trim().toLowerCase() !== 'delete my account'}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-paper text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
                >
                  {deleteStatus === 'deleting' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                  ) : (
                    <><Trash2 className="w-4 h-4" /> Permanently Delete</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
