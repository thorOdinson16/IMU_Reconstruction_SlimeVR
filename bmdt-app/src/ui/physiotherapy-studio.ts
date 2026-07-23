import { icon } from './icons';
import type { PhysiotherapyModule, PhysiotherapyState } from '../modules/physiotherapy/physiotherapy-module';
import { getExercises, getExercise } from '../modules/physiotherapy/exercises';
import { createSession, getActiveProfile } from '../platform';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function phaseLabel(phase: PhysiotherapyState['phase']): string {
  switch (phase) {
    case 'idle': return 'Ready';
    case 'active': return 'Measuring';
    case 'completed': return 'Complete';
  }
}

function exerciseSideLabel(exerciseId: string): string {
  const ex = getExercise(exerciseId);
  if (!ex) return '';
  if (ex.sides.includes('bilateral')) return 'Bilateral';
  const side = ex.id.endsWith('-r') ? 'Right' : 'Left';
  return side;
}

export class PhysiotherapyStudio {
  readonly element: HTMLElement;

  private exerciseSelect: HTMLSelectElement;
  private startBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;
  private phaseDisplay: HTMLElement;
  private exerciseName: HTMLElement;
  private exerciseSide: HTMLElement;
  private exerciseInfo: HTMLElement;
  private angleValue: HTMLElement;
  private maxValue: HTMLElement;
  private minValue: HTMLElement;
  private avgValue: HTMLElement;
  private velocityValue: HTMLElement;
  private smoothnessValue: HTMLElement;
  private repValue: HTMLElement;
  private holdValue: HTMLElement;
  private holdTarget: HTMLElement;
  private feedbackList: HTMLElement;
  private summaryBody: HTMLElement;
  private confidenceValue: HTMLElement;
  private stopListening: (() => void) | null = null;

  private repPhaseBar: HTMLElement;

