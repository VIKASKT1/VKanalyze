import { Fingerprint, Lock, Eye, KeyRound, Server, Activity, Brain, Database, Check } from 'lucide-react';
import { Reveal, Stagger, StaggerItem } from '../ui/motion';
import { SectionEyebrow } from '../ui/primitives';

const PRACTICES = [
  { icon: Fingerprint, title: 'Client-side parsing', desc: 'Files are parsed in your browser using JavaScript. Your raw data is never uploaded to a server.' },
  { icon: Lock, title: 'Row-level security', desc: 'All cloud-stored metadata is protected by PostgreSQL row-level security — you can only access your own data.' },
  { icon: Eye, title: 'No third-party sharing', desc: 'We never sell or transmit your data to third parties, and run zero analytics tracking on your files.' },
  { icon: KeyRound, title: 'Secure authentication', desc: 'Supabase Auth with JWT tokens and encrypted sessions. Password reset via verified email links.' },
  { icon: Server, title: 'Encrypted connections', desc: 'All traffic uses HTTPS. Server-side functions are authenticated and never expose service credentials.' },
  { icon: Activity, title: 'Audit trail', desc: 'Login history and activity logging, with full transparency on what is recorded and why.' },
];

const MODES = [
  { icon: Lock, title: 'Local Only Mode', items: ['Data never leaves your browser', 'No cloud uploads', 'No AI requests', 'Maximum privacy'] },
  { icon: Brain, title: 'AI Enhanced Mode', items: ['AI insights on request', 'AI storytelling', 'AI-assisted SQL generation', 'Explicit consent required per dataset'] },
];

export default function PrivacySection() {
  return (
    <>
      <section id="privacy" className="py-24 px-4 sm:px-6 border-t border-ink-border bg-ink-surface/40">
        <div className="max-w-5xl mx-auto">
          <Reveal className="max-w-2xl mb-14">
            <SectionEyebrow>Privacy-first architecture</SectionEyebrow>
            <h2 className="text-3xl sm:text-4xl font-semibold text-paper mb-4 tracking-tight">Your data stays yours</h2>
            <p className="text-paper-dim leading-relaxed">Privacy is a core design constraint here, not an afterthought.</p>
          </Reveal>
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PRACTICES.map(({ icon: Icon, title, desc }) => (
              <StaggerItem key={title} className="p-5 rounded-2xl bg-ink-surface border border-ink-border hover:border-signal/30 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-signal/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-signal" />
                </div>
                <h3 className="text-sm font-semibold text-paper mb-1.5">{title}</h3>
                <p className="text-xs text-paper-dim leading-relaxed">{desc}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl mb-14">
            <SectionEyebrow>Local-first by design</SectionEyebrow>
            <h2 className="text-3xl sm:text-4xl font-semibold text-paper mb-4 tracking-tight">Your data. Your rules.</h2>
            <p className="text-paper-dim leading-relaxed">Two operating modes, and you choose which applies to each dataset.</p>
          </Reveal>

          <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-14 max-w-3xl">
            {MODES.map(({ icon: Icon, title, items }) => (
              <StaggerItem key={title} className="p-6 rounded-2xl bg-ink-surface border border-ink-border hover:border-accent/30 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-accent-bright" />
                </div>
                <h3 className="text-base font-semibold text-paper mb-3">{title}</h3>
                <ul className="space-y-2">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs text-paper-dim">
                      <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="flex flex-wrap items-center gap-3">
            {[
              { icon: Lock, label: 'Local Only available on every dataset' },
              { icon: Brain, label: 'AI requires explicit consent' },
              { icon: Database, label: 'Dashboards stored under row-level security' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ink-border bg-ink-raised text-xs font-medium text-paper-dim">
                <Icon className="w-3.5 h-3.5 text-accent" />
                {label}
              </div>
            ))}
          </Reveal>
        </div>
      </section>
    </>
  );
}
