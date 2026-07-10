import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Github, Linkedin, Send, CheckCircle, AlertCircle, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageShell, PageHero } from '../ui/PageShell';
import { Reveal } from '../ui/motion';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
}

export default function ContactPage({ onNavigate, onGetStarted }: Props) {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    setStatus('sending');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('contacts').insert({
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim() || null,
        message: form.message.trim(),
        user_id: user?.id ?? null,
      });
      if (error) throw error;
      setStatus('success');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setStatus('error');
    }
  }

  return (
    <PageShell currentPage="contact" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Contact"
        icon={<MessageCircle className="w-8 h-8 text-accent-bright" />}
        title="Get in touch"
        description="Have a question or want to get in touch? We'd love to hear from you."
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Reveal className="lg:col-span-2 space-y-5">
            <div className="bg-ink-surface border border-ink-border rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-paper mb-5">Get in touch</h3>
              <div className="space-y-3">
                <a href="mailto:vikasvikki010@gmail.com" className="flex items-center gap-3 p-3 rounded-xl bg-ink-raised/50 hover:bg-ink-raised transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-accent-bright" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-paper">Email</div>
                    <div className="text-xs text-paper-dim group-hover:text-accent-bright transition-colors">vikasvikki010@gmail.com</div>
                  </div>
                </a>
                <a href="https://github.com/VIKASKT1" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-ink-raised/50 hover:bg-ink-raised transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-ink-raised flex items-center justify-center">
                    <Github className="w-4 h-4 text-paper" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-paper">GitHub</div>
                    <div className="text-xs text-paper-dim group-hover:text-paper transition-colors">@VIKASKT1</div>
                  </div>
                </a>
                <a href="https://www.linkedin.com/in/vikas-k-t-a8b52931a" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-ink-raised/50 hover:bg-ink-raised transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center">
                    <Linkedin className="w-4 h-4 text-accent-bright" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-paper">LinkedIn</div>
                    <div className="text-xs text-paper-dim group-hover:text-accent-bright transition-colors">Vikas K T</div>
                  </div>
                </a>
              </div>
            </div>
            <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-paper mb-2">Response time</h4>
              <p className="text-xs text-paper-dim leading-relaxed">Typical response within 1-2 business days. For urgent issues, please use the <button onClick={() => onNavigate('support')} className="text-accent-bright hover:underline">support center</button>.</p>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-3">
            <div className="bg-ink-surface border border-ink-border rounded-2xl p-6 sm:p-8">
              <AnimatePresence mode="wait">
                {status === 'success' ? (
                  <motion.div key="success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle className="w-12 h-12 text-signal mb-4" />
                    <h3 className="text-xl font-semibold text-paper mb-2">Message sent</h3>
                    <p className="text-paper-dim mb-6">Thank you for reaching out. We'll get back to you soon.</p>
                    <button onClick={() => setStatus('idle')} className="px-6 py-2.5 bg-accent hover:bg-accent-bright text-ink rounded-lg text-sm font-medium transition-colors">
                      Send another message
                    </button>
                  </motion.div>
                ) : (
                  <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="contact-name" className="block text-xs font-medium text-paper-dim mb-1.5">Name <span className="text-red-400">*</span></label>
                        <input id="contact-name" type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Your name" required
                          className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer transition-shadow" />
                      </div>
                      <div>
                        <label htmlFor="contact-email" className="block text-xs font-medium text-paper-dim mb-1.5">Email <span className="text-red-400">*</span></label>
                        <input id="contact-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="you@example.com" required
                          className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer transition-shadow" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="contact-subject" className="block text-xs font-medium text-paper-dim mb-1.5">Subject</label>
                      <input id="contact-subject" type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                        placeholder="What is this about?"
                        className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer transition-shadow" />
                    </div>
                    <div>
                      <label htmlFor="contact-message" className="block text-xs font-medium text-paper-dim mb-1.5">Message <span className="text-red-400">*</span></label>
                      <textarea id="contact-message" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        placeholder="Tell us more..." required rows={5}
                        className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer resize-none transition-shadow" />
                    </div>
                    {status === 'error' && (
                      <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg" role="alert">
                        <AlertCircle className="w-4 h-4" />
                        Failed to send. Please try again or email directly.
                      </div>
                    )}
                    <button type="submit" disabled={status === 'sending'}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink font-semibold rounded-xl transition-colors">
                      <Send className="w-4 h-4" />
                      {status === 'sending' ? 'Sending…' : 'Send message'}
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </Reveal>
        </div>
      </div>
    </PageShell>
  );
}
