import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Table2, PieChart, Wand2, MessageSquare, Sparkles,
  LogOut, Upload, ChevronDown, User, GitBranch, Filter, ShieldCheck,
  BarChart3, Database, Clock, GitCommit, Merge, LayoutTemplate, Save,
  Shield, UserCircle, Bell, Lightbulb, BookOpen, GitCompare, BarChart2,
  Menu, X, Activity, FileSpreadsheet,
} from 'lucide-react';
import { supabase, logActivity } from '../lib/supabase';
import { prewarmAnalysisWorker } from '../hooks/useAnalysisWorker';
import AppHeader from './AppHeader';
import type { ParsedData } from '../lib/data-processing';
import type { ProfileData, ColumnStats } from '../lib/types';
import OverviewTab from './tabs/OverviewTab';
import PreviewTab from './tabs/PreviewTab';
import VisualizeTab from './tabs/VisualizeTab';
import CleanTab from './tabs/CleanTab';
import ChatTab from './tabs/ChatTab';
import InsightsTab from './tabs/InsightsTab';
import PivotTab from './tabs/PivotTab';
import AdvancedFilterTab from './tabs/AdvancedFilterTab';
import DataQualityTab from './tabs/DataQualityTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import SqlTab from './tabs/SqlTab';
import ActivityTab from './tabs/ActivityTab';
import VersionHistoryTab from './tabs/VersionHistoryTab';
import DataMergeTab from './tabs/DataMergeTab';
import DashboardTab from './tabs/DashboardTab';
import SavedSessionsTab from './tabs/SavedSessionsTab';
import AdvancedStatsTab from './tabs/AdvancedStatsTab';
import SmartRecommendationsTab from './tabs/SmartRecommendationsTab';
import { saveWorkspaceTab, loadWorkspaceTab, saveDerivedWorkspaceState, loadDerivedWorkspaceState } from '../lib/session-store';
import AIStorytellingTab from './tabs/AIStorytellingTab';
import DataComparisonTab from './tabs/DataComparisonTab';
import PerformanceTab from './tabs/PerformanceTab';
import NotificationCenter from './NotificationCenter';

type TabId =
  | 'overview' | 'preview' | 'visualize' | 'clean'
  | 'chat' | 'insights' | 'pivot' | 'filter' | 'quality' | 'analytics'
  | 'sql' | 'activity' | 'versions' | 'merge' | 'dashboards' | 'sessions'
  | 'advstats' | 'recommendations' | 'storytelling' | 'compare' | 'performance';

interface Props {
  file: File;
  parsed: ParsedData;
  profile: ProfileData;
  userEmail: string;
  onReset: () => void;
  onNavigate?: (page: string) => void;
}

const TABS: { id: TabId; label: string; icon: React.ElementType; group?: string }[] = [
  { id: 'overview',         label: 'Overview',       icon: LayoutDashboard,  group: 'Analyze' },
  { id: 'preview',          label: 'Preview',        icon: Table2,           group: 'Analyze' },
  { id: 'visualize',        label: 'Visualize',      icon: PieChart,         group: 'Analyze' },
  { id: 'clean',            label: 'Clean',          icon: Wand2,            group: 'Analyze' },
  { id: 'pivot',            label: 'Pivot',          icon: GitBranch,        group: 'Analyze' },
  { id: 'filter',           label: 'Filters',        icon: Filter,           group: 'Analyze' },
  { id: 'quality',          label: 'Quality',        icon: ShieldCheck,      group: 'Analyze' },
  { id: 'analytics',        label: 'Analytics',      icon: BarChart3,        group: 'Analyze' },
  { id: 'advstats',         label: 'Statistics',     icon: BarChart2,        group: 'Analyze' },
  { id: 'compare',          label: 'Compare',        icon: GitCompare,       group: 'Analyze' },
  { id: 'sql',              label: 'SQL',            icon: Database,         group: 'Query' },
  { id: 'chat',             label: 'Chat',           icon: MessageSquare,    group: 'AI' },
  { id: 'insights',         label: 'Insights',       icon: Sparkles,         group: 'AI' },
  { id: 'recommendations',  label: 'Recommend.',     icon: Lightbulb,        group: 'AI' },
  { id: 'storytelling',     label: 'Story',          icon: BookOpen,         group: 'AI' },
  { id: 'dashboards',       label: 'Dashboards',     icon: LayoutTemplate,   group: 'Manage' },
  { id: 'sessions',         label: 'Sessions',       icon: Save,             group: 'Manage' },
  { id: 'versions',         label: 'Versions',       icon: GitCommit,        group: 'Manage' },
  { id: 'merge',            label: 'Merge',          icon: Merge,            group: 'Manage' },
  { id: 'activity',         label: 'Activity',       icon: Clock,            group: 'Manage' },
  { id: 'performance',      label: 'Performance',    icon: Activity,         group: 'Manage' },
];

