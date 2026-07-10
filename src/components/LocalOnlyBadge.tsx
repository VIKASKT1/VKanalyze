import { Lock } from 'lucide-react';
import { usePrivacy } from '../lib/PrivacyContext';

export default function LocalOnlyBadge() {
  const { settings, loading } = usePrivacy();
  if (loading || !settings.localOnlyMode) return null;

  return (
    <span
      title="Local Only Mode is on: no AI requests, no cloud sync. Everything stays in this browser."
      className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex-shrink-0"
    >
      <Lock className="w-3 h-3" />
      <span className="hidden sm:inline">LOCAL ONLY</span>
    </span>
  );
}
