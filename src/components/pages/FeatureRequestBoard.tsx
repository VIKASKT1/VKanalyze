import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, CheckCircle, AlertCircle, Lightbulb, Send, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageShell, PageHero } from '../ui/PageShell';
import { Stagger, StaggerItem } from '../ui/motion';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
}

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  votes: number;
  created_at: string;
  user_voted?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-ink-raised text-paper/90',
  planned: 'bg-accent/15 text-accent-bright',
  in_progress: 'bg-amber-500/20 text-amber-300',
  completed: 'bg-signal/20 text-signal',
  declined: 'bg-red-500/20 text-red-400',
};

export default function FeatureRequestBoard({ onNavigate, onGetStarted }: Props) {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [userId, setUserId] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: reqs } = await supabase.from('feature_requests').select('*').order('votes', { ascending: false });
    if (!reqs) { setLoading(false); return; }

    let votedIds = new Set<string>();
    if (user) {
      const { data: votes } = await supabase.from('feature_request_votes').select('feature_request_id').eq('user_id', user.id);
      votedIds = new Set((votes ?? []).map(v => v.feature_request_id));
    }

    setRequests(reqs.map(r => ({ ...r, user_voted: votedIds.has(r.id) })));
    setLoading(false);
  }

  async function vote(req: FeatureRequest) {
    if (!userId || votingId) return;
    setVotingId(req.id);
    try {
      if (req.user_voted) {
        await supabase.from('feature_request_votes').delete().eq('feature_request_id', req.id).eq('user_id', userId);
        await supabase.from('feature_requests').update({ votes: req.votes - 1 }).eq('id', req.id);
      } else {
        await supabase.from('feature_request_votes').insert({ feature_request_id: req.id, user_id: userId });
        await supabase.from('feature_requests').update({ votes: req.votes + 1 }).eq('id', req.id);
      }
      setRequests(prev => prev.map(r => r.id === req.id
        ? { ...r, votes: req.user_voted ? r.votes - 1 : r.votes + 1, user_voted: !req.user_voted }
        : r
      ));
    } catch { /* ignore */ }
    setVotingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) { onNavigate('auth'); return; }
    if (!form.title.trim() || !form.description.trim()) return;
    setSubmitStatus('sending');
    try {
      const { error } = await supabase.from('feature_requests').insert({
        user_id: userId,
        title: form.title.trim(),
        description: form.description.trim(),
        status: 'pending',
        votes: 0,
      });
      if (error) throw error;
      setSubmitStatus('success');
      setForm({ title: '', description: '' });
      setShowForm(false);
      loadRequests();
      setTimeout(() => setSubmitStatus('idle'), 3000);
    } catch {
      setSubmitStatus('error');
    }
  }

  return (
    <PageShell currentPage="features-board" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Community"
        icon={<Lightbulb className="w-8 h-8 text-accent-bright" />}
        title="Feature requests"
        description="Vote for features you want, or submit your own idea."
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-bright text-ink text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Request feature
          </button>
        </div>

        <AnimatePresence>
          {submitStatus === 'success' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 p-4 bg-signal/10 border border-signal/30 rounded-xl text-signal text-sm mb-6 overflow-hidden">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              Feature request submitted! It will appear once reviewed.
            </motion.div>
          )}

          {showForm && (
            <motion.form
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onSubmit={handleSubmit} className="bg-ink-surface border border-ink-border rounded-2xl p-6 mb-6 space-y-4 overflow-hidden"
            >
              <h3 className="text-base font-semibold text-paper flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                Submit a feature request
              </h3>
              <div>
                <label htmlFor="feature-title" className="block text-xs font-medium text-paper-dim mb-1.5">Title</label>
                <input id="feature-title" type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Feature title (be specific)" required
                  className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer transition-shadow" />
              </div>
              <div>
                <label htmlFor="feature-description" className="block text-xs font-medium text-paper-dim mb-1.5">Description</label>
                <textarea id="feature-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the feature and why it would be valuable..." required rows={4}
                  className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer resize-none transition-shadow" />
              </div>
              {submitStatus === 'error' && (
                <div className="flex items-center gap-2 text-red-400 text-sm" role="alert">
                  <AlertCircle className="w-4 h-4" />
                  Failed to submit. {!userId && 'Please sign in first.'}
                </div>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={submitStatus === 'sending'} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink text-sm font-semibold rounded-xl transition-colors">
                  <Send className="w-3.5 h-3.5" />
                  {submitStatus === 'sending' ? 'Submitting…' : 'Submit'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm rounded-xl transition-colors">Cancel</button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 text-paper-dim">
            <Lightbulb className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No feature requests yet. Be the first to submit one!</p>
          </div>
        ) : (
          <Stagger className="space-y-3">
            {requests.map(req => (
              <StaggerItem key={req.id} className="flex items-start gap-4 p-5 bg-ink-surface border border-ink-border rounded-xl hover:border-ink-borderStrong transition-colors">
                <button
                  onClick={() => vote(req)}
                  disabled={!userId || votingId === req.id}
                  className={`flex flex-col items-center justify-center min-w-[48px] py-2 rounded-xl border transition-colors ${
                    req.user_voted
                      ? 'bg-accent/10 border-accent/50 text-accent-bright'
                      : 'bg-ink-raised border-ink-borderStrong text-paper-dim hover:border-accent/50 hover:text-accent-bright'
                  } disabled:opacity-50`}
                >
                  <ChevronUp className="w-4 h-4" />
                  <span className="text-sm font-semibold">{req.votes}</span>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-paper">{req.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[req.status] ?? STATUS_COLORS.pending}`}>
                      {req.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-paper-dim leading-relaxed">{req.description}</p>
                  <p className="text-xs text-paper-dimmer mt-2">{new Date(req.created_at).toLocaleDateString()}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </PageShell>
  );
}
