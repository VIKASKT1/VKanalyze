import { Tag, Bug, Zap, Wrench, History } from 'lucide-react';
import { PageShell, PageHero } from '../ui/PageShell';
import { Reveal } from '../ui/motion';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
}

const CHANGELOG = [
  {
    version: '3.0.0',
    date: 'June 2026',
    type: 'major',
    title: 'SaaS Platform Launch',
    changes: [
      { type: 'feature', text: 'Admin dashboard with full platform analytics and user management' },
      { type: 'feature', text: 'User profile page with stats and password change' },
      { type: 'feature', text: 'About, Contact, FAQ, Roadmap, Changelog, and Feedback pages' },
      { type: 'feature', text: 'Support Center with ticket submission system' },
      { type: 'feature', text: 'Feature Request Board with community voting' },
      { type: 'feature', text: 'Announcement system for admin-controlled site banners' },
      { type: 'feature', text: 'Trust section with security badges' },
      { type: 'feature', text: 'Professional footer with all links' },
      { type: 'improvement', text: 'Redesigned public site with a shared design system and motion' },
      { type: 'improvement', text: 'New feature showcase organized by workflow' },
      { type: 'improvement', text: 'Who it\'s for section (Students, Researchers, Business, Enthusiasts)' },
      { type: 'improvement', text: 'Tech stack section with technology cards' },
    ],
  },
  {
    version: '2.0.0',
    date: 'May 2026',
    type: 'major',
    title: 'Advanced Analytics & Platform',
    changes: [
      { type: 'feature', text: 'SQL Analytics Workspace with full in-browser SQL engine' },
      { type: 'feature', text: 'AI SQL generator — plain English to SQL via Gemini' },
      { type: 'feature', text: 'Professional 5-page PDF report export' },
      { type: 'feature', text: 'Chart export as PNG and SVG' },
      { type: 'feature', text: 'Analysis session persistence to Supabase' },
      { type: 'feature', text: 'Dataset version history with restore capability' },
      { type: 'feature', text: 'Data merge tool (Union, Left Join, Inner Join)' },
      { type: 'feature', text: 'Activity log tracking all user actions' },
      { type: 'feature', text: 'Dashboard builder with KPI/chart/table/insight widgets' },
      { type: 'feature', text: 'Gemini multi-key failover for uninterrupted AI service' },
    ],
  },
  {
    version: '1.0.0',
    date: 'April 2026',
    type: 'major',
    title: 'Core Analytics Platform',
    changes: [
      { type: 'feature', text: 'Pivot Table Module with Sum, Count, Avg, Min, Max aggregations' },
      { type: 'feature', text: 'KPI Dashboard with 8 key metrics cards' },
      { type: 'feature', text: 'Advanced Filters with 9 operators and AND/OR logic' },
      { type: 'feature', text: 'Data Quality Center with quality scoring and issue detection' },
      { type: 'feature', text: 'Outlier Detection using Z-Score and IQR methods' },
      { type: 'feature', text: 'Correlation Analysis with Pearson matrix heatmap' },
      { type: 'feature', text: 'Trend Analysis with time-series grouping' },
      { type: 'feature', text: 'Linear Regression Forecasting' },
      { type: 'feature', text: 'Data Dictionary with searchable column reference' },
      { type: 'improvement', text: 'Enhanced AI chat with direct row computation' },
    ],
  },
  {
    version: '0.1.0',
    date: 'March 2026',
    type: 'initial',
    title: 'Initial Release',
    changes: [
      { type: 'feature', text: 'CSV and Excel file upload and parsing' },
      { type: 'feature', text: 'Column statistics and data profiling' },
      { type: 'feature', text: 'Gemini AI chat for dataset questions' },
      { type: 'feature', text: 'Interactive charts: Bar, Line, Pie, Scatter, Histogram' },
      { type: 'feature', text: 'Data cleaning: duplicates, nulls, whitespace' },
      { type: 'feature', text: 'Supabase authentication and session persistence' },
      { type: 'feature', text: 'Chat history saved per dataset' },
      { type: 'feature', text: 'CSV export for cleaned data' },
    ],
  },
];

const CHANGE_ICONS: Record<string, { icon: typeof Bug; color: string }> = {
  feature: { icon: Zap, color: 'text-accent-bright' },
  improvement: { icon: Wrench, color: 'text-amber-400' },
  fix: { icon: Bug, color: 'text-red-400' },
};

const VERSION_BADGES: Record<string, string> = {
  major: 'bg-accent/15 text-accent-bright border-accent/30',
  minor: 'bg-signal/15 text-signal border-signal/30',
  patch: 'bg-ink-raised text-paper/90 border-ink-borderStrong',
  initial: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

export default function ChangelogPage({ onNavigate, onGetStarted }: Props) {
  return (
    <PageShell currentPage="changelog" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Changelog"
        icon={<History className="w-8 h-8 text-accent-bright" />}
        title="What's changed"
        description="A record of all notable changes to VKAnalyze, release by release."
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-ink-raised" />

          <div className="space-y-10 pl-14">
            {CHANGELOG.map((release, idx) => (
              <Reveal key={release.version} delay={idx * 0.04} className="relative">
                <div className="absolute -left-14 top-1 flex items-center justify-center w-10 h-10 rounded-full bg-ink-surface border-2 border-ink-borderStrong">
                  <Tag className="w-4 h-4 text-accent-bright" />
                </div>

                <div className="bg-ink-surface border border-ink-border rounded-2xl p-6 hover:border-ink-borderStrong transition-colors">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <span className="text-xl font-semibold text-paper">v{release.version}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${VERSION_BADGES[release.type]}`}>
                      {release.type}
                    </span>
                  </div>
                  <div className="text-sm text-paper-dim mb-1">{release.date}</div>
                  <div className="text-base font-semibold text-paper mb-4">{release.title}</div>

                  <ul className="space-y-2">
                    {release.changes.map((change, i) => {
                      const { icon: Icon, color } = CHANGE_ICONS[change.type] ?? CHANGE_ICONS.feature;
                      return (
                        <li key={i} className="flex items-start gap-2.5 text-sm">
                          <Icon className={`w-4 h-4 ${color} flex-shrink-0 mt-0.5`} />
                          <span className="text-paper/90">{change.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
