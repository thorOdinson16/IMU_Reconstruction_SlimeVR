import type { StoredFrame } from '../platform/session-format';
import { icon } from './icons';

export type OverlayId = 'jointLabels' | 'heatmap' | 'motionTrails' | 'com' | 'velocityArrows' | 'boneAxes' | 'groundContact';

export interface OverlayState {
  jointLabels: boolean;
  heatmap: boolean;
  motionTrails: boolean;
  com: boolean;
  velocityArrows: boolean;
  boneAxes: boolean;
  groundContact: boolean;
}

export class ReplayOverlays {
  readonly element: HTMLElement;
  state: OverlayState = {
    jointLabels: false,
    heatmap: false,
    motionTrails: false,
    com: false,
    velocityArrows: false,
    boneAxes: false,
    groundContact: false,
  };
  private listeners = new Set<(state: OverlayState) => void>();

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'bl-overlays';
    this.element.innerHTML = `
      <div class="bl-overlays-header"><span class="eyebrow">Overlays</span></div>
      <div class="bl-overlays-grid" data-bl-overlays-grid>
        <button class="bl-overlay-btn" data-bl-overlay="jointLabels">${icon('pulse')}<span>Joint Labels</span></button>
        <button class="bl-overlay-btn" data-bl-overlay="heatmap">${icon('pulse')}<span>Heatmap</span></button>
        <button class="bl-overlay-btn" data-bl-overlay="motionTrails">${icon('pulse')}<span>Motion Trails</span></button>
        <button class="bl-overlay-btn" data-bl-overlay="com">${icon('pulse')}<span>Center of Mass</span></button>
        <button class="bl-overlay-btn" data-bl-overlay="velocityArrows">${icon('pulse')}<span>Velocity Arrows</span></button>
        <button class="bl-overlay-btn" data-bl-overlay="boneAxes">${icon('pulse')}<span>Bone Axes</span></button>
        <button class="bl-overlay-btn" data-bl-overlay="groundContact">${icon('pulse')}<span>Ground Contact</span></button>
      </div>
    `;
    this.element.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-bl-overlay]');
      if (btn) {
        const id = btn.dataset.blOverlay as OverlayId;
        this.state[id] = !this.state[id];
        btn.classList.toggle('active', this.state[id]);
        for (const l of this.listeners) l(this.state);
      }
    });
  }

  subscribe(cb: (state: OverlayState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  renderOverlay(frame: StoredFrame | null, ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);
    if (!frame) return;

    if (this.state.com && frame.com) {
      const sx = ((frame.com[0] + 1) / 2) * w;
      const sy = ((1 - frame.com[1]) / 2) * h;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(108,131,255,0.7)';
      ctx.fill();
      ctx.strokeStyle = '#6c83ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#e8edf5';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('COM', sx + 10, sy + 4);
    }
  }

  destroy(): void {
    this.element.remove();
  }
}
