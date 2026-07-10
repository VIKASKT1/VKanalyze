import { motion } from 'framer-motion';
import { Home, ArrowRight, Search } from 'lucide-react';
import SiteNav from '../ui/SiteNav';
import SiteFooter from '../ui/SiteFooter';
import SkipLink from '../ui/SkipLink';
import { GradientMesh } from '../ui/primitives';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
}

const SUGGESTIONS: Array<[string, string]> = [
  ['Features', 'features'],
  ['FAQ', 'faq'],
  ['About', 'about'],
  ['Support', 'support'],
];

export default function NotFoundPage({ onNavigate, onGetStarted }: Props) {
  return (
    <div className="min-h-screen bg-ink text-paper font-sans flex flex-col">
      <SkipLink />
      <SiteNav onNavigate={onNavigate} onGetStarted={onGetStarted} />

      <main id="main-content" className="relative flex-1 flex items-center overflow-hidden px-4 sm:px-6 py-20">
        <GradientMesh />
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-lg mx-auto text-center relative"
        >
          <p className="font-display text-8xl text-accent-bright/80 mb-2 select-none">404</p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-paper mb-3 tracking-tight">This page didn't parse</h1>
          <p className="text-paper-dim mb-10 leading-relaxed">
            The page you're looking for doesn't exist or may have moved. Let's get you back on track.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <button
              onClick={() => onNavigate('home')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-paper hover:bg-white text-ink font-semibold rounded-xl transition-colors"
            >
              <Home className="w-4 h-4" /> Back to home
            </button>
            <button
              onClick={() => onNavigate('faq')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-transparent hover:bg-ink-raised border border-ink-border text-paper font-semibold rounded-xl transition-colors"
            >
              <Search className="w-4 h-4" /> Search FAQ
            </button>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {SUGGESTIONS.map(([label, page]) => (
              <button
                key={page}
                onClick={() => onNavigate(page)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-ink-raised border border-ink-border text-xs text-paper-dim hover:text-paper hover:border-ink-borderStrong transition-colors"
              >
                {label} <ArrowRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        </motion.div>
      </main>

      <SiteFooter onNavigate={onNavigate} />
    </div>
  );
}
