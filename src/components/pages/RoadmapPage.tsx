import { CheckCircle2, Clock, Star, Milestone } from 'lucide-react';
import { PageShell, PageHero } from '../ui/PageShell';
import { Reveal, Stagger, StaggerItem } from '../ui/motion';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
}

const ROADMAP = [
  {
    status: 'completed',
    label: 'Completed',
    icon: CheckCircle2,
    color: 'text-signal',
    bg: 'bg-signal/10',
    border: 'border-signal/20',
    items: [
      { title: 'CSV, TSV, Excel & JSON upload', desc: 'Parse and analyze CSV, TSV, XLSX, and JSON files in the browser.' },
      { title: 'Column statistics & profiling', desc: 'Automatic type detection, null counts, unique values, mean, min, max.' },
      { title: 'Gemini AI Chat', desc: 'Ask questions about your dataset in plain English.' },
      { title: 'Interactive charts', desc: 'Bar, line, pie, scatter, and histogram charts with Recharts.' },
      { title: 'Data cleaning tools', desc: 'Remove duplicates, fill nulls, trim whitespace.' },
      { title: 'AI insights generation', desc: 'Automatic data quality insights and recommendations.' },
      { title: 'SQL analytics workspace', desc: 'Run SQL SELECT queries on your in-browser dataset.' },
      { title: 'Professional PDF export', desc: '5-page PDF reports with KPIs, stats, and AI insights.' },
      { title: 'Version history', desc: 'Save and restore dataset snapshots.' },
      { title: 'Pivot table module', desc: 'Group, aggregate, and pivot any dataset.' },
      { title: 'Advanced filters', desc: '9 operators including Between, Contains, and Date Range.' },
      { title: 'Correlation analysis', desc: 'Pearson correlation heatmap for numeric columns.' },
      { title: 'Outlier detection', desc: 'Z-Score and IQR outlier highlighting in scatter plots.' },
      { title: 'Trend analysis & forecasting', desc: 'Time-series grouping and linear regression forecast.' },
      { title: 'Dashboard builder & sharing', desc: 'Build, save, and share custom dashboard widgets with aggregated, privacy-safe data.' },
      { title: 'Activity log', desc: 'Full history of all actions taken on each dataset.' },
      { title: 'Multi-key Gemini failover', desc: 'Automatic fallback to backup API keys on quota errors.' },
      { title: 'SaaS platform pages', desc: 'About, Contact, FAQ, Roadmap, Feedback, and Support pages.' },
      { title: 'Admin dashboard', desc: 'Platform analytics and user management for admins.' },
    ],
  },
  {
    status: 'in_progress',
    label: 'In progress',
    icon: Clock,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    items: [
      { title: 'Performance optimization', desc: 'Code splitting, lazy loading, and bundle size reduction.' },
      { title: 'Mobile responsiveness improvements', desc: 'Better touch controls and mobile layout for all tabs.' },
      { title: 'SEO enhancements', desc: 'Meta tags, Open Graph, Twitter Cards, and structured data.' },
    ],
  },
  {
    status: 'planned',
    label: 'Planned',
    icon: Star,
    color: 'text-accent-bright',
    bg: 'bg-accent/10',
    border: 'border-accent/25',
    items: [
      { title: 'Google Sheets integration', desc: 'Connect directly to Google Sheets for live data.' },
      { title: 'Collaboration features', desc: 'Share datasets and analyses with team members.' },
      { title: 'AI-powered data cleaning suggestions', desc: 'Gemini suggests specific cleaning actions based on your data.' },
      { title: 'Custom chart themes', desc: 'Light mode, custom colors, and branding options for charts.' },
      { title: 'Scheduled reports', desc: 'Auto-generate and email PDF reports on a schedule.' },
      { title: 'API access', desc: 'REST API for programmatic access to analysis features.' },
      { title: 'Database connections', desc: 'Connect directly to PostgreSQL, MySQL, or SQLite databases.' },
      { title: 'Jupyter notebook export', desc: 'Export analysis as a Python/Jupyter notebook.' },
    ],
  },
];

export default function RoadmapPage({ onNavigate, onGetStarted }: Props) {
  return (
    <PageShell currentPage="roadmap" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Roadmap"
        icon={<Milestone className="w-8 h-8 text-accent-bright" />}
        title="What's shipped, what's next"
        description="See what's been built, what's in progress, and what's coming next — updated as we ship."
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
        <div className="space-y-12">
          {ROADMAP.map(({ status, label, icon: Icon, color, bg, border, items }) => (
            <Reveal key={status}>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${bg} ${border} mb-5`}>
                <Icon className={`w-4 h-4 ${color}`} />
                <span className={`text-sm font-semibold ${color}`}>{label}</span>
                <span className={`text-xs ${color} opacity-70`}>({items.length})</span>
              </div>
              <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map(item => (
                  <StaggerItem key={item.title} className={`flex items-start gap-3 p-4 bg-ink-surface border ${border} rounded-xl hover:bg-ink-raised/40 transition-colors`}>
                    <Icon className={`w-4 h-4 ${color} flex-shrink-0 mt-0.5`} />
                    <div>
                      <div className="text-sm font-medium text-paper">{item.title}</div>
                      <div className="text-xs text-paper-dim mt-0.5 leading-relaxed">{item.desc}</div>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-14 p-8 bg-ink-surface border border-ink-border rounded-2xl text-center">
          <p className="text-paper/90 mb-4">Have a feature idea? Vote or submit on the feature request board.</p>
          <button onClick={() => onNavigate('features-board')} className="px-6 py-2.5 bg-accent hover:bg-accent-bright text-ink text-sm font-semibold rounded-xl transition-colors">
            View feature requests
          </button>
        </Reveal>
      </div>
    </PageShell>
  );
}
