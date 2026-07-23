import { icon } from './icons';
import type { PlaybackEngine } from '../platform/replay';
import type { ReplaySnapshot } from '../platform/replay';
import type { FrameEventEntry } from '../platform/session-format';

export class ReplayTimeline {
  readonly element: HTMLElement;
  private engine: PlaybackEngine;
  private playing = false;
  private unsub: (() => void) | null = null;
  private scrubBar: HTMLElement;
  private playBtn: HTMLButtonElement;
  private timeDisplay: HTMLElement;
  private durationDisplay: HTMLElement;
  private speedDisplay: HTMLButtonElement;
  private eventMarkers: HTMLElement;
  private frameInfo: HTMLElement;

  constructor(engine: PlaybackEngine) {
    this.engine = engine;
    this.element = document.createElement('div');
    this.element.className = 'bl-timeline glass-panel';
    this.element.innerHTML = `
      <div class="bl-tl-controls">
        <button class="bl-tl-btn" data-bl-tl-prev-event title="Previous Event">${icon('chevron')}</button>
        <button class="bl-tl-btn" data-bl-tl-step-back title="Step Back">${icon('skip-back')}</button>
        <button class="bl-tl-btn bl-tl-play" data-bl-tl-play title="Play/Pause">${icon('play')}</button>
        <button class="bl-tl-btn" data-bl-tl-step-fwd title="Step Forward">${icon('skip-fwd')}</button>
        <button class="bl-tl-btn" data-bl-tl-next-event title="Next Event">${icon('chevron')}</button>
        <button class="bl-tl-btn" data-bl-tl-stop title="Stop">${icon('square')}</button>
      </div>
      <div class="bl-tl-speed">
        <button class="bl-tl-speed-btn" data-bl-tl-speed title="Cycle Speed">1x</button>
      </div>
      <div class="bl-tl-track" data-bl-tl-track>
        <div class="bl-tl-events" data-bl-tl-events></div>
        <div class="bl-tl-scrub-track" data-bl-tl-scrub-track>
          <div class="bl-tl-scrub-bar" data-bl-tl-scrub-bar></div>
        </div>
      </div>
      <div class="bl-tl-info">
        <span class="bl-tl-time" data-bl-tl-time>00:00.000</span>
        <span class="bl-tl-divider">/</span>
        <span class="bl-tl-duration" data-bl-tl-duration>00:00.000</span>
      </div>
      <div class="bl-tl-frame-info" data-bl-tl-frame>Frame 0</div>
    `;

    this.scrubBar = this.element.querySelector<HTMLElement>('[data-bl-tl-scrub-bar]')!;
    this.playBtn = this.element.querySelector<HTMLButtonElement>('[data-bl-tl-play]')!;
    this.timeDisplay = this.element.querySelector<HTMLElement>('[data-bl-tl-time]')!;
    this.durationDisplay = this.element.querySelector<HTMLElement>('[data-bl-tl-duration]')!;
    this.speedDisplay = this.element.querySelector<HTMLButtonElement>('[data-bl-tl-speed]')!;
    this.eventMarkers = this.element.querySelector<HTMLElement>('[data-bl-tl-events]')!;
    this.frameInfo = this.element.querySelector<HTMLElement>('[data-bl-tl-frame]')!;

    this.element.addEventListener('click', (e) => this.handleClick(e));
    this.setupScrubbing();
    this.unsub = this.engine.subscribe((s) => this.render(s));
  }

  private handleClick(event: MouseEvent): void {
    const t = event.target as HTMLElement;
    if (t.closest('[data-bl-tl-play]')) { this.playing ? this.engine.pause() : this.engine.play(); return; }
    if (t.closest('[data-bl-tl-stop]')) { this.engine.stop(); return; }
    if (t.closest('[data-bl-tl-step-back]')) { this.engine.stepBackward(); return; }
    if (t.closest('[data-bl-tl-step-fwd]')) { this.engine.stepForward(); return; }
    if (t.closest('[data-bl-tl-prev-event]')) { this.jumpToEvent(-1); return; }
    if (t.closest('[data-bl-tl-next-event]')) { this.jumpToEvent(1); return; }
    if (t.closest('[data-bl-tl-speed]')) { this.engine.cycleSpeed(); return; }
  }

  private jumpToEvent(dir: number): void {
    const events = this.engine.session.events ?? [];
    if (events.length === 0) return;
    const ct = this.engine.state.currentTime;
    let target = -1;
    if (dir > 0) {
      for (let i = 0; i < events.length; i++) { if (events[i].t > ct + 10) { target = events[i].f; break; } }
    } else {
      for (let i = events.length - 1; i >= 0; i--) { if (events[i].t < ct - 10) { target = events[i].f; break; } }
    }
    if (target >= 0) this.engine.seek(target);
  }

  private setupScrubbing(): void {
    const track = this.element.querySelector<HTMLElement>('[data-bl-tl-track]')!;
    let scrubbing = false;
    const onMove = (cx: number) => {
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      const frame = Math.round(pct * (this.engine.frameCount - 1));
      this.engine.seek(frame);
    };
    track.addEventListener('mousedown', (e) => { scrubbing = true; onMove(e.clientX); e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (scrubbing) onMove(e.clientX); });
    window.addEventListener('mouseup', () => { scrubbing = false; });
  }

  private render(snap: ReplaySnapshot): void {
    this.playing = snap.playing;
    this.playBtn.innerHTML = snap.playing ? icon('square') : icon('play');
    this.playBtn.classList.toggle('bl-tl-is-playing', snap.playing);

    const pct = snap.totalFrames > 1 ? snap.currentFrame / (snap.totalFrames - 1) : 0;
    this.scrubBar.style.width = `${pct * 100}%`;
    this.timeDisplay.textContent = this.fmt(snap.currentTime);
    this.durationDisplay.textContent = this.fmt(snap.totalDuration);
    this.speedDisplay.textContent = `${snap.speed}x`;
    this.frameInfo.textContent = `Frame ${snap.currentFrame + 1} / ${snap.totalFrames}`;
    this.renderEvents(snap);
  }

  private renderEvents(snap: ReplaySnapshot): void {
    if (!this.eventMarkers) return;
    const duration = snap.totalDuration || 1;
    this.eventMarkers.innerHTML = (snap.events ?? []).map((e) => {
      const pct = (e.t / duration) * 100;
      const cls = e.ty === 'start' ? 'bl-tl-ev-start' : e.ty === 'end' ? 'bl-tl-ev-end' : 'bl-tl-ev-mark';
      return `<span class="bl-tl-event ${cls}" style="left:${pct}%" title="${e.lb}"></span>`;
    }).join('');
  }

  private fmt(ms: number): string {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const msVal = Math.floor(ms % 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(msVal).padStart(3, '0')}`;
  }

  destroy(): void { this.unsub?.(); }
}
