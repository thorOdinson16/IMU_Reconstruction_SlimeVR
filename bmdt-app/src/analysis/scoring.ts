import type { AnalysisResult, JointId } from './model';
import type { AngleRange, JointTarget, ReferencePose } from './pose-comparison';

/**
 * SCORING ENGINE — Transparent, deterministic joint-by-joint accuracy.
 *
 * For each joint:
 *   1. Measure angular error per component (flex/ext, abd/add, int/ext rot)
 *   2. Clamp error using the joint's tolerance band
 *   3. Convert clamped error to a 0-1 score
 *   4. Multiply by the joint's configurable weight
 *   5. Weighted average across all joints
 *
 * No hidden heuristics. Every intermediate value is inspectable.
 */

export interface JointWeight {
  jointId: JointId;
  weight: number;
}

export interface AngleScore {
  component: 'flexionExtension' | 'abductionAdduction' | 'internalExternalRotation';
  actual: number | null;
  targetMid: number;
  lowerBound: number;
  upperBound: number;
  errorDeg: number | null;
  clampedErrorDeg: number | null;
  score: number | null;
}

export interface JointScoreDetail {
  jointId: JointId;
  available: boolean;
  weight: number;
  angles: AngleScore[];
  rawMatchFactor: number;
  weightedScore: number;
}

export interface ScoredPoseDifference {
  overallAccuracy: number;
  jointScores: JointScoreDetail[];
  weightCoverage: number;
}

/**
 * Compute the midpoint of an angle range for use as the "target" value.
 */
export function targetMid(range: AngleRange): number {
  return (range.min + range.max) / 2;
}

/**
 * How far `actual` is from the nearest edge of `range`, in degrees.
 * Returns 0 if `actual` is inside the range.
 */
export function angularErrorDeg(actual: number, range: AngleRange): number {
  if (actual >= range.min && actual <= range.max) return 0;
  return actual < range.min ? range.min - actual : actual - range.max;
}

/**
 * Score a single angle component.
 *
 * scoring:
 *   - Inside tolerance → score = 1.0
 *   - Outside tolerance → score = max(0, 1 - error / toleranceBand)
 *   - Where toleranceBand defines how many degrees outside the range
 *     yields a score of 0.
 *
 * The toleranceBand defaults to the width of the target range itself,
 * but can be overridden. This means a 10° range with 20° tolerance
 * gives partial credit (0.5) at 10° outside.
 */
export function scoreAngle(errorDeg: number, toleranceBand: number): number {
  if (errorDeg <= 0) return 1;
  if (toleranceBand <= 0) return 0;
  return Math.max(0, 1 - errorDeg / toleranceBand);
}

const DEFAULT_TOLERANCE_BAND = 25;

export class TransparentScoringEngine {
  /**
   * Score a live frame against a reference pose, returning the full
   * breakdown. The default joint weights are uniform (1 / N) but can
   * be overridden per-pose.
   */
  score(
    live: AnalysisResult,
    reference: ReferencePose,
    weights: JointWeight[],
  ): ScoredPoseDifference {
    const weightMap = new Map<JointId, number>();
    let totalWeight = 0;
    for (const w of weights) {
      weightMap.set(w.jointId, w.weight);
      totalWeight += w.weight;
    }
    if (totalWeight <= 0) {
      const uniform = 1 / reference.targets.length;
      for (const t of reference.targets) {
        weightMap.set(t.jointId, uniform);
      }
      totalWeight = 1;
    }

    const jointScores: JointScoreDetail[] = [];
    let weightedSum = 0;
    let appliedWeightSum = 0;

    for (const target of reference.targets) {
      const weight = weightMap.get(target.jointId) ?? (1 / reference.targets.length);
      const liveJoint = live.jointAngles.get(target.jointId);
      const available = liveJoint?.available === true && liveJoint.source !== 'unavailable';

      const midFE = targetMid(target.flexionExtension);
      const midAA = targetMid(target.abductionAdduction);
      const midIR = targetMid(target.internalExternalRotation);

      const angleComponents: Array<{
        component: AngleScore['component'];
        actual: number | null;
        range: AngleRange;
      }> = [
        { component: 'flexionExtension', actual: available ? liveJoint!.flexionExtension : null, range: target.flexionExtension },
        { component: 'abductionAdduction', actual: available ? liveJoint!.abductionAdduction : null, range: target.abductionAdduction },
        { component: 'internalExternalRotation', actual: available ? liveJoint!.internalExternalRotation : null, range: target.internalExternalRotation },
      ];

      const angles: AngleScore[] = [];
      let componentSum = 0;
      let componentCount = 0;

      for (const comp of angleComponents) {
        let errorDeg: number | null = null;
        let clampedErrorDeg: number | null = null;
        let score: number | null = null;

        if (comp.actual !== null) {
          errorDeg = angularErrorDeg(comp.actual, comp.range);
          const range_span = comp.range.max - comp.range.min;
          const toleranceBand = range_span > 0 ? range_span : DEFAULT_TOLERANCE_BAND;
          clampedErrorDeg = errorDeg;
          score = scoreAngle(errorDeg, toleranceBand);
          componentSum += score;
          componentCount++;
        }

        angles.push({
          component: comp.component,
          actual: comp.actual,
          targetMid: targetMid(comp.range),
          lowerBound: comp.range.min,
          upperBound: comp.range.max,
          errorDeg,
          clampedErrorDeg,
          score,
        });
      }

      const rawMatchFactor = componentCount > 0 ? componentSum / componentCount : 0;
      const weightedScore = rawMatchFactor * weight;
      weightedSum += weightedScore;
      appliedWeightSum += weight;

      jointScores.push({
        jointId: target.jointId,
        available,
        weight,
        angles,
        rawMatchFactor,
        weightedScore,
      });
    }

    const overallAccuracy = appliedWeightSum > 0 ? weightedSum / appliedWeightSum : 0;
    const weightCoverage = totalWeight > 0 ? appliedWeightSum / totalWeight : 0;

    return { overallAccuracy, jointScores, weightCoverage };
  }
}
