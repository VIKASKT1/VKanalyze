// Core privacy/consent logic for VKAnalyze's local-first architecture.
//
// Design:
// - Every dataset has a privacy level: 'local' | 'ai' | 'cloud'.
//     local  -> never sent to Gemini, never synced to Supabase (chat/sessions stay in IndexedDB)
//     ai     -> may be sent to Gemini (after consent), chat/sessions still stay local
//     cloud  -> may be sent to Gemini (after consent) AND chat/sessions sync to Supabase
// - A global "Local Only Mode" kill switch overrides everything above: when on,
//   no dataset (regardless of its own level) may use AI or cloud sync.
// - AI usage anywhere in the app requires one-time explicit consent, captured by
//   the AI Consent Dialog. The consent decision is stored locally and can be revoked.
//
// All reads/writes in this file are IndexedDB only — nothing here touches the network.

import { idbGet, idbSet, idbDelete, idbGetAll, STORES } from './db';

export type PrivacyLevel = 'local' | 'ai' | 'cloud';

export interface AppPrivacySettings {
  localOnlyMode: boolean;
  aiConsent: 'unset' | 'granted' | 'declined';
  aiConsentTimestamp?: string;
  // Mirrors the existing "AI Privacy Mode" UI in Platform Settings.
  // 'strict'  -> only column names/types/statistics are ever sent to Gemini
  // 'enhanced' -> a small sample of rows may also be sent, only for datasets
  //               whose own privacy level is 'ai' or 'cloud'
  aiDataMode: 'strict' | 'enhanced';
}

export interface DatasetPrivacyRecord {
  datasetId: string;
  datasetName: string;
  level: PrivacyLevel;
  storedLocally: boolean;
  cloudSyncEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastAIUsage?: string;
  lastCloudSync?: string;
}

const SETTINGS_KEY = 'app';

const DEFAULT_SETTINGS: AppPrivacySettings = {
  localOnlyMode: false,
  aiConsent: 'unset',
  aiDataMode: 'strict',
};

// ── App-wide settings ────────────────────────────────────────────────────────

