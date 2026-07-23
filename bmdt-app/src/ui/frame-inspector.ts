import { icon } from './icons';
import type { StoredFrame, StoredJointAngles } from '../platform/session-format';

export type InspectorTab = 'angles' | 'joints' | 'com' | 'quality';

const JOINT_LABELS: Record<string, string> = {
  neck: 'Neck', spine: 'Spine',
  leftShoulder: 'L Shoulder', rightShoulder: 'R Shoulder',
  leftElbow: 'L Elbow', rightElbow: 'R Elbow',
  leftHip: 'L Hip', rightHip: 'R Hip',
  leftKnee: 'L Knee', rightKnee: 'R Knee',
  leftAnkle: 'L Ankle', rightAnkle: 'R Ankle',
};

export class FrameInspector {
  readonly element: HTMLElement;
  private body: HTMLElement;
  private tabBar: HTMLElement;
  private activeTab: InspectorTab = 'angles';
  private currentFrame: StoredFrame | null = null;
  private frameIndex = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'bl-inspector glass-panel';
    this.element.innerHTML = `
      <div class="bl-inspector-header">
        <span class="eyebrow accent">Frame Inspector</span>
        <h3>Biomechanics</h3>
      </div>
      <div class="bl-inspector-timestamp" data-bl-inspector-ts></div>
      <div class="bl-inspector-tabs" data-bl-inspector-tabs>
        <button class="bl-itab active" data-bl-tab="angles">Angles</button>
        <button class="bl-itab" data-bl-tab="joints">Joints</button>
        <button class="bl-itab" data-bl-tab="com">COM</button>
        <button class="bl-itab" data-bl-tab="quality">Quality</button>
      </div>
      <div class="bl-inspector-body" data-bl-inspector-body>
        <div class="bl-inspector-empty">${icon('pulse')}<p>Load a session and pause to inspect</p></div>
      </div>
    `;
    this.body = this.element.querySelector<HTMLElement>('[data-bl-inspector-body]')!;
    this.tabBar = this.element.querySelector<HTMLElement>('[data-bl-inspector-tabs]')!;
    this.tabBar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-bl-tab]');
      if (btn) {
        this.activeTab = btn.dataset.blTab as InspectorTab;
        this.tabBar.querySelectorAll('[data-bl-tab]').forEach((b) => b.classList.toggle('active', b === btn));
        this.render();
      }
    });
  }

  showFrame(frame: StoredFrame | null, index: number): void {
    this.currentFrame = frame;
    this.frameIndex = index;
    this.render();
  }

  clear(): void {
    this.currentFrame = null;
    this.body.innerHTML = `<div class="bl-inspector-empty">${icon('pulse')}<p>Pause replay to inspect frame</p></div>`;
  }

  private render(): void {
    const f = this.currentFrame;
    if (!f) { this.clear(); return; }
    const tsEl = this.element.querySelector<HTMLElement>('[data-bl-inspector-ts]');
    if (tsEl) tsEl.textContent = `Frame ${this.frameIndex + 1} · ${(f.t / 1000).toFixed(3)}s`;

    switch (this.activeTab) {
      case 'angles': this.renderAngles(f); break;
      case 'joints': this.renderJoints(f); break;
      case 'com': this.renderCOM(f); break;
      case 'quality': this.renderQuality(f); break;
    }
  }

  private renderAngles(frame: StoredFrame): void {
    if (frame.ja.length === 0) {
      this.body.innerHTML = `<div class="bl-inspector-empty">${icon('pulse')}<p>No joint angles recorded for this frame</p></div>`;
      return;
    }
    const parts = frame.ja.map((ja) => `
      <div class="bl-ij-row">
        <span class="bl-ij-label">${JOINT_LABELS[ja.j] ?? ja.j}</span>
        <div class="bl-ij-values">
          ${ja.fe != null ? `<span class="bl-ij-val"><span class="bl-ij-axis">FE</span>${ja.fe.toFixed(1)}°</span>` : ''}
          ${ja.aa != null ? `<span class="bl-ij-val"><span class="bl-ij-axis">AA</span>${ja.aa.toFixed(1)}°</span>` : ''}
          ${ja.ir != null ? `<span class="bl-ij-val"><span class="bl-ij-axis">IR</span>${ja.ir.toFixed(1)}°</span>` : ''}
        </div>
      </div>
    `);
    this.body.innerHTML = `<div class="bl-ij-grid">${parts.join('')}</div>`;
  }

  private renderJoints(frame: StoredFrame): void {
    if (frame.b.length === 0) {
      this.body.innerHTML = `<div class="bl-inspector-empty">${icon('pulse')}<p>No bone data recorded</p></div>`;
      return;
    }
    const boneLabels: Record<number, string> = {
      1: 'Head', 2: 'Neck', 3: 'Chest', 4: 'Waist', 5: 'Hip',
      6: 'L Shoulder', 7: 'L UpperArm', 8: 'L LowerArm', 9: 'L Hand',
      10: 'R Shoulder', 11: 'R UpperArm', 12: 'R LowerArm', 13: 'R Hand',
      14: 'L UpperLeg', 15: 'L LowerLeg', 16: 'L Foot',
      17: 'R UpperLeg', 18: 'R LowerLeg', 19: 'R Foot',
    };
    const parts = frame.b.map((b) => {
      const q = b.r;
      const angle = Math.acos(Math.min(1, Math.max(-1, q[3]))) * 2 * (180 / Math.PI);
      return `<div class="bl-ij-row">
        <span class="bl-ij-label">${boneLabels[b.p] ?? `Bone ${b.p}`}</span>
        <div class="bl-ij-values">
          <span class="bl-ij-val"><span class="bl-ij-axis">θ</span>${angle.toFixed(1)}°</span>
          <span class="bl-ij-val"><span class="bl-ij-axis">Pos</span>${b.h[0].toFixed(2)}, ${b.h[1].toFixed(2)}, ${b.h[2].toFixed(2)}</span>
        </div>
      </div>`;
    });
    this.body.innerHTML = `<div class="bl-ij-grid">${parts.join('')}</div>`;
  }

  private renderCOM(frame: StoredFrame): void {
    const com = frame.com;
    this.body.innerHTML = `<div class="bl-com-grid">
      <div class="bl-com-card"><span class="eyebrow">COM X</span><strong>${com ? com[0].toFixed(3) : '—'} m</strong></div>
      <div class="bl-com-card"><span class="eyebrow">COM Y</span><strong>${com ? com[1].toFixed(3) : '—'} m</strong></div>
      <div class="bl-com-card"><span class="eyebrow">COM Z</span><strong>${com ? com[2].toFixed(3) : '—'} m</strong></div>
      <div class="bl-com-card"><span class="eyebrow">Velocity</span><strong>${frame.cv != null ? frame.cv.toFixed(3) : '—'} m/s</strong></div>
      <div class="bl-com-card"><span class="eyebrow">Acceleration</span><strong>${frame.ca != null ? frame.ca.toFixed(3) : '—'} m/s²</strong></div>
      <div class="bl-com-card"><span class="eyebrow">Symmetry</span><strong>${frame.sy != null ? (Math.max(0, 1 - frame.sy / 45) * 100).toFixed(0) : '—'}%</strong></div>
    </div>`;
  }

  private renderQuality(frame: StoredFrame): void {
    const tq = frame.tq;
    const vl = frame.vl;
    this.body.innerHTML = `<div class="bl-quality-grid">
      <div class="bl-com-card"><span class="eyebrow">Frame Valid</span><strong>${vl ? (vl.v ? 'Yes' : 'No') : '—'}</strong></div>
      <div class="bl-com-card"><span class="eyebrow">Body Parts</span><strong>${vl?.pb ?? '—'}</strong></div>
      <div class="bl-com-card"><span class="eyebrow">Rotation Coverage</span><strong>${vl != null ? (vl.rc * 100).toFixed(0) : '—'}%</strong></div>
      <div class="bl-com-card"><span class="eyebrow">Position Coverage</span><strong>${vl != null ? (vl.pc * 100).toFixed(0) : '—'}%</strong></div>
      <div class="bl-com-card"><span class="eyebrow">Tracking Overall</span><strong>${tq != null ? (tq.o * 100).toFixed(0) : '—'}%</strong></div>
      <div class="bl-com-card"><span class="eyebrow">Rotation Quality</span><strong>${tq != null ? (tq.rq * 100).toFixed(0) : '—'}%</strong></div>
    </div>
    ${frame.qf.length ? `<div class="bl-quality-flags"><span class="eyebrow">Quality Flags</span>${frame.qf.map((f) => `<span class="bl-quality-flag">${f}</span>`).join('')}</div>` : ''}
    <div class="bl-ij-grid" style="margin-top:8px">
      <div class="bl-ij-row">
        <span class="bl-ij-label">dt</span>
        <span class="bl-ij-val">${frame.dt.toFixed(1)}ms</span>
      </div>
    </div>`;
  }

  destroy(): void {
    this.element.remove();
  }
}
