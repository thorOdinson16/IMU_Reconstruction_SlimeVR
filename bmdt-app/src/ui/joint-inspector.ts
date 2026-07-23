import type { JointScoreDetail } from '../analysis/scoring';
import { icon } from './icons';

const JOINT_LABELS: Record<string, string> = {
  neck: 'Neck', spine: 'Spine',
  leftShoulder: 'Left Shoulder', rightShoulder: 'Right Shoulder',
  leftElbow: 'Left Elbow', rightElbow: 'Right Elbow',
  leftWrist: 'Left Wrist', rightWrist: 'Right Wrist',
  leftHip: 'Left Hip', rightHip: 'Right Hip',
  leftKnee: 'Left Knee', rightKnee: 'Right Knee',
  leftAnkle: 'Left Ankle', rightAnkle: 'Right Ankle',
};

function correctionText(angle: { component: string; actual: number | null; targetMid: number; lowerBound: number; upperBound: number; errorDeg: number | null }): string {
  if (angle.actual === null || angle.errorDeg === null || angle.errorDeg <= 0) return '';
  const direction = angle.actual < angle.lowerBound ? 'increase' : 'decrease';
  const dirWord = angle.actual < angle.lowerBound ? 'increase' : 'reduce';
  const names: Record<string, string> = {
    flexionExtension: 'bend', abductionAdduction: 'lateral tilt', internalExternalRotation: 'rotation',
  };
  return `${dirWord} ${names[angle.component] || angle.component} by ${angle.errorDeg.toFixed(1)}°`;
}

export class JointInspector {
  readonly element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'joint-inspector';
    this.element.innerHTML = `
      <div class="joint-inspector-header">
        <span class="eyebrow">Joint Inspector</span>
        <span class="joint-inspector-name" data-ji-name>Select a joint</span>
      </div>
      <div class="joint-inspector-body" data-ji-body>
        <p class="joint-inspector-hint">Click a joint in the accuracy breakdown to inspect details.</p>
      </div>`;
  }

  show(score: JointScoreDetail): void {
    const label = JOINT_LABELS[score.jointId] ?? score.jointId;
    const nameEl = this.element.querySelector<HTMLElement>('[data-ji-name]')!;
    nameEl.textContent = label;

    const body = this.element.querySelector<HTMLElement>('[data-ji-body]')!;
    const accuracyPct = Math.round(score.rawMatchFactor * 100);

    body.innerHTML = `
      <div class="ji-overall">
        <span>Joint Accuracy</span>
        <strong class="ji-acc-${accuracyPct >= 85 ? 'high' : accuracyPct >= 60 ? 'med' : 'low'}">${accuracyPct}%</strong>
      </div>
      <div class="ji-weight"><span>Weight</span><b>${(score.weight * 100).toFixed(0)}%</b></div>
      <div class="ji-breakdown">
        ${score.angles.map((a) => {
          const pct = a.score !== null ? Math.round(a.score * 100) : null;
          const correction = correctionText(a);
          const compLabels: Record<string, string> = {
            flexionExtension: 'Flexion / Extension',
            abductionAdduction: 'Abduction / Adduction',
            internalExternalRotation: 'Int / Ext Rotation',
          };
          return `<div class="ji-angle ${pct === null ? 'ji-na' : ''}">
            <span class="ji-angle-name">${compLabels[a.component]}</span>
            <div class="ji-angle-detail">
              <span>Current</span><b>${a.actual !== null ? `${a.actual.toFixed(1)}°` : '—'}</b>
              <span>Target</span><b>${a.targetMid.toFixed(1)}°</b>
              <span>Tolerance</span><b>${a.lowerBound.toFixed(0)}° – ${a.upperBound.toFixed(0)}°</b>
              <span>Error</span><b class="${a.errorDeg !== null && a.errorDeg > 0 ? 'ji-error' : 'ji-ok'}">${a.errorDeg !== null ? `${a.errorDeg.toFixed(1)}°` : '—'}</b>
              <span>Score</span><b class="${pct !== null && pct >= 85 ? 'ji-ok' : pct !== null && pct >= 60 ? 'ji-warn' : ''}">${pct !== null ? `${pct}%` : 'N/A'}</b>
            </div>
            ${correction ? `<div class="ji-correction">${icon('chevron')}${correction}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  }

  clear(): void {
    const nameEl = this.element.querySelector<HTMLElement>('[data-ji-name]')!;
    nameEl.textContent = 'Select a joint';
    const body = this.element.querySelector<HTMLElement>('[data-ji-body]')!;
    body.innerHTML = '<p class="joint-inspector-hint">Click a joint in the accuracy breakdown to inspect details.</p>';
  }
}
