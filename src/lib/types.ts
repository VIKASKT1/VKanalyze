export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface ColumnStats {
  mean?: number;
  median?: number;
  mode?: string | number;
  min?: number | string;
  max?: number | string;
  stdDev?: number;
  count: number;
  nullCount: number;
  uniqueCount: number;
}

export interface ProfileData {
  statistics: Record<string, ColumnStats>;
  qualityScore: number;
  missingValues: Record<string, number>;
  uniqueValues: Record<string, number>;
  duplicateRows: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface CleaningRule {
  id: string;
  type: string;
  column?: string;
  value?: string | number;
  columns?: string[]; // for multi-column rules like remove_duplicates_by_columns
  enabled: boolean;
  label?: string;
  // Extra params
  params?: Record<string, unknown>;
}

export interface CleaningRecommendation {
  type: string;
  column?: string;
  reason: string;
  params?: Record<string, unknown>;
}

export interface CleaningWorkflow {
  id: string;
  name: string;
  rules: CleaningRule[];
  createdAt: number;
  updatedAt: number;
}

export interface InsightItem {
  title: string;
  description: string;
  severity?: 'info' | 'warning' | 'critical';
  recommendation?: string;
}

export interface Activity {
  id: string;
  action: string;
  details: string;
  created_at: string;
}
