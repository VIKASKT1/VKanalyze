import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Loader2, AlertCircle, CheckCircle2, TrendingUp, Download,
  RefreshCw, Clock, Info,
} from 'lucide-react';
import { generateInsights } from '../../lib/ai';
import { createNotification } from '../../lib/supabase';
import { exportProfessionalPDF } from '../../lib/export';
import { usePrivacy } from '../../lib/PrivacyContext';
import LocalOnlyNotice from '../LocalOnlyNotice';
import {
  getAICache, setAICache, datasetFingerprint, formatCacheAge,
} from '../../lib/ai-cache';
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
  info: 'border-accent/40 bg-accent/10',
};
const SEVERITY_ICON_STYLES: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-accent-bright',
};

export default function InsightsTab({
  datasetName, columns, statistics, rowCount, qualityScore, rows,
}: Props) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<{ generatedAt: string } | null>(null);
  const { ensureAIConsent, settings } = usePrivacy();

  const fingerprint = datasetFingerprint(rowCount, columns, qualityScore);
  const datasetId = datasetName;

  // On mount: load from cache only — never auto-call Gemini
  useEffect(() => {
    let cancelled = false;
    async function loadFromCache() {
      setLoading(true);
      const cached = await getAICache<InsightsData>('insights', datasetId, fingerprint);
      if (!cancelled) {
        if (cached) {
          setData(cached.result);
          setCacheInfo({ generatedAt: cached.generatedAt });
        }
        setLoading(false);
      }
    }
    loadFromCache();
    return () => { cancelled = true; };
  }, [datasetId, fingerprint]);

  const generateFresh = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      if (!settings.localOnlyMode) await ensureAIConsent(datasetName);
      const result = await generateInsights(
        datasetName, columns, statistics, rowCount, qualityScore,
      ) as InsightsData;
      setData(result);
      setCacheInfo(null); // will be set after cache write
      const now = new Date().toISOString();
      await setAICache('insights', datasetId, fingerprint, result);
      setCacheInfo({ generatedAt: now });
      createNotification('AI Insights Ready', `Analysis complete for ${datasetName}`, 'success');
    } catch {
      setError('Failed to generate insights. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [datasetName, columns, statistics, rowCount, qualityScore, settings.localOnlyMode, ensureAIConsent, datasetId, fingerprint]);

  async function handleExportPDF() {
    setExporting(true);
    try {
      await exportProfessionalPDF({
        datasetName,
        columns,
        statistics,
        rows,
        qualityScore,
        insights: data?.insights,
      });
    } catch {
      setError('Export failed.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {settings.localOnlyMode && <LocalOnlyNotice feature="AI Insights" />}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-paper flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            AI Insights
          </h2>
          {cacheInfo && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-emerald-400" />
              <span className="text-xs text-emerald-400">
                Loaded from cache · Generated {formatCacheAge(cacheInfo.generatedAt)}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {data && (
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-2 px-3 py-1.5 bg-ink-raised hover:bg-ink-borderStrong border border-ink-borderStrong text-paper/90 rounded-lg text-sm transition disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export PDF
            </button>
          )}
          <button
            onClick={generateFresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-paper rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {data ? 'Regenerate' : 'Generate Insights'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <p className="text-paper-dim text-sm">Loading insights…</p>
        </div>
      )}

      {!data && !loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-purple-400" />
          </div>
          <div>
            <p className="text-paper font-medium mb-1">No insights yet</p>
            <p className="text-paper-dim text-sm max-w-xs">
              Click "Generate Insights" to analyse your dataset with AI.
              Results are cached locally so switching tabs won't use any quota.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-accent/10 border border-accent/25 rounded-lg text-xs text-accent-bright">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            Switching tabs never consumes AI quota
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Summary */}
          {data.summary && (
            <div className="p-4 bg-ink-raised/50 border border-ink-borderStrong rounded-xl">
              <p className="text-sm text-paper/90 leading-relaxed">{data.summary}</p>
            </div>
          )}

          {/* Insights */}
          {(data.insights ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-paper-dim uppercase tracking-wide mb-3">
                Findings
              </h3>
              <div className="space-y-3">
                {data.insights.map((insight, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-xl border ${SEVERITY_STYLES[insight.severity ?? 'info'] ?? SEVERITY_STYLES.info}`}
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${SEVERITY_ICON_STYLES[insight.severity ?? 'info'] ?? ''}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-paper mb-0.5">{insight.title}</p>
                        <p className="text-sm text-paper/90">{insight.description}</p>
                        {insight.recommendation && (
                          <p className="mt-2 text-xs text-paper-dim italic">
                            💡 {insight.recommendation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {(data.recommendations ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-paper-dim uppercase tracking-wide mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Recommendations
              </h3>
              <ul className="space-y-2">
                {data.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-paper/90">
                    <span className="mt-1 w-5 h-5 rounded-full bg-accent/15 text-accent-bright flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
