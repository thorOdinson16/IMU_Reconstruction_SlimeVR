import type { CanonicalPoseFrame } from '../types';
import type { AnalysisResult } from '../analysis';
import type { SessionFile, StoredFrame, PlaybackSpeed, FrameEventEntry } from './session-format';

export interface ReplaySnapshot {
  playing: boolean;
  completed: boolean;
  currentFrame: number;
  totalFrames: number;
  currentTime: number;
  totalDuration: number;
  speed: PlaybackSpeed;
  events: FrameEventEntry[];
}

export type ReplayListener = (snap: ReplaySnapshot) => void;
export type PoseCallback = (pose: CanonicalPoseFrame, frameIndex: number) => void;
export type FrameCallback = (frame: StoredFrame, frameIndex: number) => void;

const SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 4];

export class PlaybackEngine {
  readonly session: SessionFile;
  private playing = false;
  private completed = false;
  private frameIndex = 0;
  private speed: PlaybackSpeed = 1;
  private animId: number | null = null;
  private lastTickWall = 0;
  private replayListeners = new Set<ReplayListener>();
  private poseListeners = new Set<PoseCallback>();
  private frameListeners = new Set<FrameCallback>();
  private analysisCache = new Map<string, (frame: CanonicalPoseFrame) => AnalysisResult>();

  constructor(session: SessionFile) {
    this.session = session;
  }

  get state(): ReplaySnapshot {
    return {
      playing: this.playing,
      completed: this.completed,
      currentFrame: this.frameIndex,
      totalFrames: this.session.frames.length,
      currentTime: this.currentFrameTime(),
      totalDuration: this.totalDuration(),
      speed: this.speed,
      events: this.session.events ?? [],
    };
  }

  private currentFrameTime(): number {
    const frames = this.session.frames;
    if (this.frameIndex >= frames.length) return this.totalDuration();
    return frames[this.frameIndex].t;
  }

  totalDuration(): number {
    const f = this.session.frames;
    return f.length >= 2 ? f[f.length - 1].t - f[0].t : 0;
  }

  getCurrentPose(): CanonicalPoseFrame | null { return this.frameToPose(this.frameIndex); }
  getPose(index: number): CanonicalPoseFrame | null { return this.frameToPose(index); }
  getCurrentFrameData(): StoredFrame | null { return this.getFrameData(this.frameIndex); }
  getFrameData(index: number): StoredFrame | null {
    return index >= 0 && index < this.session.frames.length ? this.session.frames[index] : null;
  }

  subscribe(cb: ReplayListener): () => void {
    this.replayListeners.add(cb);
    cb(this.state);
    return () => this.replayListeners.delete(cb);
  }

  onPose(cb: PoseCallback): () => void {
    this.poseListeners.add(cb);
    return () => this.poseListeners.delete(cb);
  }

  onFrame(cb: FrameCallback): () => void {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  private notify(): void {
    const s = this.state;
    for (const l of this.replayListeners) l(s);
  }

  play(): void {
    if (this.playing) return;
    if (this.completed || this.frameIndex >= this.session.frames.length - 1) {
      this.frameIndex = 0;
      this.completed = false;
    }
    this.playing = true;
    this.lastTickWall = performance.now();
    this.notify();
    this.emitCurrent();
    this.tick();
  }

  pause(): void {
    this.playing = false;
    if (this.animId !== null) { cancelAnimationFrame(this.animId); this.animId = null; }
    this.notify();
  }

  stop(): void {
    this.pause();
    this.frameIndex = 0;
    this.completed = false;
    this.notify();
    this.emitCurrent();
  }

  restart(): void {
    this.frameIndex = 0;
    this.completed = false;
    this.notify();
    this.emitCurrent();
  }

  stepForward(): void {
    this.pause();
    if (this.frameIndex < this.session.frames.length - 1) this.frameIndex++;
    this.notify();
    this.emitCurrent();
  }

  stepBackward(): void {
    this.pause();
    if (this.frameIndex > 0) this.frameIndex--;
    this.notify();
    this.emitCurrent();
  }

  seek(frame: number): void {
    this.frameIndex = Math.max(0, Math.min(frame, this.session.frames.length - 1));
    this.completed = false;
    this.notify();
    this.emitCurrent();
  }

  seekToTime(ms: number): void {
    const frames = this.session.frames;
    let idx = 0;
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].t <= ms) idx = i;
    }
    this.seek(idx);
  }

  setSpeed(speed: PlaybackSpeed): void { this.speed = speed; this.notify(); }

  cycleSpeed(): void {
    const i = SPEEDS.indexOf(this.speed);
    this.speed = SPEEDS[(i + 1) % SPEEDS.length];
    this.notify();
  }

  get frameCount(): number { return this.session.frames.length; }

  private tick = (): void => {
    if (!this.playing) return;
    const now = performance.now();
    const wallElapsed = now - this.lastTickWall;
    this.lastTickWall = now;
    const simElapsed = wallElapsed * this.speed;
    const startTime = this.session.frames[0]?.t ?? 0;
    const currentTime = this.currentFrameTime() - startTime + simElapsed;

    const frames = this.session.frames;
    let newIdx = this.frameIndex;
    for (let i = this.frameIndex; i < frames.length; i++) {
      if (frames[i].t - startTime <= currentTime) newIdx = i;
      else break;
    }

    if (newIdx !== this.frameIndex) {
      this.frameIndex = newIdx;
      this.emitCurrent();
    }

    if (this.frameIndex >= frames.length - 1) {
      this.playing = false;
      this.completed = true;
      this.notify();
      return;
    }
    this.notify();
    this.animId = requestAnimationFrame(this.tick);
  }

  private emitCurrent(): void {
    const pose = this.getCurrentPose();
    if (pose) {
      for (const cb of this.poseListeners) cb(pose, this.frameIndex);
    }
    const fd = this.getCurrentFrameData();
    if (fd) {
      for (const cb of this.frameListeners) cb(fd, this.frameIndex);
    }
  }

  private frameToPose(index: number): CanonicalPoseFrame | null {
    const rf = this.session.frames[index];
    if (!rf) return null;
    const bones = new Map<number, any>();
    for (const b of rf.b) {
      bones.set(b.p, {
        bodyPart: b.p,
        rotation: { x: b.r[0], y: b.r[1], z: b.r[2], w: b.r[3] },
        position: { x: b.h[0], y: b.h[1], z: b.h[2] },
        length: b.l,
      });
    }
    return { receivedAt: rf.t, bones, trackedBodyParts: bones.size };
  }

  destroy(): void {
    this.pause();
    this.replayListeners.clear();
    this.poseListeners.clear();
    this.frameListeners.clear();
  }
}
