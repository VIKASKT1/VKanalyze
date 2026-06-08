import type { ColumnStats } from './types';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

async function callGemini(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key');

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function buildContext(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  qualityScore: number,
  rows: Record<string, unknown>[] = []
): string {
  const colStats = columns.slice(0, 15).map(col => {
    const s = statistics[col.name];
    if (!s) return `${col.name} (${col.type})`;
    if (col.type === 'number') {
      return `${col.name}: min=${s.min}, max=${s.max}, mean=${s.mean?.toFixed(2)}, nulls=${s.nullCount}`;
    }
    return `${col.name} (text): ${s.uniqueCount} unique, ${s.nullCount} nulls`;
  }).join('\n');

  const sample = rows.slice(0, 5);

  return `Dataset: "${datasetName}"
Rows: ${rowCount.toLocaleString()} | Columns: ${columns.length} | Quality: ${qualityScore}/100

COLUMN STATISTICS:
${colStats}

SAMPLE DATA (5 rows):
${JSON.stringify(sample, null, 2)}`;
}

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

  for (const col of textCols.slice(0, 5)) {
    const s = statistics[col.name];
    if (s && s.uniqueCount / rowCount > 0.9 && rowCount > 100) {
      insights.push({
        title: `High Cardinality: ${col.name}`,
        description: `Column "${col.name}" has ${s.uniqueCount} unique values (${Math.round((s.uniqueCount / rowCount) * 100)}% of rows).`,
        severity: 'info',
        recommendation: 'Consider excluding this column from aggregation analyses.',
      });
    }
  }

  if (numericCols.length > 0) recommendations.push(`Visualize distribution of ${numericCols[0]?.name} using the Histogram chart type.`);
  if (numericCols.length >= 2) recommendations.push(`Explore correlation between ${numericCols[0]?.name} and ${numericCols[1]?.name} using a Scatter chart.`);
  if (textCols.length > 0) recommendations.push(`Group data by ${textCols[0]?.name} to find patterns using a Bar chart.`);
  recommendations.push('Export a PDF report to share findings with stakeholders.');

  return {
    insights,
    recommendations,
    summary: `Dataset analyzed: ${rowCount} rows, ${columns.length} columns, quality score ${qualityScore}/100.`,
  };
}

export async function generateInsights(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  qualityScore: number
): Promise<object> {
  try {
    const ctx = buildContext(datasetName, columns, statistics, rowCount, qualityScore);

    const prompt = `You are a senior data analyst. Analyze this dataset and respond ONLY with valid JSON — no markdown, no backticks.

${ctx}

Return this exact JSON structure:
{
  "insights": [
    {
      "title": "short title",
      "description": "detailed description with specific numbers",
      "severity": "info|warning|critical",
      "recommendation": "actionable advice"
    }
  ],
  "recommendations": ["rec 1", "rec 2", "rec 3"],
  "summary": "2-3 sentence executive summary with specific findings"
}

Generate at least 4 insights covering: data quality, distributions, outliers, patterns, missing values.`;

    const text = await callGemini(prompt);
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
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
    const ctx = buildContext(datasetName, columns, statistics, rowCount, qualityScore, rows);

    const historyStr = history.slice(-6)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = `You are an expert data analyst. Answer using the dataset below.

${ctx}

RECENT CONVERSATION:
${historyStr}

USER QUESTION: ${question}

Answer concisely using actual data and statistics. Use bullet points for lists. Reference specific numbers.`;

    const text = await callGemini(prompt);
    return text || 'I could not generate a response. Please try again.';
  } catch {
    return localFallbackChat(datasetName, columns, statistics, rowCount, qualityScore, question, rows);
  }
}

