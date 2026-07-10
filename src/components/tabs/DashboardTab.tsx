import { memo, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  LayoutDashboard, Plus, Trash2, Edit3, Check, X,
  BarChart2, Hash, Table2, Lightbulb, Share2, Copy, Eye,
  Globe, ShieldOff, CheckCircle2, GripVertical,
  Download, FileJson, Camera, History, Filter,
  BookTemplate, Type, AlignLeft, Image as ImageIcon, Clock, Lock,
  Undo2, Redo2, MoreHorizontal, Loader2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts';
import jsPDF from 'jspdf';
import {
  logActivity, loadDashboards, createDashboard, saveDashboard, deleteDashboard,
  supabase,
} from '../../lib/supabase';
import { canCloudSync } from '../../lib/privacy';
import { usePrivacy } from '../../lib/PrivacyContext';
import type { ColumnStats } from '../../lib/types';
import { getAICache, setAICache, datasetFingerprint } from '../../lib/ai-cache';
import { hasAIConsent } from '../../lib/privacy';
import { buildDashboardSnapshot, dashboardHasTableWidget } from '../../lib/dashboard-snapshot';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  statistics: Record<string, ColumnStats>;
  datasetName: string;
  qualityScore: number;
}

type WidgetType = 'kpi' | 'bar_chart' | 'line_chart' | 'area_chart' | 'pie_chart' | 'table' | 'insight' | 'text' | 'markdown' | 'image';

interface DashFilter {
  column: string;
  type: 'category' | 'numeric_range' | 'date_range';
  values?: string[];
  min?: number;
  max?: number;
}

interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  column?: string;
  metric?: string;
  size: 'sm' | 'md' | 'lg';
  content?: string;
  filters?: DashFilter[];
  accentColor?: string;   // hex — applied to chart fill / KPI highlight
  theme?: 'default' | 'ocean' | 'sunset' | 'forest' | 'rose' | 'mono';
  // Explicit pixel dimensions from resize handles (overrides size-based grid)
  widthPx?: number;
  heightPx?: number;
}

interface DashboardSnapshot {
  widgets: Widget[];
  savedAt: string;
  label: string;
}

interface Dashboard {
  id: string;
  name: string;
  dataset_name: string;
  widgets: Widget[];
  filters?: DashFilter[];
  snapshots?: DashboardSnapshot[];
  comments?: { id: string; text: string; createdAt: string }[];
  updated_at: string;
}

interface ShareInfo {
  id: string;
  shareToken: string;
  isPublic: boolean;
  revoked: boolean;
  expiresAt?: string;
  sharePassword?: string;
}

const TOOLTIP_STYLE = { backgroundColor: '#13161F', border: '1px solid #2A2E3A', borderRadius: 8, color: '#E8E6DF', fontSize: 11 };
const AXIS_TICK = { fill: '#6B6D73', fontSize: 9 };
function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Dashboard Templates ───────────────────────────────────────────────────────
const TEMPLATES: Array<{ id: string; name: string; icon: string; widgets: Omit<Widget,'id'>[] }> = [
  { id: 'sales', name: 'Sales Overview', icon: '📈', widgets: [
    { type: 'kpi', title: 'Total Records', metric: 'count', size: 'sm' },
    { type: 'kpi', title: 'Avg Value', metric: 'mean', size: 'sm' },
    { type: 'kpi', title: 'Data Quality', metric: 'quality', size: 'sm' },
    { type: 'bar_chart', title: 'Category Distribution', size: 'lg' },
    { type: 'line_chart', title: 'Trend', size: 'lg' },
    { type: 'table', title: 'Preview', size: 'md' },
  ]},
  { id: 'hr', name: 'HR Dashboard', icon: '👥', widgets: [
    { type: 'kpi', title: 'Employee Count', metric: 'count', size: 'sm' },
    { type: 'kpi', title: 'Data Quality', metric: 'quality', size: 'sm' },
    { type: 'kpi', title: 'Missing Values', metric: 'nulls', size: 'sm' },
    { type: 'pie_chart', title: 'Breakdown by Category', size: 'md' },
    { type: 'bar_chart', title: 'Distribution', size: 'lg' },
    { type: 'insight', title: 'Key Insights', size: 'md' },
  ]},
  { id: 'finance', name: 'Finance Summary', icon: '💰', widgets: [
    { type: 'kpi', title: 'Total Records', metric: 'count', size: 'sm' },
    { type: 'kpi', title: 'Maximum', metric: 'max', size: 'sm' },
    { type: 'kpi', title: 'Average', metric: 'mean', size: 'sm' },
    { type: 'area_chart', title: 'Value Over Time', size: 'lg' },
    { type: 'bar_chart', title: 'Comparison', size: 'lg' },
    { type: 'table', title: 'Data Table', size: 'md' },
  ]},
  { id: 'marketing', name: 'Marketing Analytics', icon: '📣', widgets: [
    { type: 'kpi', title: 'Campaigns', metric: 'count', size: 'sm' },
    { type: 'kpi', title: 'Quality Score', metric: 'quality', size: 'sm' },
    { type: 'pie_chart', title: 'Channel Mix', size: 'md' },
    { type: 'bar_chart', title: 'Performance', size: 'lg' },
    { type: 'insight', title: 'Recommendations', size: 'md' },
  ]},
  { id: 'operations', name: 'Operations', icon: '⚙️', widgets: [
    { type: 'kpi', title: 'Records', metric: 'count', size: 'sm' },
    { type: 'kpi', title: 'Min', metric: 'min', size: 'sm' },
    { type: 'kpi', title: 'Max', metric: 'max', size: 'sm' },
    { type: 'line_chart', title: 'Trend Analysis', size: 'lg' },
    { type: 'table', title: 'Operations Data', size: 'lg' },
  ]},
];

// ── Widget theme palette ──────────────────────────────────────────────────────
const WIDGET_THEME_COLORS: Record<string, string[]> = {
  default: ['#5B8DEF','#F0A868','#34D399','#F87171','#A78BFA','#38BDF8'],
  ocean:   ['#38BDF8','#0EA5E9','#7DD3FC','#BAE6FD','#0284C7','#0369A1'],
  sunset:  ['#F0A868','#F97316','#FBBF24','#F59E0B','#EF4444','#DC2626'],
  forest:  ['#34D399','#22C55E','#16A34A','#4ADE80','#86EFAC','#BBF7D0'],
  rose:    ['#FB7185','#F43F5E','#FDA4AF','#FECDD3','#E11D48','#BE123C'],
  mono:    ['#9B9D9F','#6B6D73','#3A3F4F','#2A2E3A','#E8E6DF','#13161F'],
};

function getWidgetColor(widget: Widget, idx = 0): string {
  if (widget.accentColor && idx === 0) return widget.accentColor;
  const palette = WIDGET_THEME_COLORS[widget.theme ?? 'default'] ?? WIDGET_THEME_COLORS.default;
  return palette[idx % palette.length];
}

// ── Mini Chart Widgets ────────────────────────────────────────────────────────
// RENDER PERF FIX: every widget renderer below used to run its aggregation
// (often an O(rows) scan — `for (const row of rows)`) directly in the
// render body with no memoization, and none of these components were
// wrapped in React.memo. With N widgets on a dashboard, ANY state change
// anywhere in DashboardTab (dragging a different widget, opening the share
// dialog, renaming a widget, toggling a panel) re-rendered every widget and
// re-ran every widget's full O(rows) scan, all on the main thread — for a
// 1,000,000-row dataset with even a handful of chart widgets, this alone
// was enough to freeze the tab. Wrapping each widget in React.memo means a
// widget only re-renders when ITS OWN props (widget config, rows,
// statistics, qualityScore) actually change — not on unrelated dashboard UI
// state, matching the requirement that widgets only rerender on their own
// configuration or data changing, never on switching tabs or editing
// something else.
const KPIWidget = memo(function KPIWidget({ widget, columns, rows, statistics, qualityScore }: { widget: Widget; columns: string[]; rows: Record<string, unknown>[]; statistics: Record<string, ColumnStats>; qualityScore: number }) {
  const numCols = columns.filter(c => statistics[c]?.mean !== undefined);
  const col = widget.column ?? numCols[0] ?? columns[0];
  const s = statistics[col];
  const metrics: Record<string, { label: string; value: string | number }> = {
    count:   { label: 'Total Rows',     value: rows.length.toLocaleString() },
    mean:    { label: `Avg ${col}`,     value: s?.mean?.toFixed(2) ?? 'N/A' },
    max:     { label: `Max ${col}`,     value: s?.max !== undefined ? String(s.max) : 'N/A' },
    min:     { label: `Min ${col}`,     value: s?.min !== undefined ? String(s.min) : 'N/A' },
    quality: { label: 'Quality Score',  value: `${qualityScore}/100` },
    nulls:   { label: 'Missing Values', value: Object.values(statistics).reduce((acc, v) => acc + (v?.nullCount ?? 0), 0) },
  };
  const metric = metrics[widget.metric ?? 'count'];
  const accentHex = getWidgetColor(widget);
  return (
    <div className="flex flex-col gap-1 h-full justify-center">
      <p className="text-xs text-paper-dim">{metric.label}</p>
      <p className="text-2xl font-bold" style={{ color: accentHex }}>{metric.value}</p>
      <div className="h-0.5 w-8 rounded-full mt-1" style={{ backgroundColor: accentHex, opacity: 0.4 }} />
    </div>
  );
});

