import { createClient } from '@supabase/supabase-js';
import { isLocalOnlyMode, canCloudSync, recordDatasetCloudSync } from './privacy';
import {
  appendLocalChatMessage,
  getLocalChatHistory,
  clearLocalChatHistory,
  appendLocalActivity,
  loadLocalActivity,
  clearLocalActivity,
  saveLocalSession,
  loadLocalSessions,
  deleteLocalSession,
  getLocalVersions,
  saveLocalVersion,
  deleteLocalVersion,
  getLocalDashboards,
  createLocalDashboard,
  saveLocalDashboard,
  deleteLocalDashboard,
  getLocalSqlQueries,
  appendLocalSqlQuery,
  updateLocalSqlQuery,
  deleteLocalSqlQuery,
  getLocalNotifications,
  appendLocalNotification,
  markLocalNotificationRead,
  markAllLocalNotificationsRead,
  deleteLocalNotification,
  type LocalDatasetVersion,
  type LocalDashboard,
  type LocalSqlQuery,
} from './privacy';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface a clear error in the browser console rather than a cryptic import crash
  const msg =
    'VKAnalyze: Missing Supabase environment variables.\n' +
    'Create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
    'See .env.example for the required format.';
  console.error(msg);
  // Show a user-visible banner instead of white-screening. Guarded on
  // `document` existing: this module is imported from plain Node contexts
  // too (e.g. Vitest, which runs without jsdom by default), and an
  // unconditional `document.addEventListener` call would turn a missing-env
  // warning into a hard crash for every test that transitively imports this
  // file, instead of just logging the console message above.
  if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const div = document.createElement('div');
    div.style.cssText =
      'position:fixed;inset:0;background:#0f172a;display:flex;align-items:center;' +
      'justify-content:center;z-index:9999;font-family:sans-serif;padding:24px;';
    div.innerHTML =
      '<div style="max-width:480px;background:#1e293b;border:1px solid #334155;border-radius:12px;' +
      'padding:28px;color:#e2e8f0;text-align:center;">' +
      '<h2 style="color:#f87171;margin:0 0 12px">Configuration Error</h2>' +
      '<p style="color:#94a3b8;margin:0">Supabase environment variables are not set.<br>' +
      'Add <code style="color:#60a5fa">VITE_SUPABASE_URL</code> and ' +
      '<code style="color:#60a5fa">VITE_SUPABASE_ANON_KEY</code> to your <code>.env.local</code> file.</p>' +
      '</div>';
    document.body.appendChild(div);
  });
  }
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder'
);

export async function saveChatMessage(
  datasetName: string,
  role: 'user' | 'assistant',
  content: string
) {
  // Local Only Mode or a dataset not explicitly set to "Cloud Sync Enabled"
  // keeps chat history entirely in IndexedDB — it never reaches Supabase.
  const allowed = await canCloudSync(datasetName, datasetName);
  if (!allowed) {
    await appendLocalChatMessage(datasetName, role, content);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await appendLocalChatMessage(datasetName, role, content);
    return;
  }
  await supabase.from('chat_messages').insert({
    user_id: user.id,
    dataset_name: datasetName,
    role,
    content,
    created_at: new Date().toISOString(),
  });
  await recordDatasetCloudSync(datasetName, datasetName);
}

export async function loadChatHistory(
  datasetName: string
): Promise<Array<{ role: string; content: string; timestamp: string }>> {
  const allowed = await canCloudSync(datasetName, datasetName);
  if (!allowed) {
    return getLocalChatHistory(datasetName);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return getLocalChatHistory(datasetName);
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', user.id)
    .eq('dataset_name', datasetName)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) return getLocalChatHistory(datasetName);
  return (data ?? []).map(m => ({
    role: m.role,
    content: m.content,
    timestamp: m.created_at,
  }));
}

export async function clearChatHistory(datasetName: string): Promise<void> {
  await clearLocalChatHistory(datasetName);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('chat_messages').delete().eq('user_id', user.id).eq('dataset_name', datasetName);
  } catch {
    // Non-critical — local history is already cleared
  }
}

export async function logActivity(
  datasetName: string | null,
  action: string,
  details?: string,
  metadata?: Record<string, unknown>
) {
  // Dataset-scoped events follow that dataset's own privacy level (consistent
  // with chat/sessions); account-level events (datasetName === null) follow
  // only the global Local Only Mode switch.
  const allowed = datasetName
    ? await canCloudSync(datasetName, datasetName)
    : !(await isLocalOnlyMode());

  if (!allowed) {
    await appendLocalActivity(datasetName, action, details);
    return;
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      await appendLocalActivity(datasetName, action, details);
      return;
    }
    await supabase.from('activity_log').insert({
      user_id: user.id,
      dataset_name: datasetName,
      action,
      details: details ?? null,
      metadata: metadata ?? null,
    });
  } catch {
    // Non-critical — never block UI
  }
}

