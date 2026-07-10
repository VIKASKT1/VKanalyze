import { memo, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, Download, ChevronUp, ChevronDown, X, ArrowUpDown, FileText, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { ParsedData } from '../../lib/data-processing';
import { useCachedWorkerAnalysis } from '../../hooks/useAnalysisWorker';

interface Props {
  parsed: ParsedData;
  datasetName: string;
}

const ROW_HEIGHT = 38;
const OVERSCAN = 10;
const PAGE_SIZE = 50;

// RENDER PERF FIX (this file):
// 1. `parsed` is now a stable reference from the parent (see DataFlowApp's
//    `currentParsed` memoization) — PreviewTab itself is wrapped in
//    React.memo below so it skips re-rendering on unrelated parent state
//    changes.
// 2. CellValue, DataRow, and SortIcon used to be declared INSIDE
//    PreviewTab's render body (as `function DataRow(...)` / const arrow
//    functions). That meant a brand-new function/component *identity* was
//    created on every render of PreviewTab. React identifies component
//    types by reference, so `<DataRow .../>` pointing at a different
//    function object each render is treated as an entirely different
//    component type — React fully unmounts and remounts every
//    previously-rendered <tr> (tearing down and recreating real DOM nodes)
//    instead of diffing/patching them, even though virtualization already
//    limits how many rows are visible at once. Hoisting them to module
//    scope with explicit props (no closure captures over PreviewTab's
//    state) fixes the identity problem and lets React.memo on each of them
//    actually skip unchanged rows/cells.
//
// COMPUTATION FIX (this file): the `filtered` result below used to be a
// useMemo that ran `.filter()`/`.sort()` synchronously on the main thread
// across the FULL rows array on every search keystroke or sort-header
// click — for a 1,000,000-row dataset, long enough to trigger a Chrome
// "Page Unresponsive" prompt. It now runs in the shared analysis worker
// (see analysis.worker.ts's `runPreviewFilterSort`, which is a byte-for-
// byte copy of the same comparison/tie-breaking logic that used to live
// here), via the same useCachedWorkerAnalysis hook and dataset-identity
// cache already used by Pivot/Data Quality. The search term is debounced
// (400ms, matching the debounce idiom already used elsewhere in this
// codebase for persistence — see PivotTab/AdvancedFilterTab) purely to
// avoid firing a worker round-trip on every keystroke; the FILTER LOGIC
// ITSELF is unchanged. A small inline loading indicator now shows while a
// (debounced) search/sort request is in flight.
const CellValue = memo(function CellValue({ val }: { val: unknown }) {
  if (val === null || val === undefined || val === '') {
    return <span className="text-paper-dimmer italic text-[11px] font-mono">null</span>;
  }
  const n = Number(val);
  if (!isNaN(n) && typeof val !== 'boolean') {
    return <span className="font-mono text-data">{String(val)}</span>;
  }
  return <span>{String(val)}</span>;
});

const SortIcon = memo(function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-paper-dimmer group-hover:text-paper-dim transition-colors" />;
  return dir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-accent-bright" />
    : <ChevronDown className="w-3 h-3 text-accent-bright" />;
});

interface DataRowProps {
  row: Record<string, unknown>;
  absIdx: number;
  visibleCols: string[];
  isSelected: boolean;
  onSelect: (absIdx: number) => void;
}

const DataRow = memo(function DataRow({ row, absIdx, visibleCols, isSelected, onSelect }: DataRowProps) {
  return (
    <tr
      onClick={() => onSelect(absIdx)}
      style={{ height: ROW_HEIGHT }}
      className={`border-b border-ink-border/40 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-accent/12 border-l-2 border-l-accent'
          : 'hover:bg-ink-raised'
      }`}
    >
      <td className="sticky left-0 z-10 bg-inherit px-3 font-mono text-[11px] text-paper-dimmer border-r border-ink-border w-12">
        {absIdx + 1}
      </td>
      {visibleCols.map(col => (
        <td
          key={col}
          className="px-3 text-sm text-paper/90 truncate max-w-[240px] border-r border-ink-border/30 last:border-r-0"
          title={String(row[col] ?? '')}
        >
          <CellValue val={row[col]} />
        </td>
      ))}
    </tr>
  );
});

