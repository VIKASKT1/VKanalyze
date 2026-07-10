import { useEffect, useState } from 'react';

const RAW_ROWS = [
  ['region', 'revenue', 'q'],
  ['west', '482', 'q1'],
  ['east', '317', 'q1'],
  ['north', '654', 'q2'],
  ['south', '291', 'q2'],
];

const BARS = [
  { label: 'West', value: 0.74, color: 'bg-accent' },
  { label: 'East', value: 0.49, color: 'bg-data' },
  { label: 'North', value: 1.0, color: 'bg-accent-bright' },
  { label: 'South', value: 0.45, color: 'bg-data-dim' },
];

/**
 * The page's signature element: raw tabular values resolve into a bar chart
 * on load. This is literal to what VKAnalyze does (a spreadsheet becomes a
 * chart in the browser) rather than a decorative gradient or a stock
 * dashboard screenshot, per the brief's call for a hero that is a thesis.
 */
export default function DataTransformHero() {
  const [phase, setPhase] = useState<'raw' | 'transforming' | 'chart'>('raw');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('transforming'), 1100);
    const t2 = setTimeout(() => setPhase('chart'), 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="relative w-full max-w-md rounded-2xl border border-ink-border bg-ink-surface overflow-hidden shadow-glow">
      {/* faint structural grid, like graph paper under the data */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(to right, #5B8DEF 1px, transparent 1px), linear-gradient(to bottom, #5B8DEF 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative flex items-center gap-2 px-4 py-3 border-b border-ink-border">
        <span className="w-2.5 h-2.5 rounded-full bg-ink-borderStrong" />
        <span className="w-2.5 h-2.5 rounded-full bg-ink-borderStrong" />
        <span className="w-2.5 h-2.5 rounded-full bg-ink-borderStrong" />
        <span className="ml-2 font-mono text-[11px] text-paper-dim">q1_q2_regional_sales.csv</span>
      </div>

      <div className="relative p-5 min-h-[280px] flex flex-col justify-center">
        {/* Raw table — fades out */}
        <div
          className={`font-mono text-xs transition-all duration-700 ease-out ${
            phase === 'raw' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none absolute inset-x-5'
          }`}
        >
          {RAW_ROWS.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-3 gap-3 py-2 px-3 rounded ${i === 0 ? 'text-paper-dim border-b border-ink-border mb-1' : 'text-paper'}`}
            >
              {row.map((cell, j) => (
                <span key={j} className={j === 1 && i > 0 ? 'text-data' : ''}>{cell}</span>
              ))}
            </div>
          ))}
        </div>

        {/* Transforming state — brief structural pulse */}
        {phase === 'transforming' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Resolved chart — fades in */}
        <div
          className={`transition-all duration-700 ease-out ${
            phase === 'chart' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none absolute inset-x-5'
          }`}
        >
          <div className="flex items-end justify-between gap-4 h-40 px-2">
            {BARS.map((bar, i) => (
              <div key={bar.label} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end h-32">
                  <div
                    className={`w-full rounded-t-md ${bar.color} transition-all duration-700 ease-out`}
                    style={{
                      height: phase === 'chart' ? `${bar.value * 100}%` : '0%',
                      transitionDelay: `${i * 80}ms`,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] text-paper-dim">{bar.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between font-mono text-[10px] text-paper-dim border-t border-ink-border pt-3">
            <span>4 rows parsed · 0 uploaded to server</span>
            <span className="text-accent-bright">in your browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}
