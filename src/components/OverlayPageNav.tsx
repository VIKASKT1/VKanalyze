import { BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import SkipLink from './ui/SkipLink';

interface Props {
  title: string;
  onNavigate: (page: string) => void;
  /**
   * Returns the user to whichever screen they actually came from — the
   * active workspace if one exists, or the previous screen (e.g. Upload)
   * otherwise. Only absent in truly top-level entry (e.g. a direct link with
   * no prior screen at all), in which case Home is the only sane fallback.
   */
  onBackToWorkspace?: () => void;
}

/**
 * Shared top nav for "side" pages (Profile, Settings, Privacy, Workspaces,
 * Admin, Trust). Previously each of these pages hardcoded
 * onNavigate('upload') for its back button, which sent users to a blank
 * Upload screen even when they had an active workspace — discarding their
 * place in the app. Later, App.tsx started passing a real "back to wherever
 * you came from" handler via onBackToWorkspace, but this component still
 * hardcoded 'analyze'/'home' in two places (the logo button, and the
 * standalone fallback button) instead of using it — that mismatch is the
 * root cause of "Back" landing on Home even when a real previous screen
 * (e.g. Upload) was available.
 */
export default function OverlayPageNav({ title, onNavigate, onBackToWorkspace }: Props) {
  const goBack = onBackToWorkspace ?? (() => onNavigate('home'));
  return (
    <>
      <SkipLink />
      <nav className="border-b border-ink-border bg-ink/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={goBack}
            className="flex items-center gap-2 hover:opacity-80 transition flex-shrink-0"
            aria-label="VKAnalyze home"
          >
            <BarChart2 className="w-6 h-6 text-accent-bright" />
            <span className="font-bold text-paper text-lg tracking-tight hidden sm:inline">VKAnalyze</span>
          </button>
          {onBackToWorkspace && (
            <div className="flex items-center gap-1.5 text-sm text-paper-dim min-w-0">
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
              <button
                onClick={onBackToWorkspace}
                className="text-paper-dim hover:text-paper transition truncate"
              >
                Back
              </button>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-paper/90 truncate">{title}</span>
            </div>
          )}
        </div>

        <button
          onClick={goBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-bright text-ink text-sm font-semibold transition flex-shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
      </div>
    </nav>
    </>
  );
}
