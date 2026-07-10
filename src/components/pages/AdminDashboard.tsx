import { useState, useEffect } from 'react';
import {
  BarChart2, Users, Database, Brain, Activity, MessageSquare, Key,
  AlertTriangle, CheckCircle2, Shield, RefreshCw, Star,
  Lightbulb, LifeBuoy, Mail, ArrowLeft, Home,
  TrendingUp, Clock, AlertCircle, Loader2,
  Trash2, Archive, Search, ArrowUpDown, ArchiveRestore,
} from 'lucide-react';
import { supabase, logActivity } from '../../lib/supabase';
import SkipLink from '../ui/SkipLink';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import AdminUsersTab from './AdminUsersTab';

interface Props {
  onNavigate: (page: string) => void;
  userEmail: string;
  onBackToWorkspace?: () => void;
}

interface Stats {
  totalUsers: number;
  totalSessions: number;
  totalChats: number;
  totalFeedback: number;
  avgRating: number;
  openTickets: number;
  pendingRequests: number;
  geminiKeyUsage: Array<{ key_slot: number; success: boolean; request_type: string; error_type: string | null; created_at: string }>;
  recentActivity: Array<{ action: string; dataset_name: string | null; created_at: string }>;
  recentContacts: Array<{ name: string; email: string; subject: string | null; message: string; created_at: string }>;
  registrationsByDay: Array<{ date: string; count: number }>;
}

type TabId = 'overview' | 'users' | 'ai' | 'feedback' | 'tickets' | 'contacts' | 'announcements' | 'audit';

const TOOLTIP_STYLE = {
  backgroundColor: '#13161F',
  border: '1px solid #2A2E3A',
  borderRadius: 8,
  color: '#E8E6DF',
  fontSize: 11,
};

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'overview',      label: 'Overview',       icon: BarChart2 },
  { id: 'users',         label: 'Users',           icon: Users },
  { id: 'ai',            label: 'AI Monitoring',   icon: Brain },
  { id: 'feedback',      label: 'Feedback',        icon: Star },
  { id: 'tickets',       label: 'Tickets',         icon: LifeBuoy },
  { id: 'contacts',      label: 'Contacts',        icon: Mail },
  { id: 'announcements', label: 'Announcements',   icon: MessageSquare },
  { id: 'audit',         label: 'Audit Log',       icon: Activity },
];

