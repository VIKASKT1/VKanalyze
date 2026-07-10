// Builds the small, aggregated payload needed to render a shared dashboard's
// charts/tables — without shipping the full raw dataset to Supabase.
//
// Only the columns actually referenced by the dashboard's widgets are
// aggregated, and each aggregate is capped in size, so this stays "small" by
// construction rather than by convention.

const MAX_CATEGORY_BUCKETS = 12;
const MAX_SERIES_POINTS = 150;
const MAX_PREVIEW_ROWS = 20;
const MAX_PREVIEW_COLUMNS = 8;

export interface CategoryBucket {
  name: string;
  count: number;
}

export interface SeriesPoint {
  i: number;
  value: number;
}

export interface WidgetLike {
  id: string;
  type: string;
  column?: string;
}

export interface DashboardSnapshotPayload {
  rowCount: number;
  categoryData: Record<string, { column: string; buckets: CategoryBucket[] }>;
  seriesData: Record<string, { column: string; points: SeriesPoint[] }>;
  previewColumns: string[];
  previewRows: Record<string, unknown>[];
  // Embedded directly so a shared view never depends on a separate
  // analysis_sessions row existing (see migration
  // 20260706120000_dashboard_snapshots_embed_statistics.sql for why).
  statistics: Record<string, unknown>;
  qualityScore: number;
}

function buildCategoryBuckets(rows: Record<string, unknown>[], column: string): CategoryBucket[] {
  const freq: Record<string, number> = {};
  for (const row of rows) {
    const v = String(row[column] ?? 'null');
    freq[v] = (freq[v] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CATEGORY_BUCKETS)
    .map(([name, count]) => ({ name, count }));
}

function buildSeriesPoints(rows: Record<string, unknown>[], column: string): SeriesPoint[] {
  const numeric = rows
    .map(r => Number(r[column]))
    .filter(v => !isNaN(v));

  if (numeric.length <= MAX_SERIES_POINTS) {
    return numeric.map((value, i) => ({ i, value }));
  }

  // Downsample evenly across the full series so trends are preserved.
  const step = numeric.length / MAX_SERIES_POINTS;
  const points: SeriesPoint[] = [];
  for (let i = 0; i < MAX_SERIES_POINTS; i++) {
    points.push({ i, value: numeric[Math.floor(i * step)] });
  }
  return points;
}

/**
 * Computes the aggregated snapshot for a dashboard's widgets from the
 * (in-memory, local-only) dataset rows. `includePreview` should only be true
 * when the user has explicitly opted in to uploading a small table preview.
 */
export function buildDashboardSnapshot(
  widgets: WidgetLike[],
  columns: string[],
  rows: Record<string, unknown>[],
  includePreview: boolean,
  statistics: Record<string, unknown> = {},
  qualityScore = 0
): DashboardSnapshotPayload {
  const categoryData: DashboardSnapshotPayload['categoryData'] = {};
  const seriesData: DashboardSnapshotPayload['seriesData'] = {};

  for (const widget of widgets) {
    if (widget.type === 'bar_chart' || widget.type === 'pie_chart') {
      const column = widget.column ?? columns[0];
      if (column) categoryData[widget.id] = { column, buckets: buildCategoryBuckets(rows, column) };
    } else if (widget.type === 'line_chart' || widget.type === 'area_chart') {
      const column = widget.column ?? columns[0];
      if (column) seriesData[widget.id] = { column, points: buildSeriesPoints(rows, column) };
    }
  }

  const needsPreview = includePreview && widgets.some(w => w.type === 'table');
  const previewColumns = needsPreview ? columns.slice(0, MAX_PREVIEW_COLUMNS) : [];
  const previewRows = needsPreview
    ? rows.slice(0, MAX_PREVIEW_ROWS).map(row => {
        const trimmed: Record<string, unknown> = {};
        for (const c of previewColumns) trimmed[c] = row[c];
        return trimmed;
      })
    : [];

  return {
    rowCount: rows.length,
    categoryData,
    seriesData,
    previewColumns,
    previewRows,
    statistics,
    qualityScore,
  };
}

/** True if any widget in the dashboard needs row-level data that can only be satisfied via a preview. */
export function dashboardHasTableWidget(widgets: WidgetLike[]): boolean {
  return widgets.some(w => w.type === 'table');
}