  constructor(
    private readonly physio: PhysiotherapyModule,
    private readonly avatarElement: HTMLElement,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'physio-studio page-enter';

    this.element.innerHTML = `
      <aside class="pt-sidebar glass-panel">
        <div class="pt-sidebar-header">
          <span class="eyebrow accent">Physiotherapy</span>
          <h2>Exercise Lab</h2>
        </div>

        <div class="pt-selector">
          <label>Select exercise</label>
          <div class="pt-select-wrap">
            <select class="pt-select"></select>
            ${icon('chevron', 'pt-select-chevron')}
          </div>
        </div>

        <div class="pt-exercise-info" data-pt-info>
          <div class="pt-exercise-header">
            <strong class="pt-exercise-name" data-pt-name>No exercise selected</strong>
            <span class="pt-exercise-side" data-pt-side></span>
          </div>
          <div class="pt-instructions" data-pt-instr></div>
        </div>

        <div class="pt-controls">
          <button class="pt-btn pt-btn-start" data-pt-start disabled>${icon('play')}<span>Start Session</span></button>
          <button class="pt-btn pt-btn-stop" data-pt-stop disabled>${icon('square')}<span>Stop</span></button>
          <button class="pt-btn pt-btn-secondary" data-pt-reset disabled>${icon('pulse')}<span>Reset</span></button>
        </div>

        <div class="pt-status">
          <span class="eyebrow">Status</span>
          <strong class="pt-phase-value pt-phase-idle" data-pt-phase>Ready</strong>
        </div>

        <div class="pt-quick-stats">
          <div class="pt-stat">
            <span class="eyebrow">Reps</span>
            <strong data-pt-reps>0</strong>
          </div>
          <div class="pt-stat">
            <span class="eyebrow">Hold</span>
            <strong data-pt-hold>00:00</strong>
            <span class="pt-stat-target" data-pt-hold-target></span>
          </div>
          <div class="pt-stat">
            <span class="eyebrow">Confidence</span>
            <strong data-pt-confidence>—</strong>
          </div>
        </div>
      </aside>

      <div class="pt-main">
        <div class="pt-avatar-section">
          <div class="pt-avatar-panel glass-panel">
            <div class="pt-avatar-header">
              <span class="eyebrow"><span class="live-dot"></span> Live Motion</span>
              <span class="pt-joint-label" data-pt-joint-label></span>
            </div>
            <div class="pt-live-slot"></div>
          </div>

          <div class="pt-angle-card glass-panel">
            <div class="pt-angle-header">
              <span class="eyebrow">Joint Angle</span>
              <span class="pt-angle-axis" data-pt-axis></span>
            </div>
            <div class="pt-angle-main">
              <strong class="pt-angle-value" data-pt-angle>—°</strong>
              <div class="pt-rep-visual">
                <div class="pt-rep-phase-bar" data-pt-rep-bar></div>
              </div>
            </div>
            <div class="pt-angle-aux">
              <span data-pt-side-label></span>
            </div>
          </div>
        </div>

        <div class="pt-metrics-bar glass-panel">
          <div class="pt-metric">
            <span class="eyebrow">Maximum</span>
            <strong class="pt-metric-value" data-pt-max>—°</strong>
          </div>
          <div class="pt-divider"></div>
          <div class="pt-metric">
            <span class="eyebrow">Minimum</span>
            <strong class="pt-metric-value" data-pt-min>—°</strong>
          </div>
          <div class="pt-divider"></div>
          <div class="pt-metric">
            <span class="eyebrow">Average</span>
            <strong class="pt-metric-value" data-pt-avg>—°</strong>
          </div>
          <div class="pt-divider"></div>
          <div class="pt-metric">
            <span class="eyebrow">Velocity</span>
            <strong class="pt-metric-value" data-pt-vel>—°/s</strong>
          </div>
          <div class="pt-divider"></div>
          <div class="pt-metric">
            <span class="eyebrow">Smoothness</span>
            <strong class="pt-metric-value" data-pt-smooth>—</strong>
          </div>
        </div>

        <div class="pt-bottom">
          <div class="pt-feedback glass-panel">
            <div class="pt-feedback-header">
              <span class="eyebrow">Live Feedback</span>
            </div>
            <ul class="pt-feedback-list" data-pt-feedback>
              <li class="pt-feedback-empty">Begin a session to see live feedback</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="pt-summary-overlay" data-pt-summary>
        <div class="pt-summary-panel glass-panel">
          <div class="pt-summary-header">
            <span class="eyebrow accent">Session Complete</span>
            <h2>Exercise Summary</h2>
          </div>
          <div class="pt-summary-body" data-pt-summary-body></div>
          <div class="pt-summary-actions">
            <button class="pt-btn pt-btn-primary" data-pt-summary-save>${icon('spark')}<span>Save to History</span></button>
            <button class="pt-btn pt-btn-secondary" data-pt-summary-close>${icon('chevron')}<span>Close</span></button>
          </div>
        </div>
      </div>`;

    this.exerciseSelect = this.element.querySelector<HTMLSelectElement>('.pt-select')!;
    this.startBtn = this.element.querySelector<HTMLButtonElement>('[data-pt-start]')!;
    this.stopBtn = this.element.querySelector<HTMLButtonElement>('[data-pt-stop]')!;
    this.resetBtn = this.element.querySelector<HTMLButtonElement>('[data-pt-reset]')!;
    this.phaseDisplay = this.element.querySelector<HTMLElement>('[data-pt-phase]')!;
    this.exerciseName = this.element.querySelector<HTMLElement>('[data-pt-name]')!;
    this.exerciseSide = this.element.querySelector<HTMLElement>('[data-pt-side]')!;
    this.exerciseInfo = this.element.querySelector<HTMLElement>('[data-pt-info]')!;
    this.angleValue = this.element.querySelector<HTMLElement>('[data-pt-angle]')!;
    this.maxValue = this.element.querySelector<HTMLElement>('[data-pt-max]')!;
    this.minValue = this.element.querySelector<HTMLElement>('[data-pt-min]')!;
    this.avgValue = this.element.querySelector<HTMLElement>('[data-pt-avg]')!;
    this.velocityValue = this.element.querySelector<HTMLElement>('[data-pt-vel]')!;
    this.smoothnessValue = this.element.querySelector<HTMLElement>('[data-pt-smooth]')!;
    this.repValue = this.element.querySelector<HTMLElement>('[data-pt-reps]')!;
    this.holdValue = this.element.querySelector<HTMLElement>('[data-pt-hold]')!;
    this.holdTarget = this.element.querySelector<HTMLElement>('[data-pt-hold-target]')!;
    this.feedbackList = this.element.querySelector<HTMLElement>('[data-pt-feedback]')!;
    this.summaryBody = this.element.querySelector<HTMLElement>('[data-pt-summary-body]')!;
    this.confidenceValue = this.element.querySelector<HTMLElement>('[data-pt-confidence]')!;
    this.repPhaseBar = this.element.querySelector<HTMLElement>('[data-pt-rep-bar]')!;

    this.element.querySelector<HTMLElement>('.pt-live-slot')!.append(avatarElement);
    this.populateSelect();
    this.element.addEventListener('click', this.handleClick);
    this.exerciseSelect.addEventListener('change', () => this.onSelect());
    const axisLabel = this.element.querySelector<HTMLElement>('[data-pt-axis]');
    if (axisLabel) axisLabel.textContent = 'Flexion / Extension';

    this.stopListening = this.physio.subscribe((state) => this.render(state));

    requestAnimationFrame(() => this.physio.reset());
  }

