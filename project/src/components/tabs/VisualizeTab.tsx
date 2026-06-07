import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import type { ParsedData } from '../../lib/data-processing';
import type { ColumnStats } from '../../lib/types';

interface Props {
  parsed: ParsedData;
  statistics: Record<string, ColumnStats>;
}

type ChartType = 'histogram' | 'bar' | 'scatter' | 'line' | 'pie';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function buildHistogramBins(
  values: number[],
  bins: number
): Array<{ range: string; count: number }> {
  if (values.length === 0) return [];
  const min = values.reduce((a, b) => (a < b ? a : b));
  const max = values.reduce((a, b) => (a > b ? a : b));
  if (min === max) return [{ range: String(min), count: values.length }];

  const binWidth = (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    range: `${(min + i * binWidth).toFixed(1)}–${(min + (i + 1) * binWidth).toFixed(1)}`,
    count: 0,
  }));

  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
    buckets[idx].count++;
  }
  return buckets;
}

export default function VisualizeTab({ parsed, statistics }: Props) {
  const numericCols = useMemo(
    () => parsed.columns.filter(col => statistics[col]?.mean !== undefined),
    [parsed, statistics]
  );
  const textCols = useMemo(
    () => parsed.columns.filter(col => statistics[col]?.mean === undefined),
    [parsed, statistics]
  );

  const [chartType, setChartType] = useState<ChartType>('histogram');
  const [xCol, setXCol] = useState(numericCols[0] ?? textCols[0] ?? '');
  const [yCol, setYCol] = useState(numericCols[1] ?? numericCols[0] ?? '');
  const [bins, setBins] = useState(20);

  const chartData = useMemo(() => {
    if (!xCol) return [];

    if (chartType === 'histogram') {
      const vals = parsed.rows
        .map(r => Number(r[xCol]))
        .filter(n => !isNaN(n));
      return buildHistogramBins(vals, bins);
    }

    if (chartType === 'pie') {
      const freq: Record<string, number> = {};
      for (const row of parsed.rows) {
        const v = String(row[xCol] ?? 'null');
        freq[v] = (freq[v] ?? 0) + 1;
      }
      return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, value]) => ({ name, value }));
    }

    if (chartType === 'scatter') {
      if (!yCol) return [];
      return parsed.rows.slice(0, 500).map(r => ({
        x: Number(r[xCol]),
        y: Number(r[yCol]),
      })).filter(p => !isNaN(p.x) && !isNaN(p.y));
    }

    if (chartType === 'bar') {
      const freq: Record<string, number> = {};
      for (const row of parsed.rows) {
        const v = String(row[xCol] ?? 'null');
        freq[v] = (freq[v] ?? 0) + 1;
      }
      return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name, count }));
    }

    if (chartType === 'line') {
      return parsed.rows.slice(0, 200).map((r, i) => ({
        index: i,
        value: Number(r[xCol]),
      })).filter(p => !isNaN(p.value));
    }

    return [];
  }, [chartType, xCol, yCol, bins, parsed]);

  const tooltipStyle = {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 12,
  };

  const axisStyle = { fill: '#94a3b8', fontSize: 11 };

  function renderChart() {
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-slate-500">
          No data available for this configuration.
        </div>
      );
    }

    if (chartType === 'histogram') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="range" tick={axisStyle} angle={-35} textAnchor="end" interval="preserveStartEnd" />
            <YAxis tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tick={axisStyle} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'scatter') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="x" name={xCol} tick={axisStyle} label={{ value: xCol, position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 11 }} />
            <YAxis dataKey="y" name={yCol} tick={axisStyle} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} />
            <Scatter data={chartData} fill="#f59e0b" opacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="index" tick={axisStyle} />
            <YAxis tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'pie') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    return null;
  }

  const TYPES: { type: ChartType; label: string }[] = [
    { type: 'histogram', label: 'Histogram' },
    { type: 'bar', label: 'Bar' },
    { type: 'scatter', label: 'Scatter' },
    { type: 'line', label: 'Line' },
    { type: 'pie', label: 'Pie' },
  ];

  const xColOptions = chartType === 'histogram' || chartType === 'scatter' || chartType === 'line'
    ? numericCols
    : [...textCols, ...numericCols];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        {/* Chart type */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Chart Type</label>
          <div className="flex gap-1">
            {TYPES.map(({ type, label }) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${chartType === type ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* X column */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">
            {chartType === 'histogram' || chartType === 'line' ? 'Column' : 'X Axis'}
          </label>
          <select
            value={xCol}
            onChange={e => setXCol(e.target.value)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {xColOptions.map(col => <option key={col}>{col}</option>)}
          </select>
        </div>

        {/* Y column for scatter */}
        {chartType === 'scatter' && (
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Y Axis</label>
            <select
              value={yCol}
              onChange={e => setYCol(e.target.value)}
              className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {numericCols.map(col => <option key={col}>{col}</option>)}
            </select>
          </div>
        )}

        {/* Bins slider for histogram */}
        {chartType === 'histogram' && (
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Bins: {bins}</label>
            <input
              type="range"
              min={5}
              max={50}
              value={bins}
              onChange={e => setBins(Number(e.target.value))}
              className="accent-blue-500 w-28"
            />
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 h-96">
        {renderChart()}
      </div>

      {/* Stats summary for selected column */}
      {xCol && statistics[xCol] && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: 'Mean', value: statistics[xCol].mean },
            { label: 'Median', value: statistics[xCol].median },
            { label: 'Std Dev', value: statistics[xCol].stdDev },
            { label: 'Min', value: statistics[xCol].min },
            { label: 'Max', value: statistics[xCol].max },
            { label: 'Nulls', value: statistics[xCol].nullCount },
          ].map(({ label, value }) => (
            value !== undefined ? (
              <div key={label} className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 text-center">
                <p className="text-slate-500 text-xs mb-1">{label}</p>
                <p className="text-white font-semibold text-sm">{typeof value === 'number' ? value.toLocaleString() : value}</p>
              </div>
            ) : null
          ))}
        </div>
      )}
    </div>
  );
}