export async function getAppPrivacySettings(): Promise<AppPrivacySettings> {
  try {
    const stored = await idbGet<AppPrivacySettings>(STORES.PREFERENCES, SETTINGS_KEY);
    return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveAppPrivacySettings(
  partial: Partial<AppPrivacySettings>
): Promise<AppPrivacySettings> {
  const current = await getAppPrivacySettings();
  const next = { ...current, ...partial };
  await idbSet(STORES.PREFERENCES, SETTINGS_KEY, next);
  return next;
}

export async function isLocalOnlyMode(): Promise<boolean> {
  const settings = await getAppPrivacySettings();
  return settings.localOnlyMode;
}

export async function hasAIConsent(): Promise<boolean> {
  const settings = await getAppPrivacySettings();
  return settings.aiConsent === 'granted' && !settings.localOnlyMode;
}

export async function recordAIConsentChoice(granted: boolean): Promise<void> {
  await saveAppPrivacySettings({
    aiConsent: granted ? 'granted' : 'declined',
    aiConsentTimestamp: new Date().toISOString(),
  });
}

// ── Per-dataset privacy level ───────────────────────────────────────────────

function keyFor(datasetId: string): string {
  return datasetId;
}

export async function getDatasetPrivacy(
  datasetId: string,
  datasetName?: string
): Promise<DatasetPrivacyRecord> {
  const existing = await idbGet<DatasetPrivacyRecord>(STORES.DATASET_PRIVACY, keyFor(datasetId));
  if (existing) return existing;

  // New datasets default to "local" — cloud/AI must be explicitly opted into.
  const fresh: DatasetPrivacyRecord = {
    datasetId,
    datasetName: datasetName ?? datasetId,
    level: 'local',
    storedLocally: true,
    cloudSyncEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await idbSet(STORES.DATASET_PRIVACY, keyFor(datasetId), fresh);
  return fresh;
}

export async function setDatasetPrivacyLevel(
  datasetId: string,
  datasetName: string,
  level: PrivacyLevel
): Promise<DatasetPrivacyRecord> {
  const current = await getDatasetPrivacy(datasetId, datasetName);
  const next: DatasetPrivacyRecord = {
    ...current,
    datasetName,
    level,
    cloudSyncEnabled: level === 'cloud',
    updatedAt: new Date().toISOString(),
  };
  await idbSet(STORES.DATASET_PRIVACY, keyFor(datasetId), next);
  return next;
}

export async function recordDatasetAIUsage(datasetId: string, datasetName: string): Promise<void> {
  const current = await getDatasetPrivacy(datasetId, datasetName);
  await idbSet(STORES.DATASET_PRIVACY, keyFor(datasetId), {
    ...current,
    lastAIUsage: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function recordDatasetCloudSync(datasetId: string, datasetName: string): Promise<void> {
  const current = await getDatasetPrivacy(datasetId, datasetName);
  await idbSet(STORES.DATASET_PRIVACY, keyFor(datasetId), {
    ...current,
    lastCloudSync: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function listDatasetPrivacy(): Promise<DatasetPrivacyRecord[]> {
  return idbGetAll<DatasetPrivacyRecord>(STORES.DATASET_PRIVACY);
}

/** Can this dataset use AI features right now, given its own level + the global kill switch? */
export async function canUseAI(datasetId: string, datasetName?: string): Promise<boolean> {
  const settings = await getAppPrivacySettings();
  if (settings.localOnlyMode) return false;
  if (settings.aiConsent !== 'granted') return false;
  const ds = await getDatasetPrivacy(datasetId, datasetName);
  return ds.level === 'ai' || ds.level === 'cloud';
}

/** Can this dataset's chat/session data sync to Supabase right now? */
export async function canCloudSync(datasetId: string, datasetName?: string): Promise<boolean> {
  const settings = await getAppPrivacySettings();
  if (settings.localOnlyMode) return false;
  const ds = await getDatasetPrivacy(datasetId, datasetName);
  return ds.level === 'cloud';
}

// ── Local chat history (used when a dataset's level isn't "cloud") ──────────

interface LocalChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export async function getLocalChatHistory(datasetName: string): Promise<LocalChatMessage[]> {
  const all = await idbGet<LocalChatMessage[]>(STORES.CHAT, datasetName);
  return all ?? [];
}

export async function appendLocalChatMessage(
  datasetName: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const history = await getLocalChatHistory(datasetName);
  history.push({ role, content, timestamp: new Date().toISOString() });
  await idbSet(STORES.CHAT, datasetName, history.slice(-200));
}

export async function clearLocalChatHistory(datasetName: string): Promise<void> {
  await idbSet(STORES.CHAT, datasetName, []);
}

export async function countAllLocalChatMessages(): Promise<number> {
  const all = await idbGetAll<LocalChatMessage[]>(STORES.CHAT);
  return all.reduce((sum, list) => sum + (list?.length ?? 0), 0);
}

export async function countAllLocalVersions(): Promise<number> {
  const all = await idbGetAll<LocalDatasetVersion[]>(STORES.VERSIONS);
  return all.reduce((sum, list) => sum + (list?.length ?? 0), 0);
}

// ── Local analysis sessions (used when Local Only Mode or dataset isn't "cloud") ──

export interface LocalAnalysisSession {
  id: string;
  name: string;
  dataset_name: string;
  file_size: number;
  row_count: number;
  column_count: number;
  parsed_columns: string[];
  statistics: Record<string, unknown>;
  quality_score: number;
  created_at: string;
}

const SESSIONS_INDEX_KEY = 'index';

export async function saveLocalSession(
  session: Omit<LocalAnalysisSession, 'id' | 'created_at'>
): Promise<LocalAnalysisSession> {
  const record: LocalAnalysisSession = {
    ...session,
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  const index = (await idbGet<string[]>(STORES.SESSIONS, SESSIONS_INDEX_KEY)) ?? [];
  await idbSet(STORES.SESSIONS, record.id, record);
  await idbSet(STORES.SESSIONS, SESSIONS_INDEX_KEY, [record.id, ...index].slice(0, 200));
  return record;
}

export async function loadLocalSessions(): Promise<LocalAnalysisSession[]> {
  const index = (await idbGet<string[]>(STORES.SESSIONS, SESSIONS_INDEX_KEY)) ?? [];
  const sessions: LocalAnalysisSession[] = [];
  for (const id of index) {
    const s = await idbGet<LocalAnalysisSession>(STORES.SESSIONS, id);
    if (s) sessions.push(s);
  }
  return sessions;
}

export async function deleteLocalSession(id: string): Promise<void> {
  const index = (await idbGet<string[]>(STORES.SESSIONS, SESSIONS_INDEX_KEY)) ?? [];
  await idbDelete(STORES.SESSIONS, id);
  await idbSet(STORES.SESSIONS, SESSIONS_INDEX_KEY, index.filter(i => i !== id));
}

export interface LocalActivityEntry {
  id: string;
  action: string;
  details?: string;
  datasetName: string | null;
  created_at: string;
}

const ACTIVITY_KEY = 'log';

export async function appendLocalActivity(
  datasetName: string | null,
  action: string,
  details?: string
): Promise<void> {
  const existing = (await idbGet<LocalActivityEntry[]>(STORES.ACTIVITY, ACTIVITY_KEY)) ?? [];
  existing.unshift({
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    details,
    datasetName,
    created_at: new Date().toISOString(),
  });
  await idbSet(STORES.ACTIVITY, ACTIVITY_KEY, existing.slice(0, 500));
}

export async function loadLocalActivity(datasetName?: string): Promise<LocalActivityEntry[]> {
  const all = (await idbGet<LocalActivityEntry[]>(STORES.ACTIVITY, ACTIVITY_KEY)) ?? [];
  return datasetName ? all.filter(e => e.datasetName === datasetName) : all;
}

export async function clearLocalActivity(): Promise<void> {
  await idbSet(STORES.ACTIVITY, ACTIVITY_KEY, []);
}

// ── Local dataset versions (used when Local Only Mode or dataset isn't "cloud") ──

export interface LocalDatasetVersion {
  id: string;
  version_number: number;
  label: string;
  columns: string[];
  row_count: number;
  column_count: number;
  changes_summary: string | null;
  created_at: string;
}

export async function getLocalVersions(datasetName: string): Promise<LocalDatasetVersion[]> {
  const all = await idbGet<LocalDatasetVersion[]>(STORES.VERSIONS, datasetName);
  return all ?? [];
}

export async function saveLocalVersion(
  datasetName: string,
  version: Omit<LocalDatasetVersion, 'id' | 'created_at'>
): Promise<LocalDatasetVersion> {
  const record: LocalDatasetVersion = {
    ...version,
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  const existing = await getLocalVersions(datasetName);
  await idbSet(STORES.VERSIONS, datasetName, [record, ...existing].slice(0, 50));
  return record;
}

export async function deleteLocalVersion(datasetName: string, id: string): Promise<void> {
  const existing = await getLocalVersions(datasetName);
  await idbSet(STORES.VERSIONS, datasetName, existing.filter(v => v.id !== id));
}

// ── Local dashboards (used when Local Only Mode or dataset isn't "cloud") ────

export interface LocalDashboard {
  id: string;
  name: string;
  dataset_name: string;
  widgets: unknown[];
  created_at: string;
  updated_at: string;
}

export async function getLocalDashboards(datasetName: string): Promise<LocalDashboard[]> {
  const all = await idbGet<LocalDashboard[]>(STORES.DASHBOARDS, datasetName);
  return all ?? [];
}

export async function createLocalDashboard(datasetName: string, name: string): Promise<LocalDashboard> {
  const now = new Date().toISOString();
  const record: LocalDashboard = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    dataset_name: datasetName,
    widgets: [],
    created_at: now,
    updated_at: now,
  };
  const existing = await getLocalDashboards(datasetName);
  await idbSet(STORES.DASHBOARDS, datasetName, [record, ...existing]);
  return record;
}

export async function saveLocalDashboard(
  datasetName: string,
  dashboard: { id: string; name: string; widgets: unknown[] }
): Promise<void> {
  const existing = await getLocalDashboards(datasetName);
  const updated = existing.map(d =>
    d.id === dashboard.id
      ? { ...d, name: dashboard.name, widgets: dashboard.widgets, updated_at: new Date().toISOString() }
      : d
  );
  await idbSet(STORES.DASHBOARDS, datasetName, updated);
}

export async function deleteLocalDashboard(datasetName: string, id: string): Promise<void> {
  const existing = await getLocalDashboards(datasetName);
  await idbSet(STORES.DASHBOARDS, datasetName, existing.filter(d => d.id !== id));
}

// ── Local SQL history / saved queries (used when Local Only Mode or dataset isn't "cloud") ──

export interface LocalSqlQuery {
  id: string;
  query: string;
  name?: string;
  is_saved: boolean;
  is_favorite: boolean;
  execution_time_ms?: number;
  row_count?: number;
  created_at: string;
}

export async function getLocalSqlQueries(datasetName: string): Promise<LocalSqlQuery[]> {
  const all = await idbGet<LocalSqlQuery[]>(STORES.SQL_QUERIES, datasetName);
  return all ?? [];
}

export async function appendLocalSqlQuery(
  datasetName: string,
  entry: Omit<LocalSqlQuery, 'id' | 'created_at'>
): Promise<LocalSqlQuery> {
  const record: LocalSqlQuery = {
    ...entry,
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  const existing = await getLocalSqlQueries(datasetName);
  await idbSet(STORES.SQL_QUERIES, datasetName, [record, ...existing].slice(0, 200));
  return record;
}

export async function updateLocalSqlQuery(
  datasetName: string,
  id: string,
  patch: Partial<LocalSqlQuery>
): Promise<void> {
  const existing = await getLocalSqlQueries(datasetName);
  await idbSet(STORES.SQL_QUERIES, datasetName, existing.map(q => q.id === id ? { ...q, ...patch } : q));
}

export async function deleteLocalSqlQuery(datasetName: string, id: string): Promise<void> {
  const existing = await getLocalSqlQueries(datasetName);
  await idbSet(STORES.SQL_QUERIES, datasetName, existing.filter(q => q.id !== id));
}

// ── Local notifications (account-level — gated only by Local Only Mode) ─────

export interface LocalNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  created_at: string;
}

const NOTIFICATIONS_KEY = 'list';

export async function getLocalNotifications(): Promise<LocalNotification[]> {
  const all = await idbGet<LocalNotification[]>(STORES.NOTIFICATIONS, NOTIFICATIONS_KEY);
  return all ?? [];
}

export async function appendLocalNotification(
  title: string,
  message: string,
  type: LocalNotification['type']
): Promise<void> {
  const existing = await getLocalNotifications();
  const record: LocalNotification = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    type,
    read: false,
    created_at: new Date().toISOString(),
  };
  await idbSet(STORES.NOTIFICATIONS, NOTIFICATIONS_KEY, [record, ...existing].slice(0, 100));
}

export async function markLocalNotificationRead(id: string): Promise<void> {
  const existing = await getLocalNotifications();
  await idbSet(STORES.NOTIFICATIONS, NOTIFICATIONS_KEY, existing.map(n => n.id === id ? { ...n, read: true } : n));
}

export async function markAllLocalNotificationsRead(): Promise<void> {
  const existing = await getLocalNotifications();
  await idbSet(STORES.NOTIFICATIONS, NOTIFICATIONS_KEY, existing.map(n => ({ ...n, read: true })));
}

export async function deleteLocalNotification(id: string): Promise<void> {
  const existing = await getLocalNotifications();
  await idbSet(STORES.NOTIFICATIONS, NOTIFICATIONS_KEY, existing.filter(n => n.id !== id));
}
