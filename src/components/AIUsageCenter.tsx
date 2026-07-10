/**
 * AI Usage Center — shows per-feature request counts and remaining quota
 * for the current browser session. Reads from the in-memory rate limiter
 * (no server round-trip required, resets on page refresh).
 */

import { useState, useEffect } from 'react';
import { Brain, Zap, Clock, ShieldOff, CheckCircle2, RefreshCw } from 'lucide-react';
import { usePrivacy } from '../lib/PrivacyContext';
import { getAllRateLimitStatus } from '../lib/rate-limit';

export default function AIUsageCenter() {
  const { settings } = usePrivacy();
  const [statuses, setStatuses] = useState(() => getAllRateLimitStatus());

  // Refresh every 10 s so reset countdowns stay accurate
  useEffect(() => {
    const id = setInterval(() => setStatuses(getAllRateLimitStatus()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (settings.localOnlyMode) {
    return (
      <div className="p-4 bg-accent/10 border border-accent/25 rounded-xl">
        <div className="flex items-center gap-2 mb-1.5">
          <ShieldOff className="w-4 h-4 text-accent-bright" />
          <span className="text-sm font-semibold text-accent-bright">Local Only Mode Active</span>
        </div>
        <p className="text-xs text-paper-dim">AI features are fully disabled. Zero quota consumed this session.</p>
      </div>
    );
  }

  const totalUsed = statuses.reduce((s, x) => s + x.count, 0);
  const totalLimit = statuses.reduce((s, x) => s + x.limit, 0);
  const totalRemaining = statuses.reduce((s, x) => s + x.remaining, 0);

  const nextReset = statuses
    .map(x => x.resetAt)
    .filter((r): r is number => r !== null && r > Date.now())
    .sort((a, b) => a - b)[0] ?? null;

  function fmtMs(ms: number) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const usedPct = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Session quota bar */}
      <div className="p-4 bg-ink-raised/60 border border-ink-borderStrong rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-paper">Session AI Usage</span>
          </div>
          <span className="text-xs text-paper-dim">resets on page refresh</span>
        </div>
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-paper-dim">{totalUsed} requests used</span>
            <span className="text-paper-dim">{totalLimit} total</span>
          </div>
          <div className="h-2 bg-ink-raised rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                usedPct >= 90 ? 'bg-red-500' : usedPct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-sm font-bold text-emerald-400">{totalRemaining} remaining</span>
          </div>
          {nextReset !== null && (
            <div className="flex items-center gap-1 text-xs text-paper-dim">
              <Clock className="w-3 h-3" />
              Oldest window resets in {fmtMs(nextReset - Date.now())}
            </div>
          )}
        </div>
      </div>

      {/* Per-feature breakdown */}
      <div className="space-y-1.5">
        {statuses.map(({ feature, count, remaining }) => (
          <div key={feature} className="flex items-center gap-2 px-3 py-2 bg-ink-raised/40 rounded-lg">
            {count === 0
              ? <CheckCircle2 className="w-3.5 h-3.5 text-paper-dimmer flex-shrink-0" />
              : <RefreshCw className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            }
            <span className="text-xs text-paper-dim capitalize flex-1">{feature}</span>
            <span className={`text-xs font-medium ${count > 0 ? 'text-paper' : 'text-paper-dimmer'}`}>
              {count} used
            </span>
            <span className="text-xs text-paper-dim ml-1">/ {remaining} left</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-paper-dimmer text-center leading-relaxed">
        Switching tabs never consumes quota · Cached results load instantly
      </p>
    </div>
  );
}