  destroy(): void {
    this.stopListening?.();
    this.physio.reset();
    this.element.remove();
  }

  private populateSelect(): void {
    const categories = new Map<string, { id: string; name: string; side: string }[]>();
    for (const ex of getExercises()) {
      const sideLabel = ex.sides.includes('bilateral') ? '' : ex.sides[0] === 'left' ? 'L' : 'R';
      const label = sideLabel ? `${ex.name} (${sideLabel})` : ex.name;
      const list = categories.get(ex.category);
      if (list) list.push({ id: ex.id, name: label, side: sideLabel });
      else categories.set(ex.category, [{ id: ex.id, name: label, side: sideLabel }]);
    }
    const parts: string[] = ['<option value="">— Select an exercise —</option>'];
    for (const [category, exercises] of categories) {
      parts.push(`<optgroup label="${category}">`);
      for (const ex of exercises) {
        parts.push(`<option value="${ex.id}">${ex.name}</option>`);
      }
      parts.push('</optgroup>');
    }
    this.exerciseSelect.innerHTML = parts.join('');
  }

  private onSelect(): void {
    const val = this.exerciseSelect.value;
    if (val === '') {
      this.startBtn.disabled = true;
      this.stopBtn.disabled = true;
      this.resetBtn.disabled = true;
      this.exerciseName.textContent = 'No exercise selected';
      this.exerciseSide.textContent = '';
      this.exerciseInfo.querySelector('[data-pt-instr]')!.innerHTML = '';
      this.physio.reset();
      return;
    }
    const ex = getExercise(val);
    if (!ex) return;
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
    this.resetBtn.disabled = false;
    this.exerciseName.textContent = ex.name;
    this.exerciseSide.textContent = ex.sides.includes('bilateral') ? 'Bilateral' : val.endsWith('-r') ? 'Right side' : 'Left side';

    const axisMap: Record<string, string> = {
      flexionExtension: 'Flexion / Extension',
      abductionAdduction: 'Abduction / Adduction',
      internalExternalRotation: 'Internal / External Rotation',
    };
    const axisEl = this.element.querySelector<HTMLElement>('[data-pt-axis]');
    if (axisEl) axisEl.textContent = axisMap[ex.movementAxis] ?? ex.movementAxis;
    const jointLabelEl = this.element.querySelector<HTMLElement>('[data-pt-joint-label]');
    if (jointLabelEl) jointLabelEl.textContent = ex.joint.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

    this.exerciseInfo.querySelector('[data-pt-instr]')!.innerHTML = ex.instructions.length
      ? `<span class="eyebrow">Instructions</span>${ex.instructions.map((s, i) => `<span class="pt-step">${i + 1}. ${s}</span>`).join('')}`
      : '';

    if (ex.holdDurationSec > 0) {
      this.holdTarget.textContent = `/ ${formatTime(ex.holdDurationSec)}`;
    } else {
      this.holdTarget.textContent = '';
    }

    this.physio.selectExercise(val);
  }

