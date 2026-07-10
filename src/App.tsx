import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import HomePage from './components/HomePage';
import { saveActiveSession, loadActiveSession, clearActiveSession } from './lib/session-store';
import type { ParsedData } from './lib/data-processing';
import type { ProfileData } from './lib/types';

// The entire authenticated workspace (auth form, upload screen, and the full
// analysis app with all its tabs/charts/xlsx/pdf dependencies) is lazy —
// a first-time visitor who only looks at the marketing homepage never
// downloads any of it. Previously these were static imports, so their code
// shipped in the main bundle on every single page load regardless of
// whether the visitor ever signed in.
const Auth = lazy(() => import('./components/Auth'));
const UploadScreen = lazy(() => import('./components/UploadScreen'));
const VKAnalyzeApp = lazy(() => import('./components/DataFlowApp'));

// Lazy-loaded pages
const AboutPage = lazy(() => import('./components/pages/AboutPage'));
const ContactPage = lazy(() => import('./components/pages/ContactPage'));
const FeedbackPage = lazy(() => import('./components/pages/FeedbackPage'));
const SupportPage = lazy(() => import('./components/pages/SupportPage'));
const FAQPage = lazy(() => import('./components/pages/FAQPage'));
const RoadmapPage = lazy(() => import('./components/pages/RoadmapPage'));
const ChangelogPage = lazy(() => import('./components/pages/ChangelogPage'));
const LegalPage = lazy(() => import('./components/pages/LegalPage'));
const AdminDashboard = lazy(() => import('./components/pages/AdminDashboard'));
const ProfilePage = lazy(() => import('./components/pages/ProfilePage'));
const FeatureRequestBoard = lazy(() => import('./components/pages/FeatureRequestBoard'));
const PrivacyDashboard = lazy(() => import('./components/pages/PrivacyDashboard'));
const PlatformSettings = lazy(() => import('./components/pages/PlatformSettings'));
const TrustCenter = lazy(() => import('./components/pages/TrustCenter'));
const WorkspacesPage = lazy(() => import('./components/pages/WorkspacesPage'));
const AccountDeletedPage = lazy(() => import('./components/pages/AccountDeletedPage'));
const SharedDashboardView = lazy(() => import('./components/pages/SharedDashboardView'));
const NotFoundPage = lazy(() => import('./components/pages/NotFoundPage'));
const FeaturesPageLazy     = lazy(() => import('./components/pages/MarketingPages').then(m => ({ default: m.FeaturesPage })));
const SecurityPageLazy     = lazy(() => import('./components/pages/MarketingPages').then(m => ({ default: m.SecurityPage })));

type AppState = 'home' | 'auth' | 'upload' | 'analyze'
  | 'about' | 'contact' | 'feedback' | 'support' | 'faq'
  | 'roadmap' | 'changelog' | 'privacy' | 'terms' | 'cookies'
  | 'admin' | 'profile' | 'features-board'
  | 'privacy-dashboard' | 'settings' | 'trust' | 'workspaces'
  | 'features' | 'security' | 'account-deleted'
  | 'shared-dashboard' | 'not-found';

