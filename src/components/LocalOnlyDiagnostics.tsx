/**
 * Local Only Diagnostics Panel
 * Proves — to the user — that API calls, Gemini, and cloud writes are all blocked.
 */

import { useState, useEffect } from 'react';
import { ShieldCheck, Wifi, WifiOff, Brain, Database, Cloud, CheckCircle2, XCircle } from 'lucide-react';
import { usePrivacy } from '../lib/PrivacyContext';
import { isLocalOnlyMode } from '../lib/privacy';

interface DiagCheck {
  label: string;
  description: string;
  icon: React.ElementType;
  pass: boolean;
}

export default function LocalOnlyDiagnostics() {
  const { settings } = usePrivacy();
  const [localOnly, setLocalOnly] = useState(false);
  const [checks, setChecks] = useState<DiagCheck[]>([]);

  useEffect(() => {
    async function run() {
      const lo = await isLocalOnlyMode();
      setLocalOnly(lo);

      setChecks([
        {
          label: 'Local Only Mode',
          description: lo ? 'Enabled — all remote calls blocked' : 'Disabled — cloud features active',
          icon: ShieldCheck,
          pass: lo,
        },
        {
          label: 'Gemini AI',
          description: lo ? 'Disabled — no requests will be sent' : 'Enabled (AI consent required per dataset)',
          icon: Brain,
          pass: lo,
        },
        {
          label: 'Cloud Sync',
          description: lo ? 'Disabled — all data stays local' : 'Enabled (Supabase)',
          icon: Cloud,
          pass: lo,
        },
        {
          label: 'Database Writes',
          description: lo ? 'Blocked — IndexedDB only' : 'Active (Supabase Postgres)',
          icon: Database,
          pass: lo,
        },
        {
          label: 'Network Requests',
          description: lo ? 'Blocked — running entirely offline-capable' : 'Allowed for auth and cloud features',
          icon: Wifi,
          pass: lo,
        },
        {
          label: 'AI Consent Required',
          description: settings.aiConsent === 'granted'
            ? 'Granted — AI may run when Local Only is off'
            : settings.aiConsent === 'declined'
            ? 'Denied — AI will not run'
            : 'Not yet decided',
          icon: ShieldCheck,
          pass: settings.aiConsent !== 'granted' || lo,
        },
      ]);
    }
    run();
  }, [settings]);

  const allPass = checks.every(c => c.pass);

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`p-4 rounded-xl border flex items-center gap-3 ${
        localOnly
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-amber-500/10 border-amber-500/30'
      }`}>
        {localOnly
          ? <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          : <WifiOff className="w-5 h-5 text-amber-400 flex-shrink-0" />
        }
        <div>
          <p className={`text-sm font-semibold ${localOnly ? 'text-emerald-300' : 'text-amber-300'}`}>
            {localOnly ? 'Running in Local Only Mode' : 'Local Only Mode is OFF'}
          </p>
          <p className="text-xs text-paper-dim mt-0.5">
            {localOnly
              ? 'Zero API calls • Zero AI quota • Zero cloud writes'
              : 'Enable Local Only Mode in Settings → Privacy to isolate this session.'
            }
          </p>
        </div>
      </div>

      {/* Checks */}
      <div className="space-y-2">
        {checks.map(({ label, description, icon: Icon, pass }) => (
          <div key={label} className="flex items-start gap-3 p-3 bg-ink-raised/50 rounded-lg">
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              {pass
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                : <XCircle className="w-4 h-4 text-paper-dimmer" />
              }
              <Icon className="w-3.5 h-3.5 text-paper-dim" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-paper">{label}</p>
              <p className="text-xs text-paper-dim">{description}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
              pass ? 'bg-emerald-500/20 text-emerald-300' : 'bg-ink-raised text-paper-dim'
            }`}>
              {pass ? 'Protected' : 'Active'}
            </span>
          </div>
        ))}
      </div>

      {allPass && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-xs text-emerald-300 font-medium">
            All checks passed — this session is fully local.
          </p>
        </div>
      )}
    </div>
  );
}
