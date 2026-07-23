import type { SessionRecord } from '../platform';
import { getActiveProfile, getSessionsForUser, createGoal, getGoals, getActiveGoals, updateGoalProgress, abandonGoal } from '../platform';
import { icon } from './icons';
import { barChart, lineChart, progressRing } from './chart-utils';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function daysAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n); return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff); d.setHours(0,0,0,0); return d;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}m`;
}

const GOAL_SUGGESTIONS = [
  { type: 'sessions_completed' as const, label: 'Complete 10 Sessions', target: 10, activityType: null as string | null, exerciseId: null as string | null },
  { type: 'sessions_completed' as const, label: 'Complete 20 Yoga Sessions', target: 20, activityType: 'yoga', exerciseId: null },
  { type: 'sessions_completed' as const, label: 'Complete 15 Physiotherapy Sessions', target: 15, activityType: 'physiotherapy', exerciseId: null },
  { type: 'accuracy_target' as const, label: 'Reach 90% Pose Accuracy', target: 90, activityType: 'yoga', exerciseId: null },
  { type: 'accuracy_target' as const, label: 'Reach 95% Pose Accuracy', target: 95, activityType: 'yoga', exerciseId: null },
  { type: 'rom_target' as const, label: 'Improve Shoulder ROM to 160°', target: 160, activityType: 'physiotherapy', exerciseId: 'shoulder-flexion-l' },
  { type: 'rom_target' as const, label: 'Improve Knee Flexion to 130°', target: 130, activityType: 'physiotherapy', exerciseId: 'knee-flexion-l' },
];

export class ProgressDashboard {
  readonly element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'progress-dashboard page-enter';
    this.element.innerHTML = `
      <div class="pd-header">
        <div>
          <span class="eyebrow accent">Analytics</span>
          <h2>Progress Dashboard</h2>
        </div>
        <div class="pd-period">
          <button class="pd-period-btn pd-period-active" data-pd-period="week">Week</button>
          <button class="pd-period-btn" data-pd-period="month">Month</button>
        </div>
      </div>

      <div class="pd-stats" data-pd-stats></div>

      <div class="pd-charts">
        <div class="pd-chart-card glass-panel">
          <div class="pd-chart-header"><span class="eyebrow">Weekly Activity</span></div>
          <div class="pd-chart-body" data-pd-chart-weekly></div>
        </div>
        <div class="pd-chart-card glass-panel">
          <div class="pd-chart-header"><span class="eyebrow">Accuracy Trend</span></div>
          <div class="pd-chart-body" data-pd-chart-accuracy></div>
        </div>
        <div class="pd-chart-card glass-panel">
          <div class="pd-chart-header"><span class="eyebrow">Exercise Frequency</span></div>
          <div class="pd-chart-body" data-pd-chart-frequency></div>
        </div>
        <div class="pd-chart-card glass-panel">
          <div class="pd-chart-header"><span class="eyebrow">ROM Progress</span></div>
          <div class="pd-chart-body" data-pd-chart-rom></div>
        </div>
      </div>

      <div class="pd-goals-section">
        <div class="pd-section-header">
          <span class="eyebrow">Goals</span>
          <button class="pd-add-goal-btn" data-pd-add-goal>${icon('plus')}<span>Add Goal</span></button>
        </div>
        <div class="pd-goals" data-pd-goals></div>
        <div class="pd-goal-picker" data-pd-goal-picker style="display:none">
          <span class="eyebrow">Suggested Goals</span>
          <div class="pd-goal-suggestions" data-pd-goal-suggestions></div>
        </div>
      </div>`;

    this.element.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const periodBtn = t.closest<HTMLButtonElement>('[data-pd-period]');
      if (periodBtn) this.setPeriod(periodBtn.dataset.pdPeriod!);
      else if (t.closest('[data-pd-add-goal]')) this.toggleGoalPicker();
      else if (t.closest('[data-pd-suggest]')) this.addSuggestedGoal(t.closest<HTMLElement>('[data-pd-suggest]')!.dataset.pdSuggest!);
      else if (t.closest('[data-pd-abandon]')) this.abandonGoal(t.closest<HTMLElement>('[data-pd-abandon]')!.dataset.pdAbandon!);
    });

    this.refresh();
  }

  private period: 'week' | 'month' = 'week';

  refresh(): void {
    this.render();
  }

  destroy(): void { this.element.remove(); }

  private setPeriod(p: string): void {
    this.period = p as 'week' | 'month';
    this.element.querySelectorAll<HTMLButtonElement>('[data-pd-period]').forEach((btn) => btn.classList.toggle('pd-period-active', btn.dataset.pdPeriod === p));
    this.render();
  }

  private toggleGoalPicker(): void {
    const picker = this.element.querySelector<HTMLElement>('[data-pd-goal-picker]')!;
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    if (picker.style.display === 'block') this.renderGoalSuggestions();
  }

  private renderGoalSuggestions(): void {
    const active = getActiveProfile();
    if (!active) return;
    const existing = getGoals(active.id);
    const existingLabels = new Set(existing.map((g) => g.label));
    const container = this.element.querySelector<HTMLElement>('[data-pd-goal-suggestions]')!;
    container.innerHTML = GOAL_SUGGESTIONS.filter((g) => !existingLabels.has(g.label)).map((g) =>
      `<button class="pd-suggest-btn" data-pd-suggest="${g.label}|${g.type}|${g.target}|${g.activityType ?? ''}|${g.exerciseId ?? ''}">${icon('plus')}<span>${g.label}</span></button>`
    ).join('') || '<span class="pd-muted">No more suggestions available</span>';
  }

  private addSuggestedGoal(raw: string): void {
    const active = getActiveProfile();
    if (!active) return;
    const parts = raw.split('|');
    if (parts.length < 3) return;
    const label = parts[0]; const type = parts[1] as any; const target = parseInt(parts[2]); const activityType = parts[3] || null; const exerciseId = parts[4] || null;
    const sessions = getSessionsForUser(active.id);
    const current = type === 'sessions_completed'
      ? (activityType ? sessions.filter((s) => s.activityType === activityType).length : sessions.length)
      : 0;
    createGoal({ userId: active.id, type, target, activityType, exerciseId, label, startDate: Date.now(), targetDate: null });
    this.element.querySelector<HTMLElement>('[data-pd-goal-picker]')!.style.display = 'none';
    this.render();
  }

  private abandonGoal(goalId: string): void {
    const active = getActiveProfile();
    if (!active) return;
    abandonGoal(active.id, goalId);
    this.render();
  }

  private render(): void {
    const active = getActiveProfile();
    if (!active) {
      this.element.querySelector<HTMLElement>('[data-pd-stats]')!.innerHTML = `<div class="pd-empty-state"><span class="eyebrow">No active profile</span><p>Create or select a profile to view progress analytics.</p></div>`;
      return;
    }

    const sessions = getSessionsForUser(active.id);
    const now = Date.now();
    const periodMs = this.period === 'week' ? 7 * 86400000 : 30 * 86400000;
    const recentSessions = sessions.filter((s) => s.date > now - periodMs);

    this.renderStats(sessions, recentSessions);
    this.renderCharts(recentSessions, sessions);
    this.renderGoals(active.id);
  }

  private renderStats(all: SessionRecord[], recent: SessionRecord[]): void {
    const totalSessions = all.length;
    const totalDuration = all.reduce((s, a) => s + a.durationSec, 0);
    const yogaCount = all.filter((s) => s.activityType === 'yoga').length;
    const physioCount = all.filter((s) => s.activityType === 'physiotherapy').length;
    const avgAccuracy = all.filter((s) => s.accuracy != null).reduce((s, a) => s + (a.accuracy ?? 0), 0) / (all.filter((s) => s.accuracy != null).length || 1);
    const bestAccuracy = all.filter((s) => s.accuracy != null).reduce((max, s) => Math.max(max, s.accuracy ?? 0), 0);
    const recentAvg = recent.filter((s) => s.accuracy != null).reduce((s, a) => s + (a.accuracy ?? 0), 0) / (recent.filter((s) => s.accuracy != null).length || 1);
    const avgTracking = all.reduce((s, a) => s + a.trackingQuality, 0) / (all.length || 1);
    const sessionStreak = this.calculateStreak(all);

    const stats = [
      { label: 'Total Sessions', value: String(totalSessions), sub: `${recent.length} this ${this.period}` },
      { label: 'Total Time', value: formatDuration(totalDuration), sub: `${yogaCount} yoga · ${physioCount} physio` },
      { label: 'Avg Accuracy', value: `${Math.round(avgAccuracy * 100)}%`, sub: `Best ${Math.round(bestAccuracy * 100)}%` },
      { label: 'Recent Accuracy', value: `${Math.round(recentAvg * 100)}%`, sub: `${recent.filter((s) => s.accuracy != null).length} sessions` },
      { label: 'Tracking Quality', value: `${Math.round(avgTracking * 100)}%`, sub: 'Overall average' },
      { label: 'Session Streak', value: `${sessionStreak} day${sessionStreak !== 1 ? 's' : ''}`, sub: 'Consecutive days' },
    ];

    this.element.querySelector<HTMLElement>('[data-pd-stats]')!.innerHTML = stats.map((s) =>
      `<div class="pd-stat-card glass-panel"><span class="eyebrow">${s.label}</span><strong>${s.value}</strong><span class="pd-stat-sub">${s.sub}</span></div>`
    ).join('');
  }

  private renderCharts(recent: SessionRecord[], all: SessionRecord[]): void {
    const weeklyEl = this.element.querySelector<HTMLElement>('[data-pd-chart-weekly]')!;
    const accuracyEl = this.element.querySelector<HTMLElement>('[data-pd-chart-accuracy]')!;
    const frequencyEl = this.element.querySelector<HTMLElement>('[data-pd-chart-frequency]')!;
    const romEl = this.element.querySelector<HTMLElement>('[data-pd-chart-rom]')!;

    const dayMap = new Map<string, number>();
    const weekStart = startOfWeek(new Date());
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      dayMap.set(d.toDateString(), 0);
    }
    for (const s of recent) {
      const key = new Date(s.date).toDateString();
      if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const dayValues = [...dayMap.values()];
    const maxDay = Math.max(...dayValues, 1);
    weeklyEl.innerHTML = dayValues.some((v) => v > 0)
      ? barChart(dayValues, maxDay, 220, 80, '#6c83ff', 'Sessions per day')
      : '<span class="pd-chart-empty">No activity this week</span>';

    const accuracySessions = all.filter((s) => s.accuracy != null).sort((a, b) => a.date - b.date);
    if (accuracySessions.length >= 2) {
      const accuracyValues = accuracySessions.map((s) => Math.round(s.accuracy! * 100));
      accuracyEl.innerHTML = lineChart(accuracyValues, 220, 80, '#7aead5', 'Accuracy over time');
    } else {
      accuracyEl.innerHTML = '<span class="pd-chart-empty">Complete yoga sessions to see accuracy trends</span>';
    }

    const freqMap = new Map<string, number>();
    for (const s of all) {
      const name = s.activityName;
      freqMap.set(name, (freqMap.get(name) ?? 0) + 1);
    }
    const freqSorted = [...freqMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (freqSorted.length > 0) {
      const freqValues = freqSorted.map(([, v]) => v);
      const maxFreq = Math.max(...freqValues, 1);
      frequencyEl.innerHTML = barChart(freqValues, maxFreq, 220, 80, '#e3a153', 'Exercise frequency');
    } else {
      frequencyEl.innerHTML = '<span class="pd-chart-empty">Complete sessions to see frequency</span>';
    }

    const romSessions = all.filter((s) => s.romMax != null).sort((a, b) => a.date - b.date);
    if (romSessions.length >= 2) {
      const romValues = romSessions.map((s) => Math.round(s.romMax!));
      romEl.innerHTML = lineChart(romValues, 220, 80, '#ef7184', 'ROM progress');
    } else {
      romEl.innerHTML = '<span class="pd-chart-empty">Complete physiotherapy sessions to see ROM progress</span>';
    }
  }

  private renderGoals(userId: string): void {
    const goals = getGoals(userId).filter((g) => g.status !== 'abandoned');
    const container = this.element.querySelector<HTMLElement>('[data-pd-goals]')!;
    if (goals.length === 0) {
      container.innerHTML = '<div class="pd-goals-empty"><span class="eyebrow">No goals yet</span><p>Add a goal to track your progress over time.</p></div>';
      return;
    }
    container.innerHTML = goals.map((g) => {
      const pct = g.target > 0 ? g.current / g.target : 0;
      const isComplete = g.status === 'completed';
      return `<div class="pd-goal-card glass-panel ${isComplete ? 'pd-goal-done' : ''}">
        <div class="pd-goal-ring">${progressRing(pct, 40, 3, isComplete ? '#7aead5' : '#6c83ff')}</div>
        <div class="pd-goal-body">
          <strong>${g.label}</strong>
          <span>${g.current} / ${g.target} ${isComplete ? '✓' : ''}</span>
          <div class="pd-goal-bar"><div class="pd-goal-fill" style="width:${Math.min(100, pct * 100)}%"></div></div>
        </div>
        ${!isComplete ? `<button class="pd-goal-abandon" data-pd-abandon="${g.id}" title="Abandon goal">${icon('pulse')}</button>` : ''}
      </div>`;
    }).join('');
  }

  private calculateStreak(sessions: SessionRecord[]): number {
    if (sessions.length === 0) return 0;
    const daySet = new Set<number>();
    for (const s of sessions) {
      daySet.add(new Date(s.date).setHours(0, 0, 0, 0));
    }
    const sorted = [...daySet].sort((a, b) => b - a);
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const diff = (sorted[i - 1] - sorted[i]) / 86400000;
      if (diff <= 1.5) streak++;
      else break;
    }
    return streak;
  }
}
