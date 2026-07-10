import { useState, useEffect } from 'react';
import { Save, Trash2, RefreshCw, FolderOpen, Clock, Database, Star } from 'lucide-react';
import { saveAnalysisSession, loadAnalysisSessions, deleteAnalysisSession, logActivity } from '../../lib/supabase';
import type { ColumnStats } from '../../lib/types';

interface Props {
  datasetName: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  statistics: Record<string, ColumnStats>;
  qualityScore: number;
  fileSize?: number;
}

interface SessionRecord {
  id: string;
  name: string;
  dataset_name: string;
  row_count: number;
  column_count: number;
  quality_score: number;
  file_size: number;
  created_at: string;
  updated_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatBytes(b: number): string {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function SavedSessionsTab({ datasetName, rowCount, columnCount, columns, statistics, qualityScore, fileSize = 0 }: Props) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await loadAnalysisSessions();
      setSessions(data as SessionRecord[]);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const name = nameInput.trim() || `${datasetName} — ${new Date().toLocaleString()}`;
    setSaving(true);
    const result = await saveAnalysisSession(
      name, datasetName, fileSize, rowCount, columnCount,
      columns, statistics as Record<string, unknown>, qualityScore
    );
    await logActivity(datasetName, 'session_save', `Saved analysis session: ${name}`);
    setNameInput('');
    setSaving(false);
    if (result) {
      setSavedId(result.id);
      setTimeout(() => setSavedId(null), 3000);
    }
    load();
  }

  function del(id: string) {
    setConfirmDeleteId(id);
  }

  async function confirmDel() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    await deleteAnalysisSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  const scoreColor = (q: number) => q >= 80 ? 'text-emerald-400' : q >= 60 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-paper">Saved Analysis Sessions</h2>
        <p className="text-sm text-paper-dim mt-0.5">Save snapshots of your current analysis to continue later</p>
      </div>

      {/* Save current */}
      <div className="p-4 bg-ink-surface border border-ink-border rounded-xl space-y-3">
        <p className="text-sm font-medium text-paper flex items-center gap-2">
          <Save className="w-4 h-4 text-accent-bright" /> Save Current Session
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder={`${datasetName} — ${new Date().toLocaleDateString()}`}
            className="flex-1 bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
          />
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink text-sm font-medium rounded-lg transition"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs text-paper-dim">
          <span>{rowCount.toLocaleString()} rows</span>
          <span>{columnCount} columns</span>
          <span>Quality: {qualityScore}/100</span>
          {fileSize > 0 && <span>{formatBytes(fileSize)}</span>}
        </div>
        {savedId && (
          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5" /> Session saved successfully
          </p>
        )}
      </div>

      {/* Sessions list */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-paper/90">{sessions.length} saved session{sessions.length !== 1 ? 's' : ''}</p>
        <button onClick={load} className="p-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper-dim hover:text-paper transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="w-10 h-10 text-paper-dimmer mb-3" />
          <p className="text-paper-dim font-medium">No sessions saved yet</p>
          <p className="text-paper-dim text-sm mt-1">Save your current analysis to access it later</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <div key={s.id} className="flex items-center gap-4 p-4 bg-ink-surface border border-ink-border hover:border-ink-borderStrong rounded-xl transition">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center flex-shrink-0">
                <Database className="w-5 h-5 text-accent-bright" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-paper truncate">{s.name}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-paper-dim flex-wrap">
                  <span>{s.dataset_name}</span>
                  <span>{s.row_count?.toLocaleString()} rows</span>
                  <span>{s.column_count} cols</span>
                  <span className={scoreColor(s.quality_score)}>Q: {s.quality_score}/100</span>
                  {s.file_size > 0 && <span>{formatBytes(s.file_size)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className="text-xs text-paper-dim flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {timeAgo(s.created_at)}
                  </p>
                </div>
                <button onClick={() => del(s.id)} className="p-1.5 rounded-lg text-paper-dim hover:text-red-400 hover:bg-red-500/10 transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-ink-raised border border-ink-borderStrong rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-paper mb-2">Delete Session?</h3>
            <p className="text-sm text-paper-dim mb-5">This will permanently remove the saved session. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm text-paper-dim hover:text-paper transition">Cancel</button>
              <button onClick={confirmDel} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-paper rounded-lg transition">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
