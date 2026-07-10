import { Brain, Check, X, ShieldCheck } from 'lucide-react';

interface Props {
  open: boolean;
  onEnable: () => void;
  onStayLocal: () => void;
}

export default function AIConsentDialog({ open, onEnable, onStayLocal }: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="max-w-md w-full bg-ink-surface border border-ink-border rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center flex-shrink-0">
            <Brain className="w-5 h-5 text-accent-bright" />
          </div>
          <h2 id="ai-consent-title" className="text-base font-semibold text-paper">
            AI Features Require Cloud Processing
          </h2>
        </div>

        <p className="text-sm text-paper-dim mb-4 leading-relaxed">
          VKAnalyze's AI features (insights, chat, SQL generation) send a small, minimized
          payload to Google's Gemini API through our server. Your full dataset is never
          uploaded.
        </p>

        <div className="space-y-3 mb-5">
          <div className="bg-ink-raised border border-ink-border rounded-xl p-3.5">
            <p className="text-xs font-semibold text-emerald-400 mb-2 uppercase tracking-wide">May be sent</p>
            <ul className="space-y-1.5 text-xs text-paper/90">
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> Column names &amp; types</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> Aggregate statistics (mean, min, max, nulls)</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> Your typed question, in chat</li>
            </ul>
          </div>
          <div className="bg-ink-raised border border-ink-border rounded-xl p-3.5">
            <p className="text-xs font-semibold text-red-400 mb-2 uppercase tracking-wide">Never sent without further opt-in</p>
            <ul className="space-y-1.5 text-xs text-paper/90">
              <li className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /> Your entire dataset</li>
              <li className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /> Datasets marked "Local Only"</li>
              <li className="flex items-center gap-2"><X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /> Other users' data</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start gap-2 text-xs text-paper-dim mb-5">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Destination: Gemini AI (Google), via VKAnalyze's server. You can change this anytime in Settings.
        </div>

        <div className="flex gap-3">
          <button
            onClick={onStayLocal}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-ink-raised hover:bg-ink-borderStrong border border-ink-border text-paper transition"
          >
            Stay Local
          </button>
          <button
            onClick={onEnable}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-bright text-ink transition shadow-glow"
          >
            Enable AI
          </button>
        </div>
      </div>
    </div>
  );
}
