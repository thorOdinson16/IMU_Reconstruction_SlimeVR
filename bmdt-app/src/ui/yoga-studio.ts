import { icon } from './icons';
import type { YogaModule, YogaState } from '../modules/yoga/yoga-module';
import { yogaPoses } from '../modules/yoga/poses';
import { ReferenceAvatarViewer } from './reference-avatar-viewer';
import { JointInspector } from './joint-inspector';
import { createSession, getActiveProfile } from '../platform';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function accuracyClass(value: number): string {
  if (value >= 0.85) return 'high';
  if (value >= 0.6) return 'medium';
  return 'low';
}

function phaseLabel(phase: YogaState['phase']): string {
  switch (phase) {
    case 'idle': return 'Ready';
    case 'transitioning': return 'Transitioning';
    case 'holding': return 'Hold';
    case 'completed': return 'Complete';
  }
}

export class YogaStudio {
  readonly element: HTMLElement;

  private poseSelect: HTMLSelectElement;
  private startBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;
  private phaseDisplay: HTMLElement;
  private accuracyValue: HTMLElement;
  private holdTime: HTMLElement;
  private holdTarget: HTMLElement;
  private holdProgress: HTMLElement;
  private maxAcc: HTMLElement;
  private feedbackList: HTMLElement;
  private fbCount: HTMLElement;
  private breakdownBody: HTMLElement;
  private summaryBody: HTMLElement;
  private infoPanel: HTMLElement;
  private refViewer: ReferenceAvatarViewer;
  private jointInspector: JointInspector;
  private stopListening: (() => void) | null = null;

  private currentPoseId: string | null = null;
  private sessionStartTime: number = 0;

