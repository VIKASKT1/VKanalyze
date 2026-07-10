import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Loader2, RefreshCw, Clock, ChevronRight, AlertCircle, TrendingUp, Lightbulb, AlertTriangle } from 'lucide-react';
import { generateDataStory } from '../../lib/ai';
import { usePrivacy } from '../../lib/PrivacyContext';
import LocalOnlyNotice from '../LocalOnlyNotice';
import { getAICache, setAICache, datasetFingerprint, formatCacheAge } from '../../lib/ai-cache';
import type { ColumnStats } from '../../lib/types';

interface Props {
  datasetName: string;
  columns: Array<{ name: string; type: string }>;
  statistics: Record<string, ColumnStats>;
  rowCount: number;
  qualityScore: number;
  rows: Record<string, unknown>[];
}

interface StoryData {
  summary: string;
  keyFindings: string[];
  risks: string[];
  opportunities: string[];
  recommendations: string[];
}

function parseStoryText(text: string): StoryData | null {
  try {
    const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned) as StoryData;
  } catch {
    return null;
  }
}

export default function AIStorytellingTab({
  datasetName, columns, statistics, rowCount, qualityScore,
}: Props) {
  const [story, setStory] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cacheInfo, setCacheInfo] = useState<{ generatedAt: string } | null>(null);
  const { ensureAIConsent, settings } = usePrivacy();

  const fingerprint = datasetFingerprint(rowCount, columns, qualityScore);

  useEffect(() => {
    let cancelled = false;
    async function loadCache() {
      setLoading(true);
      const cached = await getAICache<StoryData>('storytelling', datasetName, fingerprint);
      if (!cancelled) {
        if (cached) { setStory(cached.result); setCacheInfo({ generatedAt: cached.generatedAt }); }
        setLoading(false);
      }
    }
    loadCache();
    return () => { cancelled = true; };
  }, [datasetName, fingerprint]);

  const generate = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      if (!settings.localOnlyMode) await ensureAIConsent(datasetName);
      const { text, usedAI } = await generateDataStory(datasetName, columns, statistics, rowCount, qualityScore);
      const parsed = text ? parseStoryText(text) : null;
      const result: StoryData = parsed ?? {
        summary: `${datasetName} contains ${rowCount.toLocaleString()} rows and ${columns.length} columns with a quality score of ${qualityScore}/100.`,
        keyFindings: ['Dataset loaded and profiled successfully.'],
        risks: usedAI ? [] : ['AI unavailable — results are locally generated.'],
        opportunities: ['Explore the Charts and Analytics tabs for deeper analysis.'],
        recommendations: ['Use the Clean tab to improve data quality before analysis.'],
      };
      setStory(result);
      const now = new Date().toISOString();
      await setAICache('storytelling', datasetName, fingerprint, result);
      setCacheInfo({ generatedAt: now });
    } catch {
      setError('Failed to generate story. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [datasetName, columns, statistics, rowCount, qualityScore, settings.localOnlyMode, ensureAIConsent, fingerprint]);

  return (
    <div className="space-y-6">
      {settings.localOnlyMode && <LocalOnlyNotice feature="AI Storytelling" />}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-paper flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            AI Storytelling
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
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-paper rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {story ? 'Regenerate' : 'Generate Story'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && !story && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      )}

      {!story && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <p className="text-paper font-medium mb-1">Tell your data's story</p>
            <p className="text-paper-dim text-sm max-w-xs">
              AI generates an executive narrative — findings, risks, and recommendations in plain language.
            </p>
          </div>
        </div>
      )}

      {story && (
        <div className="space-y-5">
          <div className="p-5 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-2xl">
            <p className="text-paper leading-relaxed">{story.summary}</p>
          </div>

          {[
            { label: 'Key Findings', items: story.keyFindings, icon: TrendingUp, color: 'text-accent-bright', bg: 'bg-accent/10 border-accent/25' },
            { label: 'Opportunities', items: story.opportunities, icon: Lightbulb, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Risks', items: story.risks, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Recommendations', items: story.recommendations, icon: ChevronRight, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
          ].map(({ label, items, icon: Icon, color, bg }) =>
            (items ?? []).length > 0 ? (
              <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                <h4 className={`text-sm font-semibold ${color} flex items-center gap-2 mb-3`}>
                  <Icon className="w-4 h-4" />
                  {label}
                </h4>
                <ul className="space-y-1.5">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-paper/90">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