function PreviewTab({ parsed, datasetName }: Props) {
  const { columns, rows } = parsed;

  const [search, setSearch]       = useState('');
  const [sortCol, setSortCol]     = useState<string | null>(null);
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc');
  const [page, setPage]           = useState(0);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const containerRef   = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop]           = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => { setPage(0); }, [rows.length]);

  // Debounce the search text before it drives a worker request — this is
  // purely a UX/timing choice (avoid a round-trip per keystroke) and does
  // NOT change what the filter matches; the same `search` string the user
  // sees in the input is what's eventually sent, unmodified, to
  // runPreviewFilterSort in the worker.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // COMPUTATION FIX: filtering + sorting now happens in the shared analysis
  // worker instead of synchronously on the main thread (see the file-level
  // comment above and analysis.worker.ts's `runPreviewFilterSort`, which is
  // byte-for-byte the same comparison/tie-breaking logic this useMemo used
  // to run directly). Cached by dataset identity + (search, sortCol,
  // sortDir), matching the caching convention already used by
  // Pivot/Data Quality via useCachedWorkerAnalysis.
  const previewCacheKey = `preview:${debouncedSearch}|${sortCol ?? ''}|${sortDir}`;
  const { data: filteredResult, loading: filterLoading } = useCachedWorkerAnalysis<Record<string, unknown>[]>(
    previewCacheKey,
    columns,
    rows,
    () => ({ type: 'preview-filter-sort', search: debouncedSearch, sortCol, sortDir }),
    [debouncedSearch, sortCol, sortDir, rows, columns]
  );
  // While a new (debounced) search/sort request is in flight, keep showing
  // the previous result rather than flashing an empty table — the loading
  // indicator communicates that a fresher result is on its way.
  const [lastGoodFiltered, setLastGoodFiltered] = useState<Record<string, unknown>[]>(rows);
  useEffect(() => {
    if (filteredResult !== null) setLastGoodFiltered(filteredResult);
  }, [filteredResult]);
  const filtered = filteredResult ?? lastGoodFiltered;
  const virtualMode = filtered.length > 5000;

  const totalHeight = filtered.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx   = Math.min(filtered.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setContainerHeight(entry.contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function exportCSV() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filtered);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${datasetName}_filtered.csv`);
  }

  const pageRows   = virtualMode ? [] : filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const visibleCols = useMemo(() => columns.slice(0, 20), [columns]);

  // RENDER PERF FIX: stable callback identity so DataRow's React.memo can
  // actually skip re-rendering rows whose own props haven't changed —
  // previously this was `setSelectedRow(isSelected ? null : absIdx)` defined
  // fresh inside DataRow's body on every render, which is exactly the
  // pattern React.memo can't see through.
  const handleSelectRow = useCallback((absIdx: number) => {
    setSelectedRow(prev => (prev === absIdx ? null : absIdx));
  }, []);

  const tableHeader = (
    <thead>
      <tr className="border-b border-ink-border bg-ink-surface">
        <th className="sticky left-0 z-20 bg-ink-surface px-3 py-3 text-left font-mono text-[11px] text-paper-dimmer font-medium w-12 border-r border-ink-border select-none">
          #
        </th>
        {visibleCols.map(col => (
          <th
            key={col}
            onClick={() => toggleSort(col)}
            className="group px-3 py-3 text-left text-[11px] font-medium text-paper-dim hover:text-paper cursor-pointer select-none whitespace-nowrap transition-colors border-r border-ink-border/50 last:border-r-0"
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate max-w-[140px]">{col}</span>
              <SortIcon active={sortCol === col} dir={sortDir} />
            </div>
          </th>
        ))}
        {columns.length > 20 && (
          <th className="px-3 py-3 text-[11px] text-paper-dimmer font-mono">
            +{columns.length - 20} cols
          </th>
        )}
      </tr>
    </thead>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim pointer-events-none" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search all columns…"
            className="w-full bg-ink-surface border border-ink-border rounded-lg pl-9 pr-8 py-2.5 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-dim hover:text-paper transition"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[12px] text-paper-dim">
          {filterLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <FileText className="w-3.5 h-3.5" />}
          <span className="tabular-nums">{filtered.length.toLocaleString()}</span>
          {filtered.length !== rows.length && (
            <span className="text-paper-dimmer">/ {rows.length.toLocaleString()}</span>
          )}
          <span className="text-paper-dimmer">rows</span>
          {virtualMode && <span className="text-paper-dimmer">· virtual</span>}
          {filterLoading && <span className="text-paper-dimmer">· updating…</span>}
        </div>

        {sortCol && (
          <button
            onClick={() => { setSortCol(null); setSortDir('asc'); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent-bright text-xs transition hover:bg-accent/15"
          >
            <ChevronDown className="w-3 h-3" />
            {sortCol} {sortDir}
            <X className="w-3 h-3" />
          </button>
        )}

        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-ink-raised border border-ink-border text-paper-dim hover:text-paper text-sm font-medium transition"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table container */}
      <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
        {virtualMode ? (
          /* Virtual scroll mode for large datasets */
          <>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm border-collapse min-w-max">
                {tableHeader}
              </table>
            </div>
            <div
              ref={containerRef}
              onScroll={handleScroll}
              className="overflow-auto scrollbar-thin"
              style={{ height: Math.min(560, Math.max(200, (endIdx - startIdx) * ROW_HEIGHT + 20)) }}
            >
              <div style={{ height: totalHeight, position: 'relative' }}>
                <table
                  className="w-full text-sm border-collapse min-w-max"
                  style={{ position: 'absolute', top: startIdx * ROW_HEIGHT, width: '100%' }}
                >
                  <tbody>
                    {filtered.slice(startIdx, endIdx).map((row, i) => (
                      <DataRow
                        key={startIdx + i}
                        row={row}
                        absIdx={startIdx + i}
                        visibleCols={visibleCols}
                        isSelected={selectedRow === startIdx + i}
                        onSelect={handleSelectRow}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* Paginated mode */
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm border-collapse min-w-max">
              {tableHeader}
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCols.length + 1} className="py-16 text-center text-paper-dim text-sm">
                      {search ? `No rows match "${search}"` : 'No data to display'}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, i) => (
                    <DataRow
                      key={i}
                      row={row}
                      absIdx={page * PAGE_SIZE + i}
                      visibleCols={visibleCols}
                      isSelected={selectedRow === page * PAGE_SIZE + i}
                      onSelect={handleSelectRow}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!virtualMode && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage(0)}
              className="px-2.5 py-2 rounded-lg border border-ink-border bg-ink-surface hover:bg-ink-raised text-paper-dim hover:text-paper text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              «
            </button>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-2 rounded-lg border border-ink-border bg-ink-surface hover:bg-ink-raised text-paper-dim hover:text-paper text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              ← Prev
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-paper-dim tabular-nums">
              Page <span className="text-paper font-medium">{page + 1}</span> of {totalPages}
            </span>
            <span className="text-paper-dimmer text-xs">
              ({filtered.length.toLocaleString()} rows)
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-2 rounded-lg border border-ink-border bg-ink-surface hover:bg-ink-raised text-paper-dim hover:text-paper text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Next →
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(totalPages - 1)}
              className="px-2.5 py-2 rounded-lg border border-ink-border bg-ink-surface hover:bg-ink-raised text-paper-dim hover:text-paper text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Selected row detail */}
      {selectedRow !== null && filtered[selectedRow] && (
        <div className="bg-ink-surface border border-ink-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-paper-dim uppercase tracking-wide">
              Row {selectedRow + 1} details
            </span>
            <button onClick={() => setSelectedRow(null)} className="text-paper-dim hover:text-paper transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {columns.map(col => (
              <div key={col} className="bg-ink-raised rounded-lg px-3 py-2 min-w-0">
                <p className="text-[10px] text-paper-dimmer uppercase tracking-wide mb-0.5 truncate">{col}</p>
                <p className="text-sm text-paper truncate" title={String(filtered[selectedRow][col] ?? '')}>
                  {filtered[selectedRow][col] === null || filtered[selectedRow][col] === undefined
                    ? <span className="text-paper-dimmer italic text-xs">null</span>
                    : String(filtered[selectedRow][col])
                  }
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(PreviewTab);
