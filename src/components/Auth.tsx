import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { BarChart2, Mail, Lock, User, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { GradientMesh, LocalBadge } from './ui/primitives';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

interface Props {
  onSuccess?: () => void;
  onNavigate?: (page: string) => void;
  /** Forces the screen into password-recovery mode, e.g. when the app
   * detects a Supabase PASSWORD_RECOVERY auth event. */
  initialMode?: Mode;
}

export default function Auth({ onSuccess, onNavigate, initialMode }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'reset') {
      if (!password || !confirmPassword) {
        setError('Please fill in both password fields.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setLoading(true);
      try {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setSuccessMessage('Password updated successfully! Redirecting…');
        setPassword('');
        setConfirmPassword('');
        setTimeout(() => onSuccess?.(), 1200);
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : 'Could not update password';
        // Map Supabase error codes to user-friendly messages
        const msg = raw.includes('expired') || raw.includes('invalid')
          ? 'This password reset link has expired or already been used. Please request a new one.'
          : raw.replace('AuthApiError: ', '');
        setError(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || (mode !== 'forgot' && !password)) {
      setError('Please fill in all fields.');
      return;
    }
    if (mode !== 'forgot' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (resetError) throw resetError;
        setSuccessMessage('Password reset link sent! Check your email inbox.');
        setMode('login');
        setPassword('');
        setLoading(false);
        return;
      }

      if (mode === 'register') {
        if (!fullName.trim()) {
          setError('Please enter your full name.');
          setLoading(false);
          return;
        }
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (signUpError) throw signUpError;
        setSuccessMessage('Account created! Please check your email inbox and click the verification link before signing in.');
        setMode('login');
        setPassword('');
        return;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        onSuccess?.();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg.replace('AuthApiError: ', ''));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-ink flex items-center justify-center p-4 overflow-hidden">
      <GradientMesh />
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative"
      >
        {onNavigate && (
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-1.5 text-sm text-paper-dim hover:text-paper transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </button>
        )}

        {/* Logo */}
        <div className="text-center mb-8">
          <button
            type="button"
            onClick={() => onNavigate?.('home')}
            disabled={!onNavigate}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent mb-4 shadow-lg shadow-accent/30 disabled:cursor-default"
            aria-label={onNavigate ? 'Go to home page' : undefined}
          >
            <BarChart2 className="w-8 h-8 text-ink" />
          </button>
          <h1 className="text-3xl font-semibold text-paper tracking-tight">VKAnalyze</h1>
          <p className="text-paper-dim mt-1 text-sm">AI-powered spreadsheet analytics platform</p>
          <div className="flex justify-center mt-3">
            <LocalBadge />
          </div>
        </div>

        {/* Card */}
        <div className="bg-ink-surface/70 backdrop-blur border border-ink-border rounded-2xl p-8 shadow-2xl">
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
          <h2 className="text-xl font-semibold text-paper mb-6">
            {mode === 'login' ? 'Sign in to your account' : mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Set a new password' : 'Reset your password'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-paper/90 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    autoComplete="name"
                    className="w-full pl-10 pr-4 py-2.5 bg-ink/60 border border-ink-borderStrong rounded-lg text-paper placeholder-paper-dimmer focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
                  />
                </div>
              </div>
            )}

            <div className={mode === 'reset' ? 'hidden' : ''}>
              <label className="block text-sm font-medium text-paper/90 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required={mode !== 'reset'}
                  className="w-full pl-10 pr-4 py-2.5 bg-ink/60 border border-ink-borderStrong rounded-lg text-paper placeholder-paper-dimmer focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
                />
              </div>
            </div>

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div>
              <label className="block text-sm font-medium text-paper/90 mb-1.5">{mode === 'reset' ? 'New Password' : 'Password'}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' || mode === 'reset' ? 'Min. 6 characters' : '••••••••'}
                  autoComplete={mode === 'register' || mode === 'reset' ? 'new-password' : 'current-password'}
                  className="w-full pl-10 pr-10 py-2.5 bg-ink/60 border border-ink-borderStrong rounded-lg text-paper placeholder-paper-dimmer focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-dim hover:text-paper transition"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            )}

            {mode === 'reset' && (
            <div>
              <label className="block text-sm font-medium text-paper/90 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paper-dim" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-ink/60 border border-ink-borderStrong rounded-lg text-paper placeholder-paper-dimmer focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
                />
              </div>
            </div>
            )}

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setSuccessMessage(''); }}
                className="text-sm text-accent-bright hover:text-accent transition"
              >
                Forgot password?
              </button>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent hover:bg-accent-bright disabled:opacity-50 disabled:cursor-not-allowed text-ink font-semibold rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-accent/20"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : mode === 'reset' ? 'Update Password' : 'Send Reset Link'}
            </button>
          </form>

          {mode !== 'reset' && (
          <div className="mt-6 text-center text-sm text-paper-dim">
            {mode === 'forgot' ? (
              <button
                onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }}
                className="text-accent-bright hover:text-accent font-medium transition"
              >
                Back to sign in
              </button>
            ) : mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => { setMode('register'); setError(''); setSuccessMessage(''); }}
                  className="text-accent-bright hover:text-accent font-medium transition"
                >
                  Sign up free
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }}
                  className="text-accent-bright hover:text-accent font-medium transition"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
          )}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-paper-dimmer mt-6">
          Secure data analysis — your files never leave your browser
        </p>
      </motion.div>
    </div>
  );
}
