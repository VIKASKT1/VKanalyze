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
  enabled: boolean;
  label?: string;
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
