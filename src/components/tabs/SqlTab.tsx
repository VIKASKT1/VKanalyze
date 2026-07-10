import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Play, Save, Star, StarOff, Clock, Trash2, Download, Database,
  ChevronDown, Sparkles, Copy, Check, AlertCircle, Loader2, AlignLeft, X
} from 'lucide-react';
import { logActivity, loadSqlQueries, recordSqlQuery, toggleSqlQueryFavorite, deleteSqlQuery } from '../../lib/supabase';
import { generateSQLFromText } from '../../lib/ai';
import { usePrivacy } from '../../lib/PrivacyContext';
import LocalOnlyNotice from '../LocalOnlyNotice';
import { getAICache, setAICache } from '../../lib/ai-cache';
import { saveSqlDraft, loadSqlDraft } from '../../lib/session-store';
import type { LocalSqlQuery } from '../../lib/privacy';

interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
  datasetName: string;
}

type QueryRecord = LocalSqlQuery;

// ── SQL Security: tokenizer-based write-operation blocker ────────────────────
// Strips: single-line comments (--), multi-line comments (/* */), and string literals
// before scanning for blocked keywords. This prevents bypasses via:
//   - Whitespace/newlines:  DELETE\n FROM ...
//   - Comments:             /* comment */ DELETE ...
//   - Nested CTEs:          WITH cte AS (DELETE ...)
//   - Mixed casing:         DeLeTe ...
//   - EXEC/CALL:            EXEC sp_rename ...

const WRITE_KEYWORDS = [
  'DELETE','UPDATE','INSERT','DROP','ALTER','TRUNCATE',
  'MERGE','CREATE','REPLACE','EXEC','EXECUTE','CALL',
  'GRANT','REVOKE','RENAME','ATTACH','DETACH','VACUUM',
  'PRAGMA','COPY','LOAD','IMPORT','EXPORT',
] as const;

function stripSqlComments(sql: string): string {
  // Remove /* ... */ block comments (non-greedy)
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove -- single-line comments
  s = s.replace(/--[^\n]*/g, ' ');
  return s;
}

