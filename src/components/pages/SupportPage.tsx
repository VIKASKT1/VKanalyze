import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, Lightbulb, LifeBuoy, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageShell, PageHero } from '../ui/PageShell';
import { Reveal } from '../ui/motion';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
}

const TICKET_TYPES = [
  { id: 'bug', label: 'Bug report', icon: Bug, color: 'text-red-400', bg: 'bg-red-500/10', desc: 'Something is not working correctly' },
  { id: 'feature', label: 'Feature request', icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-500/10', desc: 'Suggest a new feature or improvement' },
  { id: 'support', label: 'Support', icon: LifeBuoy, color: 'text-accent-bright', bg: 'bg-accent/10', desc: 'Get help with using VKAnalyze' },
  { id: 'other', label: 'Other', icon: Send, color: 'text-paper-dim', bg: 'bg-ink-raised', desc: 'Any other question or concern' },
];

export default function SupportPage({ onNavigate, onGetStarted }: Props) {
  const [selectedType, setSelectedType] = useState('support');
  const [form, setForm] = useState({ title: '', description: '', email: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    setStatus('sending');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('support_tickets').insert({
        user_id: user?.id ?? null,
        type: selectedType,
        title: form.title.trim(),
        description: form.description.trim(),
        email: form.email.trim() || user?.email || null,
        status: 'open',
      });
      if (error) throw error;
      setStatus('success');
      setForm({ title: '', description: '', email: '' });
    } catch {
      setStatus('error');
    }
  }

  return (
    <PageShell currentPage="support" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Support"
        icon={<LifeBuoy className="w-8 h-8 text-accent-bright" />}
        title="Support center"
        description="Submit a ticket and we'll get back to you as soon as possible."
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <AnimatePresence mode="wait">
          {status === 'success' ? (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-ink-surface border border-ink-border rounded-2xl p-12 text-center">
              <CheckCircle className="w-14 h-14 text-signal mx-auto mb-5" />
              <h3 className="text-2xl font-semibold text-paper mb-3">Ticket submitted</h3>
              <p className="text-paper-dim mb-6 max-w-sm mx-auto">We've received your request and will respond within 1-2 business days.</p>
              <button onClick={() => setStatus('idle')} className="px-6 py-2.5 bg-accent hover:bg-accent-bright text-ink rounded-lg text-sm font-medium transition-colors">
                Submit another ticket
              </button>
            </motion.div>
          ) : (
            <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleSubmit} className="space-y-6">
              <Reveal className="bg-ink-surface border border-ink-border rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-paper mb-4" id="ticket-type-label">Ticket type</h3>
                <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="ticket-type-label">
                  {TICKET_TYPES.map(({ id, label, icon: Icon, color, bg, desc }) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selectedType === id}
                      onClick={() => setSelectedType(id)}
                      className={`p-4 rounded-xl border text-left transition-colors ${
                        selectedType === id ? 'border-accent/50 bg-accent/10' : 'border-ink-borderStrong bg-ink-raised/50 hover:border-paper-dimmer'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                        <Icon className={`w-4 h-4 ${color}`} />
                      </div>
                      <div className="text-sm font-medium text-paper">{label}</div>
                      <div className="text-xs text-paper-dim mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={0.08} className="bg-ink-surface border border-ink-border rounded-2xl p-6 space-y-4">
                <div>
                  <label htmlFor="support-title" className="block text-xs font-medium text-paper-dim mb-1.5">Title <span className="text-red-400">*</span></label>
                  <input id="support-title" type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Brief summary of the issue" required
                    className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer transition-shadow" />
                </div>
                <div>
                  <label htmlFor="support-description" className="block text-xs font-medium text-paper-dim mb-1.5">Description <span className="text-red-400">*</span></label>
                  <textarea id="support-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Please provide as much detail as possible. Include steps to reproduce if it's a bug." required rows={5}
                    className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer resize-none transition-shadow" />
                </div>
                <div>
                  <label htmlFor="support-email" className="block text-xs font-medium text-paper-dim mb-1.5">Your email (optional)</label>
                  <input id="support-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="So we can follow up with you"
                    className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer transition-shadow" />
                </div>
                {status === 'error' && (
                  <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg" role="alert">
                    <AlertCircle className="w-4 h-4" />
                    Failed to submit ticket. Please try again.
                  </div>
                )}
                <button type="submit" disabled={status === 'sending'}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink font-semibold rounded-xl transition-colors">
                  <Send className="w-4 h-4" />
                  {status === 'sending' ? 'Submitting…' : 'Submit ticket'}
                </button>
              </Reveal>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-8 text-center">
          <p className="text-paper-dim text-sm">
            Looking for quick answers?{' '}
            <button onClick={() => onNavigate('faq')} className="text-accent-bright hover:underline">Check our FAQ</button>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
