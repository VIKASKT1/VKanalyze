import { Lock } from 'lucide-react';

export default function LocalOnlyNotice({ feature }: { feature: string }) {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 mb-4">
      <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>
        Local Only Mode is on — {feature} runs entirely on-device with no Gemini request.
        Results are computed locally and will be more limited than full AI analysis.
      </span>
    </div>
  );
}
