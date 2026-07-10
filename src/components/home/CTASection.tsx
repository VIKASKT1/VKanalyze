import { ArrowRight, Zap } from 'lucide-react';
import { Reveal } from '../ui/motion';

interface Props {
  onGetStarted: () => void;
  onLearnMore: () => void;
}

export default function CTASection({ onGetStarted, onLearnMore }: Props) {
  return (
    <section className="py-24 px-4 sm:px-6 border-t border-ink-border">
      <Reveal className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-ink-raised border border-ink-border text-paper-dim text-xs font-mono mb-6">
          <Zap className="w-3.5 h-3.5 text-data" />
          Free to use · no credit card required
        </div>
        <h2 className="text-3xl sm:text-4xl font-semibold text-paper mb-4 tracking-tight">Ready to analyze your data?</h2>
        <p className="text-paper-dim mb-9 text-lg">Upload your first dataset and see structured insight in seconds.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onGetStarted}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-paper hover:bg-white text-ink font-semibold rounded-xl transition-colors text-base"
          >
            Start analyzing free <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={onLearnMore}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-transparent hover:bg-ink-raised border border-ink-border text-paper font-semibold rounded-xl transition-colors text-base"
          >
            Learn about VKAnalyze
          </button>
        </div>
      </Reveal>
    </section>
  );
}
