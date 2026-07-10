import { memo, useState, useMemo, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, LineChart, Line, PieChart, Pie, Cell, Legend,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart, Funnel, FunnelChart, LabelList, Brush, ReferenceLine, Treemap,
  RadialBarChart, RadialBar,
} from 'recharts';
import { Image, FileCode, Maximize2, Minimize2, Palette, AlignCenter, Filter, X } from 'lucide-react';
import type { ParsedData } from '../../lib/data-processing';
import type { ColumnStats } from '../../lib/types';
import { exportChartPNG, exportChartSVG } from '../../lib/export';
import { buildHistogramBins, sampleRowsForVisualization } from '../../lib/histogram';

const VISUALIZATION_SAMPLE_THRESHOLD = 10000;

interface Props {
  parsed: ParsedData;
  statistics: Record<string, ColumnStats>;
}

type ChartType =
  | 'histogram' | 'bar' | 'multi_bar' | 'scatter' | 'bubble'
  | 'line' | 'multi_line' | 'area' | 'pie' | 'donut'
  | 'radar' | 'funnel' | 'treemap' | 'box_plot'
  | 'heatmap' | 'dual_axis' | 'combo' | 'radial';

const CHART_GROUPS: Array<{ label: string; types: Array<{ type: ChartType; label: string }> }> = [
  { label: 'Distribution', types: [
    { type: 'histogram', label: 'Histogram' },
    { type: 'box_plot', label: 'Box Plot' },
    { type: 'heatmap', label: 'Heatmap' },
  ]},
  { label: 'Comparison', types: [
    { type: 'bar', label: 'Bar' },
    { type: 'multi_bar', label: 'Multi-Bar' },
    { type: 'radar', label: 'Radar' },
    { type: 'funnel', label: 'Funnel' },
  ]},
  { label: 'Trend', types: [
    { type: 'line', label: 'Line' },
    { type: 'multi_line', label: 'Multi-Line' },
    { type: 'area', label: 'Area' },
    { type: 'combo', label: 'Combo' },
    { type: 'dual_axis', label: 'Dual Axis' },
  ]},
  { label: 'Part-of-Whole', types: [
    { type: 'pie', label: 'Pie' },
    { type: 'donut', label: 'Donut' },
    { type: 'treemap', label: 'Treemap' },
    { type: 'radial', label: 'Radial Bar' },
  ]},
  { label: 'Relationship', types: [
    { type: 'scatter', label: 'Scatter' },
    { type: 'bubble', label: 'Bubble' },
  ]},
];

const PALETTES: Record<string, string[]> = {
  default:  ['#5B8DEF','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'],
  ocean:    ['#0ea5e9','#0284c7','#0369a1','#075985','#0c4a6e','#7dd3fc','#38bdf8','#bae6fd'],
  forest:   ['#22c55e','#16a34a','#15803d','#166534','#14532d','#4ade80','#86efac','#bbf7d0'],
  sunset:   ['#f97316','#ea580c','#ef4444','#dc2626','#f59e0b','#d97706','#ec4899','#db2777'],
  pastel:   ['#93c5fd','#6ee7b7','#fde68a','#fca5a5','#c4b5fd','#f9a8d4','#67e8f9','#bef264'],
  mono:     ['#f8fafc','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b'],
};

type PaletteName = keyof typeof PALETTES;

