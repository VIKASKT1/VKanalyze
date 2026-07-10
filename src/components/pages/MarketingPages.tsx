/**
 * MarketingPages.tsx
 * Public marketing route pages: Features, Security.
 */
import type { ElementType } from 'react';
import {
  Shield, Zap, Users, ArrowRight, Lock, Brain, Table2, PenTool,
  FileText, Code, Layers, TrendingUp, CheckCircle2, Upload, ShieldCheck,
  GitCompare, BarChart2, Sparkles, Share2, ScatterChart, Boxes,
  MessageSquareWarning, ClipboardList, Server, KeyRound,
} from 'lucide-react';
import { PageShell, PageHero } from '../ui/PageShell';
import { Reveal, Stagger, StaggerItem } from '../ui/motion';

interface PageProps { onNavigate: (page: string) => void; onGetStarted?: () => void; }

function FeatureCard({ icon: Icon, title, desc, color = 'text-accent-bright', bg = 'bg-accent/10' }: { icon: ElementType; title: string; desc: string; color?: string; bg?: string }) {
  return (
    <StaggerItem className="p-5 bg-ink-surface border border-ink-border rounded-2xl hover:border-ink-borderStrong hover:-translate-y-0.5 transition-all duration-200">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-4`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <h3 className="text-paper font-semibold text-sm mb-1.5">{title}</h3>
      <p className="text-paper-dim text-xs leading-relaxed">{desc}</p>
    </StaggerItem>
  );
}

interface FeatureGroup {
  category: string;
  features: Array<{ icon: ElementType; title: string; desc: string; color?: string; bg?: string }>;
}

// Every group reflects capabilities that actually exist in the app today.
const FEATURE_GROUPS: FeatureGroup[] = [
  {
    category: 'Dataset upload',
    features: [
      { icon: Upload, title: 'CSV, TSV, Excel & JSON', desc: 'Upload .csv, .tsv, .xlsx, .xls, or .json files. Parsing happens instantly in your browser.', color: 'text-accent-bright', bg: 'bg-accent/10' },
      { icon: Table2, title: 'Data preview', desc: 'Paginated table with search, sort, column stats, and automatic type detection.', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    ],
  },
  {
    category: 'Profiling & quality',
    features: [
      { icon: ShieldCheck, title: 'Automatic profiling', desc: 'Column types, null counts, unique values, and distributions detected on upload.', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
      { icon: ClipboardList, title: 'Data quality score', desc: 'A live score that accounts for missing values and duplicates — recalculated after every cleaning step, across every file format.', color: 'text-rose-400', bg: 'bg-rose-500/10' },
      { icon: GitCompare, title: 'Missing value & duplicate detection', desc: 'Nulls, blanks, and exact-duplicate rows are surfaced automatically.', color: 'text-amber-400', bg: 'bg-amber-500/10' },
    ],
  },
  {
    category: 'Cleaning',
    features: [
      { icon: PenTool, title: 'Cleaning rules', desc: 'Fill or remove nulls, trim whitespace, fix casing, remove duplicates, convert types — with full preview and undo.', color: 'text-teal-400', bg: 'bg-teal-500/10' },
      { icon: Sparkles, title: 'AI cleaning suggestions', desc: 'Gemini-assisted recommendations for which cleaning rules fit your specific dataset.', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    ],
  },
  {
    category: 'Analysis',
    features: [
      { icon: Code, title: 'SQL workspace', desc: 'Real SQL queries against your dataset — SELECT, WHERE, GROUP BY, HAVING, ORDER BY, aggregates.', color: 'text-amber-400', bg: 'bg-amber-500/10' },
      { icon: Brain, title: 'AI SQL generation', desc: 'Describe what you want in plain English; Gemini writes the query, with a local fallback when AI is unavailable.', color: 'text-purple-400', bg: 'bg-purple-500/10' },
      { icon: ScatterChart, title: 'Correlation analysis', desc: 'Pearson correlation matrix and scatter plots across numeric columns.', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
      { icon: TrendingUp, title: 'Forecasting', desc: 'Time-series grouping with linear regression forecasting.', color: 'text-sky-400', bg: 'bg-sky-500/10' },
      { icon: Boxes, title: 'Clustering & outliers', desc: 'Z-score and IQR outlier detection, plus statistical distribution views.', color: 'text-lime-400', bg: 'bg-lime-500/10' },
    ],
  },
  {
    category: 'Visualization & dashboards',
    features: [
      { icon: BarChart2, title: 'Interactive charts', desc: 'Bar, line, area, pie, scatter, and histogram — fullscreen, export, zoom, pan.', color: 'text-accent-bright', bg: 'bg-accent/10' },
      { icon: Layers, title: 'Dashboard builder', desc: 'Drag-and-drop widgets, undo/redo, and autosave.', color: 'text-signal', bg: 'bg-signal/10' },
      { icon: Share2, title: 'Shared dashboards', desc: 'Publish a public link. Charts render from an aggregated, privacy-safe snapshot — never your raw dataset, unless you explicitly opt in to including a preview.', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    ],
  },
  {
    category: 'AI insights',
    features: [
      { icon: Brain, title: 'AI insights', desc: 'Gemini-powered analysis of your dataset, auto-cached so it never re-calls when you switch tabs.', color: 'text-purple-400', bg: 'bg-purple-500/10' },
      { icon: FileText, title: 'Export', desc: 'Professional 5-page PDF reports, cleaned CSV downloads, and PNG/SVG chart exports.', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    ],
  },
  {
    category: 'Privacy & security',
    features: [
      { icon: Shield, title: 'Local processing', desc: 'Raw file data is parsed and stays in your browser by default — never uploaded to a server.', color: 'text-signal', bg: 'bg-signal/10' },
      { icon: Lock, title: 'Local Only Mode', desc: 'Guarantees zero cloud calls and zero AI quota usage for a dataset, with a diagnostics panel to prove it.', color: 'text-signal', bg: 'bg-signal/10' },
    ],
  },
  {
    category: 'Enterprise & administration',
    features: [
      { icon: Users, title: 'Admin dashboard', desc: 'Platform analytics, user management, and audit log exports for admins.', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
      { icon: MessageSquareWarning, title: 'Feedback management', desc: 'Ratings and written feedback with moderation tools in the admin panel.', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
      { icon: ClipboardList, title: 'Activity logs', desc: 'A full history of actions taken on each dataset, viewable and clearable from the Privacy Dashboard.', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    ],
  },
];

export function FeaturesPage({ onNavigate, onGetStarted }: PageProps) {
  return (
    <PageShell currentPage="features" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Platform"
        icon={<Zap className="w-8 h-8 text-accent-bright" />}
        title="Everything you need, nothing you don't"
        description="From data upload to AI-powered insights — every tool VKAnalyze actually ships, organized the way you'd reach for it."
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 space-y-14">
        {FEATURE_GROUPS.map(group => (
          <div key={group.category}>
            <Reveal>
              <h2 className="text-xs font-mono uppercase tracking-[0.14em] text-accent-bright/80 mb-5">{group.category}</h2>
            </Reveal>
            <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.features.map(f => <FeatureCard key={f.title} {...f} />)}
            </Stagger>
          </div>
        ))}
      </div>

      <div className="text-center pb-24">
        <button onClick={() => onNavigate('auth')} className="inline-flex items-center gap-2 px-6 py-3 bg-paper hover:bg-white text-ink rounded-xl font-semibold transition-colors">
          Start free <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </PageShell>
  );
}

const SECURITY_PRACTICES = [
  { icon: Shield, title: 'Local Only Mode', desc: 'Enable Local Only Mode to guarantee zero cloud calls, zero AI quota usage, and zero data uploads. A diagnostics panel proves every check.' },
  { icon: Lock, title: 'Encryption', desc: 'All data in transit is encrypted via TLS 1.3. Supabase handles database encryption at rest using AES-256.' },
  { icon: Users, title: 'Row-level security', desc: 'Supabase RLS ensures users can only access their own data. Admins have strictly scoped permissions.' },
  { icon: Brain, title: 'AI consent controls', desc: 'AI features require explicit consent per dataset. You control exactly what data is sent to Gemini — or disable AI entirely.' },
  { icon: FileText, title: 'Audit logs', desc: 'All admin actions, logins, and deletions are logged. Admins can export full audit history as CSV.' },
  { icon: Zap, title: 'OWASP best practices', desc: 'Input validation, XSS prevention, SQL injection prevention, CSV injection prevention, and prompt injection prevention throughout.' },
  { icon: Server, title: 'Aggregated dashboard sharing', desc: 'Shared dashboards publish aggregated chart data by default. Raw dataset rows are included only if you explicitly opt in.' },
  { icon: KeyRound, title: 'JWT authentication', desc: 'Supabase Auth issues industry-standard JWT tokens; passwords are bcrypt-hashed and never visible to us.' },
];

export function SecurityPage({ onNavigate, onGetStarted }: PageProps) {
  return (
    <PageShell currentPage="security" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Trust & security"
        icon={<Lock className="w-8 h-8 text-signal" />}
        title="Security first, always"
        description="VKAnalyze is built with privacy and security as core principles — not afterthoughts."
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">
        <Stagger className="grid sm:grid-cols-2 gap-5 mb-12">
          {SECURITY_PRACTICES.map(f => (
            <StaggerItem key={f.title} className="p-6 bg-ink-surface border border-ink-border rounded-2xl hover:border-ink-borderStrong transition-colors">
              <div className="w-10 h-10 rounded-xl bg-signal/10 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-signal" />
              </div>
              <h3 className="text-paper font-semibold mb-2">{f.title}</h3>
              <p className="text-paper-dim text-sm leading-relaxed">{f.desc}</p>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="p-8 bg-signal/10 border border-signal/20 rounded-2xl text-center">
          <CheckCircle2 className="w-8 h-8 text-signal mx-auto mb-3" />
          <h3 className="text-paper font-semibold text-lg mb-2">Have a security concern?</h3>
          <p className="text-paper-dim text-sm mb-4">We take security reports seriously. Contact us directly and we'll respond within 24 hours.</p>
          <button onClick={() => onNavigate('contact')} className="px-5 py-2.5 bg-signal hover:bg-signal-dim text-ink rounded-lg text-sm font-semibold transition-colors">
            Report a vulnerability
          </button>
        </Reveal>
      </div>
    </PageShell>
  );
}
