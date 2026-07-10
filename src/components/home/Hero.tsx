import { motion } from 'framer-motion';
import { ArrowRight, FileText, Code2, Brain, Star } from 'lucide-react';
import DataTransformHero from '../DataTransformHero';
import AnimatedCounter from '../ui/AnimatedCounter';
import { LocalBadge, GradientMesh } from '../ui/primitives';

interface Props {
  onGetStarted: () => void;
  onSeeFeatures: () => void;
  feedbackStats: { avg: number; count: number } | null;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export default function Hero({ onGetStarted, onSeeFeatures, feedbackStats }: Props) {
  return (
    <section className="relative overflow-hidden pt-16 pb-24 px-4 sm:px-6">
      <GradientMesh />
      <div className="max-w-7xl mx-auto relative grid lg:grid-cols-[1.05fr,0.95fr] gap-16 items-center">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex mb-7"
          >
            <LocalBadge className="px-3.5 py-1.5 rounded-full bg-ink-raised border border-ink-border" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.08 }}
            className="text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold text-paper leading-[1.06] mb-6 tracking-tight"
          >
            Your spreadsheet,<br />
            <span className="font-display italic text-accent-bright font-normal">structured.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.16 }}
            className="text-base sm:text-lg text-paper-dim max-w-xl mb-9 leading-relaxed"
          >
            Upload a CSV, Excel, TSV, or JSON file and get profiling, cleaning, SQL, dashboards, and AI-assisted
            insights — without your raw data ever leaving your browser.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.24 }}
            className="flex flex-col sm:flex-row gap-3 mb-9"
          >
            <button
              onClick={onGetStarted}
              className="group relative flex items-center justify-center gap-2 px-7 py-3.5 bg-paper hover:bg-white text-ink font-semibold rounded-xl transition-colors text-base overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-2">
                Start analyzing free <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
            <button
              onClick={onSeeFeatures}
              className="flex items-center justify-center gap-2 px-7 py-3.5 bg-transparent hover:bg-ink-raised border border-ink-border text-paper font-semibold rounded-xl transition-colors text-base"
            >
              See what it does
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.32 }}
            className="flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-xs text-paper-dim"
          >
            <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-accent" />CSV · TSV · XLSX · JSON</span>
            <span className="flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5 text-accent" />SQL workspace</span>
            <span className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5 text-accent" />AI on request, never by default</span>
          </motion.div>

          {feedbackStats && feedbackStats.count >= 3 && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }}
              className="flex items-center gap-2 text-sm text-paper-dim mt-6"
            >
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} className={`w-4 h-4 ${i <= Math.round(feedbackStats.avg) ? 'fill-data text-data' : 'text-ink-border'}`} />
                ))}
              </div>
              <span>{feedbackStats.avg}/5 from <AnimatedCounter value={feedbackStats.count} /> users</span>
            </motion.div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
          className="flex justify-center lg:justify-end"
        >
          <DataTransformHero />
        </motion.div>
      </div>
    </section>
  );
}
