import { saveJSON, loadJSON, listKeys, removeItem } from './store';
import type { CanonicalPoseFrame } from '../types';
import type { AnalysisResult } from '../analysis';
import { createEmptySession, updateSessionMetadata } from './session-format';
import type {
  SessionFile, SessionMetadata, StoredFrame, StoredBone,
  StoredJointAngles, StoredTrackingQuality, StoredValidation,
} from './session-format';

const SESSION_PREFIX = 'bmdt_ses_';

function sessionKey(id: string): string { return `${SESSION_PREFIX}${id}`; }
export function isSessionKey(k: string): boolean { return k.startsWith(SESSION_PREFIX); }
export function sessionIdFromKey(k: string): string { return k.slice(SESSION_PREFIX.length); }

export function listSessionKeys(): string[] {
  return listKeys(SESSION_PREFIX).filter((k) => k.startsWith(SESSION_PREFIX));
}

export class SessionRecorder {
  private session: SessionFile | null = null;
  private sessionStartWall = 0;
  private frameCount = 0;
  private prevFrame: CanonicalPoseFrame | null = null;
  private prevTime = 0;

  get isRecording(): boolean { return this.session !== null; }
  get currentSession(): SessionFile | null { return this.session; }
  get currentFrameCount(): number { return this.frameCount; }

  start(userId: string, activityType = 'lab', activityName = 'Live Recording'): string {
    const sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.session = createEmptySession(userId, sessionId);
    this.session.metadata.activityType = activityType;
    this.session.metadata.activityName = activityName;
    this.sessionStartWall = performance.now();
    this.frameCount = 0;
    this.prevFrame = null;
    this.prevTime = 0;
    return sessionId;
  }

  recordFrame(frame: CanonicalPoseFrame, analysis: AnalysisResult | null): void {
    if (!this.session) return;
    const elapsed = performance.now() - this.sessionStartWall;
    const dt = this.prevTime > 0 ? elapsed - this.prevTime : 0;
    this.prevTime = elapsed;

    const bones: StoredBone[] = [];
    for (const [, bone] of frame.bones) {
      bones.push({
        p: bone.bodyPart,
        r: bone.rotation
          ? [bone.rotation.x, bone.rotation.y, bone.rotation.z, bone.rotation.w]
          : [0, 0, 0, 0],
        h: bone.position
          ? [bone.position.x, bone.position.y, bone.position.z]
          : [0, 0, 0],
        l: bone.length,
      });
    }

    let jointAngles: StoredJointAngles[] = [];
    let com: [number, number, number] | null = null;
    let comVelocity: number | null = null;
    let comAccel: number | null = null;
    let symmetry: number | null = null;
    let trackingQuality: StoredTrackingQuality | null = null;
    let validation: StoredValidation | null = null;
    let qualityFlags: string[] = [];

    if (analysis) {
      jointAngles = [];
      for (const [jointId, ja] of analysis.jointAngles) {
        if (ja.available) {
          jointAngles.push({ j: jointId, fe: ja.flexionExtension, aa: ja.abductionAdduction, ir: ja.internalExternalRotation, av: true });
        }
      }
      if (analysis.features.centerOfMass.position) {
        const p = analysis.features.centerOfMass.position;
        com = [p.x, p.y, p.z];
        comVelocity = analysis.features.centerOfMass.speed ?? null;
        if (this.prevFrame && com && dt > 0) {
          const prevCom = com;
          const speed = analysis.features.centerOfMass.speed ?? 0;
        }
      }
      symmetry = analysis.features.symmetry.orientationDifferenceDeg ?? null;
      const tq = analysis.features.trackingQuality;
      trackingQuality = { o: tq.overall, rq: tq.rotationQuality, pq: tq.positionQuality, tb: tq.trackedBodyParts };
      const v = analysis.validation;
      validation = { v: v.valid, pb: v.presentBodyParts, rc: v.rotationCoverage, pc: v.positionCoverage };
      qualityFlags = [...analysis.qualityFlags];
    }

    const sf: StoredFrame = {
      t: elapsed,
      dt,
      b: bones,
      ja: jointAngles,
      com,
      cv: comVelocity,
      ca: comAccel,
      sy: symmetry,
      tq: trackingQuality,
      vl: validation,
      qf: qualityFlags,
    };

    this.session.frames.push(sf);
    this.frameCount++;
    this.prevFrame = frame;
  }

  stop(): SessionFile | null {
    if (!this.session || this.frameCount < 2) {
      this.session = null;
      return null;
    }
    updateSessionMetadata(this.session);
    saveSession(this.session);
    const result = this.session;
    this.session = null;
    return result;
  }

  abort(): void {
    this.session = null;
  }
}

export function saveSession(session: SessionFile): void {
  try {
    saveJSON(sessionKey(session.metadata.sessionId), session);
  } catch {
    const truncated: SessionFile = {
      ...session,
      frames: session.frames.slice(0, Math.min(500, session.frames.length)),
      metadata: { ...session.metadata, frameCount: Math.min(500, session.frames.length) },
    };
    saveJSON(sessionKey(session.metadata.sessionId), truncated);
  }
}

export function loadSession(sessionId: string): SessionFile | null {
  return loadJSON<SessionFile>(sessionKey(sessionId));
}

export function deleteSession(sessionId: string): void {
  removeItem(sessionKey(sessionId));
}

export function renameSession(sessionId: string, newName: string): SessionFile | null {
  const session = loadSession(sessionId);
  if (!session) return null;
  session.metadata.activityName = newName;
  saveSession(session);
  return session;
}

export function listSessions(): SessionFile[] {
  return listSessionKeys()
    .map((k) => loadJSON<SessionFile>(k))
    .filter((s): s is SessionFile => s !== null);
}

export function getSessionsForUser(userId: string): SessionFile[] {
  return listSessions().filter((s) => s.metadata.userId === userId);
}

export function getSessionMetadatas(): SessionMetadata[] {
  return listSessions().map((s) => s.metadata);
}
