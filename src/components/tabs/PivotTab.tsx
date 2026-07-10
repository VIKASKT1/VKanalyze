import { memo, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Download, Table2, ChevronDown, Loader2 } from 'lucide-react';
import { savePivotConfig, loadPivotConfig } from '../../lib/session-store';
import { useCachedWorkerAnalysis } from '../../hooks/useAnalysisWorker';

interface Props {
  datasetName: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

type AggFn = 'sum' | 'count' | 'avg' | 'min' | 'max';

const AGG_LABELS: Record<AggFn, string> = {
  sum: 'Sum',
  count: 'Count',
  avg: 'Average',
  min: 'Min',
  max: 'Max',
};

// RENDER PERF FIX: the pivot result body was previously rendered with a
// plain `pivot.data.map(...)`, with no cap on how many <tr> elements could
// be mounted at once. The row-count cap here only limits which COLUMNS are
// shown (MAX_COLS); the number of pivot ROWS is driven entirely by the
// cardinality of the chosen row field, which for a 1,000,000-row dataset
// can easily be in the thousands (e.g. pivoting by a high-cardinality ID or
// date column). Thousands of real <tr>/<td> DOM nodes is exactly the
// "render thousands of DOM nodes" problem called out for tables in this
// audit, even though the pivot AGGREGATION itself already runs off-thread
// in the analysis worker. A windowed/virtual scroll (same technique already
// used in PreviewTab) fixes this without changing what data is computed or
// displayed — only how many rows are in the DOM at once.
const PIVOT_ROW_HEIGHT = 41;
const PIVOT_OVERSCAN = 8;
const PIVOT_VIRTUAL_THRESHOLD = 200;

function fmt(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Select({
  label, value, onChange, options, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-paper-dim font-medium">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">{placeholder}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim pointer-events-none" />
      </div>
    </div>
  );
}

// RENDER PERF FIX: wrapped in React.memo. `rows`/`columns` here come from
// DataFlowApp's `currentColumns`/`currentRows` (already stable memoized
// references), so this correctly skips re-rendering on unrelated parent
// state changes; when it does need to re-render (rows/columns actually
// changed), `useCachedWorkerAnalysis`'s dataset-identity cache (see
// useAnalysisWorker.ts) still avoids recomputation for unchanged pivot
// configurations, satisfying the requirement that the pivot UI only
// rerenders after the worker result actually changes.
function PivotTab({ datasetName, columns, rows }: Props) {
  const [rowField, setRowField] = useState('');
  const [colField, setColField] = useState('');
  const [valueField, setValueField] = useState('');
  const [aggFn, setAggFn] = useState<AggFn>('sum');

  // RENDER PERF FIX: windowed scroll state for the pivot result table body
  // (see PIVOT_ROW_HEIGHT/PIVOT_OVERSCAN/PIVOT_VIRTUAL_THRESHOLD above).
  const pivotScrollRef = useRef<HTMLDivElement>(null);
  const [pivotScrollTop, setPivotScrollTop] = useState(0);
  const [pivotContainerHeight, setPivotContainerHeight] = useState(480);
  const handlePivotScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setPivotScrollTop(e.currentTarget.scrollTop);
  }, []);
  useEffect(() => {
    const el = pivotScrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setPivotContainerHeight(entry.contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Restore field selections for this dataset (covers a hard refresh).
  useEffect(() => {
    let cancelled = false;
    loadPivotConfig(datasetName).then(cfg => {
      if (cancelled || !cfg) return;
      setRowField(cfg.rowField);
      setColField(cfg.colField);
      setValueField(cfg.valueField);
      setAggFn(cfg.aggFn as AggFn);
    });
    return () => { cancelled = true; };
  }, [datasetName]);

  useEffect(() => {
    const t = setTimeout(() => {
      savePivotConfig(datasetName, { rowField, colField, valueField, aggFn });
    }, 400);
    return () => clearTimeout(t);
  }, [datasetName, rowField, colField, valueField, aggFn]);

  const numericCols = useMemo(() =>
    columns.filter(c => {
      const sample = rows.slice(0, 20).map(r => r[c]);
      const nums = sample.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)));
      return nums.length > sample.length * 0.5;
    }),
    [columns, rows]
  );

