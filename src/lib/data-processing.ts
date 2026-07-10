import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ColumnStats } from './types';

export interface ParsedData {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  columnCount: number;
}

// ── Canonical duplicate-row detection ─────────────────────────────────────────
// PERFORMANCE ARCHITECTURE FIX: this used to be computed independently in
// THREE separate places (calcQualityScore, profileData, and
// SmartRecommendationsTab), each doing its own `rows.map(r =>
// JSON.stringify(r))` + `new Set(...)` pass over the full dataset. On a
// 1,000,000-row dataset each pass alone takes ~1.5-3.5s of synchronous
// main-thread work (profiled), so three independent call sites meant the
// same ~2-3s scan happened three times over. This single helper is now the
// only place that ever stringifies rows for duplicate detection, and callers
// share one result via the dataset cache (see dataset-cache.ts) instead of
// each re-running their own pass.
export function countDuplicateRows(rows: Record<string, unknown>[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  return duplicates;
}

// Section 1.4 & 1.5 fixes: sample stddev, safe min/max
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

    const nums = nonNull
      .map(v => Number(v))
      .filter(n => !isNaN(n));

    const colStat: ColumnStats = {
      count: rows.length,
      nullCount,
      uniqueCount,
    };

    if (nums.length > 0) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      colStat.mean = parseFloat(mean.toFixed(4));

      if (nums.length >= 2) {
        const variance =
          nums.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) /
          (nums.length - 1);
        colStat.stdDev = parseFloat(Math.sqrt(variance).toFixed(4));
      } else {
        colStat.stdDev = 0;
      }

      colStat.min = nums.reduce((a, b) => (a < b ? a : b));
      colStat.max = nums.reduce((a, b) => (a > b ? a : b));

      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      colStat.median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];

      // mode
      const freq: Record<number, number> = {};
      for (const n of nums) freq[n] = (freq[n] ?? 0) + 1;
      colStat.mode = Number(
        Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
      );
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

