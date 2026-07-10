import { supabase } from './supabase';
import type { ColumnStats } from './types';
import {
  isLocalOnlyMode,
  hasAIConsent,
  canUseAI,
  recordDatasetAIUsage,
  getAppPrivacySettings,
} from './privacy';

const GEMINI_EDGE_FN = '/functions/v1/gemini-proxy';

interface GeminiRequest {
  type: 'insights' | 'chat' | 'recommendations';
  datasetName?: string;
  columns?: string[];
  statistics?: Record<string, ColumnStats>;
  rowCount?: number;
  qualityScore?: number;
  message?: string;
  history?: Array<{ role: string; content: string }>;
}

// Phase 6/7 enforcement: a single choke point every AI function must pass
// through before any network request is made. Local Only Mode, a missing/
// declined consent decision, or a dataset marked "Local Only" all block
// cloud AI — silently and safely, falling back to the local-only engine.
async function isAIAllowed(datasetName: string): Promise<boolean> {
  if (await isLocalOnlyMode()) return false;
  if (!(await hasAIConsent())) return false;
  return canUseAI(datasetName, datasetName);
}

// Section 1.6/1.7: up to 20 columns, proper nullCount
function buildDatasetContext(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  qualityScore: number
): string {
  // Section 1.6: slice up to 20
  const statsStr = Object.entries(statistics)
    .slice(0, 20)
    .map(([col, s]) => {
      const colStat = s as ColumnStats;
      return `  ${col}: mean=${colStat.mean ?? 'N/A'}, min=${colStat.min ?? 'N/A'}, max=${colStat.max ?? 'N/A'}, nulls=${colStat.nullCount ?? 0}`;
    })
    .join('\n');

  return `Dataset: "${datasetName}"
Rows: ${rowCount}
Columns (${columns.length}): ${columns.map(c => `${c.name} (${c.type})`).join(', ')}
Quality Score: ${qualityScore}/100

Statistics:
${statsStr}`;
}

// Local fallback AI (no API key required)
function localFallbackInsights(
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  qualityScore: number
): object {
  const insights = [];
  const recommendations = [];

  const totalCells = rowCount * Object.keys(statistics).length;
  const totalNulls = Object.values(statistics).reduce((s, c) => s + (c.nullCount ?? 0), 0);
  const nullPct = totalCells > 0 ? Math.round((totalNulls / totalCells) * 100) : 0;

  if (nullPct > 20) {
    insights.push({
      title: 'High Missing Data Rate',
      description: `${nullPct}% of cells contain missing values across ${Object.keys(statistics).length} columns.`,
      severity: 'warning',
      recommendation: 'Consider filling nulls with column means or removing rows with excessive missing data.',
    });
  } else if (nullPct > 0) {
    insights.push({
      title: 'Minor Missing Values',
      description: `${nullPct}% of cells contain missing values.`,
      severity: 'info',
      recommendation: 'Missing values are minimal. Consider filling or dropping rows depending on use case.',
    });
  }

  const numericCols = columns.filter(c => c.type === 'number');
  const textCols = columns.filter(c => c.type === 'string');

  insights.push({
    title: 'Dataset Overview',
    description: `Dataset contains ${rowCount.toLocaleString()} rows with ${columns.length} columns: ${numericCols.length} numeric, ${textCols.length} text.`,
    severity: 'info',
  });

  if (qualityScore < 60) {
    insights.push({
      title: 'Data Quality Needs Improvement',
      description: `Quality score of ${qualityScore}/100 suggests significant data issues.`,
      severity: 'critical',
      recommendation: 'Use the Clean tab to remove duplicates and fill missing values before analysis.',
    });
  } else if (qualityScore >= 80) {
    insights.push({
      title: 'High Quality Dataset',
      description: `Quality score of ${qualityScore}/100 — this dataset is in excellent shape for analysis.`,
      severity: 'info',
    });
  }

  // Check for high-cardinality columns
  for (const col of textCols.slice(0, 5)) {
    const s = statistics[col.name];
    if (s && s.uniqueCount / rowCount > 0.9 && rowCount > 100) {
      insights.push({
        title: `High Cardinality: ${col.name}`,
        description: `Column "${col.name}" has ${s.uniqueCount} unique values (${Math.round((s.uniqueCount / rowCount) * 100)}% of rows), suggesting it may be an ID column.`,
        severity: 'info',
        recommendation: 'Consider excluding this column from aggregation analyses.',
      });
    }
  }

  if (numericCols.length > 0) {
    recommendations.push(`Visualize distribution of ${numericCols[0]?.name} using the Histogram chart type.`);
  }
  if (numericCols.length >= 2) {
    recommendations.push(`Explore correlation between ${numericCols[0]?.name} and ${numericCols[1]?.name} using a Scatter chart.`);
  }
  if (textCols.length > 0) {
    recommendations.push(`Group data by ${textCols[0]?.name} to find patterns using a Bar chart.`);
  }
  recommendations.push('Export a PDF report to share findings with stakeholders.');

  return { insights, recommendations, summary: `Dataset analyzed: ${rowCount} rows, ${columns.length} columns, quality score ${qualityScore}/100.` };
}