function localFallbackChat(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rowCount: number,
  qualityScore: number,
  message: string,
  rows: Record<string, unknown>[] = []
): string {
  const lower = message.toLowerCase();

  if (lower.includes('summar')) {
    const numCols = Object.entries(statistics).filter(([, s]) => s.mean !== undefined);
    const textCols = columns.filter(c => c.type === 'string');
    return `Dataset "${datasetName}" Summary:
• ${rowCount.toLocaleString()} rows, ${columns.length} columns
• Quality score: ${qualityScore}/100
• Numeric columns: ${numCols.map(([col, s]) => `${col} (mean: ${s.mean})`).join(', ')}
• Text columns: ${textCols.map(c => c.name).join(', ')}
• Missing values: ${Object.entries(statistics).filter(([, s]) => s.nullCount > 0).map(([col, s]) => `${col}: ${s.nullCount}`).join(', ') || 'None'}`;
  }

  if (lower.includes('name') && (lower.includes('dataset') || lower.includes('file'))) {
    return `The dataset name is "${datasetName}".`;
  }

  if (lower.includes('how many') && lower.includes('row')) {
    return `The dataset "${datasetName}" contains ${rowCount.toLocaleString()} rows.`;
  }

  if (lower.includes('how many') && lower.includes('column')) {
    return `The dataset has ${columns.length} columns: ${columns.map(c => c.name).join(', ')}.`;
  }

  if (lower.includes('quality')) {
    return `The data quality score is ${qualityScore}/100.`;
  }

  if (lower.includes('null') || lower.includes('missing')) {
    const nullCols = Object.entries(statistics)
      .filter(([, s]) => s.nullCount > 0)
      .map(([col, s]) => `${col}: ${s.nullCount} nulls`);
    if (nullCols.length === 0) return 'No missing values detected in this dataset!';
    return `Found missing values in ${nullCols.length} column(s):\n${nullCols.join('\n')}`;
  }

  if (lower.includes('mean') || lower.includes('average')) {
    const numCols = Object.entries(statistics)
      .filter(([, s]) => s.mean !== undefined)
      .slice(0, 5)
      .map(([col, s]) => `${col}: ${s.mean}`);
    return numCols.length > 0 ? `Column means:\n${numCols.join('\n')}` : 'No numeric columns found.';
  }

  if (lower.includes('max') || lower.includes('maximum') || lower.includes('highest')) {
    const numCols = Object.entries(statistics)
      .filter(([, s]) => s.max !== undefined)
      .slice(0, 5)
      .map(([col, s]) => `${col}: ${s.max}`);
    return numCols.length > 0 ? `Maximum values:\n${numCols.join('\n')}` : 'No numeric columns found.';
  }

  if (lower.includes('min') || lower.includes('minimum') || lower.includes('lowest')) {
    const numCols = Object.entries(statistics)
      .filter(([, s]) => s.min !== undefined)
      .slice(0, 5)
      .map(([col, s]) => `${col}: ${s.min}`);
    return numCols.length > 0 ? `Minimum values:\n${numCols.join('\n')}` : 'No numeric columns found.';
  }

  if (lower.includes('total') || lower.includes('sum')) {
    const numCol = columns.find(c => c.type === 'number');
    if (numCol && rows.length > 0) {
      const total = rows.reduce((sum, row) => {
        const n = parseFloat(String(row[numCol.name]).replace(/[^0-9.-]/g, ''));
        return sum + (isNaN(n) ? 0 : n);
      }, 0);
      return `Total ${numCol.name}: ${total.toLocaleString()}`;
    }
  }

  if (lower.includes('column')) {
    return `The dataset has ${columns.length} columns: ${columns.map(c => c.name).join(', ')}.`;
  }

  return `I'm analyzing "${datasetName}" (${rowCount.toLocaleString()} rows, ${columns.length} columns, quality ${qualityScore}/100). Ask me about statistics, patterns, missing values, totals, or comparisons.`;
}

export function getChartRecommendations(columns: Array<{ name: string; type: string }>): string[] {
  const numericCols = columns.filter(c => c.type === 'number').map(c => c.name);
  const textCols = columns.filter(c => c.type === 'string').map(c => c.name);
  const recs: string[] = [];

  if (numericCols.length >= 1) recs.push(`Histogram: distribution of "${numericCols[0]}"`);
  if (numericCols.length >= 2) recs.push(`Scatter: "${numericCols[0]}" vs "${numericCols[1]}"`);
  if (textCols.length >= 1 && numericCols.length >= 1) recs.push(`Bar chart: "${numericCols[0]}" by "${textCols[0]}"`);
  if (textCols.length >= 1) recs.push(`Pie chart: distribution of "${textCols[0]}"`);
  if (numericCols.length >= 1) recs.push(`Line chart: trend of "${numericCols[0]}"`);

  return recs;
}