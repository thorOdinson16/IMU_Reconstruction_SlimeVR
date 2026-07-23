import { loadJSON, saveJSON, listKeys } from './store';

export type SessionActivityType = 'yoga' | 'physiotherapy';

export interface SessionRecord {
  id: string;
  userId: string;
  activityType: SessionActivityType;
  activityId: string;
  activityName: string;
  date: number;
  durationSec: number;
  trackingQuality: number;
  accuracy: number | null;
  maxAccuracy: number | null;
  romMax: number | null;
  romMin: number | null;
  romAvg: number | null;
  repCount: number | null;
  holdDurationSec: number | null;
  maxVelocity: number | null;
  avgVelocity: number | null;
  notes: string;
  status: 'completed' | 'partial';
  jointBreakdown: Array<{ jointId: string; accuracy: number }> | null;
  metrics: Record<string, number>;
  exerciseCategory: string | null;
}

export function createSession(data: Omit<SessionRecord, 'id' | 'date'>): SessionRecord {
  const session: SessionRecord = {
    ...data,
    id: crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: Date.now(),
  };
  const all = getAllSessions();
  all.push(session);
  saveJSON(sessionKey(data.userId), all);
  return session;
}

export function getSessionsForUser(userId: string): SessionRecord[] {
  return loadJSON<SessionRecord[]>(sessionKey(userId)) ?? [];
}

export function getSession(userId: string, sessionId: string): SessionRecord | null {
  const all = getSessionsForUser(userId);
  return all.find((s) => s.id === sessionId) ?? null;
}

export function updateSessionNotes(userId: string, sessionId: string, notes: string): SessionRecord | null {
  const all = getSessionsForUser(userId);
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], notes };
  saveJSON(sessionKey(userId), all);
  return all[idx];
}

export function deleteSession(userId: string, sessionId: string): void {
  const all = getSessionsForUser(userId).filter((s) => s.id !== sessionId);
  saveJSON(sessionKey(userId), all);
}

export function getAllSessions(): SessionRecord[] {
  const keys = listKeys('sessions_');
  const all: SessionRecord[] = [];
  for (const k of keys) {
    const sessions = loadJSON<SessionRecord[]>(k) ?? [];
    all.push(...sessions);
  }
  return all;
}

export function searchSessions(query: string, filters?: { activityType?: SessionActivityType; dateFrom?: number; dateTo?: number; minAccuracy?: number; exerciseCategory?: string }): SessionRecord[] {
  let results = getAllSessions();
  const q = query.toLowerCase();
  if (q) results = results.filter((s) => s.activityName.toLowerCase().includes(q) || s.activityType.includes(q) || (s.exerciseCategory?.toLowerCase() ?? '').includes(q));
  if (filters?.activityType) results = results.filter((s) => s.activityType === filters.activityType);
  if (filters?.dateFrom) results = results.filter((s) => s.date >= filters.dateFrom!);
  if (filters?.dateTo) results = results.filter((s) => s.date <= filters.dateTo!);
  if (filters?.minAccuracy != null) results = results.filter((s) => s.accuracy != null && s.accuracy >= filters.minAccuracy!);
  if (filters?.exerciseCategory) results = results.filter((s) => s.exerciseCategory === filters.exerciseCategory);
  return results.sort((a, b) => b.date - a.date);
}

export function getRecentSessions(userId: string, limit = 20): SessionRecord[] {
  return getSessionsForUser(userId).sort((a, b) => b.date - a.date).slice(0, limit);
}

function sessionKey(userId: string): string {
  return `sessions_${userId}`;
}
