// Small shared visual primitives for the public site — kept intentionally
// minimal so the design language stays consistent without a heavy UI kit.
import type { ReactNode } from 'react';

/** The privacy-boundary badge — the site's recurring signature motif: a
 * literal line between "on your device" and "in the cloud", reused in the
 * navbar micro-badge, hero, and security sections. */
export function LocalBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-mono text-paper-dim ${className}`}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-60" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-signal" />
      </span>
      Runs in your browser
    </span>
  );
}

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block text-xs font-mono uppercase tracking-[0.18em] text-accent-bright/80 mb-4">
      {children}
    </span>
  );
}

export function GradientMesh({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <div className="absolute -top-40 left-1/4 w-[36rem] h-[36rem] rounded-full bg-accent/[0.07] blur-[120px]" />
      <div className="absolute top-1/3 -right-40 w-[30rem] h-[30rem] rounded-full bg-data/[0.05] blur-[130px]" />
    </div>
  );
}
