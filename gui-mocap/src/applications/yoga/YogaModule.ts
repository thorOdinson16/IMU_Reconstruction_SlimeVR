import { BoneT } from 'solarxr-protocol';
import { PoseDefinition, PoseScore } from '../../pose/types';
import { PoseEngine } from '../../pose/PoseEngine';

export class YogaModule {
  private engine = new PoseEngine();
  private enabled = false;
  private poseDefs: PoseDefinition[];
  private activePoseIndex = 0;
  private lastScore: PoseScore | null = null;
  private completed = false;

  constructor(poses: PoseDefinition[]) {
    this.poseDefs = poses;
  }

  getName(): string {
    return 'Yoga Trainer';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (v) {
      this.engine.loadPose(this.poseDefs[this.activePoseIndex]);
    } else {
      this.engine.unloadPose();
      this.lastScore = null;
      this.completed = false;
    }
  }

  getActivePoseName(): string | null {
    if (!this.enabled) return null;
    return this.poseDefs[this.activePoseIndex].name;
  }

  getPoseList(): { name: string; index: number }[] {
    return this.poseDefs.map((def, i) => ({ name: def.name, index: i }));
  }

  selectPose(index: number) {
    if (index < 0 || index >= this.poseDefs.length) return;
    this.activePoseIndex = index;
    this.engine.loadPose(this.poseDefs[index]);
    this.lastScore = null;
    this.completed = false;
    this.engine.resetCompletion();
  }

  update(skeleton: BoneT[], dt: number): PoseScore | null {
    const result = this.engine.update(skeleton, dt);
    this.lastScore = result;
    if (result && result.completionState === 'completed') {
      this.completed = true;
    }
    return result;
  }

  getStatusText(): string {
    if (!this.lastScore) return '';
    const score = this.lastScore;
    const def = this.poseDefs[this.activePoseIndex];

    if (score.completionState === 'completed') return 'Completed';
    if (score.completionState === 'holding') {
      return `Maintain pose (${(score.holdProgress * 100).toFixed(0)}%)`;
    }

    if (score.worstJoint && def.hints) {
      const hint = def.hints[score.worstJoint];
      if (hint) return hint;
    }

    if (score.overallScore < 0.5) {
      return 'Adjust your pose';
    }
    return 'Aligning...';
  }

  getLastScore(): PoseScore | null {
    return this.lastScore;
  }

  getCompleted(): boolean {
    return this.completed;
  }

  resetCompletion() {
    this.completed = false;
    this.engine.resetCompletion();
  }
}