  constructor(
    private readonly yoga: YogaModule,
    private readonly avatarElement: HTMLElement,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'yoga-studio page-enter';

    this.refViewer = new ReferenceAvatarViewer();
    this.jointInspector = new JointInspector();

    this.element.innerHTML = `
      <aside class="ys-sidebar glass-panel">
        <div class="ys-sidebar-header">
          <span class="eyebrow accent">Yoga Studio</span>
          <h2>Pose Library</h2>
        </div>

        <div class="ys-selector">
          <label>Select pose</label>
          <div class="ys-select-wrap">
            <select class="ys-select"></select>
            ${icon('chevron', 'ys-select-chevron')}
          </div>
        </div>

        <div class="ys-info" data-ys-info>
          <div class="ys-info-header">
            <strong data-ys-name>No pose selected</strong>
            <span class="ys-difficulty" data-ys-diff></span>
          </div>
          <span class="ys-sanskrit" data-ys-sanskrit></span>
          <p data-ys-desc></p>
          <div class="ys-instructions" data-ys-instr></div>
          <div class="ys-benefits" data-ys-benefits></div>
          <div class="ys-mistakes" data-ys-mistakes></div>
        </div>

        <div class="ys-controls">
          <button class="ys-btn ys-btn-primary" data-ys-start disabled>${icon('spark')}<span>Start Pose</span></button>
          <button class="ys-btn ys-btn-secondary" data-ys-reset disabled>${icon('pulse')}<span>Reset</span></button>
        </div>

        <div class="ys-phase">
          <span class="eyebrow">Phase</span>
          <strong class="ys-phase-value ys-phase-idle" data-ys-phase>Ready</strong>
        </div>
      </aside>

      <div class="ys-main">
        <div class="ys-avatars">
          <div class="ys-ref-panel glass-panel">
            <div class="ys-ref-header"><span class="eyebrow">Reference Pose</span></div>
            <div class="ys-ref-content"></div>
          </div>
          <div class="ys-live-panel glass-panel">
            <div class="ys-live-header"><span class="eyebrow"><span class="live-dot"></span> Your Pose</span></div>
            <div class="ys-live-slot"></div>
          </div>
        </div>

        <div class="ys-bottom">
          <div class="ys-metrics glass-panel">
            <div class="ys-metric">
              <span class="eyebrow">Overall Accuracy</span>
              <strong class="ys-accuracy" data-ys-accuracy>0%</strong>
              <div class="ys-accuracy-bar"><div data-ys-accuracy-fill></div></div>
            </div>
            <div class="ys-metric">
              <span class="eyebrow">Hold Timer</span>
              <strong data-ys-hold-time>00:00</strong>
              <span>of <b data-ys-hold-target>00:30</b></span>
              <div class="ys-hold-bar"><div data-ys-hold-progress></div></div>
            </div>
            <div class="ys-metric">
              <span class="eyebrow">Best Accuracy</span>
              <strong class="ys-best" data-ys-max>0%</strong>
            </div>
          </div>

          <div class="ys-detail">
            <div class="ys-breakdown glass-panel">
              <div class="ys-breakdown-header">
                <span class="eyebrow">Joint Accuracy</span>
                <span class="ys-breakdown-count" data-ys-bd-count>0 joints</span>
              </div>
              <div class="ys-breakdown-body" data-ys-bd-body></div>
            </div>

            <div class="ys-feedback-col">
              <div class="ys-feedback glass-panel">
                <div class="ys-feedback-header">
                  <span class="eyebrow">Corrections</span>
                  <span class="ys-fb-count" data-ys-fb-count>0</span>
                </div>
                <ul class="ys-feedback-list" data-ys-fb-list></ul>
              </div>

              <div class="ys-inspector-slot"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="ys-summary-overlay" data-ys-summary>
        <div class="ys-summary-panel glass-panel">
          <div class="ys-summary-header"><span class="eyebrow accent">Session Complete</span><h2>Pose Summary</h2></div>
          <div class="ys-summary-body" data-ys-summary-body></div>
          <div class="ys-summary-actions">
            <button class="ys-btn ys-btn-primary" data-ys-summary-save>${icon('spark')}<span>Save to History</span></button>
            <button class="ys-btn ys-btn-secondary" data-ys-summary-close>${icon('chevron')}<span>Close</span></button>
          </div>
        </div>
      </div>`;

    this.poseSelect = this.element.querySelector<HTMLSelectElement>('.ys-select')!;
    this.startBtn = this.element.querySelector<HTMLButtonElement>('[data-ys-start]')!;
    this.resetBtn = this.element.querySelector<HTMLButtonElement>('[data-ys-reset]')!;
    this.phaseDisplay = this.element.querySelector<HTMLElement>('[data-ys-phase]')!;
    this.accuracyValue = this.element.querySelector<HTMLElement>('[data-ys-accuracy]')!;
    this.holdTime = this.element.querySelector<HTMLElement>('[data-ys-hold-time]')!;
    this.holdTarget = this.element.querySelector<HTMLElement>('[data-ys-hold-target]')!;
    this.holdProgress = this.element.querySelector<HTMLElement>('[data-ys-hold-progress]')!;
    this.maxAcc = this.element.querySelector<HTMLElement>('[data-ys-max]')!;
    this.feedbackList = this.element.querySelector<HTMLElement>('[data-ys-fb-list]')!;
    this.fbCount = this.element.querySelector<HTMLElement>('[data-ys-fb-count]')!;
    this.breakdownBody = this.element.querySelector<HTMLElement>('[data-ys-bd-body]')!;
    this.summaryBody = this.element.querySelector<HTMLElement>('[data-ys-summary-body]')!;
    this.infoPanel = this.element.querySelector<HTMLElement>('[data-ys-info]')!;

    this.element.querySelector<HTMLElement>('.ys-ref-content')!.append(this.refViewer.element);
    this.refViewer.start();
    this.element.querySelector<HTMLElement>('.ys-live-slot')!.append(avatarElement);
    this.element.querySelector<HTMLElement>('.ys-inspector-slot')!.append(this.jointInspector.element);

    this.populateSelect();
    this.element.addEventListener('click', this.handleClick);
    this.poseSelect.addEventListener('change', () => this.onSelect());

    this.stopListening = this.yoga.subscribe((state) => this.render(state));
  }

  destroy(): void {
    this.stopListening?.();
    this.refViewer.destroy();
    this.element.remove();
  }

  private populateSelect(): void {
    this.poseSelect.innerHTML = `<option value="">— Select a pose —</option>${yogaPoses.map((p, i) => `<option value="${i}">${p.pose.name}</option>`).join('')}`;
  }

  private onSelect(): void {
    const val = this.poseSelect.value;
    if (val === '') {
      this.startBtn.disabled = true;
      this.startBtn.innerHTML = `${icon('spark')}<span>Start Pose</span>`;
      this.infoPanel.innerHTML = `<p style="color:#687185;font-size:10px;padding:10px 0">Select a pose from the dropdown to see its details.</p>`;
      this.refViewer.clear();
      this.currentPoseId = null;
      return;
    }
    const entry = yogaPoses[Number(val)];
    this.startBtn.disabled = false;
    this.startBtn.innerHTML = `${icon('spark')}<span>Begin ${entry.pose.name}</span>`;
    this.currentPoseId = entry.pose.id;
    this.refViewer.setPose(entry.pose);
    this.renderInfo(entry);
  }

