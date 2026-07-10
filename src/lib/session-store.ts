// Phase 4: session continuity. Previously the app only kept dataset
// *metadata* in localStorage and explicitly discarded the parsed rows on
// every refresh (see the removed "Rows no longer stored — user must
// re-upload" behavior) while VKAnalyze's own Legal page claimed the opposite
// ("stores your current analysis... so you don't lose work on page
// refresh"). This module makes that claim true: the full parsed dataset is
// cached in IndexedDB — which, unlike localStorage, isn't limited to a few
// MB — so a refreshed tab restores exactly where the user left off, fully
// client-side.

import { idbGet, idbSet, idbDelete, STORES } from './db';
import type { ParsedData } from './data-processing';
import type { ProfileData } from './types';

const ACTIVE_SESSION_KEY = 'active-session';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours, matching the prior localStorage behavior

interface ActiveSessionSnapshot {
  fileName: string;
  fileSize: number;
  fileType: string;
  parsed: ParsedData;
  profile: ProfileData;
  savedAt: number;
}

export async function saveActiveSession(
  file: { name: string; size: number; type: string },
  parsed: ParsedData,
  profile: ProfileData
): Promise<void> {
  const snapshot: ActiveSessionSnapshot = {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    parsed,
    profile,
    savedAt: Date.now(),
  };
  try {
    await idbSet(STORES.DATASETS, ACTIVE_SESSION_KEY, snapshot);
  } catch {
    // Best-effort — never block the UI if storage is full/unavailable
  }
}

/**
 * Restores the last working session, if any and not expired. Reconstructs a
 * real File object (zero-filled, matching the original byte length) purely
 * so downstream UI that reads file.name/file.size keeps working — the
 * original bytes are never kept around; only the already-parsed rows are.
 */
export async function loadActiveSession(): Promise<{
  file: File;
  parsed: ParsedData;
  profile: ProfileData;
} | null> {
  try {
    const snapshot = await idbGet<ActiveSessionSnapshot>(STORES.DATASETS, ACTIVE_SESSION_KEY);
    if (!snapshot) return null;
    if (Date.now() - snapshot.savedAt > MAX_AGE_MS) {
      await clearActiveSession();
      return null;
    }
    const file = new File([new Uint8Array(snapshot.fileSize)], snapshot.fileName, {
      type: snapshot.fileType,
    });
    return { file, parsed: snapshot.parsed, profile: snapshot.profile };
  } catch {
    return null;
  }
}

export async function clearActiveSession(): Promise<void> {
  try {
    await idbDelete(STORES.DATASETS, ACTIVE_SESSION_KEY);
    await idbDelete(STORES.DATASETS, DERIVED_STATE_KEY);
  } catch {
    // Ignore
  }
}

// ── Derived workspace state (clean/merge/filter results, scroll, selection) ──
// The base parsed dataset is restored via saveActiveSession/loadActiveSession
// above; this captures the *results* of in-workspace operations the user has
// already run (cleaning rules applied, a merge completed, filters applied)
// plus scroll position and any selected rows/columns, so a hard refresh
// resumes from exactly where those operations left things — not just the
// original upload.

const DERIVED_STATE_KEY = 'derived-workspace-state';

export interface DerivedWorkspaceState {
  cleanedRows: Record<string, unknown>[] | null;
  cleanedProfile: ProfileData | null;
  // Column list as of the last cleaning pass (tracks drop/rename/split-column
  // rules). Optional so snapshots saved before this field existed still load.
  cleanedColumns?: string[] | null;
  filteredRows: Record<string, unknown>[] | null;
  mergedRows: Record<string, unknown>[] | null;
  mergedColumns: string[] | null;
  scrollY: number;
}

interface DerivedWorkspaceSnapshot extends DerivedWorkspaceState {
  savedAt: number;
}

export async function saveDerivedWorkspaceState(state: DerivedWorkspaceState): Promise<void> {
  try {
    const snapshot: DerivedWorkspaceSnapshot = { ...state, savedAt: Date.now() };
    await idbSet(STORES.DATASETS, DERIVED_STATE_KEY, snapshot);
  } catch {
    // Best-effort
  }
}

export async function loadDerivedWorkspaceState(): Promise<DerivedWorkspaceState | null> {
  try {
    const snapshot = await idbGet<DerivedWorkspaceSnapshot>(STORES.DATASETS, DERIVED_STATE_KEY);
    if (!snapshot) return null;
    if (Date.now() - snapshot.savedAt > MAX_AGE_MS) return null;
    return {
      cleanedRows: snapshot.cleanedRows,
      cleanedProfile: snapshot.cleanedProfile,
      cleanedColumns: snapshot.cleanedColumns ?? null,
      filteredRows: snapshot.filteredRows,
      mergedRows: snapshot.mergedRows,
      mergedColumns: snapshot.mergedColumns,
      scrollY: snapshot.scrollY,
    };
  } catch {
    return null;
  }
}