export default function AdminDashboard({ onNavigate, userEmail, onBackToWorkspace }: Props) {
  const [stats, setStats] = useState<Partial<Stats>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      setIsAdmin(data?.role === 'admin');
      if (data?.role !== 'admin') setLoading(false);
    }
    checkRole();
  }, []);

  useEffect(() => { if (isAdmin) { loadStats(); } }, [isAdmin]);

  async function loadStats() {
    setRefreshing(true);
    try {
      const [
        usersRes, sessionsRes, chatsRes, feedbackRes, ticketsRes, requestsRes,
        geminiRes, activityRes, contactsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: false }),
        supabase.from('analysis_sessions').select('id', { count: 'exact', head: false }),
        supabase.from('chat_messages').select('id', { count: 'exact', head: false }),
        supabase.from('feedback').select('rating'),
        supabase.from('support_tickets').select('id', { count: 'exact', head: false }).eq('status', 'open'),
        supabase.from('feature_requests').select('id', { count: 'exact', head: false }).eq('status', 'pending'),
        supabase.from('gemini_key_usage').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('activity_log').select('action, dataset_name, created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('contacts').select('name, email, subject, message, created_at').order('created_at', { ascending: false }).limit(10),
      ]);

      const feedbackData = feedbackRes.data ?? [];
      const avgRating = feedbackData.length > 0
        ? feedbackData.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / feedbackData.length
        : 0;

      // Build registration chart data from profiles
      const allUsers = usersRes.data ?? [];
      const regMap: Record<string, number> = {};
      (allUsers as Array<{ id: string; created_at?: string }>).forEach(u => {
        const day = (u as { created_at?: string }).created_at?.slice(0, 10) ?? '';
        if (day) regMap[day] = (regMap[day] ?? 0) + 1;
      });
      const registrationsByDay = Object.entries(regMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, count]) => ({ date: date.slice(5), count }));

      setStats({
        totalUsers: usersRes.count ?? 0,
        totalSessions: sessionsRes.count ?? 0,
        totalChats: chatsRes.count ?? 0,
        totalFeedback: feedbackData.length,
        avgRating: Math.round(avgRating * 10) / 10,
        openTickets: ticketsRes.count ?? 0,
        pendingRequests: requestsRes.count ?? 0,
        geminiKeyUsage: (geminiRes.data ?? []) as Stats['geminiKeyUsage'],
        recentActivity: (activityRes.data ?? []) as Stats['recentActivity'],
        recentContacts: (contactsRes.data ?? []) as Stats['recentContacts'],
        registrationsByDay,
      });
    } catch (e) {
      console.error('Admin stats error:', e);
    }
    setLoading(false);
    setRefreshing(false);
  }

  // Contact user dialog state
  const [contactTarget, setContactTarget] = useState<{ id: string; email: string } | null>(null);
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactStatus, setContactStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [contactError, setContactError] = useState('');

  async function sendContactEmail() {
    if (!contactTarget || !contactSubject.trim() || !contactMessage.trim()) return;
    setContactStatus('sending');
    setContactError('');
    try {
      const res = await supabase.functions.invoke('admin-contact-user', {
        body: { to_email: contactTarget.email, subject: contactSubject.trim(), message: contactMessage.trim() },
      });
      if (res.error || res.data?.error) {
        setContactError(res.error?.message ?? res.data?.error ?? 'Failed to send email.');
        setContactStatus('error');
        return;
      }
      setContactStatus('success');
      setTimeout(() => {
        setContactTarget(null);
        setContactSubject('');
        setContactMessage('');
        setContactStatus('idle');
      }, 2000);
    } catch (e) {
      setContactError(e instanceof Error ? e.message : 'Unexpected error.');
      setContactStatus('error');
    }
  }

  if (loading && !isAdmin) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <div className="text-center">
          <Shield className="w-14 h-14 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-paper mb-2">Access Denied</h1>
          <p className="text-paper-dim mb-6">You don't have admin access.</p>
          <button onClick={() => (onBackToWorkspace ? onBackToWorkspace() : onNavigate('upload'))} className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-bright text-ink rounded-xl text-sm font-semibold transition mx-auto">
            <ArrowLeft className="w-4 h-4" />
            Back to Workspace
          </button>
        </div>
      </div>
    );
  }

  const geminiStats = (stats.geminiKeyUsage ?? []).reduce((acc, r) => {
    const slot = `Key ${r.key_slot}`;
    if (!acc[slot]) acc[slot] = { success: 0, fail: 0 };
    if (r.success) acc[slot].success++; else acc[slot].fail++;
    return acc;
  }, {} as Record<string, { success: number; fail: number }>);

  return (
    <>
    <SkipLink />
    <div className="min-h-screen bg-ink text-paper">
      {/* Nav */}
      <nav className="border-b border-ink-border bg-ink/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => (onBackToWorkspace ? onBackToWorkspace() : onNavigate('upload'))} className="flex items-center gap-2 hover:opacity-80 transition flex-shrink-0">
              <BarChart2 className="w-5 h-5 text-accent-bright" />
              <span className="font-bold text-paper text-base hidden sm:block">VKAnalyze</span>
            </button>
            <span className="text-ink-borderStrong hidden sm:block">/</span>
            <span className="text-sm text-paper-dim flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => (onBackToWorkspace ? onBackToWorkspace() : onNavigate('upload'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-sm text-paper/90 transition"
            >
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Workspace</span>
            </button>
            <button
              onClick={() => { loadStats(); }}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-sm text-paper/90 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </nav>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-paper mb-0.5">Admin Dashboard</h1>
          <p className="text-paper-dim text-sm">{userEmail}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 mb-6 border-b border-ink-border overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap -mb-px ${
                activeTab === id
                  ? 'border-accent text-paper'
                  : 'border-transparent text-paper-dim hover:text-paper/90'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Users', value: stats.totalUsers ?? 0, icon: Users, color: 'text-accent-bright', bg: 'bg-accent/10' },
                    { label: 'Analysis Sessions', value: stats.totalSessions ?? 0, icon: Database, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    { label: 'AI Chat Messages', value: stats.totalChats ?? 0, icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                    { label: 'Open Tickets', value: stats.openTickets ?? 0, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    { label: 'Avg Rating', value: `${stats.avgRating ?? 0}/5`, icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                    { label: 'Total Feedback', value: stats.totalFeedback ?? 0, icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                    { label: 'Pending Requests', value: stats.pendingRequests ?? 0, icon: Lightbulb, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                    { label: 'AI Requests (100)', value: (stats.geminiKeyUsage ?? []).length, icon: Brain, color: 'text-rose-400', bg: 'bg-rose-500/10' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="p-4 bg-ink-surface border border-ink-border rounded-xl">
                      <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center mb-2.5`}>
                        <Icon className={`w-3.5 h-3.5 ${color}`} />
                      </div>
                      <div className="text-xl font-bold text-paper">{typeof value === 'number' ? value.toLocaleString() : value}</div>
                      <div className="text-xs text-paper-dim mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Registrations chart */}
                {(stats.registrationsByDay ?? []).length > 0 && (
                  <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-paper mb-4 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-accent-bright" />
                      User Registrations (last 14 days)
                    </h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={stats.registrationsByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />
                        <XAxis dataKey="date" tick={{ fill: '#6B6D73', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#6B6D73', fontSize: 10 }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="count" fill="#5B8DEF" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Recent activity */}
                <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-paper mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-paper-dim" />
                    Recent Platform Activity
                  </h3>
                  {(stats.recentActivity ?? []).length === 0 ? (
                    <p className="text-paper-dim text-sm">No activity recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(stats.recentActivity ?? []).slice(0, 10).map((a, i) => (
                        <div key={i} className="flex items-center gap-3 py-1.5 border-b border-ink-border/50 last:border-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                          <span className="text-sm text-paper/90 flex-1 truncate">{a.action}{a.dataset_name ? ` — ${a.dataset_name}` : ''}</span>
                          <span className="text-xs text-paper-dim flex-shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* USERS */}
            {activeTab === 'users' && (
              <AdminUsersTab
                onContactUser={(u) => setContactTarget(u)}
              />
            )}

            {/* AI MONITORING */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {Object.entries(geminiStats).length === 0 ? (
                    <div className="col-span-3 text-center py-12 text-paper-dim">
                      <Brain className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>No AI usage recorded yet.</p>
                    </div>
                  ) : Object.entries(geminiStats).map(([slot, data]) => {
                    const total = data.success + data.fail;
                    const pct = total > 0 ? ((data.success / total) * 100).toFixed(1) : '0';
                    return (
                      <div key={slot} className="bg-ink-surface border border-ink-border rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Key className="w-4 h-4 text-accent-bright" />
                          <span className="font-semibold text-paper">{slot}</span>
                        </div>
                        <div className="flex gap-4 mb-3">
                          <div>
                            <div className="text-lg font-bold text-emerald-400">{data.success}</div>
                            <div className="text-xs text-paper-dim">Success</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-red-400">{data.fail}</div>
                            <div className="text-xs text-paper-dim">Failed</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-paper">{total}</div>
                            <div className="text-xs text-paper-dim">Total</div>
                          </div>
                        </div>
                        <div className="h-1.5 bg-ink-raised rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-paper-dim mt-1">{pct}% success rate</div>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-paper mb-4">Recent AI Requests</h3>
                  <div className="space-y-1.5">
                    {(stats.geminiKeyUsage ?? []).slice(0, 20).map((r, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-ink-border/50 last:border-0">
                        {r.success
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          : <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        }
                        <span className="text-paper/90 flex-1">Key {r.key_slot} · {r.request_type}{r.error_type ? ` · ${r.error_type}` : ''}</span>
                        <span className="text-xs text-paper-dim">{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* FEEDBACK */}
            {activeTab === 'feedback' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-ink-surface border border-ink-border rounded-xl p-5 text-center">
                    <div className="text-4xl font-bold text-paper mb-1">{stats.avgRating ?? 0}</div>
                    <div className="flex justify-center gap-0.5 mb-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <Star key={i} className={`w-4 h-4 ${i <= Math.round(stats.avgRating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-paper-dimmer'}`} />
                      ))}
                    </div>
                    <div className="text-sm text-paper-dim">{stats.totalFeedback} reviews</div>
                  </div>
                </div>
                <FeedbackList />
              </div>
            )}

            {/* TICKETS */}
            {activeTab === 'tickets' && (
              <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-paper mb-4">Support Tickets</h3>
                <TicketList />
              </div>
            )}

            {/* CONTACTS */}
            {activeTab === 'contacts' && (
              <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-paper mb-4">Contact Submissions</h3>
                {(stats.recentContacts ?? []).length === 0 ? (
                  <p className="text-paper-dim text-sm">No contact submissions yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(stats.recentContacts ?? []).map((c, i) => (
                      <div key={i} className="p-4 bg-ink-raised/50 rounded-xl border border-ink-borderStrong">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <span className="text-sm font-semibold text-paper">{c.name}</span>
                          <span className="text-xs text-paper-dim flex-shrink-0">{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="text-xs text-accent-bright mb-1.5">{c.email}</div>
                        {c.subject && <div className="text-xs text-paper-dim mb-1 font-medium">{c.subject}</div>}
                        <p className="text-sm text-paper/90">{c.message}</p>
                        <a
                          href={`mailto:${c.email}?subject=Re: ${encodeURIComponent(c.subject ?? 'Your inquiry')}`}
                          className="inline-flex items-center gap-1.5 mt-2 text-xs text-accent-bright hover:text-accent-bright transition"
                        >
                          <Mail className="w-3 h-3" />
                          Reply via email
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ANNOUNCEMENTS */}
            {activeTab === 'announcements' && (
              <AnnouncementsPanel />
            )}

            {/* AUDIT LOG */}
            {activeTab === 'audit' && (
              <AuditLogPanel />
            )}
          </>
        )}
      </main>
    </div>

    {/* Contact User Modal */}
      {contactTarget && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onKeyDown={e => { if (e.key === 'Escape' && contactStatus !== 'sending') { setContactTarget(null); setContactSubject(''); setContactMessage(''); setContactStatus('idle'); setContactError(''); } }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-modal-title"
            className="bg-ink-surface border border-ink-borderStrong rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <h3 id="contact-modal-title" className="text-base font-semibold text-paper mb-1 flex items-center gap-2">
              <Mail className="w-4 h-4 text-accent-bright" />
              Contact User
            </h3>
            <p className="text-xs text-paper-dim mb-4">Sending email to: <span className="text-paper/90">{contactTarget.email}</span></p>

            <div className="space-y-3">
              <div>
                <label htmlFor="admin-contact-subject" className="block text-xs font-medium text-paper-dim mb-1">Subject</label>
                <input
                  id="admin-contact-subject"
                  type="text"
                  value={contactSubject}
                  onChange={e => setContactSubject(e.target.value)}
                  placeholder="Email subject"
                  className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
                  disabled={contactStatus === 'sending'}
                />
              </div>
              <div>
                <label htmlFor="admin-contact-message" className="block text-xs font-medium text-paper-dim mb-1">Message</label>
                <textarea
                  id="admin-contact-message"
                  value={contactMessage}
                  onChange={e => setContactMessage(e.target.value)}
                  placeholder="Your message to the user…"
                  rows={5}
                  className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer resize-none"
                  disabled={contactStatus === 'sending'}
                />
              </div>
              {contactError && (
                <p className="text-xs text-red-400 flex items-center gap-1" role="alert"><AlertCircle className="w-3 h-3" />{contactError}</p>
              )}
              {contactStatus === 'success' && (
                <p className="text-xs text-emerald-400 flex items-center gap-1" role="status"><CheckCircle2 className="w-3 h-3" />Email sent successfully!</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setContactTarget(null); setContactSubject(''); setContactMessage(''); setContactStatus('idle'); setContactError(''); }}
                  disabled={contactStatus === 'sending'}
                  className="flex-1 py-2.5 bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={sendContactEmail}
                  disabled={contactStatus === 'sending' || !contactSubject.trim() || !contactMessage.trim()}
                  className="flex-1 py-2.5 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
                >
                  {contactStatus === 'sending' ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : <><Mail className="w-4 h-4" />Send Email</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type FeedbackItem = {
  id: string;
  rating: number;
  message: string | null;
  title: string | null;
  email: string | null;
  user_id: string | null;
  status: 'open' | 'resolved' | 'archived';
  created_at: string;
};

type FeedbackSort = 'newest' | 'oldest' | 'rating_high' | 'rating_low';

function FeedbackList() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FeedbackSort>('newest');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('feedback')
      .select('id, rating, message, title, email, user_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setItems(data as FeedbackItem[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function updateStatus(item: FeedbackItem, status: FeedbackItem['status']) {
    setBusyId(item.id);
    const { error } = await supabase.from('feedback').update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    }).eq('id', item.id);
    if (!error) {
      setItems(prev => prev.map(f => f.id === item.id ? { ...f, status } : f));
      await logActivity(null, 'admin_feedback_moderate', `Marked feedback ${item.id} as ${status}`, { feedback_id: item.id, status });
      setToast(status === 'resolved' ? 'Marked resolved' : status === 'archived' ? 'Archived' : 'Reopened');
    } else {
      setToast('Action failed — please try again');
    }
    setBusyId(null);
  }

  async function deleteFeedback(item: FeedbackItem) {
    setBusyId(item.id);
    const { error } = await supabase.from('feedback').delete().eq('id', item.id);
    if (!error) {
      setItems(prev => prev.filter(f => f.id !== item.id));
      await logActivity(null, 'admin_feedback_delete', `Deleted feedback ${item.id}`, { feedback_id: item.id });
      setToast('Feedback deleted');
    } else {
      setToast('Delete failed — please try again');
    }
    setBusyId(null);
    setConfirmDeleteId(null);
  }

  const filtered = items
    .filter(f => showArchived ? f.status === 'archived' : f.status !== 'archived')
    .filter(f => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        (f.title ?? '').toLowerCase().includes(q) ||
        (f.email ?? '').toLowerCase().includes(q) ||
        (f.message ?? '').toLowerCase().includes(q) ||
        (f.user_id ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sort) {
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'rating_high': return b.rating - a.rating;
        case 'rating_low': return a.rating - b.rating;
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const STATUS_COLORS: Record<string, string> = {
    open: 'bg-amber-500/20 text-amber-300',
    resolved: 'bg-emerald-500/20 text-emerald-300',
    archived: 'bg-ink-raised text-paper-dim',
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-paper-dim text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading feedback…</div>;
  }

  return (
    <div className="space-y-3">
      {/* Search + sort + archived toggle */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-paper-dim absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search user, email, title, or message…"
            className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
          />
        </div>
        <div className="relative">
          <select
            value={sort}
            onChange={e => setSort(e.target.value as FeedbackSort)}
            className="appearance-none bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg pl-8 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="rating_high">Highest Rating</option>
            <option value="rating_low">Lowest Rating</option>
          </select>
          <ArrowUpDown className="w-3.5 h-3.5 text-paper-dim absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <button
          onClick={() => setShowArchived(a => !a)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition ${showArchived ? 'bg-accent/15 text-accent-bright border border-accent/30' : 'bg-ink-raised text-paper-dim border border-ink-borderStrong hover:text-paper'}`}
        >
          <Archive className="w-3.5 h-3.5" /> Archived
        </button>
      </div>

      {toast && (
        <div className="text-xs text-paper/90 bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-1.5 inline-block">{toast}</div>
      )}

      {!filtered.length && (
        <p className="text-paper-dim text-sm">
          {showArchived ? 'No archived feedback.' : query ? 'No feedback matches your search.' : 'No feedback yet.'}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map(f => (
          <div key={f.id} className="p-3 bg-ink-raised/50 rounded-xl border border-ink-borderStrong">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.status]}`}>{f.status}</span>
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`w-3.5 h-3.5 ${i <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-paper-dimmer'}`} />
              ))}
              {f.title && <span className="text-sm font-semibold text-paper">{f.title}</span>}
              <span className="text-xs text-paper-dim ml-auto">{new Date(f.created_at).toLocaleDateString()}</span>
            </div>
            {f.email && <p className="text-xs text-paper-dim mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> {f.email}</p>}
            {f.message && <p className="text-sm text-paper/90 mb-2">{f.message}</p>}

            <div className="flex items-center gap-1.5 flex-wrap">
              {f.status !== 'resolved' && (
                <button
                  onClick={() => updateStatus(f, 'resolved')}
                  disabled={busyId === f.id}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3 h-3" /> Mark Resolved
                </button>
              )}
              {f.status !== 'archived' ? (
                <button
                  onClick={() => updateStatus(f, 'archived')}
                  disabled={busyId === f.id}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-ink-raised hover:bg-ink-borderStrong text-paper-dim text-xs transition disabled:opacity-50"
                >
                  <Archive className="w-3 h-3" /> Archive
                </button>
              ) : (
                <button
                  onClick={() => updateStatus(f, 'open')}
                  disabled={busyId === f.id}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-ink-raised hover:bg-ink-borderStrong text-paper-dim text-xs transition disabled:opacity-50"
                >
                  <ArchiveRestore className="w-3 h-3" /> Restore
                </button>
              )}
              {confirmDeleteId === f.id ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="text-paper-dim">Delete permanently?</span>
                  <button
                    onClick={() => deleteFeedback(f)}
                    disabled={busyId === f.id}
                    className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-paper transition disabled:opacity-50"
                  >
                    {busyId === f.id ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-1 rounded-md bg-ink-raised hover:bg-ink-borderStrong text-paper-dim transition"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(f.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs transition ml-auto"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketList() {
  const [tickets, setTickets] = useState<Array<{
    id: string; type: string; title: string; description: string; status: string; email: string | null; created_at: string;
  }>>([]);

  useEffect(() => {
    supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (data) setTickets(data as typeof tickets); });
  }, []);

  if (!tickets.length) return <p className="text-paper-dim text-sm">No tickets yet.</p>;

  const STATUS_COLORS: Record<string, string> = {
    open: 'bg-amber-500/20 text-amber-300',
    in_progress: 'bg-accent/15 text-accent-bright',
    resolved: 'bg-emerald-500/20 text-emerald-300',
    closed: 'bg-ink-raised text-paper-dim',
  };

  return (
    <div className="space-y-2">
      {tickets.map(t => (
        <div key={t.id} className="p-4 bg-ink-raised/50 rounded-xl border border-ink-borderStrong">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status] ?? ''}`}>{t.status}</span>
            <span className="text-xs text-paper-dim px-2 py-0.5 rounded-full bg-ink-raised">{t.type}</span>
            <span className="text-sm font-semibold text-paper">{t.title}</span>
          </div>
          <p className="text-sm text-paper-dim mb-2">{t.description}</p>
          <div className="flex items-center gap-3 text-xs text-paper-dim">
            {t.email && <span>{t.email}</span>}
            <span>{new Date(t.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnnouncementsPanel() {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; message: string; created_at: string }>>([]);

  useEffect(() => {
    supabase.from('notifications')
      .select('id, title, message, created_at')
      .eq('type', 'announcement')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setAnnouncements(data as typeof announcements); });
  }, [sent]);

  async function sendAnnouncement() {
    if (!title.trim() || !text.trim()) return;
    setSending(true);
    await supabase.from('notifications').insert({ title: title.trim(), message: text.trim(), type: 'announcement', user_id: null });
    setSending(false);
    setSent(s => !s);
    setTitle('');
    setText('');
  }

  return (
    <div className="space-y-5">
      <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-paper mb-4 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent-bright" /> Send Announcement
        </h3>
        <div className="space-y-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Announcement title…"
            className="w-full px-3 py-2 bg-ink-raised border border-ink-borderStrong rounded-lg text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent"
          />
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Write your announcement to all users…"
            rows={4}
            className="w-full px-3 py-2 bg-ink-raised border border-ink-borderStrong rounded-lg text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent resize-none"
          />
          <button
            onClick={sendAnnouncement}
            disabled={sending || !title.trim() || !text.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-bright text-ink rounded-lg text-sm font-semibold transition disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Send to All Users
          </button>
        </div>
      </div>
      <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-paper mb-4">Previous Announcements</h3>
        {announcements.length === 0 ? (
          <p className="text-paper-dim text-sm">No announcements sent yet.</p>
        ) : (
          <div className="space-y-3">
            {announcements.map(a => (
              <div key={a.id} className="p-3 bg-ink-raised/50 rounded-xl border border-ink-borderStrong">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-paper">{a.title}</span>
                  <span className="text-xs text-paper-dim">{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-paper-dim">{a.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditLogPanel() {
  const [logs, setLogs] = useState<Array<{ id: string; user_id: string; action: string; dataset_name: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('activity_log')
      .select('id, user_id, action, dataset_name, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { if (data) setLogs(data as typeof logs); setLoading(false); });
  }, []);

  const ACTION_COLOR: Record<string, string> = {
    file_upload: 'bg-accent/15 text-accent-bright',
    dashboard_save: 'bg-emerald-500/20 text-emerald-300',
    dashboard_share: 'bg-purple-500/20 text-purple-300',
    sql_query: 'bg-amber-500/20 text-amber-300',
    account_delete: 'bg-red-500/20 text-red-300',
  };

  return (
    <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-paper flex items-center gap-2">
          <Activity className="w-4 h-4 text-paper-dim" /> Audit Log
        </h3>
        <span className="text-xs text-paper-dim">{logs.length} entries</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-paper-dim" /></div>
      ) : logs.length === 0 ? (
        <p className="text-paper-dim text-sm">No activity recorded.</p>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
          {logs.map(l => (
            <div key={l.id} className="flex items-center gap-3 py-2 border-b border-ink-border/50 last:border-0">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ACTION_COLOR[l.action] ?? 'bg-ink-raised text-paper/90'}`}>
                {l.action.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-paper-dim flex-1 truncate">
                {l.dataset_name ?? l.user_id.slice(0, 8) + '…'}
              </span>
              <span className="text-xs text-paper-dimmer flex-shrink-0">
                {new Date(l.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
