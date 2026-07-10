export interface HistogramBin {
  range: string;
  count: number;
}

/**
 * Builds histogram bins from a list of numeric values.
 *
 * ROOT CAUSE OF THE ORIGINAL CRASH:
 * The previous implementation computed `Math.min(...values)` and
 * `Math.max(...values)`. Spreading an array into a function call passes
 * every element as an individual argument. V8 (and other JS engines) has a
 * hard limit on the number of arguments/stack frames a single call can use
 * (tens of thousands, well below 1,000,000). For datasets in the
 * 100k-1M+ row range this overflowed the call stack immediately —
 * `RangeError: Maximum call stack size exceeded` — even though the
 * function itself never recursed. It looked like infinite recursion from
 * the stack trace, but it was actually a single call blowing the argument
 * limit.
 *
 * FIX: min/max are found with a plain iterative for-loop (O(n), constant
 * stack depth), and bucketing is a second iterative O(n) pass. No
 * recursion, no spread-into-call, no O(n^2) behavior anywhere.
 */
export function buildHistogramBins(values: number[], bins: number): HistogramBin[] {
  const n = values.length;
  if (n === 0 || bins <= 0) return [];

  let min = values[0];
  let max = values[0];
  for (let i = 1; i < n; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  if (min === max) {
    return [{ range: String(min), count: n }];
  }

  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);

  for (let i = 0; i < n; i++) {
    const v = values[i];
    let idx = Math.floor((v - min) / width);
    if (idx < 0) idx = 0;
    else if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  }

  const result: HistogramBin[] = new Array(bins);
  for (let i = 0; i < bins; i++) {
    result[i] = { range: (min + i * width).toFixed(1), count: counts[i] };
  }
  return result;
}

/**
 * Deterministically down-samples rows for CHART RENDERING ONLY.
 *
 * Statistics (mean, median, stdDev, min, max, etc.) must always be
 * computed on the full dataset — that already happens independently in
 * `profileData` (src/lib/data-processing.ts) before this ever runs, so
 * sampling here has no effect on reported statistics.
 *
 * Uses systematic (evenly-spaced) sampling rather than random sampling so
 * results are stable/reproducible across renders and tests, and so the
 * distribution shape is preserved for histograms/box plots.
 *
 * O(maxSampleSize) — never touches every row of a huge dataset once n
 * exceeds the cap.
 */
export function sampleRowsForVisualization<T>(rows: T[], maxSampleSize = 10000): T[] {
  const n = rows.length;
  if (n <= maxSampleSize) return rows;

  const step = n / maxSampleSize;
  const sample: T[] = new Array(maxSampleSize);
  for (let i = 0; i < maxSampleSize; i++) {
    sample[i] = rows[Math.floor(i * step)];
  }
  return sample;
}