function PageLoader() {
  return (
    <div className="min-h-screen bg-ink flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const PAGE_TITLES: Record<AppState, string> = {
  home: 'VKAnalyze – AI-Powered Data Analytics Platform',
  auth: 'Sign In – VKAnalyze',
  upload: 'Upload Data – VKAnalyze',
  analyze: 'Analyze Data – VKAnalyze',
  about: 'About – VKAnalyze',
  contact: 'Contact – VKAnalyze',
  feedback: 'Feedback – VKAnalyze',
  support: 'Support – VKAnalyze',
  faq: 'FAQ – VKAnalyze',
  roadmap: 'Roadmap – VKAnalyze',
  changelog: 'Changelog – VKAnalyze',
  privacy: 'Privacy Policy – VKAnalyze',
  terms: 'Terms of Service – VKAnalyze',
  cookies: 'Cookie Policy – VKAnalyze',
  admin: 'Admin – VKAnalyze',
  profile: 'Profile – VKAnalyze',
  'features-board': 'Feature Requests – VKAnalyze',
  'privacy-dashboard': 'Privacy Dashboard – VKAnalyze',
  settings: 'Settings – VKAnalyze',
  trust: 'Trust Center – VKAnalyze',
  workspaces: 'Workspaces – VKAnalyze',
  'shared-dashboard': 'Shared Dashboard – VKAnalyze',
  features: 'Features – VKAnalyze',
  security: 'Security – VKAnalyze',
  'account-deleted': 'Account Deleted – VKAnalyze',
  'not-found': 'Page Not Found – VKAnalyze',
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [appState, setAppState] = useState<AppState>('home');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  // Root cause of Issue 1 (password reset flow broken): Supabase's
  // recovery-link redirect lands back on this app with a session already
  // established (detectSessionInUrl parses the URL hash automatically) and
  // fires a PASSWORD_RECOVERY auth event — but nothing previously listened
  // for that event, so the user just fell through the normal "session
  // exists -> go to upload" path and never saw a way to set a new password.
  // This flag, set from that event below, takes priority over every other
  // render branch until the user actually sets a new password.
  const [recoveryMode, setRecoveryMode] = useState(false);

  // Root cause of Issue 5 (Back always lands on Home/a fixed screen):
  // navigate() only ever set the CURRENT app state — nothing recorded where
  // the user navigated FROM, so "Back" had no real previous screen to return
  // to and fell back to a single hardcoded destination (or nothing at all
  // when no workspace was active yet, e.g. Upload -> Profile -> Back). This
  // ref stores the one state we came from, updated on every navigate() call.
  // A ref (not state) is intentional: updating it must never itself trigger
  // a re-render or interact with React's render/commit ordering — it just
  // needs to hold whatever value was current at the moment of the last
  // navigate() call, for the next Back press to read.
  const previousAppStateRef = useRef<AppState>('home');

  function navigate(page: string) {
    previousAppStateRef.current = appState;
    setAppState(page as AppState);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Update browser URL so back/forward and direct links work
    const pathMap: Record<string, string> = {
      home: '/',
      auth: '/login',
      upload: '/app',
      analyze: '/app',
      about: '/about',
      contact: '/contact',
      feedback: '/feedback',
      support: '/support',
      faq: '/faq',
      roadmap: '/roadmap',
      changelog: '/changelog',
      privacy: '/privacy',
      terms: '/terms',
      cookies: '/cookies',
      admin: '/admin',
      profile: '/profile',
      'features-board': '/feature-requests',
      'privacy-dashboard': '/privacy-dashboard',
      settings: '/settings',
      trust: '/trust',
      workspaces: '/workspaces',
      features: '/features',
      security: '/security',
      'account-deleted': '/account-deleted',
    };
    const path = pathMap[page] ?? '/';
    if (window.location.pathname !== path) {
      history.pushState({ page }, '', path);
    }
  }

  // Handle browser back/forward button
  useEffect(() => {
    function handlePopState(e: PopStateEvent) {
      const stateFromEvent = e.state as { page?: string } | null;
      previousAppStateRef.current = appState;
      if (stateFromEvent?.page) {
        setAppState(stateFromEvent.page as AppState);
      } else {
        // Re-derive state from current URL
        resolveStateFromUrl();
      }
      window.scrollTo({ top: 0 });
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [appState]);

  function resolveStateFromUrl(): AppState {
    const path = window.location.pathname;
    const urlToState: Record<string, AppState> = {
      '/': 'home',
      '/login': 'auth',
      '/app': 'upload',
      '/about': 'about',
      '/contact': 'contact',
      '/feedback': 'feedback',
      '/support': 'support',
      '/faq': 'faq',
      '/roadmap': 'roadmap',
      '/changelog': 'changelog',
      '/privacy': 'privacy',
      '/terms': 'terms',
      '/cookies': 'cookies',
      '/admin': 'admin',
      '/profile': 'profile',
      '/feature-requests': 'features-board',
      '/privacy-dashboard': 'privacy-dashboard',
      '/settings': 'settings',
      '/trust': 'trust',
      '/workspaces': 'workspaces',
      '/features': 'features',
      '/security': 'security',
      '/account-deleted': 'account-deleted',
    };
    const sharedMatch = path.match(/^\/shared\/([a-f0-9]+)$/);
    if (sharedMatch) return 'shared-dashboard';
    if (path === '/') return 'home';
    return urlToState[path] ?? 'not-found';
  }

  useEffect(() => {
    document.title = PAGE_TITLES[appState] ?? PAGE_TITLES.home;
  }, [appState]);

  // Phase 4: persist the full working session (parsed rows + profile) to
  // IndexedDB so a page refresh restores exactly where the user left off,
  // entirely client-side. Previously only metadata went to localStorage and
  // rows were discarded on every refresh.
  useEffect(() => {
    if (file && parsed && profile) {
      saveActiveSession(file, parsed, profile);
    }
  }, [parsed, file, profile]);

  useEffect(() => {
    // Check for shared dashboard URL
    const path = window.location.pathname;
    const sharedMatch = path.match(/^\/shared\/([a-f0-9]+)$/);
    if (sharedMatch) {
      setShareToken(sharedMatch[1]);
      setAppState('shared-dashboard');
      setAuthLoading(false);
      return;
    }

    // Handle direct URL navigation for marketing/public pages
    const publicPathState = resolveStateFromUrl();
    const publicPages: AppState[] = [
      'home','features','security','about','contact','support',
      'faq','changelog','roadmap','privacy','terms','cookies','account-deleted','not-found',
    ];
    if (publicPathState !== 'home' && publicPages.includes(publicPathState) && path !== '/') {
      setAppState(publicPathState);
      setAuthLoading(false);
      return;
    }

    // Issue 1 fix: detect password-recovery links BEFORE getSession() resolves.
    // When a user clicks a Supabase reset-password email link, the URL contains
    // type=recovery in the hash. Supabase fires PASSWORD_RECOVERY via
    // onAuthStateChange, but that event arrives AFTER getSession() resolves —
    // so without this check, the app briefly renders UploadScreen.
    // Fix: read the hash synchronously before any async work so recoveryMode
    // is true on the very first render, never showing the wrong screen.
    // Also handle the (less common, but Supabase-supported) query-string
    // shape some project configs/email-template variants use for password
    // reset links, e.g. ?token_hash=...&type=recovery, in addition to the
    // implicit-flow hash shape. Checking both is a superset fix: it can't
    // break the working hash-based case, and covers the query-string case
    // if this project's reset email template or Supabase settings change.
    const urlHash = window.location.hash;
    const urlSearch = window.location.search;
    const isRecoveryLink =
      urlHash.includes('type=recovery') || urlHash.includes('type%3Drecovery') ||
      urlSearch.includes('type=recovery') || urlSearch.includes('type%3Drecovery');
    if (isRecoveryLink) {
      setRecoveryMode(true);
      setAuthLoading(false);
      // IMPORTANT: do NOT strip the hash/query here. Supabase's client has
      // detectSessionInUrl enabled (the default, since it isn't overridden
      // in src/lib/supabase.ts) and needs to read access_token/
      // refresh_token out of this exact URL itself, the first time any
      // supabase.auth.* call runs after the client is constructed. The
      // previous code called history.replaceState() here, synchronously
      // clearing window.location.hash before Supabase had actually consumed
      // it. That created a race: under React StrictMode (enabled in
      // src/main.tsx), this effect runs twice in dev — the first pass could
      // strip the hash before Supabase's internal parser read it, and the
      // second pass then saw an empty hash and fell through to the normal
      // getSession() path instead of recovery mode (the "redirects to home"
      // symptom). It's a race even without StrictMode, since Supabase's
      // hash parsing is asynchronous. We now only clear the URL after
      // onAuthStateChange confirms the session was actually parsed.
      const { data: { subscription: recSub } } = supabase.auth.onAuthStateChange((event, session) => {
        setSession(session);
        if (event === 'PASSWORD_RECOVERY' || session) {
          setRecoveryMode(true);
          // Safe to scrub tokens from the address bar now that Supabase has
          // already read them out of the URL and established the session.
          history.replaceState(null, '', window.location.pathname);
        }
        if (!session && event !== 'PASSWORD_RECOVERY') {
          setRecoveryMode(false);
          setAppState('home');
        }
      });
      return () => recSub.unsubscribe();
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadActiveSession().then(restored => {
          if (restored) {
            setFile(restored.file);
            setParsed(restored.parsed);
            setProfile(restored.profile);
            setAppState('analyze');
          } else {
            setAppState('upload');
          }
          setAuthLoading(false);
        });
        return;
      } else {
        setAppState('home');
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setAuthLoading(false);
      }
      // Record login events — only when user.id is available
      const userId = session?.user?.id;
      if (userId && (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY')) {
        supabase.from('login_history').insert({
          user_id: userId,
          event_type: event === 'SIGNED_IN' ? 'sign_in' : event === 'SIGNED_OUT' ? 'sign_out' : 'password_change',
          ip_address: null,
          user_agent: navigator.userAgent,
        }).then(() => {});
      }
      if (!session) {
        localStorage.removeItem('vkanalyze-session');
        clearActiveSession();
        setRecoveryMode(false);
        // Preserve the account-deleted confirmation screen across the
        // SIGNED_OUT event fired by deleteAccount()'s signOut() call —
        // otherwise this reset the app to 'home' before the confirmation
        // screen ever rendered, since both happen in the same tick.
        setAppState(prev => prev === 'account-deleted' ? prev : 'home');
        setFile(null);
        setParsed(null);
        setProfile(null);
      } else if (event !== 'PASSWORD_RECOVERY') {
        // Use functional updater to avoid stale closure over appState
        setAppState(prev => prev === 'auth' ? 'upload' : prev);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function handleDataLoaded(f: File, p: ParsedData, pr: ProfileData) {
    setFile(f);
    setParsed(p);
    setProfile(pr);
    setAppState('analyze');
  }

  async function handleSignOut() {
    // Root cause of Issue 5: this previously ended with
    // `window.location.href = '/'`, a full browser navigation that reloads
    // the entire app from the server — destroying all React state and
    // re-running every initialization effect, which looks like (and is) an
    // unwanted refresh. It's also unnecessary: supabase.auth.signOut() below
    // fires a SIGNED_OUT event that the onAuthStateChange listener in this
    // same component already handles, resetting session/appState/file/
    // parsed/profile and clearing local storage — purely via React state,
    // no reload required.
    try {
      localStorage.clear();
      sessionStorage.clear();
      await clearActiveSession();
      await supabase.auth.signOut();
    } catch {
      // If sign-out itself fails, still force the app back to a clean state
      // so the user isn't stuck — but without a hard navigation.
      setSession(null);
      setAppState('home');
      setFile(null);
      setParsed(null);
      setProfile(null);
    }
  }

  function handleReset() {
    localStorage.removeItem('vkanalyze-session');
    clearActiveSession();
    setFile(null);
    setParsed(null);
    setProfile(null);
    setAppState('upload');
  }

  if (recoveryMode) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Auth
          initialMode="reset"
          onSuccess={() => { setRecoveryMode(false); setAppState('upload'); }}
          onNavigate={navigate}
        />
      </Suspense>
    );
  }

  if (authLoading) {
    return <PageLoader />;
  }

  // Public pages (no auth required)
  if (appState === 'home') {
    return <HomePage onGetStarted={() => setAppState('auth')} onNavigate={navigate} />;
  }

  if (appState === 'shared-dashboard' && shareToken) {
    return <Suspense fallback={<PageLoader />}><SharedDashboardView shareToken={shareToken} /></Suspense>;
  }

  if (appState === 'about') {
    return <Suspense fallback={<PageLoader />}><AboutPage onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  if (appState === 'contact') {
    return <Suspense fallback={<PageLoader />}><ContactPage onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  if (appState === 'feedback') {
    return <Suspense fallback={<PageLoader />}><FeedbackPage onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  if (appState === 'support') {
    return <Suspense fallback={<PageLoader />}><SupportPage onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  if (appState === 'faq') {
    return <Suspense fallback={<PageLoader />}><FAQPage onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  if (appState === 'roadmap') {
    return <Suspense fallback={<PageLoader />}><RoadmapPage onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  if (appState === 'changelog') {
    return <Suspense fallback={<PageLoader />}><ChangelogPage onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  if (appState === 'privacy') {
    return <Suspense fallback={<PageLoader />}><LegalPage onNavigate={navigate} onGetStarted={() => navigate('auth')} page="privacy" /></Suspense>;
  }
  if (appState === 'terms') {
    return <Suspense fallback={<PageLoader />}><LegalPage onNavigate={navigate} onGetStarted={() => navigate('auth')} page="terms" /></Suspense>;
  }
  if (appState === 'cookies') {
    return <Suspense fallback={<PageLoader />}><LegalPage onNavigate={navigate} onGetStarted={() => navigate('auth')} page="cookies" /></Suspense>;
  }
  if (appState === 'features-board') {
    return <Suspense fallback={<PageLoader />}><FeatureRequestBoard onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  if (appState === 'account-deleted') {
    return <Suspense fallback={<PageLoader />}><AccountDeletedPage onNavigate={navigate} /></Suspense>;
  }
  if (appState === 'not-found') {
    return <Suspense fallback={<PageLoader />}><NotFoundPage onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  // ── Marketing pages ───────────────────────────────────────────────────────
  if (appState === 'features')          return <Suspense fallback={<PageLoader />}><FeaturesPageLazy onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  if (appState === 'security')          return <Suspense fallback={<PageLoader />}><SecurityPageLazy onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  // Trust Center is static, session-independent content and sits in the same
  // public nav dropdown as Privacy Policy/Terms (see SiteNav's
  // MORE_NAV_LINKS). It was previously only reachable via the authenticated
  // OVERLAY_STATES path below the auth gate, so a logged-out visitor clicking
  // "Trust Center" from the public nav was bounced to the login screen
  // instead of seeing the page — inconsistent with every other public link
  // right next to it. Serve it here too when there's no session yet; a
  // signed-in user still gets the richer overlay version (with a "Back to
  // workspace" link) via OVERLAY_STATES further down.
  if (appState === 'trust' && !session) {
    return <Suspense fallback={<PageLoader />}><TrustCenter onNavigate={navigate} onGetStarted={() => navigate('auth')} /></Suspense>;
  }
  // Auth required — redirect unauthenticated users
  if (appState === 'auth' || !session) {
    return <Suspense fallback={<PageLoader />}><Auth onSuccess={() => setAppState('upload')} onNavigate={navigate} /></Suspense>;
  }

  // Pages that, when a workspace is active, must NOT unmount VKAnalyzeApp —
  // doing so previously destroyed every bit of in-memory workspace state
  // (active tab, filters, merges, SQL editor, pivot, compare, scroll
  // position, selected rows/columns) because React discards component state
  // on unmount. They're rendered as an overlay on top of the kept-alive
  // workspace instead, exactly like Notion/Linear/Power BI's side panels.
  const OVERLAY_STATES: AppState[] = ['profile', 'settings', 'privacy-dashboard', 'workspaces', 'admin', 'trust'];
  const hasActiveWorkspace = !!(file && parsed && profile);
  const isOverlayState = OVERLAY_STATES.includes(appState);

  function renderOverlay() {
    // Where "Back" should go: wherever the user was immediately before
    // opening this overlay page. If that turns out to be another overlay
    // state (e.g. Settings -> Profile -> Back should land on Settings) that's
    // still correct — it's just as much "the screen the user came from" as
    // 'analyze' or 'upload' is. The only case needing a safe fallback is if
    // the recorded previous state is 'auth' or 'home' while a workspace is
    // already active (shouldn't normally happen, but could after a direct
    // URL visit) — in that case 'upload'/'analyze' is the sane destination.
    const prev = previousAppStateRef.current;
    const fallback: AppState = hasActiveWorkspace ? 'analyze' : 'upload';
    const goBackTarget: AppState = (prev === 'auth' || prev === 'home') && hasActiveWorkspace ? fallback : prev;
    const canGoBack = hasActiveWorkspace || prev !== 'auth';
    const backToWorkspace = canGoBack ? () => navigate(goBackTarget) : undefined;
    if (appState === 'admin') {
      return (
        <Suspense fallback={<PageLoader />}>
          <AdminDashboard onNavigate={navigate} userEmail={session?.user.email ?? ''} onBackToWorkspace={backToWorkspace} />
        </Suspense>
      );
    }
    if (appState === 'profile') {
      return <Suspense fallback={<PageLoader />}><ProfilePage onNavigate={navigate} onBackToWorkspace={backToWorkspace} /></Suspense>;
    }
    if (appState === 'privacy-dashboard') {
      return <Suspense fallback={<PageLoader />}><PrivacyDashboard onNavigate={navigate} onBackToWorkspace={backToWorkspace} /></Suspense>;
    }
    if (appState === 'settings') {
      return <Suspense fallback={<PageLoader />}><PlatformSettings onNavigate={navigate} onBackToWorkspace={backToWorkspace} /></Suspense>;
    }
    if (appState === 'trust') {
      return <Suspense fallback={<PageLoader />}><TrustCenter onNavigate={navigate} onBackToWorkspace={backToWorkspace} /></Suspense>;
    }
    if (appState === 'workspaces') {
      return <Suspense fallback={<PageLoader />}><WorkspacesPage onNavigate={navigate} onBackToWorkspace={backToWorkspace} /></Suspense>;
    }
    return null;
  }

  // If there's an active workspace, VKAnalyzeApp stays mounted underneath
  // every overlay state (and underneath 'analyze' itself). It is only ever
  // unmounted by an explicit onReset (New File) or sign-out.
  if (hasActiveWorkspace) {
    return (
      <>
        <div style={{ display: isOverlayState ? 'none' : 'contents' }}>
          <Suspense fallback={<PageLoader />}>
            <VKAnalyzeApp
              file={file as File}
              parsed={parsed as ParsedData}
              profile={profile as ProfileData}
              userEmail={session?.user.email ?? ''}
              onReset={handleReset}
              onNavigate={navigate}
            />
          </Suspense>
        </div>
        {isOverlayState && renderOverlay()}
      </>
    );
  }

  // No active workspace — overlay pages render standalone (e.g. visiting
  // /profile directly with no dataset loaded yet).
  if (isOverlayState) {
    return renderOverlay();
  }

  return <Suspense fallback={<PageLoader />}><UploadScreen onDataLoaded={handleDataLoaded} onNavigate={navigate} session={session} onSignOut={handleSignOut} /></Suspense>;
}
