// Shared Framer Motion variant objects, kept in their own module (not
// motion.tsx) so that file can export components only — satisfies the
// react-refresh/only-export-components lint rule cleanly rather than
// suppressing it.
import type { Variants, Transition } from 'framer-motion';

const EASE: Transition['ease'] = [0.16, 1, 0.3, 1];

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: EASE } },
};

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};
