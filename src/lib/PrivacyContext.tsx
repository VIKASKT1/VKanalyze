import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  getAppPrivacySettings,
  saveAppPrivacySettings,
  recordAIConsentChoice,
  getDatasetPrivacy,
  setDatasetPrivacyLevel,
  type AppPrivacySettings,
} from './privacy';
import AIConsentDialog from '../components/AIConsentDialog';

interface PrivacyContextValue {
  settings: AppPrivacySettings;
  loading: boolean;
  setLocalOnlyMode: (on: boolean) => Promise<void>;
  setAiDataMode: (mode: 'strict' | 'enhanced') => Promise<void>;
  /**
   * Ensures the user has made an explicit AI consent choice before any
   * cloud AI call is made. Resolves true if AI use is allowed right now.
   * Shows the consent dialog only the first time it's needed. If a
   * datasetName is given and the dataset is still at its default "Local
   * Only" level, granting consent upgrades just that dataset to "AI Enabled"
   * — it never silently upgrades a dataset the user hasn't touched.
   */
  ensureAIConsent: (datasetName?: string) => Promise<boolean>;
  revokeAIConsent: () => Promise<void>;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppPrivacySettings>({
    localOnlyMode: false,
    aiConsent: 'unset',
    aiDataMode: 'strict',
  });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    getAppPrivacySettings().then(s => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const setLocalOnlyMode = useCallback(async (on: boolean) => {
    const next = await saveAppPrivacySettings({ localOnlyMode: on });
    setSettings(next);
  }, []);

  const setAiDataMode = useCallback(async (mode: 'strict' | 'enhanced') => {
    const next = await saveAppPrivacySettings({ aiDataMode: mode });
    setSettings(next);
  }, []);

  const ensureAIConsent = useCallback(async (datasetName?: string): Promise<boolean> => {
    const current = await getAppPrivacySettings();
    setSettings(current);
    if (current.localOnlyMode) return false;

    let granted: boolean;
    if (current.aiConsent === 'granted') {
      granted = true;
    } else if (current.aiConsent === 'declined') {
      granted = false;
    } else {
      // aiConsent === 'unset' -> ask the user
      setDialogOpen(true);
      granted = await new Promise<boolean>(resolve => {
        resolverRef.current = resolve;
      });
    }

    if (granted && datasetName) {
      const ds = await getDatasetPrivacy(datasetName, datasetName);
      if (ds.level === 'local') {
        await setDatasetPrivacyLevel(datasetName, datasetName, 'ai');
      }
    }
    return granted;
  }, []);

  const revokeAIConsent = useCallback(async () => {
    const next = await saveAppPrivacySettings({ aiConsent: 'declined' });
    setSettings(next);
  }, []);

  async function handleDialogChoice(granted: boolean) {
    await recordAIConsentChoice(granted);
    const next = await getAppPrivacySettings();
    setSettings(next);
    setDialogOpen(false);
    resolverRef.current?.(granted);
    resolverRef.current = null;
  }

  return (
    <PrivacyContext.Provider
      value={{ settings, loading, setLocalOnlyMode, setAiDataMode, ensureAIConsent, revokeAIConsent }}
    >
      {children}
      <AIConsentDialog
        open={dialogOpen}
        onEnable={() => handleDialogChoice(true)}
        onStayLocal={() => handleDialogChoice(false)}
      />
    </PrivacyContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error('usePrivacy must be used within a PrivacyProvider');
  return ctx;
}
