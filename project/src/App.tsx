import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import Auth from './components/Auth';
import HomePage from './components/HomePage';
import UploadScreen from './components/UploadScreen';
import VKAnalyzeApp from './components/DataFlowApp';
import type { ParsedData } from './lib/data-processing';
import type { ProfileData } from './lib/types';

type AppState = 'home' | 'auth' | 'upload' | 'analyze';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [appState, setAppState] = useState<AppState>('home');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  // Persist dataset to localStorage whenever it changes
  useEffect(() => {
    if (session && parsed && file && profile) {
      try {
        localStorage.setItem('vkanalyze-session', JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          parsed,
          profile,
          savedAt: Date.now(),
        }));
      } catch {
        // Storage full, ignore
      }
    }
  }, [parsed, file, profile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        const saved = localStorage.getItem('vkanalyze-session');
        if (saved) {
          try {
            const { parsed: p, profile: pr, fileName, savedAt } = JSON.parse(saved);
            if (Date.now() - savedAt < 86400000 && p && pr) {
              const mockFile = new File([], fileName);
              setParsed(p);
              setProfile(pr);
              setFile(mockFile);
              setAppState('analyze');
            } else {
              setAppState('upload');
            }
          } catch {
            localStorage.removeItem('vkanalyze-session');
            setAppState('upload');
          }
        } else {
          setAppState('upload');
        }
      } else {
        setAppState('home');
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('auth state changed:', _event, session);
      setSession(session);
      if (!session) {
        localStorage.removeItem('vkanalyze-session');
        setAppState('home');
        setFile(null);
        setParsed(null);
        setProfile(null);
      } else if (appState === 'auth') {
        setAppState('upload');
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

  function handleReset() {
    localStorage.removeItem('vkanalyze-session');
    setFile(null);
    setParsed(null);
    setProfile(null);
    setAppState('upload');
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (appState === 'home') {
    return <HomePage onGetStarted={() => setAppState('auth')} />;
  }

  if (appState === 'auth' || (!session && appState !== 'home')) {
    return <Auth onSuccess={() => setAppState('upload')} />;
  }

  if (appState === 'upload') {
    return <UploadScreen onDataLoaded={handleDataLoaded} />;
  }

  if (appState === 'analyze' && file && parsed && profile) {
    return (
      <VKAnalyzeApp
        file={file}
        parsed={parsed}
        profile={profile}
        userEmail={session?.user.email ?? ''}
        onReset={handleReset}
      />
    );
  }

  return <UploadScreen onDataLoaded={handleDataLoaded} />;
}