// ── Active tab persistence ───────────────────────────────────────────────────
// Ensures that when users navigate away (profile, settings, admin, etc.)
// and return, they land on the same tab they were viewing.

const WORKSPACE_STATE_KEY = 'workspace-ui-state';

interface WorkspaceUIState {
  activeTab: string;
  savedAt: number;
}

export async function saveWorkspaceTab(tab: string): Promise<void> {
  try {
    const s: WorkspaceUIState = { activeTab: tab, savedAt: Date.now() };
    await idbSet(STORES.PREFERENCES, WORKSPACE_STATE_KEY, s);
  } catch { /* silent */ }
}

export async function loadWorkspaceTab(): Promise<string | null> {
  try {
    const s = await idbGet<WorkspaceUIState>(STORES.PREFERENCES, WORKSPACE_STATE_KEY);
    if (!s) return null;
    if (Date.now() - s.savedAt > 24 * 60 * 60 * 1000) return null;
    return s.activeTab;
  } catch { return null; }
}

// ── SQL editor draft persistence ─────────────────────────────────────────────
// Keeps the in-progress (unsaved/unrun) query text per dataset so a hard
// refresh of the page doesn't wipe out a query the user was still writing.

function sqlDraftKey(datasetName: string): string {
  return `sql-draft:${datasetName}`;
}

export async function saveSqlDraft(datasetName: string, query: string): Promise<void> {
  try {
    await idbSet(STORES.PREFERENCES, sqlDraftKey(datasetName), { query, savedAt: Date.now() });
  } catch { /* silent */ }
}

export async function loadSqlDraft(datasetName: string): Promise<string | null> {
  try {
    const s = await idbGet<{ query: string; savedAt: number }>(STORES.PREFERENCES, sqlDraftKey(datasetName));
    if (!s) return null;
    if (Date.now() - s.savedAt > MAX_AGE_MS) return null;
    return s.query;
  } catch { return null; }
}

// ── Filter / pivot config persistence ────────────────────────────────────────
// Small, fully-serializable UI configuration (not data) for the Filters and
// Pivot tabs, keyed per dataset, so a hard page refresh mid-edit doesn't
// throw away rules/field selections the user hasn't applied yet.

export interface FilterTabConfig {
  rules: Array<{
    id: string;
    column: string;
    operator: string;
    value: string;
    value2: string;
    enabled: boolean;
  }>;
  logic: 'AND' | 'OR';
}

function filterConfigKey(datasetName: string): string {
  return `filter-config:${datasetName}`;
}

export async function saveFilterConfig(datasetName: string, config: FilterTabConfig): Promise<void> {
  try {
    await idbSet(STORES.PREFERENCES, filterConfigKey(datasetName), { ...config, savedAt: Date.now() });
  } catch { /* silent */ }
}

export async function loadFilterConfig(datasetName: string): Promise<FilterTabConfig | null> {
  try {
    const s = await idbGet<FilterTabConfig & { savedAt: number }>(STORES.PREFERENCES, filterConfigKey(datasetName));
    if (!s) return null;
    if (Date.now() - s.savedAt > MAX_AGE_MS) return null;
    const { rules, logic } = s;
    return { rules, logic };
  } catch { return null; }
}

export interface PivotTabConfig {
  rowField: string;
  colField: string;
  valueField: string;
  aggFn: string;
}

function pivotConfigKey(datasetName: string): string {
  return `pivot-config:${datasetName}`;
}

export async function savePivotConfig(datasetName: string, config: PivotTabConfig): Promise<void> {
  try {
    await idbSet(STORES.PREFERENCES, pivotConfigKey(datasetName), { ...config, savedAt: Date.now() });
  } catch { /* silent */ }
}

export async function loadPivotConfig(datasetName: string): Promise<PivotTabConfig | null> {
  try {
    const s = await idbGet<PivotTabConfig & { savedAt: number }>(STORES.PREFERENCES, pivotConfigKey(datasetName));
    if (!s) return null;
    if (Date.now() - s.savedAt > MAX_AGE_MS) return null;
    const { rowField, colField, valueField, aggFn } = s;
    return { rowField, colField, valueField, aggFn };
  } catch { return null; }
}
