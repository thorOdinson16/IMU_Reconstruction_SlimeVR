import type { SessionRecord, SessionActivityType } from '../platform';
import { getActiveProfile } from '../platform';
import { getSessionsForUser, searchSessions, updateSessionNotes, deleteSession, getAllSessions } from '../platform';
import { icon } from './icons';
import { miniBar } from './chart-utils';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function activityIcon(type: string): string {
  return type === 'yoga' ? icon('yoga') : icon('physio');
}

export class SessionBrowser {
  readonly element: HTMLElement;
  private searchInput: HTMLInputElement;
  private filterActivity: HTMLSelectElement;
  private filterCategory: HTMLSelectElement;
  private sessionList: HTMLElement;
  private detailPanel: HTMLElement;
  private detailBackBtn: HTMLButtonElement;
  private emptyState: HTMLElement;
  private viewTimelineBtn: HTMLButtonElement;
  private viewListBtn: HTMLButtonElement;
  private isTimelineView = false;
  private selectedSessionId: string | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'session-browser page-enter';
    this.element.innerHTML = `
      <div class="sb-header">
        <div>
          <span class="eyebrow accent">History</span>
          <h2>Session Timeline</h2>
        </div>
        <div class="sb-view-toggle">
          <button class="sb-toggle-btn sb-toggle-active" data-sb-view="list" title="List view">${icon('sessions')}</button>
          <button class="sb-toggle-btn" data-sb-view="timeline" title="Timeline view">${icon('chevron')}</button>
        </div>
      </div>

      <div class="sb-controls">
        <div class="sb-search-wrap">
          ${icon('spark', 'sb-search-icon')}
          <input type="text" class="sb-search" data-sb-search placeholder="Search sessions, exercises, categories..." />
        </div>
        <select class="sb-filter" data-sb-filter-activity>
          <option value="">All activities</option>
          <option value="yoga">Yoga</option>
          <option value="physiotherapy">Physiotherapy</option>
        </select>
        <select class="sb-filter" data-sb-filter-category>
          <option value="">All categories</option>
        </select>
      </div>

      <div class="sb-empty" data-sb-empty>
        ${icon('spark')}
        <strong>No sessions yet</strong>
        <span>Complete a yoga pose or physiotherapy exercise to see your history here.</span>
      </div>

      <div class="sb-content" data-sb-content>
        <div class="sb-list" data-sb-list></div>

        <div class="sb-detail" data-sb-detail style="display:none">
          <button class="sb-detail-back" data-sb-detail-back>${icon('chevron')}<span>Back to sessions</span></button>
          <div class="sb-detail-body" data-sb-detail-body></div>
        </div>
      </div>`;

    this.searchInput = this.element.querySelector<HTMLInputElement>('[data-sb-search]')!;
    this.filterActivity = this.element.querySelector<HTMLSelectElement>('[data-sb-filter-activity]')!;
    this.filterCategory = this.element.querySelector<HTMLSelectElement>('[data-sb-filter-category]')!;
    this.sessionList = this.element.querySelector<HTMLElement>('[data-sb-list]')!;
    this.detailPanel = this.element.querySelector<HTMLElement>('[data-sb-detail]')!;
    this.detailBackBtn = this.element.querySelector<HTMLButtonElement>('[data-sb-detail-back]')!;
    this.emptyState = this.element.querySelector<HTMLElement>('[data-sb-empty]')!;
    this.viewTimelineBtn = this.element.querySelector<HTMLButtonElement>('[data-sb-view="timeline"]')!;
    this.viewListBtn = this.element.querySelector<HTMLButtonElement>('[data-sb-view="list"]')!;

