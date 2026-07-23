export const FORMAT_VERSION = '1.0';
export const ENGINE_VERSION = '1.0.0';
export const ANALYSIS_VERSION = '1.0.0';

export interface StoredBone {
  p: number;
  r: [number, number, number, number];
  h: [number, number, number];
  l: number;
}

export interface StoredJointAngles {
  j: string;
  fe: number | null;
  aa: number | null;
  ir: number | null;
  av: boolean;
}

export interface StoredTrackingQuality {
  o: number;
  rq: number;
  pq: number;
  tb: number;
}

export interface StoredValidation {
  v: boolean;
  pb: number;
  rc: number;
  pc: number;
}

export interface StoredFrame {
  t: number;
  dt: number;
  b: StoredBone[];
  ja: StoredJointAngles[];
  com: [number, number, number] | null;
  cv: number | null;
  ca: number | null;
  sy: number | null;
  tq: StoredTrackingQuality | null;
  vl: StoredValidation | null;
  qf: string[];
}

export interface SessionMetadata {
  sessionId: string;
  userId: string;
  activityType: string;
  activityName: string;
  createdAt: number;
  durationMs: number;
  frameCount: number;
  avgFrameRate: number;
  avgTrackingQuality: number;
  notes: string;
}

export interface SessionFile {
  formatVersion: string;
  engineVersion: string;
  analysisVersion: string;
  metadata: SessionMetadata;
  frames: StoredFrame[];
  events: FrameEventEntry[];
}

export interface FrameEventEntry {
  t: number;
  f: number;
  ty: string;
  lb: string;
  jt?: string;
  vl?: number;
}

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4;

export function createEmptySession(userId: string, sessionId: string): SessionFile {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    analysisVersion: ANALYSIS_VERSION,
    metadata: {
      sessionId,
      userId,
      activityType: 'lab',
      activityName: 'Live Recording',
      createdAt: Date.now(),
      durationMs: 0,
      frameCount: 0,
      avgFrameRate: 0,
      avgTrackingQuality: 0,
      notes: '',
    },
    frames: [],
    events: [],
  };
}

export function updateSessionMetadata(session: SessionFile): void {
  const meta = session.metadata;
  meta.frameCount = session.frames.length;
  if (session.frames.length >= 2) {
    meta.durationMs = session.frames[session.frames.length - 1].t - session.frames[0].t;
    const totalSec = meta.durationMs / 1000;
    meta.avgFrameRate = totalSec > 0 ? session.frames.length / totalSec : 0;
  }
  if (session.frames.length > 0) {
    const validFrames = session.frames.filter((f) => f.tq);
    const avgTQ = validFrames.reduce((s, f) => s + (f.tq?.o ?? 0), 0);
    meta.avgTrackingQuality = validFrames.length > 0 ? avgTQ / validFrames.length : 0;
  }
}
