import { BarChart2 } from 'lucide-react';
import LocalOnlyBadge from './LocalOnlyBadge';

interface Props {
  rightContent?: React.ReactNode;
}

export default function AppHeader({ rightContent }: Props) {
  return (
    <header className="border-b border-ink-border bg-ink/90 backdrop-blur-xl sticky top-0 z-30" role="banner" aria-label="Application header">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
            <BarChart2 className="w-4 h-4 text-accent-bright" />
          </div>
          <span className="font-bold text-paper text-sm tracking-tight whitespace-nowrap">VKAnalyze</span>
          <LocalOnlyBadge />
        </div>
        {rightContent && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {rightContent}
          </div>
        )}
      </div>
    </header>
  );
}
