import { icon } from './icons';
import type { SessionFile, StoredFrame } from '../platform/session-format';

export class AnalysisSummary {
  readonly element: HTMLElement;
  private body: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'bl-analysis';
    this.element.innerHTML = `
      <div class="bl-analysis-header">
        <span class="eyebrow accent">Session Analysis</span>
        <h2>Biomechanics Summary</h2>
      </div>
      <div class="bl-analysis-body" data-bl-analysis-body>
        <div class="bl-inspector-empty">${icon('pulse')}<p>Select a saved session</p></div>
      </div>
    `;
    this.body = this.element.querySelector<HTMLElement>('[data-bl-analysis-body]')!;
  }

  showAnalysis(session: SessionFile): void {
    const meta = session.metadata;
    const frames = session.frames;
    if (frames.length < 2) {
      this.body.innerHTML = `<div class="bl-inspector-empty">${icon('pulse')}<p>Not enough frames for analysis</p></div>`;
      return;
    }

    const durationSec = meta.durationMs / 1000;
    const avgFps = meta.avgFrameRate;

    const angleStats = this.computeAngleStats(frames);
    const boneLabels: Record<number, string> = {
      5: 'Hip', 6: 'L Shoulder', 10: 'R Shoulder',
      8: 'L Elbow', 12: 'R Elbow', 15: 'L Knee', 18: 'R Knee',
    };

    const romParts = angleStats.map((stat) => {
      const label = boneLabels[stat.boneId] ?? `Bone ${stat.boneId}`;
      return `<div class="bl-ij-row">
        <span class="bl-ij-label">${label}</span>
        <div class="bl-ij-values">
          <span class="bl-ij-val"><span class="bl-ij-axis">ROM</span>${stat.rom.toFixed(1)}°</span>
          <span class="bl-ij-val"><span class="bl-ij-axis">Max</span>${stat.max.toFixed(1)}°</span>
          <span class="bl-ij-val"><span class="bl-ij-axis">Min</span>${stat.min.toFixed(1)}°</span>
          <span class="bl-ij-val"><span class="bl-ij-axis">Avg</span>${stat.avg.toFixed(1)}°</span>
        </div>
      </div>`;
    }).join('');

    const validFrames = frames.filter((f) => f.tq);
    const avgTQ = validFrames.length > 0
      ? validFrames.reduce((s, f) => s + (f.tq?.o ?? 0), 0) / validFrames.length
      : 0;

    const avgVel = frames.reduce((s, f) => s + (f.cv ?? 0), 0) / frames.length;
    const avgSym = frames.reduce((s, f) => s + (f.sy ?? 0), 0) / frames.length;

    const maxRomStat = angleStats.reduce((a, b) => a.rom > b.rom ? a : b, angleStats[0]);
    const maxRomLabel = boneLabels[maxRomStat.boneId] ?? `Bone ${maxRomStat.boneId}`;

    this.body.innerHTML = `
      <div class="bl-summary-stats">
        <div class="bl-ss-card"><span class="eyebrow">Duration</span><strong>${durationSec.toFixed(1)}s</strong></div>
        <div class="bl-ss-card"><span class="eyebrow">Frames</span><strong>${frames.length}</strong></div>
        <div class="bl-ss-card"><span class="eyebrow">Avg FPS</span><strong>${avgFps.toFixed(0)}</strong></div>
        <div class="bl-ss-card"><span class="eyebrow">Avg Velocity</span><strong>${avgVel.toFixed(3)} m/s</strong></div>
        <div class="bl-ss-card"><span class="eyebrow">Max ROM</span><strong>${maxRomStat.rom.toFixed(1)}° (${maxRomLabel})</strong></div>
        <div class="bl-ss-card"><span class="eyebrow">Tracking</span><strong>${(avgTQ * 100).toFixed(0)}%</strong></div>
      </div>
      <div class="bl-summary-section">
        <span class="eyebrow">Bone ROM Report</span>
        <div class="bl-ij-grid">${romParts.length ? romParts : '<div class="bl-inspector-empty"><p>No bone data with ROM</p></div>'}</div>
      </div>
      <div class="bl-summary-section">
        <span class="eyebrow">Metadata</span>
        <div class="bl-ij-grid">
          <div class="bl-ij-row"><span class="bl-ij-label">Activity</span><span class="bl-ij-val">${meta.activityName}</span></div>
          <div class="bl-ij-row"><span class="bl-ij-label">Version</span><span class="bl-ij-val">fmt ${session.formatVersion} / eng ${session.engineVersion}</span></div>
          <div class="bl-ij-row"><span class="bl-ij-label">Recorded</span><span class="bl-ij-val">${new Date(meta.createdAt).toLocaleString()}</span></div>
          <div class="bl-ij-row"><span class="bl-ij-label">Avg Symmetry</span><span class="bl-ij-val">${avgSym ? (Math.max(0, 1 - avgSym / 45) * 100).toFixed(0) : '—'}%</span></div>
        </div>
      </div>
      ${session.events.length ? `<div class="bl-summary-section">
        <span class="eyebrow">Events (${session.events.length})</span>
        <div class="bl-summary-events">${session.events.map((e) => `<div class="bl-summary-event">
          <span class="bl-summary-ev-type">${e.ty}</span>
          <span class="bl-summary-ev-label">${e.lb}</span>
          <span class="bl-summary-ev-time">${(e.t / 1000).toFixed(1)}s</span>
        </div>`).join('')}</div>
      </div>` : ''}
    `;
  }

  private computeAngleStats(frames: StoredFrame[]): Array<{ boneId: number; min: number; max: number; avg: number; rom: number }> {
    const boneMap = new Map<number, number[]>();
    for (const f of frames) {
      for (const b of f.b) {
        if (!boneMap.has(b.p)) boneMap.set(b.p, []);
        const q = b.r;
        const angle = Math.acos(Math.min(1, Math.max(-1, q[3]))) * 2 * (180 / Math.PI);
        boneMap.get(b.p)!.push(angle);
      }
    }
    const result: Array<{ boneId: number; min: number; max: number; avg: number; rom: number }> = [];
    for (const [boneId, samples] of boneMap) {
      if (samples.length < 5) continue;
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      result.push({ boneId, min, max, avg, rom: max - min });
    }
    return result.sort((a, b) => b.rom - a.rom);
  }

  clear(): void {
    this.body.innerHTML = `<div class="bl-inspector-empty">${icon('pulse')}<p>Select a saved session</p></div>`;
  }

  destroy(): void {
    this.element.remove();
  }
}
