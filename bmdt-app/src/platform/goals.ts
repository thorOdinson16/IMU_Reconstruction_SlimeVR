import { loadJSON, saveJSON } from './store';

export type GoalType = 'sessions_completed' | 'accuracy_target' | 'rom_target' | 'streak_days';
export type GoalStatus = 'active' | 'completed' | 'abandoned';

export interface Goal {
  id: string;
  userId: string;
  type: GoalType;
  target: number;
  current: number;
  activityType: string | null;
  exerciseId: string | null;
  label: string;
  startDate: number;
  targetDate: number | null;
  completedDate: number | null;
  status: GoalStatus;
  createdAt: number;
}

function goalKey(userId: string): string {
  return `goals_${userId}`;
}

export function createGoal(data: Omit<Goal, 'id' | 'current' | 'status' | 'completedDate' | 'createdAt'>): Goal {
  const goal: Goal = {
    ...data, id: crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    current: 0, status: 'active', completedDate: null, createdAt: Date.now(),
  };
  const all = getGoals(goal.userId);
  all.push(goal);
  saveJSON(goalKey(goal.userId), all);
  return goal;
}

export function getGoals(userId: string): Goal[] {
  return loadJSON<Goal[]>(goalKey(userId)) ?? [];
}

export function getActiveGoals(userId: string): Goal[] {
  return getGoals(userId).filter((g) => g.status === 'active');
}

export function updateGoalProgress(userId: string, goalId: string, current: number): Goal | null {
  const all = getGoals(userId);
  const idx = all.findIndex((g) => g.id === goalId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], current: Math.min(current, all[idx].target) };
  if (all[idx].current >= all[idx].target && all[idx].status === 'active') {
    all[idx] = { ...all[idx], status: 'completed', completedDate: Date.now() };
  }
  saveJSON(goalKey(userId), all);
  return all[idx];
}

export function abandonGoal(userId: string, goalId: string): Goal | null {
  const all = getGoals(userId);
  const idx = all.findIndex((g) => g.id === goalId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], status: 'abandoned' };
  saveJSON(goalKey(userId), all);
  return all[idx];
}

export function deleteGoal(userId: string, goalId: string): void {
  const all = getGoals(userId).filter((g) => g.id !== goalId);
  saveJSON(goalKey(userId), all);
}

export function suggestGoalsForUser(userId: string, sessions: Array<{ activityType: string; accuracy: number | null; romMax: number | null; activityName: string }>): Goal[] {
  const existing = getGoals(userId);
  const suggestions: Goal[] = [];
  const existingLabels = new Set(existing.map((g) => g.label));

  if (!existingLabels.has('Complete 10 Sessions')) {
    const count = sessions.length;
    if (count < 10) suggestions.push({
      id: '', userId, type: 'sessions_completed', target: 10, current: count,
      activityType: null, exerciseId: null, label: 'Complete 10 Sessions',
      startDate: Date.now(), targetDate: null, completedDate: null,
      status: 'active', createdAt: Date.now(),
    });
  }

  const yogaSessions = sessions.filter((s) => s.activityType === 'yoga' && s.accuracy != null);
  if (yogaSessions.length > 0 && !existingLabels.has('Reach 90% Pose Accuracy')) {
    const best = Math.max(...yogaSessions.map((s) => s.accuracy!));
    if (best < 90) suggestions.push({
      id: '', userId, type: 'accuracy_target', target: 90, current: Math.round(best),
      activityType: 'yoga', exerciseId: null, label: 'Reach 90% Pose Accuracy',
      startDate: Date.now(), targetDate: null, completedDate: null,
      status: 'active', createdAt: Date.now(),
    });
  }

  return suggestions;
}
