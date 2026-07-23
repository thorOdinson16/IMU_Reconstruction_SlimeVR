import type { ReferencePose } from '../analysis';
import { targetMid } from '../analysis/scoring';

interface BoneSegment {
  name: string;
  parent: string | null;
  length: number;
}

const SKELETON: BoneSegment[] = [
  { name: 'root', parent: null, length: 0 },
  { name: 'spine', parent: 'root', length: 60 },
  { name: 'chest', parent: 'spine', length: 50 },
  { name: 'neck', parent: 'chest', length: 20 },
  { name: 'head', parent: 'neck', length: 25 },
  { name: 'leftShoulder', parent: 'chest', length: 30 },
  { name: 'leftUpperArm', parent: 'leftShoulder', length: 55 },
  { name: 'leftLowerArm', parent: 'leftUpperArm', length: 50 },
  { name: 'rightShoulder', parent: 'chest', length: 30 },
  { name: 'rightUpperArm', parent: 'rightShoulder', length: 55 },
  { name: 'rightLowerArm', parent: 'rightUpperArm', length: 50 },
  { name: 'leftUpperLeg', parent: 'root', length: 60 },
  { name: 'leftLowerLeg', parent: 'leftUpperLeg', length: 55 },
  { name: 'leftFoot', parent: 'leftLowerLeg', length: 20 },
  { name: 'rightUpperLeg', parent: 'root', length: 60 },
  { name: 'rightLowerLeg', parent: 'rightUpperLeg', length: 55 },
  { name: 'rightFoot', parent: 'rightLowerLeg', length: 20 },
];

const JOINT_MAP: Record<string, { sagittal: string; coronal: string }> = {
  spine: { sagittal: 'flexionExtension', coronal: 'abductionAdduction' },
  leftUpperArm: { sagittal: 'flexionExtension', coronal: 'abductionAdduction' },
  rightUpperArm: { sagittal: 'flexionExtension', coronal: 'abductionAdduction' },
  leftLowerArm: { sagittal: 'flexionExtension', coronal: 'abductionAdduction' },
  rightLowerArm: { sagittal: 'flexionExtension', coronal: 'abductionAdduction' },
  leftUpperLeg: { sagittal: 'flexionExtension', coronal: 'abductionAdduction' },
  rightUpperLeg: { sagittal: 'flexionExtension', coronal: 'abductionAdduction' },
  leftLowerLeg: { sagittal: 'flexionExtension', coronal: 'abductionAdduction' },
  rightLowerLeg: { sagittal: 'flexionExtension', coronal: 'abductionAdduction' },
};

const JOINT_RANGES: Record<string, { sagittal: number[]; coronal: number[] }> = {
  leftUpperArm: { sagittal: [-30, 180], coronal: [-60, 90] },
  rightUpperArm: { sagittal: [-30, 180], coronal: [-90, 60] },
  leftLowerArm: { sagittal: [0, 150], coronal: [-20, 20] },
  rightLowerArm: { sagittal: [0, 150], coronal: [-20, 20] },
  leftUpperLeg: { sagittal: [-30, 120], coronal: [-40, 40] },
  rightUpperLeg: { sagittal: [-30, 120], coronal: [-40, 40] },
  leftLowerLeg: { sagittal: [0, 150], coronal: [-10, 10] },
  rightLowerLeg: { sagittal: [0, 150], coronal: [-10, 10] },
  spine: { sagittal: [-30, 60], coronal: [-30, 30] },
};