function stripSqlStringLiterals(sql: string): string {
  // Replace 'content' and "content" with placeholders so keywords inside them are ignored
  return sql.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/** Returns the write keyword found, or null if the SQL is safe. */
function detectWriteOperation(sql: string): string | null {
  const cleaned = stripSqlStringLiterals(stripSqlComments(sql));
  // Split on any non-alphanumeric character (spaces, parens, commas, semicolons, dots)
  // to get individual tokens, then check each against the blocked list.
  const tokens = cleaned.toUpperCase().split(/[^A-Z0-9_]+/).filter(Boolean);
  for (const token of tokens) {
    if ((WRITE_KEYWORDS as readonly string[]).includes(token)) return token;
  }
  return null;
}

function parseSqlSelect(sql: string, rows: Record<string, unknown>[], columns: string[]): {
  columns: string[];
  rows: Record<string, unknown>[];
  error?: string;
} {
  const trimmed = sql.trim();
  const upper = stripSqlComments(trimmed).trim().toUpperCase();
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { columns: [], rows: [], error: 'Only SELECT queries are supported.' };
  }
  const blockedKeyword = detectWriteOperation(sql);
  if (blockedKeyword) {
    return { columns: [], rows: [], error: `Write operation blocked: ${blockedKeyword} is not permitted.` };
  }

  try {
    // Parse SELECT columns
    const afterSelect = sql.replace(/^\s*SELECT\s+/i, '');
    const fromIdx = afterSelect.search(/\bFROM\b/i);
    const selectPart = fromIdx >= 0 ? afterSelect.slice(0, fromIdx).trim() : '*';
    const fromAndRest = fromIdx >= 0 ? afterSelect.slice(fromIdx + 4).trim() : '';

    // Strip table name (FROM data ...)
    const tableEndIdx = fromAndRest.search(/\b(WHERE|GROUP|ORDER|HAVING|LIMIT)\b/i);
    const rest = tableEndIdx >= 0 ? fromAndRest.slice(tableEndIdx) : '';

    // WHERE
    let filtered = [...rows];
    const whereMatch = rest.match(/\bWHERE\s+(.*?)(?=\s*(?:GROUP BY|ORDER BY|HAVING|LIMIT|$))/is);
    if (whereMatch) {
      const cond = whereMatch[1].trim();
      filtered = filtered.filter(row => evalCondition(cond, row, columns));
    }

    // GROUP BY + aggregates
    const groupMatch = rest.match(/\bGROUP\s+BY\s+(.*?)(?=\s*(?:HAVING|ORDER BY|LIMIT|$))/is);
    const groupCols = groupMatch
      ? groupMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
      : [];

    // HAVING
    const havingMatch = rest.match(/\bHAVING\s+(.*?)(?=\s*(?:ORDER BY|LIMIT|$))/is);

    // ORDER BY
    const orderMatch = rest.match(/\bORDER\s+BY\s+(.*?)(?=\s*(?:LIMIT|$))/is);

    // LIMIT
    const limitMatch = rest.match(/\bLIMIT\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1]) : 10000;

    // Resolve select columns
    const isAgg = (expr: string) => /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(expr);
    const selectExprs = selectPart === '*'
      ? columns.map(c => ({ expr: c, alias: c }))
      : parseSelectExpressions(selectPart);

    let resultRows: Record<string, unknown>[];
    let resultCols: string[];

    if (groupCols.length > 0 || selectExprs.some(e => isAgg(e.expr))) {
      // Aggregation path
      const groups: Map<string, Record<string, unknown>[]> = new Map();

      for (const row of filtered) {
        const key = groupCols.length > 0
          ? groupCols.map(c => String(row[c] ?? '')).join('|')
          : '__all__';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      resultRows = [];
      for (const [key, groupRows] of groups) {
        const outRow: Record<string, unknown> = {};
        if (groupCols.length > 0) {
          const keyParts = key.split('|');
          groupCols.forEach((c, i) => { outRow[c] = keyParts[i]; });
        }
        for (const { expr, alias } of selectExprs) {
          outRow[alias] = evalAggregate(expr, groupRows);
        }
        resultRows.push(outRow);
      }

      if (havingMatch) {
        const cond = havingMatch[1].trim();
        resultRows = resultRows.filter(row => evalCondition(cond, row, columns));
      }

      resultCols = selectExprs.map(e => e.alias);
    } else {
      // Simple select
      resultRows = filtered.map(row => {
        const out: Record<string, unknown> = {};
        for (const { expr, alias } of selectExprs) {
          out[alias] = row[expr] ?? row[expr.replace(/['"]/g, '')] ?? null;
        }
        return out;
      });
      resultCols = selectExprs.map(e => e.alias);
    }

    // ORDER BY
    if (orderMatch) {
      const parts = orderMatch[1].trim().split(/,\s*/);
      for (const part of parts.reverse()) {
        const [col, dir] = part.split(/\s+/);
        const desc = dir?.toUpperCase() === 'DESC';
        resultRows.sort((a, b) => {
          const av = a[col], bv = b[col];
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          const an = Number(av), bn = Number(bv);
          if (!isNaN(an) && !isNaN(bn)) return desc ? bn - an : an - bn;
          return desc
            ? String(bv).localeCompare(String(av))
            : String(av).localeCompare(String(bv));
        });
      }
    }

    return { columns: resultCols, rows: resultRows.slice(0, limit) };
  } catch (e) {
    return { columns: [], rows: [], error: `Query error: ${e instanceof Error ? e.message : 'Unknown error'}` };
  }
}

function parseSelectExpressions(s: string): Array<{ expr: string; alias: string }> {
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());

  return parts.map(p => {
    const asMatch = p.match(/\s+AS\s+(\w+)\s*$/i);
    if (asMatch) return { expr: p.slice(0, p.length - asMatch[0].length).trim(), alias: asMatch[1] };
    const plain = p.trim().replace(/['"]/g, '');
    const label = /\bCOUNT\s*\(\s*\*\s*\)/i.test(p) ? 'COUNT(*)'
      : /\b(COUNT|SUM|AVG|MIN|MAX)\s*\((.+?)\)/i.exec(p)?.[0] ?? plain;
    return { expr: p.trim(), alias: label };
  });
}

interface SafeCondition {
  column: string;
  op: string;
  value: string | null;
}

function parseSafeCondition(cond: string): SafeCondition[] {
  const conditions: SafeCondition[] = [];
  const parts = cond.split(/\s+AND\s+/i);

  for (const part of parts) {
    const trimmed = part.trim();

    // IS NOT NULL
    const isNotNull = trimmed.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNull) {
      conditions.push({ column: isNotNull[1], op: 'IS NOT NULL', value: null });
      continue;
    }

    // IS NULL
    const isNull = trimmed.match(/^(\w+)\s+IS\s+NULL$/i);
    if (isNull) {
      conditions.push({ column: isNull[1], op: 'IS NULL', value: null });
      continue;
    }

    // LIKE
    const likeMatch = trimmed.match(/^(\w+)\s+LIKE\s+'([^']*)'$/i);
    if (likeMatch) {
      conditions.push({ column: likeMatch[1], op: 'LIKE', value: likeMatch[2] });
      continue;
    }

    // Comparison operators
    const cmpMatch = trimmed.match(/^(\w+)\s*(!=|>=|<=|>|<|=)\s*(.+)$/);
    if (cmpMatch) {
      let val = cmpMatch[3].trim();
      // Strip quotes from value
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1);
      }
      conditions.push({ column: cmpMatch[1], op: cmpMatch[2], value: val });
      continue;
    }

    // Could not parse — will be treated as always false
    conditions.push({ column: '', op: 'INVALID', value: null });
  }

  return conditions;
}