  // PERFORMANCE FIX: this used to build the full grouping matrix
  // synchronously on the main thread inside a useMemo. Profiled at ~0.2-1s+
  // depending on field cardinality for 1,000,000 rows — small next to the
  // other offenders individually, but it re-ran on every mount (every time
  // the user switched back to the Pivot tab), even when the row/column/value
  // field selection hadn't changed. It now runs in the shared analysis
  // worker and is cached both by dataset identity and by the specific
  // field/aggregation combination, so revisiting this tab with an unchanged
  // configuration is instant.
  interface PivotResult {
    rowKeys: string[];
    colKeys: string[];
    data: Array<Record<string, string | number>>;
    totalsRow: Record<string, string | number>;
  }
  const pivotCacheKey = rowField && valueField
    ? `pivot:${rowField}|${colField}|${valueField}|${aggFn}`
    : null;
  const { data: pivot, loading: pivotLoading } = useCachedWorkerAnalysis<PivotResult>(
    pivotCacheKey,
    columns,
    rows,
    () => ({ type: 'pivot', rowField, colField: colField || null, valueField, aggFn }),
    [rowField, colField, valueField, aggFn, rows, columns]
  );

  function exportCSV() {
    if (!pivot) return;
    const header = ['Row', ...pivot.colKeys, 'Total'];
    const bodyRows = pivot.data.map(r => [
      r['__row'],
      ...pivot.colKeys.map(c => fmt(r[c] as number)),
      fmt(r['__total'] as number),
    ]);
    const totalRow = ['Total', ...pivot.colKeys.map(c => fmt(pivot.totalsRow[c] as number)), fmt(pivot.totalsRow['__total'] as number)];
    const csv = [header, ...bodyRows, totalRow].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pivot.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const MAX_COLS = 20;
  const displayCols = pivot ? pivot.colKeys.slice(0, MAX_COLS) : [];
  const truncated = pivot && pivot.colKeys.length > MAX_COLS;

  // Windowed slice of pivot.data for rendering only — exportCSV above still
  // uses the full, un-windowed pivot.data, so exported output is unaffected.
  const pivotRowCount = pivot ? pivot.data.length : 0;
  const pivotVirtual = pivotRowCount > PIVOT_VIRTUAL_THRESHOLD;
  const pivotTotalHeight = pivotRowCount * PIVOT_ROW_HEIGHT;
  const pivotStartIdx = pivotVirtual
    ? Math.max(0, Math.floor(pivotScrollTop / PIVOT_ROW_HEIGHT) - PIVOT_OVERSCAN)
    : 0;
  const pivotEndIdx = pivotVirtual
    ? Math.min(pivotRowCount, Math.ceil((pivotScrollTop + pivotContainerHeight) / PIVOT_ROW_HEIGHT) + PIVOT_OVERSCAN)
    : pivotRowCount;
  const visiblePivotRows = pivot ? pivot.data.slice(pivotStartIdx, pivotEndIdx) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-paper">Pivot Table</h2>
          <p className="text-sm text-paper-dim mt-0.5">Aggregate and cross-tabulate your data</p>
        </div>
        {pivot && (
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-paper text-sm font-medium rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Config */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-ink-surface border border-ink-border rounded-xl">
        <Select label="Row Field" value={rowField} onChange={setRowField} options={columns} placeholder="Select row…" />
        <Select label="Column Field (opt.)" value={colField} onChange={setColField} options={columns} placeholder="None (single column)" />
        <Select label="Value Field" value={valueField} onChange={setValueField} options={numericCols.length ? numericCols : columns} placeholder="Select value…" />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-paper-dim font-medium">Aggregation</label>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(AGG_LABELS) as AggFn[]).map(fn => (
              <button
                key={fn}
                onClick={() => setAggFn(fn)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${aggFn === fn ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}
              >
                {AGG_LABELS[fn]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      {!pivot && !pivotLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Table2 className="w-10 h-10 text-paper-dimmer mb-3" />
          <p className="text-paper-dim font-medium">Select a Row Field and Value Field to build the pivot table</p>
          <p className="text-paper-dim text-sm mt-1">Column Field is optional — leave blank for a single aggregated column</p>
        </div>
      )}

      {!pivot && pivotLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="w-8 h-8 text-paper-dimmer mb-3 animate-spin" />
          <p className="text-paper-dim font-medium">Building pivot table…</p>
        </div>
      )}

      {pivot && (
        <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
          {truncated && (
            <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs">
              Showing first {MAX_COLS} of {pivot.colKeys.length} columns
            </div>
          )}
          {pivotVirtual && (
            <div className="px-4 py-2 bg-ink-raised/30 border-b border-ink-border text-paper-dimmer text-xs">
              {pivotRowCount.toLocaleString()} rows · virtualized for smooth scrolling
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink-borderStrong">
                  <th className="text-left px-4 py-3 text-paper-dim font-medium bg-ink-raised/50 sticky left-0">
                    {rowField}
                  </th>
                  {displayCols.map(c => (
                    <th key={c} className="text-right px-4 py-3 text-paper-dim font-medium whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-accent-bright font-semibold bg-ink-raised/30">Total</th>
                </tr>
              </thead>
              {!pivotVirtual && (
                <tbody>
                  {visiblePivotRows.map((row, i) => (
                    <tr key={i} className="border-b border-ink-border/50 hover:bg-ink-raised/30 transition">
                      <td className="px-4 py-2.5 text-paper/90 font-medium sticky left-0 bg-ink-surface">
                        {String(row['__row'])}
                      </td>
                      {displayCols.map(c => (
                        <td key={c} className="text-right px-4 py-2.5 text-paper tabular-nums">
                          {fmt(row[c] as number)}
                        </td>
                      ))}
                      <td className="text-right px-4 py-2.5 text-accent-bright font-semibold tabular-nums bg-ink-raised/20">
                        {fmt(row['__total'] as number)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
          {pivotVirtual && (
            <div
              ref={pivotScrollRef}
              onScroll={handlePivotScroll}
              className="overflow-auto scrollbar-thin"
              style={{ height: Math.min(480, Math.max(200, pivotTotalHeight)) }}
            >
              <div style={{ height: pivotTotalHeight, position: 'relative' }}>
                <table
                  className="w-full text-sm border-collapse"
                  style={{ position: 'absolute', top: pivotStartIdx * PIVOT_ROW_HEIGHT, width: '100%' }}
                >
                  <tbody>
                    {visiblePivotRows.map((row, i) => (
                      <tr key={pivotStartIdx + i} style={{ height: PIVOT_ROW_HEIGHT }} className="border-b border-ink-border/50 hover:bg-ink-raised/30 transition">
                        <td className="px-4 py-2.5 text-paper/90 font-medium sticky left-0 bg-ink-surface">
                          {String(row['__row'])}
                        </td>
                        {displayCols.map(c => (
                          <td key={c} className="text-right px-4 py-2.5 text-paper tabular-nums">
                            {fmt(row[c] as number)}
                          </td>
                        ))}
                        <td className="text-right px-4 py-2.5 text-accent-bright font-semibold tabular-nums bg-ink-raised/20">
                          {fmt(row['__total'] as number)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <tfoot>
                <tr className="border-t-2 border-ink-borderStrong bg-ink-raised/40">
                  <td className="px-4 py-2.5 text-paper font-bold sticky left-0 bg-ink-raised">Total</td>
                  {displayCols.map(c => (
                    <td key={c} className="text-right px-4 py-2.5 text-paper font-semibold tabular-nums">
                      {fmt(pivot.totalsRow[c] as number)}
                    </td>
                  ))}
                  <td className="text-right px-4 py-2.5 text-accent-bright font-bold tabular-nums bg-ink-raised/40">
                    {fmt(pivot.totalsRow['__total'] as number)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-ink-border text-xs text-paper-dim">
            {pivot.rowKeys.length} rows · {AGG_LABELS[aggFn]} of {valueField}
            {colField ? ` by ${colField}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(PivotTab);