export class ReferencePoseViewer {
  readonly element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentPose: ReferencePose | null = null;
  private dpr: number;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'ref-pose-viewer';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ref-pose-canvas';
    this.element.append(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.element);
    this.resize();
    this.drawEmpty();
  }

  setPose(pose: ReferencePose): void {
    this.currentPose = pose;
    this.draw();
  }

  clear(): void {
    this.currentPose = null;
    this.drawEmpty();
  }

  destroy(): void {
    this.element.remove();
  }

  private resize(): void {
    const rect = this.element.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.currentPose) this.draw();
    else this.drawEmpty();
  }

  private drawEmpty(): void {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.font = '500 11px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#687185';
    ctx.fillText('Select a pose to see reference', w / 2, h / 2);
  }

  private draw(): void {
    const pose = this.currentPose;
    if (!pose) return this.drawEmpty();

    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    const scale = Math.min(w, h) / 340;
    const cx = w / 2;
    const groundY = h - 20;

    const targetMap = new Map<string, { fe: number; aa: number }>();
    for (const t of pose.targets) {
      targetMap.set(t.jointId, {
        fe: targetMid(t.flexionExtension),
        aa: targetMid(t.abductionAdduction),
      });
    }

    const positions = new Map<string, { x: number; y: number }>();
    const rotations = new Map<string, number>();

    positions.set('root', { x: cx, y: groundY - 40 * scale });

    for (const seg of SKELETON) {
      if (seg.name === 'root') continue;
      const parentPos = positions.get(seg.parent!);
      if (!parentPos) continue;

      let angle = 0;
      const jm = JOINT_MAP[seg.name];
      if (jm) {
        const t = targetMap.get(jm.sagittal) ?? { fe: 0, aa: 0 };
        if (seg.name.startsWith('left') || seg.name.startsWith('right')) {
          const side = seg.name.startsWith('left') ? 1 : -1;
          if (seg.name.includes('Arm')) {
            angle = -Math.PI / 2 + (t.fe * Math.PI / 180) * (seg.name.startsWith('left') ? -1 : 1);
          } else if (seg.name.includes('Leg')) {
            angle = (seg.name.includes('Upper') ? 0 : t.fe * Math.PI / 180);
          } else if (seg.name.includes('Shoulder')) {
            angle = t.aa * Math.PI / 180 * side;
          } else if (seg.name.includes('Foot')) {
            angle = 0;
          }
        } else if (seg.name === 'spine') {
          angle = -Math.PI / 2 + t.fe * Math.PI / 180;
        } else if (seg.name === 'neck' || seg.name === 'head') {
          angle = rotations.get(seg.parent!) ?? -Math.PI / 2;
        }
      } else {
        const parentAngle = rotations.get(seg.parent!);
        if (parentAngle !== undefined) angle = parentAngle;
      }

      rotations.set(seg.name, angle);

      const len = seg.length * scale;
      const endX = parentPos.x + Math.cos(angle) * len;
      const endY = parentPos.y + Math.sin(angle) * len;
      positions.set(seg.name, { x: endX, y: endY });
    }

    this.drawSkeleton(ctx, positions, SKELETON, scale);

    ctx.fillStyle = '#8992a6';
    ctx.font = `500 ${Math.round(8 * scale)}px 'DM Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(pose.name, w / 2, 18);
  }

  private drawSkeleton(
    ctx: CanvasRenderingContext2D,
    positions: Map<string, { x: number; y: number }>,
    bones: BoneSegment[],
    scale: number,
  ): void {
    ctx.lineCap = 'round';

    const lines: Array<{ from: string; to: string }> = [
      { from: 'root', to: 'spine' },
      { from: 'spine', to: 'chest' },
      { from: 'chest', to: 'neck' },
      { from: 'neck', to: 'head' },
      { from: 'chest', to: 'leftShoulder' },
      { from: 'leftShoulder', to: 'leftUpperArm' },
      { from: 'leftUpperArm', to: 'leftLowerArm' },
      { from: 'leftLowerArm', to: 'leftFoot' },
      { from: 'chest', to: 'rightShoulder' },
      { from: 'rightShoulder', to: 'rightUpperArm' },
      { from: 'rightUpperArm', to: 'rightLowerArm' },
      { from: 'rightLowerArm', to: 'rightFoot' },
      { from: 'root', to: 'leftUpperLeg' },
      { from: 'leftUpperLeg', to: 'leftLowerLeg' },
      { from: 'leftLowerLeg', to: 'leftFoot' },
      { from: 'root', to: 'rightUpperLeg' },
      { from: 'rightUpperLeg', to: 'rightLowerLeg' },
      { from: 'rightLowerLeg', to: 'rightFoot' },
    ];

    for (const line of lines) {
      const from = positions.get(line.from);
      const to = positions.get(line.to);
      if (!from || !to) continue;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = 'rgba(122, 234, 213, 0.7)';
      ctx.lineWidth = Math.max(2, 3 * scale);
      ctx.stroke();
    }

    for (const [name, pos] of positions) {
      if (name === 'root') {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(108, 131, 255, 0.6)';
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(2, 2.5 * scale), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
    }
  }
}