export default function VKAnalyzeApp({ file, parsed, profile, userEmail, onReset, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Restore last active tab from IndexedDB on mount
  useEffect(() => {
    loadWorkspaceTab().then(tab => {
      if (tab) setActiveTab(tab as TabId);
    });
  }, []);

  // PERFORMANCE FIX: register this dataset with the shared analysis worker
  // as soon as it's available, rather than waiting for the user to visit a
  // tab that needs it. The one-time structuredClone transfer cost (~3.3s
  // for 1,000,000 rows, profiled) then overlaps with normal browsing
  // (Overview/Preview/Visualize) instead of happening the moment someone
  // first clicks into Clean, Quality, or Pivot.
  useEffect(() => {
    prewarmAnalysisWorker(parsed.columns, parsed.rows);
  }, [parsed.columns, parsed.rows]);
  const [cleanedRows, setCleanedRows] = useState<Record<string, unknown>[] | null>(null);
  const [cleanedProfile, setCleanedProfile] = useState<ProfileData | null>(null);
  const [cleanedColumns, setCleanedColumns] = useState<string[] | null>(null);
  const [filteredRows, setFilteredRows] = useState<Record<string, unknown>[] | null>(null);
  const [mergedRows, setMergedRows] = useState<Record<string, unknown>[] | null>(null);
  const [mergedColumns, setMergedColumns] = useState<string[] | null>(null);
  const [derivedStateRestored, setDerivedStateRestored] = useState(false);

  // Restore the results of any cleaning/merge/filter operations already run
  // in this workspace, plus scroll position — covers a hard page refresh.
  // (SPA navigation to Profile/Settings/etc. no longer unmounts this
  // component at all, so that case never loses this state in the first
  // place; this only matters for an actual browser reload.)
  useEffect(() => {
    let cancelled = false;
    loadDerivedWorkspaceState().then(state => {
      if (cancelled || !state) { setDerivedStateRestored(true); return; }
      if (state.cleanedRows) setCleanedRows(state.cleanedRows);
      if (state.cleanedProfile) setCleanedProfile(state.cleanedProfile);
      if (state.cleanedColumns) setCleanedColumns(state.cleanedColumns);
      if (state.filteredRows) setFilteredRows(state.filteredRows);
      if (state.mergedRows) setMergedRows(state.mergedRows);
      if (state.mergedColumns) setMergedColumns(state.mergedColumns);
      if (state.scrollY) {
        // Defer until after this render commits and content has a chance to lay out.
        requestAnimationFrame(() => window.scrollTo({ top: state.scrollY }));
      }
      setDerivedStateRestored(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Persist derived state (debounced) whenever it changes, once initial
  // restore has completed (so we don't immediately overwrite a just-loaded
  // snapshot with the pre-restore empty values).
  useEffect(() => {
    if (!derivedStateRestored) return;
    const t = setTimeout(() => {
      saveDerivedWorkspaceState({
        cleanedRows, cleanedProfile, cleanedColumns, filteredRows, mergedRows, mergedColumns,
        scrollY: window.scrollY,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [derivedStateRestored, cleanedRows, cleanedProfile, cleanedColumns, filteredRows, mergedRows, mergedColumns]);

  // Track scroll position continuously so it's available to persist even if
  // no other state changes between visits.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    function onScroll() {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        saveDerivedWorkspaceState({
          cleanedRows, cleanedProfile, cleanedColumns, filteredRows, mergedRows, mergedColumns,
          scrollY: window.scrollY,
        });
      }, 400);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (t) clearTimeout(t);
    };
  }, [cleanedRows, cleanedProfile, cleanedColumns, filteredRows, mergedRows, mergedColumns]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const changeTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    saveWorkspaceTab(tab);
  }, []);

  // RENDER PERF FIX: previously `onContinueAnalysis={() => changeTab('preview')}`
  // was written inline at the CleanTab call site, creating a new function
  // reference every render — the one remaining thing that would have
  // defeated React.memo on CleanTab even with everything else stabilized.
  const continueToPreview = useCallback(() => changeTab('preview'), [changeTab]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      setIsAdmin(data?.role === 'admin');
    }
    checkRole();
  }, []);

  const currentColumns = useMemo(() => mergedColumns ?? cleanedColumns ?? parsed.columns, [mergedColumns, cleanedColumns, parsed.columns]);
  const currentRows = useMemo(() => filteredRows ?? mergedRows ?? cleanedRows ?? parsed.rows, [filteredRows, mergedRows, cleanedRows, parsed.rows]);

  // RENDER PERF FIX: Overview/Preview/Visualize each take a `ParsedData`
  // object. Previously it was built inline at the JSX call site —
  // `parsed={{ ...parsed, rows: currentRows, columns: currentColumns }}` —
  // allocating a brand-new object reference on every render of this
  // component regardless of whether currentRows/currentColumns actually
  // changed. Because those tabs (and useMemo hooks inside them) depend on
  // that object's identity, purely cosmetic state changes elsewhere here
  // (opening the user menu, the notification bell, the mobile tab dropdown)
  // forced a full re-render of whichever data tab was active. Building it
  // once here, keyed only on the values that can actually change, gives it a
  // stable reference across unrelated re-renders.
  const currentParsed = useMemo(
    () => ({ ...parsed, rows: currentRows, columns: currentColumns }),
    [parsed, currentRows, currentColumns]
  );

  // Use recomputed profile from cleaning if available, otherwise original
  const activeProfile = useMemo(() => cleanedProfile ?? profile, [cleanedProfile, profile]);

  const columnObjects = useMemo(() =>
    currentColumns.map(col => {
      const s = activeProfile.statistics[col] as ColumnStats;
      return { name: col, type: s?.mean !== undefined ? 'number' : 'string' };
    }),
    [currentColumns, activeProfile.statistics]
  );

  // datasetName must be declared before any useCallback that references it
  const datasetName = file.name.replace(/\.[^.]+$/, '');

  const handleCleaned = useCallback((rows: Record<string, unknown>[], _changes?: string[], newProfile?: ProfileData, newColumns?: string[]) => {
    setCleanedRows(rows);
    setFilteredRows(null);
    // newProfile is undefined both when there's nothing new to report AND when
    // cleaning is being reset — CleanTab now distinguishes the reset case by
    // also passing columns=undefined, so activeProfile correctly falls back to
    // the original profile instead of keeping a stale post-cleaning score.
    setCleanedProfile(newProfile ?? null);
    setCleanedColumns(newColumns ?? null);
    logActivity(datasetName, 'clean', `Applied cleaning rules — ${rows.length} rows`);
  }, [datasetName]);

  const handleFiltered = useCallback((rows: Record<string, unknown>[]) => {
    setFilteredRows(rows);
  }, []);

  const handleMerged = useCallback((rows: Record<string, unknown>[], cols: string[]) => {
    setMergedRows(rows);
    setMergedColumns(cols);
    setFilteredRows(null);
    setCleanedRows(null);
    setCleanedProfile(null);
    setCleanedColumns(null);
    logActivity(datasetName, 'merge', `Merged dataset — ${rows.length} rows, ${cols.length} columns`);
  }, [datasetName]);

  const handleRestoreVersion = useCallback((_rows: Record<string, unknown>[], cols: string[]) => {
    setMergedColumns(cols);
  }, []);

  async function handleSignOut() {
    // Root cause of Issue 5: previously ended with `window.location.href =
    // '/'`, forcing a full browser reload. supabase.auth.signOut() fires a
    // SIGNED_OUT event that App.tsx's onAuthStateChange listener already
    // handles — it resets session/appState/file/parsed/profile and clears
    // storage purely via React state, which unmounts this component
    // naturally. No reload needed, and forcing one was the actual bug.
    try {
      localStorage.clear();
      sessionStorage.clear();
      await supabase.auth.signOut();
    } catch {
      // If sign-out itself fails, there's nothing further this component
      // can safely do — App.tsx owns auth/session state.
    }
  }

  const groups = [...new Set(TABS.map(t => t.group))];

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tabIds = TABS.map(t => t.id);
    const idx = tabIds.indexOf(activeTab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      changeTab(tabIds[(idx + 1) % tabIds.length]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      changeTab(tabIds[(idx - 1 + tabIds.length) % tabIds.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      changeTab(tabIds[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      changeTab(tabIds[tabIds.length - 1]);
    }
  }, [activeTab, changeTab]);

  return (
    <div className="min-h-screen bg-ink flex flex-col font-sans" role="main" aria-label="VKAnalyze Data Analysis Application">
      <AppHeader rightContent={
        <>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong border border-ink-border text-paper-dim hover:text-paper text-sm font-medium transition flex-shrink-0"
            aria-label="Upload new file"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New File</span>
          </button>
          <button
            onClick={() => setNotifOpen(true)}
            className="p-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong border border-ink-border text-paper-dim hover:text-paper transition relative"
            aria-label="Notifications"
          >
            <Bell className="w-3.5 h-3.5" />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              onKeyDown={e => e.key === 'Escape' && setUserMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong border border-ink-border text-paper-dim hover:text-paper text-sm font-medium transition"
              aria-label="User menu" aria-expanded={userMenuOpen} aria-haspopup="true"
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline max-w-[120px] truncate">{userEmail}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-ink-surface border border-ink-border rounded-xl shadow-2xl z-50 overflow-hidden" role="menu" aria-label="User menu options">
                <div className="px-3.5 py-3 border-b border-ink-border">
                  <p className="text-xs text-paper-dim truncate">{userEmail}</p>
                </div>
                {onNavigate && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onNavigate('profile');
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition cursor-pointer"
                    role="menuitem"
                  >
                    <UserCircle className="w-4 h-4 text-paper-dim" />
                    Profile
                  </button>
                )}
                {onNavigate && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onNavigate('settings');
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition cursor-pointer"
                    role="menuitem"
                  >
                    <Shield className="w-4 h-4 text-paper-dim" />
                    Settings
                  </button>
                )}
                {onNavigate && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onNavigate('privacy-dashboard');
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition cursor-pointer"
                    role="menuitem"
                  >
                    <Shield className="w-4 h-4 text-emerald-400" />
                    Privacy
                  </button>
                )}
                {onNavigate && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onNavigate('workspaces');
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition cursor-pointer"
                    role="menuitem"
                  >
                    <Shield className="w-4 h-4 text-accent-bright" />
                    Workspaces
                  </button>
                )}
                {onNavigate && isAdmin && (
                  <button
                    onClick={() => { setUserMenuOpen(false); onNavigate('admin'); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-data hover:bg-data/10 transition cursor-pointer"
                    role="menuitem"
                  >
                    <Shield className="w-4 h-4" />
                    Admin Dashboard
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition border-t border-ink-border cursor-pointer"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </>
      } />

      {/* Dataset header — always visible, shows what workspace you're in,
          matching the Tableau/Power BI/Datadog convention of never hiding
          which dataset is currently active. */}
      <div className="border-b border-ink-border bg-ink-surface/60">
        <div className="max-w-7xl mx-auto w-full px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-ink-raised border border-ink-border flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-4 h-4 text-accent" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-paper truncate leading-tight">{datasetName}</h1>
              <p className="font-mono text-[11px] text-paper-dim leading-tight mt-0.5">
                {currentRows.length.toLocaleString()} rows · {currentColumns.length} columns
                {(cleanedRows || mergedRows || filteredRows) && (
                  <span className="text-accent-bright"> · modified</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`font-mono text-[11px] px-2 py-1 rounded-md border ${
                activeProfile.qualityScore >= 80
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : activeProfile.qualityScore >= 50
                  ? 'bg-data/10 border-data/25 text-data'
                  : 'bg-red-500/10 border-red-500/25 text-red-300'
              }`}
              title="Data quality score"
            >
              Quality {activeProfile.qualityScore}%
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-4 py-5 flex-1">
        {/* Mobile tab menu button */}
        <div className="flex items-center gap-2 mb-3 lg:hidden">
          <button
            onClick={() => setMobileMenuOpen(v => !v)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-ink-surface border border-ink-border rounded-xl text-sm text-paper/90 hover:text-paper transition w-full"
            aria-label="Toggle tab menu" aria-expanded={mobileMenuOpen}
          >
            <Menu className="w-4 h-4 text-paper-dim" />
            <span className="flex-1 text-left">{TABS.find(t => t.id === activeTab)?.label ?? 'Tabs'}</span>
            <ChevronDown className={`w-4 h-4 text-paper-dim transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Mobile tab drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden mb-4 bg-ink-surface border border-ink-border rounded-2xl p-3 shadow-2xl" role="menu">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] text-paper-dim uppercase tracking-wide font-medium">Navigation</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-paper-dim hover:text-paper transition" aria-label="Close tab menu">
                <X className="w-4 h-4" />
              </button>
            </div>
            {groups.map(group => (
              <div key={group} className="mb-3 last:mb-0">
                <p className="text-[10px] text-paper-dimmer uppercase tracking-wide px-1 mb-1.5 font-medium">{group}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {TABS.filter(t => t.group === group).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => { changeTab(id); setMobileMenuOpen(false); }}
                      className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl text-xs font-medium transition ${
                        activeTab === id
                          ? 'bg-accent text-ink'
                          : 'text-paper-dim hover:text-paper hover:bg-ink-raised'
                      }`}
                      role="menuitem"
                    >
                      <Icon className="w-4 h-4" />
                      <span className="truncate w-full text-center">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Desktop tab bar — grouped, horizontally scrollable so groups never
            wrap onto a second row at narrower desktop widths. */}
        <div
          className="hidden lg:flex items-stretch gap-2.5 mb-6 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
          role="tablist"
          aria-label="Analysis tabs"
          onKeyDown={handleTabKeyDown}
        >
          {groups.map(group => (
            <div key={group} className="flex items-center gap-1 bg-ink-surface border border-ink-border rounded-xl p-1 flex-shrink-0" role="group" aria-label={`${group} tabs`}>
              <span className="text-[10px] text-paper-dimmer uppercase tracking-wide px-2 font-medium select-none">{group}</span>
              {TABS.filter(t => t.group === group).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => changeTab(id)}
                  role="tab"
                  aria-selected={activeTab === id}
                  aria-controls={`tabpanel-${id}`}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 whitespace-nowrap ${
                    activeTab === id
                      ? 'bg-accent text-ink shadow-sm'
                      : 'text-paper-dim hover:text-paper hover:bg-ink-raised'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Tab content */}
        <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-label={`${TABS.find(t => t.id === activeTab)?.label ?? activeTab} content`}>
          {activeTab === 'overview' && (
            <OverviewTab file={file} parsed={currentParsed} profile={activeProfile} />
          )}
          {activeTab === 'preview' && (
            <PreviewTab parsed={currentParsed} datasetName={datasetName} />
          )}
          {activeTab === 'visualize' && (
            <VisualizeTab parsed={currentParsed} statistics={activeProfile.statistics as Record<string, ColumnStats>} />
          )}
          {activeTab === 'clean' && (
            <CleanTab
              columns={parsed.columns}
              rows={parsed.rows}
              profile={profile}
              datasetName={datasetName}
              onCleaned={handleCleaned}
              onContinueAnalysis={continueToPreview}
            />
          )}
          {activeTab === 'pivot' && (
            <PivotTab datasetName={datasetName} columns={currentColumns} rows={currentRows} />
          )}
          {activeTab === 'filter' && (
            <AdvancedFilterTab datasetName={datasetName} columns={currentColumns} rows={mergedRows ?? cleanedRows ?? parsed.rows} onFiltered={handleFiltered} />
          )}
          {activeTab === 'quality' && (
            <DataQualityTab
              columns={currentColumns}
              rows={currentRows}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
              qualityScore={activeProfile.qualityScore}
              duplicateRows={activeProfile.duplicateRows}
            />
          )}
          {activeTab === 'analytics' && (
            <AnalyticsTab
              columns={currentColumns}
              rows={currentRows}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
            />
          )}
          {activeTab === 'sql' && (
            <SqlTab columns={currentColumns} rows={currentRows} datasetName={datasetName} />
          )}
          {activeTab === 'chat' && (
            <ChatTab
              datasetName={datasetName}
              columns={columnObjects}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
              rowCount={currentRows.length}
              qualityScore={activeProfile.qualityScore}
              rows={currentRows}
            />
          )}
          {activeTab === 'insights' && (
            <InsightsTab
              datasetName={datasetName}
              columns={columnObjects}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
              rowCount={currentRows.length}
              qualityScore={activeProfile.qualityScore}
              rows={currentRows}
            />
          )}
          {activeTab === 'dashboards' && (
            <DashboardTab
              columns={currentColumns}
              rows={currentRows}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
              datasetName={datasetName}
              qualityScore={activeProfile.qualityScore}
            />
          )}
          {activeTab === 'sessions' && (
            <SavedSessionsTab
              datasetName={datasetName}
              rowCount={currentRows.length}
              columnCount={currentColumns.length}
              columns={currentColumns}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
              qualityScore={activeProfile.qualityScore}
              fileSize={file.size}
            />
          )}
          {activeTab === 'versions' && (
            <VersionHistoryTab
              datasetName={datasetName}
              currentRows={currentRows}
              currentColumns={currentColumns}
              onRestoreVersion={handleRestoreVersion}
            />
          )}
          {activeTab === 'merge' && (
            <DataMergeTab
              columns={currentColumns}
              rows={currentRows}
              datasetName={datasetName}
              onMerged={handleMerged}
            />
          )}
          {activeTab === 'activity' && (
            <ActivityTab datasetName={datasetName} />
          )}
          {activeTab === 'performance' && (
            <PerformanceTab
              rowCount={currentRows.length}
              columnCount={currentColumns.length}
            />
          )}
          {activeTab === 'advstats' && (
            <AdvancedStatsTab
              columns={columnObjects}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
              rows={currentRows}
            />
          )}
          {activeTab === 'recommendations' && (
            <SmartRecommendationsTab
              columns={columnObjects}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
              rows={currentRows}
              rowCount={currentRows.length}
              qualityScore={activeProfile.qualityScore}
              duplicateRows={activeProfile.duplicateRows}
              onTabSwitch={tab => setActiveTab(tab as TabId)}
            />
          )}
          {activeTab === 'storytelling' && (
            <AIStorytellingTab
              datasetName={datasetName}
              columns={columnObjects}
              rows={currentRows}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
              rowCount={currentRows.length}
              qualityScore={activeProfile.qualityScore}
            />
          )}
          {activeTab === 'compare' && (
            <DataComparisonTab
              datasetName={datasetName}
              columns={currentColumns}
              rows={currentRows}
              statistics={activeProfile.statistics as Record<string, ColumnStats>}
              rowCount={currentRows.length}
              qualityScore={activeProfile.qualityScore}
            />
          )}
        </div>
      </div>

      {notifOpen && <NotificationCenter onClose={() => setNotifOpen(false)} />}
    </div>
  );
}
