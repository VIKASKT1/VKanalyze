import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ColumnStats } from './types';

export interface ParsedData {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  columnCount: number;
}

function computeStatistics(columns: string[], rows: Record<string, unknown>[]): Record<string, ColumnStats> {
  const safeColumns = columns.filter(
    c => c !== '__proto__' && c !== 'constructor' && c !== 'prototype'
  );
  const stats: Record<string, ColumnStats> = {};
  for (const col of safeColumns) {
    const vals = rows.map(r => r[col]);
    const nullCount = vals.filter(v => v === null || v === undefined || v === '').length;
    const nonNull = vals.filter(v => v !== null && v !== undefined && v !== '');
    const uniqueCount = new Set(nonNull.map(String)).size;
    const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
    const colStat: ColumnStats = { count: rows.length, nullCount, uniqueCount };
    if (nums.length > 0) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      colStat.mean = parseFloat(mean.toFixed(4));
      if (nums.length >= 2) {
        const variance = nums.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / (nums.length - 1);
        colStat.stdDev = parseFloat(Math.sqrt(variance).toFixed(4));
      } else {
        colStat.stdDev = 0;
      }
      colStat.min = nums.reduce((a, b) => (a < b ? a : b));
      colStat.max = nums.reduce((a, b) => (a > b ? a : b));
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      colStat.median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      const freq: Record<number, number> = {};
      for (const n of nums) freq[n] = (freq[n] ?? 0) + 1;
      colStat.mode = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
    } else {
      const strVals = nonNull.map(String);
      if (strVals.length > 0) {
        colStat.min = strVals.reduce((a, b) => (a < b ? a : b));
        colStat.max = strVals.reduce((a, b) => (a > b ? a : b));
      }
    }
    stats[col] = colStat;
  }
  return stats;
}

function calcQualityScore(rows: Record<string, unknown>[], stats: Record<string, ColumnStats>): number {
  if (rows.length === 0) return 0;
  const cols = Object.keys(stats);
  const totalCells = rows.length * cols.length;
  if (totalCells === 0) return 100;
  const totalNull = cols.reduce((sum, c) => sum + (stats[c]?.nullCount ?? 0), 0);
  const nullRatio = totalNull / totalCells;
  const uniqueCounts = rows.map(r => JSON.stringify(r));
  const duplicates = uniqueCounts.length - new Set(uniqueCounts).size;
  const dupRatio = duplicates / rows.length;
  const score = 100 - nullRatio * 50 - dupRatio * 30;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function parseFile(file: File): Promise<ParsedData> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf).slice(0, 8);
  function matchesMagic(magic: number[]): boolean {
    return magic.every((b, i) => bytes[i] === b);
  }
  const allowedTypes = ['xlsx', 'xls', 'csv'];
  if (!allowedTypes.includes(ext)) {
    throw new Error(`Unsupported file type: .${ext}. Please upload Excel (.xlsx, .xls) or CSV files.`);
  }
  if (ext !== 'csv') {
    const isXlsx = matchesMagic([0x50, 0x4b, 0x03, 0x04]);
    const isXls = matchesMagic([0xd0, 0xcf, 0x11, 0xe0]);
    if (ext === 'xlsx' && !isXlsx) throw new Error('File content does not match the declared file type (.xlsx).');
    if (ext === 'xls' && !isXls) throw new Error('File content does not match the declared file type (.xls).');
  }
  let columns: string[] = [];
  let rows: Record<string, unknown>[] = [];
  if (ext === 'csv') {
    const text = new TextDecoder().decode(buf);
    const result = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
    columns = result.meta.fields ?? [];
    rows = result.data;
  } else {
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    rows = data;
    columns = data.length > 0 ? Object.keys(data[0]) : [];
  }
  columns = columns.filter(c => c !== '__proto__' && c !== 'constructor' && c !== 'prototype');
  return { columns, rows, rowCount: rows.length, columnCount: columns.length };
}

