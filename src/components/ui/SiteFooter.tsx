import { BarChart2, Github, Linkedin, Mail, Lock } from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

type FooterLink = [string, string] | [string, () => void];

const PRODUCT_LINKS: FooterLink[] = [
  ['Features', 'features'],
  ['Security', 'security'],
  ['Roadmap', 'roadmap'],
  ['Changelog', 'changelog'],
];

const RESOURCE_LINKS: FooterLink[] = [
  ['FAQ', 'faq'],
  ['Support', 'support'],
  ['Feedback', 'feedback'],
  ['Workspaces', 'workspaces'],
];

const LEGAL_LINKS: FooterLink[] = [
  ['Privacy Policy', 'privacy'],
  ['Terms of Service', 'terms'],
  ['Trust Center', 'trust'],
];

function FooterColumn({ title, links, onNavigate }: { title: string; links: FooterLink[]; onNavigate: (p: string) => void }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-paper mb-4">{title}</h4>
      <ul className="space-y-2.5">
        {links.map(([label, target]) => (
          <li key={label}>
            <button
              onClick={() => (typeof target === 'function' ? target() : onNavigate(target))}
              className="text-sm text-paper-dim hover:text-paper transition-colors"
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shared footer for every public page — one place to keep links, socials, and legal copy in sync. */
export default function SiteFooter({ onNavigate }: Props) {
  return (
    <footer className="border-t border-ink-border bg-ink-surface/60 pt-16 pb-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-5 h-5 text-accent-bright" />
              <span className="font-semibold text-paper tracking-tight">VKAnalyze</span>
            </div>
            <p className="text-[13px] text-paper-dim leading-relaxed max-w-[20ch]">
              Privacy-first data analysis. Your data, your device, your call.
            </p>
          </div>

          <FooterColumn title="Product" links={PRODUCT_LINKS} onNavigate={onNavigate} />
          <FooterColumn title="Resources" links={RESOURCE_LINKS} onNavigate={onNavigate} />
          <FooterColumn title="Legal" links={LEGAL_LINKS} onNavigate={onNavigate} />

          <div>
            <h4 className="text-sm font-semibold text-paper mb-4">Developer</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="https://github.com/VIKASKT1" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-paper-dim hover:text-paper transition-colors">
                  <Github className="w-3.5 h-3.5" /> GitHub
                </a>
              </li>
              <li>
                <a href="https://www.linkedin.com/in/vikas-k-t-a8b52931a" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-paper-dim hover:text-paper transition-colors">
                  <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                </a>
              </li>
              <li>
                <a href="mailto:vikasvikki010@gmail.com" className="flex items-center gap-2 text-sm text-paper-dim hover:text-paper transition-colors">
                  <Mail className="w-3.5 h-3.5" /> Email
                </a>
              </li>
              <li>
                <button onClick={() => onNavigate('about')} className="text-sm text-paper-dim hover:text-paper transition-colors">
                  About Vikas K T
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-ink-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-paper-dim">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-accent-bright" />
            <span>&copy; {new Date().getFullYear()} VKAnalyze. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-signal" />
              <span>Privacy-first data analysis</span>
            </div>
            <span className="text-ink-border hidden sm:inline">|</span>
            <span>Built by <button onClick={() => onNavigate('about')} className="text-paper-dim hover:text-paper transition-colors underline underline-offset-2 decoration-ink-border">Vikas K T</button></span>
          </div>
        </div>
      </div>
    </footer>
  );
}
