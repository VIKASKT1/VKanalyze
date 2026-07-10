import { useState, useEffect } from 'react';
import { Save, RotateCcw, Trash2, GitBranch, Plus, CheckCircle } from 'lucide-react';
import { logActivity, loadDatasetVersions, saveDatasetVersion, deleteDatasetVersion } from '../../lib/supabase';
import type { LocalDatasetVersion } from '../../lib/privacy';

interface Props {
  datasetName: string;
  currentRows: Record<string, unknown>[];
  currentColumns: string[];
  onRestoreVersion: (rows: Record<string, unknown>[], columns: string[]) => void;
}

type VersionRecord = LocalDatasetVersion;

export default function VersionHistoryTab({ datasetName, currentRows, currentColumns, onRestoreVersion }: Props) {
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [restoredId, setRestoredId] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadVersions(); }, [datasetName]);

  async function loadVersions() {
    setLoading(true);
    try {
      const data = await loadDatasetVersions(datasetName);
      setVersions(data);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }

  async function saveVersion() {
    const label = labelInput.trim() || `Version ${(versions[0]?.version_number ?? 0) + 1}`;
    setSaving(true);

    const nextNum = (versions[0]?.version_number ?? 0) + 1;
    const summary = versions.length === 0
      ? 'Initial version'
      : `${currentRows.length} rows, ${currentColumns.length} columns`;

    await saveDatasetVersion(datasetName, {
      version_number: nextNum,
      label,
      columns: currentColumns,
      row_count: currentRows.length,
      column_count: currentColumns.length,
      changes_summary: summary,
    });

    await logActivity(datasetName, 'version_save', `Saved version ${nextNum}: ${label}`);
    setLabelInput('');
    setSaving(false);
    loadVersions();
  }

  async function deleteVersion(id: string) {
    await deleteDatasetVersion(datasetName, id);
    setVersions(prev => prev.filter(v => v.id !== id));
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-paper">Dataset Version History</h2>
        <p className="text-sm text-paper-dim mt-0.5">Save snapshots and restore previous versions of your dataset</p>
      </div>

      {/* Save current state */}
      <div className="p-4 bg-ink-surface border border-ink-border rounded-xl">
        <p className="text-sm font-medium text-paper mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-accent-bright" /> Save Current State
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveVersion()}
            placeholder={`Version ${(versions[0]?.version_number ?? 0) + 1} — optional label…`}
            className="flex-1 bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
          />
          <button
            onClick={saveVersion}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink text-sm font-medium rounded-lg transition"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-paper-dim mt-2">
          Current: {currentRows.length.toLocaleString()} rows · {currentColumns.length} columns
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GitBranch className="w-10 h-10 text-paper-dimmer mb-3" />
          <p className="text-paper-dim font-medium">No versions saved yet</p>
          <p className="text-paper-dim text-sm mt-1">Save the current state above to start tracking version history</p>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map(v => (
            <div key={v.id} className={`flex items-center gap-4 p-4 bg-ink-surface border rounded-xl transition ${restoredId === v.id ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-ink-border hover:border-ink-borderStrong'}`}>
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center">
                <span className="text-sm font-bold text-accent-bright">v{v.version_number}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-paper">{v.label}</span>
                  {restoredId === v.id && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10">
                      <CheckCircle className="w-3 h-3" /> Restored
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-paper-dim flex-wrap">
                  <span>{v.row_count?.toLocaleString()} rows</span>
                  <span>{v.column_count} columns</span>
                  {v.changes_summary && <span>· {v.changes_summary}</span>}
                  <span>· {timeAgo(v.created_at)}</span>
                </div>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    onRestoreVersion(currentRows, v.columns as unknown as string[]);
                    setRestoredId(v.id);
                    logActivity(datasetName, 'version_restore', `Restored to version ${v.version_number}: ${v.label}`);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-accent-bright hover:bg-accent-bright/10 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />Restore Schema
                </button>
                <button
                  onClick={() => deleteVersion(v.id)}
                  className="p-1.5 rounded-lg text-paper-dim hover:text-red-400 hover:bg-red-500/10 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
