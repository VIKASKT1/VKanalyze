import { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud, FileText, Table, Loader2, AlertCircle, CheckCircle2,
  Shield, LogOut, User, Settings, HelpCircle, ChevronDown, BarChart2,
  Wrench, Users, Database, Zap, Clock,
} from 'lucide-react';
import { parseFile, profileData } from '../lib/data-processing';
import { supabase, logActivity, createNotification } from '../lib/supabase';
import type { ParsedData } from '../lib/data-processing';
import type { ProfileData } from '../lib/types';

interface Props {
  onDataLoaded: (file: File, parsed: ParsedData, profile: ProfileData) => void;
  onNavigate: (page: string) => void;
  session: { user: { email?: string; id: string } } | null;
  onSignOut?: () => void;
}

type UploadStage =
  | 'idle'
  | 'reading'
  | 'parsing'
  | 'detecting'
  | 'profiling'
  | 'statistics'
  | 'recommendations'
  | 'opening'
  | 'complete'
  | 'error';

interface UploadProgress {
  stage: UploadStage;
  stageLabel: string;
  pct: number;
  rowsProcessed: number;
  totalRows: number;
  eta: string;
}

const STAGE_LABELS: Record<UploadStage, string> = {
  idle:            '',
  reading:         'Reading File',
  parsing:         'Parsing Dataset',
  detecting:       'Detecting Types',
  profiling:       'Profiling',
  statistics:      'Generating Statistics',
  recommendations: 'Generating Recommendations',
  opening:         'Opening Workspace',
  complete:        'Dataset Ready',
  error:           'Error',
};

const LARGE_SIZE_BYTES  = 10 * 1024 * 1024;  // 10 MB
const LARGE_ROW_COUNT   = 100_000;
// Use worker for files above this threshold to keep UI responsive
const WORKER_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB

function formatEta(ms: number): string {
  if (ms <= 0) return '';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `~${s}s remaining`;
  return `~${Math.ceil(s / 60)}m remaining`;
}

