import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import SiteNav from './ui/SiteNav';
import SiteFooter from './ui/SiteFooter';
import SkipLink from './ui/SkipLink';
import Hero from './home/Hero';
import FeatureShowcase from './home/FeatureShowcase';
import WorkflowRail from './home/WorkflowRail';
import PrivacySection from './home/PrivacySection';
import { PersonasSection, TechStackSection } from './home/PersonasAndStack';
import CTASection from './home/CTASection';
import { Reveal, Stagger, StaggerItem } from './ui/motion';
import { SectionEyebrow } from './ui/primitives';
import { Target, Zap as ZapIcon, Lock } from 'lucide-react';

interface Props {
  onGetStarted: () => void;
  onNavigate?: (page: string) => void;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  link_text?: string;
  link_url?: string;
}

const announcementColors: Record<string, string> = {
  info: 'bg-accent/10 border-accent/30 text-accent-bright',
  warning: 'bg-data/10 border-data/30 text-data',
  success: 'bg-signal/10 border-signal/30 text-signal',
  error: 'bg-red-500/10 border-red-500/30 text-red-300',
};

const WHY_VKANALYZE = [
  { icon: Target, title: 'All-in-one platform', desc: 'No switching between tools. Upload, clean, analyze, visualize, and export from a single workspace.' },
  { icon: ZapIcon, title: 'AI that actually helps', desc: "Gemini doesn't just summarize — it answers questions, generates SQL, and surfaces anomalies you'd otherwise miss." },
  { icon: Lock, title: 'Privacy-first architecture', desc: 'Your data is parsed in your browser. Raw files are never uploaded. Stored metadata is protected by row-level security.' },
];

export default function HomePage({ onGetStarted, onNavigate }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [feedbackStats, setFeedbackStats] = useState<{ avg: number; count: number } | null>(null);

  function navigate(page: string) {
    if (onNavigate) onNavigate(page);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  useEffect(() => {
    // These are public read-only queries (announcements + aggregate feedback rating).
    // They don't require auth and never write data, so they're safe in all modes.
    // Failures (network offline, unconfigured Supabase) are silently ignored —
    // the UI simply shows nothing rather than crashing.
    void Promise.resolve(supabase.from('announcements').select('*').eq('active', true).order('created_at', { ascending: false }).limit(3))
      .then(({ data }) => { if (data) setAnnouncements(data as Announcement[]); })
      .catch(() => { /* offline or unconfigured — no announcements shown */ });

    void Promise.resolve(supabase.from('feedback').select('rating'))
      .then(({ data }) => {
        if (data && data.length > 0) {
          const avg = data.reduce((s, r) => s + r.rating, 0) / data.length;
          setFeedbackStats({ avg: Math.round(avg * 10) / 10, count: data.length });
        }
      })
      .catch(() => { /* offline or unconfigured — no rating shown */ });
  }, []);

  const visibleAnnouncements = announcements.filter(a => !dismissedIds.has(a.id));

  return (
    <div className="min-h-screen bg-ink text-paper font-sans">
      <SkipLink />
      <AnimatePresence initial={false}>
        {visibleAnnouncements.map(ann => (
          <motion.div
            key={ann.id}
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className={`overflow-hidden border-b px-4 py-2.5 flex items-center justify-between gap-4 text-sm ${announcementColors[ann.type] || announcementColors.info}`}
            role="status"
          >
            <div className="flex items-center gap-2 flex-1">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{ann.title}:</span>
              <span className="opacity-90">{ann.message}</span>
              {ann.link_url && ann.link_text && (
                <a href={ann.link_url} className="underline hover:opacity-75 transition-opacity ml-1">{ann.link_text}</a>
              )}
            </div>
            <button onClick={() => setDismissedIds(prev => new Set([...prev, ann.id]))} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss announcement">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      <SiteNav onNavigate={navigate} onGetStarted={onGetStarted} currentPage="home" />

      <main id="main-content">
        <Hero onGetStarted={onGetStarted} onSeeFeatures={() => scrollTo('features')} feedbackStats={feedbackStats} />

        <FeatureShowcase />

        <section id="why-vkanalyze" className="py-24 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <Reveal className="max-w-2xl mb-14">
              <SectionEyebrow>Why VKAnalyze</SectionEyebrow>
              <h2 className="text-3xl sm:text-4xl font-semibold text-paper tracking-tight">Not just another spreadsheet viewer</h2>
            </Reveal>
            <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {WHY_VKANALYZE.map(({ icon: Icon, title, desc }) => (
                <StaggerItem key={title} className="p-6 rounded-2xl bg-ink-surface border border-ink-border hover:border-ink-borderStrong transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-data/10 flex items-center justify-center mb-5">
                    <Icon className="w-6 h-6 text-data" />
                  </div>
                  <h3 className="text-lg font-semibold text-paper mb-2">{title}</h3>
                  <p className="text-sm text-paper-dim leading-relaxed">{desc}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        <WorkflowRail />

        <PersonasSection />

        <PrivacySection />

        <TechStackSection />

        <CTASection onGetStarted={onGetStarted} onLearnMore={() => navigate('about')} />
      </main>

      <SiteFooter onNavigate={navigate} />
    </div>
  );
}