export async function generateInsights(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  qualityScore: number
): Promise<object> {
  // Local Only Mode / no consent / dataset set to "Local Only" — never touch the network.
  if (!(await isAIAllowed(datasetName))) {
    return localFallbackInsights(columns, statistics, rowCount, qualityScore);
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const ctx = buildDatasetContext(datasetName, columns, statistics, rowCount, qualityScore);

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}${GEMINI_EDGE_FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        prompt: ctx,
        type: 'insights',
        datasetName,
        columns: columns.map(c => c.name),
        statistics,
        rowCount,
        qualityScore,
      } satisfies GeminiRequest & { prompt: string }),
    });

    if (!res.ok) throw new Error('Gemini API unavailable');
    const result = await res.json();
    await recordDatasetAIUsage(datasetName, datasetName);
    return result;
  } catch {
    // Graceful fallback
    return localFallbackInsights(columns, statistics, rowCount, qualityScore);
  }
}

export async function chatWithData(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  qualityScore: number,
  question: string,
  history: Array<{ role: string; content: string }>,
  rows: Record<string, unknown>[] = []
): Promise<string> {
  if (!(await isAIAllowed(datasetName))) {
    return localFallbackChat(datasetName, columns, statistics, rowCount, question, rows);
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    // Phase 8 data minimization: only attach row-level sample data when the
    // user has explicitly opted into "Enhanced AI Analysis". The default
    // ("Strict Privacy Mode") never sends a single cell value to Gemini —
    // only column names/types and aggregate statistics leave the browser.
    const { aiDataMode } = await getAppPrivacySettings();
    const includeSample = aiDataMode === 'enhanced';

    // Find numeric column with highest stdDev for sorting
    const numericCols = columns.filter(c => c.type === 'number');
    const primaryNumeric = numericCols.reduce((best, col) => {
      const stdDev = (statistics[col.name] as ColumnStats)?.stdDev ?? 0;
      const bestStdDev = (statistics[best?.name ?? ''] as ColumnStats)?.stdDev ?? 0;
      return stdDev > bestStdDev ? col : best;
    }, numericCols[0]);

    // Sort rows by primary numeric column to get top values (only computed
    // at all when we're actually allowed to send a sample).
    const sortedRows = includeSample
      ? (primaryNumeric && rows.length > 0
          ? [...rows]
              .sort((a, b) =>
                Number(b[primaryNumeric.name] ?? 0) - Number(a[primaryNumeric.name] ?? 0)
              )
              .slice(0, 15)
          : rows.slice(0, 15))
      : [];

    // Build column statistics summary
    const colStats = columns.slice(0, 20).map(col => {
      const s = statistics[col.name] as ColumnStats;
      if (!s) return `${col.name} (${col.type})`;
      if (col.type === 'number') {
        return `${col.name}: min=${s.min}, max=${s.max}, mean=${s.mean?.toFixed(2)}, nulls=${s.nullCount}`;
      }
      return `${col.name} (text): ${s.uniqueCount} unique values, ${s.nullCount} nulls`;
    }).join('\n');

    const sampleSection = includeSample
      ? `SAMPLE DATA (top 15 rows sorted by ${primaryNumeric?.name ?? 'first column'}):\n${JSON.stringify(sortedRows, null, 2)}`
      : 'SAMPLE DATA: not provided (Strict Privacy Mode is on — only column statistics are shared). ' +
        'Answer using the statistics above; if the question needs row-level values, say so and suggest ' +
        'enabling "Enhanced AI Analysis" in Settings or asking in the local SQL/Filter tabs instead.';

    const prompt = `You are a data analyst assistant for the dataset "${datasetName}".

DATASET OVERVIEW:
- Total rows: ${rowCount}
- Total columns: ${columns.length}
- Data quality score: ${qualityScore}/100

COLUMN STATISTICS:
${colStats}

${sampleSection}

CONVERSATION HISTORY:
${history.slice(-8).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}

USER QUESTION: ${question}

INSTRUCTIONS:
- Answer specifically using the actual data shown above
- Reference specific values, names, and numbers from the sample data if it was provided
- If the answer requires data beyond what's shown, say so clearly
- Keep answers concise and direct
- Format numbers clearly
- If asked to compare columns, use the statistics provided`;

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}${GEMINI_EDGE_FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ type: 'chat', context: prompt, message: question, history }),
    });

    if (!res.ok) throw new Error('Gemini API unavailable');
    const data = await res.json();
    await recordDatasetAIUsage(datasetName, datasetName);
    return data.response ?? data.message ?? 'I analyzed your dataset but could not generate a response.';
  } catch {
    return localFallbackChat(datasetName, columns, statistics, rowCount, question, rows);
  }
}

