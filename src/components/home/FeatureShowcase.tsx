import {
  Wand2, Table2, Code2, TrendingUp, ScatterChart, LayoutDashboard,
  FileText, BarChart2, Shield, Brain, Share2, Users, type LucideIcon,
} from 'lucide-react';
import { Reveal, Stagger, StaggerItem } from '../ui/motion';
import { SectionEyebrow } from '../ui/primitives';

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

interface Group {
  category: string;
  features: Feature[];
}

const GROUPS: Group[] = [
  {
    category: 'Data preparation',
    features: [
      { icon: Wand2, title: 'Data cleaning', desc: 'Remove duplicates, fill missing values, and fix type inconsistencies in one click.' },
      { icon: Shield, title: 'Quality scoring', desc: 'A live score that recalculates the moment you clean — across CSV, TSV, Excel, and JSON alike.' },
    ],
  },
  {
    category: 'Analysis',
    features: [
      { icon: Table2, title: 'Pivot tables', desc: 'Group, aggregate, and summarize data with flexible row and column dimensions.' },
      { icon: TrendingUp, title: 'Forecasting', desc: 'Time-series trend detection with linear regression and confidence intervals.' },
      { icon: ScatterChart, title: 'Correlation analysis', desc: 'Find relationships between variables with matrices and scatter plots.' },
      { icon: Code2, title: 'SQL workspace', desc: 'Write SQL directly on your dataset, with AI-assisted query generation.' },
    ],
  },
  {
    category: 'Visualization & collaboration',
    features: [
      { icon: BarChart2, title: 'Interactive charts', desc: 'Bar, line, pie, scatter, and histogram charts — interactive and exportable.' },
      { icon: LayoutDashboard, title: 'Dashboard builder', desc: 'Arrange KPI cards, charts, and tables into a dashboard you can revisit.' },
      { icon: Share2, title: 'Dashboard sharing', desc: 'Publish a public link backed by aggregated, privacy-safe snapshots of your widgets.' },
      { icon: FileText, title: 'PDF reports', desc: 'Export reports with KPIs, statistics, AI insights, and data quality scores.' },
    ],
  },
  {
    category: 'AI & administration',
    features: [
      { icon: Brain, title: 'AI insights', desc: 'Ask questions about your data in plain English and get instant, cached answers.' },
      { icon: Users, title: 'Admin dashboard', desc: 'Platform analytics, user management, and feedback moderation for admins.' },
    ],
  },
];

export default function FeatureShowcase() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6 border-t border-ink-border bg-ink-surface/40">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-2xl mb-16">
          <SectionEyebrow>Complete analytics suite</SectionEyebrow>
          <h2 className="text-3xl sm:text-4xl font-semibold text-paper mb-4 tracking-tight">Everything you need, organized the way you'd use it</h2>
          <p className="text-paper-dim leading-relaxed">A complete platform for data preparation, analysis, visualization, and AI-assisted work — all in one workspace.</p>
        </Reveal>

        <div className="space-y-14">
          {GROUPS.map(group => (
            <div key={group.category}>
              <Reveal>
                <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-paper-dimmer mb-5">{group.category}</h3>
              </Reveal>
              <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {group.features.map(({ icon: Icon, title, desc }) => (
                  <StaggerItem
                    key={title}
                    className="p-5 rounded-2xl bg-ink-surface border border-ink-border hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-accent-bright" />
                    </div>
                    <h4 className="text-sm font-semibold text-paper mb-1.5">{title}</h4>
                    <p className="text-xs text-paper-dim leading-relaxed">{desc}</p>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
