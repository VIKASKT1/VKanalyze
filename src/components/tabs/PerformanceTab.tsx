import { useState, useEffect, useRef } from 'react';
import { Activity, Cpu, Database, Clock, Zap, AlertTriangle, Brain, ShieldCheck } from 'lucide-react';
import AIUsageCenter from '../AIUsageCenter';
import LocalOnlyDiagnostics from '../LocalOnlyDiagnostics';

interface Props {
  rowCount: number;
  columnCount: number;
}

interface Metric {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}

export default function PerformanceTab({ rowCount, columnCount }: Props) {
  const [memory, setMemory] = useState<{ used: number; total: number } | null>(null);
  const [fps, setFps] = useState<number>(60);
  const frameRef = useRef<number>(0);
  const lastTime = useRef<number>(performance.now());
  const frameCount = useRef<number>(0);

  useEffect(() => {
    // Memory estimation
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } };
    if (perf.memory) {
      setMemory({
        used: Math.round(perf.memory.usedJSHeapSize / 1048576),
        total: Math.round(perf.memory.totalJSHeapSize / 1048576),
      });
    }

    // FPS counter
    function tick(now: number) {
      frameCount.current++;
      const elapsed = now - lastTime.current;
      if (elapsed >= 1000) {
        setFps(Math.round((frameCount.current * 1000) / elapsed));
        frameCount.current = 0;
        lastTime.current = now;
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  // Estimate dataset memory usage
  const estimatedMB = Math.round((rowCount * columnCount * 50) / 1048576 * 10) / 10;
  const cellCount = rowCount * columnCount;

  function getScalingAssessment() {
    if (rowCount < 10000)  return { label: 'Excellent', color: 'text-emerald-400', note: 'All features run at full speed.' };
    if (rowCount < 50000)  return { label: 'Good',      color: 'text-accent-bright',    note: 'All features work well. Charts may sample data.' };
    if (rowCount < 100000) return { label: 'Moderate',  color: 'text-amber-400',   note: 'Some operations may take 2-5s. Profiling uses Web Worker.' };
    if (rowCount < 500000) return { label: 'Heavy',     color: 'text-orange-400',  note: 'Complex analytics may be slow. Virtualized table active.' };
    return { label: 'Critical', color: 'text-red-400', note: 'Near browser memory limits. Consider chunking or sampling.' };
  }

  const assessment = getScalingAssessment();

  const metrics: Metric[] = [
    { label: 'Dataset Rows',    value: rowCount.toLocaleString(),       color: 'text-accent-bright',    icon: Database },
    { label: 'Columns',         value: String(columnCount),             color: 'text-accent-bright',    icon: Database },
    { label: 'Total Cells',     value: cellCount.toLocaleString(),      color: 'text-paper/90',   icon: Database },
    { label: 'Est. Memory',     value: `~${estimatedMB} MB`,           color: estimatedMB > 200 ? 'text-red-400' : 'text-emerald-400', icon: Cpu },
    { label: 'JS Heap Used',    value: memory ? `${memory.used} MB` : 'N/A', color: 'text-paper/90', icon: Cpu },
    { label: 'JS Heap Total',   value: memory ? `${memory.total} MB` : 'N/A', color: 'text-paper/90', icon: Cpu },
    { label: 'UI FPS',          value: `${fps}`,                        color: fps > 50 ? 'text-emerald-400' : fps > 30 ? 'text-amber-400' : 'text-red-400', icon: Activity },
    { label: 'Virtual Scroll',  value: rowCount > 5000 ? 'Active' : 'Off', color: rowCount > 5000 ? 'text-emerald-400' : 'text-paper-dim', icon: Zap },
  ];

  const recommendations: string[] = [];
  if (rowCount > 50000)  recommendations.push('Correlation matrix is capped at 10 columns for performance.');
  if (rowCount > 100000) recommendations.push('Consider filtering or sampling to a representative subset before analysis.');
  if (rowCount > 200000) recommendations.push('SQL queries with GROUP BY may take 5–15 seconds on this dataset size.');
  if (rowCount > 500000) recommendations.push('Risk of browser tab crash. Export and use a dedicated tool (DuckDB, Pandas) for this scale.');
  if (estimatedMB > 500) recommendations.push('Dataset may exceed available browser memory. Watch for "Out of Memory" errors.');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-paper mb-1">Performance Monitor</h3>
        <p className="text-sm text-paper-dim">Real-time metrics for your current dataset and browser environment.</p>
      </div>

      {/* Scaling assessment */}
      <div className={`p-4 rounded-xl border ${assessment.label === 'Excellent' ? 'bg-emerald-500/10 border-emerald-500/30' : assessment.label === 'Critical' ? 'bg-red-500/10 border-red-500/30' : 'bg-ink-raised/50 border-ink-borderStrong'}`}>
        <div className="flex items-center gap-3">
          <Clock className={`w-5 h-5 ${assessment.color}`} />
          <div>
            <p className={`font-semibold ${assessment.color}`}>{assessment.label} — {rowCount.toLocaleString()} rows</p>
            <p className="text-sm text-paper-dim mt-0.5">{assessment.note}</p>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="bg-ink-surface border border-ink-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <m.icon className="w-4 h-4 text-paper-dimmer" />
              <span className="text-xs text-paper-dim">{m.label}</span>
            </div>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Scaling table */}
      <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-border">
          <h4 className="text-sm font-semibold text-paper">Scaling Limits</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-border">
                <th className="text-left px-4 py-2.5 text-xs text-paper-dim">Row Count</th>
                <th className="text-left px-4 py-2.5 text-xs text-paper-dim">Charts</th>
                <th className="text-left px-4 py-2.5 text-xs text-paper-dim">SQL</th>
                <th className="text-left px-4 py-2.5 text-xs text-paper-dim">Correlation</th>
                <th className="text-left px-4 py-2.5 text-xs text-paper-dim">Cleaning</th>
                <th className="text-left px-4 py-2.5 text-xs text-paper-dim">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['< 10k',  '✅ Instant', '✅ Instant', '✅ Instant',  '✅ Instant', '🟢 Smooth'],
                ['< 50k',  '✅ <1s',     '✅ <2s',     '✅ <3s',      '✅ <2s',     '🟢 Good'],
                ['< 100k', '✅ sampled', '⚠️ 3–8s',   '⚠️ 5–15s',   '⚠️ 5–10s',  '🟡 Acceptable'],
                ['< 500k', '✅ sampled', '⚠️ 15–40s', '❌ Too slow', '⚠️ 15–30s', '🟠 Sluggish'],
                ['1M+',    '✅ sampled', '❌ Crash risk','❌ OOM',    '❌ OOM',     '🔴 Unusable'],
              ].map(([rows, ...cols]) => (
                <tr key={rows} className={`border-b border-ink-border/50 ${rowCount > 0 && rows.includes('k') && (() => {
                  const n = parseInt(rows.replace(/[^0-9]/g, ''));
                  return (rows.startsWith('<') && rowCount < n * 1000) || (rows.startsWith('1M'));
                })() ? 'bg-accent/5' : ''}`}>
                  <td className="px-4 py-2 font-mono text-xs text-paper/90">{rows}</td>
                  {cols.map((c, i) => <td key={i} className="px-4 py-2 text-xs text-paper-dim">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Usage Center */}
      <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-paper">AI Usage Center</h3>
        </div>
        <AIUsageCenter />
      </div>

      {/* Local Only Diagnostics */}
      <div className="bg-ink-surface border border-ink-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-paper">Local Only Diagnostics</h3>
        </div>
        <LocalOnlyDiagnostics />
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" /> Recommendations for your current dataset
          </div>
          <ul className="space-y-1.5">
            {recommendations.map((r, i) => (
              <li key={i} className="text-sm text-paper/90 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
