import { useState, useEffect } from 'react';
import {
  Bell, Brain, Download, Monitor, Lock, Eye,
  Save, CheckCircle, ShieldOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { usePrivacy } from '../../lib/PrivacyContext';
import OverlayPageNav from '../OverlayPageNav';

interface Props {
  onNavigate: (page: string) => void;
  onBackToWorkspace?: () => void;
}

interface Prefs {
  ai_privacy_mode: 'strict' | 'enhanced';
  notifications_enabled: boolean;
  export_format: 'csv' | 'xlsx' | 'json';
  high_contrast: boolean;
  compact_mode: boolean;
}

const DEFAULT_PREFS: Prefs = {
  ai_privacy_mode: 'strict',
  notifications_enabled: true,
  export_format: 'csv',
  high_contrast: false,
  compact_mode: false,
};

export default function PlatformSettings({ onNavigate, onBackToWorkspace }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { settings: privacySettings, setLocalOnlyMode, setAiDataMode } = usePrivacy();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || privacySettings.localOnlyMode) { setLoading(false); return; }
      const { data } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle();
      if (data) setPrefs({ ...DEFAULT_PREFS, ...data });
      setLoading(false);
    });
  }, [privacySettings.localOnlyMode]);

  // The local IndexedDB store is the source of truth that lib/ai.ts actually
  // enforces — keep the UI in sync with it (it may differ from the cloud copy
  // if the user changed it on this device only, e.g. while offline).
  useEffect(() => {
    setPrefs(p => ({ ...p, ai_privacy_mode: privacySettings.aiDataMode }));
  }, [privacySettings.aiDataMode]);

  async function savePrefs() {
    setSaving(true);
    // This is the setting that's actually enforced — write it locally first.
    await setAiDataMode(prefs.ai_privacy_mode);
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !privacySettings.localOnlyMode) {
      await supabase.from('user_preferences').upsert({
        user_id: user.id,
        ...prefs,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function toggle<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs(p => ({ ...p, [key]: value }));
  }

  return (
    <div className="min-h-screen bg-ink text-paper">
      <OverlayPageNav title="Settings" onNavigate={onNavigate} onBackToWorkspace={onBackToWorkspace} />

      <main id="main-content" className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-2xl font-bold text-paper mb-8">Platform Settings</h1>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Local Only Mode — applies instantly, doesn't wait for Save */}
            <div className={`rounded-2xl p-6 border transition-colors ${
              privacySettings.localOnlyMode
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-ink-surface border-ink-border'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldOff className={`w-5 h-5 mt-0.5 flex-shrink-0 ${privacySettings.localOnlyMode ? 'text-emerald-400' : 'text-accent-bright'}`} />
                  <div>
                    <h3 className="text-base font-semibold text-paper">Local Only Mode</h3>
                    <p className="text-xs text-paper-dim mt-1 leading-relaxed max-w-md">
                      Hard switch: while on, VKAnalyze makes no Gemini AI requests and no Supabase
                      writes for any dataset — chat history, activity, and saved sessions stay in
                      this browser's IndexedDB only. Applies immediately, no other settings can override it.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setLocalOnlyMode(!privacySettings.localOnlyMode)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${privacySettings.localOnlyMode ? 'bg-emerald-600' : 'bg-ink-borderStrong'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${privacySettings.localOnlyMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {/* AI Privacy Mode */}
            <div className={`bg-ink-surface border border-ink-border rounded-2xl p-6 ${privacySettings.localOnlyMode ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-5 h-5 text-accent-bright" />
                <h3 className="text-base font-semibold text-paper">AI Privacy Mode</h3>
              </div>
              <div className="space-y-3">
                {[
                  {
                    id: 'strict' as const,
                    label: 'Strict Privacy Mode (Default)',
                    desc: 'Dataset never leaves your browser. AI receives only column statistics and metadata. Maximum privacy.',
                    badge: 'Recommended',
                    badgeColor: 'bg-emerald-500/20 text-emerald-300',
                    icon: Lock,
                  },
                  {
                    id: 'enhanced' as const,
                    label: 'Enhanced AI Analysis',
                    desc: 'AI may receive selected data samples for richer responses. You explicitly opt in — no data stored permanently.',
                    badge: 'Opt-in',
                    badgeColor: 'bg-amber-500/20 text-amber-300',
                    icon: Eye,
                  },
                ].map(({ id, label, desc, badge, badgeColor, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => toggle('ai_privacy_mode', id)}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                      prefs.ai_privacy_mode === id
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-ink-borderStrong bg-ink-raised/50 hover:border-ink-borderStrong'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${prefs.ai_privacy_mode === id ? 'text-accent-bright' : 'text-paper-dim'}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-paper">{label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
                      </div>
                      <p className="text-xs text-paper-dim mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${prefs.ai_privacy_mode === id ? 'border-accent bg-accent' : 'border-ink-borderStrong'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-ink-surface border border-ink-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-accent-bright" />
                <h3 className="text-base font-semibold text-paper">Notifications</h3>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-paper">Enable Notifications</div>
                  <div className="text-xs text-paper-dim mt-0.5">Receive in-app notifications for analysis completions and announcements</div>
                </div>
                <button
                  onClick={() => toggle('notifications_enabled', !prefs.notifications_enabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${prefs.notifications_enabled ? 'bg-accent' : 'bg-ink-borderStrong'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs.notifications_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Export format */}
            <div className="bg-ink-surface border border-ink-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-5 h-5 text-accent-bright" />
                <h3 className="text-base font-semibold text-paper">Default Export Format</h3>
              </div>
              <div className="flex gap-3">
                {(['csv', 'xlsx', 'json'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => toggle('export_format', fmt)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition border ${
                      prefs.export_format === fmt
                        ? 'bg-accent border-accent text-ink'
                        : 'bg-ink-raised border-ink-borderStrong text-paper-dim hover:border-ink-borderStrong'
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Accessibility */}
            <div className="bg-ink-surface border border-ink-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Monitor className="w-5 h-5 text-accent-bright" />
                <h3 className="text-base font-semibold text-paper">Accessibility</h3>
              </div>
              <div className="space-y-4">
                {[
                  { key: 'high_contrast' as const, label: 'High Contrast Mode', desc: 'Increase contrast for better readability' },
                  { key: 'compact_mode' as const, label: 'Compact Mode', desc: 'Reduce spacing for more information density' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-paper">{label}</div>
                      <div className="text-xs text-paper-dim mt-0.5">{desc}</div>
                    </div>
                    <button
                      onClick={() => toggle(key, !prefs[key])}
                      className={`relative w-11 h-6 rounded-full transition-colors ${prefs[key] ? 'bg-accent' : 'bg-ink-borderStrong'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Save */}
            {saved && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CheckCircle className="w-4 h-4" />
                Settings saved successfully!
              </div>
            )}
            <button
              onClick={savePrefs}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink font-semibold rounded-xl transition"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