function computeBoxStats(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const q1 = s[Math.floor(n * 0.25)];
  const q3 = s[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  return {
    min: s[0], q1, median: s[Math.floor(n / 2)], q3, max: s[n - 1],
    lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr, iqr,
  };
}

const TOOLTIP_STYLE = {
  backgroundColor: '#13161F',
  border: '1px solid #2A2E3A',
  borderRadius: 8,
  color: '#E8E6DF',
  fontSize: 12,
};
const AXIS_TICK = { fill: '#94a3b8', fontSize: 11 };

// RENDER PERF FIX: `parsed` is now a stable reference from the parent (see
// DataFlowApp's `currentParsed` memoization), so this component is wrapped
// in React.memo below. Independently of that, the two useMemo calls right
// below this used to depend on the *whole* `parsed` object (`[parsed,
// statistics]`) instead of the specific field they read (`parsed.columns`).
// Depending on the whole object means the memo is invalidated any time
// `parsed` gets a new reference for any reason — including previously, on
// every single parent render, and still today whenever rows change (e.g.
// after a cleaning operation) even though only `parsed.columns` is actually
// read here. Narrowing the dependency to `parsed.columns` makes the memo
// correctly reflect what the computation actually depends on.
function VisualizeTab({ parsed, statistics }: Props) {
  const numericCols = useMemo(
    () => parsed.columns.filter(c => statistics[c]?.mean !== undefined),
    [parsed.columns, statistics]
  );
  const textCols = useMemo(
    () => parsed.columns.filter(c => statistics[c]?.mean === undefined),
    [parsed.columns, statistics]
  );

  const defaultType: ChartType = numericCols.length > 0 ? 'histogram' : 'pie';
  const [chartType, setChartType] = useState<ChartType>(defaultType);
  const [xCol, setXCol] = useState(numericCols[0] ?? textCols[0] ?? '');
  const [yCol, setYCol] = useState(numericCols[1] ?? numericCols[0] ?? '');
  const [yCol2, setYCol2] = useState(numericCols[2] ?? numericCols[1] ?? '');
  const [zCol, setZCol] = useState(numericCols[2] ?? '');
  const [groupCol, setGroupCol] = useState(textCols[0] ?? '');
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [bins, setBins] = useState(20);
  const [palette, setPalette] = useState<PaletteName>('default');
  const [showBrush, setShowBrush] = useState(false);
  const [showDataLabels, setShowDataLabels] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({});
  const [annotation, setAnnotation] = useState('');
  const chartId = useRef(`vk-chart-${Math.random().toString(36).slice(2)}`);
  const COLORS = PALETTES[palette];

  // Cross-filter click handler
  const handleChartClick = useCallback((data: Record<string, unknown>) => {
    if (!data || !xCol) return;
    const val = String(data.name ?? data[xCol] ?? '');
    if (!val) return;
    setActiveFilters(prev => {
      const cur = new Set(prev[xCol] ?? []);
      if (cur.has(val)) cur.delete(val); else cur.add(val);
      return cur.size === 0 ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== xCol)) : { ...prev, [xCol]: cur };
    });
  }, [xCol]);

  // Filtered rows from cross-filter state
  const filteredRows = useMemo(() => {
    let rows = parsed.rows;
    for (const [col, vals] of Object.entries(activeFilters)) {
      if (vals.size === 0) continue;
      rows = rows.filter(r => vals.has(String(r[col] ?? '')));
    }
    return rows;
  }, [parsed.rows, activeFilters]);

  // Large datasets (100k-1M+ rows) must never be walked in full just to draw
  // a chart. Statistics (mean/median/stdDev/min/max/nulls) are computed on
  // the FULL dataset independently in data-processing.ts/profileData and
  // passed in via the `statistics` prop — sampling here has zero effect on
  // those numbers. Only the pixels on screen use the sampled subset.
  // This only recomputes when the underlying filtered dataset actually
  // changes (useMemo keyed on filteredRows), not on every render.
  const visualRows = useMemo(
    () => sampleRowsForVisualization(filteredRows, VISUALIZATION_SAMPLE_THRESHOLD),
    [filteredRows]
  );

  const chartData = useMemo((): Record<string, unknown>[] => {
    const rows = visualRows;
    if (!xCol) return [];

    switch (chartType) {
      case 'histogram': {
        const vals = rows.map(r => Number(r[xCol])).filter(n => !isNaN(n));
        return buildHistogramBins(vals, bins).map(b => ({ ...b }));
      }
      case 'pie': case 'donut': case 'funnel': case 'treemap': case 'radial': {
        const freq: Record<string, number> = {};
        for (const r of rows) { const v = String(r[xCol] ?? 'null'); freq[v] = (freq[v] ?? 0) + 1; }
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
      }
      case 'bar': {
        const freq: Record<string, number> = {};
        for (const r of rows) { const v = String(r[xCol] ?? 'null'); freq[v] = (freq[v] ?? 0) + 1; }
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count }));
      }
      case 'multi_bar': {
        if (!groupCol) return [];
        const groups: Record<string, Record<string, number>> = {};
        for (const r of rows) {
          const x = String(r[xCol] ?? ''); const g = String(r[groupCol] ?? '');
          if (!groups[x]) groups[x] = {};
          groups[x][g] = (groups[x][g] ?? 0) + 1;
        }
        return Object.entries(groups).slice(0, 15).map(([name, g]) => ({ name, ...g }));
      }
      case 'scatter': case 'bubble': {
        if (!yCol) return [];
        return rows.slice(0, 500).map(r => ({
          x: Number(r[xCol]), y: Number(r[yCol]),
          z: zCol ? Math.max(5, Math.min(40, Number(r[zCol]) || 10)) : 8,
          name: groupCol ? String(r[groupCol] ?? '') : '',
        })).filter(p => !isNaN(p.x) && !isNaN(p.y));
      }
      case 'line': case 'area': {
        return rows.slice(0, 300).map((r, i) => ({ index: i, value: Number(r[xCol]) })).filter(p => !isNaN(p.value));
      }
      case 'multi_line': case 'combo': case 'dual_axis': {
        const cols = [xCol, yCol, ...extraCols].filter(Boolean);
        return rows.slice(0, 200).map((r, i) => {
          const pt: Record<string, unknown> = { index: i };
          for (const c of cols) pt[c] = Number(r[c]);
          return pt;
        });
      }
      case 'radar': {
        // Normalise multiple numeric cols per row into a radar per-column
        const cols = numericCols.slice(0, 8);
        const maxVals = cols.map(c => statistics[c]?.max ? Number(statistics[c].max) : 1);
        return cols.map((col, j) => ({
          col,
          value: parseFloat((((statistics[col]?.mean ?? 0) / (maxVals[j] || 1)) * 100).toFixed(1)),
        }));
      }
      case 'heatmap': {
        // Correlation heatmap — value matrix as flat list for grid rendering
        const cols = numericCols.slice(0, 8);
        const result: Record<string, unknown>[] = [];
        for (const a of cols) {
          const aVals = rows.map(r => Number(r[a])).filter(n => !isNaN(n));
          for (const b of cols) {
            const bVals = rows.map(r => Number(r[b])).filter(n => !isNaN(n));
            const n = Math.min(aVals.length, bVals.length);
            const ma = aVals.slice(0, n).reduce((s, v) => s + v, 0) / n;
            const mb = bVals.slice(0, n).reduce((s, v) => s + v, 0) / n;
            let num = 0, da = 0, db = 0;
            for (let i = 0; i < n; i++) { const x = aVals[i] - ma, y = bVals[i] - mb; num += x * y; da += x * x; db += y * y; }
            const r = Math.sqrt(da * db) === 0 ? 0 : num / Math.sqrt(da * db);
            result.push({ row: a, col: b, value: parseFloat(r.toFixed(3)) });
          }
        }
        return result;
      }
      case 'box_plot': {
        // Box plot per column
        return numericCols.slice(0, 8).map(col => {
          const vals = rows.map(r => Number(r[col])).filter(n => !isNaN(n) && isFinite(n));
          const b = computeBoxStats(vals);
          if (!b) return { name: col, min: 0, q1: 0, median: 0, q3: 0, max: 0, iqr: 0 };
          return { name: col, min: b.min, q1: b.q1, median: b.median, q3: b.q3, max: b.max, iqr: b.iqr };
        });
      }
    }
    return [];
  }, [chartType, xCol, yCol, zCol, groupCol, extraCols, bins, visualRows, numericCols, statistics]);

  // Get distinct group values for multi_bar
  const groupValues = useMemo(() => {
    if (chartType !== 'multi_bar' || !groupCol) return [];
    const vals = new Set<string>();
    for (const r of visualRows) vals.add(String(r[groupCol] ?? ''));
    return [...vals].slice(0, 6);
  }, [chartType, groupCol, visualRows]);

  // Heatmap cols for rendering
  const heatmapCols = useMemo(() => numericCols.slice(0, 8), [numericCols]);

  function renderChart() {
    if (chartData.length === 0) {
      return <div className="flex items-center justify-center h-full text-paper-dim text-sm">No data for this configuration.</div>;
    }
    const margin = { top: 10, right: 20, left: 0, bottom: showBrush ? 50 : 30 };

    switch (chartType) {
      case 'histogram':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ ...margin, bottom: 40 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="range" tick={AXIS_TICK} angle={-35} textAnchor="end" interval="preserveStartEnd" />
              <YAxis tick={AXIS_TICK} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {showBrush && <Brush dataKey="range" height={20} stroke="#334155" />}
              <Bar dataKey="count" fill={COLORS[0]} radius={[3,3,0,0]} onClick={d => handleChartClick(d as unknown as Record<string, unknown>)}>
                {showDataLabels && <LabelList dataKey="count" position="top" style={{ fill: '#94a3b8', fontSize: 10 }} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ ...margin, bottom: 60 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="name" tick={AXIS_TICK} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={AXIS_TICK} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {showBrush && <Brush dataKey="name" height={20} stroke="#334155" />}
              <Bar dataKey="count" radius={[3,3,0,0]} onClick={d => handleChartClick(d as unknown as Record<string, unknown>)}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                {showDataLabels && <LabelList dataKey="count" position="top" style={{ fill: '#94a3b8', fontSize: 10 }} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'multi_bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ ...margin, bottom: 60 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="name" tick={AXIS_TICK} angle={-35} textAnchor="end" />
              <YAxis tick={AXIS_TICK} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
              {groupValues.map((g, i) => (
                <Bar key={g} dataKey={g} fill={COLORS[i % COLORS.length]} radius={[2,2,0,0]} stackId={undefined}>
                  {showDataLabels && <LabelList dataKey={g} position="top" style={{ fill: '#94a3b8', fontSize: 9 }} />}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={margin}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="index" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {showBrush && <Brush dataKey="index" height={20} stroke="#334155" />}
              <Line type="monotone" dataKey="value" stroke={COLORS[0]} dot={false} strokeWidth={2}>
                {showDataLabels && <LabelList dataKey="value" position="top" style={{ fill: '#94a3b8', fontSize: 9 }} />}
              </Line>
            </LineChart>
          </ResponsiveContainer>
        );

      case 'multi_line': {
        const cols = [xCol, yCol, ...extraCols].filter(Boolean);
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={margin}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="index" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
              {showBrush && <Brush dataKey="index" height={20} stroke="#334155" />}
              {cols.map((c, i) => (
                <Line key={c} type="monotone" dataKey={c} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      }

      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={margin}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="index" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {showBrush && <Brush dataKey="index" height={20} stroke="#334155" />}
              <Area type="monotone" dataKey="value" stroke={COLORS[0]} fill={`${COLORS[0]}30`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'combo': case 'dual_axis': {
        const cols = [xCol, yCol, ...extraCols].filter(Boolean);
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={margin}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="index" tick={AXIS_TICK} />
              <YAxis yAxisId="left" tick={AXIS_TICK} />
              {chartType === 'dual_axis' && <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} />}
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
              {cols.map((c, i) =>
                i === 0
                  ? <Bar key={c} dataKey={c} fill={COLORS[0]} radius={[2,2,0,0]} yAxisId="left" />
                  : <Line key={c} type="monotone" dataKey={c} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} yAxisId={chartType === 'dual_axis' ? 'right' : 'left'} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        );
      }

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={margin}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="x" name={xCol} tick={AXIS_TICK} label={{ value: xCol, position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
              <YAxis dataKey="y" name={yCol} tick={AXIS_TICK} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE} />
              <Scatter data={chartData} fill={COLORS[0]} opacity={0.7} r={4} onClick={d => handleChartClick(d as unknown as Record<string, unknown>)} />
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'bubble':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={margin}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="x" name={xCol} tick={AXIS_TICK} />
              <YAxis dataKey="y" name={yCol} tick={AXIS_TICK} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE}
                formatter={(v, n) => [typeof v === 'number' ? v.toFixed(3) : v, n]} />
              <Scatter data={chartData} fill={COLORS[0]} opacity={0.6}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} r={Number((entry as unknown as Record<string, unknown>).z ?? 8)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'pie': case 'donut':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={chartType === 'donut' ? '40%' : 0}
                outerRadius="70%"
                label={showDataLabels ? ({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%` : undefined}
                labelLine={showDataLabels}
                onClick={d => handleChartClick(d as unknown as Record<string, unknown>)}
              >
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'radar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="#2A2E3A" />
              <PolarAngleAxis dataKey="col" tick={AXIS_TICK} />
              <PolarRadiusAxis tick={AXIS_TICK} />
              <Radar name="Mean %" dataKey="value" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.3} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </RadarChart>
          </ResponsiveContainer>
        );

      case 'funnel':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Funnel dataKey="value" data={chartData} isAnimationActive>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                {showDataLabels && <LabelList position="right" fill="#94a3b8" stroke="none" dataKey="name" />}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        );

      case 'treemap':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={chartData}
              dataKey="value"
              aspectRatio={4 / 3}
              stroke="#0f172a"
              content={({ x, y, width, height, name, value, index }: Record<string, unknown>) => {
                const xi = Number(x), yi = Number(y), wi = Number(width), hi = Number(height);
                const i = Number(index ?? 0);
                return (
                  <g>
                    <rect x={xi} y={yi} width={wi} height={hi} fill={COLORS[i % COLORS.length]} stroke="#0f172a" strokeWidth={2} />
                    {wi > 40 && hi > 25 && (
                      <text x={xi + wi / 2} y={yi + hi / 2} textAnchor="middle" fill="white" fontSize={10} fontWeight={600}>
                        <tspan x={xi + wi / 2} dy="0">{String(name ?? '').slice(0, 12)}</tspan>
                        {hi > 40 && <tspan x={xi + wi / 2} dy="14">{Number(value).toLocaleString()}</tspan>}
                      </text>
                    )}
                  </g>
                );
              }}
            />
          </ResponsiveContainer>
        );

      case 'radial':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={chartData}>
              <RadialBar dataKey="value" label={{ position: 'insideStart', fill: '#94a3b8', fontSize: 10 }}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </RadialBar>
              <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </RadialBarChart>
          </ResponsiveContainer>
        );

      case 'box_plot':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={margin}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />}
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v: unknown, n: unknown) => [
                  typeof v === 'number' ? v.toFixed(3) : String(v ?? ''),
                  String(n ?? ''),
                ]} />
              {/* Box: Q1–Q3 as bar with bottom=Q1 */}
              <Bar dataKey="q3" fill="transparent" stroke="transparent" />
              <Bar dataKey="iqr" fill={COLORS[0]} fillOpacity={0.4} stroke={COLORS[0]} radius={0} />
              <ReferenceLine y={0} stroke="#334155" />
              {/* Median line as scatter */}
              <Line type="monotone" dataKey="median" stroke={COLORS[0]} strokeWidth={2} dot={{ fill: COLORS[0], r: 4 }} />
              <Line type="monotone" dataKey="min" stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="max" stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        );

      case 'heatmap': {
        const hCols = heatmapCols;
        const hData = chartData as Array<{ row: string; col: string; value: number }>;
        const cellSize = Math.max(32, Math.min(60, Math.floor(320 / hCols.length)));
        return (
          <div className="overflow-auto p-2" style={{ maxHeight: 400 }}>
            <div style={{ display: 'inline-block' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${hCols.length}, ${cellSize}px)`, gap: 2 }}>
                <div />
                {hCols.map(c => (
                  <div key={c} className="text-xs text-paper-dim font-medium text-center truncate" style={{ maxWidth: cellSize }}>
                    {c.slice(0, 8)}
                  </div>
                ))}
                {hCols.map(row => [
                  <div key={`lbl-${row}`} className="text-xs text-paper-dim font-medium flex items-center justify-end pr-2 truncate">
                    {row.slice(0, 10)}
                  </div>,
                  ...hCols.map(col => {
                    const cell = hData.find(d => d.row === row && d.col === col);
                    const v = cell?.value ?? 0;
                    const abs = Math.abs(v);
                    const bg = v === 1 ? '#334155'
                      : v > 0 ? `rgba(16,185,129,${0.1 + abs * 0.7})`
                      : `rgba(239,68,68,${0.1 + abs * 0.7})`;
                    return (
                      <div key={col} className="flex items-center justify-center rounded text-xs font-mono"
                        style={{ background: bg, width: cellSize, height: cellSize, color: abs > 0.5 ? '#e2e8f0' : '#94a3b8' }}
                        title={`${row} × ${col}: ${v.toFixed(3)}`}>
                        {v === 1 ? '—' : v.toFixed(2)}
                      </div>
                    );
                  }),
                ])}
              </div>
            </div>
            <p className="text-xs text-paper-dim mt-2">Green = positive correlation, Red = negative</p>
          </div>
        );
      }
    }
    return null;
  }

  const chartHeight = fullscreen ? '100%' : 384;

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-ink flex flex-col p-4 overflow-auto' : 'space-y-4'}>
      {/* ── Controls bar ── */}
      <div className="flex flex-wrap gap-3 items-end bg-ink-raised/50 border border-ink-borderStrong/50 rounded-xl p-4">
        {/* Chart type groups */}
        <div className="w-full">
          <label className="block text-xs text-paper-dim mb-2">Chart Type</label>
          <div className="flex flex-wrap gap-2">
            {CHART_GROUPS.map(group => (
              <div key={group.label} className="flex items-center gap-1 bg-ink-surface rounded-lg p-1">
                <span className="text-[10px] text-paper-dimmer uppercase tracking-wide px-1">{group.label}</span>
                {group.types.map(({ type, label }) => (
                  <button key={type} onClick={() => setChartType(type)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${chartType === type ? 'bg-accent text-ink' : 'text-paper-dim hover:text-paper hover:bg-ink-borderStrong'}`}>
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Column selectors */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-paper-dim mb-1">{['histogram','line','area','box_plot','heatmap'].includes(chartType) ? 'Column' : 'X / Category'}</label>
            <select value={xCol} onChange={e => setXCol(e.target.value)}
              className="px-3 py-1.5 bg-ink-raised border border-ink-borderStrong rounded-lg text-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent">
              {parsed.columns.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {['scatter','bubble','line','multi_line','area','combo','dual_axis','multi_bar'].includes(chartType) && (
            <div>
              <label className="block text-xs text-paper-dim mb-1">{chartType === 'multi_bar' ? 'Group By' : 'Y Axis'}</label>
              <select value={chartType === 'multi_bar' ? groupCol : yCol}
                onChange={e => chartType === 'multi_bar' ? setGroupCol(e.target.value) : setYCol(e.target.value)}
                className="px-3 py-1.5 bg-ink-raised border border-ink-borderStrong rounded-lg text-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent">
                {(chartType === 'multi_bar' ? textCols : numericCols).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}

          {['dual_axis','combo'].includes(chartType) && (
            <div>
              <label className="block text-xs text-paper-dim mb-1">Y2 Axis</label>
              <select value={yCol2} onChange={e => setYCol2(e.target.value)}
                className="px-3 py-1.5 bg-ink-raised border border-ink-borderStrong rounded-lg text-paper text-sm focus:outline-none">
                {numericCols.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}

          {chartType === 'bubble' && (
            <div>
              <label className="block text-xs text-paper-dim mb-1">Bubble Size</label>
              <select value={zCol} onChange={e => setZCol(e.target.value)}
                className="px-3 py-1.5 bg-ink-raised border border-ink-borderStrong rounded-lg text-paper text-sm focus:outline-none">
                {numericCols.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}

          {chartType === 'histogram' && (
            <div>
              <label className="block text-xs text-paper-dim mb-1">Bins: {bins}</label>
              <input type="range" min={5} max={50} value={bins} onChange={e => setBins(Number(e.target.value))}
                className="accent-blue-500 w-24" />
            </div>
          )}

          {['multi_line','combo','dual_axis'].includes(chartType) && (
            <div>
              <label className="block text-xs text-paper-dim mb-1">+ Series</label>
              <div className="flex gap-1 flex-wrap">
                {numericCols.filter(c => c !== xCol && c !== yCol).slice(0, 4).map(c => (
                  <button key={c} onClick={() => setExtraCols(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                    className={`px-2 py-1 rounded text-xs transition ${extraCols.includes(c) ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Options row */}
        <div className="flex flex-wrap gap-2 items-center ml-auto">
          {/* Palette */}
          <div className="flex items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-paper-dim" />
            <select value={palette} onChange={e => setPalette(e.target.value as PaletteName)}
              className="bg-ink-raised border border-ink-borderStrong rounded px-2 py-1 text-xs text-paper focus:outline-none">
              {Object.keys(PALETTES).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {/* Toggles */}
          {['line','multi_line','area','bar','histogram','combo','dual_axis','multi_bar'].includes(chartType) && (
            <button onClick={() => setShowBrush(v => !v)}
              className={`px-2 py-1 rounded text-xs transition flex items-center gap-1 ${showBrush ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}>
              Brush
            </button>
          )}
          <button onClick={() => setShowDataLabels(v => !v)}
            className={`px-2 py-1 rounded text-xs transition flex items-center gap-1 ${showDataLabels ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}>
            <AlignCenter className="w-3 h-3" /> Labels
          </button>
          <button onClick={() => setShowGrid(v => !v)}
            className={`px-2 py-1 rounded text-xs transition ${showGrid ? 'bg-ink-borderStrong text-paper' : 'bg-ink-raised text-paper-dim hover:text-paper'}`}>
            Grid
          </button>
          <button onClick={() => setFullscreen(v => !v)}
            className="px-2 py-1 rounded bg-ink-raised hover:bg-ink-borderStrong text-paper-dim hover:text-paper text-xs transition">
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Annotation input */}
      {fullscreen && (
        <div className="flex gap-2">
          <input value={annotation} onChange={e => setAnnotation(e.target.value)} placeholder="Add chart annotation…"
            className="flex-1 bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-1.5 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent" />
          {annotation && <button onClick={() => setAnnotation('')} className="px-2 text-paper-dim hover:text-paper"><X className="w-4 h-4" /></button>}
        </div>
      )}

      {/* Active cross-filters badge */}
      {Object.keys(activeFilters).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-accent-bright" />
          {Object.entries(activeFilters).map(([col, vals]) => (
            <span key={col} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent-bright text-xs">
              {col}: {[...vals].join(', ')}
              <button onClick={() => setActiveFilters(p => { const n = { ...p }; delete n[col]; return n; })}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button onClick={() => setActiveFilters({})} className="text-xs text-paper-dim hover:text-paper">Clear all</button>
        </div>
      )}

      {/* Chart area */}
      <div id={chartId.current} className="bg-ink-raised/50 border border-ink-borderStrong/50 rounded-xl p-4 relative"
        style={{ height: chartType === 'heatmap' ? 'auto' : chartHeight }}>
        {annotation && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-ink-surface/80 border border-ink-borderStrong rounded-lg px-3 py-1 text-xs text-paper/90 z-10 pointer-events-none">
            {annotation}
          </div>
        )}
        {renderChart()}
      </div>

      {/* Export + info row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-paper-dim">Export:</span>
        <button onClick={() => exportChartPNG(chartId.current, `${xCol}_${chartType}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-xs font-medium transition">
          <Image className="w-3.5 h-3.5" /> PNG
        </button>
        <button onClick={() => exportChartSVG(chartId.current, `${xCol}_${chartType}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-xs font-medium transition">
          <FileCode className="w-3.5 h-3.5" /> SVG
        </button>
        <span className="ml-auto text-xs text-paper-dimmer">
          {filteredRows.length.toLocaleString()} rows
          {Object.keys(activeFilters).length > 0 && ` (filtered from ${parsed.rows.length.toLocaleString()})`}
        </span>
      </div>

      {/* Stats summary */}
      {xCol && statistics[xCol] && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Mean', value: statistics[xCol].mean },
            { label: 'Median', value: statistics[xCol].median },
            { label: 'Std Dev', value: statistics[xCol].stdDev },
            { label: 'Min', value: statistics[xCol].min },
            { label: 'Max', value: statistics[xCol].max },
            { label: 'Nulls', value: statistics[xCol].nullCount },
          ].map(({ label, value }) => value !== undefined ? (
            <div key={label} className="bg-ink-raised/40 border border-ink-borderStrong/50 rounded-lg p-3 text-center">
              <p className="text-paper-dim text-xs mb-1">{label}</p>
              <p className="text-paper font-semibold text-sm">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

export default memo(VisualizeTab);
