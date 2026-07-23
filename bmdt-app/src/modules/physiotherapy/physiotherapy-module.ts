import type { AnalysisResult } from '../../analysis';
import type { ActivityModule } from '../registry';
import type { ExerciseDef, MovementAxis } from './exercises';
import { getExercise } from './exercises';

export type PhysioPhase = 'idle' | 'active' | 'completed';

export interface PhysiotherapyState {
  phase: PhysioPhase;
  selectedExerciseId: string | null;
  sessionDurationSec: number;
  sessionStartTime: number;
  currentAngle: number | null;
  minAngle: number | null;
  maxAngle: number | null;
  avgAngle: number | null;
  angleSamples: number[];
  velocity: number | null;
  smoothness: number | null;
  symmetry: number | null;
  repCount: number;
  holdElapsedSec: number;
  holdTargetSec: number;
  trackingConfidence: number;
  feedback: string[];
  sessionSummary: SessionSummary | null;
}

export interface SessionSummary {
  maxAngle: number;
  minAngle: number;
  avgAngle: number;
  repCount: number;
  holdDurationSec: number;
  sessionDurationSec: number;
  maxVelocity: number;
  avgVelocity: number;
  trackingConfidence: number;
}

type RepPhase = 'rest' | 'ascending' | 'descending';

const ANGLE_HISTORY_CAPACITY = 300;
const VELOCITY_SMOOTHING_FRAMES = 5;
const VELOCITY_HIGH_THRESHOLD = 120;
const VELOCITY_LOW_THRESHOLD = 20;
const VELOCITY_STEADY_THRESHOLD = 10;

function extractAngle(
  result: AnalysisResult,
  jointId: string,
  axis: MovementAxis,
): number | null {
  const j = result.jointAngles.get(jointId as any);
  if (!j?.available) return null;
  const value = j[axis];
  return value ?? null;
}

export class PhysiotherapyModule implements ActivityModule {
  readonly id = 'physiotherapy' as const;
  readonly title = 'Physiotherapy';
  readonly description = 'Rehabilitation exercise measurement and range of motion tracking';

  private state: PhysiotherapyState;
  private prevAngle: number | null = null;
  private repPhase: RepPhase = 'rest';
  private prevVelocity: number | null = null;
  private velocityBuffer: number[] = [];
  private lastHoldStart: number | null = null;
  private holdAccumulated = 0;
  private lastFeedbackTime = 0;
  private listeners: Set<(state: PhysiotherapyState) => void> = new Set();
  private isHolding = false;

  constructor() {
    this.state = this.freshState();
  }

  getState(): PhysiotherapyState { return this.state; }

