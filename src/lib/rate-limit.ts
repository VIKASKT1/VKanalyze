// In-memory rate limiter (per browser session)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Returns the current usage for each key that has been tracked this session.
 * Used by AIUsageCenter to display quota status without needing localStorage.
 */
export function getRateLimitStatus(key: string): {
  count: number;
  resetAt: number | null;
  remaining: number;
  limit: number;
} {
  // Default limits per feature
  const LIMITS: Record<string, number> = {
    chat: 20,
    insights: 10,
    storytelling: 5,
    recommendations: 10,
    sql: 15,
    cleaning: 10,
    narration: 5,
  };
  const limit = LIMITS[key] ?? 20;
  const entry = store.get(key);
  const now = Date.now();
  if (!entry || now > entry.resetAt) {
    return { count: 0, resetAt: null, remaining: limit, limit };
  }
  return {
    count: entry.count,
    resetAt: entry.resetAt,
    remaining: Math.max(0, limit - entry.count),
    limit,
  };
}

export function getAllRateLimitStatus(): Array<{
  feature: string;
  count: number;
  resetAt: number | null;
  remaining: number;
  limit: number;
}> {
  const features = ['chat', 'insights', 'storytelling', 'recommendations', 'sql', 'cleaning', 'narration'];
  return features.map(f => ({ feature: f, ...getRateLimitStatus(f) }));
}
