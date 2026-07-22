import { BoneT } from 'solarxr-protocol';
import { PoseDefinition, PoseScore, CompletionState } from './types';
import { scorePose } from './PoseScorer';

export class PoseEngine {
  private definition: PoseDefinition | null = null;
  private holdElapsed = 0;
  private completed = false;
  private smoothedScore = 0;
  private smoothingAlpha = 0.3;

  loadPose(definition: PoseDefinition) {
    this.definition = definition;
    this.holdElapsed = 0;
    this.completed = false;
    this.smoothedScore = 0;
  }

  unloadPose() {
    this.definition = null;
    this.holdElapsed = 0;
    this.completed = false;
    this.smoothedScore = 0;
  }

  update(skeleton: BoneT[], dt: number): PoseScore | null {
    if (!this.definition) return null;

    const { overallScore, jointScores, worstJoint } = scorePose(skeleton, this.definition);
    const { minimumScore, holdDuration } = this.definition;

    this.smoothedScore = this.smoothingAlpha * overallScore + (1 - this.smoothingAlpha) * this.smoothedScore;

    let completionState: CompletionState = 'adjusting';
    let holdProgress = 0;

    if (overallScore >= minimumScore) {
      this.holdElapsed += dt;
      holdProgress = Math.min(1, this.holdElapsed / holdDuration);
      if (this.holdElapsed >= holdDuration) {
        completionState = 'completed';
        this.completed = true;
      } else {
        completionState = 'holding';
      }
    } else {
      if (this.holdElapsed > 0) {
        this.holdElapsed = 0;
      }
      holdProgress = 0;
    }

    return {
      overallScore,
      smoothedScore: this.smoothedScore,
      jointScores,
      completionState,
      holdProgress,
      holdElapsed: this.holdElapsed,
      holdDuration,
      worstJoint,
    };
  }

  getCompleted(): boolean {
    return this.completed;
  }

  resetCompletion() {
    this.completed = false;
    this.holdElapsed = 0;
  }
}
