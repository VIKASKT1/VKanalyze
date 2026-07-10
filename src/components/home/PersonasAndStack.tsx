import { BookOpen, Search, TrendingUp, Users, Briefcase, Building2, Globe, Database, Brain, LineChart, FileText, Cpu, type LucideIcon } from 'lucide-react';
import { Reveal, Stagger, StaggerItem } from '../ui/motion';
import { SectionEyebrow } from '../ui/primitives';

interface Persona { icon: LucideIcon; title: string; desc: string }

const PERSONAS: Persona[] = [
  { icon: BookOpen, title: 'Students', desc: 'Analyze survey data, assignments, and research datasets for academic projects — no coding required.' },
  { icon: Search, title: 'Researchers', desc: 'Explore complex datasets, detect outliers, correlations, and trends with AI-assisted analysis.' },
  { icon: TrendingUp, title: 'Business users', desc: 'Analyze sales, revenue, and operations data, and generate reports for stakeholders.' },
  { icon: Users, title: 'Data enthusiasts', desc: 'Explore any dataset from Kaggle, government open data, or your own collection with zero setup.' },
  { icon: Briefcase, title: 'Freelancers', desc: 'Deliver data-driven insights to clients with PDF reports and interactive dashboards.' },
  { icon: Building2, title: 'Small businesses', desc: 'Make data-driven decisions without hiring analysts. Upload spreadsheets, get instant insight.' },
];

const STACK = [
  { icon: Globe, label: 'React 18', sub: 'UI framework' },
  { icon: Database, label: 'Supabase', sub: 'Auth + DB' },
  { icon: Brain, label: 'Gemini AI', sub: 'AI engine' },
  { icon: LineChart, label: 'Recharts', sub: 'Charts' },
  { icon: FileText, label: 'jsPDF', sub: 'PDF export' },
  { icon: Cpu, label: 'Vite', sub: 'Build tool' },
];

export function PersonasSection() {
  return (
    <section className="py-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-2xl mb-14">
          <SectionEyebrow>Who it's for</SectionEyebrow>
          <h2 className="text-3xl sm:text-4xl font-semibold text-paper mb-4 tracking-tight">Built for anyone who works with data</h2>
        </Reveal>
        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PERSONAS.map(({ icon: Icon, title, desc }) => (
            <StaggerItem key={title} className="p-6 rounded-2xl bg-ink-surface border border-ink-border hover:border-ink-borderStrong transition-colors">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-accent-bright" />
              </div>
              <h3 className="font-semibold text-paper mb-2">{title}</h3>
              <p className="text-sm text-paper-dim leading-relaxed">{desc}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

export function TechStackSection() {
  return (
    <section className="py-20 px-4 sm:px-6 border-t border-ink-border bg-ink-surface/40">
      <div className="max-w-5xl mx-auto">
        <Reveal className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-semibold text-paper mb-2 tracking-tight">Built with a modern stack</h2>
          <p className="text-paper-dim text-sm">Chosen for performance, security, and a workspace that stays out of your way.</p>
        </Reveal>
        <Stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {STACK.map(({ icon: Icon, label, sub }) => (
            <StaggerItem key={label} className="p-4 rounded-xl bg-ink-surface border border-ink-border text-center hover:border-ink-borderStrong transition-colors">
              <Icon className="w-6 h-6 text-accent mx-auto mb-2" />
              <div className="text-sm font-semibold text-paper">{label}</div>
              <div className="text-xs text-paper-dim">{sub}</div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
