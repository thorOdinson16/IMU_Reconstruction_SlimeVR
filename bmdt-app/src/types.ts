export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface CanonicalBone {
  bodyPart: number;
  rotation: { x: number; y: number; z: number; w: number } | null;
  position: { x: number; y: number; z: number } | null;
  length: number;
}

export interface CanonicalPoseFrame {
  receivedAt: number;
  bones: ReadonlyMap<number, CanonicalBone>;
  trackedBodyParts: number;
}
