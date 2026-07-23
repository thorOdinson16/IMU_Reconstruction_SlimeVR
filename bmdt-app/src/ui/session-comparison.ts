import { icon } from './icons';
import type { PlaybackEngine } from '../platform/replay';
import type { SessionFile } from '../platform/session-format';
import { ReplayTimeline } from './replay-timeline';

export class SessionComparison {
  readonly element: HTMLElement;
  private engineA: PlaybackEngine | null = null;
  private engineB: PlaybackEngine | null = null;
  private timelineA: ReplayTimeline | null = null;
  private timelineB: ReplayTimeline | null = null;
  private slotA: HTMLElement;
  private slotB: HTMLElement;
  private labelA: HTMLElement;
  private labelB: HTMLElement;
  private infoA: HTMLElement;
  private infoB: HTMLElement;
  private syncBtn: HTMLButtonElement;
  private syncEnabled = true;
  private frameCallbacksA: (() => void) | null = null;
  private frameCallbacksB: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'bl-comparison';
    this.element.innerHTML = `
      <div class="bl-comp-header">
        <div class="bl-comp-info">
          <span class="eyebrow accent">Side-by-Side</span>
          <h2>Session Comparison</h2>
        </div>
        <button class="bl-comp-sync-btn active" data-bl-comp-sync title="Synchronized Playback">${icon('pulse')}<span>Synchronized</span></button>
      </div>
      <div class="bl-comp-viewports">
        <div class="bl-comp-side">
          <div class="bl-comp-label" data-bl-comp-label-a>Session A</div>
          <div class="bl-comp-slot" data-bl-comp-slot-a>
            <div class="bl-comp-empty">${icon('play')}<p>Select Session A</p></div>
          </div>
          <div class="bl-comp-info-panel" data-bl-comp-info-a></div>
        </div>
        <div class="bl-comp-vs">
          <span>VS</span>
        </div>
        <div class="bl-comp-side">
          <div class="bl-comp-label" data-bl-comp-label-b>Session B</div>
          <div class="bl-comp-slot" data-bl-comp-slot-b>
            <div class="bl-comp-empty">${icon('play')}<p>Select Session B</p></div>
          </div>
          <div class="bl-comp-info-panel" data-bl-comp-info-b></div>
        </div>
      </div>
    `;
    this.slotA = this.element.querySelector<HTMLElement>('[data-bl-comp-slot-a]')!;
    this.slotB = this.element.querySelector<HTMLElement>('[data-bl-comp-slot-b]')!;
    this.labelA = this.element.querySelector<HTMLElement>('[data-bl-comp-label-a]')!;
    this.labelB = this.element.querySelector<HTMLElement>('[data-bl-comp-label-b]')!;
    this.infoA = this.element.querySelector<HTMLElement>('[data-bl-comp-info-a]')!;
    this.infoB = this.element.querySelector<HTMLElement>('[data-bl-comp-info-b]')!;
    this.syncBtn = this.element.querySelector<HTMLButtonElement>('[data-bl-comp-sync]')!;

    this.syncBtn.addEventListener('click', () => {
      this.syncEnabled = !this.syncEnabled;
      this.syncBtn.classList.toggle('active', this.syncEnabled);
      this.syncBtn.querySelector('span')!.textContent = this.syncEnabled ? 'Synchronized' : 'Independent';
    });
  }

  loadSession(side: 'A' | 'B', session: SessionFile, avatarSlot: HTMLElement): void {
    if (side === 'A') {
      this.labelA.textContent = session.metadata.activityName || 'Session A';
      this.slotA.innerHTML = '';
      this.slotA.append(avatarSlot);
      this.updateInfo(this.infoA, session);
    } else {
      this.labelB.textContent = session.metadata.activityName || 'Session B';
      this.slotB.innerHTML = '';
      this.slotB.append(avatarSlot);
      this.updateInfo(this.infoB, session);
    }
  }

  private updateInfo(panel: HTMLElement, session: SessionFile): void {
    panel.innerHTML = `
      <div class="bl-comp-stat"><span class="eyebrow">Activity</span><strong>${session.metadata.activityName}</strong></div>
      <div class="bl-comp-stat"><span class="eyebrow">Frames</span><strong>${session.metadata.frameCount}</strong></div>
      <div class="bl-comp-stat"><span class="eyebrow">Duration</span><strong>${(session.metadata.durationMs / 1000).toFixed(1)}s</strong></div>
    `;
  }

  clearSide(side: 'A' | 'B'): void {
    const slot = side === 'A' ? this.slotA : this.slotB;
    const label = side === 'A' ? this.labelA : this.labelB;
    slot.innerHTML = `<div class="bl-comp-empty">${icon('play')}<p>Select Session ${side}</p></div>`;
    label.textContent = `Session ${side}`;
  }

  clear(): void {
    this.clearSide('A');
    this.clearSide('B');
  }

  playTogether(): void {
    this.engineA?.play();
    this.engineB?.play();
  }

  pauseTogether(): void {
    this.engineA?.pause();
    this.engineB?.pause();
  }

  stopTogether(): void {
    this.engineA?.stop();
    this.engineB?.stop();
  }

  destroy(): void {
    this.engineA?.destroy();
    this.engineB?.destroy();
    this.timelineA?.destroy();
    this.timelineB?.destroy();
    this.element.remove();
  }
}
