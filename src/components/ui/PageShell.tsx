import type { ReactNode } from 'react';
import SiteNav from './SiteNav';
import SiteFooter from './SiteFooter';
import SkipLink from './SkipLink';
import { Reveal } from './motion';
import { SectionEyebrow, GradientMesh } from './primitives';

interface PageShellProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
  children: ReactNode;
}

/** Wraps every non-homepage public page in the same nav + footer + base background. */
export function PageShell({ currentPage, onNavigate, onGetStarted, children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-ink text-paper font-sans">
      <SkipLink />
      <SiteNav onNavigate={onNavigate} onGetStarted={onGetStarted} currentPage={currentPage} />
      <main id="main-content">{children}</main>
      <SiteFooter onNavigate={onNavigate} />
    </div>
  );
}

interface PageHeroProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  align?: 'left' | 'center';
}

/** Consistent header treatment for secondary pages — eyebrow, title, description, optional icon badge. */
export function PageHero({ eyebrow, title, description, icon, align = 'center' }: PageHeroProps) {
  const isCenter = align === 'center';
  return (
    <section className="relative overflow-hidden pt-20 pb-16 px-4 sm:px-6">
      <GradientMesh />
      <div className={`max-w-4xl mx-auto relative ${isCenter ? 'text-center' : ''}`}>
        <Reveal>
          {icon && (
            <div className={`w-16 h-16 rounded-2xl bg-accent/10 border border-accent/25 flex items-center justify-center mb-6 ${isCenter ? 'mx-auto' : ''}`}>
              {icon}
            </div>
          )}
          {eyebrow && <SectionEyebrow>{eyebrow}</SectionEyebrow>}
          <h1 className="text-4xl sm:text-5xl font-semibold text-paper mb-5 tracking-tight leading-[1.1]">{title}</h1>
          {description && (
            <p className={`text-lg text-paper-dim leading-relaxed ${isCenter ? 'max-w-2xl mx-auto' : 'max-w-2xl'}`}>{description}</p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