export default function UploadScreen({ onDataLoaded, onNavigate, session, onSignOut }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<UploadProgress>({
    stage: 'idle', stageLabel: '', pct: 0, rowsProcessed: 0, totalRows: 0, eta: '',
  });
  const [isLarge, setIsLarge] = useState(false);
  const [fileName, setFileName] = useState('');
  const [completionInfo, setCompletionInfo] = useState<{
    rowCount: number; columns: number; qualityScore: number; processingMs: number;
  } | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userEmail = session?.user?.email ?? '';
  const isLoading = progress.stage !== 'idle' && progress.stage !== 'complete' && progress.stage !== 'error';

  useEffect(() => {
    async function checkAdmin() {
      if (!session?.user?.id) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      setIsAdmin(data?.role === 'admin');
    }
    checkAdmin();
  }, [session?.user?.id]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const setStage = useCallback((stage: UploadStage, pct: number, rowsProcessed = 0, totalRows = 0) => {
    const elapsed = Date.now() - startTimeRef.current;
    const eta = pct > 5 && pct < 95 && elapsed > 500
      ? formatEta((elapsed / pct) * (100 - pct))
      : '';
    setProgress({ stage, stageLabel: STAGE_LABELS[stage], pct, rowsProcessed, totalRows, eta });
  }, []);

  async function processFile(file: File) {
    if (!file) return;
    setError('');
    setCompletionInfo(null);
    setFileName(file.name);
    startTimeRef.current = Date.now();
    const large = file.size > LARGE_SIZE_BYTES;
    setIsLarge(large);
    setStage('reading', 5, 0, 0);

    // Use the parse Web Worker for files >= 1 MB to keep the UI fully responsive
    const useWorker = file.size >= WORKER_SIZE_BYTES || file.name.endsWith('.csv') || file.name.endsWith('.tsv');

    if (useWorker) {
      try {
        const worker = new Worker(
          new URL('../workers/parse.worker.ts', import.meta.url),
          { type: 'module' }
        );

        await new Promise<void>((resolve, reject) => {
          worker.onmessage = async (e: MessageEvent) => {
            const msg = e.data;

            if (msg.type === 'progress') {
              // Map worker stage names to our UploadStage type
              const stageMap: Record<string, UploadStage> = {
                'Reading File': 'reading',
                'Parsing Dataset': 'parsing',
                'Detecting Types': 'detecting',
                'Profiling': 'profiling',
                'Generating Statistics': 'statistics',
                'Generating Recommendations': 'recommendations',
                'Opening Workspace': 'opening',
              };
              const stage = stageMap[msg.stage] ?? 'parsing';
              const elapsed = Date.now() - startTimeRef.current;
              const pct = msg.pct as number;
              const eta = pct > 5 && pct < 95 && elapsed > 500
                ? formatEta((elapsed / pct) * (100 - pct))
                : '';
              setProgress({
                stage,
                stageLabel: msg.stage as string,
                pct,
                rowsProcessed: msg.rowsProcessed as number,
                totalRows: msg.totalRows as number,
                eta,
              });
            } else if (msg.type === 'done') {
              worker.terminate();
              try {
                const { columns: colNames, rows, rowCount, processingMs, profile } = msg as {
                  columns: string[];
                  rows: Record<string, unknown>[];
                  rowCount: number;
                  processingMs: number;
                  profile: ProfileData;
                };

                if (rowCount >= LARGE_ROW_COUNT) setIsLarge(true);

                setStage('profiling', 78, rowCount, rowCount);
                // ParsedData.columns is string[] - colNames from worker is already string[]
                const parsed: ParsedData = { columns: colNames, rows, rowCount, columnCount: colNames.length };

                // profile was already computed inside the worker (off the main
                // thread) as part of the 'Generating Statistics' stage — no
                // second main-thread profileData() call needed here anymore.
                setStage('statistics', 88, rowCount, rowCount);

                setStage('opening', 97, rowCount, rowCount);
                await new Promise(r => setTimeout(r, 80));

                setProgress(p => ({ ...p, stage: 'complete', stageLabel: 'Dataset Ready', pct: 100 }));
                setCompletionInfo({ rowCount, columns: colNames.length, qualityScore: profile.qualityScore, processingMs });

                logActivity(file.name, 'file_upload', `Uploaded ${file.name}`);
                createNotification('Dataset Loaded', `${file.name} — ${rowCount.toLocaleString()} rows`, 'success');

                await new Promise(r => setTimeout(r, 1400));
                onDataLoaded(file, parsed, profile);
                resolve();
              } catch (innerErr) {
                reject(innerErr);
              }
            } else if (msg.type === 'error') {
              worker.terminate();
              reject(new Error(msg.message as string));
            }
          };

          worker.onerror = (err) => {
            worker.terminate();
            reject(new Error(err.message ?? 'Worker error'));
          };

          // Send the file to the worker
          worker.postMessage({ file });
        });
      } catch (err) {
        setProgress(p => ({ ...p, stage: 'error' }));
        setError(err instanceof Error ? err.message : 'Failed to parse file. Please check the format and try again.');
        setIsLarge(false);
      }
      return;
    }

    // Fallback: small files processed on main thread
    try {
      await new Promise(r => setTimeout(r, 80));
      setStage('parsing', 15, 0, 0);
      const parsed = await parseFile(file, (pct) => {
        const stage: UploadStage = pct < 0.5 ? 'parsing' : 'detecting';
        const absPct = 15 + Math.round(pct * 50);
        setStage(stage, absPct, Math.round(pct * 1000), 0);
      });

      if (parsed.rowCount >= LARGE_ROW_COUNT && !large) setIsLarge(true);

      setStage('profiling', 68, parsed.rowCount, parsed.rowCount);
      await new Promise(r => setTimeout(r, 40));

      setStage('statistics', 78, parsed.rowCount, parsed.rowCount);
      const profile = profileData(parsed.columns, parsed.rows) as ProfileData;

      setStage('recommendations', 90, parsed.rowCount, parsed.rowCount);
      await new Promise(r => setTimeout(r, 40));

      setStage('opening', 97, parsed.rowCount, parsed.rowCount);
      await new Promise(r => setTimeout(r, 80));

      const processingMs = Date.now() - startTimeRef.current;
      setProgress(p => ({ ...p, stage: 'complete', stageLabel: 'Dataset Ready', pct: 100 }));
      setCompletionInfo({ rowCount: parsed.rowCount, columns: parsed.columns.length, qualityScore: profile.qualityScore, processingMs });

      logActivity(file.name, 'file_upload', `Uploaded ${file.name}`);
      createNotification('Dataset Loaded', `${file.name} — ${parsed.rowCount.toLocaleString()} rows`, 'success');

      await new Promise(r => setTimeout(r, 1400));
      onDataLoaded(file, parsed, profile);
    } catch (err) {
      setProgress(p => ({ ...p, stage: 'error' }));
      setError(err instanceof Error ? err.message : 'Failed to parse file. Please check the format and try again.');
      setIsLarge(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  async function loadGoogleSheets() {
    if (!sheetsUrl.trim()) return;
    setSheetsLoading(true);
    setError('');
    try {
      const match = sheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) throw new Error('Could not extract Sheet ID from URL. Please use a Share URL.');
      const id = match[1];
      const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error('Could not fetch sheet. Make sure it is publicly accessible.');
      const blob = await res.blob();
      const file = new File([blob], 'google-sheet.csv', { type: 'text/csv' });
      processFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Google Sheet.');
    } finally {
      setSheetsLoading(false);
    }
  }

  async function signOut() {
    await (onSignOut ? onSignOut() : supabase.auth.signOut());
    onNavigate('home');
  }

  // ── Completion Screen ──────────────────────────────────────────────────────
  if (progress.stage === 'complete' && completionInfo) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <div className="text-center max-w-sm w-full">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-paper mb-1">Dataset Ready</h2>
          <p className="text-paper-dim text-sm mb-6 truncate">{fileName}</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: 'Rows', value: completionInfo.rowCount.toLocaleString(), icon: Database },
              { label: 'Columns', value: completionInfo.columns, icon: Table },
              { label: 'Quality Score', value: `${completionInfo.qualityScore}/100`, icon: Zap },
              { label: 'Processing Time', value: completionInfo.processingMs > 1000 ? `${(completionInfo.processingMs / 1000).toFixed(1)}s` : `${completionInfo.processingMs}ms`, icon: Clock },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-ink-surface border border-ink-border rounded-xl p-4 text-left">
                <Icon className="w-4 h-4 text-paper-dim mb-2" />
                <div className="text-lg font-bold text-paper">{value}</div>
                <div className="text-xs text-paper-dim">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 text-paper-dim text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Opening Workspace…
          </div>
        </div>
      </div>
    );
  }

  // ── Loading Screen ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <div className="text-center max-w-sm w-full space-y-4">
          {isLarge && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-2">
              <p className="text-amber-300 text-sm font-semibold">Large Dataset Detected</p>
              <p className="text-paper-dim text-xs mt-0.5">Processing may take a moment — please keep this tab open</p>
            </div>
          )}

          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/25 flex items-center justify-center mx-auto">
            <BarChart2 className="w-7 h-7 text-accent-bright" />
          </div>

          <div>
            <p className="text-paper font-semibold text-lg mb-0.5 truncate">{fileName}</p>
            <p className="text-accent-bright text-sm font-medium">{progress.stageLabel}</p>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-ink-raised rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progress.pct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-paper-dim">
            <span>{progress.pct}%</span>
            <span>{progress.eta}</span>
            {progress.totalRows > 0 && (
              <span>{progress.rowsProcessed.toLocaleString()} / {progress.totalRows.toLocaleString()} rows</span>
            )}
          </div>

          {/* Stage steps */}
          <div className="grid grid-cols-4 gap-1 mt-2">
            {(['reading','parsing','profiling','statistics','recommendations','opening'] as UploadStage[]).slice(0, 6).map((s) => {
              const stages: UploadStage[] = ['reading','parsing','detecting','profiling','statistics','recommendations','opening'];
              const currentIdx = stages.indexOf(progress.stage);
              const thisIdx = stages.indexOf(s);
              const done = thisIdx < currentIdx;
              const active = s === progress.stage || (s === 'parsing' && progress.stage === 'detecting');
              return (
                <div key={s} className={`h-1 rounded-full transition-all ${done ? 'bg-emerald-500' : active ? 'bg-accent' : 'bg-ink-raised'}`} />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Upload Screen ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-ink text-paper">
      {/* Nav */}
      <nav className="border-b border-ink-border bg-ink/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-accent-bright" />
            </div>
            <span className="font-bold text-paper text-sm tracking-tight">VKAnalyze</span>
          </div>
          {session && (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:block max-w-[140px] truncate">{userEmail}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-52 bg-ink-surface border border-ink-borderStrong rounded-xl shadow-xl overflow-hidden z-50">
                  {[
                    { label: 'Profile', icon: User, page: 'profile' },
                    { label: 'Settings', icon: Settings, page: 'settings' },
                    { label: 'Help & Support', icon: HelpCircle, page: 'support' },
                    ...(isAdmin ? [{ label: 'Admin Dashboard', icon: Wrench, page: 'admin' }] : []),
                  ].map(({ label, icon: Icon, page }) => (
                    <button key={page} onClick={() => { setMenuOpen(false); onNavigate(page); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-paper/90 hover:bg-ink-raised hover:text-paper transition text-left">
                      <Icon className="w-4 h-4 text-paper-dim" />
                      {label}
                    </button>
                  ))}
                  {isAdmin && <div className="border-t border-ink-border" />}
                  <button onClick={signOut}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition text-left">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/25 rounded-full text-accent-bright text-xs font-medium mb-4">
            <Shield className="w-3 h-3" />
            Local-first · Your data never leaves your browser
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-paper mb-3">
            Analyse your data with AI
          </h1>
          <p className="text-paper-dim text-base max-w-xl mx-auto">
            Upload a CSV, Excel, or JSON file and get instant charts, AI insights, SQL queries, and cleaning recommendations.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-6 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 sm:p-16 text-center cursor-pointer transition-all ${
            dragging
              ? 'border-accent bg-accent/8 scale-[1.01]'
              : 'border-ink-borderStrong hover:border-accent/40 bg-ink-surface/40 hover:bg-ink-surface/70'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json,.jsonl,.tsv,.txt"
            className="hidden"
            onChange={handleFileChange}
          />
          <UploadCloud className={`w-10 h-10 mx-auto mb-4 transition-colors ${dragging ? 'text-accent-bright' : 'text-paper-dimmer'}`} />
          <p className="text-paper font-semibold text-lg mb-1">Drop your file here</p>
          <p className="text-paper-dim text-sm mb-4">or click to browse</p>
          <div className="flex flex-wrap justify-center gap-2">
            {['CSV', 'Excel', 'JSON', 'TSV'].map(f => (
              <span key={f} className="flex items-center gap-1 px-2.5 py-1 bg-ink-raised rounded-lg text-xs text-paper-dim">
                <FileText className="w-3 h-3" />
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Google Sheets */}
        <div className="mt-4 p-4 bg-ink-surface border border-ink-border rounded-xl">
          <p className="text-xs text-paper-dim mb-2 font-medium uppercase tracking-wide">Or load from Google Sheets</p>
          <div className="flex gap-2">
            <input
              value={sheetsUrl}
              onChange={e => setSheetsUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadGoogleSheets()}
              placeholder="Paste shareable Google Sheets URL…"
              className="flex-1 px-3 py-2 bg-ink-raised border border-ink-borderStrong rounded-lg text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent transition"
            />
            <button
              onClick={loadGoogleSheets}
              disabled={sheetsLoading || !sheetsUrl.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent-bright text-ink rounded-lg text-sm font-semibold transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {sheetsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Load
            </button>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
          {[
            { icon: BarChart2, label: 'Charts & Dashboards' },
            { icon: Zap, label: 'AI Insights' },
            { icon: Database, label: 'SQL Workspace' },
            { icon: Users, label: 'Team Sharing' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 p-3 bg-ink-surface border border-ink-border rounded-xl text-center">
              <Icon className="w-5 h-5 text-accent-bright" />
              <span className="text-xs text-paper-dim">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
