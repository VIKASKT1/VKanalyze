import { BarChart2 } from 'lucide-react';

interface Props {
  rightContent?: React.ReactNode;
}

export default function AppHeader({ rightContent }: Props) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-[150]">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-blue-400" />
          <span className="font-bold text-white text-sm tracking-tight">VKAnalyze</span>
          <span className="hidden sm:inline text-xs text-slate-500 ml-1">AI-Powered Spreadsheet Analytics</span>
        </div>
        {rightContent && (
          <div className="flex items-center gap-2">
            {rightContent}
          </div>
        )}
      </div>
    </header>
  );
}