export function profileData(columns: string[], rows: Record<string, unknown>[]): {
  statistics: Record<string, ColumnStats>;
  qualityScore: number;
  missingValues: Record<string, number>;
  uniqueValues: Record<string, number>;
  duplicateRows: number;
} {
  const statistics = computeStatistics(columns, rows);
  const missingValues: Record<string, number> = {};
  const uniqueValues: Record<string, number> = {};
  for (const col of columns) {
    missingValues[col] = statistics[col]?.nullCount ?? 0;
    uniqueValues[col] = statistics[col]?.uniqueCount ?? 0;
  }
  const uniqueRowStrs = new Set(rows.map(r => JSON.stringify(r)));
  const duplicateRows = rows.length - uniqueRowStrs.size;
  const qualityScore = calcQualityScore(rows, statistics);
  return { statistics, qualityScore, missingValues, uniqueValues, duplicateRows };
}

export function applyCleaningRules(
  rows: Record<string, unknown>[],
  columns: string[],
  rules: Array<{ type: string; column?: string; value?: unknown; enabled: boolean }>
): { rows: Record<string, unknown>[]; changes: string[] } {
  let result = [...rows];
  const changes: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    switch (rule.type) {
      case 'remove_duplicates': {
        const before = result.length;
        const seen = new Set<string>();
        result = result.filter(r => {
          const key = JSON.stringify(r);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        changes.push(`Removed ${before - result.length} duplicate rows`);
        break;
      }
      case 'remove_nulls': {
        const col = rule.column;
        if (col) {
          const before = result.length;
          result = result.filter(r => r[col] !== null && r[col] !== undefined && r[col] !== '');
          changes.push(`Removed ${before - result.length} rows with null in "${col}"`);
        }
        break;
      }
      case 'fill_mean': {
        const col = rule.column;
        if (col) {
          const allVals = result.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
          const isNumericCol = allVals.every(v => !isNaN(Number(v)));
          if (!isNumericCol) {
            changes.push(`Skipped "${col}" — not a numeric column`);
            break;
          }
          const nums = allVals.map(v => Number(v));
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          const roundedMean = Number.isInteger(mean) ? mean : parseFloat(mean.toFixed(2));
          let filled = 0;
          result = result.map(r => {
            if (r[col] === null || r[col] === undefined || r[col] === '') {
              filled++;
              return { ...r, [col]: roundedMean };
            }
            return r;
          });
          changes.push(`Filled ${filled} null values in "${col}" with mean (${roundedMean})`);
        }
        break;
      }
      case 'fill_median': {
        const col = rule.column;
        if (col) {
          const allVals = result.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
          const isNumericCol = allVals.every(v => !isNaN(Number(v)));
          if (!isNumericCol) {
            changes.push(`Skipped "${col}" — not a numeric column`);
            break;
          }
          const nums = allVals.map(v => Number(v)).sort((a, b) => a - b);
          const mid = Math.floor(nums.length / 2);
          const median = nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
          let filled = 0;
          result = result.map(r => {
            if (r[col] === null || r[col] === undefined || r[col] === '') {
              filled++;
              return { ...r, [col]: median };
            }
            return r;
          });
          changes.push(`Filled ${filled} null values in "${col}" with median (${median})`);
        }
        break;
      }
      case 'trim_whitespace': {
        let trimmed = 0;
        result = result.map(r => {
          const newRow = { ...r };
          for (const col of columns) {
            if (typeof newRow[col] === 'string') {
              const trimmed2 = (newRow[col] as string).trim();
              if (trimmed2 !== newRow[col]) { newRow[col] = trimmed2; trimmed++; }
            }
          }
          return newRow;
        });
        if (trimmed > 0) changes.push(`Trimmed whitespace in ${trimmed} cells`);
        break;
      }
      case 'standardize_case': {
        const col = rule.column;
        if (col) {
          result = result.map(r => ({
            ...r,
            [col]: typeof r[col] === 'string' ? (r[col] as string).toLowerCase() : r[col],
          }));
          changes.push(`Standardized case in "${col}" to lowercase`);
        }
        break;
      }
    }
  }
  return { rows: result, changes };
}