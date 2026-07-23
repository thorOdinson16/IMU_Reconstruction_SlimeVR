import { icon } from './icons';
import { getActiveProfile } from '../platform';
import type { AvatarRuntime } from './avatar-runtime';
import { loadSession, SessionRecorder, listSessions, deleteSession, renameSession } from '../platform/recording';
import type { SessionFile } from '../platform/session-format';
import { PlaybackEngine } from '../platform/replay';
import { ReplayTimeline } from './replay-timeline';
import { FrameInspector } from './frame-inspector';
import { AnalysisSummary } from './analysis-summary';
import { SessionComparison } from './session-comparison';
import { ReplayOverlays } from './replay-overlays';

export type LabTab = 'replay' | 'analyze' | 'compare';

export class BiomechanicsLab {
  readonly element: HTMLElement;

  private avatar: AvatarRuntime;
  private recorder: SessionRecorder;
  private engine: PlaybackEngine | null = null;
  private timeline: ReplayTimeline | null = null;
  private inspector: FrameInspector;
  private analysisSummary: AnalysisSummary;
  private comparison: SessionComparison;
  private overlays: ReplayOverlays;
  private unsubPose: (() => void) | null = null;
  private unsubFrame: (() => void) | null = null;

  private activeTab: LabTab = 'replay';
  private sessions: SessionFile[] = [];
  private activeSessionId: string | null = null;
  private recording = false;

  private mainArea: HTMLElement;
  private sessionPanel: HTMLElement;
  private timelineSlot: HTMLElement;
  private inspectorSlot: HTMLElement;
  private tabBar: HTMLElement;
  private avatarViewport: HTMLElement;
  private recBtn: HTMLButtonElement;
  private recStatus: HTMLElement;
  private renameInput: HTMLInputElement | null = null;

  constructor(avatar: AvatarRuntime, recorder: SessionRecorder) {
    this.avatar = avatar;
    this.recorder = recorder;
    this.inspector = new FrameInspector();
    this.analysisSummary = new AnalysisSummary();
    this.comparison = new SessionComparison();
    this.overlays = new ReplayOverlays();

    this.element = document.createElement('div');
    this.element.className = 'biomechanics-lab page-enter';
    this.element.innerHTML = this.buildLayout();
    this.mainArea = this.element.querySelector<HTMLElement>('[data-bl-main]')!;
    this.sessionPanel = this.element.querySelector<HTMLElement>('[data-bl-sessions]')!;
    this.timelineSlot = this.element.querySelector<HTMLElement>('[data-bl-timeline]')!;
    this.inspectorSlot = this.element.querySelector<HTMLElement>('[data-bl-inspector]')!;
    this.tabBar = this.element.querySelector<HTMLElement>('[data-bl-tabs]')!;
    this.avatarViewport = this.element.querySelector<HTMLElement>('[data-bl-viewport]')!;
    this.recBtn = this.element.querySelector<HTMLButtonElement>('[data-bl-rec]')!;
    this.recStatus = this.element.querySelector<HTMLElement>('[data-bl-rec-status]')!;

    this.avatarViewport.append(this.avatar.element);
    this.inspectorSlot.append(this.inspector.element);
    this.setupTabBar();
    this.setupControls();
    this.refresh();

    requestAnimationFrame(() => this.avatar.resize());
    requestAnimationFrame(() => this.avatar.setCameraFraming(Math.PI / 4, Math.PI / 3, 3));
  }

  private buildLayout(): string {
    return `
      <div class="bl-left">
        <div class="bl-session-list glass-panel" data-bl-sessions>
          <div class="bl-session-header">
            <span class="eyebrow accent">Recordings</span>
            <h2>Lab</h2>
          </div>
          <div class="bl-session-actions">
            <button class="bl-btn bl-btn-rec" data-bl-rec>${icon('play')}<span data-bl-rec-status>Record</span></button>
            <button class="bl-btn" data-bl-refresh>${icon('pulse')}</button>
          </div>
          <div class="bl-session-items" data-bl-session-items>
            <div class="bl-session-empty">No recordings yet</div>
          </div>
        </div>
        <div class="bl-overlays-slot" data-bl-overlays-slot></div>
      </div>
      <div class="bl-center">
        <div class="bl-tab-bar" data-bl-tabs>
          <button class="bl-tab active" data-bl-tab="replay">Replay</button>
          <button class="bl-tab" data-bl-tab="analyze">Analysis</button>
          <button class="bl-tab" data-bl-tab="compare">Compare</button>
        </div>
        <div class="bl-viewport-area">
          <div class="bl-viewport-slot" data-bl-viewport></div>
          <div class="bl-main-area" data-bl-main></div>
        </div>
        <div class="bl-timeline-slot" data-bl-timeline></div>
      </div>
      <div class="bl-right">
        <div class="bl-inspector-slot" data-bl-inspector></div>
      </div>
    `;
  }

