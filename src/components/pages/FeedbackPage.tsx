import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Send, CheckCircle, AlertCircle, MessageSquareHeart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageShell, PageHero } from '../ui/PageShell';
import { Reveal, Stagger, StaggerItem } from '../ui/motion';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
}

interface FeedbackItem {
  id: string;
  name: string | null;
  rating: number;
  message: string | null;
  created_at: string;
}

export default function FeedbackPage({ onNavigate, onGetStarted }: Props) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [recent, setRecent] = useState<FeedbackItem[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);

  useEffect(() => {
    supabase.from('feedback').select('id, name, rating, message, created_at')
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => {
        if (data) {
          setRecent(data as FeedbackItem[]);
          if (data.length > 0) {
            setAvgRating(data.reduce((s, r) => s + r.rating, 0) / data.length);
          }
        }
      });

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.full_name) setName(user.user_metadata.full_name);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) return;
    setStatus('sending');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id ?? null,
        rating,
        message: message.trim() || null,
        name: name.trim() || null,
      });
      if (error) throw error;
      setStatus('success');
      setRating(0);
      setMessage('');
    } catch {
      setStatus('error');
    }
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const d = Math.floor(diff / 86400000);
    if (d < 1) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 30) return `${d} days ago`;
    return new Date(iso).toLocaleDateString();
  }

  return (
    <PageShell currentPage="feedback" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Feedback"
        icon={<MessageSquareHeart className="w-8 h-8 text-accent-bright" />}
        title="Share your feedback"
        description="Your feedback helps us improve VKAnalyze for everyone."
      />

      {avgRating !== null && recent.length > 0 && (
        <div className="flex items-center justify-center gap-2 -mt-10 mb-10">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
              <Star key={i} className={`w-5 h-5 ${i <= Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'text-paper-dimmer'}`} />
            ))}
          </div>
          <span className="text-paper font-semibold">{avgRating.toFixed(1)}</span>
          <span className="text-paper-dim text-sm">({recent.length} reviews)</span>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Reveal className="bg-ink-surface border border-ink-border rounded-2xl p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.div key="success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle className="w-12 h-12 text-signal mb-4" />
                  <h3 className="text-xl font-semibold text-paper mb-2">Thank you!</h3>
                  <p className="text-paper-dim mb-6">Your feedback means a lot to us.</p>
                  <button onClick={() => setStatus('idle')} className="px-6 py-2.5 bg-accent hover:bg-accent-bright text-ink rounded-lg text-sm font-medium transition-colors">
                    Submit another
                  </button>
                </motion.div>
              ) : (
                <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-paper mb-3" id="rating-label">Your rating <span className="text-red-400">*</span></label>
                    <div className="flex gap-2" role="radiogroup" aria-labelledby="rating-label">
                      {[1, 2, 3, 4, 5].map(i => (
                        <button key={i} type="button" role="radio" aria-checked={rating === i}
                          aria-label={`${i} star${i === 1 ? '' : 's'}`}
                          onClick={() => setRating(i)}
                          onMouseEnter={() => setHoverRating(i)} onMouseLeave={() => setHoverRating(0)}
                          onFocus={() => setHoverRating(i)} onBlur={() => setHoverRating(0)}
                          className="p-1 transition-transform hover:scale-110 rounded focus:outline-none focus:ring-2 focus:ring-accent">
                          <Star className={`w-8 h-8 transition-colors ${i <= (hoverRating || rating) ? 'fill-amber-400 text-amber-400' : 'text-paper-dimmer'}`} />
                        </button>
                      ))}
                    </div>
                    {rating > 0 && (
                      <p className="text-xs text-paper-dim mt-1" aria-live="polite">
                        {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="feedback-name" className="block text-xs font-medium text-paper-dim mb-1.5">Your name (optional)</label>
                    <input id="feedback-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Anonymous"
                      className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer transition-shadow" />
                  </div>
                  <div>
                    <label htmlFor="feedback-message" className="block text-xs font-medium text-paper-dim mb-1.5">Message (optional)</label>
                    <textarea id="feedback-message" value={message} onChange={e => setMessage(e.target.value)}
                      placeholder="What do you love? What can we improve?" rows={4}
                      className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer resize-none transition-shadow" />
                  </div>
                  {status === 'error' && (
                    <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg" role="alert">
                      <AlertCircle className="w-4 h-4" />
                      Failed to submit. Please try again.
                    </div>
                  )}
                  <button type="submit" disabled={rating === 0 || status === 'sending'}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink font-semibold rounded-xl transition-colors">
                    <Send className="w-4 h-4" />
                    {status === 'sending' ? 'Submitting…' : 'Submit feedback'}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </Reveal>

          <Reveal delay={0.1} className="space-y-4">
            <h3 className="text-lg font-semibold text-paper">Recent reviews</h3>
            {recent.length === 0 ? (
              <div className="text-center py-12 text-paper-dim">
                <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No reviews yet. Be the first!</p>
              </div>
            ) : (
              <Stagger className="space-y-3">
                {recent.filter(r => r.message).slice(0, 5).map(r => (
                  <StaggerItem key={r.id} className="bg-ink-surface border border-ink-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-paper">{r.name || 'Anonymous'}</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(i => (
                          <Star key={i} className={`w-3.5 h-3.5 ${i <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-paper-dimmer'}`} />
                        ))}
                      </div>
                    </div>
                    {r.message && <p className="text-sm text-paper-dim leading-relaxed">{r.message}</p>}
                    <p className="text-xs text-paper-dimmer mt-2">{timeAgo(r.created_at)}</p>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </Reveal>
        </div>
      </div>
    </PageShell>
  );
}