export async function loadActivityLog(datasetName?: string) {
  const localRaw = await loadLocalActivity(datasetName);
  const local = localRaw.map(e => ({
    id: e.id,
    dataset_name: e.datasetName,
    action: e.action,
    details: e.details ?? null,
    created_at: e.created_at,
  }));
  if (await isLocalOnlyMode()) return local;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return local;
  let q = supabase.from('activity_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
  if (datasetName) q = q.eq('dataset_name', datasetName);
  const { data } = await q;
  const cloud = data ?? [];
  // Datasets kept Local/AI-only never wrote to activity_log at all — their
  // events only exist locally. Merge both so the tab shows a full picture.
  return [...cloud, ...local].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function clearActivityLog(): Promise<void> {
  await clearLocalActivity();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('activity_log').delete().eq('user_id', user.id);
  } catch {
    // Non-critical — local log is already cleared
  }
}

export async function saveAnalysisSession(
  name: string,
  datasetName: string,
  fileSize: number,
  rowCount: number,
  columnCount: number,
  parsedColumns: string[],
  statistics: Record<string, unknown>,
  qualityScore: number
) {
  const allowed = await canCloudSync(datasetName, datasetName);
  if (!allowed) {
    return saveLocalSession({
      name,
      dataset_name: datasetName,
      file_size: fileSize,
      row_count: rowCount,
      column_count: columnCount,
      parsed_columns: parsedColumns,
      statistics,
      quality_score: qualityScore,
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('analysis_sessions').insert({
    user_id: user.id,
    name,
    dataset_name: datasetName,
    file_size: fileSize,
    row_count: rowCount,
    column_count: columnCount,
    parsed_columns: parsedColumns,
    statistics,
    quality_score: qualityScore,
  }).select().maybeSingle();
  if (!error) await recordDatasetCloudSync(datasetName, datasetName);
  return error ? null : data;
}

export async function loadAnalysisSessions() {
  if (await isLocalOnlyMode()) {
    return loadLocalSessions();
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return loadLocalSessions();
  const { data } = await supabase.from('analysis_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
  const cloudSessions = data ?? [];
  const localSessions = await loadLocalSessions();
  // Local-only datasets' saved sessions never left the browser — merge them in
  // so "Saved Sessions" shows a complete picture regardless of where each lives.
  return [...cloudSessions, ...localSessions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function deleteAnalysisSession(id: string) {
  if (typeof id === 'string' && id.startsWith('local-')) {
    await deleteLocalSession(id);
    return;
  }
  await supabase.from('analysis_sessions').delete().eq('id', id);
}

export async function createNotification(
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
): Promise<void> {
  if (await isLocalOnlyMode()) {
    await appendLocalNotification(title, message, type);
    return;
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      await appendLocalNotification(title, message, type);
      return;
    }
    await supabase.from('notifications').insert({
      user_id: user.id,
      title,
      message,
      type,
      read: false,
    });
  } catch {
    // Non-critical — never block UI
  }
}

export async function loadNotifications(): Promise<Array<{
  id: string; title: string; message: string; type: string; read: boolean; created_at: string;
}>> {
  const local = await getLocalNotifications();
  if (await isLocalOnlyMode()) return local;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return local;
  const { data } = await supabase.from('notifications')
    .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
  const cloud = data ?? [];
  return [...cloud, ...local].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  if (typeof id === 'string' && id.startsWith('local-')) {
    await markLocalNotificationRead(id);
    return;
  }
  await supabase.from('notifications').update({ read: true }).eq('id', id);
}

export async function markAllNotificationsRead(): Promise<void> {
  await markAllLocalNotificationsRead();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
  } catch {
    // Non-critical
  }
}

export async function deleteNotification(id: string): Promise<void> {
  if (typeof id === 'string' && id.startsWith('local-')) {
    await deleteLocalNotification(id);
    return;
  }
  await supabase.from('notifications').delete().eq('id', id);
}

// ── Dataset versions ─────────────────────────────────────────────────────────

export async function loadDatasetVersions(datasetName: string): Promise<LocalDatasetVersion[]> {
  const local = await getLocalVersions(datasetName);
  if (!(await canCloudSync(datasetName, datasetName))) return local;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return local;
  const { data } = await supabase
    .from('dataset_versions')
    .select('id, version_number, label, columns, row_count, column_count, changes_summary, created_at')
    .eq('user_id', user.id)
    .eq('dataset_name', datasetName)
    .order('version_number', { ascending: false })
    .limit(20);
  const cloud = (data ?? []) as LocalDatasetVersion[];
  return [...cloud, ...local].sort((a, b) => b.version_number - a.version_number);
}

export async function saveDatasetVersion(
  datasetName: string,
  version: Omit<LocalDatasetVersion, 'id' | 'created_at'>
): Promise<void> {
  const allowed = await canCloudSync(datasetName, datasetName);
  if (!allowed) {
    await saveLocalVersion(datasetName, version);
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { await saveLocalVersion(datasetName, version); return; }
  const { error } = await supabase.from('dataset_versions').insert({
    user_id: user.id,
    dataset_name: datasetName,
    ...version,
  });
  if (!error) await recordDatasetCloudSync(datasetName, datasetName);
}

export async function deleteDatasetVersion(datasetName: string, id: string): Promise<void> {
  if (typeof id === 'string' && id.startsWith('local-')) {
    await deleteLocalVersion(datasetName, id);
    return;
  }
  await supabase.from('dataset_versions').delete().eq('id', id);
}

// ── Dashboards ───────────────────────────────────────────────────────────────

export async function loadDashboards(datasetName: string): Promise<LocalDashboard[]> {
  const local = await getLocalDashboards(datasetName);
  if (!(await canCloudSync(datasetName, datasetName))) return local;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return local;
  const { data } = await supabase.from('dashboards').select('*').eq('user_id', user.id).eq('dataset_name', datasetName).order('created_at', { ascending: false });
  const cloud = (data ?? []).map(d => ({ ...d, widgets: d.widgets ?? [] })) as LocalDashboard[];
  return [...cloud, ...local];
}

export async function createDashboard(datasetName: string, name: string): Promise<LocalDashboard | null> {
  const allowed = await canCloudSync(datasetName, datasetName);
  if (!allowed) return createLocalDashboard(datasetName, name);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return createLocalDashboard(datasetName, name);
  const { data, error } = await supabase.from('dashboards').insert({
    user_id: user.id, name, dataset_name: datasetName, widgets: [],
  }).select().single();
  if (error || !data) return createLocalDashboard(datasetName, name);
  await recordDatasetCloudSync(datasetName, datasetName);
  return { ...data, widgets: [] } as LocalDashboard;
}

export async function saveDashboard(
  datasetName: string,
  dashboard: { id: string; name: string; widgets: unknown[] }
): Promise<void> {
  if (typeof dashboard.id === 'string' && dashboard.id.startsWith('local-')) {
    await saveLocalDashboard(datasetName, dashboard);
    return;
  }
  await supabase.from('dashboards').update({
    widgets: dashboard.widgets, name: dashboard.name, updated_at: new Date().toISOString(),
  }).eq('id', dashboard.id);
}

export async function deleteDashboard(datasetName: string, id: string): Promise<void> {
  if (typeof id === 'string' && id.startsWith('local-')) {
    await deleteLocalDashboard(datasetName, id);
    return;
  }
  await supabase.from('dashboards').delete().eq('id', id);
}

// ── SQL history / saved queries ─────────────────────────────────────────────

export async function loadSqlQueries(
  datasetName: string,
  opts: { savedOnly?: boolean; limit?: number } = {}
): Promise<LocalSqlQuery[]> {
  const local = (await getLocalSqlQueries(datasetName)).filter(q => !opts.savedOnly || q.is_saved);
  if (!(await canCloudSync(datasetName, datasetName))) return local.slice(0, opts.limit ?? 50);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return local.slice(0, opts.limit ?? 50);
  let q = supabase.from('sql_queries').select('*').eq('user_id', user.id).eq('dataset_name', datasetName);
  if (opts.savedOnly) q = q.eq('is_saved', true);
  const { data } = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 50);
  const cloud = (data ?? []) as LocalSqlQuery[];
  return [...cloud, ...local].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, opts.limit ?? 50);
}

export async function recordSqlQuery(
  datasetName: string,
  entry: Omit<LocalSqlQuery, 'id' | 'created_at'>
): Promise<void> {
  const allowed = await canCloudSync(datasetName, datasetName);
  if (!allowed) {
    await appendLocalSqlQuery(datasetName, entry);
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { await appendLocalSqlQuery(datasetName, entry); return; }
  const { error } = await supabase.from('sql_queries').insert({
    user_id: user.id,
    dataset_name: datasetName,
    query: entry.query,
    is_saved: entry.is_saved,
    is_favorite: entry.is_favorite,
    name: entry.name,
    execution_time_ms: entry.execution_time_ms,
    row_count: entry.row_count,
  });
  if (!error) await recordDatasetCloudSync(datasetName, datasetName);
}

export async function toggleSqlQueryFavorite(datasetName: string, id: string, current: boolean): Promise<void> {
  if (typeof id === 'string' && id.startsWith('local-')) {
    await updateLocalSqlQuery(datasetName, id, { is_favorite: !current });
    return;
  }
  await supabase.from('sql_queries').update({ is_favorite: !current }).eq('id', id);
}

export async function deleteSqlQuery(datasetName: string, id: string): Promise<void> {
  if (typeof id === 'string' && id.startsWith('local-')) {
    await deleteLocalSqlQuery(datasetName, id);
    return;
  }
  await supabase.from('sql_queries').delete().eq('id', id);
}