function calcQualityScore(
  rows: Record<string, unknown>[],
  stats: Record<string, ColumnStats>,
  duplicateRows: number
): number {
  if (rows.length === 0) return 0;
  const cols = Object.keys(stats);
  const totalCells = rows.length * cols.length;
  if (totalCells === 0) return 100;

  const totalNull = cols.reduce((sum, c) => sum + (stats[c]?.nullCount ?? 0), 0);
  const nullRatio = totalNull / totalCells;

  // Reuses the single duplicate-row scan already done once in profileData
  // (see countDuplicateRows) instead of re-scanning every row again here.
  const dupRatio = duplicateRows / rows.length;

  const score = 100 - nullRatio * 50 - dupRatio * 30;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function parseFile(
  file: File,
  onProgress?: (pct: number, rowsLoaded?: number) => void,
): Promise<ParsedData> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf).slice(0, 8);

  function matchesMagic(magic: number[]): boolean {
    return magic.every((b, i) => bytes[i] === b);
  }

  const allowedTypes = ['xlsx', 'xls', 'csv', 'tsv', 'json'];
  if (!allowedTypes.includes(ext)) {
    throw new Error(`Unsupported file type: .${ext}. Please upload Excel (.xlsx, .xls), CSV, TSV, or JSON files.`);
  }

  if (ext !== 'csv' && ext !== 'tsv' && ext !== 'json') {
    const isXlsx = matchesMagic([0x50, 0x4b, 0x03, 0x04]);
    const isXls = matchesMagic([0xd0, 0xcf, 0x11, 0xe0]);
    if (ext === 'xlsx' && !isXlsx) {
      throw new Error('File content does not match the declared file type (.xlsx).');
    }
    if (ext === 'xls' && !isXls) {
      throw new Error('File content does not match the declared file type (.xls).');
    }
  }

  let columns: string[] = [];
  let rows: Record<string, unknown>[] = [];

  if (ext === 'csv' || ext === 'tsv') {
    const text = new TextDecoder().decode(buf);
    onProgress?.(10);
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      delimiter: ext === 'tsv' ? '\t' : undefined,
      step: onProgress ? (() => {
        // Called per-row; we just use chunk progress approximation
      }) : undefined,
    });
    onProgress?.(90);
    columns = result.meta.fields ?? [];
    rows = result.data;
    onProgress?.(100, rows.length);
  } else if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    rows = data;
    columns = data.length > 0 ? Object.keys(data[0]) : [];
  } else if (ext === 'json') {
    const text = new TextDecoder().decode(buf);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON file. Please ensure the file contains valid JSON.');
    }
    if (Array.isArray(parsed)) {
      rows = parsed.filter(r => r !== null && typeof r === 'object') as Record<string, unknown>[];
      columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    } else if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      // Root cause of the "quality score always 0%" bug for wrapped JSON exports:
      // objects commonly contain MULTIPLE array-valued keys (e.g. { warnings: [],
      // tags: ["a","b"], data: [{...}, {...}] }). Picking the first array key found
      // by Object.keys() order can select a metadata array of primitives instead of
      // the real records array. Once selected, filtering non-object elements out of
      // a primitives-only array leaves rows = [] — which downstream (profileData ->
      // calcQualityScore) is the ONLY way a non-degenerate dataset reads exactly 0%.
      // Fix: prefer the array key whose elements are actually row objects; only fall
      // back to the first array (any type) if no such key exists.
      const arrayKeys = Object.keys(obj).filter(k => Array.isArray(obj[k]));
      const objectArrayKey = arrayKeys.find(k => {
        const arr = obj[k] as unknown[];
        return arr.length > 0 && arr.every(r => r !== null && typeof r === 'object' && !Array.isArray(r));
      });
      const arrKey = objectArrayKey ?? arrayKeys[0];
      if (arrKey) {
        rows = (obj[arrKey] as unknown[]).filter(r => r !== null && typeof r === 'object') as Record<string, unknown>[];
        columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      } else {
        rows = [obj];
        columns = Object.keys(obj);
      }
    } else {
      throw new Error('JSON file must contain an array of objects or an object with an array property.');
    }
  }

  columns = columns.filter(c => c !== '__proto__' && c !== 'constructor' && c !== 'prototype');

  return {
    columns,
    rows,
    rowCount: rows.length,
    columnCount: columns.length,
  };
}

export function profileData(
  columns: string[],
  rows: Record<string, unknown>[]
): {
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

  // Single canonical duplicate-row scan (was previously done twice inside
  // this one function — once here and once inside calcQualityScore).
  const duplicateRows = countDuplicateRows(rows);

  const qualityScore = calcQualityScore(rows, statistics, duplicateRows);

  return { statistics, qualityScore, missingValues, uniqueValues, duplicateRows };
}

