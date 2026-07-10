import { useMemo } from 'react';
import {
  Lightbulb, BarChart2, Table2, Wand2, Database, TrendingUp, AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import type { ColumnStats } from '../../lib/types';

interface Props {
  columns: Array<{ name: string; type: string }>;
  statistics: Record<string, ColumnStats>;
  rows: Record<string, unknown>[];
  rowCount: number;
  qualityScore: number;
  /**
   * Already computed once (upstream, from the full dataset) — passing it in
   * avoids recomputing duplicate-row detection here via JSON.stringify on
   * every tab mount (~1.5-3.5s measured on 1,000,000 rows).
   */
  duplicateRows: number;
  onTabSwitch?: (tab: string) => void;
}

interface Recommendation {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
  tab?: string;
}

export default function SmartRecommendations({ columns, statistics, rows, rowCount, duplicateRows, onTabSwitch }: Props) {
  const numericCols = columns.filter(c => c.type === 'number');
  const textCols = columns.filter(c => c.type === 'string');

  // PERFORMANCE FIX: this used to independently recompute
  // `new Set(rows.map(r => JSON.stringify(r))).size` on every mount — a
  // second full JSON.stringify sweep over the whole dataset duplicating
  // work already done once, upstream, to produce `duplicateRows`. Deriving
  // uniqueRowCount from the prop instead makes this effectively free.
  const uniqueRowCount = rowCount - duplicateRows;

  const recommendations = useMemo<Recommendation[]>(() => {
    const recs: Recommendation[] = [];

    // Data quality issues
    const totalCells = rowCount * columns.length;
    const totalNulls = Object.values(statistics).reduce((s, v) => s + (v.nullCount ?? 0), 0);
    const nullPct = totalCells > 0 ? (totalNulls / totalCells) * 100 : 0;
    if (nullPct > 5) {
      recs.push({
        id: 'clean-nulls',
        icon: Wand2,
        title: 'Clean Missing Values',
        description: `${nullPct.toFixed(1)}% of cells have missing values. Fill or remove them before analysis for accurate results.`,
        action: 'Go to Clean tab',
        priority: nullPct > 20 ? 'high' : 'medium',
        tab: 'clean',
      });
    }

    // Duplicate check
    if (uniqueRowCount < rowCount) {
      recs.push({
        id: 'clean-dups',
        icon: Wand2,
        title: `Remove ${rowCount - uniqueRowCount} Duplicate Rows`,
        description: 'Duplicate rows can skew aggregations and statistical analysis.',
        action: 'Go to Clean tab',
        priority: 'high',
        tab: 'clean',
      });
    }

    // Chart recommendations
    if (numericCols.length >= 1) {
      recs.push({
        id: 'chart-hist',
        icon: BarChart2,
        title: `Histogram: ${numericCols[0].name}`,
        description: `Visualize the distribution of "${numericCols[0].name}" to detect skewness and outliers.`,
        action: 'Go to Visualize',
        priority: 'medium',
        tab: 'visualize',
      });
    }
    if (numericCols.length >= 2) {
      recs.push({
        id: 'chart-scatter',
        icon: BarChart2,
        title: `Scatter: ${numericCols[0].name} vs ${numericCols[1].name}`,
        description: `Check for correlation between "${numericCols[0].name}" and "${numericCols[1].name}".`,
        action: 'Go to Analytics (Correlation)',
        priority: 'medium',
        tab: 'analytics',
      });
    }
    if (textCols.length >= 1 && numericCols.length >= 1) {
      recs.push({
        id: 'pivot-agg',
        icon: Table2,
        title: `Pivot: Sum of ${numericCols[0].name} by ${textCols[0].name}`,
        description: `Group "${numericCols[0].name}" by "${textCols[0].name}" in a pivot table for categorical insights.`,
        action: 'Go to Pivot',
        priority: 'medium',
        tab: 'pivot',
      });
    }

    // SQL suggestions
    if (textCols.length > 0) {
      recs.push({
        id: 'sql-group',
        icon: Database,
        title: `SQL: Count by ${textCols[0].name}`,
        description: `Run: SELECT "${textCols[0].name}", COUNT(*) FROM data GROUP BY "${textCols[0].name}" ORDER BY count DESC`,
        action: 'Go to SQL',
        priority: 'low',
        tab: 'sql',
      });
    }

    // Forecasting opportunity
    const potentialDateCols = columns.filter(c =>
      /date|time|year|month|week|day/i.test(c.name)
    );
    if (potentialDateCols.length > 0 && numericCols.length > 0) {
      recs.push({
        id: 'forecast',
        icon: TrendingUp,
        title: 'Trend & Forecast Available',
        description: `Column "${potentialDateCols[0].name}" may be a time dimension. Use Trend Analysis for forecasting.`,
        action: 'Go to Analytics (Trend)',
        priority: 'medium',
        tab: 'analytics',
      });
    }

    // Outlier alert
    for (const col of numericCols.slice(0, 3)) {
      const s = statistics[col.name];
      if (s && s.stdDev && s.mean !== undefined && s.max !== undefined) {
        const zMax = (Number(s.max) - s.mean) / s.stdDev;
        if (zMax > 3) {
          recs.push({
            id: `outlier-${col.name}`,
            icon: AlertTriangle,
            title: `Outliers in ${col.name}`,
            description: `Maximum value has Z-score of ${zMax.toFixed(1)} — potential outlier. Check with Outlier Detection.`,
            action: 'Go to Analytics (Outliers)',
            priority: 'medium',
            tab: 'analytics',
          });
          break;
        }
      }
    }

    return recs.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- numericCols/textCols are derived from columns which is listed
  }, [columns, statistics, rows, rowCount, uniqueRowCount]);

  const PRIORITY_COLORS = {
    high: 'bg-red-500/10 border-red-500/20 text-red-300',
    medium: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
    low: 'bg-ink-raised/70 border-ink-borderStrong text-paper-dim',
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-paper flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          Smart Recommendations
        </h2>
        <p className="text-sm text-paper-dim mt-0.5">Automated suggestions based on your dataset structure</p>
      </div>

      {recommendations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-paper-dim">
          <Lightbulb className="w-10 h-10 mb-3 opacity-30" />
          <p>Your dataset looks great! No specific recommendations at this time.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map(rec => (
            <div key={rec.id} className="flex items-start gap-4 p-4 bg-ink-surface border border-ink-border rounded-xl hover:border-ink-borderStrong transition">
              <div className="w-9 h-9 rounded-xl bg-ink-raised flex items-center justify-center flex-shrink-0">
                <rec.icon className="w-4 h-4 text-accent-bright" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-paper">{rec.title}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[rec.priority]}`}>
                    {rec.priority}
                  </span>
                </div>
                <p className="text-xs text-paper-dim leading-relaxed">{rec.description}</p>
              </div>
              {onTabSwitch && rec.tab && (
                <button
                  onClick={() => onTabSwitch(rec.tab!)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-accent-bright hover:bg-accent-bright/10 border border-accent/25 transition flex-shrink-0"
                >
                  {rec.action}
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
