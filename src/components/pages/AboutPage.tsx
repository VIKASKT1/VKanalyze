import { BarChart2, Github, Linkedin, Mail, ExternalLink, Code2, Database, Brain, Zap, Globe, Shield, Eye, GraduationCap, MapPin, Target } from 'lucide-react';
import { PageShell, PageHero } from '../ui/PageShell';
import { Reveal, Stagger, StaggerItem } from '../ui/motion';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
}

const OFFERINGS = [
  { icon: Brain, label: 'Gemini AI Chat & Insights', desc: 'Ask questions in plain English, get AI-powered insights and anomaly detection', color: 'text-accent-bright' },
  { icon: Code2, label: 'SQL Workspace', desc: 'Write SQL queries on your data with AI-assisted generation', color: 'text-amber-400' },
  { icon: Database, label: 'Pivot Tables & Dashboards', desc: 'Build custom pivot tables and shareable dashboards', color: 'text-cyan-400' },
  { icon: Zap, label: 'Forecasting & Correlations', desc: 'Linear regression forecasting and correlation analysis', color: 'text-sky-400' },
  { icon: BarChart2, label: 'Smart Visualizations', desc: 'Auto-generated charts: bar, line, pie, scatter, histogram', color: 'text-rose-400' },
  { icon: Eye, label: 'Privacy Dashboard', desc: 'Monitor your data footprint and login history', color: 'text-signal' },
];

const STACK = [
  { icon: Globe, label: 'React 18 + TypeScript', desc: 'Modern component-based UI with full type safety', color: 'text-sky-400' },
  { icon: Database, label: 'Supabase', desc: 'PostgreSQL database with Auth, RLS, and Edge Functions', color: 'text-signal' },
  { icon: Brain, label: 'Google Gemini 2.0', desc: 'AI insights, chat, and SQL generation via API', color: 'text-accent-bright' },
  { icon: Code2, label: 'Vite + Tailwind CSS', desc: 'Lightning-fast build tool and utility-first styling', color: 'text-teal-400' },
  { icon: BarChart2, label: 'Recharts', desc: 'Interactive SVG-based data visualization library', color: 'text-amber-400' },
  { icon: Zap, label: 'jsPDF + PapaParse', desc: 'Professional PDF export and CSV/XLSX parsing', color: 'text-orange-400' },
];

function InfoGrid({ items }: { items: typeof OFFERINGS }) {
  return (
    <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map(({ icon: Icon, label, desc, color }) => (
        <StaggerItem key={label} className="flex items-start gap-3 p-4 rounded-xl bg-ink-raised/50 border border-transparent hover:border-ink-border transition-colors">
          <Icon className={`w-5 h-5 ${color} flex-shrink-0 mt-0.5`} />
          <div>
            <div className="text-sm font-medium text-paper">{label}</div>
            <div className="text-xs text-paper-dim mt-0.5 leading-relaxed">{desc}</div>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

export default function AboutPage({ onNavigate, onGetStarted }: Props) {
  return (
    <PageShell currentPage="about" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="About"
        icon={<BarChart2 className="w-8 h-8 text-accent-bright" />}
        title="Built to make data analysis honest again"
        description="A data analytics platform built to make spreadsheet analysis accessible, private, and intelligent — for everyone, not just people with a data science budget."
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-24 space-y-8">
        <Reveal className="bg-ink-surface border border-ink-border rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-paper font-semibold text-2xl flex-shrink-0 shadow-lg shadow-blue-600/20">
              VK
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-semibold text-paper mb-2">Vikas K T</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/25 text-accent-bright text-xs font-medium">
                  <GraduationCap className="w-3 h-3" /> BCA Student
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-signal/10 border border-signal/20 text-signal text-xs font-medium">
                  <Code2 className="w-3 h-3" /> Full-Stack Developer
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                  <MapPin className="w-3 h-3" /> Karnataka, India
                </span>
              </div>
              <p className="text-paper/90 leading-relaxed mb-4">
                VKAnalyze was built by Vikas K T, a BCA student and self-taught developer with a passion for building tools
                that make data analysis accessible to everyone — not just data scientists with expensive software.
              </p>
              <p className="text-paper-dim leading-relaxed mb-4">
                What started as a portfolio project evolved into a complete analytics platform with AI-powered insights,
                SQL workspaces, pivot tables, forecasting, and professional reporting. Vikas believes that powerful analytics
                tools should be free, private, and available to anyone with a browser.
              </p>
              <p className="text-paper-dim text-sm leading-relaxed mb-6">
                Developed using AI-assisted tools and deployed on modern cloud infrastructure with Supabase,
                Google Gemini, and React.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href="https://github.com/VIKASKT1" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-ink-raised hover:bg-ink-borderStrong border border-ink-borderStrong rounded-lg text-sm text-paper transition-colors">
                  <Github className="w-4 h-4" /> GitHub Profile <ExternalLink className="w-3 h-3 text-paper-dim" />
                </a>
                <a href="https://www.linkedin.com/in/vikas-k-t-a8b52931a" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-bright rounded-lg text-sm text-ink font-medium transition-colors">
                  <Linkedin className="w-4 h-4" /> LinkedIn <ExternalLink className="w-3 h-3" />
                </a>
                <a href="mailto:vikasvikki010@gmail.com"
                  className="flex items-center gap-2 px-4 py-2 bg-ink-raised hover:bg-ink-borderStrong border border-ink-borderStrong rounded-lg text-sm text-paper transition-colors">
                  <Mail className="w-4 h-4" /> vikasvikki010@gmail.com
                </a>
              </div>
            </div>
          </div>
        </Reveal>

        <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <StaggerItem className="bg-ink-surface border border-ink-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-accent-bright" />
              <h3 className="text-lg font-semibold text-paper">The vision</h3>
            </div>
            <p className="text-paper-dim leading-relaxed text-sm">
              Data analysis shouldn't require a data science degree or expensive software licenses. VKAnalyze puts
              powerful analytics tools — AI chat, SQL, pivot tables, forecasting, and professional reports — in the hands
              of students, researchers, and business users, accessible directly from any browser with zero installation.
            </p>
          </StaggerItem>
          <StaggerItem className="bg-ink-surface border border-ink-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-signal" />
              <h3 className="text-lg font-semibold text-paper">Privacy first</h3>
            </div>
            <p className="text-paper-dim leading-relaxed text-sm">
              Your data stays in your browser by default. Files are parsed locally using JavaScript —
              they are never uploaded to any server. New datasets default to "Local Only"; if you opt
              a dataset into cloud sync, its session metadata and chat history are protected by Row
              Level Security. Zero third-party data sharing.
            </p>
          </StaggerItem>
        </Stagger>

        <Reveal className="bg-ink-surface border border-ink-border rounded-2xl p-6 sm:p-8">
          <h3 className="text-xl font-semibold text-paper mb-6">What VKAnalyze offers</h3>
          <InfoGrid items={OFFERINGS} />
        </Reveal>

        <Reveal className="bg-ink-surface border border-ink-border rounded-2xl p-6 sm:p-8">
          <h3 className="text-xl font-semibold text-paper mb-6">Tech stack</h3>
          <InfoGrid items={STACK} />
        </Reveal>
      </div>
    </PageShell>
  );
}