  private setupTabBar(): void {
    this.tabBar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-bl-tab]');
      if (!btn) return;
      this.activeTab = btn.dataset.blTab as LabTab;
      this.tabBar.querySelectorAll('[data-bl-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      this.renderTab();
    });
  }

  private setupControls(): void {
    this.element.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-bl-rec]')) this.toggleRecording();
      if (t.closest('[data-bl-refresh]')) this.refresh();
      const item = t.closest<HTMLElement>('[data-bl-session]');
      if (item && !t.closest('[data-bl-del]') && !t.closest('[data-bl-rename]')) {
        this.loadSession(item.dataset.blSession!);
      }
      if (t.closest('[data-bl-del]')) {
        const id = t.closest<HTMLElement>('[data-bl-session]')?.dataset.blSession;
        if (id) { deleteSession(id); this.refresh(); }
      }
    });
    this.element.addEventListener('dblclick', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[data-bl-session-name]');
      if (item) this.startRename(item);
    });
    const os = this.element.querySelector<HTMLElement>('[data-bl-overlays-slot]');
    if (os) os.append(this.overlays.element);
  }

  private startRename(el: HTMLElement): void {
    const id = el.closest<HTMLElement>('[data-bl-session]')?.dataset.blSession;
    if (!id) return;
    const current = el.textContent ?? '';
    const input = document.createElement('input');
    input.className = 'bl-rename-input';
    input.value = current;
    input.dataset.blRename = id;
    el.replaceWith(input);
    input.focus();
    input.select();
    const finish = () => {
      const val = input.value.trim() || current;
      renameSession(id, val);
      this.refresh();
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (ke) => { if (ke.key === 'Enter') { input.blur(); } if (ke.key === 'Escape') { this.refresh(); } });
  }

  private toggleRecording(): void {
    this.recording ? this.stopRecording() : this.startRecording();
  }

  private startRecording(): void {
    const user = getActiveProfile();
    this.recorder.start(user?.id ?? 'local', 'lab', 'Live Recording');
    this.recording = true;
    this.recBtn.innerHTML = `${icon('square')}<span>Stop</span>`;
    this.recBtn.classList.add('bl-btn-rec-active');
    this.element.classList.add('bl-recording');
    if (this.engine) { this.engine.pause(); this.engine = null; this.timelineSlot.innerHTML = ''; }
    this.avatar.setReplayMode(false);
  }

  private stopRecording(): void {
    const result = this.recorder.stop();
    this.recording = false;
    this.recBtn.innerHTML = `${icon('play')}<span>Record</span>`;
    this.recBtn.classList.remove('bl-btn-rec-active');
    this.element.classList.remove('bl-recording');
    if (result) this.refresh();
  }

  private refresh(): void {
    const user = getActiveProfile();
    const all = user ? listSessions().filter((s) => s.metadata.userId === user.id) : listSessions();
    this.sessions = all.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
    this.renderSessionList();
  }

  private renderSessionList(): void {
    const container = this.sessionPanel.querySelector<HTMLElement>('[data-bl-session-items]')!;
    if (this.sessions.length === 0) {
      container.innerHTML = '<div class="bl-session-empty">No recordings yet.<br>Click Record to capture live motion.</div>';
      return;
    }
    container.innerHTML = this.sessions.map((s) => {
      const active = s.metadata.sessionId === this.activeSessionId ? 'bl-session-item-active' : '';
      const dur = s.metadata.durationMs > 0 ? `${(s.metadata.durationMs / 1000).toFixed(0)}s` : '—';
      return `<div class="bl-session-item ${active}" data-bl-session="${s.metadata.sessionId}">
        <div class="bl-session-icon">${icon('play')}</div>
        <div class="bl-session-info">
          <strong data-bl-session-name>${s.metadata.activityName}</strong>
          <span class="bl-session-meta">${s.metadata.frameCount} frames · ${dur} · ${new Date(s.metadata.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="bl-session-item-actions">
          <button class="bl-session-del" data-bl-del title="Delete">${icon('square')}</button>
        </div>
      </div>`;
    }).join('');
  }

  private loadSession(sessionId: string): void {
    const session = loadSession(sessionId);
    if (!session) return;
    this.activeSessionId = sessionId;

    this.unsubPose?.();
    this.unsubFrame?.();
    this.engine?.destroy();

    this.avatar.setReplayMode(true);
    this.engine = new PlaybackEngine(session);
    this.timeline = new ReplayTimeline(this.engine);
    this.timelineSlot.innerHTML = '';
    this.timelineSlot.append(this.timeline.element);

    this.inspector.clear();
    this.renderTab();

    this.unsubPose = this.engine.onPose((pose, idx) => {
      this.avatar.feedReplayFrame(pose);
    });
    this.unsubFrame = this.engine.onFrame((frame, idx) => {
      this.inspector.showFrame(frame, idx);
    });

    this.engine.play();
  }

  private renderTab(): void {
    this.mainArea.innerHTML = '';
    if (this.activeTab === 'analyze') {
      this.mainArea.append(this.analysisSummary.element);
      if (this.activeSessionId) {
        const session = loadSession(this.activeSessionId);
        if (session) this.analysisSummary.showAnalysis(session);
      }
    } else if (this.activeTab === 'compare') {
      this.mainArea.append(this.comparison.element);
    }
  }

  destroy(): void {
    this.unsubPose?.();
    this.unsubFrame?.();
    this.engine?.destroy();
    this.timeline?.destroy();
    this.inspector.destroy();
    this.analysisSummary.destroy();
    this.comparison.destroy();
    this.overlays.destroy();
    this.avatar.setReplayMode(false);
    this.element.remove();
  }
}
