import { useState, useMemo, useCallback } from 'react';
import {
  LayoutDashboard, Table2, PieChart, Wand2, MessageSquare, Sparkles,
  LogOut, Upload, ChevronDown, User
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import AppHeader from './AppHeader';
import type { ParsedData } from '../lib/data-processing';
import type { ProfileData, ColumnStats } from '../lib/types';
import OverviewTab from './tabs/OverviewTab';
import PreviewTab from './tabs/PreviewTab';
import VisualizeTab from './tabs/VisualizeTab';
import CleanTab from './tabs/CleanTab';
import ChatTab from './tabs/ChatTab';
import InsightsTab from './tabs/InsightsTab';

type TabId = 'overview' | 'preview' | 'visualize' | 'clean' | 'chat' | 'insights';

interface Props {
  file: File;
  parsed: ParsedData;
  profile: ProfileData;
  userEmail: string;
  onReset: () => void;
}

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'preview', label: 'Preview', icon: Table2 },
  { id: 'visualize', label: 'Visualize', icon: PieChart },
  { id: 'clean', label: 'Clean', icon: Wand2 },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'insights', label: 'Insights', icon: Sparkles },
];

export default function VKAnalyzeApp({ file, parsed, profile, userEmail, onReset }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [cleanedRows, setCleanedRows] = useState<Record<string, unknown>[] | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const currentRows = cleanedRows ?? parsed.rows;

  const columnObjects = useMemo(() =>
    parsed.columns.map(col => {
      const s = profile.statistics[col] as ColumnStats;
      return { name: col, type: s?.mean !== undefined ? 'number' : 'string' };
    }),
    [parsed.columns, profile.statistics]
  );

  const handleCleaned = useCallback((rows: Record<string, unknown>[]) => {
    setCleanedRows(rows);
  }, []);

 // REPLACE with:
async function handleSignOut() {
  setUserMenuOpen(false);
  await supabase.auth.signOut();
}

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <AppHeader rightContent={
        <>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
          >
            <Upload className="w-3.5 h-3.5" />
            New File
          </button>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline max-w-[120px] truncate">{userEmail}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {userMenuOpen && (
           <>
           <div className="fixed inset-0 z-[100]" onMouseDown={() => setUserMenuOpen(false)} />
          <div className="fixed top-14 right-4 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-[200]">
           <div className="p-3 border-b border-slate-700">
            <p className="text-xs text-slate-400 truncate">{userEmail}</p>
           </div>
           <button
             onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition rounded-b-xl cursor-pointer"
            >
            <LogOut className="w-4 h-4" />
            Sign out
            </button>
          </div>
        </>
       )}
          </div>
        </>
      } />

      <div className="max-w-7xl mx-auto w-full px-4 py-6 flex-1">
        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                activeTab === id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'overview' && (
            <OverviewTab file={file} parsed={{ ...parsed, rows: currentRows }} profile={profile} />
          )}
          {activeTab === 'preview' && (
            <PreviewTab parsed={{ ...parsed, rows: currentRows }} datasetName={file.name.replace(/\.[^.]+$/, '')} />
          )}
          {activeTab === 'visualize' && (
            <VisualizeTab parsed={{ ...parsed, rows: currentRows }} statistics={profile.statistics as Record<string, ColumnStats>} />
          )}
          {activeTab === 'clean' && (
            <CleanTab
              columns={parsed.columns}
              rows={parsed.rows}
              onCleaned={handleCleaned}
            />
          )}
          {activeTab === 'chat' && (
            <ChatTab
              datasetName={file.name.replace(/\.[^.]+$/, '')}
              columns={columnObjects}
              statistics={profile.statistics as Record<string, ColumnStats>}
              rowCount={currentRows.length}
              qualityScore={profile.qualityScore}
              rows={currentRows}
            />
          )}
          {activeTab === 'insights' && (
            <InsightsTab
              datasetName={file.name.replace(/\.[^.]+$/, '')}
              columns={columnObjects}
              statistics={profile.statistics as Record<string, ColumnStats>}
              rowCount={currentRows.length}
              qualityScore={profile.qualityScore}
              rows={currentRows}
            />
          )}
        </div>
      </div>

     
      {userMenuOpen && (
      <div className="fixed inset-0 z-40" onMouseDown={() => setUserMenuOpen(false)} />
       )}
    </div>
  );
}
