import type { CanonicalPoseFrame } from '../types';

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export const BodyPart = {
  NONE: 0,
  HEAD: 1,
  NECK: 2,
  CHEST: 3,
  WAIST: 4,
  HIP: 5,
  LEFT_UPPER_LEG: 6,
  RIGHT_UPPER_LEG: 7,
  LEFT_LOWER_LEG: 8,
  RIGHT_LOWER_LEG: 9,
  LEFT_FOOT: 10,
  RIGHT_FOOT: 11,
  LEFT_LOWER_ARM: 14,
  RIGHT_LOWER_ARM: 15,
  LEFT_UPPER_ARM: 16,
  RIGHT_UPPER_ARM: 17,
  LEFT_HAND: 18,
  RIGHT_HAND: 19,
  LEFT_SHOULDER: 20,
  RIGHT_SHOULDER: 21,
  UPPER_CHEST: 22,
} as const;

export type JointId =
  | 'neck' | 'spine'
  | 'leftShoulder' | 'rightShoulder'
  | 'leftElbow' | 'rightElbow'
  | 'leftWrist' | 'rightWrist'
  | 'leftHip' | 'rightHip'
  | 'leftKnee' | 'rightKnee'
  | 'leftAnkle' | 'rightAnkle';

export type QualityFlag =
  | 'noPose'
  | 'missingPosition'
  | 'missingRotation'
  | 'invalidPosition'
  | 'invalidRotation'
  | 'insufficientBodyFrame'
  | 'insufficientHistory'
  | 'timestampDiscontinuity';

export interface FrameValidation {
  valid: boolean;
  presentBodyParts: number;
  rotationCoverage: number;
  positionCoverage: number;
  flags: readonly QualityFlag[];
  missingRotation: readonly number[];
  missingPosition: readonly number[];
}

export interface BodyCoordinateFrame {
  available: boolean;
  origin: Vec3 | null;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  flags: readonly QualityFlag[];
}

export interface JointAngles {
  joint: JointId;
  available: boolean;
  flexionExtension: number | null;
  abductionAdduction: number | null;
  internalExternalRotation: number | null;
  relativeRotation: Quat | null;
  globalOrientation: { roll: number; pitch: number; yaw: number } | null;
  source: 'relativeRotation' | 'threePoint' | 'unavailable';
  flags: readonly QualityFlag[];
}

export interface BoneKinematics {
  bodyPart: number;
  orientation: Quat | null;
  relativeOrientation: Quat | null;
  angularVelocityDegPerSec: number | null;
  angularAccelerationDegPerSec2: number | null;
  velocity: Vec3 | null;
  speed: number | null;
  movementDirection: Vec3 | null;
}

export interface TrackingQuality {
  overall: number;
  rotationQuality: number;
  positionQuality: number;
  trackedBodyParts: number;
}

export interface CenterOfMassEstimate {
  available: boolean;
  position: Vec3 | null;
  velocity: Vec3 | null;
  speed: number | null;
  contributingMass: number;
}

export interface SymmetryMetrics {
  available: boolean;
  orientationDifferenceDeg: number | null;
  lateralPositionDifference: number | null;
  contributingPairs: number;
}

export interface WeightShiftEstimate {
  available: boolean;
  lateralOffset: number | null;
  direction: 'left' | 'right' | 'center' | 'unavailable';
}

export interface StabilityMetrics {
  available: boolean;
  centerOfMassSpeed: number | null;
  recentCenterOfMassSpeedRms: number | null;
  still: boolean | null;
}

export interface TemporalMetrics {
  frameIntervalMs: number | null;
  historyDurationMs: number;
  poseHoldDurationMs: number;
  sampleCount: number;
  flags: readonly QualityFlag[];
}

export interface MotionFeatures {
  bones: ReadonlyMap<number, BoneKinematics>;
  centerOfMass: CenterOfMassEstimate;
  symmetry: SymmetryMetrics;
  weightShift: WeightShiftEstimate;
  stability: StabilityMetrics;
  trackingQuality: TrackingQuality;
}

export interface AnalysisResult {
  timestamp: number;
  pose: CanonicalPoseFrame;
  validation: FrameValidation;
  bodyFrame: BodyCoordinateFrame;
  jointAngles: ReadonlyMap<JointId, JointAngles>;
  features: MotionFeatures;
  temporal: TemporalMetrics;
  qualityFlags: readonly QualityFlag[];
}
