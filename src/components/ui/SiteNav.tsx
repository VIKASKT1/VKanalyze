import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2, Github, Menu, X, ChevronDown, ArrowRight } from 'lucide-react';
import { LocalBadge } from './primitives';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
  currentPage?: string;
}

const PRIMARY_NAV_LINKS: Array<[string, string]> = [
  ['Features', 'features'],
  ['Security', 'security'],
  ['Roadmap', 'roadmap'],
  ['About', 'about'],
];

const MORE_NAV_LINKS: Array<[string, string]> = [
  ['FAQ', 'faq'],
  ['Support', 'support'],
  ['Changelog', 'changelog'],
  ['Trust Center', 'trust'],
  ['Privacy Policy', 'privacy'],
  ['Terms', 'terms'],
  ['Contact', 'contact'],
];

/**
 * Shared navigation shell for every public route. One component, one visual
 * language — pages pass their own slug as `currentPage` to get the active
 * link highlighted; everything else (scroll blur, mobile menu, "More" menu,
 * keyboard handling) is identical everywhere it's used.
 */
export default function SiteNav({ onNavigate, onGetStarted, currentPage }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  function go(page: string) {
    onNavigate(page);
    setMobileOpen(false);
    setMoreOpen(false);
  }

  const isMoreActive = MORE_NAV_LINKS.some(([, p]) => p === currentPage);

  return (
    <nav
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'bg-ink/80 backdrop-blur-xl border-b border-ink-border' : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between">
        <button onClick={() => go('home')} className="flex items-center gap-2.5 group" aria-label="VKAnalyze home">
          <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center group-hover:border-accent/60 transition-colors">
            <BarChart2 className="w-4 h-4 text-accent-bright" />
          </div>
          <span className="font-semibold text-paper text-[15px] tracking-tight">VKAnalyze</span>
        </button>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {PRIMARY_NAV_LINKS.map(([label, page]) => (
            <button
              key={page}
              onClick={() => go(page)}
              aria-current={currentPage === page ? 'page' : undefined}
              className={`relative px-3.5 py-2 text-[13.5px] font-medium rounded-lg transition-colors ${
                currentPage === page ? 'text-paper' : 'text-paper-dim hover:text-paper'
              }`}
            >
              {label}
              {currentPage === page && (
                <motion.span
                  layoutId="nav-active-pill"
                  className="absolute inset-0 -z-10 rounded-lg bg-ink-raised border border-ink-border"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
            </button>
          ))}

          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(o => !o)}
              onKeyDown={e => { if (e.key === 'Escape') setMoreOpen(false); }}
              aria-haspopup="true"
              aria-expanded={moreOpen}
              aria-controls="site-nav-more-menu"
              className={`flex items-center gap-1 px-3.5 py-2 text-[13.5px] font-medium rounded-lg transition-colors ${
                isMoreActive ? 'text-paper' : 'text-paper-dim hover:text-paper'
              }`}
            >
              More <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  id="site-nav-more-menu"
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  onKeyDown={e => { if (e.key === 'Escape') setMoreOpen(false); }}
                  className="absolute top-full right-0 mt-2 w-52 py-1.5 bg-ink-surface border border-ink-border rounded-xl shadow-2xl shadow-black/40"
                >
                  {MORE_NAV_LINKS.map(([label, page]) => (
                    <button
                      key={page}
                      role="menuitem"
                      onClick={() => go(page)}
                      className="w-full text-left px-4 py-2 text-[13.5px] text-paper-dim hover:text-paper hover:bg-ink-raised transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden lg:block mr-1">
            <LocalBadge />
          </div>
          <a
            href="https://github.com/VIKASKT1"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 text-paper-dim hover:text-paper rounded-lg transition-colors text-[13.5px] font-medium"
          >
            <Github className="w-4 h-4" /> GitHub
          </a>
          {onGetStarted && (
            <button
              onClick={onGetStarted}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-paper hover:bg-white text-ink font-semibold rounded-lg transition-colors text-[13.5px]"
            >
              Get started <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="md:hidden p-2.5 -mr-1.5 rounded-lg hover:bg-ink-raised transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="site-nav-mobile-menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            id="site-nav-mobile-menu"
            onKeyDown={e => { if (e.key === 'Escape') setMobileOpen(false); }}
            className="md:hidden overflow-hidden border-t border-ink-border bg-ink"
          >
            <div className="px-4 py-3 space-y-0.5 max-h-[75vh] overflow-y-auto">
              {[...PRIMARY_NAV_LINKS, ...MORE_NAV_LINKS].map(([label, page]) => (
                <button
                  key={page}
                  onClick={() => go(page)}
                  aria-current={currentPage === page ? 'page' : undefined}
                  className={`w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors ${
                    currentPage === page ? 'text-paper bg-ink-raised font-medium' : 'text-paper/90 hover:text-paper hover:bg-ink-raised'
                  }`}
                >
                  {label}
                </button>
              ))}
              <a
                href="https://github.com/VIKASKT1"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-paper/90 hover:text-paper hover:bg-ink-raised rounded-lg transition-colors"
              >
                <Github className="w-4 h-4" /> GitHub
              </a>
              {onGetStarted && (
                <button
                  onClick={() => { onGetStarted(); setMobileOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-sm text-ink bg-paper rounded-lg transition-colors font-semibold mt-2"
                >
                  Get started free
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
