import { BodyPart } from 'solarxr-protocol';

export type JointState = 'GREEN' | 'YELLOW' | 'RED';

export interface JointScore {
  bodyPart: BodyPart;
  score: number;
  state: JointState;
}

export type CompletionState = 'inactive' | 'adjusting' | 'holding' | 'completed';

export interface PoseScore {
  overallScore: number;
  smoothedScore: number;
  jointScores: JointScore[];
  completionState: CompletionState;
  holdProgress: number;
  holdElapsed: number;
  holdDuration: number;
  worstJoint?: BodyPart;
}

export interface QuaternionRef {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface PoseDefinition {
  name: string;
  description: string;
  requiredJoints: BodyPart[];
  referenceRotations: Partial<Record<BodyPart, QuaternionRef>>;
  jointWeights: Partial<Record<BodyPart, number>>;
  jointTolerances: Partial<Record<BodyPart, number>>;
  minimumScore: number;
  holdDuration: number;
  hints?: Partial<Record<BodyPart, string>>;
}

export interface AppModule {
  getName(): string;
  isEnabled(): boolean;
  setEnabled(v: boolean): void;
  getActivePoseName(): string | null;
  getPoseList(): { name: string; index: number }[];
  selectPose(index: number): void;
  update(skeleton: import('solarxr-protocol').BoneT[], dt: number): PoseScore | null;
  getStatusText(): string;
  getCompleted(): boolean;
  resetCompletion(): void;
}
