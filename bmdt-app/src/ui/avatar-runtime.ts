import { ProtocolClient } from '../../../gui-mocap/src/protocol';
import { MocapScene } from '../../../gui-mocap/src/scene';
import { normalizePoseFrame } from '../runtime/canonical-pose';
import type { CanonicalPoseFrame, ConnectionStatus } from '../types';
import { BodyPart, BoneT, QuatT, Vec3fT } from 'solarxr-protocol';

interface AvatarRuntimeCallbacks {
  onConnection(status: ConnectionStatus): void;
  onFrame(frame: CanonicalPoseFrame): void;
}

type ResetKind = 'yaw' | 'full' | 'mounting';
type AutoBoneAction = 'record' | 'process' | 'apply';

/**
 * A BMDT host for the existing gui-mocap rendering and transport runtime.
 * No Three.js, retargeting, camera, or WebSocket implementation is duplicated here.
 */
export class AvatarRuntime {
  readonly element: HTMLElement;
  private scene: MocapScene | null = null;
  private client: ProtocolClient | null = null;
  private walkEnabled = false;
  private replayMode = false;

  constructor(private readonly callbacks: AvatarRuntimeCallbacks) {
    this.element = document.createElement('section');
    this.element.className = 'avatar-viewport glass-panel';
    this.element.innerHTML = `
      <div class="viewport-aurora"></div>
      <div class="viewport-header">
        <div><span class="eyebrow"><span class="live-dot"></span> Motion canvas</span><h2>Live avatar</h2></div>
        <div class="avatar-controls" aria-label="Avatar controls">
          <button data-avatar-action="reset-yaw" title="Reset yaw">Yaw reset</button>
          <button data-avatar-action="reset-full" title="Full calibration">Full reset</button>
          <button data-avatar-action="reset-mounting" title="Reset sensor mounting">Mounting</button>
          <button data-avatar-action="autobone-record" title="Start AutoBone calibration capture">AB capture</button>
          <button data-avatar-action="autobone-process" title="Process AutoBone calibration capture">AB process</button>
          <button data-avatar-action="autobone-apply" title="Apply AutoBone calibration">AB apply</button>
          <button data-avatar-action="walk" title="Toggle existing walk-mode controls">Walk: off</button>
        </div>
      </div>
      <div class="avatar-stage"><canvas aria-label="Live Mixamo avatar"></canvas><div class="avatar-empty"><span data-model-status>Loading avatar runtime</span><small>Existing SlimeVR renderer is initializing</small></div></div>
      <div class="viewport-footer"><span><i class="pulse-glyph"></i><b data-stream-label>Stream standby</b></span><span class="viewport-note">Reserved for future overlays</span></div>`;
    this.element.addEventListener('click', this.onControlClick);
  }

  start(): void {
    if (this.scene || this.client) return;
    const canvas = this.element.querySelector<HTMLCanvasElement>('canvas')!;
    const status = this.element.querySelector<HTMLElement>('[data-model-status]')!;
    this.scene = new MocapScene(canvas, (message) => {
      status.textContent = message;
      this.element.classList.toggle('model-ready', message === 'Model loaded');
    });
    this.scene.start();

    this.client = new ProtocolClient(
      `ws://${location.hostname}:21110`,
      (bones, syntheticTrackers) => {
        if (this.replayMode) return;
        this.scene?.update(bones, syntheticTrackers, this.walkEnabled);
        const frame = normalizePoseFrame(bones);
        this.element.classList.toggle('has-stream', frame.trackedBodyParts > 0);
        this.element.querySelector<HTMLElement>('[data-stream-label]')!.textContent = frame.trackedBodyParts
          ? `${frame.trackedBodyParts} body parts streaming`
          : 'Stream standby';
        this.element.querySelector<HTMLElement>('.avatar-empty')!.style.opacity = frame.trackedBodyParts ? '0' : '1';
        this.callbacks.onFrame(frame);
      },
      (connected) => this.callbacks.onConnection(connected ? 'connected' : 'disconnected'),
      () => undefined,
    );
    this.client.connect();
  }

  reset(kind: ResetKind): void {
    if (!this.client) return;
    if (kind === 'yaw') this.client.sendResetYaw();
    if (kind === 'full') this.client.sendResetFull();
    if (kind === 'mounting') this.client.sendResetMounting();
    this.scene?.resetLocomotion();
  }

  toggleWalk(): boolean {
    this.walkEnabled = !this.walkEnabled;
    this.client?.sendToggleWalk(this.walkEnabled);
    const button = this.element.querySelector<HTMLElement>('[data-avatar-action="walk"]')!;
    button.textContent = `Walk: ${this.walkEnabled ? 'on' : 'off'}`;
    button.classList.toggle('active', this.walkEnabled);
    return this.walkEnabled;
  }

  runAutoBone(action: AutoBoneAction): void {
    if (action === 'record') this.client?.sendAutoBoneRecord();
    if (action === 'process') this.client?.sendAutoBoneProcess();
    if (action === 'apply') this.client?.sendAutoBoneApply();
  }

  stop(): void {
    this.client?.disconnect();
    this.scene?.stop();
    this.client = null;
    this.scene = null;
  }

  resize(): void {
    this.scene?.resize();
  }

  setCameraFraming(theta: number, phi: number, radius: number): void {
    this.scene?.setCameraFraming(theta, phi, radius);
  }

  setReplayMode(active: boolean): void {
    this.replayMode = active;
    if (!active) {
      this.element.querySelector<HTMLElement>('.avatar-empty')!.style.opacity = '0';
    }
  }

  isReplayMode(): boolean { return this.replayMode; }

  feedReplayFrame(frame: CanonicalPoseFrame): void {
    if (!this.scene) return;
    const bones: BoneT[] = [];
    for (const [, bone] of frame.bones) {
      const q = bone.rotation
        ? new QuatT(bone.rotation.x, bone.rotation.y, bone.rotation.z, bone.rotation.w)
        : null;
      const p = bone.position
        ? new Vec3fT(bone.position.x, bone.position.y, bone.position.z)
        : null;
      bones.push(new BoneT(bone.bodyPart, q, bone.length, p));
    }
    this.scene.update(bones, [], false);
    this.element.classList.toggle('has-stream', bones.length > 0);
    this.element.querySelector<HTMLElement>('.avatar-empty')!.style.opacity = bones.length ? '0' : '1';
    this.callbacks.onFrame(frame);
  }

  private onControlClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-avatar-action]');
    if (!button) return;
    const action = button.dataset.avatarAction;
    if (action === 'walk') this.toggleWalk();
    if (action === 'reset-yaw') this.reset('yaw');
    if (action === 'reset-full') this.reset('full');
    if (action === 'reset-mounting') this.reset('mounting');
    if (action === 'autobone-record') this.runAutoBone('record');
    if (action === 'autobone-process') this.runAutoBone('process');
    if (action === 'autobone-apply') this.runAutoBone('apply');
  };
}
