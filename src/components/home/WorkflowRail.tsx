import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import {
  Upload, Search, ShieldCheck, Wand2, LineChart, Code2,
  LayoutDashboard, Share2, Download, type LucideIcon,
} from 'lucide-react';
import { Reveal } from '../ui/motion';
import { SectionEyebrow } from '../ui/primitives';

interface Step {
  icon: LucideIcon;
  title: string;
  desc: string;
  zone: 'local' | 'boundary' | 'shared';
}

const STEPS: Step[] = [
  { icon: Upload, title: 'Upload', desc: 'Drop a CSV, TSV, Excel, or JSON file. Parsing happens instantly, entirely in your browser.', zone: 'local' },
  { icon: Search, title: 'Profile', desc: 'Column types, null counts, and distributions are detected automatically.', zone: 'local' },
  { icon: ShieldCheck, title: 'Quality score', desc: 'Missing values, duplicates, and inconsistent formatting are scored and surfaced.', zone: 'local' },
  { icon: Wand2, title: 'Clean', desc: 'Fix nulls, trim whitespace, normalize casing, and remove duplicates — with the score recalculated live.', zone: 'local' },
  { icon: LineChart, title: 'Analyze & visualize', desc: 'Correlation, outliers, forecasting, and interactive charts, all computed client-side.', zone: 'local' },
  { icon: Code2, title: 'SQL workspace', desc: 'Query your dataset with real SQL — or describe what you want in plain English.', zone: 'local' },
  { icon: LayoutDashboard, title: 'Build a dashboard', desc: 'Arrange KPIs, charts, and tables into a dashboard you can revisit anytime.', zone: 'boundary' },
  { icon: Share2, title: 'Share, if you choose', desc: 'Only the aggregated chart data your dashboard needs is published — never the raw dataset, unless you explicitly opt in.', zone: 'shared' },
  { icon: Download, title: 'Export', desc: 'Take your cleaned data, charts, or a full PDF report with you.', zone: 'local' },
];

/**
 * The site's signature element: a single vertical rail tracing a dataset's
 * journey, with the fill color crossing from "local" (signal green) to
 * "shared" (accent blue) exactly at the step where data would leave the
 * browser — making VKAnalyze's privacy boundary a literal, visible line
 * rather than a claim in a paragraph.
 */
export default function WorkflowRail() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start 0.75', 'end 0.4'] });
  const railHeight = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section className="py-24 px-4 sm:px-6" id="how-it-works">
      <div className="max-w-3xl mx-auto text-center mb-16">
        <Reveal>
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2 className="text-3xl sm:text-4xl font-semibold text-paper mb-4 tracking-tight">One continuous path, from file to insight</h2>
          <p className="text-paper-dim leading-relaxed">
            Everything up to sharing happens on your device. The line below turns from green to blue only at the one step
            where you can choose to publish something — and even then, only what a chart needs, never your raw rows.
          </p>
        </Reveal>
      </div>

      <div ref={containerRef} className="relative max-w-2xl mx-auto">
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-ink-border" />
        <motion.div
          className="absolute left-[19px] top-2 w-px bg-gradient-to-b from-signal to-accent origin-top"
          style={{ height: railHeight }}
        />

        <div className="space-y-10">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.02} className="relative pl-14">
              <div
                className={`absolute left-0 top-0 w-10 h-10 rounded-full border-2 flex items-center justify-center bg-ink ${
                  step.zone === 'shared' ? 'border-accent' : 'border-signal'
                }`}
              >
                <step.icon className={`w-4 h-4 ${step.zone === 'shared' ? 'text-accent-bright' : 'text-signal'}`} />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <h3 className="text-base font-semibold text-paper">{step.title}</h3>
                {step.zone === 'boundary' && (
                  <span className="text-[10px] font-mono uppercase tracking-wide text-paper-dimmer">optional sharing ahead</span>
                )}
                {step.zone === 'shared' && (
                  <span className="text-[10px] font-mono uppercase tracking-wide text-accent-bright">leaves your device only here</span>
                )}
              </div>
              <p className="text-sm text-paper-dim leading-relaxed max-w-md">{step.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