function localFallbackChat(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  message: string,
  rows: Record<string, unknown>[] = []
): string {
  const lower = message.toLowerCase();

  // Counts
  if ((lower.includes('how many') && lower.includes('row')) || lower.match(/count.*row|row.*count/)) {
    return `The dataset "${datasetName}" contains ${rowCount.toLocaleString()} rows.`;
  }

  // Top 10 records
  if (lower.match(/top\s*\d*\s*record|top\s*\d*\s*row|highest\s*\d*|show.*first/)) {
    const match = lower.match(/top\s*(\d+)/);
    const n = match ? parseInt(match[1]) : 10;
    const numCols = columns.filter(c => c.type === 'number');
    if (numCols.length > 0 && rows.length > 0) {
      const sortCol = numCols[0].name;
      const top = [...rows].sort((a, b) => Number(b[sortCol] ?? 0) - Number(a[sortCol] ?? 0)).slice(0, n);
      const lines = top.map((r, i) => {
        const vals = columns.slice(0, 4).map(c => `${c.name}: ${r[c.name]}`).join(', ');
        return `${i + 1}. ${vals}`;
      });
      return `Top ${n} records by ${sortCol}:\n${lines.join('\n')}`;
    }
  }

  // Totals / sum
  if (lower.match(/total|sum\s+of|sum\s+the/)) {
    const numCols = Object.entries(statistics).filter(([, s]) => s.mean !== undefined);
    if (numCols.length > 0 && rows.length > 0) {
      const results = numCols.slice(0, 5).map(([col]) => {
        const total = rows.reduce((s, r) => s + (Number(r[col]) || 0), 0);
        return `${col}: ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      });
      return `Column totals:\n${results.join('\n')}`;
    }
  }

  // Averages / mean
  if (lower.includes('mean') || lower.includes('average') || lower.includes('avg')) {
    const numCols = Object.entries(statistics).filter(([, s]) => s.mean !== undefined).slice(0, 5);
    return numCols.length > 0
      ? `Column averages:\n${numCols.map(([col, s]) => `${col}: ${s.mean?.toFixed(2)}`).join('\n')}`
      : 'No numeric columns found for mean calculation.';
  }

  // Maximum
  if (lower.includes('max') || lower.includes('maximum') || lower.includes('highest') || lower.includes('largest')) {
    if (rows.length > 0) {
      const numCols = columns.filter(c => c.type === 'number');
      if (numCols.length > 0) {
        const results = numCols.slice(0, 5).map(c => {
          const vals = rows.map(r => Number(r[c.name])).filter(n => !isNaN(n));
          const max = vals.length > 0 ? vals.reduce((a, b) => a > b ? a : b) : statistics[c.name]?.max;
          return `${c.name}: ${max}`;
        });
        return `Maximum values:\n${results.join('\n')}`;
      }
    }
    const numCols = Object.entries(statistics).filter(([, s]) => s.max !== undefined).slice(0, 5);
    return numCols.length > 0 ? `Maximum values:\n${numCols.map(([col, s]) => `${col}: ${s.max}`).join('\n')}` : 'No numeric columns found.';
  }

  // Minimum
  if (lower.includes('min') || lower.includes('minimum') || lower.includes('lowest') || lower.includes('smallest')) {
    if (rows.length > 0) {
      const numCols = columns.filter(c => c.type === 'number');
      if (numCols.length > 0) {
        const results = numCols.slice(0, 5).map(c => {
          const vals = rows.map(r => Number(r[c.name])).filter(n => !isNaN(n));
          const min = vals.length > 0 ? vals.reduce((a, b) => a < b ? a : b) : statistics[c.name]?.min;
          return `${c.name}: ${min}`;
        });
        return `Minimum values:\n${results.join('\n')}`;
      }
    }
    const numCols = Object.entries(statistics).filter(([, s]) => s.min !== undefined).slice(0, 5);
    return numCols.length > 0 ? `Minimum values:\n${numCols.map(([col, s]) => `${col}: ${s.min}`).join('\n')}` : 'No numeric columns found.';
  }

  // Columns
  if (lower.includes('column')) {
    return `The dataset has ${columns.length} columns: ${columns.map(c => c.name).join(', ')}.`;
  }

  // Missing / nulls
  if (lower.includes('null') || lower.includes('missing')) {
    const nullCols = Object.entries(statistics).filter(([, s]) => s.nullCount > 0).map(([col, s]) => `${col}: ${s.nullCount} nulls`);
    if (nullCols.length === 0) return 'Great news — no missing values detected in this dataset!';
    return `Missing values in ${nullCols.length} column(s):\n${nullCols.join('\n')}`;
  }

  // Count of unique values
  if (lower.match(/unique|distinct/)) {
    const results = columns.slice(0, 8).map(c => `${c.name}: ${statistics[c.name]?.uniqueCount ?? '?'} unique`);
    return `Unique value counts:\n${results.join('\n')}`;
  }

  return `I'm analyzing "${datasetName}" (${rowCount.toLocaleString()} rows, ${columns.length} columns). I can answer questions about counts, totals, averages, min/max, top records, missing values, and more. What would you like to know?`;
}

export async function generateDataStory(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  qualityScore: number
): Promise<{ text: string | null; usedAI: boolean }> {
  if (!(await isAIAllowed(datasetName))) {
    return { text: null, usedAI: false };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const statsStr = Object.entries(statistics).slice(0, 15).map(([col, s]) => {
      if (s.mean !== undefined) {
        return `${col}: mean=${s.mean?.toFixed(2)}, min=${s.min}, max=${s.max}, nulls=${s.nullCount}`;
      }
      return `${col}: ${s.uniqueCount} unique values, ${s.nullCount} nulls`;
    }).join('\n');

    const prompt = `You are a senior business intelligence analyst. Generate a professional executive data story for the following dataset.

Dataset: "${datasetName}"
Rows: ${rowCount} | Columns: ${columns.length} | Quality Score: ${qualityScore}/100
Columns: ${columns.map(c => `${c.name} (${c.type})`).join(', ')}

Statistics:
${statsStr}

Return ONLY valid JSON in this exact format (no markdown, no backticks):
{
  "summary": "2-3 sentence executive summary",
  "keyFindings": ["finding 1", "finding 2", "finding 3", "finding 4"],
  "risks": ["risk 1", "risk 2", "risk 3"],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}`;

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}${GEMINI_EDGE_FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ type: 'chat', context: prompt, message: 'Generate the data story JSON now.' }),
    });

    if (!res.ok) throw new Error('AI unavailable');
    const data = await res.json();
    await recordDatasetAIUsage(datasetName, datasetName);
    return { text: data.response ?? null, usedAI: true };
  } catch {
    return { text: null, usedAI: false };
  }
}

