import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App.tsx';
import { PrivacyProvider } from './lib/PrivacyContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user" makes every Framer Motion animation in the app
        automatically honor prefers-reduced-motion, not just the ones that
        explicitly check useReducedMotion() (Reveal/Stagger in ui/motion.tsx). */}
    <MotionConfig reducedMotion="user">
      <PrivacyProvider>
        <App />
      </PrivacyProvider>
    </MotionConfig>
  </StrictMode>
);
