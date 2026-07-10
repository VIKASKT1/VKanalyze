import { useEffect, useRef, useState } from 'react';
import { motion, useInView, animate } from 'framer-motion';

interface Props {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
}

/** Counts up from 0 to `value` once it scrolls into view. Used sparingly for a small number of real stats — not decorative filler. */
export default function AnimatedCounter({ value, suffix = '', prefix = '', decimals = 0, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: v => setDisplay(v.toFixed(decimals)),
    });
    return () => controls.stop();
  }, [inView, value, decimals]);

  return (
    <motion.span ref={ref} className={className}>
      {prefix}{display}{suffix}
    </motion.span>
  );
}
