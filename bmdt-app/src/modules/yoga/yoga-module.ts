import type { AnalysisResult } from '../../analysis';
import { TransparentScoringEngine, PoseComparisonEngine } from '../../analysis';
import type { JointScoreDetail, ScoredPoseDifference } from '../../analysis';
import type { ActivityModule } from '../registry';
import { yogaPoses, type YogaPoseEntry } from './poses';

export interface SessionSummary {
  overallAccuracy: number;
  holdDurationSec: number;
  maxAccuracy: number;
  worstJoint: { jointId: string; accuracy: number } | null;
  bestJoint: { jointId: string; accuracy: number } | null;
  jointBreakdown: JointScoreDetail[];
  accuracyTimeline: Array<{ timeSec: number; accuracy: number }>;
  completed: boolean;
}

export interface YogaState {
  available: boolean;
  phase: 'idle' | 'transitioning' | 'holding' | 'completed';
  selectedPose: YogaPoseEntry | null;
  overallMatch: number;
  holdElapsedSec: number;
  holdTargetSec: number;
  maxAccuracy: number;
  feedback: string[];
  scored: ScoredPoseDifference | null;
  inspectorJoint: JointScoreDetail | null;
  sessionSummary: SessionSummary | null;
}

export type YogaListener = (state: Readonly<YogaState>) => void;

const HOLD_THRESHOLD = 0.7;
const RELEASE_THRESHOLD = 0.4;

export class YogaModule implements ActivityModule {
  id = 'yoga' as const;
  title = 'Yoga Studio';
  description = 'Guided movement workspace ready for pose programs.';

  private readonly poseComparator = new PoseComparisonEngine();
  private readonly scorer = new TransparentScoringEngine();
  private readonly listeners = new Set<YogaListener>();

  private state: YogaState = {
    available: false,
    phase: 'idle',
    selectedPose: null,
    overallMatch: 0,
    holdElapsedSec: 0,
    holdTargetSec: 0,
    maxAccuracy: 0,
    feedback: [],
    scored: null,
    inspectorJoint: null,
    sessionSummary: null,
  };

  private holdStartTime = 0;
  private wasHolding = false;
  private transitionStart = 0;
  private inTransition = false;
  private accuracyTimeline: Array<{ timeSec: number; accuracy: number }> = [];
  private holdStartFrameTime = 0;

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  subscribe(listener: YogaListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): Readonly<YogaState> {
    return this.state;
  }

  selectPose(entry: YogaPoseEntry): void {
    this.holdStartTime = 0;
    this.wasHolding = false;
    this.inTransition = true;
    this.transitionStart = performance.now();
    this.accuracyTimeline = [];
    this.holdStartFrameTime = 0;
    this.state = {
      available: true,
      phase: 'transitioning',
      selectedPose: entry,
      overallMatch: 0,
      holdElapsedSec: 0,
      holdTargetSec: entry.holdDurationSec,
      maxAccuracy: 0,
      feedback: [],
      scored: null,
      inspectorJoint: null,
      sessionSummary: null,
    };
    this.notify();
  }

  resetPose(): void {
    this.holdStartTime = 0;
    this.wasHolding = false;
    this.inTransition = false;
    this.accuracyTimeline = [];
    this.state = {
      available: true,
      phase: 'idle',
      selectedPose: this.state.selectedPose,
      overallMatch: 0,
      holdElapsedSec: 0,
      holdTargetSec: this.state.selectedPose?.holdDurationSec ?? 0,
      maxAccuracy: 0,
      feedback: [],
      scored: null,
      inspectorJoint: null,
      sessionSummary: null,
    };
    this.notify();
  }

  inspectJoint(jointId: string): void {
    const scored = this.state.scored;
    if (!scored) return;
    const detail = scored.jointScores.find((j) => j.jointId === jointId) ?? null;
    this.state = { ...this.state, inspectorJoint: detail };
    this.notify();
  }

  clearInspector(): void {
    this.state = { ...this.state, inspectorJoint: null };
    this.notify();
  }

  onAnalysisResult(result: AnalysisResult): void {
    const entry = this.state.selectedPose;
    if (!entry) return;

    if (this.inTransition) {
      const elapsed = performance.now() - this.transitionStart;
      if (elapsed < entry.transitionDurationSec * 1000) return;
      this.inTransition = false;
      this.state = { ...this.state, phase: 'idle' };
      this.notify();
    }

    const reference = entry.pose;
    const difference = this.poseComparator.compare(result, reference);
    const scored = this.scorer.score(result, reference, entry.weights);

    const match = scored.overallAccuracy;
    const maxAcc = Math.max(this.state.maxAccuracy, match);
    const feedback = difference.feedback;

    let phase = this.state.phase;
    let holdElapsed = this.state.holdElapsedSec;
    let completed = this.state.phase === 'completed';

    if (match >= HOLD_THRESHOLD && !this.inTransition) {
      if (!this.wasHolding) {
        this.wasHolding = true;
        this.holdStartTime = result.timestamp;
        this.holdStartFrameTime = result.timestamp;
        this.accuracyTimeline = [];
      }
      if (this.holdStartTime > 0) {
        holdElapsed = (result.timestamp - this.holdStartTime) / 1000;
        if (this.holdStartFrameTime > 0) {
          const elapsedSinceHoldStart = result.timestamp - this.holdStartFrameTime;
          this.accuracyTimeline.push({ timeSec: elapsedSinceHoldStart / 1000, accuracy: match });
        }
        if (holdElapsed >= entry.holdDurationSec && !completed) {
          completed = true;
          phase = 'completed';
        } else {
          phase = 'holding';
        }
      }
    } else if (match < RELEASE_THRESHOLD && !this.inTransition) {
      this.wasHolding = false;
      this.holdStartTime = 0;
      this.holdStartFrameTime = 0;
      if (phase !== 'completed') {
        holdElapsed = 0;
        phase = 'idle';
      }
    }

    let sessionSummary: SessionSummary | null = this.state.sessionSummary;
    if (completed && !sessionSummary) {
      let worstJoint: { jointId: string; accuracy: number } | null = null;
      let bestJoint: { jointId: string; accuracy: number } | null = null;
      for (const js of scored.jointScores) {
        if (!js.available) continue;
        if (!worstJoint || js.rawMatchFactor < worstJoint.accuracy) worstJoint = { jointId: js.jointId, accuracy: js.rawMatchFactor };
        if (!bestJoint || js.rawMatchFactor > bestJoint.accuracy) bestJoint = { jointId: js.jointId, accuracy: js.rawMatchFactor };
      }
      sessionSummary = {
        overallAccuracy: match,
        holdDurationSec: holdElapsed,
        maxAccuracy: maxAcc,
        worstJoint,
        bestJoint,
        jointBreakdown: scored.jointScores,
        accuracyTimeline: [...this.accuracyTimeline],
        completed: true,
      };
    }

    const inspectorJoint = this.state.inspectorJoint
      ? scored.jointScores.find((j) => j.jointId === this.state.inspectorJoint!.jointId) ?? null
      : null;

    this.state = {
      ...this.state,
      phase,
      overallMatch: match,
      holdElapsedSec: holdElapsed,
      maxAccuracy: maxAcc,
      feedback,
      scored,
      inspectorJoint,
      sessionSummary,
    };
    this.notify();
  }
}
