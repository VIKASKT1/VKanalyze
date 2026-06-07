import { useState, useEffect } from 'react';
import { Sparkles, Loader2, AlertCircle, CheckCircle2, TrendingUp, Download } from 'lucide-react';
import { generateInsights } from '../../lib/ai';
import { checkRateLimit } from '../../lib/rate-limit';
import { exportToPDF } from '../../lib/export';
import type { ColumnStats, InsightItem } from '../../lib/types';

interface Props {
  datasetName: string;
  columns: Array<{ name: string; type: string }>;
  statistics: Record<string, ColumnStats>;
  rowCount: number;
  qualityScore: number;
  rows: Record<string, unknown>[];
}

interface InsightsData {
  insights: InsightItem[];
  recommendations: string[];
  summary: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  info: 'border-blue-500/40 bg-blue-500/10',
};

const SEVERITY_ICON_STYLES: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
};

export default function InsightsTab({ datasetName, columns, statistics, rowCount, qualityScore, rows }: Props) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  async function loadInsights() {
    const { allowed, retryAfter } = checkRateLimit('insights', 5, 60_000);
    if (!allowed) {
      setError(`Rate limit reached. Try again in ${retryAfter}s.`);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result = await generateInsights(datasetName, columns, statistics, rowCount, qualityScore) as InsightsData;
      setData(result);
    } catch {
      setError('Failed to generate insights. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInsights();
  }, []);

  async function handleExportPDF() {
    setExporting(true);
    try {
      await exportToPDF(datasetName, columns, statistics, rows, qualityScore);
    } catch {
      setError('PDF export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
        <p className="text-slate-400">Analyzing your dataset with AI…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-200">AI-Powered Insights</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadInsights}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition"
          >
            <Sparkles className="w-4 h-4" /> Regenerate
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm transition"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Summary */}
          {data.summary && (
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm leading-relaxed">
              {data.summary}
            </div>
          )}

          {/* Insights */}
          {data.insights && data.insights.length > 0 && (
            <div className="space-y-3">
              {data.insights.map((insight, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl border ${SEVERITY_STYLES[insight.severity ?? 'info'] ?? SEVERITY_STYLES.info}`}
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${SEVERITY_ICON_STYLES[insight.severity ?? 'info']}`} />
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{insight.title}</p>
                      <p className="text-sm text-slate-400 mt-1">{insight.description}</p>
                      {insight.recommendation && (
                        <p className="text-xs text-slate-500 mt-2 italic">
                          Recommendation: {insight.recommendation}
                        </p>
                      )}
                    </div>
                    {insight.severity && (
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        insight.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        insight.severity === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {insight.severity}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations && data.recommendations.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-semibold text-slate-200">Next Steps</h4>
              </div>
              <ul className="space-y-2">
                {data.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-emerald-400 font-bold mt-0.5">{i + 1}.</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