export async function generateSQLFromText(
  datasetName: string,
  message: string,
  columns: string[]
): Promise<{ sql: string | null; usedAI: boolean }> {
  if (!(await isAIAllowed(datasetName))) {
    return { sql: null, usedAI: false };
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}${GEMINI_EDGE_FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ type: 'sql_gen', message, columns }),
    });

    if (!res.ok) throw new Error('AI unavailable');
    const data = await res.json();
    await recordDatasetAIUsage(datasetName, datasetName);
    return { sql: data.response ?? null, usedAI: true };
  } catch {
    return { sql: null, usedAI: false };
  }
}

export function getChartRecommendations(
  columns: Array<{ name: string; type: string }>
): string[] {
  const numericCols = columns.filter(c => c.type === 'number').map(c => c.name);
  const textCols = columns.filter(c => c.type === 'string').map(c => c.name);
  const recs: string[] = [];

  if (numericCols.length >= 1) recs.push(`Histogram: distribution of "${numericCols[0]}"`);
  if (numericCols.length >= 2) recs.push(`Scatter: "${numericCols[0]}" vs "${numericCols[1]}"`);
  if (textCols.length >= 1 && numericCols.length >= 1)
    recs.push(`Bar chart: "${numericCols[0]}" by "${textCols[0]}"`);
  if (textCols.length >= 1) recs.push(`Pie chart: distribution of "${textCols[0]}"`);
  if (numericCols.length >= 1) recs.push(`Line chart: trend of "${numericCols[0]}"`);

  return recs;
}