  private handleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;

    if (target.closest('[data-pt-start]') && !this.startBtn.disabled) {
      const val = this.exerciseSelect.value;
      if (val !== '') {
        this.physio.startSession();
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
      }
      return;
    }
    if (target.closest('[data-pt-stop]') && !this.stopBtn.disabled) {
      this.physio.stopSession();
      this.stopBtn.disabled = true;
      this.startBtn.disabled = true;
      return;
    }
    if (target.closest('[data-pt-reset]') && !this.resetBtn.disabled) {
      this.physio.reset();
      this.startBtn.disabled = this.exerciseSelect.value === '';
      this.stopBtn.disabled = true;
      return;
    }
    if (target.closest('[data-pt-summary-close]')) {
      this.element.querySelector<HTMLElement>('[data-pt-summary]')!.classList.remove('pt-visible');
      this.physio.reset();
      this.startBtn.disabled = this.exerciseSelect.value === '';
      this.stopBtn.disabled = true;
      return;
    }
    if (target.closest('[data-pt-summary-save]')) {
      this.saveSession();
      this.element.querySelector<HTMLElement>('[data-pt-summary]')!.classList.remove('pt-visible');
      this.physio.reset();
      this.startBtn.disabled = this.exerciseSelect.value === '';
      this.stopBtn.disabled = true;
      return;
    }
  };

  private render(state: PhysiotherapyState): void {
    this.phaseDisplay.textContent = phaseLabel(state.phase);
    this.phaseDisplay.className = `pt-phase-value pt-phase-${state.phase}`;

    this.angleValue.textContent = state.currentAngle != null ? `${state.currentAngle.toFixed(0)}°` : '—°';

    this.maxValue.textContent = state.maxAngle != null ? `${state.maxAngle.toFixed(1)}°` : '—°';
    this.minValue.textContent = state.minAngle != null ? `${state.minAngle.toFixed(1)}°` : '—°';
    this.avgValue.textContent = state.avgAngle != null ? `${state.avgAngle.toFixed(1)}°` : '—°';
    this.velocityValue.textContent = state.velocity != null ? `${state.velocity.toFixed(1)}°/s` : '—°/s';
    this.smoothnessValue.textContent = state.smoothness != null ? state.smoothness.toFixed(2) : '—';

    this.repValue.textContent = String(state.repCount);
    this.holdValue.textContent = formatTime(state.holdElapsedSec);

    const trackingPct = Math.round(state.trackingConfidence * 100);
    this.confidenceValue.textContent = state.phase === 'active' ? `${trackingPct}%` : '—';

    this.renderFeedback(state);
    this.renderSummary(state);
    this.renderRepPhaseBar(state);
  }

  private renderRepPhaseBar(state: PhysiotherapyState): void {
    if (!state.currentAngle || !state.maxAngle || !state.minAngle || state.maxAngle === state.minAngle) {
      this.repPhaseBar.style.width = '0%';
      return;
    }
    const range = state.maxAngle - state.minAngle;
    const pct = ((state.currentAngle - state.minAngle) / range) * 100;
    this.repPhaseBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  }

  private renderFeedback(state: PhysiotherapyState): void {
    if (state.phase === 'active' && state.feedback.length > 0) {
      this.feedbackList.innerHTML = state.feedback.map((msg) => `<li>${icon('chevron')}${msg}</li>`).join('');
    } else if (state.phase === 'active') {
      this.feedbackList.innerHTML = `<li class="pt-feedback-empty">${icon('spark')}Move through the full range to begin</li>`;
    } else if (state.phase === 'completed') {
      this.feedbackList.innerHTML = `<li class="pt-feedback-empty">${icon('spark')}Session complete. Review the summary below.</li>`;
    } else {
      this.feedbackList.innerHTML = `<li class="pt-feedback-empty">${icon('spark')}Select an exercise and start a session</li>`;
    }
  }

  private saveSession(): void {
    const user = getActiveProfile();
    if (!user) return;
    const s = this.physio.getState().sessionSummary;
    if (!s) return;
    const ex = this.physio.getState().selectedExerciseId ? getExercise(this.physio.getState().selectedExerciseId) : null;
    const smoothness = this.physio.getState().smoothness ?? 0;
    createSession({
      userId: user.id,
      activityType: 'physiotherapy',
      activityName: ex?.name ?? 'Unknown exercise',
      durationSec: Math.round(s.sessionDurationSec),
      accuracy: Math.min(1, s.repCount > 0 ? s.repCount / (s.repCount + Math.max(0, 5 - smoothness)) : 0.5),
      maxAccuracy: Math.min(1, s.trackingConfidence),
      trackingQuality: s.trackingConfidence,
      holdDurationSec: s.holdDurationSec,
      romMax: s.maxAngle,
      romMin: s.minAngle,
      romAvg: s.avgAngle,
      repCount: s.repCount,
      maxVelocity: s.maxVelocity,
      avgVelocity: s.avgVelocity,
      activityId: this.physio.getState().selectedExerciseId ?? '',
      notes: '',
      status: 'completed',
      exerciseCategory: ex?.category ?? null,
      jointBreakdown: null,
      metrics: {
        repCount: s.repCount,
        maxAngle: s.maxAngle,
        minAngle: s.minAngle,
        avgAngle: s.avgAngle,
        holdDurationSec: s.holdDurationSec,
        maxVelocity: s.maxVelocity,
        avgVelocity: s.avgVelocity,
        trackingConfidence: s.trackingConfidence,
        avgSmoothness: smoothness,
      },
    });
  }

  private renderSummary(state: PhysiotherapyState): void {
    const overlay = this.element.querySelector<HTMLElement>('[data-pt-summary]')!;
    if (!state.sessionSummary) {
      overlay.classList.remove('pt-visible');
      return;
    }
    overlay.classList.add('pt-visible');
    const s = state.sessionSummary;
    const ex = state.selectedExerciseId ? getExercise(state.selectedExerciseId) : null;
    const romPct = ex ? Math.min(100, Math.round(((s.maxAngle - s.minAngle) / (ex.expectedRomMax - ex.expectedRomMin)) * 100)) : 0;

    this.summaryBody.innerHTML = `
      <div class="pt-ss-stats">
        <div class="pt-ss-card"><span class="eyebrow">Max ROM</span><strong>${s.maxAngle.toFixed(1)}°</strong></div>
        <div class="pt-ss-card"><span class="eyebrow">Min</span><strong>${s.minAngle.toFixed(1)}°</strong></div>
        <div class="pt-ss-card"><span class="eyebrow">Average</span><strong>${s.avgAngle.toFixed(1)}°</strong></div>
        <div class="pt-ss-card"><span class="eyebrow">Reps</span><strong>${s.repCount}</strong></div>
      </div>
      <div class="pt-ss-stats">
        <div class="pt-ss-card"><span class="eyebrow">Hold Time</span><strong>${formatTime(s.holdDurationSec)}</strong></div>
        <div class="pt-ss-card"><span class="eyebrow">Max Velocity</span><strong>${s.maxVelocity.toFixed(1)}°/s</strong></div>
        <div class="pt-ss-card"><span class="eyebrow">Avg Velocity</span><strong>${s.avgVelocity.toFixed(1)}°/s</strong></div>
        <div class="pt-ss-card"><span class="eyebrow">Session</span><strong>${formatTime(s.sessionDurationSec)}</strong></div>
      </div>
      <div class="pt-ss-rom">
        <span class="eyebrow">Range Achieved</span>
        <div class="pt-ss-rom-bar">
          <div class="pt-ss-rom-fill" style="width:${Math.min(100, romPct)}%"></div>
        </div>
        <span>${romPct}% of expected range</span>
      </div>
      <div class="pt-ss-row">
        <span class="eyebrow">Tracking Confidence</span>
        <span>${Math.round(s.trackingConfidence * 100)}%</span>
      </div>`;
  }
}
