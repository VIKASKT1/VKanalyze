import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search, Download } from 'lucide-react';
import type { ParsedData } from '../../lib/data-processing';
import { exportToCSV } from '../../lib/export';

interface Props {
  parsed: ParsedData;
  datasetName: string;
}

const PAGE_SIZE = 50;

export default function PreviewTab({ parsed, datasetName }: Props) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return parsed.rows;
    const lower = search.toLowerCase();
    return parsed.rows.filter(row =>
      parsed.columns.some(col => String(row[col] ?? '').toLowerCase().includes(lower))
    );
  }, [parsed, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search rows…"
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => exportToCSV(parsed.rows, parsed.columns, datasetName)}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 text-sm transition"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
        <span className="text-slate-500 text-sm ml-auto">
          {filtered.length.toLocaleString()} {search ? 'matching ' : ''}rows
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/80">
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400 w-12">#</th>
              {parsed.columns.map(col => (
                <th key={col} className="px-3 py-2.5 text-left text-xs font-medium text-slate-300 whitespace-nowrap max-w-[180px]">
                  <span className="block truncate">{col}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={i}
                className="border-t border-slate-700/30 hover:bg-slate-800/40 transition-colors"
              >
                <td className="px-3 py-2 text-slate-600 text-xs">{page * PAGE_SIZE + i + 1}</td>
                {parsed.columns.map(col => {
                  const val = row[col];
                  const isNull = val === null || val === undefined || val === '';
                  return (
                    <td
                      key={col}
                      className={`px-3 py-2 max-w-[180px] ${isNull ? 'text-slate-600 italic' : 'text-slate-300'}`}
                    >
                      <span className="block truncate">{isNull ? 'null' : String(val)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={parsed.columns.length + 1} className="text-center py-12 text-slate-500">
                  No rows match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm disabled:opacity-40 hover:bg-slate-700 transition"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-slate-400 text-sm">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm disabled:opacity-40 hover:bg-slate-700 transition"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