  subscribe(listener: (state: PhysiotherapyState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  selectExercise(id: string): void {
    this.reset();
    const next = { ...this.state, selectedExerciseId: id };
    this.state = next;
    this.notify();
  }

  startSession(): void {
    const exercise = this.state.selectedExerciseId ? getExercise(this.state.selectedExerciseId) : null;
    if (!exercise) return;
    this.state = {
      ...this.freshState(),
      selectedExerciseId: exercise.id,
      phase: 'active',
      sessionStartTime: performance.now(),
      holdTargetSec: exercise.holdDurationSec,
    };
    this.repPhase = 'rest';
    this.prevAngle = null;
    this.prevVelocity = null;
    this.velocityBuffer = [];
    this.lastHoldStart = null;
    this.holdAccumulated = 0;
    this.isHolding = false;
    this.notify();
  }

  stopSession(): void {
    if (this.state.phase !== 'active') return;
    const s = this.state;
    const samples = s.angleSamples;
    const avg = samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
    const maxVel = this.velocityBuffer.length > 0 ? Math.max(...this.velocityBuffer.map(Math.abs)) : 0;
    const avgVel = this.velocityBuffer.length > 0
      ? this.velocityBuffer.reduce((a, b) => a + Math.abs(b), 0) / this.velocityBuffer.length
      : 0;
    this.state = {
      ...s,
      phase: 'completed',
      avgAngle: avg,
      sessionSummary: {
        maxAngle: s.maxAngle ?? 0,
        minAngle: s.minAngle ?? 0,
        avgAngle: avg ?? 0,
        repCount: s.repCount,
        holdDurationSec: this.holdAccumulated + (this.isHolding ? (performance.now() - (this.lastHoldStart ?? performance.now())) / 1000 : 0),
        sessionDurationSec: (performance.now() - s.sessionStartTime) / 1000,
        maxVelocity: maxVel,
        avgVelocity: avgVel,
        trackingConfidence: s.trackingConfidence,
      },
    };
    this.notify();
  }

  reset(): void {
    this.state = this.freshState();
    this.repPhase = 'rest';
    this.prevAngle = null;
    this.prevVelocity = null;
    this.velocityBuffer = [];
    this.lastHoldStart = null;
    this.holdAccumulated = 0;
    this.isHolding = false;
    this.notify();
  }

  onAnalysisResult(result: AnalysisResult): void {
    if (this.state.phase !== 'active') return;

    const exercise = this.state.selectedExerciseId ? getExercise(this.state.selectedExerciseId) : null;
    if (!exercise) return;

    const angle = extractAngle(result, exercise.joint, exercise.movementAxis);
    if (angle == null) return;

    const now = performance.now();
    const elapsed = (now - this.state.sessionStartTime) / 1000;
    const s = this.state;

    const velocity = this.prevAngle != null ? angle - this.prevAngle : 0;
    this.velocityBuffer.push(velocity);
    if (this.velocityBuffer.length > VELOCITY_SMOOTHING_FRAMES) this.velocityBuffer.shift();
    const smoothedVel = this.velocityBuffer.length > 0
      ? this.velocityBuffer.reduce((a, b) => a + b, 0) / this.velocityBuffer.length
      : velocity;

    const velMag = Math.abs(smoothedVel);
    const smoothness = this.prevVelocity != null
      ? Math.abs(smoothedVel - this.prevVelocity)
      : null;
    this.prevVelocity = smoothedVel;

    const maxAngle = s.maxAngle != null ? Math.max(s.maxAngle, angle) : angle;
    const minAngle = s.minAngle != null ? Math.min(s.minAngle, angle) : angle;
    const samples = [...s.angleSamples, angle];
    if (samples.length > ANGLE_HISTORY_CAPACITY) samples.shift();
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

    const trackingConfidence = result.features.trackingQuality.overall * result.validation.rotationCoverage;

    const feedback = this.generateFeedback(angle, velocity, smoothedVel, exercise, maxAngle, minAngle);

    const repCount = this.detectRep(angle, smoothedVel, exercise);

    let holdElapsed = s.holdElapsedSec;
    const isNearEndRange = this.isAtEndRange(angle, maxAngle, exercise, smoothedVel);

    if (isNearEndRange && velMag < VELOCITY_STEADY_THRESHOLD) {
      if (!this.isHolding) {
        this.isHolding = true;
        this.lastHoldStart = performance.now();
      }
      if (this.lastHoldStart != null) {
        holdElapsed = (this.holdAccumulated + (now - this.lastHoldStart)) / 1000;
      }
    } else {
      if (this.isHolding && this.lastHoldStart != null) {
        this.holdAccumulated += (now - this.lastHoldStart) / 1000;
      }
      this.isHolding = false;
      this.lastHoldStart = null;
    }

    this.state = {
      ...s,
      currentAngle: angle,
      maxAngle,
      minAngle,
      avgAngle: avg,
      angleSamples: samples,
      velocity: smoothedVel,
      smoothness,
      repCount,
      holdElapsedSec: holdElapsed,
      sessionDurationSec: elapsed,
      trackingConfidence,
      feedback,
    };
    this.prevAngle = angle;
    this.notify();
  }

  private isAtEndRange(angle: number, currentMax: number, exercise: ExerciseDef, velocity: number): boolean {
    const expectedRange = Math.abs(exercise.expectedRomMax - exercise.expectedRomMin);
    const threshold = 0.85 * expectedRange;
    if (exercise.movementAxis === 'flexionExtension') {
      if (exercise.expectedRomMax > 0) {
        return angle >= exercise.expectedRomMin + threshold;
      }
      return angle <= exercise.expectedRomMax + expectedRange * 0.15;
    }
    if (exercise.movementAxis === 'internalExternalRotation') {
      return Math.abs(angle) >= Math.abs(exercise.expectedRomMin) * 0.85;
    }
    if (exercise.movementAxis === 'abductionAdduction') {
      return angle >= exercise.expectedRomMin + threshold;
    }
    return false;
  }

  private detectRep(angle: number, velocity: number, exercise: ExerciseDef): number {
    const engage = exercise.engageThresholdDeg;
    const ret = exercise.returnThresholdDeg;
    const isPositiveDirection = exercise.movementAxis === 'flexionExtension'
      ? exercise.expectedRomMax > exercise.expectedRomMin
      : true;

    const engaged = isPositiveDirection ? angle >= engage : angle <= engage;
    const returned = isPositiveDirection ? angle <= ret : angle >= ret;
    const movingPositive = velocity > 2;
    const movingNegative = velocity < -2;

    switch (this.repPhase) {
      case 'rest':
        if (engaged && movingPositive) {
          this.repPhase = 'ascending';
        } else if (engaged && movingNegative) {
          this.repPhase = 'descending';
        }
        break;
      case 'ascending':
        if (returned && movingNegative) {
          this.repPhase = 'rest';
          return this.state.repCount + 1;
        }
        if (movingNegative) this.repPhase = 'descending';
        break;
      case 'descending':
        if (returned && movingPositive) {
          this.repPhase = 'rest';
          return this.state.repCount + 1;
        }
        if (movingPositive) this.repPhase = 'ascending';
        break;
    }
    return this.state.repCount;
  }

  private generateFeedback(
    angle: number,
    velocity: number,
    smoothedVel: number,
    exercise: ExerciseDef,
    maxAngle: number,
    minAngle: number,
  ): string[] {
    const now = performance.now();
    const messages: string[] = [];
    const expectedMax = Math.abs(exercise.expectedRomMax - exercise.expectedRomMin);
    const currentRom = Math.abs(maxAngle - minAngle);
    const velMag = Math.abs(smoothedVel);

    if (currentRom < expectedMax * 0.6 && this.state.repCount > 2) {
      if (now - this.lastFeedbackTime > 4000) {
        messages.push('Try to move through a larger range of motion');
      }
    }

    if (velMag > VELOCITY_HIGH_THRESHOLD) {
      if (now - this.lastFeedbackTime > 3000) {
        messages.push('Slow down the movement');
      }
    }

    if (velMag < VELOCITY_LOW_THRESHOLD && this.state.repCount > 0 && !this.isHolding) {
      if (now - this.lastFeedbackTime > 5000) {
        messages.push('Maintain a steady pace');
      }
    }

    if (this.state.repCount === 0 && this.state.sessionDurationSec > 5) {
      if (currentRom < expectedMax * 0.3) {
        messages.push('Move through a larger range to begin counting');
      }
    }

    if (this.isHolding) {
      messages.push('Hold at end-range');
    }

    if (velocity < -30 && this.state.repCount > 0) {
      const max = this.state.maxAngle ?? 0;
      if (max < expectedMax * 0.8) {
        messages.push('Try to reach a higher position');
      }
    }

    if (messages.length > 0) this.lastFeedbackTime = now;
    return messages;
  }

  private freshState(): PhysiotherapyState {
    return {
      phase: 'idle',
      selectedExerciseId: null,
      sessionDurationSec: 0,
      sessionStartTime: 0,
      currentAngle: null,
      minAngle: null,
      maxAngle: null,
      avgAngle: null,
      angleSamples: [],
      velocity: null,
      smoothness: null,
      symmetry: null,
      repCount: 0,
      holdElapsedSec: 0,
      holdTargetSec: 0,
      trackingConfidence: 0,
      feedback: [],
      sessionSummary: null,
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.state);
  }
}
