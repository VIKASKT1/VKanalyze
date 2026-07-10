import { useState, useRef } from 'react';
import { Merge, Upload, AlertCircle, CheckCircle2, Download, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  datasetName: string;
  onMerged: (rows: Record<string, unknown>[], columns: string[]) => void;
}

type MergeMode = 'union' | 'join_left' | 'join_inner';

interface ParsedFile {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

async function parseUploadedFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const name = file.name;
    if (name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (result) => {
          resolve({
            name,
            columns: result.meta.fields ?? [],
            rows: result.data as Record<string, unknown>[],
          });
        },
        error: reject,
      });
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
          const cols = data.length > 0 ? Object.keys(data[0]) : [];
          resolve({ name, columns: cols, rows: data });
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error('Unsupported file type'));
    }
  });
}

function doUnion(a: Record<string, unknown>[], b: Record<string, unknown>[], colsA: string[], colsB: string[]) {
  const allCols = [...new Set([...colsA, ...colsB])];
  const filled = (rows: Record<string, unknown>[], cols: string[]) =>
    rows.map(r => {
      const out: Record<string, unknown> = {};
      for (const c of allCols) out[c] = cols.includes(c) ? r[c] ?? '' : '';
      return out;
    });
  return { rows: [...filled(a, colsA), ...filled(b, colsB)], columns: allCols };
}

function doLeftJoin(a: Record<string, unknown>[], b: Record<string, unknown>[], keyA: string, keyB: string, colsA: string[], colsB: string[]) {
  const bMap = new Map(b.map(r => [String(r[keyB]), r]));
  const extraCols = colsB.filter(c => c !== keyB);
  const allCols = [...colsA, ...extraCols.map(c => colsA.includes(c) ? `B_${c}` : c)];

  const rows = a.map(ra => {
    const rb = bMap.get(String(ra[keyA]));
    const out: Record<string, unknown> = { ...ra };
    for (const c of extraCols) {
      const outKey = colsA.includes(c) ? `B_${c}` : c;
      out[outKey] = rb ? rb[c] : '';
    }
    return out;
  });
  return { rows, columns: allCols };
}

function doInnerJoin(a: Record<string, unknown>[], b: Record<string, unknown>[], keyA: string, keyB: string, colsA: string[], colsB: string[]) {
  const bMap = new Map(b.map(r => [String(r[keyB]), r]));
  const extraCols = colsB.filter(c => c !== keyB);
  const allCols = [...colsA, ...extraCols.map(c => colsA.includes(c) ? `B_${c}` : c)];

  const rows = a
    .filter(ra => bMap.has(String(ra[keyA])))
    .map(ra => {
      const rb = bMap.get(String(ra[keyA]))!;
      const out: Record<string, unknown> = { ...ra };
      for (const c of extraCols) {
        const outKey = colsA.includes(c) ? `B_${c}` : c;
        out[outKey] = rb[c];
      }
      return out;
    });
  return { rows, columns: allCols };
}

