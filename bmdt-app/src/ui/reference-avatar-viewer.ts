import * as THREE from 'three';
import { BodyPart } from 'solarxr-protocol';
import { MocapScene } from '../../../gui-mocap/src/scene';
import type { ReferencePose, JointTarget } from '../analysis';
import { targetMid } from '../analysis/scoring';

const JOINT_TO_BODYPART: Record<string, BodyPart> = {
  neck: BodyPart.NECK,
  spine: BodyPart.UPPER_CHEST,
  leftShoulder: BodyPart.LEFT_UPPER_ARM,
  rightShoulder: BodyPart.RIGHT_UPPER_ARM,
  leftElbow: BodyPart.LEFT_LOWER_ARM,
  rightElbow: BodyPart.RIGHT_LOWER_ARM,
  leftWrist: BodyPart.LEFT_HAND,
  rightWrist: BodyPart.RIGHT_HAND,
  leftHip: BodyPart.LEFT_UPPER_LEG,
  rightHip: BodyPart.RIGHT_UPPER_LEG,
  leftKnee: BodyPart.LEFT_LOWER_LEG,
  rightKnee: BodyPart.RIGHT_LOWER_LEG,
  leftAnkle: BodyPart.LEFT_FOOT,
  rightAnkle: BodyPart.RIGHT_FOOT,
};

const _qx = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _qt = new THREE.Quaternion();

function targetToLocalQuat(target: JointTarget): THREE.Quaternion {
  const fe = targetMid(target.flexionExtension);
  const ir = targetMid(target.internalExternalRotation);
  const aa = targetMid(target.abductionAdduction);
  const feRad = THREE.MathUtils.degToRad(fe);
  const irRad = THREE.MathUtils.degToRad(ir);
  const aaRad = THREE.MathUtils.degToRad(aa);
  _qx.setFromAxisAngle(new THREE.Vector3(1, 0, 0), feRad);
  _qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), irRad);
  _qz.setFromAxisAngle(new THREE.Vector3(0, 0, 1), aaRad);
  return _qt.copy(_qz).multiply(_qy).multiply(_qx);
}

function buildLocalQuats(targets: JointTarget[]): Map<BodyPart, THREE.Quaternion> {
  const map = new Map<BodyPart, THREE.Quaternion>();
  for (const t of targets) {
    const bp = JOINT_TO_BODYPART[t.jointId];
    if (bp == null) continue;
    map.set(bp, targetToLocalQuat(t));
  }
  return map;
}

export class ReferenceAvatarViewer {
  readonly element: HTMLElement;
  private scene: MocapScene | null = null;
  private currentPose: ReferencePose | null = null;
  private modelLoaded = false;

  private ro: ResizeObserver;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'ref-avatar-viewer';
    const canvas = document.createElement('canvas');
    this.element.append(canvas);
    this.scene = new MocapScene(canvas, (msg) => {
      if (msg === 'Model loaded') {
        this.modelLoaded = true;
        if (this.currentPose) this.applyPose();
      }
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.element);
  }

  start(): void {
    this.scene?.start();
  }

  setPose(pose: ReferencePose): void {
    this.currentPose = pose;
    if (this.modelLoaded) this.applyPose();
  }

  clear(): void {
    this.currentPose = null;
    if (this.modelLoaded && this.scene) {
      this.scene.setStaticPose(new Map());
    }
  }

  destroy(): void {
    this.ro.disconnect();
    this.scene?.stop();
    this.element.remove();
  }

  resize(): void {
    this.scene?.resize();
  }

  private applyPose(): void {
    if (!this.scene || !this.currentPose) return;
    const quats = buildLocalQuats(this.currentPose.targets);
    this.scene.setStaticPose(quats);
  }
}