    this.element.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const card = t.closest<HTMLElement>('[data-sb-card]');
      if (t.closest('[data-sb-view]')) this.setView(t.closest<HTMLButtonElement>('[data-sb-view]')!.dataset.sbView!);
      else if (card) this.openDetail(card.dataset.sbCard!);
      else if (t.closest('[data-sb-detail-back]')) this.closeDetail();
      else if (t.closest('[data-sb-delete]') && card) {
        if (confirm('Delete this session?')) this.removeSession(card.dataset.sbCard!);
      }
    });

    this.searchInput.addEventListener('input', () => this.render());
    this.filterActivity.addEventListener('change', () => this.render());
    this.filterCategory.addEventListener('change', () => this.render());
  }

  refresh(): void {
    this.populateCategories();
    this.closeDetail();
    this.render();
  }

  destroy(): void { this.element.remove(); }

  private setView(view: string): void {
    this.isTimelineView = view === 'timeline';
    this.viewListBtn.classList.toggle('sb-toggle-active', !this.isTimelineView);
    this.viewTimelineBtn.classList.toggle('sb-toggle-active', this.isTimelineView);
    this.render();
  }

  private populateCategories(): void {
    const cats = new Set<string>();
    for (const s of getAllSessions()) { if (s.exerciseCategory) cats.add(s.exerciseCategory); }
    this.filterCategory.innerHTML = `<option value="">All categories</option>${[...cats].sort().map((c) => `<option value="${c}">${c}</option>`).join('')}`;
  }

  private render(): void {
    const active = getActiveProfile();
    if (!active) {
      this.sessionList.innerHTML = '';
      this.emptyState.style.display = 'block';
      this.element.querySelector<HTMLElement>('[data-sb-content]')!.style.display = 'none';
      return;
    }

    const query = this.searchInput.value.trim();
    const activityType = this.filterActivity.value as SessionActivityType | '';
    const category = this.filterCategory.value;

    let sessions = query || activityType || category
      ? searchSessions(query, {
          activityType: activityType || undefined,
          exerciseCategory: category || undefined,
        }).filter((s) => s.userId === active.id)
      : getSessionsForUser(active.id).sort((a, b) => b.date - a.date);

    if (sessions.length === 0) {
      this.sessionList.innerHTML = '';
      this.emptyState.style.display = 'block';
      this.element.querySelector<HTMLElement>('[data-sb-content]')!.style.display = 'none';
      return;
    }

    this.emptyState.style.display = 'none';
    this.element.querySelector<HTMLElement>('[data-sb-content]')!.style.display = 'grid';

    if (this.isTimelineView) {
      this.renderTimeline(sessions);
    } else {
      this.renderList(sessions);
    }
  }

  private renderList(sessions: SessionRecord[]): void {
    this.sessionList.innerHTML = sessions.map((s) => {
      const accPct = s.accuracy != null ? Math.round(s.accuracy * 100) : null;
      return `<div class="sb-card" data-sb-card="${s.id}">
        <div class="sb-card-icon">${activityIcon(s.activityType)}</div>
        <div class="sb-card-body">
          <div class="sb-card-top">
            <strong>${s.activityName}</strong>
            <span class="sb-card-date">${formatDate(s.date)}</span>
          </div>
          <div class="sb-card-meta">
            <span>${formatTime(s.durationSec)}</span>
            ${accPct != null ? `<span class="sb-acc-badge sb-acc-${accPct >= 80 ? 'high' : accPct >= 60 ? 'medium' : 'low'}">${accPct}%</span>` : ''}
            ${s.repCount != null ? `<span>${s.repCount} reps</span>` : ''}
            ${s.romMax != null ? `<span>${s.romMax.toFixed(0)}° max</span>` : ''}
            <span class="sb-card-category">${s.exerciseCategory ?? s.activityType}</span>
          </div>
          ${s.accuracy != null ? `<div class="sb-card-bar">${miniBar(s.accuracy, 1, 120, 3, s.accuracy >= 0.8 ? '#7aead5' : s.accuracy >= 0.6 ? '#e3a153' : '#ef7184')}</div>` : ''}
        </div>
        <button class="sb-card-delete" data-sb-delete title="Delete session">${icon('pulse')}</button>
      </div>`;
    }).join('');
  }

  private renderTimeline(sessions: SessionRecord[]): void {
    const groups = new Map<string, SessionRecord[]>();
    for (const s of sessions) {
      const day = formatDate(s.date);
      const list = groups.get(day) ?? [];
      list.push(s);
      groups.set(day, list);
    }

    let html = '';
    let idx = 0;
    for (const [day, daySessions] of groups) {
      html += `<div class="sb-timeline-group">
        <div class="sb-timeline-marker">
          <div class="sb-timeline-dot"></div>
          <div class="sb-timeline-line"></div>
        </div>
        <div class="sb-timeline-day">
          <span class="sb-timeline-date">${day}</span>
          <span class="sb-timeline-count">${daySessions.length} session${daySessions.length > 1 ? 's' : ''}</span>
        </div>
        <div class="sb-timeline-sessions">`;
      for (const s of daySessions) {
        const accPct = s.accuracy != null ? Math.round(s.accuracy * 100) : null;
        html += `<div class="sb-timeline-card" data-sb-card="${s.id}">
          <div class="sb-tl-card-left">${activityIcon(s.activityType)}</div>
          <div class="sb-tl-card-body">
            <strong>${s.activityName}</strong>
            <div class="sb-tl-card-meta">
              <span>${formatTime(s.durationSec)}</span>
              ${accPct != null ? `<span class="sb-acc-badge sb-acc-${accPct >= 80 ? 'high' : accPct >= 60 ? 'medium' : 'low'}">${accPct}%</span>` : ''}
              ${s.repCount != null ? `<span>${s.repCount} reps</span>` : ''}
            </div>
          </div>
        </div>`;
      }
      html += `</div></div>`;
      idx++;
    }
    this.sessionList.innerHTML = html;
  }

  private openDetail(sessionId: string): void {
    this.selectedSessionId = sessionId;
    const active = getActiveProfile();
    if (!active) return;
    const allSessions = getSessionsForUser(active.id);
    const session = allSessions.find((s) => s.id === sessionId);
    if (!session) return;

    const accPct = session.accuracy != null ? Math.round(session.accuracy * 100) : null;

    this.element.querySelector<HTMLElement>('[data-sb-list]')!.style.display = 'none';
    this.detailPanel.style.display = 'block';

    this.detailPanel.querySelector<HTMLElement>('[data-sb-detail-body]')!.innerHTML = `
      <div class="sb-detail-header">
        <div class="sb-detail-icon">${activityIcon(session.activityType)}</div>
        <div>
          <strong>${session.activityName}</strong>
          <span>${formatDate(session.date)} · ${formatTime(session.durationSec)}</span>
        </div>
      </div>

      <div class="sb-detail-metrics">
        <div class="sb-dm-card"><span class="eyebrow">Duration</span><strong>${formatTime(session.durationSec)}</strong></div>
        <div class="sb-dm-card"><span class="eyebrow">Type</span><strong style="text-transform:capitalize">${session.activityType}</strong></div>
        <div class="sb-dm-card"><span class="eyebrow">Category</span><strong>${session.exerciseCategory ?? '—'}</strong></div>
        <div class="sb-dm-card"><span class="eyebrow">Tracking</span><strong>${Math.round(session.trackingQuality * 100)}%</strong></div>
        ${accPct != null ? `<div class="sb-dm-card"><span class="eyebrow">Accuracy</span><strong class="sb-acc-${accPct >= 80 ? 'high' : accPct >= 60 ? 'medium' : 'low'}">${accPct}%</strong></div>` : ''}
        ${session.repCount != null ? `<div class="sb-dm-card"><span class="eyebrow">Reps</span><strong>${session.repCount}</strong></div>` : ''}
        ${session.holdDurationSec != null && session.holdDurationSec > 0 ? `<div class="sb-dm-card"><span class="eyebrow">Hold</span><strong>${formatTime(session.holdDurationSec)}</strong></div>` : ''}
      </div>

      ${session.romMax != null ? `
      <div class="sb-detail-section">
        <span class="eyebrow">Range of Motion</span>
        <div class="sb-detail-rom">
          <div class="sb-rom-item"><span>Maximum</span><strong>${session.romMax.toFixed(1)}°</strong></div>
          <div class="sb-rom-item"><span>Minimum</span><strong>${session.romMin?.toFixed(1) ?? '—'}°</strong></div>
          <div class="sb-rom-item"><span>Average</span><strong>${session.romAvg?.toFixed(1) ?? '—'}°</strong></div>
          ${session.maxVelocity != null ? `<div class="sb-rom-item"><span>Max Velocity</span><strong>${session.maxVelocity.toFixed(1)}°/s</strong></div>` : ''}
          ${session.avgVelocity != null ? `<div class="sb-rom-item"><span>Avg Velocity</span><strong>${session.avgVelocity.toFixed(1)}°/s</strong></div>` : ''}
        </div>
      </div>` : ''}

      ${session.jointBreakdown && session.jointBreakdown.length > 0 ? `
      <div class="sb-detail-section">
        <span class="eyebrow">Joint Breakdown</span>
        <div class="sb-detail-joints">
          ${session.jointBreakdown.map((j) => {
            const jpct = Math.round(j.accuracy * 100);
            return `<div class="sb-joint-row"><span>${j.jointId.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span><div class="sb-joint-bar"><div class="sb-joint-fill sb-acc-${jpct >= 80 ? 'high' : jpct >= 60 ? 'medium' : 'low'}" style="width:${jpct}%"></div></div><span class="sb-acc-${jpct >= 80 ? 'high' : jpct >= 60 ? 'medium' : 'low'}">${jpct}%</span></div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <div class="sb-detail-section">
        <span class="eyebrow">Notes</span>
        <textarea class="sb-detail-notes" data-sb-notes rows="3" placeholder="Add session notes...">${session.notes}</textarea>
      </div>

      <div class="sb-detail-section">
        <span class="eyebrow">Metrics</span>
        <div class="sb-detail-metrics-raw">
          ${Object.entries(session.metrics).length > 0
            ? Object.entries(session.metrics).map(([k, v]) => `<div class="sb-metric-row"><span>${k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span><strong>${v.toFixed(2)}</strong></div>`).join('')
            : '<span class="sb-muted">No additional metrics recorded</span>'}
        </div>
      </div>

      <div class="sb-detail-section">
        <span class="eyebrow">Avatar Replay</span>
        <div class="sb-replay-placeholder">${icon('pulse')}<span>Avatar replay will be available in a future update.</span></div>
      </div>`;

    const notesField = this.detailPanel.querySelector<HTMLTextAreaElement>('[data-sb-notes]');
    if (notesField) {
      notesField.addEventListener('input', () => {
        updateSessionNotes(active.id, sessionId, notesField.value);
      });
    }
  }

  private closeDetail(): void {
    this.selectedSessionId = null;
    this.element.querySelector<HTMLElement>('[data-sb-list]')!.style.display = '';
    this.detailPanel.style.display = 'none';
  }

  private removeSession(sessionId: string): void {
    const active = getActiveProfile();
    if (!active) return;
    deleteSession(active.id, sessionId);
    if (this.selectedSessionId === sessionId) this.closeDetail();
    this.render();
  }
}
