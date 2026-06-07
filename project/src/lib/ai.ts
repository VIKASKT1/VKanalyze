import { supabase } from './supabase';
import type { ColumnStats } from './types';

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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const ctx = buildDatasetContext(datasetName, columns, statistics, rowCount, qualityScore);
    const payload: GeminiRequest = {
      type: 'insights',
      datasetName,
      columns,
      statistics,
      rowCount,
      qualityScore,
    };

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}${GEMINI_EDGE_FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ prompt: ctx, type: 'insights', ...payload }),
    });

    if (!res.ok) throw new Error('Gemini API unavailable');
    return await res.json();
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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    // Find numeric column with highest stdDev for sorting
    const numericCols = columns.filter(c => c.type === 'number');
    const primaryNumeric = numericCols.reduce((best, col) => {
      const stdDev = (statistics[col.name] as ColumnStats)?.stdDev ?? 0;
      const bestStdDev = (statistics[best?.name ?? ''] as ColumnStats)?.stdDev ?? 0;
      return stdDev > bestStdDev ? col : best;
    }, numericCols[0]);

    // Sort rows by primary numeric column to get top values
    const sortedRows = primaryNumeric && rows.length > 0
      ? [...rows]
          .sort((a, b) =>
            Number(b[primaryNumeric.name] ?? 0) - Number(a[primaryNumeric.name] ?? 0)
          )
          .slice(0, 15)
      : rows.slice(0, 15);

    // Build column statistics summary
    const colStats = columns.slice(0, 20).map(col => {
      const s = statistics[col.name] as ColumnStats;
      if (!s) return `${col.name} (${col.type})`;
      if (col.type === 'number') {
        return `${col.name}: min=${s.min}, max=${s.max}, mean=${s.mean?.toFixed(2)}, nulls=${s.nullCount}`;
      }
      return `${col.name} (text): ${s.uniqueCount} unique values, ${s.nullCount} nulls`;
    }).join('\n');

    const prompt = `You are a data analyst assistant for the dataset "${datasetName}".

DATASET OVERVIEW:
- Total rows: ${rowCount}
- Total columns: ${columns.length}
- Data quality score: ${qualityScore}/100

COLUMN STATISTICS:
${colStats}

SAMPLE DATA (top 15 rows sorted by ${primaryNumeric?.name ?? 'first column'}):
${JSON.stringify(sortedRows, null, 2)}

CONVERSATION HISTORY:
${history.slice(-8).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}

USER QUESTION: ${question}

INSTRUCTIONS:
- Answer specifically using the actual data shown above
- Reference specific values, names, and numbers from the sample data
- If asked about highest/lowest/top values, look at the sorted sample data
- If the answer requires data beyond the 15 rows shown, say so clearly
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
    return data.response ?? data.message ?? 'I analyzed your dataset but could not generate a response.';
  } catch {
    return localFallbackChat(datasetName, columns, statistics, rowCount, question);
  }
}

function localFallbackChat(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  message: string
): string {
  const lower = message.toLowerCase();

  if (lower.includes('how many') && lower.includes('row')) {
    return `The dataset "${datasetName}" contains ${rowCount.toLocaleString()} rows.`;
  }
  if (lower.includes('column')) {
    return `The dataset has ${columns.length} columns: ${columns.map(c => c.name).join(', ')}.`;
  }
  if (lower.includes('null') || lower.includes('missing')) {
    const nullCols = Object.entries(statistics)
      .filter(([, s]) => s.nullCount > 0)
      .map(([col, s]) => `${col}: ${s.nullCount} nulls`);
    if (nullCols.length === 0) return 'Great news — no missing values detected in this dataset!';
    return `Found missing values in ${nullCols.length} column(s): ${nullCols.join(', ')}.`;
  }
  if (lower.includes('mean') || lower.includes('average')) {
    const numCols = Object.entries(statistics)
      .filter(([, s]) => s.mean !== undefined)
      .slice(0, 5)
      .map(([col, s]) => `${col}: ${s.mean}`);
    return numCols.length > 0
      ? `Column means: ${numCols.join(', ')}`
      : 'No numeric columns found for mean calculation.';
  }
  if (lower.includes('max') || lower.includes('maximum')) {
    const numCols = Object.entries(statistics)
      .filter(([, s]) => s.max !== undefined)
      .slice(0, 5)
      .map(([col, s]) => `${col}: ${s.max}`);
    return numCols.length > 0 ? `Maximum values: ${numCols.join(', ')}` : 'No numeric columns found.';
  }
  if (lower.includes('min') || lower.includes('minimum')) {
    const numCols = Object.entries(statistics)
      .filter(([, s]) => s.min !== undefined)
      .slice(0, 5)
      .map(([col, s]) => `${col}: ${s.min}`);
    return numCols.length > 0 ? `Minimum values: ${numCols.join(', ')}` : 'No numeric columns found.';
  }

  return `I'm analyzing "${datasetName}" (${rowCount} rows, ${columns.length} columns). I can answer questions about statistics, missing values, column types, and data distributions. What would you like to know?`;
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