// ── Phase 3: Smart Cleaning Recommendations ───────────────────────────────────
import type { CleaningRecommendation } from './types';

/**
 * Generates cleaning recommendations locally from dataset profile.
 * No network calls — always safe in Local Only Mode.
 */
export function generateCleaningRecommendations(
  columns: string[],
  rows: Record<string, unknown>[],
  statistics: Record<string, ColumnStats>,
  duplicateRows: number
): CleaningRecommendation[] {
  const recs: CleaningRecommendation[] = [];

  // Duplicate rows
  if (duplicateRows > 0) {
    recs.push({
      type: 'remove_duplicates',
      reason: `${duplicateRows} duplicate row${duplicateRows > 1 ? 's' : ''} detected`,
    });
  }

  for (const col of columns) {
    const s = statistics[col];
    if (!s) continue;

    const nullCount = s.nullCount ?? 0;
    const totalRows = rows.length;

    // Missing values
    if (nullCount > 0) {
      const pct = nullCount / totalRows;
      if (pct > 0.5) {
        // Root cause of the "Quality Score 68% -> 0%" bug: this branch used to
        // recommend `remove_nulls`, which deletes every ROW missing a value in
        // this single COLUMN. When a dataset has several columns that are each
        // more than half empty (extremely common in real-world exports), "Apply
        // All" stacks one row-filter per column, and the filters compound
        // (AND-condition) across the whole rule chain. Independent ~50%+ null
        // rates in just 3-4 columns are enough to intersect down to zero
        // surviving rows, and an empty dataset is the one case where the score
        // is defined to read exactly 0% (see calcQualityScore) — even though
        // the data was "cleaned" successfully rule-by-rule.
        // The correct data-cleaning move for a column that is mostly empty is
        // to drop the COLUMN (which doesn't touch row count and can only
        // improve the score), not to drop every row that touches it. Recommend
        // `drop_column` instead so recommendations from different columns
        // never cascade into wiping out the whole dataset.
        recs.push({ type: 'drop_column', column: col, reason: `${nullCount} missing values (${(pct * 100).toFixed(0)}%) — high null rate, column recommended for removal` });
      } else if (s.mean !== undefined) {
        // Numeric column — fill with median
        recs.push({ type: 'fill_median', column: col, reason: `${nullCount} missing values detected in numeric column` });
      } else {
        // Text column — fill with mode
        recs.push({ type: 'fill_mode', column: col, reason: `${nullCount} missing values detected in text column` });
      }
    }

    // Whitespace issues in text columns
    if (s.mean === undefined && rows.some(r => typeof r[col] === 'string' && (r[col] as string) !== (r[col] as string).trim())) {
      recs.push({ type: 'trim_whitespace', column: col, reason: 'Detected leading/trailing whitespace in text values' });
    }

    // Potential date column
    if (s.mean === undefined) {
      const sample = rows.slice(0, 20).map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
      const datePatterns = [/^\d{1,2}\/\d{1,2}\/\d{4}$/, /^\d{4}\/\d{1,2}\/\d{1,2}$/, /^[A-Za-z]+ \d{1,2} \d{4}$/];
      const isDate = sample.some(v => datePatterns.some(p => p.test(String(v))));
      if (isDate) {
        recs.push({ type: 'standardize_date', column: col, reason: 'Detected non-standard date format — standardize to YYYY-MM-DD' });
      }
    }

    // Outlier detection for numeric columns
    if (s.mean !== undefined && s.stdDev && s.max !== undefined) {
      const zMax = (Number(s.max) - s.mean) / s.stdDev;
      if (zMax > 3) {
        recs.push({ type: 'cap_outliers', column: col, reason: `Outliers detected (max Z-score ${zMax.toFixed(1)}) — cap to IQR bounds` });
      }
    }
  }

  return recs;
}
