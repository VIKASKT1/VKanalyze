import { Shield, Lock, Eye, Database, Brain, CheckCircle, Globe, Server, Key } from 'lucide-react';
import OverlayPageNav from '../OverlayPageNav';
import SiteNav from '../ui/SiteNav';
import SkipLink from '../ui/SkipLink';
import SiteFooter from '../ui/SiteFooter';
import { Reveal, Stagger, StaggerItem } from '../ui/motion';
import { GradientMesh } from '../ui/primitives';

interface Props {
  onNavigate: (page: string) => void;
  onBackToWorkspace?: () => void;
  onGetStarted?: () => void;
}

const PRACTICES = [
  {
    category: 'Data Privacy',
    icon: Shield,
    color: 'text-signal',
    bg: 'bg-signal/10',
    border: 'border-signal/20',
    items: [
      { title: 'Files Never Uploaded', desc: 'CSV, Excel, and JSON files are parsed entirely in your browser using JavaScript. Raw file data never reaches our servers.' },
      { title: 'No Permanent Dataset Storage', desc: 'Dataset rows, values, and contents are never written to any database. Only metadata (column names, row counts, statistics) may be saved as session info.' },
      { title: 'AI Privacy Modes', desc: 'In Strict mode (default), AI receives only statistics. In Enhanced mode (opt-in), selected samples may be sent to Gemini AI for richer analysis.' },
      { title: 'Browser-Local Processing', desc: 'All data cleaning, pivot tables, SQL queries, outlier detection, and correlation analysis run in your browser — no server computation needed.' },
    ],
  },
  {
    category: 'Account Security',
    icon: Lock,
    color: 'text-accent-bright',
    bg: 'bg-accent/10',
    border: 'border-accent/25',
    items: [
      { title: 'Supabase Authentication', desc: 'Account authentication uses Supabase Auth with industry-standard JWT tokens. Passwords are bcrypt-hashed — we never see your plain-text password.' },
      { title: 'Row Level Security (RLS)', desc: 'Every database table has RLS enabled. PostgreSQL policies ensure your data is completely isolated from other users at the database level.' },
      { title: 'HTTPS Everywhere', desc: 'All communications between your browser and our services are encrypted using TLS/HTTPS. No plain-text transmission.' },
      { title: 'Session Expiry', desc: 'Authentication sessions expire automatically. You can sign out at any time, which invalidates your session token immediately.' },
    ],
  },
  {
    category: 'AI & Data Handling',
    icon: Brain,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    items: [
      { title: 'Gemini API Privacy', desc: 'AI requests are proxied through a Supabase Edge Function. Dataset statistics and metadata (not raw rows) are sent in Strict Mode. Google\'s Privacy Policy governs Gemini API data.' },
      { title: 'No AI Training on Your Data', desc: 'Your dataset contents are not used to train any AI model. The Gemini API is used for inference only, with no persistent storage of your data on Google\'s end.' },
      { title: 'Audit Trail', desc: 'An activity log records your actions within the application for your own reference. You can clear this log at any time from the Privacy Dashboard.' },
    ],
  },
  {
    category: 'Compliance & Transparency',
    icon: Globe,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    items: [
      { title: 'Open Source Codebase', desc: 'VKAnalyze is built on open-source technologies. The implementation is transparent and available for review on GitHub.' },
      { title: 'No Third-Party Tracking', desc: 'No analytics, advertising, or tracking scripts are loaded. No Google Analytics, Facebook Pixel, or similar tools.' },
      { title: 'Your Data, Your Control', desc: 'You can delete individual sessions, clear activity logs, or delete your entire account from the Privacy Dashboard at any time.' },
      { title: 'GDPR-Aligned Practices', desc: 'Data minimization, purpose limitation, and user rights are core to our architecture — not an afterthought.' },
    ],
  },
];