function evalCondition(cond: string, row: Record<string, unknown>, columns: string[]): boolean {
  try {
    const conditions = parseSafeCondition(cond);

    for (const c of conditions) {
      // Validate column exists in dataset
      if (c.column && !columns.includes(c.column)) return false;
      if (c.op === 'INVALID') return false;

      const rowVal = row[c.column];

      switch (c.op) {
        case 'IS NULL':
          if (rowVal !== null && rowVal !== undefined && rowVal !== '') return false;
          break;
        case 'IS NOT NULL':
          if (rowVal === null || rowVal === undefined || rowVal === '') return false;
          break;
        case 'LIKE': {
          if (rowVal === null || rowVal === undefined) return false;
          const pattern = (c.value ?? '').replace(/%/g, '.*').replace(/_/g, '.');
          const regex = new RegExp(`^${pattern}$`, 'i');
          if (!regex.test(String(rowVal))) return false;
          break;
        }
        case '=': {
          if (rowVal === null || rowVal === undefined) return false;
          const numVal = Number(rowVal);
          const numCmp = Number(c.value);
          if (!isNaN(numVal) && !isNaN(numCmp)) {
            if (numVal !== numCmp) return false;
          } else if (String(rowVal) !== c.value) {
            return false;
          }
          break;
        }
        case '!=': {
          if (rowVal === null || rowVal === undefined) return false;
          const numVal2 = Number(rowVal);
          const numCmp2 = Number(c.value);
          if (!isNaN(numVal2) && !isNaN(numCmp2)) {
            if (numVal2 === numCmp2) return false;
          } else if (String(rowVal) === c.value) {
            return false;
          }
          break;
        }
        case '>': {
          const nv = Number(rowVal), nc = Number(c.value);
          if (isNaN(nv) || isNaN(nc)) return false;
          if (!(nv > nc)) return false;
          break;
        }
        case '>=': {
          const nv = Number(rowVal), nc = Number(c.value);
          if (isNaN(nv) || isNaN(nc)) return false;
          if (!(nv >= nc)) return false;
          break;
        }
        case '<': {
          const nv = Number(rowVal), nc = Number(c.value);
          if (isNaN(nv) || isNaN(nc)) return false;
          if (!(nv < nc)) return false;
          break;
        }
        case '<=': {
          const nv = Number(rowVal), nc = Number(c.value);
          if (isNaN(nv) || isNaN(nc)) return false;
          if (!(nv <= nc)) return false;
          break;
        }
        default:
          return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function evalAggregate(expr: string, rows: Record<string, unknown>[]): unknown {
  const countStar = /^\s*COUNT\s*\(\s*\*\s*\)\s*$/i.exec(expr);
  if (countStar) return rows.length;

  const aggMatch = /^\s*(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(.+?)\s*\)\s*$/i.exec(expr);
  if (!aggMatch) {
    const colName = expr.replace(/['"]/g, '');
    return rows[0]?.[colName] ?? null;
  }

  const [, fn, col] = aggMatch;
  const cleanCol = col.replace(/['"]/g, '');
  const vals = rows.map(r => r[cleanCol]).filter(v => v !== null && v !== undefined);

  switch (fn.toUpperCase()) {
    case 'COUNT': return vals.length;
    case 'SUM': return vals.reduce((a, b) => (a as number) + Number(b), 0);
    case 'AVG': {
      const nums = vals.map(Number).filter(n => !isNaN(n));
      return nums.length ? parseFloat((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4)) : null;
    }
    case 'MIN': {
      const nums = vals.map(Number).filter(n => !isNaN(n));
      return nums.length ? nums.reduce((a, b) => a < b ? a : b, Infinity) : vals.reduce((a, b) => String(a) < String(b) ? a : b);
    }
    case 'MAX': {
      const nums = vals.map(Number).filter(n => !isNaN(n));
      return nums.length ? nums.reduce((a, b) => a > b ? a : b, -Infinity) : vals.reduce((a, b) => String(a) > String(b) ? a : b);
    }
    default: return null;
  }
}

// ── SQL AI Generator ──────────────────────────────────────────────────────────
async function generateSQLFromNL(
  question: string,
  columns: string[],
  datasetName: string
): Promise<string> {
  const { sql } = await generateSQLFromText(datasetName, question, columns);
  if (sql) return sql.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();
  return generateFallbackSQL(question, columns);
}

function generateFallbackSQL(question: string, columns: string[]): string {
  const lower = question.toLowerCase();
  const numCols = columns.filter(c => /price|salary|amount|fee|count|qty|quantity|revenue|cost|total|score|age|year|number/i.test(c));
  const textCols = columns.filter(c => !numCols.includes(c));

  if (lower.match(/top\s*(\d+)/)) {
    const n = lower.match(/top\s*(\d+)/)?.[1] ?? '10';
    const col = numCols[0] ?? columns[0];
    return `SELECT *\nFROM data\nORDER BY "${col}" DESC\nLIMIT ${n};`;
  }
  if (lower.match(/count.*by|group.*by|per\s+\w+/)) {
    const col = textCols[0] ?? columns[0];
    return `SELECT "${col}", COUNT(*) AS count\nFROM data\nGROUP BY "${col}"\nORDER BY count DESC;`;
  }
  if (lower.match(/average|avg/)) {
    const col = numCols[0] ?? columns[0];
    const byCol = textCols[0];
    return byCol
      ? `SELECT "${byCol}", AVG("${col}") AS avg_${col.toLowerCase()}\nFROM data\nGROUP BY "${byCol}"\nORDER BY avg_${col.toLowerCase()} DESC;`
      : `SELECT AVG("${col}") AS average_${col.toLowerCase()}\nFROM data;`;
  }
  if (lower.match(/sum|total/)) {
    const col = numCols[0] ?? columns[0];
    return `SELECT SUM("${col}") AS total_${col.toLowerCase()}\nFROM data;`;
  }
  if (lower.match(/max|highest|largest/)) {
    const col = numCols[0] ?? columns[0];
    return `SELECT *\nFROM data\nORDER BY "${col}" DESC\nLIMIT 1;`;
  }
  if (lower.match(/min|lowest|smallest/)) {
    const col = numCols[0] ?? columns[0];
    return `SELECT *\nFROM data\nORDER BY "${col}" ASC\nLIMIT 1;`;
  }
  return `SELECT *\nFROM data\nLIMIT 10;`;
}

// ── Syntax highlighting ───────────────────────────────────────────────────────
const SQL_KEYWORDS_LIST = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'AS', 'AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE', 'IN', 'BETWEEN', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT', 'JOIN', 'ON', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'UNION', 'ALL', 'ASC', 'DESC'];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Root cause of the "400 font-semibold">" rendering bug: the previous
// implementation ran multiple sequential .replace() passes, and each later
// pass (e.g. the number highlighter) re-scanned the *entire* string including
// HTML already inserted by earlier passes — so it matched the literal digits
// inside class names like "text-amber-400", producing malformed nested
// <span> tags whose attribute value broke out into visible text. Fixed by
// tokenizing the raw SQL in a single pass and only ever wrapping the
// original source text, never previously-generated HTML.
const TOKEN_RE = new RegExp(
  `('(?:[^'\\\\]|\\\\.)*')|(--[^\\n]*)|(\\b\\d+(?:\\.\\d+)?\\b)|(\\b(?:${SQL_KEYWORDS_LIST.join('|')})\\b)`,
  'gi'
);

function highlightSQL(sql: string): string {
  let out = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(sql)) !== null) {
    out += escapeHtml(sql.slice(lastIndex, match.index));
    const [full, stringLit, comment, number, keyword] = match;
    if (stringLit) out += `<span class="text-emerald-400">${escapeHtml(stringLit)}</span>`;
    else if (comment) out += `<span class="text-paper-dim italic">${escapeHtml(comment)}</span>`;
    else if (number) out += `<span class="text-amber-400">${escapeHtml(number)}</span>`;
    else if (keyword) out += `<span class="text-accent-bright font-semibold">${escapeHtml(keyword)}</span>`;
    else out += escapeHtml(full);
    lastIndex = match.index + full.length;
  }
  out += escapeHtml(sql.slice(lastIndex));
  return out;
}

// ── Component ────────────────────────────────────────────────────────────────
type SqlMode = 'beginner' | 'advanced';

const BEGINNER_TEMPLATES = [
  { label: '📋 Preview first 10 rows', sql: 'SELECT *\nFROM data\nLIMIT 10;', desc: 'See a sample of your data' },
  { label: '🔢 Count total rows', sql: 'SELECT COUNT(*) AS total_rows\nFROM data;', desc: 'How many records exist' },
  { label: '📊 Group and count', sql: 'SELECT {col}, COUNT(*) AS count\nFROM data\nGROUP BY {col}\nORDER BY count DESC\nLIMIT 20;', desc: 'Frequency of each value' },
  { label: '🔍 Filter rows', sql: 'SELECT *\nFROM data\nWHERE {col} IS NOT NULL\nLIMIT 50;', desc: 'Filter out missing values' },
  { label: '📈 Top 10 highest values', sql: 'SELECT *\nFROM data\nORDER BY {col} DESC\nLIMIT 10;', desc: 'Find the highest records' },
] as const;

const ADVANCED_TEMPLATES = [
  { label: 'Aggregation with HAVING', sql: 'SELECT {col}, COUNT(*) AS count, AVG({col2}) AS avg_val\nFROM data\nGROUP BY {col}\nHAVING COUNT(*) > 1\nORDER BY count DESC\nLIMIT 20;', desc: 'Group with filter on aggregate' },
  { label: 'NULL analysis', sql: 'SELECT\n  COUNT(*) AS total,\n  COUNT({col}) AS non_null,\n  COUNT(*) - COUNT({col}) AS null_count\nFROM data;', desc: 'Inspect missing data per column' },
  { label: 'Value distribution', sql: 'SELECT {col},\n  COUNT(*) AS freq,\n  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM data), 2) AS pct\nFROM data\nGROUP BY {col}\nORDER BY freq DESC\nLIMIT 30;', desc: 'Percentage frequency table' },
  { label: 'Min / Max / Avg', sql: 'SELECT\n  MIN({col}) AS minimum,\n  MAX({col}) AS maximum,\n  AVG({col}) AS average,\n  COUNT({col}) AS count\nFROM data;', desc: 'Statistical summary' },
  { label: 'Distinct values', sql: 'SELECT DISTINCT {col}\nFROM data\nORDER BY {col}\nLIMIT 100;', desc: 'Unique values in a column' },
] as const;




// RENDER PERF FIX: windowed/virtual scrolling for the query result table
// body, matching the same hand-rolled pattern already used in
// PreviewTab/PivotTab (no new dependency added — this environment can't
// install react-window/@tanstack/react-virtual without network access, and
// the codebase already has its own established virtualization approach).
// Below this row threshold the table renders exactly as before (a single
// static scroll container); above it, only the visible row window plus
// overscan is mounted as real <tr> elements. This does not change what
// rows are computed or what LIMIT does — only how many DOM nodes exist for
// large results.
const SQL_ROW_HEIGHT = 33;
const SQL_OVERSCAN = 10;
const SQL_VIRTUAL_THRESHOLD = 200;

// RENDER PERF FIX: `columns`/`rows` come from DataFlowApp's stable
// `currentColumns`/`currentRows` references, so React.memo lets this skip
// re-rendering on unrelated parent state changes. Query execution itself
// only runs inside the explicit "Run Query" click handler, not in the
// render body, so it isn't a rerender-driven freeze source.
//
// COMPUTATION/RENDER FIX: the query result table used to be capped at
// 10,000 rows by default (no explicit LIMIT — see the `limit` constant
// near the top of this file) but rendered with ordinary browser scrolling
// and no cap on DOM node count; a user who explicitly writes a larger
// LIMIT (e.g. 100000) would render that many real <tr> elements. It now
// uses the same windowed/virtual scroll technique as PreviewTab/PivotTab
// above SQL_VIRTUAL_THRESHOLD rows. The per-cell copy-button hover-to-
// reveal interaction is unchanged — `cellIdx` is still computed from the
// row's absolute index in `result.rows` (not its position within the
// mounted window), so `copiedIdx` matching and the copy behavior work
// identically whether or not virtualization is active.
export default memo(function SqlTab({ columns, rows, datasetName }: Props) {
  const { ensureAIConsent, settings } = usePrivacy();
  const [sqlMode, setSqlMode] = useState<SqlMode>('beginner');
  const [query, setQuery] = useState('SELECT *\nFROM data\nLIMIT 10;');
  const [result, setResult] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [execTime, setExecTime] = useState<number | null>(null);
  const [history, setHistory] = useState<QueryRecord[]>([]);
  const [saved, setSaved] = useState<QueryRecord[]>([]);
  const [activePanel, setActivePanel] = useState<'history' | 'saved' | 'examples'>('history');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [nlInput, setNlInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // RENDER PERF FIX: windowed scroll state for the result table body (see
  // SQL_ROW_HEIGHT/SQL_OVERSCAN/SQL_VIRTUAL_THRESHOLD above).
  const resultScrollRef = useRef<HTMLDivElement>(null);
  const [resultScrollTop, setResultScrollTop] = useState(0);
  const [resultContainerHeight, setResultContainerHeight] = useState(320);
  const handleResultScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setResultScrollTop(e.currentTarget.scrollTop);
  }, []);
  useEffect(() => {
    const el = resultScrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setResultContainerHeight(entry.contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSaved(); loadHistory(); }, [datasetName]);

  // Restore any in-progress (unrun/unsaved) query text for this dataset —
  // covers a hard page refresh, since SqlTab's own useState doesn't survive
  // that on its own (SPA navigation is already handled by VKAnalyzeApp
  // staying mounted; this covers the remaining "actual reload" case).
  useEffect(() => {
    let cancelled = false;
    loadSqlDraft(datasetName).then(draft => {
      if (!cancelled && draft) setQuery(draft);
    });
    return () => { cancelled = true; };
  }, [datasetName]);

  // Debounced persistence of the editor contents as the user types.
  useEffect(() => {
    const t = setTimeout(() => { saveSqlDraft(datasetName, query); }, 500);
    return () => clearTimeout(t);
  }, [datasetName, query]);

  async function loadSaved() {
    setSaved(await loadSqlQueries(datasetName, { savedOnly: true, limit: 50 }));
  }

  async function loadHistory() {
    setHistory(await loadSqlQueries(datasetName, { limit: 30 }));
  }

  async function runQuery() {
    if (!query.trim()) return;
    setRunning(true);
    setError('');
    setResult(null);
    const start = performance.now();

    const res = parseSqlSelect(query, rows, columns);
    const ms = Math.round(performance.now() - start);
    setExecTime(ms);

    if (res.error) {
      setError(res.error);
    } else {
      setResult({ columns: res.columns, rows: res.rows });
    }

    setRunning(false);

    // Persist to history
    await recordSqlQuery(datasetName, {
      query: query.trim(),
      is_saved: false,
      is_favorite: false,
      execution_time_ms: ms,
      row_count: res.rows.length,
    });
    await logActivity(datasetName, 'sql_query', `Ran SQL query (${res.rows.length} rows, ${ms}ms)`);
    loadHistory();
  }

  function saveQuery() {
    setSaveQueryName('');
    setShowSaveDialog(true);
  }

  async function confirmSaveQuery() {
    const name = saveQueryName.trim();
    if (!name) return;
    setShowSaveDialog(false);
    await recordSqlQuery(datasetName, {
      query: query.trim(), is_saved: true, is_favorite: false, name,
    });
    loadSaved();
  }

  async function toggleFavorite(id: string, current: boolean) {
    await toggleSqlQueryFavorite(datasetName, id, current);
    loadSaved(); loadHistory();
  }

  async function deleteQuery(id: string) {
    await deleteSqlQuery(datasetName, id);
    loadSaved(); loadHistory();
  }

  async function generateSQL() {
    if (!nlInput.trim()) return;
    setGenerating(true);

    // Cache key: dataset name + sanitised question
    const cacheKey = nlInput.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 80);
    const cached = await getAICache<string>('sql', datasetName, cacheKey);
    if (cached) {
      setQuery(cached.result);
      setGenerating(false);
      setNlInput('');
      return;
    }

    if (!settings.localOnlyMode) await ensureAIConsent(datasetName);
    const sql = await generateSQLFromNL(nlInput, columns, datasetName);
    setQuery(sql);
    await setAICache('sql', datasetName, cacheKey, sql);
    setGenerating(false);
    setNlInput('');
  }

  function exportCSV() {
    if (!result) return;
    const header = result.columns.join(',');
    const body = result.rows.map(r =>
      result.columns.map(c => {
        const v = String(r[c] ?? '');
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    ).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'query_result.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function syncScroll() {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  /** Basic SQL formatter — uppercases keywords, normalises whitespace */
  function formatSQL() {
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING',
      'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
      'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE',
      'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT', 'CASE', 'WHEN',
      'THEN', 'ELSE', 'END', 'ROUND', 'COALESCE',
    ];
    let sql = query.trim();
    // Uppercase SQL keywords (word-boundary safe)
    keywords.forEach(kw => {
      sql = sql.replace(new RegExp(`\\b${kw}\\b`, 'gi'), kw);
    });
    // Ensure major clauses start on new lines
    const clauses = ['FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'JOIN'];
    clauses.forEach(c => {
      sql = sql.replace(new RegExp(`\\s+${c}\\b`, 'gi'), `\n${c}`);
    });
    // Ensure SELECT columns are on separate lines when comma-separated
    sql = sql.replace(/,\s*/g, ',\n  ');
    // Clean up multiple blank lines
    sql = sql.replace(/\n{3,}/g, '\n\n').trim();
    if (!sql.endsWith(';')) sql += ';';
    setQuery(sql);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter / Cmd+Enter → run query
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
      return;
    }
    // Ctrl+Shift+F → format SQL
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
      e.preventDefault();
      formatSQL();
      return;
    }
    // Tab → insert 2 spaces instead of leaving the textarea
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: s, selectionEnd: end } = ta;
      const newVal = query.slice(0, s) + '  ' + query.slice(end);
      setQuery(newVal);
      // Restore cursor position
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 2;
      });
    }
  }

  function copyCell(val: string, idx: number) {
    navigator.clipboard.writeText(val);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  /** Generates a plain-English explanation of the current SQL query */
  async function explainQuery() {
    if (!query.trim()) return;
    setExplaining(true);
    setExplanation(null);

    // Cache check — keyed by sanitised SQL
    const cacheKey = `explain_${query.trim().replace(/\s+/g, ' ').slice(0, 120)}`;
    const cached = await getAICache<string>('sql', datasetName, cacheKey);
    if (cached) {
      setExplanation(cached.result);
      setExplaining(false);
      return;
    }

    if (settings.localOnlyMode) {
      // Local fallback — parse key clauses manually
      const q = query.trim().toUpperCase();
      const parts: string[] = [];
      if (q.includes('SELECT')) parts.push('Selects columns from your dataset.');
      if (q.includes('WHERE')) parts.push('Filters rows based on a condition.');
      if (q.includes('GROUP BY')) parts.push('Groups rows by a column and aggregates.');
      if (q.includes('ORDER BY')) parts.push('Sorts the results.');
      if (q.includes('LIMIT')) parts.push('Returns a limited number of rows.');
      if (q.includes('JOIN')) parts.push('Joins data from multiple sources.');
      setExplanation(parts.join(' ') || 'This query reads data from your dataset.');
      setExplaining(false);
      return;
    }

    try {
      if (!settings.localOnlyMode) await ensureAIConsent(datasetName);
      const { sql } = await generateSQLFromText(
        datasetName,
        `Explain this SQL query in plain English in 2-3 sentences. Be concise. Query: ${query}`,
        columns
      );
      const result = sql || 'Could not generate explanation.';
      setExplanation(result);
      await setAICache('sql', datasetName, cacheKey, result);
    } catch {
      setExplanation('Explanation unavailable. Check your AI settings.');
    }
    setExplaining(false);
  }

  const displaySaved = saved.filter(q => q.is_saved);

  // Windowed slice of result.rows for rendering only — exportCSV above
  // still uses the full, un-windowed result.rows, so exported output is
  // unaffected by this change.
  const resultRowCount = result ? result.rows.length : 0;
  const resultVirtual = resultRowCount > SQL_VIRTUAL_THRESHOLD;
  const resultTotalHeight = resultRowCount * SQL_ROW_HEIGHT;
  const resultStartIdx = resultVirtual
    ? Math.max(0, Math.floor(resultScrollTop / SQL_ROW_HEIGHT) - SQL_OVERSCAN)
    : 0;
  const resultEndIdx = resultVirtual
    ? Math.min(resultRowCount, Math.ceil((resultScrollTop + resultContainerHeight) / SQL_ROW_HEIGHT) + SQL_OVERSCAN)
    : resultRowCount;
  const visibleResultRows = useMemo(
    () => (result ? result.rows.slice(resultStartIdx, resultEndIdx) : []),
    [result, resultStartIdx, resultEndIdx]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-paper">SQL Workspace</h2>
          <p className="text-sm text-paper-dim mt-0.5">
            Query your dataset with SQL — table name is <code className="bg-ink-raised px-1.5 py-0.5 rounded font-mono text-accent-bright text-xs">data</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-ink-surface border border-ink-border rounded-lg p-0.5">
            {(['beginner', 'advanced'] as const).map(m => (
              <button
                key={m}
                onClick={() => setSqlMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition capitalize ${sqlMode === m ? 'bg-accent text-ink' : 'text-paper-dim hover:text-paper'}`}
              >
                {m === 'beginner' ? '🌱 Beginner' : '⚡ Advanced'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-paper-dim font-mono bg-ink-surface border border-ink-border rounded-lg px-2.5 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            {rows.length.toLocaleString()} rows
          </div>
        </div>
      </div>

      {sqlMode === 'beginner' && (
        <div className="p-3 bg-accent/8 border border-accent/20 rounded-xl text-xs text-accent-bright">
          <strong>Beginner Mode:</strong> Click any template below to load it into the editor. Only SELECT queries are supported — your data is read-only and safe.
        </div>
      )}

      {/* AI SQL Generator */}
      {settings.localOnlyMode && <LocalOnlyNotice feature="AI SQL Generation" />}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
          <input
            type="text"
            value={nlInput}
            onChange={e => setNlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generateSQL()}
            placeholder='Describe query in plain English, e.g. "Show top 10 highest salaries"'
            className="w-full bg-ink-surface border border-purple-500/25 text-paper text-sm rounded-lg pl-9 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 placeholder-paper-dimmer transition"
          />
        </div>
        <button
          onClick={generateSQL}
          disabled={generating || !nlInput.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-paper text-sm font-medium rounded-lg transition"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate SQL
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left: editor + results */}
        <div className="lg:col-span-3 space-y-3">
          {/* Editor — styled like a lightweight IDE pane */}
          <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-border bg-ink-raised/40">
              <div className="flex items-center gap-2.5 text-xs text-paper-dim min-w-0">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-ink-borderStrong" />
                  <span className="w-2.5 h-2.5 rounded-full bg-ink-borderStrong" />
                  <span className="w-2.5 h-2.5 rounded-full bg-ink-borderStrong" />
                </div>
                <Database className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="font-mono font-medium text-paper/80">query.sql</span>
                <span className="hidden sm:inline text-paper-dimmer truncate">· Ctrl+Enter to run · Ctrl+Shift+F to format</span>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={formatSQL} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-paper-dim hover:text-paper hover:bg-ink-raised transition" title="Format SQL (Ctrl+Shift+F)">
                  <AlignLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Format</span>
                </button>
                <button onClick={explainQuery} disabled={explaining} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition disabled:opacity-50" title="Explain this query in plain English">
                  {explaining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} <span className="hidden sm:inline">Explain</span>
                </button>
                <button onClick={saveQuery} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-paper-dim hover:text-paper hover:bg-ink-raised transition">
                  <Save className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Save</span>
                </button>
                <button
                  onClick={runQuery}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs bg-accent hover:bg-accent-bright text-ink font-semibold transition disabled:opacity-50 shadow-glow"
                >
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Run
                </button>
              </div>
            </div>

            {/* Query explanation panel */}
            {explanation && (
              <div className="flex items-start gap-2.5 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-purple-300 mb-0.5">Query Explanation</p>
                  <p className="text-sm text-paper/90 leading-relaxed">{explanation}</p>
                </div>
                <button onClick={() => setExplanation(null)} className="text-paper-dimmer hover:text-paper-dim transition flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {/* Syntax-highlighted editor */}
            <div className="relative font-mono text-sm" style={{ minHeight: 140 }}>
              <div
                ref={highlightRef}
                className="absolute inset-0 px-4 py-3 pointer-events-none overflow-auto whitespace-pre-wrap break-words text-paper/90 leading-6"
                dangerouslySetInnerHTML={{ __html: highlightSQL(query) + '\n' }}
                aria-hidden
              />
              <textarea
                ref={textareaRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={syncScroll}
                spellCheck={false}
                className="relative w-full bg-transparent text-transparent caret-white px-4 py-3 resize-none focus:outline-none leading-6 overflow-auto"
                style={{ minHeight: 140, caretColor: 'white' }}
                rows={8}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-border bg-ink-raised/40">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-medium text-paper">Results</span>
                  <span className="font-mono text-xs text-paper-dim tabular-nums">
                    {result.rows.length.toLocaleString()} row{result.rows.length !== 1 ? 's' : ''}
                  </span>
                  {execTime !== null && (
                    <span className="flex items-center gap-1 font-mono text-xs text-emerald-400/80">
                      <span className="w-1 h-1 rounded-full bg-emerald-400" />
                      {execTime}ms
                    </span>
                  )}
                </div>
                <button onClick={exportCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-paper-dim hover:text-paper hover:bg-ink-raised transition">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
              {result.rows.length === 0 ? (
                <p className="px-4 py-10 text-sm text-paper-dim text-center">Query returned no rows</p>
              ) : resultVirtual ? (
                <>
                  {/* Header (separate scroll container from the virtualized body, same technique as PreviewTab) */}
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-xs border-collapse min-w-max">
                      <thead className="bg-ink-surface">
                        <tr className="border-b border-ink-border">
                          <th className="px-3 py-2.5 text-paper-dimmer font-mono font-medium w-10">#</th>
                          {result.columns.map(c => (
                            <th key={c} className="text-left px-3 py-2.5 text-paper-dim font-medium whitespace-nowrap border-l border-ink-border/30">{c}</th>
                          ))}
                        </tr>
                      </thead>
                    </table>
                  </div>
                  <div className="px-4 py-1.5 bg-ink-raised/30 border-b border-ink-border text-paper-dimmer text-[11px]">
                    {resultRowCount.toLocaleString()} rows · virtualized for smooth scrolling
                  </div>
                  <div
                    ref={resultScrollRef}
                    onScroll={handleResultScroll}
                    className="overflow-auto scrollbar-thin"
                    style={{ height: Math.min(320, Math.max(160, resultTotalHeight)) }}
                  >
                    <div style={{ height: resultTotalHeight, position: 'relative' }}>
                      <table
                        className="w-full text-xs border-collapse min-w-max"
                        style={{ position: 'absolute', top: resultStartIdx * SQL_ROW_HEIGHT, width: '100%' }}
                      >
                        <tbody>
                          {visibleResultRows.map((row, i) => {
                            const ri = resultStartIdx + i;
                            return (
                              <tr key={ri} style={{ height: SQL_ROW_HEIGHT }} className="border-b border-ink-border/30 hover:bg-ink-raised/40 transition-colors group">
                                <td className="px-3 py-2 text-paper-dimmer font-mono tabular-nums">{ri + 1}</td>
                                {result.columns.map((c, ci) => {
                                  const cellIdx = ri * 1000 + ci;
                                  const val = String(row[c] ?? '');
                                  return (
                                    <td key={c} className="px-3 py-2 text-paper/90 whitespace-nowrap max-w-[200px] truncate border-l border-ink-border/20" title={val}>
                                      <span className="flex items-center gap-1.5">
                                        {val}
                                        <button onClick={() => copyCell(val, cellIdx)} className="opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                                          {copiedIdx === cellIdx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-paper-dimmer hover:text-paper-dim" />}
                                        </button>
                                      </span>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="overflow-x-auto max-h-80 scrollbar-thin">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-ink-surface z-10">
                      <tr className="border-b border-ink-border">
                        <th className="px-3 py-2.5 text-paper-dimmer font-mono font-medium w-10">#</th>
                        {result.columns.map(c => (
                          <th key={c} className="text-left px-3 py-2.5 text-paper-dim font-medium whitespace-nowrap border-l border-ink-border/30">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, ri) => (
                        <tr key={ri} className="border-b border-ink-border/30 hover:bg-ink-raised/40 transition-colors group">
                          <td className="px-3 py-2 text-paper-dimmer font-mono tabular-nums">{ri + 1}</td>
                          {result.columns.map((c, ci) => {
                            const cellIdx = ri * 1000 + ci;
                            const val = String(row[c] ?? '');
                            return (
                              <td key={c} className="px-3 py-2 text-paper/90 whitespace-nowrap max-w-[200px] truncate border-l border-ink-border/20" title={val}>
                                <span className="flex items-center gap-1.5">
                                  {val}
                                  <button onClick={() => copyCell(val, cellIdx)} className="opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                                    {copiedIdx === cellIdx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-paper-dimmer hover:text-paper-dim" />}
                                  </button>
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: history / saved */}
        <div className="space-y-3">
          <div className="flex gap-1 bg-ink-surface border border-ink-border rounded-lg p-1">
            {(['history', 'saved', 'examples'] as const).map(p => (
              <button key={p} onClick={() => setActivePanel(p)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition ${activePanel === p ? 'bg-accent text-ink' : 'text-paper-dim hover:text-paper'}`}>
                {p === 'saved' ? `Saved` : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden max-h-96 overflow-y-auto scrollbar-thin">
            {activePanel === 'history' && (
              history.length === 0
                ? <p className="px-4 py-8 text-xs text-paper-dim text-center">No queries yet</p>
                : history.map(q => (
                  <div key={q.id} className="border-b border-ink-border last:border-0 hover:bg-ink-raised/30 transition">
                    <button className="w-full text-left px-3 py-2.5" onClick={() => setQuery(q.query)}>
                      <p className="text-xs text-paper/90 font-mono truncate">{q.query.replace(/\n/g, ' ')}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-paper-dim">
                        <Clock className="w-3 h-3" />
                        {new Date(q.created_at).toLocaleTimeString()}
                        {q.execution_time_ms && <span>{q.execution_time_ms}ms</span>}
                        {q.row_count !== null && <span>{q.row_count} rows</span>}
                      </div>
                    </button>
                  </div>
                ))
            )}

            {activePanel === 'saved' && (
              displaySaved.length === 0
                ? <p className="px-4 py-6 text-xs text-paper-dim text-center">No saved queries</p>
                : displaySaved.map(q => (
                  <div key={q.id} className="border-b border-ink-border last:border-0 hover:bg-ink-raised/30 transition">
                    <div className="flex items-start gap-2 px-3 py-2.5">
                      <button className="flex-1 text-left" onClick={() => setQuery(q.query)}>
                        <p className="text-xs font-medium text-paper">{q.name ?? 'Unnamed'}</p>
                        <p className="text-xs text-paper-dim font-mono truncate mt-0.5">{q.query.replace(/\n/g, ' ')}</p>
                      </button>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => toggleFavorite(q.id, q.is_favorite)} className="text-paper-dim hover:text-amber-400 transition p-0.5">
                          {q.is_favorite ? <Star className="w-3.5 h-3.5 text-amber-400" /> : <StarOff className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => deleteQuery(q.id)} className="text-paper-dim hover:text-red-400 transition p-0.5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
            )}

            {activePanel === 'examples' && (
              <div className="p-2 space-y-2">
                <p className="text-xs text-paper-dim px-1 pb-1 uppercase tracking-wide font-medium">
                  {sqlMode === 'beginner' ? '🌱 Beginner Templates' : '⚡ Advanced Templates'}
                </p>
                {(sqlMode === 'beginner' ? BEGINNER_TEMPLATES : ADVANCED_TEMPLATES).map((e, i) => {
                  const col0 = columns[0] ?? 'column';
                  const col1 = columns.find(c => c !== col0) ?? col0;
                  const sql = (e.sql as string)
                    .replace(/\{col2\}/g, col1)
                    .replace(/\{col\}/g, col0);
                  return (
                    <button key={i} onClick={() => setQuery(sql)}
                      className="w-full text-left p-2.5 bg-ink-raised/50 hover:bg-ink-raised rounded-lg transition group">
                      <p className="text-xs font-medium text-accent-bright group-hover:text-accent-bright">{e.label}</p>
                      <p className="text-xs text-paper-dim mt-0.5">{e.desc}</p>
                      <p className="text-xs text-paper-dimmer font-mono mt-1 truncate">{sql.split('\n')[0]}</p>
                    </button>
                  );
                })}
                {sqlMode === 'beginner' && columns.slice(0, 3).map(col => (
                  <button key={col} onClick={() => setQuery(`SELECT "${col}", COUNT(*) AS count\nFROM data\nGROUP BY "${col}"\nORDER BY count DESC\nLIMIT 20;`)}
                    className="w-full text-left p-2.5 bg-ink-raised/50 hover:bg-ink-raised rounded-lg transition">
                    <p className="text-xs font-medium text-purple-400">Group by {col}</p>
                    <p className="text-xs text-paper-dim mt-0.5">Frequency count for each {col} value</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Column reference */}
          <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-ink-border text-xs font-medium text-paper-dim flex items-center gap-1.5">
              <ChevronDown className="w-3.5 h-3.5" /> Columns ({columns.length})
            </div>
            <div className="max-h-40 overflow-y-auto p-2 space-y-0.5">
              {columns.map(c => (
                <button key={c} onClick={() => {
                  const ta = textareaRef.current;
                  if (!ta) return;
                  const pos = ta.selectionStart;
                  setQuery(q => q.slice(0, pos) + `"${c}"` + q.slice(pos));
                }}
                  className="w-full text-left px-2 py-1 rounded text-xs text-paper-dim hover:text-paper hover:bg-ink-raised transition font-mono truncate">
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Save Query Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-ink-raised border border-ink-borderStrong rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-paper mb-1">Save Query</h3>
            <p className="text-xs text-paper-dim mb-4">Give this query a name to save it for later.</p>
            <input
              type="text"
              value={saveQueryName}
              onChange={e => setSaveQueryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmSaveQuery(); if (e.key === 'Escape') setShowSaveDialog(false); }}
              placeholder="e.g. Top revenue by region"
              autoFocus
              className="w-full px-3 py-2 bg-ink-surface border border-ink-borderStrong rounded-lg text-paper text-sm placeholder-paper-dimmer focus:outline-none focus:ring-2 focus:ring-accent mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 text-sm text-paper-dim hover:text-paper transition"
              >Cancel</button>
              <button
                onClick={confirmSaveQuery}
                disabled={!saveQueryName.trim()}
                className="px-4 py-2 text-sm bg-accent hover:bg-accent-bright disabled:opacity-40 text-ink font-medium rounded-lg transition"
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
