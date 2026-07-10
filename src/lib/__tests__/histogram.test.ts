import { describe, it, expect } from 'vitest';
import { buildHistogramBins, sampleRowsForVisualization } from '../histogram';

function randomValues(n: number, max = 1000): number[] {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) arr[i] = Math.random() * max;
  return arr;
}

describe('buildHistogramBins - correctness', () => {
  it('returns [] for empty input', () => {
    expect(buildHistogramBins([], 20)).toEqual([]);
  });

  it('returns a single bin when all values are identical', () => {
    const result = buildHistogramBins([5, 5, 5, 5], 20);
    expect(result).toEqual([{ range: '5', count: 4 }]);
  });

  it('produces the requested number of bins', () => {
    const result = buildHistogramBins([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(result).toHaveLength(5);
  });

  it('every value falls into exactly one bin (counts sum to n)', () => {
    const values = [1, 2, 2, 3, 10, 10, 10, 50, 99, 100];
    const result = buildHistogramBins(values, 10);
    const total = result.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(values.length);
  });

  it('clamps the max value into the last bin, not an out-of-range bucket', () => {
    const values = [0, 100];
    const result = buildHistogramBins(values, 4);
    expect(result.reduce((s, b) => s + b.count, 0)).toBe(2);
    expect(result[result.length - 1].count).toBeGreaterThanOrEqual(1);
  });
});

describe('buildHistogramBins - large dataset regression (no stack overflow)', () => {
  // These sizes reproduce the original production crash. The old
  // implementation used Math.min(...values) / Math.max(...values), which
  // spreads the full array as individual call arguments and overflows the
  // JS call stack well before reaching 1,000,000 elements. This suite
  // guards against that regression ever coming back.

  it('handles 100,000 rows without throwing and preserves total count', () => {
    const values = randomValues(100_000);
    expect(() => buildHistogramBins(values, 20)).not.toThrow();
    const result = buildHistogramBins(values, 20);
    expect(result.reduce((s, b) => s + b.count, 0)).toBe(100_000);
  });

  it('handles 500,000 rows without throwing and preserves total count', () => {
    const values = randomValues(500_000);
    expect(() => buildHistogramBins(values, 20)).not.toThrow();
    const result = buildHistogramBins(values, 20);
    expect(result.reduce((s, b) => s + b.count, 0)).toBe(500_000);
  });

  it('handles 1,000,000 rows without throwing (RangeError regression) and preserves total count', () => {
    const values = randomValues(1_000_000);
    expect(() => buildHistogramBins(values, 20)).not.toThrow();
    const result = buildHistogramBins(values, 20);
    expect(result.reduce((s, b) => s + b.count, 0)).toBe(1_000_000);
  });

  it('runs in roughly linear time, not quadratic, for 1,000,000 rows', () => {
    const values = randomValues(1_000_000);
    const start = Date.now();
    buildHistogramBins(values, 20);
    const elapsed = Date.now() - start;
    // A single O(n) pass over 1M numbers should comfortably finish in well
    // under a second on any modern machine/CI runner. An O(n^2) regression
    // would take minutes, not milliseconds.
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('sampleRowsForVisualization', () => {
  it('returns the original array unchanged when under the threshold', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ i }));
    const result = sampleRowsForVisualization(rows, 10_000);
    expect(result).toBe(rows);
    expect(result).toHaveLength(500);
  });

  it('down-samples datasets over 10,000 rows to the cap', () => {
    const rows = Array.from({ length: 1_000_000 }, (_, i) => ({ i }));
    const result = sampleRowsForVisualization(rows, 10_000);
    expect(result).toHaveLength(10_000);
  });

  it('preserves first and last row coverage for representative sampling', () => {
    const rows = Array.from({ length: 1_000_000 }, (_, i) => ({ i }));
    const result = sampleRowsForVisualization(rows, 10_000);
    expect(result[0].i).toBe(0);
    expect(result[result.length - 1].i).toBeLessThan(1_000_000);
    expect(result[result.length - 1].i).toBeGreaterThan(900_000);
  });

  it('is deterministic (same input -> same output every time)', () => {
    const rows = Array.from({ length: 250_000 }, (_, i) => ({ i }));
    const first = sampleRowsForVisualization(rows, 10_000);
    const second = sampleRowsForVisualization(rows, 10_000);
    expect(first).toEqual(second);
  });
});