  private renderInfo(entry: typeof yogaPoses[number]): void {
    this.infoPanel.innerHTML = `
      <div class="ys-info-header">
        <strong>${entry.pose.name}</strong>
        <span class="ys-difficulty ys-diff-${entry.pose.difficulty}">${entry.pose.difficulty}</span>
      </div>
      <span class="ys-sanskrit">${entry.pose.metadata.sanskrit ?? ''}</span>
      <p>${entry.description}</p>
      ${entry.instructions.length ? `<div class="ys-section"><span class="eyebrow">Instructions</span>${entry.instructions.map((s, i) => `<span class="ys-step">${i + 1}. ${s}</span>`).join('')}</div>` : ''}
      ${entry.benefits.length ? `<div class="ys-section"><span class="eyebrow">Benefits</span><div class="ys-tags">${entry.benefits.map((b) => `<span>${b}</span>`).join('')}</div></div>` : ''}
      ${entry.commonMistakes.length ? `<div class="ys-section"><span class="eyebrow">Common Mistakes</span><div class="ys-tags ys-warn">${entry.commonMistakes.map((m) => `<span>${m}</span>`).join('')}</div></div>` : ''}`;
  }

  private handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;

    if (target.closest('[data-ys-start]') && !this.startBtn.disabled) {
      const val = this.poseSelect.value;
      if (val !== '') { this.sessionStartTime = Date.now(); this.yoga.selectPose(yogaPoses[Number(val)]); }
      return;
    }
    if (target.closest('[data-ys-reset]') && !this.resetBtn.disabled) {
      this.yoga.resetPose();
      return;
    }
    if (target.closest('[data-ys-summary-close]')) {
      this.element.querySelector<HTMLElement>('[data-ys-summary]')!.classList.remove('ys-visible');
      return;
    }
    if (target.closest('[data-ys-summary-save]')) {
      this.saveSession();
      this.element.querySelector<HTMLElement>('[data-ys-summary]')!.classList.remove('ys-visible');
      return;
    }
    const jiRow = target.closest<HTMLElement>('[data-ys-ji]');
    if (jiRow) {
      this.yoga.inspectJoint(jiRow.dataset.ysJi!);
      return;
    }
  };

  private render(state: YogaState): void {
    this.phaseDisplay.textContent = phaseLabel(state.phase);
    this.phaseDisplay.className = `ys-phase-value ys-phase-${state.phase}`;

    const pct = Math.round(state.overallMatch * 100);
    this.accuracyValue.textContent = `${pct}%`;
    this.accuracyValue.className = `ys-accuracy ys-acc-${accuracyClass(state.overallMatch)}`;

    const accFill = this.element.querySelector<HTMLElement>('[data-ys-accuracy-fill]')!;
    accFill.style.width = `${Math.min(state.overallMatch * 100, 100)}%`;
    accFill.className = accuracyClass(state.overallMatch);

    this.holdTime.textContent = formatTime(state.holdElapsedSec);
    this.holdTarget.textContent = formatTime(state.holdTargetSec);
    const hpct = state.holdTargetSec > 0 ? Math.min(state.holdElapsedSec / state.holdTargetSec, 1) : 0;
    this.holdProgress.style.width = `${hpct * 100}%`;

    this.maxAcc.textContent = `${Math.round(state.maxAccuracy * 100)}%`;
    this.startBtn.disabled = state.selectedPose !== null && (state.phase === 'holding' || state.phase === 'completed');
    this.resetBtn.disabled = state.selectedPose === null;

    this.renderFeedback(state);
    this.renderBreakdown(state);
    this.renderSummary(state);
  }

  private renderFeedback(state: YogaState): void {
    this.fbCount.textContent = `${state.feedback.length}`;
    if (state.feedback.length > 0) {
      this.feedbackList.innerHTML = state.feedback.map((msg) => `<li>${icon('chevron')}${msg}</li>`).join('');
    } else if (state.phase === 'holding' || state.phase === 'completed') {
      this.feedbackList.innerHTML = `<li class="ys-fb-empty">${icon('spark')}All joints within tolerance</li>`;
    } else {
      this.feedbackList.innerHTML = `<li class="ys-fb-empty">${icon('spark')}Begin holding the pose to see feedback</li>`;
    }
  }

  private renderBreakdown(state: YogaState): void {
    const scored = state.scored;
    if (!scored) {
      this.breakdownBody.innerHTML = `<p class="ys-bd-hint">Start a pose to see joint-level accuracy.</p>`;
      const count = this.element.querySelector<HTMLElement>('[data-ys-bd-count]')!;
      count.textContent = '0 joints';
      return;
    }
    const count = this.element.querySelector<HTMLElement>('[data-ys-bd-count]')!;
    const available = scored.jointScores.filter((j) => j.available);
    count.textContent = `${available.length} joints`;

    this.breakdownBody.innerHTML = scored.jointScores.map((js) => {
      const pct = Math.round(js.rawMatchFactor * 100);
      const cls = accuracyClass(js.rawMatchFactor);
      const labels: Record<string, string> = {
        neck: 'Neck', spine: 'Spine',
        leftShoulder: 'L Shoulder', rightShoulder: 'R Shoulder',
        leftElbow: 'L Elbow', rightElbow: 'R Elbow',
        leftWrist: 'L Wrist', rightWrist: 'R Wrist',
        leftHip: 'L Hip', rightHip: 'R Hip',
        leftKnee: 'L Knee', rightKnee: 'R Knee',
        leftAnkle: 'L Ankle', rightAnkle: 'R Ankle',
      };
      const active = state.inspectorJoint?.jointId === js.jointId ? 'ys-ji-active' : '';
      return `<div class="ys-ji-row ${active}" data-ys-ji="${js.jointId}">
        <span class="ys-ji-name">${labels[js.jointId] ?? js.jointId}</span>
        <span class="ys-ji-bar"><span class="ys-ji-fill ${cls}" style="width:${pct}%"></span></span>
        <span class="ys-ji-pct ${cls}">${pct}%</span>
      </div>`;
    }).join('');
  }

  private saveSession(): void {
    const user = getActiveProfile();
    if (!user) return;
    const s = this.yoga.getState().sessionSummary;
    if (!s || !this.yoga.getState().selectedPose) return;
    const pose = this.yoga.getState().selectedPose;
    createSession({
      userId: user.id,
      activityType: 'yoga',
      activityName: pose.pose.name,
      durationSec: Math.round((Date.now() - this.sessionStartTime) / 1000),
      accuracy: s.overallAccuracy,
      maxAccuracy: s.maxAccuracy,
      trackingQuality: s.overallAccuracy,
      holdDurationSec: s.holdDurationSec,
      romMax: null,
      romMin: null,
      romAvg: null,
      repCount: null,
      maxVelocity: null,
      avgVelocity: null,
      activityId: pose.pose.id,
      notes: '',
      status: 'completed',
      exerciseCategory: null,
      jointBreakdown: s.jointBreakdown.filter((j) => j.available).map((j) => ({ jointId: j.jointId, accuracy: j.rawMatchFactor })),
      metrics: {
        holdDurationSec: s.holdDurationSec,
        worstJointAcc: s.worstJoint?.accuracy ?? 0,
        bestJointAcc: s.bestJoint?.accuracy ?? 0,
      },
    });
  }

  private renderSummary(state: YogaState): void {
    const overlay = this.element.querySelector<HTMLElement>('[data-ys-summary]')!;
    if (!state.sessionSummary) {
      overlay.classList.remove('ys-visible');
      return;
    }
    overlay.classList.add('ys-visible');
    const s = state.sessionSummary;
    const pct = Math.round(s.overallAccuracy * 100);

    this.summaryBody.innerHTML = `
      <div class="ys-summary-stats">
        <div class="ys-ss-card"><span class="eyebrow">Accuracy</span><strong class="ys-acc-${accuracyClass(s.overallAccuracy)}">${pct}%</strong></div>
        <div class="ys-ss-card"><span class="eyebrow">Hold Time</span><strong>${formatTime(s.holdDurationSec)}</strong></div>
        <div class="ys-ss-card"><span class="eyebrow">Best</span><strong>${Math.round(s.maxAccuracy * 100)}%</strong></div>
      </div>
      ${s.worstJoint ? `<div class="ys-ss-worst"><span class="eyebrow">Worst Joint</span><span>${s.worstJoint.jointId} — ${Math.round(s.worstJoint.accuracy * 100)}%</span></div>` : ''}
      ${s.bestJoint ? `<div class="ys-ss-best"><span class="eyebrow">Best Joint</span><span>${s.bestJoint.jointId} — ${Math.round(s.bestJoint.accuracy * 100)}%</span></div>` : ''}
      <div class="ys-ss-breakdown">
        <span class="eyebrow">Per-Joint Breakdown</span>
        ${s.jointBreakdown.filter((j) => j.available).map((j) => {
          const labels: Record<string, string> = {
            neck: 'Neck', spine: 'Spine',
            leftShoulder: 'L Shoulder', rightShoulder: 'R Shoulder',
            leftElbow: 'L Elbow', rightElbow: 'R Elbow',
            leftHip: 'L Hip', rightHip: 'R Hip',
            leftKnee: 'L Knee', rightKnee: 'R Knee',
          };
          const jpct = Math.round(j.rawMatchFactor * 100);
          return `<div class="ys-ss-row"><span>${labels[j.jointId] ?? j.jointId}</span><span class="${accuracyClass(j.rawMatchFactor)}">${jpct}%</span></div>`;
        }).join('')}
      </div>`;
  }
}
