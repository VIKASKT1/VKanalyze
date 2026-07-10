/**
 * AI Cache — IndexedDB-backed cache for all AI feature results.
 *
 * Cache key structure:  `{featureId}:{datasetId}:{fingerprint}`
 *
 * Rules:
 * - Tabs that mount AI content MUST load from cache first.
 * - Only call Gemini when user explicitly clicks "Regenerate".
 * - Cache never expires automatically (user-controlled via Regenerate).
 * - "Loaded from cache" + timestamp must be shown when cache is used.
 */

import { idbGet, idbSet, idbDelete, idbGetAllKeys, STORES } from './db';

export type AIFeature =
  | 'insights'
  | 'chat'
  | 'storytelling'
  | 'recommendations'
  | 'sql'
  | 'cleaning'
  | 'narration';

export interface AICacheEntry<T = unknown> {
  feature: AIFeature;
  datasetId: string;
  fingerprint: string;
  result: T;
  generatedAt: string; // ISO timestamp
  model: string;
}

/** Stable fingerprint from row count + column names + first-row hash */
export function datasetFingerprint(
  rowCount: number,
  columns: Array<{ name: string; type: string }>,
  qualityScore: number
): string {
  const seed = `${rowCount}|${qualityScore}|${columns.map(c => `${c.name}:${c.type}`).join(',')}`;
  // Simple djb2-style hash — no crypto needed, just needs to be stable
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(36);
}

function cacheKey(feature: AIFeature, datasetId: string, fingerprint: string): string {
  return `${feature}:${datasetId}:${fingerprint}`;
}

export async function getAICache<T>(
  feature: AIFeature,
  datasetId: string,
  fingerprint: string
): Promise<AICacheEntry<T> | null> {
  try {
    const key = cacheKey(feature, datasetId, fingerprint);
    const entry = await idbGet<AICacheEntry<T>>(STORES.CACHE, key);
    return entry ?? null;
  } catch {
    return null;
  }
}

export async function setAICache<T>(
  feature: AIFeature,
  datasetId: string,
  fingerprint: string,
  result: T,
  model = 'gemini'
): Promise<void> {
  try {
    const key = cacheKey(feature, datasetId, fingerprint);
    const entry: AICacheEntry<T> = {
      feature,
      datasetId,
      fingerprint,
      result,
      generatedAt: new Date().toISOString(),
      model,
    };
    await idbSet(STORES.CACHE, key, entry);
  } catch {
    // Cache failures are silent — never block the user
  }
}

export async function clearAICache(feature?: AIFeature, datasetId?: string): Promise<void> {
  try {
    const keys = await idbGetAllKeys(STORES.CACHE);
    for (const k of keys) {
      if (feature && !k.startsWith(feature)) continue;
      if (datasetId && !k.includes(`:${datasetId}:`)) continue;
      await idbDelete(STORES.CACHE, k);
    }
  } catch {
    // silent
  }
}

/** Human-readable "Generated X ago" string */
export function formatCacheAge(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