export default function TrustCenter({ onNavigate, onBackToWorkspace, onGetStarted }: Props) {
  // Trust Center is dual-purpose: an authenticated overlay reached from
  // within the app (onBackToWorkspace provided — keep the existing
  // back-to-workspace breadcrumb nav, unchanged) and, since the fix for the
  // public-navigation bug, a standalone public page reached straight from
  // SiteNav's "More" menu while logged out. The public route needs the same
  // shared SiteNav (and its "Get Started" CTA) every other public page uses,
  // not the internal back-button nav.
  const isPublicRoute = !onBackToWorkspace;
  return (
    <div className="min-h-screen bg-ink text-paper">
      {isPublicRoute ? (
        <>
          <SkipLink />
          <SiteNav onNavigate={onNavigate} onGetStarted={onGetStarted} currentPage="trust" />
        </>
      ) : (
        <OverlayPageNav title="Trust Center" onNavigate={onNavigate} onBackToWorkspace={onBackToWorkspace} />
      )}

      <main id="main-content" className="relative overflow-hidden">
        <GradientMesh />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-24 relative">
          <Reveal className="text-center mb-14">
            <div className="w-16 h-16 rounded-2xl bg-signal/10 border border-signal/20 flex items-center justify-center mx-auto mb-5">
              <Shield className="w-8 h-8 text-signal" />
            </div>
            <h1 className="text-4xl font-semibold text-paper mb-3 tracking-tight">Trust & security center</h1>
            <p className="text-paper-dim text-lg max-w-2xl mx-auto leading-relaxed">
              Understand exactly how VKAnalyze handles your data, secures your account, and protects your privacy.
            </p>
          </Reveal>

          <Stagger className="flex flex-wrap gap-2.5 justify-center mb-14">
            {[
              { icon: Lock, label: 'Files never stored' },
              { icon: Shield, label: 'Row Level Security' },
              { icon: Globe, label: 'HTTPS encrypted' },
              { icon: Eye, label: 'No tracking' },
              { icon: Brain, label: 'AI privacy modes' },
              { icon: Database, label: 'Data minimization' },
              { icon: Key, label: 'JWT authentication' },
              { icon: CheckCircle, label: 'Open source' },
            ].map(({ icon: Icon, label }) => (
              <StaggerItem key={label} as="span" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink-raised/80 border border-ink-borderStrong/50 text-xs text-paper/90">
                <Icon className="w-3.5 h-3.5 text-signal" />
                {label}
              </StaggerItem>
            ))}
          </Stagger>

          <div className="space-y-10">
            {PRACTICES.map(({ category, icon: Icon, color, bg, border, items }) => (
              <Reveal key={category}>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${bg} ${border} mb-5`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className={`text-sm font-semibold ${color}`}>{category}</span>
                </div>
                <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {items.map(item => (
                    <StaggerItem key={item.title} className={`p-5 bg-ink-surface border ${border} rounded-xl hover:bg-ink-raised/30 transition-colors`}>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className={`w-4 h-4 ${color} flex-shrink-0`} />
                        <span className="text-sm font-semibold text-paper">{item.title}</span>
                      </div>
                      <p className="text-xs text-paper-dim leading-relaxed">{item.desc}</p>
                    </StaggerItem>
                  ))}
                </Stagger>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-12 bg-ink-surface border border-ink-border rounded-2xl p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-paper mb-5 flex items-center gap-2">
              <Server className="w-5 h-5 text-accent-bright" />
              Security infrastructure
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Database', value: 'Supabase (PostgreSQL)', detail: 'RLS on every table' },
                { label: 'Authentication', value: 'Supabase Auth', detail: 'JWT + bcrypt passwords' },
                { label: 'AI Proxy', value: 'Deno Edge Functions', detail: 'No raw data forwarding' },
                { label: 'File Processing', value: 'Browser JavaScript', detail: 'PapaParse + XLSX.js' },
                { label: 'Hosting', value: 'Netlify / Vercel', detail: 'HTTPS by default' },
                { label: 'Transport', value: 'TLS 1.3', detail: 'All connections encrypted' },
              ].map(({ label, value, detail }) => (
                <div key={label} className="p-3 bg-ink-raised/50 rounded-xl">
                  <div className="text-xs text-paper-dim mb-0.5">{label}</div>
                  <div className="text-sm font-medium text-paper">{value}</div>
                  <div className="text-xs text-paper-dim">{detail}</div>
                </div>
              ))}
            </div>
          </Reveal>

          <div className="mt-8 text-center">
            <p className="text-paper-dim text-sm mb-4">Questions about privacy or security?</p>
            <button onClick={() => onNavigate('contact')} className="px-6 py-2.5 bg-accent hover:bg-accent-bright text-ink text-sm font-semibold rounded-xl transition-colors">
              Contact us
            </button>
          </div>
        </div>
      </main>
      {isPublicRoute && <SiteFooter onNavigate={onNavigate} />}
    </div>
  );
}