export default function DataMergeTab({ columns, rows, datasetName, onMerged }: Props) {
  const [second, setSecond] = useState<ParsedFile | null>(null);
  const [mode, setMode] = useState<MergeMode>('union');
  const [keyA, setKeyA] = useState('');
  const [keyB, setKeyB] = useState('');
  const [preview, setPreview] = useState<{ rows: Record<string, unknown>[]; columns: string[] } | null>(null);
  const [error, setError] = useState('');
  const [merged, setMerged] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const parsed = await parseUploadedFile(file);
      setSecond(parsed);
      setKeyA(columns[0] ?? '');
      setKeyB(parsed.columns[0] ?? '');
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function buildPreview() {
    if (!second) return;
    setError('');
    try {
      let result: { rows: Record<string, unknown>[]; columns: string[] };
      if (mode === 'union') {
        result = doUnion(rows, second.rows, columns, second.columns);
      } else if (mode === 'join_left') {
        if (!keyA || !keyB) { setError('Select join keys for both datasets'); return; }
        result = doLeftJoin(rows, second.rows, keyA, keyB, columns, second.columns);
      } else {
        if (!keyA || !keyB) { setError('Select join keys for both datasets'); return; }
        result = doInnerJoin(rows, second.rows, keyA, keyB, columns, second.columns);
      }
      setPreview(result);
    } catch (err) {
      setError(`Merge failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function applyMerge() {
    if (!preview) return;
    onMerged(preview.rows, preview.columns);
    setMerged(true);
  }

  function exportPreview() {
    if (!preview) return;
    const header = preview.columns.join(',');
    const body = preview.rows.map(r =>
      preview.columns.map(c => {
        const v = String(r[c] ?? '');
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    ).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'merged.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-paper">Data Merge Tool</h2>
        <p className="text-sm text-paper-dim mt-0.5">Combine datasets with Union, Left Join, or Inner Join</p>
      </div>

      {/* Dataset A info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-ink-surface border border-accent/25 rounded-xl">
          <p className="text-xs text-paper-dim uppercase tracking-wide mb-1">Dataset A (Current)</p>
          <p className="text-sm font-medium text-paper truncate">{datasetName}</p>
          <p className="text-xs text-paper-dim mt-1">{rows.length.toLocaleString()} rows · {columns.length} columns</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {columns.slice(0, 5).map(c => (
              <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-ink-raised text-paper-dim">{c}</span>
            ))}
            {columns.length > 5 && <span className="text-xs text-paper-dim">+{columns.length - 5} more</span>}
          </div>
        </div>

        <div className={`p-4 border rounded-xl transition ${second ? 'bg-ink-surface border-emerald-500/20' : 'bg-ink-surface/50 border-ink-border border-dashed'}`}>
          <p className="text-xs text-paper-dim uppercase tracking-wide mb-1">Dataset B (Upload)</p>
          {second ? (
            <>
              <p className="text-sm font-medium text-paper truncate">{second.name}</p>
              <p className="text-xs text-paper-dim mt-1">{second.rows.length.toLocaleString()} rows · {second.columns.length} columns</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {second.columns.slice(0, 5).map(c => (
                  <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-ink-raised text-paper-dim">{c}</span>
                ))}
                {second.columns.length > 5 && <span className="text-xs text-paper-dim">+{second.columns.length - 5} more</span>}
              </div>
              <button onClick={() => { setSecond(null); setPreview(null); setMerged(false); }} className="mt-2 text-xs text-red-400 hover:text-red-300">Remove</button>
            </>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center w-full py-4 gap-2 text-paper-dim hover:text-paper/90 transition">
              <Upload className="w-6 h-6" />
              <span className="text-sm">Click to upload CSV or XLSX</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {second && (
        <>
          {/* Mode */}
          <div className="p-4 bg-ink-surface border border-ink-border rounded-xl space-y-4">
            <p className="text-sm font-medium text-paper">Merge Mode</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'union', label: 'Union', desc: 'Stack rows from both datasets (all columns)' },
                { id: 'join_left', label: 'Left Join', desc: 'Keep all rows from A, add matching columns from B' },
                { id: 'join_inner', label: 'Inner Join', desc: 'Only rows that match in both A and B' },
              ] as const).map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`p-3 rounded-xl text-left border transition ${mode === m.id ? 'border-accent bg-accent/10' : 'border-ink-borderStrong hover:border-ink-borderStrong'}`}>
                  <p className={`text-sm font-medium ${mode === m.id ? 'text-accent-bright' : 'text-paper'}`}>{m.label}</p>
                  <p className="text-xs text-paper-dim mt-1">{m.desc}</p>
                </button>
              ))}
            </div>

            {mode !== 'union' && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-xs text-paper-dim mb-1 block">Join Key — Dataset A</label>
                  <select value={keyA} onChange={e => setKeyA(e.target.value)}
                    className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent">
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-paper-dim mb-1 block">Join Key — Dataset B</label>
                  <select value={keyB} onChange={e => setKeyB(e.target.value)}
                    className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent">
                    {second.columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={buildPreview} className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-bright text-ink text-sm font-medium rounded-lg transition">
              <RefreshCw className="w-4 h-4" /> Preview Merge
            </button>
            {preview && (
              <>
                <button onClick={applyMerge} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-paper text-sm font-medium rounded-lg transition">
                  <Merge className="w-4 h-4" /> Apply Merge
                </button>
                <button onClick={exportPreview} className="flex items-center gap-2 px-4 py-2 bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm rounded-lg transition">
                  <Download className="w-4 h-4" /> Export
                </button>
              </>
            )}
          </div>

          {merged && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Merge applied — dataset updated with {preview?.rows.length.toLocaleString()} rows and {preview?.columns.length} columns
            </div>
          )}
        </>
      )}

      {preview && (
        <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-border flex items-center justify-between">
            <span className="text-sm font-medium text-paper">Preview</span>
            <span className="text-xs text-paper-dim">{preview.rows.length.toLocaleString()} rows · {preview.columns.length} columns</span>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-ink-raised">
                <tr>
                  {preview.columns.slice(0, 8).map(c => (
                    <th key={c} className="text-left px-3 py-2 text-paper-dim font-medium whitespace-nowrap">{c}</th>
                  ))}
                  {preview.columns.length > 8 && <th className="px-3 py-2 text-paper-dim">+{preview.columns.length - 8} more</th>}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-t border-ink-border/50 hover:bg-ink-raised/30">
                    {preview.columns.slice(0, 8).map(c => (
                      <td key={c} className="px-3 py-2 text-paper/90 whitespace-nowrap max-w-[150px] truncate">{String(row[c] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
