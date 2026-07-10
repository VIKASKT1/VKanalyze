import { motion } from 'framer-motion';
import { CheckCircle2, UserPlus, Home } from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

/**
 * Shown once account deletion (Edge Function + local data clear + sign-out)
 * has actually completed successfully. Reached only via onNavigate('account-deleted')
 * from ProfilePage/PrivacyDashboard's deleteAccount() after the delete-user
 * Edge Function confirms success — never shown on a failed or partial deletion.
 */
export default function AccountDeletedPage({ onNavigate }: Props) {
  return (
    <div className="min-h-screen bg-ink text-paper flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-signal/10 border border-signal/30 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-signal" />
        </div>
        <h1 className="text-2xl font-semibold text-paper mb-3">Account deleted successfully</h1>
        <p className="text-paper-dim text-sm mb-8 leading-relaxed">
          Your account has been permanently deleted. If you want to use VKAnalyze again, you can create another account at any time.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => onNavigate('auth')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-bright text-ink font-semibold rounded-lg transition-colors text-sm"
          >
            <UserPlus className="w-4 h-4" /> Create new account
          </button>
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-ink-raised hover:bg-ink-borderStrong text-paper/90 font-medium rounded-lg transition-colors text-sm"
          >
            <Home className="w-4 h-4" /> Return home
          </button>
        </div>
      </motion.div>
    </div>
  );
}