const BarWidget = memo(function BarWidget({ widget, rows }: { widget: Widget; rows: Record<string, unknown>[] }) {
  const col = widget.column ?? '';
  if (!col) return <p className="text-xs text-paper-dim text-center py-4">Select a column</p>;
  const freq: Record<string, number> = {};
  for (const row of rows) { const v = String(row[col] ?? ''); freq[v] = (freq[v] ?? 0) + 1; }
  const data = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />
        <XAxis dataKey="name" tick={AXIS_TICK} angle={-30} textAnchor="end" />
        <YAxis tick={AXIS_TICK} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="count" fill={getWidgetColor(widget)} radius={[3,3,0,0]}>
          {data.map((_, i) => <Cell key={i} fill={getWidgetColor(widget, i)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

const LineWidget = memo(function LineWidget({ widget, rows }: { widget: Widget; rows: Record<string, unknown>[] }) {
  const col = widget.column ?? '';
  if (!col) return <p className="text-xs text-paper-dim text-center py-4">Select a column</p>;
  const data = rows.slice(0, 100).map((r, i) => ({ i, value: Number(r[col]) })).filter(d => !isNaN(d.value));
  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />
        <XAxis dataKey="i" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line type="monotone" dataKey="value" stroke={getWidgetColor(widget)} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
});

const AreaWidget = memo(function AreaWidget({ widget, rows }: { widget: Widget; rows: Record<string, unknown>[] }) {
  const col = widget.column ?? '';
  if (!col) return <p className="text-xs text-paper-dim text-center py-4">Select a column</p>;
  const data = rows.slice(0, 100).map((r, i) => ({ i, value: Number(r[col]) })).filter(d => !isNaN(d.value));
  const color = getWidgetColor(widget);
  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />
        <XAxis dataKey="i" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Area type="monotone" dataKey="value" stroke={color} fill={`${color}20`} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
});

const PieWidget = memo(function PieWidget({ widget, rows }: { widget: Widget; rows: Record<string, unknown>[] }) {
  const col = widget.column ?? '';
  if (!col) return <p className="text-xs text-paper-dim text-center py-4">Select a column</p>;
  const freq: Record<string, number> = {};
  for (const row of rows) { const v = String(row[col] ?? ''); freq[v] = (freq[v] ?? 0) + 1; }
  const data = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
  return (
    <ResponsiveContainer width="100%" height={150}>
      <PieChart>
        <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={55} label={({ name }) => String(name ?? '').slice(0, 8)}>
          {data.map((_, i) => <Cell key={i} fill={getWidgetColor(widget, i)} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  );
});

const TableWidget = memo(function TableWidget({ columns, rows }: { widget?: Widget; columns: string[]; rows: Record<string, unknown>[] }) {
  const cols = columns.slice(0, 4);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr>{cols.map(c => <th key={c} className="text-left pb-1 pr-2 text-paper-dim font-medium truncate max-w-[80px]">{c}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 5).map((row, i) => (
            <tr key={i} className="border-t border-ink-border">
              {cols.map(c => <td key={c} className="py-1 pr-2 text-paper/90 truncate max-w-[80px]">{String(row[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

const InsightWidget = memo(function InsightWidget({ statistics, rows, qualityScore }: { statistics: Record<string, ColumnStats>; rows: Record<string, unknown>[]; qualityScore: number }) {
  const totalNulls = Object.values(statistics).reduce((s, v) => s + (v?.nullCount ?? 0), 0);
  const insights = [
    `${rows.length.toLocaleString()} rows in dataset`,
    totalNulls > 0 ? `${totalNulls} missing values detected` : '✓ No missing values',
    `Quality score: ${qualityScore}/100`,
  ];
  return (
    <ul className="space-y-1.5">
      {insights.map((ins, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-paper/90">
          <span className="w-4 h-4 rounded-full bg-accent/10 text-accent-bright flex items-center justify-center flex-shrink-0 text-[10px] font-bold">{i+1}</span>
          {ins}
        </li>
      ))}
    </ul>
  );
});

const TextWidget = memo(function TextWidget({ widget }: { widget: Widget }) {
  return <p className="text-sm text-paper/90 whitespace-pre-wrap">{widget.content ?? 'Add your text here.'}</p>;
});

const MarkdownWidget = memo(function MarkdownWidget({ widget }: { widget: Widget }) {
  const html = (widget.content ?? '')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-paper mt-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-paper mt-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-paper mt-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-paper">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
  return <div className="text-xs text-paper/90 prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
});

const ImageWidget = memo(function ImageWidget({ widget }: { widget: Widget }) {
  if (!widget.content) return <p className="text-xs text-paper-dim text-center">No image URL set. Edit to add one.</p>;
  return <img src={widget.content} alt={widget.title} className="w-full h-full object-contain rounded-lg max-h-48" />;
});

// ── Sortable Widget Card ──────────────────────────────────────────────────────
// RENDER PERF FIX: wrapped in React.memo so a widget card (and its
// drag-handle DOM) only re-renders when its own props change — the
// callbacks it receives (onRemove/onEdit/onDuplicate/onResize) are already
// stabilized with useCallback/useMemo by the parent's widget-list building
// logic (see the widgets.map(...) call site below, which now passes the
// same function references each render), so this bails out correctly
// instead of re-rendering every widget whenever any one widget's drag
// state, title edit, or an unrelated dashboard dialog changes.
const SortableWidget = memo(function SortableWidget({
  widget, columns, rows, statistics, qualityScore,
  onRemove, onEdit, onDuplicate, onResize, crossFilterCounts,
}: {
  widget: Widget;
  columns: string[];
  rows: Record<string, unknown>[];
  statistics: Record<string, ColumnStats>;
  qualityScore: number;
  onRemove: (id: string) => void;
  onEdit: (w: Widget) => void;
  onDuplicate?: (id: string) => void;
  onResize?: (id: string, w: number, h: number) => void;
  crossFilterCounts?: Record<string, number>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(widget.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sizeClass = widget.size === 'sm' ? 'col-span-1' : widget.size === 'lg' ? 'col-span-2 sm:col-span-3' : 'col-span-1 sm:col-span-2';

  function startRename() {
    setTitleDraft(widget.title);
    setEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.select());
  }

  function commitRename() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== widget.title) {
      onEdit({ ...widget, title: trimmed });
    }
    setEditingTitle(false);
  }

  const props = { widget, columns, rows, statistics, qualityScore };
  function renderContent() {
    switch (widget.type) {
      case 'kpi':        return <KPIWidget {...props} />;
      case 'bar_chart':  return <BarWidget {...props} />;
      case 'line_chart': return <LineWidget {...props} />;
      case 'area_chart': return <AreaWidget {...props} />;
      case 'pie_chart':  return <PieWidget {...props} />;
      case 'table':      return <TableWidget {...props} />;
      case 'insight':    return <InsightWidget statistics={statistics} rows={rows} qualityScore={qualityScore} />;
      case 'text':       return <TextWidget widget={widget} />;
      case 'markdown':   return <MarkdownWidget widget={widget} />;
      case 'image':      return <ImageWidget widget={widget} />;
      default:           return null;
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        ...(widget.widthPx ? { width: widget.widthPx, minWidth: widget.widthPx } : {}),
        ...(widget.heightPx ? { height: widget.heightPx, minHeight: widget.heightPx } : {}),
      }}
      className={`${sizeClass} relative`}
    >
      <div className="bg-ink-surface border border-ink-border rounded-2xl p-4 h-full flex flex-col gap-3 group hover:border-ink-borderStrong transition-all relative shadow-sm hover:shadow-md">
        <div className="flex items-center justify-between min-h-[24px]">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-paper-dimmer hover:text-paper-dim touch-none flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </button>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingTitle(false); }}
                className="flex-1 bg-ink-raised border border-accent rounded px-2 py-0.5 text-sm text-paper focus:outline-none min-w-0"
                autoFocus
              />
            ) : (
              <p
                className="text-sm font-medium text-paper truncate cursor-pointer hover:text-paper transition"
                onDoubleClick={startRename}
                title="Double-click to rename"
              >
                {widget.title}
              </p>
            )}
            {crossFilterCounts && widget.column && crossFilterCounts[widget.column] !== undefined && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent-bright flex-shrink-0">{crossFilterCounts[widget.column]}</span>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={startRename} className="p-1 rounded hover:bg-ink-raised text-paper-dimmer hover:text-paper-dim transition" title="Rename widget">
              <Edit3 className="w-3 h-3" />
            </button>
            {onDuplicate && (
              <button onClick={() => onDuplicate(widget.id)} className="p-1 rounded hover:bg-ink-raised text-paper-dimmer hover:text-paper-dim transition" title="Duplicate widget">
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => onEdit(widget)} className="p-1 rounded hover:bg-ink-raised text-paper-dimmer hover:text-paper-dim transition" title="Edit widget">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onRemove(widget.id)} className="p-1 rounded hover:bg-ink-raised hover:bg-ink-borderStrong text-paper-dim hover:text-red-400 transition" title="Remove widget">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {renderContent()}
          {/* Resize handle — visible on hover */}
          {onResize && (
            <div
              className="absolute bottom-0.5 right-0.5 w-5 h-5 cursor-se-resize opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity z-10 flex items-end justify-end pb-0.5 pr-0.5"
              onMouseDown={e => {
                e.preventDefault();
                e.stopPropagation();
                const card = (e.currentTarget.closest('.bg-ink-surface') as HTMLElement | null)?.parentElement as HTMLElement | null;
                const startX = e.clientX;
                const startY = e.clientY;
                const startW = widget.widthPx ?? card?.offsetWidth ?? 300;
                const startH = widget.heightPx ?? card?.offsetHeight ?? 200;
                const onMove = (ev: MouseEvent) => {
                  onResize!(widget.id, startW + ev.clientX - startX, startH + ev.clientY - startY);
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <circle cx="6" cy="2" r="1" fill="#6B6D73"/>
                <circle cx="6" cy="6" r="1" fill="#6B6D73"/>
                <circle cx="2" cy="6" r="1" fill="#6B6D73"/>
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Widget type catalogue ─────────────────────────────────────────────────────
const WIDGET_TYPES: { id: WidgetType; label: string; icon: React.ElementType; needsColumn: boolean }[] = [
  { id: 'kpi',        label: 'KPI Card',    icon: Hash,           needsColumn: true },
  { id: 'bar_chart',  label: 'Bar Chart',   icon: BarChart2,      needsColumn: true },
  { id: 'line_chart', label: 'Line Chart',  icon: BarChart2,      needsColumn: true },
  { id: 'area_chart', label: 'Area Chart',  icon: BarChart2,      needsColumn: true },
  { id: 'pie_chart',  label: 'Pie Chart',   icon: BarChart2,      needsColumn: true },
  { id: 'table',      label: 'Table',       icon: Table2,         needsColumn: false },
  { id: 'insight',    label: 'Insights',    icon: Lightbulb,      needsColumn: false },
  { id: 'text',       label: 'Text Block',  icon: Type,           needsColumn: false },
  { id: 'markdown',   label: 'Markdown',    icon: AlignLeft,      needsColumn: false },
  { id: 'image',      label: 'Image',       icon: ImageIcon,      needsColumn: false },
];

const KPI_METRICS = ['count', 'mean', 'max', 'min', 'quality', 'nulls'];

// ── Main DashboardTab ─────────────────────────────────────────────────────────
export default function DashboardTab({ columns, rows, statistics, datasetName, qualityScore }: Props) {
  const { settings } = usePrivacy();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [active, setActive] = useState<Dashboard | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [newWidget, setNewWidget] = useState<Partial<Widget>>({ type: 'kpi', title: '', size: 'md' });
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<ShareInfo | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareBlocked, setShareBlocked] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [creatingDashboard, setCreatingDashboard] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [shareExpiry, setShareExpiry] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [includeDatasetPreview, setIncludeDatasetPreview] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreMenuOpen]);

  // Undo / redo stacks (widget arrays only — lightweight)
  const undoStack = useRef<Widget[][]>([]);
  const redoStack = useRef<Widget[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Dashboard Narration AI
  const [narration, setNarration] = useState<{ text: string; generatedAt: string } | null>(null);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [narrationError, setNarrationError] = useState('');
  const [showNarration, setShowNarration] = useState(false);

  // Widget resize is handled inline inside SortableWidget via onResize prop

  // Autosave indicator
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Push current widget state onto the undo stack before making changes.
   * RENDER PERF FIX: converted to useCallback. This function only closes
   * over `undoStack`/`redoStack` (refs — `.current` is read fresh on each
   * call, so a stable function reference never sees stale data) and
   * `setCanUndo`/`setCanRedo` (useState setters, always stable across
   * renders). It has no other dependencies, so `[]` is correct and safe —
   * verified by reading every identifier it references above. */
  const pushUndo = useCallback((widgets: Widget[]) => {
    undoStack.current = [...undoStack.current.slice(-19), [...widgets]];
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  function undoWidgets() {
    if (!active || undoStack.current.length === 0) return;
    redoStack.current = [[...active.widgets], ...redoStack.current.slice(0, 19)];
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    applyWidgets(prev);
  }

  function redoWidgets() {
    if (!active || redoStack.current.length === 0) return;
    undoStack.current = [...undoStack.current.slice(-19), [...active.widgets]];
    const next = redoStack.current[0];
    redoStack.current = redoStack.current.slice(1);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    applyWidgets(next);
  }

  function applyWidgets(widgets: Widget[]) {
    if (!active) return;
    const updated = { ...active, widgets };
    setActive(updated);
    setDashboards(prev => prev.map(d => d.id === active.id ? updated : d));
    triggerAutosave(updated);
  }

  function triggerAutosave(dashboard: Dashboard) {
    setSaveState('unsaved');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        if (!dashboard.id.startsWith('local-')) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('dashboards')
              .update({ widgets: dashboard.widgets, name: dashboard.name })
              .eq('id', dashboard.id);
          }
        }
        setSaveState('saved');
      } catch {
        setSaveState('unsaved');
      }
    }, 1500);
  }

  // Cross-filter state: col → Set of active values
  const [crossFilters, setCrossFilters] = useState<Record<string, Set<string>>>({});

  // Filtered rows derived from cross-filters
  const filteredRows = useMemo(() => {
    let r = rows;
    for (const [col, vals] of Object.entries(crossFilters)) {
      if (vals.size === 0) continue;
      r = r.filter(row => vals.has(String(row[col] ?? '')));
    }
    // Also apply dashboard-level filters
    if (active?.filters) {
      for (const f of active.filters) {
        if (f.type === 'category' && f.values && f.values.length > 0) {
          r = r.filter(row => (f.values ?? []).includes(String(row[f.column] ?? '')));
        } else if (f.type === 'numeric_range') {
          r = r.filter(row => {
            const v = Number(row[f.column]);
            if (isNaN(v)) return true;
            return (f.min === undefined || v >= f.min) && (f.max === undefined || v <= f.max);
          });
        }
      }
    }
    return r;
  }, [rows, crossFilters, active?.filters]);

  const numericCols = columns.filter(c => statistics[c]?.mean !== undefined);
  const textCols = columns.filter(c => statistics[c]?.mean === undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => { loadAllDashboards(); }, [datasetName]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAllDashboards() {
    setLoading(true);
    try {
      const data = await loadDashboards(datasetName);
      const dbs = data as unknown as Dashboard[];
      setDashboards(dbs);
      if (dbs.length > 0 && !active) setActive(dbs[0]);
    } catch { /* Non-critical */ } finally { setLoading(false); }
  }

  /** RENDER PERF FIX: converted to useCallback, dependency [datasetName].
   * This closes over `datasetName` (the only non-stable identifier it
   * reads — everything else is a useState setter, which React guarantees
   * is stable across renders, or a module-level import) and calls it via
   * the `saveDashboard`/`logActivity` module functions, which are stable
   * imports, not component state. `datasetName` is the correct and only
   * dependency: if the active dataset changes, this function must close
   * over the new value, not a stale one. */
  const handleSaveDashboard = useCallback(async (db: Dashboard) => {
    await saveDashboard(datasetName, db);
    setDashboards(prev => prev.map(d => d.id === db.id ? db : d));
    setActive(db);
    setSaveState('saved');
    logActivity(datasetName, 'dashboard_save', `Saved: ${db.name}`);
  }, [datasetName]);

  async function handleCreateDashboard(): Promise<Dashboard | null> {
    if (creatingDashboard) return null;
    setCreatingDashboard(true);
    try {
      const name = `Dashboard ${dashboards.length + 1}`;
      const db = await createDashboard(datasetName, name);
      if (db) {
        const typed = db as unknown as Dashboard;
        setDashboards(prev => [typed, ...prev]);
        setActive(typed);
        return typed;
      }
      return null;
    } finally {
      setCreatingDashboard(false);
    }
  }

  async function applyTemplate(tpl: typeof TEMPLATES[0]) {
    // If there's no active dashboard yet, create one via the exact same
    // path as the "Blank Dashboard" button (handleCreateDashboard) instead
    // of duplicating its creation logic — this is the root-cause fix for
    // Issue 3: applyTemplate used to just no-op (`if (!active) return`) when
    // there was nothing to apply the template to, forcing the user to
    // create a blank dashboard first and click the template a second time.
    // We use handleCreateDashboard's return value directly rather than
    // reading `active` afterward, since setActive's state update is not
    // synchronous and wouldn't be visible yet in this same function call.
    // The creatingDashboard guard inside handleCreateDashboard also prevents
    // a rapid double-click from creating two dashboards.
    if (creatingDashboard) return;
    const target = active ?? await handleCreateDashboard();
    if (!target) return;
    const widgets: Widget[] = tpl.widgets.map(w => ({
      ...w, id: uid(),
      column: w.type === 'kpi' ? (numericCols[0] ?? columns[0]) : (w.type === 'pie_chart' ? (textCols[0] ?? columns[0]) : (numericCols[0] ?? columns[0])),
    }));
    const updated = { ...target, widgets, name: tpl.name };
    handleSaveDashboard(updated);
    setShowTemplates(false);
  }

  function duplicateDashboard(db: Dashboard) {
    const copy: Dashboard = {
      ...db,
      id: `local-${Date.now()}-copy`,
      name: `${db.name} (copy)`,
      widgets: db.widgets.map(w => ({ ...w, id: uid() })),
      updated_at: new Date().toISOString(),
    };
    setDashboards(prev => [copy, ...prev]);
    setActive(copy);
    saveDashboard(datasetName, copy);
  }

  function takeSnapshot() {
    if (!active) return;
    const snap: DashboardSnapshot = {
      widgets: [...active.widgets],
      savedAt: new Date().toISOString(),
      label: `Snapshot ${(active.snapshots?.length ?? 0) + 1}`,
    };
    const updated = { ...active, snapshots: [snap, ...(active.snapshots ?? [])].slice(0, 10) };
    handleSaveDashboard(updated);
  }

  function restoreSnapshot(snap: DashboardSnapshot) {
    if (!active) return;
    handleSaveDashboard({ ...active, widgets: snap.widgets });
    setShowHistory(false);
  }

  function addComment() {
    if (!active || !newComment.trim()) return;
    const comment = { id: uid(), text: newComment.trim(), createdAt: new Date().toISOString() };
    const updated = { ...active, comments: [comment, ...(active.comments ?? [])] };
    handleSaveDashboard(updated);
    setNewComment('');
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id || !active) return;
    const oldIndex = active.widgets.findIndex(w => w.id === dragged.id);
    const newIndex = active.widgets.findIndex(w => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const updated = { ...active, widgets: arrayMove(active.widgets, oldIndex, newIndex) };
    handleSaveDashboard(updated);
  }

  function addWidget() {
    if (!active) return;
    pushUndo(active.widgets);
    const widget: Widget = {
      id: uid(),
      type: newWidget.type ?? 'kpi',
      title: newWidget.title || (WIDGET_TYPES.find(w => w.id === newWidget.type)?.label ?? 'Widget'),
      column: newWidget.column ?? columns[0],
      metric: newWidget.metric ?? 'count',
      size: newWidget.size ?? 'md',
      content: newWidget.content ?? '',
    };
    const updated = { ...active, widgets: [...active.widgets, widget] };
    handleSaveDashboard(updated);
    setAdding(false);
    setNewWidget({ type: 'kpi', title: '', size: 'md' });
  }

  function saveEditedWidget() {
    if (!editingWidget || !active) return;
    pushUndo(active.widgets);
    const updated = { ...active, widgets: active.widgets.map(w => w.id === editingWidget.id ? editingWidget : w) };
    handleSaveDashboard(updated);
    setEditingWidget(null);
  }

  /** RENDER PERF FIX: converted to useCallback, dependency [active,
   * pushUndo, handleSaveDashboard]. `active` is read directly (not via a
   * ref), so it must be a real dependency — omitting it would let this
   * function close over a stale `active` and remove a widget from the
   * wrong (previous) dashboard snapshot. `pushUndo`/`handleSaveDashboard`
   * are themselves now stable useCallbacks (see above), so this function's
   * identity only changes when the active dashboard actually changes —
   * exactly the cases where `SortableWidget`/`onRemove` SHOULD get a new
   * callback, and no others. */
  const removeWidget = useCallback((wid: string) => {
    if (!active) return;
    pushUndo(active.widgets);
    handleSaveDashboard({ ...active, widgets: active.widgets.filter(w => w.id !== wid) });
  }, [active, pushUndo, handleSaveDashboard]);

  /** RENDER PERF FIX: converted to useCallback, dependency [active,
   * pushUndo, handleSaveDashboard] — same reasoning as removeWidget above. */
  const duplicateWidget = useCallback((wid: string) => {
    if (!active) return;
    const src = active.widgets.find(w => w.id === wid);
    if (!src) return;
    pushUndo(active.widgets);
    const copy: Widget = { ...src, id: uid(), title: `${src.title} (Copy)` };
    const idx = active.widgets.findIndex(w => w.id === wid);
    const widgets = [...active.widgets.slice(0, idx + 1), copy, ...active.widgets.slice(idx + 1)];
    handleSaveDashboard({ ...active, widgets });
  }, [active, pushUndo, handleSaveDashboard]);

  function renameDashboard(id: string) {
    if (!nameInput.trim()) { setEditingName(null); return; }
    const db = dashboards.find(d => d.id === id);
    if (!db) return;
    handleSaveDashboard({ ...db, name: nameInput.trim() });
    setEditingName(null);
  }

  // ── Dashboard Narration AI ────────────────────────────────────────────────
  async function generateNarration(force = false) {
    if (!active) return;
    if (!settings) return;

    // Check AI consent and local-only mode
    const consent = await hasAIConsent();
    if (!consent) {
      setNarrationError('AI consent required. Enable AI in Privacy Settings.');
      return;
    }
    if (settings.localOnlyMode) {
      setNarrationError('Local Only Mode is enabled. Disable it to use AI narration.');
      return;
    }

    const fp = datasetFingerprint(rows.length, Object.keys(statistics).map(n => ({ name: n, type: 'mixed' })), qualityScore);

    // Load from cache unless forcing regeneration
    if (!force) {
      const cached = await getAICache<{ text: string; generatedAt: string }>('narration', datasetName, fp);
      if (cached?.result) {
        setNarration(cached.result);
        setShowNarration(true);
        return;
      }
    }

    setNarrationLoading(true);
    setNarrationError('');

    try {
      const sb = supabase; // already statically imported at top of file
      const widgetSummary = active.widgets.map(w => `${w.title} (${w.type})`).join(', ');
      const statSummary = Object.entries(statistics)
        .slice(0, 8)
        .map(([col, s]) => `${col}: mean=${s.mean?.toFixed(2) ?? 'N/A'}, nulls=${s.nullCount ?? 0}`)
        .join('; ');

      const prompt = `You are a data analyst. Generate a concise executive dashboard narrative (3-5 sentences) for the dashboard "${active.name}" containing: ${widgetSummary}. Dataset has ${rows.length} rows, quality score ${qualityScore}/100. Key stats: ${statSummary}. Be specific, professional, and insight-focused.`;

      const res = await sb.functions.invoke('gemini-proxy', {
        body: { prompt, maxTokens: 300 },
      });

      if (res.error || !res.data?.text) {
        throw new Error(res.error?.message ?? 'Failed to generate narration.');
      }

      const result = { text: res.data.text as string, generatedAt: new Date().toISOString() };
      await setAICache('narration', datasetName, fp, result);
      setNarration(result);
      setShowNarration(true);
    } catch (err) {
      setNarrationError(err instanceof Error ? err.message : 'Narration generation failed.');
    } finally {
      setNarrationLoading(false);
    }
  }

  // ── Widget Resize Handler ─────────────────────────────────────────────────
  /** RENDER PERF FIX: converted to useCallback, dependency [active,
   * datasetName]. Reads `active` directly (must be a real dependency, same
   * reasoning as removeWidget/duplicateWidget above) and `datasetName`
   * (prop). Intentionally calls `saveDashboard` directly rather than going
   * through `handleSaveDashboard`/`pushUndo` — this matches the ORIGINAL
   * behavior exactly: resizing was never undoable and used its own
   * fire-and-forget save (`.catch(() => {})`) rather than the awaited
   * `handleSaveDashboard` path used by other mutations. Converting to
   * useCallback did not change this control flow, only its identity
   * stability. */
  const updateWidgetSize = useCallback((widgetId: string, widthPx: number, heightPx: number) => {
    if (!active) return;
    const MIN_W = 200, MAX_W = 1200, MIN_H = 120, MAX_H = 600;
    const clampedW = Math.max(MIN_W, Math.min(MAX_W, widthPx));
    const clampedH = Math.max(MIN_H, Math.min(MAX_H, heightPx));
    const updated: Widget[] = active.widgets.map(w =>
      w.id === widgetId ? { ...w, widthPx: clampedW, heightPx: clampedH } : w
    );
    const next = { ...active, widgets: updated };
    setActive(next);
    setDashboards(prev => prev.map(d => d.id === next.id ? next : d));
    saveDashboard(datasetName, { id: next.id, name: next.name, widgets: updated }).catch(() => {});
  }, [active, datasetName]);

  // ── Export dashboard as PDF ───────────────────────────────────────────────
  const dashRef = useRef<HTMLDivElement>(null);
  async function exportPDF() {
    if (!active) return;
    setExporting(true);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 210, 'F');
    doc.text(active.name, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`${datasetName} · ${rows.length.toLocaleString()} rows · Quality: ${qualityScore}/100`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);
    // KPI summary
    let y = 50;
    for (const w of active.widgets.filter(x => x.type === 'kpi').slice(0, 6)) {
      doc.setTextColor(255,255,255); doc.setFontSize(12);
      doc.text(w.title, 14, y);
      doc.setFontSize(10); doc.setTextColor(148, 163, 184);
      doc.text(`Column: ${w.column ?? '-'}  Metric: ${w.metric ?? '-'}`, 14, y + 7);
      y += 20;
    }
    doc.save(`${active.name.replace(/\s+/g,'_')}.pdf`);
    setExporting(false);
  }

  function exportJSON() {
    if (!active) return;
    const blob = new Blob([JSON.stringify(active, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${active.name.replace(/\s+/g,'_')}.json`;
    a.click();
  }

  // ── Sharing ───────────────────────────────────────────────────────────────
  // Mirrors the DB column default (`encode(gen_random_bytes(16), 'hex')`) so a
  // reactivated share always gets a fresh, unguessable token — a revoked link
  // must never be able to start working again just by flipping a flag.
  function generateShareToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function openShareModal() {
    if (!active) return;
    setShareOpen(true); setShareError('');
    if (!(await canCloudSync(datasetName, datasetName))) { setShareBlocked(true); setSharing(null); return; }
    setShareBlocked(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('shared_dashboards')
      .select('id, share_token, is_public, revoked')
      .eq('dashboard_id', active.id).eq('user_id', user.id).maybeSingle();
    if (data) setSharing({ id: data.id, shareToken: data.share_token, isPublic: data.is_public, revoked: data.revoked });
    else setSharing(null);
  }

  async function createShareLink() {
    if (!active) return;
    if (!(await canCloudSync(datasetName, datasetName))) { setShareBlocked(true); return; }
    setShareError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setShareError('You must be signed in to share.'); return; }
    let dashboardId = active.id;
    if (active.id.startsWith('local-')) {
      const { data: migrated, error } = await supabase.from('dashboards').insert({
        user_id: user.id, name: active.name, dataset_name: datasetName, widgets: active.widgets,
      }).select().single();
      if (error || !migrated) { setShareError('Could not sync dashboard to cloud.'); return; }
      dashboardId = migrated.id;
      const updated = { ...active, id: dashboardId };
      setActive(updated); setDashboards(prev => prev.map(d => d.id === active.id ? updated : d));
    }
    const shareData: Record<string, unknown> = { dashboard_id: dashboardId, user_id: user.id, is_public: true };
    shareData.expires_at = shareExpiry ? new Date(shareExpiry).toISOString() : null;
    if (sharePassword) {
      // Hash the password before storing — plaintext is never persisted
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(sharePassword.trim()));
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      shareData.share_password_hash = hashHex;
    } else {
      shareData.share_password_hash = null;
    }

    // Root cause of "Revoke -> Create Share Link -> still shows revoked":
    // `sharing` state (loaded by openShareModal from the existing
    // dashboard_id+user_id row) stays populated even after revoke, and the
    // old code path only ever INSERTed a brand new shared_dashboards row —
    // it never checked whether a (revoked) row already existed for this
    // dashboard. With no unique constraint, a second insert either silently
    // created a duplicate (making the dashboard_id+user_id lookup in
    // openShareModal ambiguous) or, if a unique constraint existed, would
    // have failed outright. Either way the UI had no path back to a working
    // link. The correct fix — matching "never permanently lock dashboard
    // sharing" — is to REACTIVATE the existing row: flip revoked back to
    // false and mint a brand new share_token (a previously revoked link must
    // not silently start working again), rather than trying to insert a
    // second row for the same dashboard.
    let data: { id: string; share_token: string; is_public: boolean; revoked: boolean } | null = null;
    let error: { message: string } | null = null;

    if (sharing?.id) {
      const newToken = generateShareToken();
      const result = await supabase.from('shared_dashboards')
        .update({ ...shareData, revoked: false, share_token: newToken })
        .eq('id', sharing.id)
        .select('id,share_token,is_public,revoked')
        .single();
      data = result.data; error = result.error;
    } else {
      const result = await supabase.from('shared_dashboards')
        .insert(shareData)
        .select('id,share_token,is_public,revoked')
        .single();
      data = result.data; error = result.error;
    }

    if (error || !data) { setShareError('Could not create share link.'); return; }
    setSharing({ id: data.id, shareToken: data.share_token, isPublic: data.is_public, revoked: data.revoked, expiresAt: shareExpiry || undefined, sharePassword: sharePassword || undefined });
    await saveDashboardSnapshot(data.id, dashboardId, user.id);
    logActivity(datasetName, 'dashboard_share', `Shared: ${active.name}`);
  }

  // Aggregates only what each widget needs (never the full dataset) and
  // uploads it so the shared view can render real charts. A row-level table
  // preview is included only when the user explicitly opted in.
  async function saveDashboardSnapshot(sharedDashboardId: string, dashboardId: string, userId: string) {
    if (!active) return;
    setSnapshotSaving(true);
    setShareError('');
    try {
      // statistics/qualityScore are embedded directly (see dashboard-snapshot.ts
      // and the 20260706120000 migration) instead of the shared view depending
      // on a separate analysis_sessions row that may not exist — that mismatch
      // was the root cause of shared dashboards showing "N/A" KPI values.
      const snapshot = buildDashboardSnapshot(active.widgets, columns, rows, includeDatasetPreview, statistics, qualityScore);
      const { error } = await supabase.from('dashboard_snapshots').upsert({
        shared_dashboard_id: sharedDashboardId,
        dashboard_id: dashboardId,
        user_id: userId,
        row_count: snapshot.rowCount,
        category_data: snapshot.categoryData,
        series_data: snapshot.seriesData,
        preview_included: includeDatasetPreview && dashboardHasTableWidget(active.widgets),
        preview_rows: snapshot.previewRows,
        preview_columns: snapshot.previewColumns,
        statistics: snapshot.statistics,
        quality_score: snapshot.qualityScore,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shared_dashboard_id' });
      // Root cause of "share succeeds but the link shows Records = 0 / empty
      // charts / no preview": this upload previously ignored its own error.
      // The shared_dashboards row (the link itself) can be created successfully
      // while the snapshot upload that actually feeds every widget fails
      // silently — RLS hiccup, transient network error, oversized payload,
      // whatever — and the owner had zero indication anything was wrong.
      if (error) {
        setShareError(`Share link created, but the dashboard data failed to upload (${error.message}). Try "Refresh shared data" below.`);
      }
    } catch (err) {
      setShareError(`Share link created, but the dashboard data failed to upload (${err instanceof Error ? err.message : 'unknown error'}). Try "Refresh shared data" below.`);
    } finally {
      setSnapshotSaving(false);
    }
  }

  // Recomputes and re-uploads the snapshot for an already-shared dashboard —
  // used when widgets change or the preview opt-in is toggled after sharing.
  async function refreshShareSnapshot() {
    if (!active || !sharing || sharing.revoked) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await saveDashboardSnapshot(sharing.id, active.id, user.id);
  }

  async function revokeShare() {
    if (!sharing) return;
    await supabase.from('shared_dashboards').update({ revoked: true }).eq('id', sharing.id);
    setSharing({ ...sharing, revoked: true });
  }

  function copyShareLink() {
    if (!sharing) return;
    navigator.clipboard.writeText(`${window.location.origin}/shared/${sharing.shareToken}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  // Global filter management
  function addGlobalFilter(col: string) {
    if (!active) return;
    const isNumeric = statistics[col]?.mean !== undefined;
    const f: DashFilter = isNumeric
      ? { column: col, type: 'numeric_range', min: Number(statistics[col]?.min ?? 0), max: Number(statistics[col]?.max ?? 100) }
      : { column: col, type: 'category', values: [] };
    handleSaveDashboard({ ...active, filters: [...(active.filters ?? []), f] });
  }

  function removeGlobalFilter(col: string) {
    if (!active) return;
    handleSaveDashboard({ ...active, filters: (active.filters ?? []).filter(f => f.column !== col) });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-paper">Dashboard Builder</h2>
          <p className="text-sm text-paper-dim mt-0.5">
            {filteredRows.length.toLocaleString()} rows
            {filteredRows.length !== rows.length && ` (filtered from ${rows.length.toLocaleString()})`}
            {Object.keys(crossFilters).length > 0 && ' · cross-filter active'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowTemplates(t => !t)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition">
            <BookTemplate className="w-4 h-4" /> Templates
          </button>
          <button onClick={handleCreateDashboard} disabled={creatingDashboard}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-bright text-ink text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-4 h-4" /> New Dashboard
          </button>
        </div>
      </div>

      {/* Templates panel */}
      {showTemplates && (
        <div className="bg-ink-surface border border-ink-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-paper mb-3">Dashboard Templates</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {TEMPLATES.map(tpl => (
              <button key={tpl.id} onClick={() => applyTemplate(tpl)} disabled={creatingDashboard}
                className="flex flex-col items-center gap-2 p-3 bg-ink-raised hover:bg-ink-raised hover:bg-ink-borderStrong border border-ink-borderStrong hover:border-accent/50 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed">
                <span className="text-2xl">{tpl.icon}</span>
                <span className="text-xs font-medium text-paper text-center">{tpl.name}</span>
                <span className="text-xs text-paper-dim">{tpl.widgets.length} widgets</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dashboard list */}
      {dashboards.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {dashboards.map(db => (
            <div key={db.id} className="flex items-center gap-1">
              {editingName === db.id ? (
                <div className="flex items-center gap-1">
                  <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameDashboard(db.id); if (e.key === 'Escape') setEditingName(null); }}
                    className="px-2 py-1 rounded bg-ink-raised border border-accent text-paper text-sm w-32 focus:outline-none" />
                  <button onClick={() => renameDashboard(db.id)} className="p-1 text-accent-bright hover:text-accent-bright"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingName(null)} className="p-1 text-paper-dim hover:text-paper/90"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <button
                  onClick={() => setActive(db)}
                  onDoubleClick={() => { setEditingName(db.id); setNameInput(db.name); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${active?.id === db.id ? 'bg-accent text-ink' : 'bg-ink-raised text-paper-dim hover:text-paper hover:bg-ink-borderStrong'}`}
                >
                  {db.name}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No dashboards empty state */}
      {dashboards.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <LayoutDashboard className="w-12 h-12 text-paper-dimmer" />
          <div>
            <h3 className="text-paper/90 font-semibold text-lg">No dashboards yet</h3>
            <p className="text-paper-dim text-sm mt-1">Start from a template or create a blank dashboard.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowTemplates(true)} className="px-4 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper text-sm transition">
              Use Template
            </button>
            <button onClick={handleCreateDashboard} disabled={creatingDashboard} className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-bright text-ink text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed">
              Blank Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Active dashboard */}
      {active && (
        <div className="space-y-4">
          {/* Toolbar — primary actions stay visible; secondary actions live
              in the overflow menu, so the bar reads as ~5 decisions instead
              of 11 equally-weighted buttons. */}
          <div className="flex items-center gap-1.5 flex-wrap p-1.5 bg-ink-surface border border-ink-border rounded-xl">
            <button onClick={() => setAdding(a => !a)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${adding ? 'bg-accent text-ink' : 'text-paper-dim hover:text-paper hover:bg-ink-raised'}`}>
              <Plus className="w-3.5 h-3.5" /> Add Widget
            </button>
            <button onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${showFilters ? 'bg-accent/15 text-accent-bright border border-accent/30' : 'text-paper-dim hover:text-paper hover:bg-ink-raised'}`}>
              <Filter className="w-3.5 h-3.5" /> Filters {active.filters?.length ? `(${active.filters.length})` : ''}
            </button>
            <button
              onClick={() => { setShowNarration(s => !s); if (!narration && !showNarration) generateNarration(false); }}
              disabled={narrationLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${showNarration ? 'bg-purple-600/90 text-paper' : 'text-purple-400 hover:bg-purple-500/10 hover:text-purple-300'} disabled:opacity-50`}
              title="AI Dashboard Summary"
            >
              {narrationLoading
                ? <><span className="w-3.5 h-3.5 border border-paper-dim border-t-transparent rounded-full animate-spin" /> Generating…</>
                : <><span className="text-sm leading-none">✨</span> Narrate</>
              }
            </button>

            <div className="h-5 w-px bg-ink-border mx-0.5" />

            {/* Undo / Redo */}
            <button onClick={undoWidgets} disabled={!canUndo}
              className="p-2 rounded-lg text-paper-dimmer hover:text-paper hover:bg-ink-raised disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Undo">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={redoWidgets} disabled={!canRedo}
              className="p-2 rounded-lg text-paper-dimmer hover:text-paper hover:bg-ink-raised disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Redo">
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            {/* Overflow menu — Snapshot, History, Notes, Duplicate, Export */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setMoreMenuOpen(v => !v)}
                className={`p-2 rounded-lg transition ${moreMenuOpen ? 'bg-ink-raised text-paper' : 'text-paper-dimmer hover:text-paper hover:bg-ink-raised'}`}
                title="More actions" aria-haspopup="true" aria-expanded={moreMenuOpen}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {moreMenuOpen && (
                <div className="absolute left-0 top-full mt-2 w-56 bg-ink-surface border border-ink-border rounded-xl shadow-2xl z-50 overflow-hidden py-1" role="menu">
                  <button onClick={() => { takeSnapshot(); setMoreMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition text-left">
                    <Camera className="w-3.5 h-3.5 text-paper-dim" /> Take snapshot
                  </button>
                  {(active.snapshots?.length ?? 0) > 0 && (
                    <button onClick={() => { setShowHistory(h => !h); setMoreMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition text-left">
                      <History className="w-3.5 h-3.5 text-paper-dim" /> History ({active.snapshots?.length})
                    </button>
                  )}
                  <button onClick={() => { setShowComments(c => !c); setMoreMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition text-left">
                    <AlignLeft className="w-3.5 h-3.5 text-paper-dim" /> Notes {active.comments?.length ? `(${active.comments.length})` : ''}
                  </button>
                  <button onClick={() => { duplicateDashboard(active); setMoreMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition text-left">
                    <Copy className="w-3.5 h-3.5 text-paper-dim" /> Duplicate dashboard
                  </button>
                  <div className="h-px bg-ink-border my-1" />
                  <button onClick={() => { exportJSON(); setMoreMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition text-left">
                    <FileJson className="w-3.5 h-3.5 text-paper-dim" /> Export as JSON
                  </button>
                  <button onClick={() => { exportPDF(); setMoreMenuOpen(false); }} disabled={exporting}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-paper/90 hover:bg-ink-raised transition text-left disabled:opacity-50">
                    <Download className="w-3.5 h-3.5 text-paper-dim" /> Export as PDF
                  </button>
                  <div className="h-px bg-ink-border my-1" />
                  <button onClick={() => { setConfirmDeleteId(active.id); setMoreMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition text-left">
                    <Trash2 className="w-3.5 h-3.5" /> Delete dashboard
                  </button>
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              {/* Autosave indicator */}
              <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all font-mono ${
                saveState === 'saved'   ? 'text-emerald-400 bg-emerald-500/10' :
                saveState === 'saving'  ? 'text-paper-dim bg-ink-raised' :
                                          'text-data bg-data/10'
              }`}>
                {saveState === 'saved'   && <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>}
                {saveState === 'saving'  && <><Clock className="w-3.5 h-3.5 animate-pulse" /> Saving…</>}
                {saveState === 'unsaved' && <><Clock className="w-3.5 h-3.5" /> Unsaved</>}
              </div>
              <button onClick={openShareModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-bright text-ink text-sm font-medium transition shadow-glow">
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
            </div>
          </div>

          {/* Global filters */}
          {showFilters && (
            <div className="bg-ink-surface border border-ink-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-paper">Dashboard Filters</h4>
                <select onChange={e => { if (e.target.value) { addGlobalFilter(e.target.value); e.target.value = ''; } }}
                  className="bg-ink-raised border border-ink-borderStrong rounded px-2 py-1 text-xs text-paper focus:outline-none">
                  <option value="">+ Add column filter</option>
                  {columns.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {(active.filters ?? []).length === 0 && <p className="text-xs text-paper-dim">No filters yet. Add one to filter all widgets simultaneously.</p>}
              {(active.filters ?? []).map(f => (
                <div key={f.column} className="flex items-center gap-3 p-3 bg-ink-raised/50 rounded-lg">
                  <span className="text-xs font-medium text-paper">{f.column}</span>
                  {f.type === 'numeric_range' && (
                    <div className="flex items-center gap-2 flex-1">
                      <input type="number" value={f.min ?? ''} onChange={e => {
                        const updated = { ...active, filters: active.filters?.map(x => x.column === f.column ? { ...x, min: Number(e.target.value) } : x) };
                        handleSaveDashboard(updated);
                      }} className="w-20 bg-ink-raised hover:bg-ink-borderStrong border border-ink-borderStrong rounded px-2 py-1 text-xs text-paper focus:outline-none" placeholder="Min" />
                      <span className="text-paper-dim text-xs">–</span>
                      <input type="number" value={f.max ?? ''} onChange={e => {
                        const updated = { ...active, filters: active.filters?.map(x => x.column === f.column ? { ...x, max: Number(e.target.value) } : x) };
                        handleSaveDashboard(updated);
                      }} className="w-20 bg-ink-raised hover:bg-ink-borderStrong border border-ink-borderStrong rounded px-2 py-1 text-xs text-paper focus:outline-none" placeholder="Max" />
                    </div>
                  )}
                  {f.type === 'category' && (
                    <div className="flex flex-wrap gap-1 flex-1">
                      {[...new Set(rows.map(r => String(r[f.column] ?? '')))].slice(0, 10).map(v => (
                        <button key={v} onClick={() => {
                          const cur = new Set(f.values ?? []);
                          if (cur.has(v)) { cur.delete(v); } else { cur.add(v); }
                          const updated = { ...active, filters: active.filters?.map(x => x.column === f.column ? { ...x, values: [...cur] } : x) };
                          handleSaveDashboard(updated);
                        }}
                          className={`px-2 py-0.5 rounded-full text-xs transition ${(f.values ?? []).includes(v) ? 'bg-accent text-ink' : 'bg-ink-raised hover:bg-ink-borderStrong text-paper-dim hover:text-paper'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => removeGlobalFilter(f.column)} className="text-paper-dim hover:text-red-400 transition"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {Object.keys(crossFilters).length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-ink-border">
                  <span className="text-xs text-paper-dim">Cross-filter:</span>
                  {Object.entries(crossFilters).map(([col, vals]) => (
                    <span key={col} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent-bright text-xs">
                      {col}: {[...vals].join(', ')}
                      <button onClick={() => setCrossFilters(p => { const n = {...p}; delete n[col]; return n; })}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  <button onClick={() => setCrossFilters({})} className="text-xs text-paper-dim hover:text-paper">Clear</button>
                </div>
              )}
            </div>
          )}

          {/* History panel */}
          {showHistory && (active.snapshots?.length ?? 0) > 0 && (
            <div className="bg-ink-surface border border-ink-border rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-semibold text-paper mb-2">Dashboard History</h4>
              {(active.snapshots ?? []).map((snap, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-ink-raised/50 rounded-lg">
                  <div>
                    <p className="text-sm text-paper">{snap.label}</p>
                    <p className="text-xs text-paper-dim">{snap.widgets.length} widgets · {new Date(snap.savedAt).toLocaleString()}</p>
                  </div>
                  <button onClick={() => restoreSnapshot(snap)} className="px-3 py-1 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent-bright text-xs transition">
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Comments/Notes */}
          {showComments && (
            <div className="bg-ink-surface border border-ink-border rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-paper">Dashboard Notes</h4>
              <div className="flex gap-2">
                <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a note…"
                  onKeyDown={e => e.key === 'Enter' && addComment()}
                  className="flex-1 bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent" />
                <button onClick={addComment} className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-bright text-ink text-sm transition">Add</button>
              </div>
              {(active.comments ?? []).map(c => (
                <div key={c.id} className="p-3 bg-ink-raised/50 rounded-lg">
                  <p className="text-sm text-paper">{c.text}</p>
                  <p className="text-xs text-paper-dim mt-1">{new Date(c.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add widget form */}
          {adding && (
            <div className="bg-ink-surface border border-accent/30 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-paper">Add Widget</h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {WIDGET_TYPES.map(wt => (
                  <button key={wt.id} onClick={() => setNewWidget(p => ({ ...p, type: wt.id }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition ${newWidget.type === wt.id ? 'bg-accent/10 border-accent text-accent-bright' : 'bg-ink-raised border-ink-borderStrong text-paper-dim hover:text-paper hover:border-ink-borderStrong'}`}>
                    <wt.icon className="w-4 h-4" />
                    {wt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 flex-wrap">
                <input value={newWidget.title ?? ''} onChange={e => setNewWidget(p => ({ ...p, title: e.target.value }))}
                  placeholder="Widget title" className="flex-1 min-w-[160px] bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent" />
                {WIDGET_TYPES.find(w => w.id === newWidget.type)?.needsColumn && (
                  <select value={newWidget.column ?? ''} onChange={e => setNewWidget(p => ({ ...p, column: e.target.value }))}
                    className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:border-accent">
                    <option value="">— column —</option>
                    {columns.map(c => <option key={c}>{c}</option>)}
                  </select>
                )}
                {newWidget.type === 'kpi' && (
                  <select value={newWidget.metric ?? 'count'} onChange={e => setNewWidget(p => ({ ...p, metric: e.target.value }))}
                    className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:border-accent">
                    {KPI_METRICS.map(m => <option key={m}>{m}</option>)}
                  </select>
                )}
                {['text','markdown','image'].includes(newWidget.type ?? '') && (
                  <textarea value={newWidget.content ?? ''} onChange={e => setNewWidget(p => ({ ...p, content: e.target.value }))}
                    placeholder={newWidget.type === 'image' ? 'Image URL' : 'Content'}
                    rows={3} className="w-full bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent resize-none" />
                )}
                <select value={newWidget.size ?? 'md'} onChange={e => setNewWidget(p => ({ ...p, size: e.target.value as 'sm'|'md'|'lg' }))}
                  className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:border-accent">
                  <option value="sm">Small</option>
                  <option value="md">Medium</option>
                  <option value="lg">Large</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={addWidget} className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-bright text-ink text-sm font-medium transition">Add Widget</button>
                <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition">Cancel</button>
              </div>
            </div>
          )}

          {/* Edit widget modal */}
          {editingWidget && (
            <div className="bg-ink-surface border border-amber-500/30 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-paper">Edit Widget: {editingWidget.title}</h4>
              <div className="flex gap-3 flex-wrap">
                <input value={editingWidget.title} onChange={e => setEditingWidget({ ...editingWidget, title: e.target.value })}
                  className="flex-1 min-w-[160px] bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:border-accent" />
                {WIDGET_TYPES.find(w => w.id === editingWidget.type)?.needsColumn && (
                  <select value={editingWidget.column ?? ''} onChange={e => setEditingWidget({ ...editingWidget, column: e.target.value })}
                    className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none">
                    {columns.map(c => <option key={c}>{c}</option>)}
                  </select>
                )}
                {editingWidget.type === 'kpi' && (
                  <select value={editingWidget.metric ?? 'count'} onChange={e => setEditingWidget({ ...editingWidget, metric: e.target.value })}
                    className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none">
                    {KPI_METRICS.map(m => <option key={m}>{m}</option>)}
                  </select>
                )}
                {['text','markdown','image'].includes(editingWidget.type) && (
                  <textarea value={editingWidget.content ?? ''} onChange={e => setEditingWidget({ ...editingWidget, content: e.target.value })}
                    rows={3} className="w-full bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none resize-none" />
                )}
                <select value={editingWidget.size} onChange={e => setEditingWidget({ ...editingWidget, size: e.target.value as 'sm'|'md'|'lg' })}
                  className="bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none">
                  <option value="sm">Small</option>
                  <option value="md">Medium</option>
                  <option value="lg">Large</option>
                </select>
                {/* Color theme */}
                <div>
                  <label className="text-xs text-paper-dim mb-1.5 block">Color Theme</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: 'default', label: 'Default', color: '#5B8DEF' },
                      { id: 'ocean',   label: 'Ocean',   color: '#06b6d4' },
                      { id: 'sunset',  label: 'Sunset',  color: '#f97316' },
                      { id: 'forest',  label: 'Forest',  color: '#22c55e' },
                      { id: 'rose',    label: 'Rose',    color: '#f43f5e' },
                      { id: 'mono',    label: 'Mono',    color: '#94a3b8' },
                    ] as const).map(t => (
                      <button
                        key={t.id}
                        onClick={() => setEditingWidget({ ...editingWidget, theme: t.id })}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition ${editingWidget.theme === t.id || (!editingWidget.theme && t.id === 'default') ? 'border-paper/30 bg-paper/10 text-paper' : 'border-ink-borderStrong text-paper-dim hover:border-ink-borderStrong'}`}
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Custom accent color */}
                <div>
                  <label className="text-xs text-paper-dim mb-1.5 block">Custom Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editingWidget.accentColor ?? '#5B8DEF'}
                      onChange={e => setEditingWidget({ ...editingWidget, accentColor: e.target.value })}
                      className="w-9 h-9 rounded-lg border border-ink-borderStrong bg-ink-raised cursor-pointer p-1"
                    />
                    <span className="text-xs text-paper-dim font-mono">{editingWidget.accentColor ?? '#5B8DEF'}</span>
                    {editingWidget.accentColor && (
                      <button onClick={() => setEditingWidget({ ...editingWidget, accentColor: undefined })} className="text-xs text-paper-dim hover:text-paper/90 transition">Reset</button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveEditedWidget} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-paper text-sm font-medium transition">Save Changes</button>
                <button onClick={() => setEditingWidget(null)} className="px-4 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition">Cancel</button>
              </div>
            </div>
          )}

          {/* Dashboard Narration Panel */}
          {showNarration && (
            <div className="bg-ink-raised/60 border border-purple-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">✨</span>
                  <span className="text-sm font-semibold text-purple-300">Dashboard Narrative</span>
                  {narration && (
                    <span className="text-xs text-paper-dim">
                      Generated {new Date(narration.generatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => generateNarration(true)}
                  disabled={narrationLoading || settings.localOnlyMode}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs transition disabled:opacity-50"
                  title="Regenerate (uses AI quota)"
                >
                  {narrationLoading
                    ? <><span className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" /> Generating…</>
                    : <>↻ Regenerate</>
                  }
                </button>
              </div>
              {narrationError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{narrationError}</p>
              )}
              {narration && !narrationError && (
                <p className="text-sm text-paper/90 leading-relaxed">{narration.text}</p>
              )}
              {!narration && !narrationLoading && !narrationError && (
                <p className="text-xs text-paper-dim">Click Regenerate to generate an AI summary of this dashboard.</p>
              )}
            </div>
          )}

          {/* Widget grid with DnD */}
          {active.widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 border border-dashed border-ink-borderStrong rounded-xl">
              <LayoutDashboard className="w-10 h-10 text-paper-dimmer" />
              <p className="text-paper-dim text-sm">No widgets yet. Add widgets or apply a template.</p>
              <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper text-sm transition">
                <Plus className="w-4 h-4" /> Add First Widget
              </button>
            </div>
          ) : (
            <div ref={dashRef}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={active.widgets.map(w => w.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-min">
                    {active.widgets.map(widget => (
                      // RENDER PERF FIX: `filteredRows` is already a
                      // properly memoized useMemo (see above), so unrelated
                      // re-renders of DashboardTab do NOT give widgets a
                      // new `rows` reference. onRemove/onDuplicate/onResize
                      // below (removeWidget/duplicateWidget/
                      // updateWidgetSize) are now useCallback-wrapped with
                      // dependency arrays verified by hand against a real
                      // type-checker (see each function's definition above
                      // for the specific reasoning — pushUndo and
                      // handleSaveDashboard were stabilized first since
                      // these three depend on them). onEdit=
                      // setEditingWidget is a useState setter and was
                      // already stable. Together, SortableWidget's
                      // React.memo now correctly bails out on unrelated
                      // dashboard state changes (e.g. opening the share
                      // dialog), not just the widget body components
                      // underneath it.
                      <SortableWidget
                        key={widget.id}
                        widget={widget}
                        columns={columns}
                        rows={filteredRows}
                        statistics={statistics}
                        qualityScore={qualityScore}
                        onRemove={removeWidget}
                        onEdit={setEditingWidget}
                        onDuplicate={duplicateWidget}
                        onResize={updateWidgetSize}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      )}

      {/* Confirm delete */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-ink-surface border border-ink-borderStrong rounded-2xl p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-paper">Delete Dashboard?</h3>
            <p className="text-paper-dim text-sm">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm transition">Cancel</button>
              <button onClick={async () => {
                const id = confirmDeleteId;
                setConfirmDeleteId(null);
                await deleteDashboard(datasetName, id);
                const remaining = dashboards.filter(d => d.id !== id);
                setDashboards(remaining);
                setActive(remaining[0] ?? null);
              }} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-paper text-sm font-medium transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShareOpen(false)}>
          <div className="bg-ink-surface border border-ink-borderStrong rounded-2xl p-6 max-w-md w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-paper flex items-center gap-2"><Share2 className="w-5 h-5 text-accent-bright" /> Share Dashboard</h3>
              <button onClick={() => setShareOpen(false)} className="text-paper-dim hover:text-paper"><X className="w-5 h-5" /></button>
            </div>

            {shareBlocked ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400"><ShieldOff className="w-4 h-4" /><span className="font-semibold text-sm">Sharing unavailable</span></div>
                <p className="text-paper-dim text-sm">{settings.localOnlyMode ? 'Local Only Mode is enabled — disable it in Settings to share dashboards.' : 'Enable Cloud Sync for this dataset in Settings first.'}</p>
              </div>
            ) : sharing ? (
              <div className="space-y-3">
                {sharing.revoked ? (
                  <>
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                      <ShieldOff className="w-4 h-4" /> This link has been revoked.
                    </div>
                    <p className="text-paper-dim text-sm">Create a brand new share link — it will use a different URL from the revoked one.</p>
                    <div>
                      <label className="text-xs text-paper-dim mb-1 block flex items-center gap-1"><Clock className="w-3 h-3" /> Expiry date (optional)</label>
                      <input type="date" value={shareExpiry} onChange={e => setShareExpiry(e.target.value)}
                        className="w-full bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="text-xs text-paper-dim mb-1 block flex items-center gap-1"><Lock className="w-3 h-3" /> Password (optional)</label>
                      <input type="password" value={sharePassword} onChange={e => setSharePassword(e.target.value)} placeholder="Leave blank for no password"
                        className="w-full bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent" />
                    </div>
                    {shareError && <p className="text-red-400 text-sm">{shareError}</p>}
                    <button onClick={createShareLink} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent hover:bg-accent-bright text-ink text-sm font-medium transition">
                      <Globe className="w-4 h-4" /> Create New Share Link
                    </button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs text-paper-dim">Share URL</label>
                    <div className="flex gap-2">
                      <input readOnly value={`${window.location.origin}/shared/${sharing.shareToken}`}
                        className="flex-1 min-w-0 bg-ink-raised border border-ink-borderStrong text-paper text-xs rounded-lg px-3 py-2.5 font-mono truncate" />
                      <button onClick={copyShareLink} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0 ${copied ? 'bg-emerald-600 text-paper' : 'bg-ink-raised hover:bg-ink-borderStrong text-paper'}`}>
                        {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    {sharing.expiresAt && <p className="text-xs text-paper-dim flex items-center gap-1"><Clock className="w-3 h-3" /> Expires: {new Date(sharing.expiresAt).toLocaleDateString()}</p>}
                    {sharing.sharePassword && <p className="text-xs text-paper-dim flex items-center gap-1"><Lock className="w-3 h-3" /> Password protected</p>}
                  </div>
                )}
                {!sharing.revoked && dashboardHasTableWidget(active?.widgets ?? []) && (
                  <label className="flex items-start gap-2 text-xs text-paper-dim bg-ink-raised border border-ink-border rounded-lg p-3 cursor-pointer">
                    <input type="checkbox" checked={includeDatasetPreview}
                      onChange={e => setIncludeDatasetPreview(e.target.checked)}
                      className="mt-0.5" />
                    <span>Include a small dataset preview (first {20} rows, up to {8} columns) so table widgets render for viewers. Off by default — only aggregated chart data is shared.</span>
                  </label>
                )}
                {!sharing.revoked && (
                  <button onClick={refreshShareSnapshot} disabled={snapshotSaving}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-ink-raised hover:bg-ink-borderStrong disabled:opacity-50 text-paper text-xs font-medium transition">
                    {snapshotSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {snapshotSaving ? 'Updating shared data…' : 'Refresh shared data'}
                  </button>
                )}
                {!sharing.revoked && shareError && <p className="text-red-400 text-sm">{shareError}</p>}
                {!sharing.revoked && (
                  <div className="flex gap-2 pt-2">
                    <a href={`${window.location.origin}/shared/${sharing.shareToken}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent-bright text-ink text-sm transition">
                      <Eye className="w-4 h-4" /> Preview
                    </a>
                    <button onClick={revokeShare} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm transition">
                      <ShieldOff className="w-4 h-4" /> Revoke
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-paper-dim text-sm">Configure sharing options then create a public link.</p>
                <div>
                  <label className="text-xs text-paper-dim mb-1 block flex items-center gap-1"><Clock className="w-3 h-3" /> Expiry date (optional)</label>
                  <input type="date" value={shareExpiry} onChange={e => setShareExpiry(e.target.value)}
                    className="w-full bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-xs text-paper-dim mb-1 block flex items-center gap-1"><Lock className="w-3 h-3" /> Password (optional)</label>
                  <input type="password" value={sharePassword} onChange={e => setSharePassword(e.target.value)} placeholder="Leave blank for no password"
                    className="w-full bg-ink-raised border border-ink-borderStrong rounded-lg px-3 py-2 text-sm text-paper placeholder-paper-dimmer focus:outline-none focus:border-accent" />
                </div>
                {dashboardHasTableWidget(active?.widgets ?? []) && (
                  <label className="flex items-start gap-2 text-xs text-paper-dim bg-ink-raised border border-ink-border rounded-lg p-3 cursor-pointer">
                    <input type="checkbox" checked={includeDatasetPreview}
                      onChange={e => setIncludeDatasetPreview(e.target.checked)}
                      className="mt-0.5" />
                    <span>Include a small dataset preview so table widgets render for viewers. Off by default — only aggregated chart data (value counts, downsampled trends) is shared; raw rows stay on your device otherwise.</span>
                  </label>
                )}
                {shareError && <p className="text-red-400 text-sm">{shareError}</p>}
                <button onClick={createShareLink} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent hover:bg-accent-bright text-ink text-sm font-medium transition">
                  <Globe className="w-4 h-4" /> Create Share Link
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
