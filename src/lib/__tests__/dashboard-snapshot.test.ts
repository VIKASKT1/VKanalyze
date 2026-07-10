import { describe, it, expect } from 'vitest';
import { buildDashboardSnapshot, dashboardHasTableWidget } from '../dashboard-snapshot';

const rows = [
  { region: 'West', revenue: 100 },
  { region: 'East', revenue: 200 },
  { region: 'West', revenue: 150 },
];
const columns = ['region', 'revenue'];

describe('buildDashboardSnapshot', () => {
  it('embeds the statistics and qualityScore passed in, so the shared view never depends on a separate lookup', () => {
    const stats = { revenue: { count: 3, nullCount: 0, uniqueCount: 3, mean: 150 } };
    const snapshot = buildDashboardSnapshot(
      [{ id: 'w1', type: 'bar_chart', column: 'region' }],
      columns,
      rows,
      false,
      stats,
      87
    );
    expect(snapshot.statistics).toEqual(stats);
    expect(snapshot.qualityScore).toBe(87);
  });

  it('defaults statistics/qualityScore when not provided (backward compatible call sites)', () => {
    const snapshot = buildDashboardSnapshot([], columns, rows, false);
    expect(snapshot.statistics).toEqual({});
    expect(snapshot.qualityScore).toBe(0);
  });

  it('aggregates category and series data per widget id', () => {
    const snapshot = buildDashboardSnapshot(
      [
        { id: 'bar1', type: 'bar_chart', column: 'region' },
        { id: 'line1', type: 'line_chart', column: 'revenue' },
      ],
      columns,
      rows,
      false
    );
    expect(snapshot.categoryData.bar1.buckets).toEqual(
      expect.arrayContaining([{ name: 'West', count: 2 }, { name: 'East', count: 1 }])
    );
    expect(snapshot.seriesData.line1.points.map(p => p.value)).toEqual([100, 200, 150]);
  });

  it('only includes a table preview when includePreview is true AND a table widget exists', () => {
    const withTable = buildDashboardSnapshot(
      [{ id: 't1', type: 'table' }],
      columns,
      rows,
      true
    );
    expect(withTable.previewRows.length).toBeGreaterThan(0);
    expect(dashboardHasTableWidget([{ id: 't1', type: 'table' }])).toBe(true);

    const noOptIn = buildDashboardSnapshot(
      [{ id: 't1', type: 'table' }],
      columns,
      rows,
      false
    );
    expect(noOptIn.previewRows.length).toBe(0);

    const noTableWidget = buildDashboardSnapshot(
      [{ id: 'bar1', type: 'bar_chart', column: 'region' }],
      columns,
      rows,
      true
    );
    expect(noTableWidget.previewRows.length).toBe(0);
  });
});
