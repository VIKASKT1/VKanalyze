// Shared motion primitives for the public site. Kept deliberately small and
// consistent so every page reveals content the same way — one grammar of
// motion rather than bespoke animations per page.
//
// Respects prefers-reduced-motion via Framer's built-in `useReducedMotion`
// consumers (see Reveal below), so nothing here needs manual media queries.
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode, ElementType } from 'react';
import { fadeUp, staggerParent } from './motion-variants';

interface RevealProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  variants?: Variants;
  delay?: number;
  once?: boolean;
}

/** Fades/slides content in once it scrolls into view. The single building block for section reveals across the site. */
export function Reveal({ children, as = 'div', className, variants = fadeUp, delay = 0, once = true }: RevealProps) {
  const reduceMotion = useReducedMotion();
  const MotionTag = motion(as as ElementType);
  if (reduceMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: '-80px' }}
      variants={variants}
      transition={{ delay }}
    >
      {children}
    </MotionTag>
  );
}

interface StaggerProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

/** Wrap a group of Reveal/StaggerItem children to cascade their entrance. */
export function Stagger({ children, className, as = 'div' }: StaggerProps) {
  const reduceMotion = useReducedMotion();
  const MotionTag = motion(as as ElementType);
  if (reduceMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <MotionTag className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={staggerParent}>
      {children}
    </MotionTag>
  );
}

export function StaggerItem({ children, className, as = 'div' }: StaggerProps) {
  const reduceMotion = useReducedMotion();
  const MotionTag = motion(as as ElementType);
  if (reduceMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <MotionTag className={className} variants={fadeUp}>
      {children}
    </MotionTag>
  );
}