// ── Date standardization ──────────────────────────────────────────────────────
export function standardizeDateValue(val: string): string | null {
  const s = String(val).trim();
  // MM/DD/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  // YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // YYYY-MM-DD (already standard)
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // Month DD YYYY e.g. "January 5 2023"
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (m) {
    const months: Record<string,string> = {
      january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
      july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',
    };
    const mo = months[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2,'0')}`;
  }
  return null;
}

// ── IQR outlier indices ───────────────────────────────────────────────────────
export function getOutlierIndicesIQR(values: number[]): Set<number> {
  const indices = new Set<number>();
  if (values.length < 4) return indices;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  values.forEach((v, i) => { if (v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr) indices.add(i); });
  return indices;
}

export function applyCleaningRules(
  rows: Record<string, unknown>[],
  columns: string[],
  rules: Array<{ type: string; column?: string; columns?: string[]; value?: unknown; enabled: boolean; params?: Record<string, unknown> }>
): { rows: Record<string, unknown>[]; changes: string[]; removedColumns: string[]; columns: string[] } {
  let result = [...rows];
  const changes: string[] = [];
  let currentColumns = [...columns];
  const droppedCols = new Set<string>();

  for (const rule of rules) {
    if (!rule.enabled) continue;

    switch (rule.type) {
      // ── EXISTING (reused) ──────────────────────────────────────────────
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
          const filtered = result.filter(
            r => r[col] !== null && r[col] !== undefined && r[col] !== ''
          );
          // Defense-in-depth for the "Quality Score -> 0%" bug: multiple
          // remove_nulls rules (one per column) run sequentially and their
          // effects compound, since each filters the output of the last one.
          // Skip a rule that would zero out an otherwise non-empty dataset,
          // and surface that decision in the change log instead of silently
          // applying it.
          if (before > 0 && filtered.length === 0) {
            changes.push(`Skipped removing rows with null in "${col}" — would have emptied the dataset (${before} rows remaining before this rule)`);
          } else {
            result = filtered;
            changes.push(`Removed ${before - result.length} rows with null in "${col}"`);
          }
        }
        break;
      }
      case 'fill_mean': {
        const col = rule.column;
        if (col) {
          const nums = result.map(r => Number(r[col])).filter(n => !isNaN(n));
          if (nums.length > 0) {
            const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
            let filled = 0;
            result = result.map(r => {
              if (r[col] === null || r[col] === undefined || r[col] === '') {
                filled++;
                return { ...r, [col]: parseFloat(mean.toFixed(4)) };
              }
              return r;
            });
            changes.push(`Filled ${filled} null values in "${col}" with mean (${mean.toFixed(2)})`);
          }
        }
        break;
      }
      case 'fill_median': {
        const col = rule.column;
        if (col) {
          const nums = result.map(r => Number(r[col])).filter(n => !isNaN(n)).sort((a, b) => a - b);
          if (nums.length > 0) {
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
        }
        break;
      }
      case 'trim_whitespace': {
        let trimmed = 0;
        result = result.map(r => {
          const newRow = { ...r };
          for (const col of currentColumns) {
            if (typeof newRow[col] === 'string') {
              const t = (newRow[col] as string).trim();
              if (t !== newRow[col]) { newRow[col] = t; trimmed++; }
            }
          }
          return newRow;
        });
        if (trimmed > 0) changes.push(`Trimmed whitespace in ${trimmed} cells`);
        break;
      }
      case 'standardize_case': {
        const col = rule.column;
        const caseType = (rule.params?.caseType as string) ?? 'lowercase';
        if (col) {
          result = result.map(r => ({
            ...r,
            [col]: typeof r[col] === 'string'
              ? caseType === 'uppercase' ? (r[col] as string).toUpperCase()
                : caseType === 'title' ? (r[col] as string).replace(/\b\w/g, c => c.toUpperCase())
                : (r[col] as string).toLowerCase()
              : r[col],
          }));
          changes.push(`Standardized case in "${col}" to ${caseType}`);
        }
        break;
      }

      // ── PHASE 2: Missing Values ────────────────────────────────────────
      case 'fill_mode': {
        const col = rule.column;
        if (col) {
          const vals = result.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
          if (vals.length > 0) {
            const freq: Record<string, number> = {};
            for (const v of vals) { const k = String(v); freq[k] = (freq[k] ?? 0) + 1; }
            const mode = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
            let filled = 0;
            result = result.map(r => {
              if (r[col] === null || r[col] === undefined || r[col] === '') {
                filled++;
                return { ...r, [col]: mode };
              }
              return r;
            });
            changes.push(`Filled ${filled} null values in "${col}" with mode (${mode})`);
          }
        }
        break;
      }
      case 'fill_constant': {
        const col = rule.column;
        const constVal = rule.value ?? '';
        if (col) {
          let filled = 0;
          result = result.map(r => {
            if (r[col] === null || r[col] === undefined || r[col] === '') {
              filled++;
              return { ...r, [col]: constVal };
            }
            return r;
          });
          changes.push(`Filled ${filled} null values in "${col}" with constant ("${constVal}")`);
        }
        break;
      }
      case 'fill_zero': {
        const col = rule.column;
        if (col) {
          let filled = 0;
          result = result.map(r => {
            if (r[col] === null || r[col] === undefined || r[col] === '') {
              filled++;
              return { ...r, [col]: 0 };
            }
            return r;
          });
          changes.push(`Filled ${filled} null values in "${col}" with 0`);
        }
        break;
      }
      case 'forward_fill': {
        const col = rule.column;
        if (col) {
          let lastVal: unknown = null;
          let filled = 0;
          result = result.map(r => {
            if (r[col] !== null && r[col] !== undefined && r[col] !== '') {
              lastVal = r[col];
              return r;
            }
            if (lastVal !== null) {
              filled++;
              return { ...r, [col]: lastVal };
            }
            return r;
          });
          changes.push(`Forward filled ${filled} null values in "${col}"`);
        }
        break;
      }
      case 'backward_fill': {
        const col = rule.column;
        if (col) {
          let nextVal: unknown = null;
          let filled = 0;
          const reversed = [...result].reverse().map(r => {
            if (r[col] !== null && r[col] !== undefined && r[col] !== '') {
              nextVal = r[col];
              return r;
            }
            if (nextVal !== null) {
              filled++;
              return { ...r, [col]: nextVal };
            }
            return r;
          });
          result = reversed.reverse();
          changes.push(`Backward filled ${filled} null values in "${col}"`);
        }
        break;
      }

      // ── PHASE 2: Text Cleaning ─────────────────────────────────────────
      case 'remove_extra_spaces': {
        const col = rule.column;
        if (col) {
          let count = 0;
          result = result.map(r => {
            if (typeof r[col] === 'string') {
              const cleaned = (r[col] as string).replace(/\s+/g, ' ').trim();
              if (cleaned !== r[col]) count++;
              return { ...r, [col]: cleaned };
            }
            return r;
          });
          changes.push(`Removed extra spaces in ${count} cells in "${col}"`);
        }
        break;
      }
      case 'remove_special_characters': {
        const col = rule.column;
        if (col) {
          let count = 0;
          result = result.map(r => {
            if (typeof r[col] === 'string') {
              const cleaned = (r[col] as string).replace(/[^a-zA-Z0-9\s]/g, '');
              if (cleaned !== r[col]) count++;
              return { ...r, [col]: cleaned };
            }
            return r;
          });
          changes.push(`Removed special characters in ${count} cells in "${col}"`);
        }
        break;
      }
      case 'remove_html_tags': {
        const col = rule.column;
        if (col) {
          let count = 0;
          result = result.map(r => {
            if (typeof r[col] === 'string') {
              const cleaned = (r[col] as string).replace(/<[^>]*>/g, '');
              if (cleaned !== r[col]) count++;
              return { ...r, [col]: cleaned };
            }
            return r;
          });
          changes.push(`Removed HTML tags in ${count} cells in "${col}"`);
        }
        break;
      }
      case 'lowercase': {
        const col = rule.column;
        if (col) {
          result = result.map(r => ({
            ...r,
            [col]: typeof r[col] === 'string' ? (r[col] as string).toLowerCase() : r[col],
          }));
          changes.push(`Lowercased "${col}"`);
        }
        break;
      }
      case 'uppercase': {
        const col = rule.column;
        if (col) {
          result = result.map(r => ({
            ...r,
            [col]: typeof r[col] === 'string' ? (r[col] as string).toUpperCase() : r[col],
          }));
          changes.push(`Uppercased "${col}"`);
        }
        break;
      }
      case 'title_case': {
        const col = rule.column;
        if (col) {
          result = result.map(r => ({
            ...r,
            [col]: typeof r[col] === 'string'
              ? (r[col] as string).replace(/\b\w/g, c => c.toUpperCase())
              : r[col],
          }));
          changes.push(`Title-cased "${col}"`);
        }
        break;
      }
      case 'find_replace': {
        const col = rule.column;
        const find = String(rule.params?.find ?? '');
        const replace = String(rule.params?.replace ?? '');
        if (col && find) {
          let count = 0;
          result = result.map(r => {
            if (typeof r[col] === 'string' && (r[col] as string).includes(find)) {
              count++;
              return { ...r, [col]: (r[col] as string).split(find).join(replace) };
            }
            return r;
          });
          changes.push(`Replaced "${find}" with "${replace}" in ${count} cells in "${col}"`);
        }
        break;
      }
      case 'regex_replace': {
        const col = rule.column;
        const pattern = String(rule.params?.pattern ?? '');
        const replacement = String(rule.params?.replacement ?? '');
        if (col && pattern) {
          let count = 0;
          try {
            const regex = new RegExp(pattern, 'g');
            result = result.map(r => {
              if (typeof r[col] === 'string') {
                const replaced = (r[col] as string).replace(regex, replacement);
                if (replaced !== r[col]) count++;
                return { ...r, [col]: replaced };
              }
              return r;
            });
            changes.push(`Regex replaced /${pattern}/ in ${count} cells in "${col}"`);
          } catch {
            changes.push(`Regex error for pattern /${pattern}/`);
          }
        }
        break;
      }

      // ── PHASE 2: Date Cleaning ─────────────────────────────────────────
      case 'standardize_date': {
        const col = rule.column;
        if (col) {
          let count = 0;
          result = result.map(r => {
            if (r[col] !== null && r[col] !== undefined && r[col] !== '') {
              const standardized = standardizeDateValue(String(r[col]));
              if (standardized && standardized !== String(r[col])) {
                count++;
                return { ...r, [col]: standardized };
              }
            }
            return r;
          });
          changes.push(`Standardized ${count} date values in "${col}" to YYYY-MM-DD`);
        }
        break;
      }

      // ── PHASE 2: Numeric Cleaning ──────────────────────────────────────
      case 'round_decimals': {
        const col = rule.column;
        const decimals = Number(rule.params?.decimals ?? 2);
        if (col) {
          let count = 0;
          result = result.map(r => {
            const n = Number(r[col]);
            if (!isNaN(n) && isFinite(n)) {
              const rounded = parseFloat(n.toFixed(decimals));
              if (rounded !== r[col]) count++;
              return { ...r, [col]: rounded };
            }
            return r;
          });
          changes.push(`Rounded ${count} values in "${col}" to ${decimals} decimals`);
        }
        break;
      }
      case 'replace_infinity': {
        const col = rule.column;
        const replaceWith = rule.value ?? null;
        if (col) {
          let count = 0;
          result = result.map(r => {
            const n = Number(r[col]);
            if (!isFinite(n) && !isNaN(n)) {
              count++;
              return { ...r, [col]: replaceWith };
            }
            return r;
          });
          changes.push(`Replaced ${count} Infinity values in "${col}" with ${replaceWith ?? 'null'}`);
        }
        break;
      }
      case 'clamp_range': {
        const col = rule.column;
        const minVal = rule.params?.min !== undefined ? Number(rule.params.min) : -Infinity;
        const maxVal = rule.params?.max !== undefined ? Number(rule.params.max) : Infinity;
        if (col) {
          let count = 0;
          result = result.map(r => {
            const n = Number(r[col]);
            if (!isNaN(n)) {
              const clamped = Math.min(Math.max(n, minVal), maxVal);
              if (clamped !== n) count++;
              return { ...r, [col]: clamped };
            }
            return r;
          });
          changes.push(`Clamped ${count} values in "${col}" to [${minVal}, ${maxVal}]`);
        }
        break;
      }

      // ── PHASE 2: Column Operations ─────────────────────────────────────
      case 'drop_column': {
        const col = rule.column;
        if (col) {
          result = result.map(r => { const newRow = { ...r }; delete newRow[col]; return newRow; });
          currentColumns = currentColumns.filter(c => c !== col);
          droppedCols.add(col);
          changes.push(`Dropped column "${col}"`);
        }
        break;
      }
      case 'rename_column': {
        const col = rule.column;
        const newName = String(rule.params?.newName ?? '');
        if (col && newName && col !== newName) {
          result = result.map(r => {
            const newRow = { ...r, [newName]: r[col] };
            delete newRow[col];
            return newRow;
          });
          currentColumns = currentColumns.map(c => c === col ? newName : c);
          changes.push(`Renamed column "${col}" to "${newName}"`);
        }
        break;
      }
      case 'split_column': {
        const col = rule.column;
        const delimiter = String(rule.params?.delimiter ?? ',');
        const col1 = String(rule.params?.col1 ?? `${col}_1`);
        const col2 = String(rule.params?.col2 ?? `${col}_2`);
        if (col) {
          result = result.map(r => {
            const parts = String(r[col] ?? '').split(delimiter);
            return { ...r, [col1]: parts[0]?.trim() ?? '', [col2]: parts.slice(1).join(delimiter).trim() };
          });
          if (!currentColumns.includes(col1)) currentColumns.push(col1);
          if (!currentColumns.includes(col2)) currentColumns.push(col2);
          changes.push(`Split "${col}" into "${col1}" and "${col2}" on "${delimiter}"`);
        }
        break;
      }
      case 'merge_columns': {
        const cols = rule.columns ?? [];
        const separator = String(rule.params?.separator ?? ' ');
        const outputCol = String(rule.params?.outputCol ?? cols.join('_'));
        if (cols.length >= 2) {
          result = result.map(r => ({
            ...r,
            [outputCol]: cols.map(c => r[c] ?? '').join(separator),
          }));
          if (!currentColumns.includes(outputCol)) currentColumns.push(outputCol);
          changes.push(`Merged ${cols.join(', ')} into "${outputCol}"`);
        }
        break;
      }

      // ── PHASE 2: Duplicate Management ─────────────────────────────────
      case 'remove_duplicates_by_columns': {
        const cols = rule.columns ?? [];
        if (cols.length > 0) {
          const before = result.length;
          const seen = new Set<string>();
          result = result.filter(r => {
            const key = JSON.stringify(cols.map(c => r[c]));
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          changes.push(`Removed ${before - result.length} duplicates by columns: ${cols.join(', ')}`);
        }
        break;
      }

      // ── PHASE 2: Outlier Handling ──────────────────────────────────────
      case 'remove_outliers':
      case 'cap_outliers':
      case 'replace_outliers_with_median':
      case 'replace_outliers_with_mean': {
        const col = rule.column;
        if (col) {
          const values = result.map(r => Number(r[col])).filter(n => !isNaN(n) && isFinite(n));
          const outlierIdx = getOutlierIndicesIQR(values);
          let numIdx = 0;

          if (rule.type === 'remove_outliers') {
            const before = result.length;
            const validNumericRows = result.filter(r => {
              const n = Number(r[col]);
              if (!isNaN(n) && isFinite(n)) {
                const idx = numIdx++;
                return !outlierIdx.has(idx);
              }
              return true;
            });
            result = validNumericRows;
            changes.push(`Removed ${before - result.length} outlier rows in "${col}"`);
          } else if (rule.type === 'cap_outliers') {
            const sorted = [...values].sort((a, b) => a - b);
            const q1 = sorted[Math.floor(sorted.length * 0.25)];
            const q3 = sorted[Math.floor(sorted.length * 0.75)];
            const iqr = q3 - q1;
            const lower = q1 - 1.5 * iqr;
            const upper = q3 + 1.5 * iqr;
            let count = 0;
            result = result.map(r => {
              const n = Number(r[col]);
              if (!isNaN(n) && isFinite(n)) {
                const clamped = Math.min(Math.max(n, lower), upper);
                if (clamped !== n) { count++; return { ...r, [col]: clamped }; }
              }
              return r;
            });
            changes.push(`Capped ${count} outliers in "${col}" to IQR bounds`);
          } else {
            const replacement = rule.type === 'replace_outliers_with_median'
              ? values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)]
              : values.reduce((a, b) => a + b, 0) / values.length;
            let count = 0;
            result = result.map(r => {
              const n = Number(r[col]);
              if (!isNaN(n) && isFinite(n)) {
                const idx = numIdx++;
                if (outlierIdx.has(idx)) { count++; return { ...r, [col]: parseFloat(replacement.toFixed(4)) }; }
              }
              return r;
            });
            const method = rule.type === 'replace_outliers_with_median' ? 'median' : 'mean';
            changes.push(`Replaced ${count} outliers in "${col}" with ${method}`);
          }
        }
        break;
      }
    }
  }

  return { rows: result, changes, removedColumns: [...droppedCols], columns: currentColumns };
}
