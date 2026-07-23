import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BoneT, BodyPart, TrackerDataT } from 'solarxr-protocol';

export interface WalkDebugFrame {
  plantedFoot: number | null;
  plantJustChanged: boolean;
  leftContact: boolean;
  rightContact: boolean;
  contactCandidate: number | null;
  contactCandidateFrames: number;
  plantFrameCount: number;
  leftFootX: number; leftFootY: number; leftFootZ: number;
  rightFootX: number; rightFootY: number; rightFootZ: number;
  anchorX: number; anchorY: number; anchorZ: number;
  corrX: number; corrY: number; corrZ: number;
  rootX: number; rootY: number; rootZ: number;
  leftAnchorX: number; leftAnchorY: number; leftAnchorZ: number;
  rightAnchorX: number; rightAnchorY: number; rightAnchorZ: number;
}

// One Euro Filter (Casiez et al.): an adaptive low-pass filter that smooths noise
// heavily when the signal is nearly static but relaxes toward zero lag as the signal
// starts moving quickly -- exactly the "filter noise without adding latency" behavior
// walk-mode locomotion needs, since the same signal is static while standing and fast
// while stepping.
class OneEuroFilterScalar {
  private xPrev: number | null = null;
  private dxPrev = 0;

  constructor(private minCutoff: number, private beta: number, private dCutoff: number) {}

  setMinCutoff(cutoff: number) {
    this.minCutoff = cutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(x: number) {
    this.xPrev = x;
    this.dxPrev = 0;
  }

  filter(x: number, dt: number): number {
    if (this.xPrev == null) {
      this.xPrev = x;
      return x;
    }
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = this.alpha(cutoff, dt);
    const xFiltered = a * x + (1 - a) * this.xPrev;
    this.xPrev = xFiltered;
    return xFiltered;
  }
}

class OneEuroFilterVector3 {
  private fx: OneEuroFilterScalar;
  private fy: OneEuroFilterScalar;
  private fz: OneEuroFilterScalar;
  private out = new THREE.Vector3();

  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.fx = new OneEuroFilterScalar(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilterScalar(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilterScalar(minCutoff, beta, dCutoff);
  }

  reset(v: THREE.Vector3) {
    this.fx.reset(v.x);
    this.fy.reset(v.y);
    this.fz.reset(v.z);
  }

  setMinCutoff(cutoff: number) {
    this.fx.setMinCutoff(cutoff);
    this.fy.setMinCutoff(cutoff);
    this.fz.setMinCutoff(cutoff);
  }

  filter(v: THREE.Vector3, dt: number): THREE.Vector3 {
    this.out.set(
      this.fx.filter(v.x, dt),
      this.fy.filter(v.y, dt),
      this.fz.filter(v.z, dt),
    );
    return this.out;
  }
}

const BONE_RADIUS = 0.02;
const JOINT_RADIUS = 0.03;
const FOOT_CONTACT_HEIGHT = 0.08;      // m above the floor plane that still counts as contact
const FOOT_CONTACT_SPEED = 0.5;        // m/s; a foot slower than this near the floor is "planted"
const CONTACT_DEBOUNCE_FRAMES = 3;     // frames a contact change must persist before it is trusted
const STATIONARY_ENTER_SPEED = 0.06;   // m/s hip speed below which the body is treated as still
const STATIONARY_EXIT_SPEED = 0.12;    // m/s hip speed above which the body starts translating
const MAX_ROOT_STEP = 0.4;             // m/frame safety clamp; only catches glitch frames
const PLANT_SMOOTH_V = 1.0;            // vertical plant correction applied in full (no squat lag)
const EURO_MIN_CUTOFF = 1.2;           // Hz; lower = smoother when still
const EURO_BETA = 0.7;                 // higher = less latency while moving
const EURO_D_CUTOFF = 1.0;             // Hz; derivative cutoff

const BONE_PARENT: Partial<Record<BodyPart, BodyPart>> = {
  [BodyPart.HEAD]: BodyPart.NECK,
  [BodyPart.NECK]: BodyPart.UPPER_CHEST,
  [BodyPart.UPPER_CHEST]: BodyPart.CHEST,
  [BodyPart.CHEST]: BodyPart.WAIST,
  [BodyPart.WAIST]: BodyPart.HIP,
  [BodyPart.HIP]: BodyPart.NONE,
  [BodyPart.LEFT_UPPER_LEG]: BodyPart.HIP,
  [BodyPart.LEFT_LOWER_LEG]: BodyPart.LEFT_UPPER_LEG,
  [BodyPart.LEFT_FOOT]: BodyPart.LEFT_LOWER_LEG,
  [BodyPart.RIGHT_UPPER_LEG]: BodyPart.HIP,
  [BodyPart.RIGHT_LOWER_LEG]: BodyPart.RIGHT_UPPER_LEG,
  [BodyPart.RIGHT_FOOT]: BodyPart.RIGHT_LOWER_LEG,
  [BodyPart.LEFT_UPPER_ARM]: BodyPart.UPPER_CHEST,
  [BodyPart.LEFT_LOWER_ARM]: BodyPart.LEFT_UPPER_ARM,
  [BodyPart.LEFT_HAND]: BodyPart.LEFT_LOWER_ARM,
  [BodyPart.RIGHT_UPPER_ARM]: BodyPart.UPPER_CHEST,
  [BodyPart.RIGHT_LOWER_ARM]: BodyPart.RIGHT_UPPER_ARM,
  [BodyPart.RIGHT_HAND]: BodyPart.RIGHT_LOWER_ARM,
  [BodyPart.LEFT_SHOULDER]: BodyPart.UPPER_CHEST,
  [BodyPart.RIGHT_SHOULDER]: BodyPart.UPPER_CHEST,
};

const BONE_COLORS: Partial<Record<BodyPart, number>> = {
  [BodyPart.HEAD]: 0xff8888,
  [BodyPart.NECK]: 0xff8888,
  [BodyPart.UPPER_CHEST]: 0x88ff88,
  [BodyPart.CHEST]: 0x88ff88,
  [BodyPart.WAIST]: 0x88ff88,
  [BodyPart.HIP]: 0x88ff88,
  [BodyPart.LEFT_UPPER_LEG]: 0x8888ff,
  [BodyPart.LEFT_LOWER_LEG]: 0x8888ff,
  [BodyPart.LEFT_FOOT]: 0x4444cc,
  [BodyPart.RIGHT_UPPER_LEG]: 0xff88ff,
  [BodyPart.RIGHT_LOWER_LEG]: 0xff88ff,
  [BodyPart.RIGHT_FOOT]: 0xcc44cc,
  [BodyPart.LEFT_UPPER_ARM]: 0x88ffff,
  [BodyPart.LEFT_LOWER_ARM]: 0x88ffff,
  [BodyPart.LEFT_HAND]: 0x44cccc,
  [BodyPart.RIGHT_UPPER_ARM]: 0xffff88,
  [BodyPart.RIGHT_LOWER_ARM]: 0xffff88,
  [BodyPart.RIGHT_HAND]: 0xcccc44,
};

// This mapping is for the Mixamo X Bot
/* const SLIMEVR_TO_MIXAMO: Partial<Record<BodyPart, string>> = {
  [BodyPart.HIP]: 'mixamorigHips',
  [BodyPart.WAIST]: 'mixamorigSpine',
  [BodyPart.CHEST]: 'mixamorigSpine1',
  [BodyPart.UPPER_CHEST]: 'mixamorigSpine2',
  [BodyPart.NECK]: 'mixamorigNeck',
  [BodyPart.HEAD]: 'mixamorigHead',
  [BodyPart.LEFT_UPPER_LEG]: 'mixamorigLeftUpLeg',
  [BodyPart.LEFT_LOWER_LEG]: 'mixamorigLeftLeg',
  [BodyPart.LEFT_FOOT]: 'mixamorigLeftFoot',
  [BodyPart.RIGHT_UPPER_LEG]: 'mixamorigRightUpLeg',
  [BodyPart.RIGHT_LOWER_LEG]: 'mixamorigRightLeg',
  [BodyPart.RIGHT_FOOT]: 'mixamorigRightFoot',
  [BodyPart.LEFT_UPPER_ARM]: 'mixamorigLeftArm',
  [BodyPart.LEFT_LOWER_ARM]: 'mixamorigLeftForeArm',
  [BodyPart.LEFT_HAND]: 'mixamorigLeftHand',
  [BodyPart.RIGHT_UPPER_ARM]: 'mixamorigRightArm',
  [BodyPart.RIGHT_LOWER_ARM]: 'mixamorigRightForeArm',
  [BodyPart.RIGHT_HAND]: 'mixamorigRightHand',
  [BodyPart.LEFT_SHOULDER]: 'mixamorigLeftShoulder',
  [BodyPart.RIGHT_SHOULDER]: 'mixamorigRightShoulder',
}; */

const SLIMEVR_TO_MIXAMO: Partial<Record<BodyPart, string>> = {
  [BodyPart.HIP]: 'mixamorigHips_01',
  [BodyPart.WAIST]: 'mixamorigSpine_02',
  [BodyPart.CHEST]: 'mixamorigSpine1_03',
  [BodyPart.UPPER_CHEST]: 'mixamorigSpine2_04',
  [BodyPart.NECK]: 'mixamorigNeck_05',
  [BodyPart.HEAD]: 'mixamorigHead_06',
  [BodyPart.LEFT_UPPER_LEG]: 'mixamorigLeftUpLeg_056',
  [BodyPart.LEFT_LOWER_LEG]: 'mixamorigLeftLeg_057',
  [BodyPart.LEFT_FOOT]: 'mixamorigLeftFoot_058',
  [BodyPart.RIGHT_UPPER_LEG]: 'mixamorigRightUpLeg_061',
  [BodyPart.RIGHT_LOWER_LEG]: 'mixamorigRightLeg_00',
  [BodyPart.RIGHT_FOOT]: 'mixamorigRightFoot_062',
  [BodyPart.LEFT_UPPER_ARM]: 'mixamorigLeftArm_09',
  [BodyPart.LEFT_LOWER_ARM]: 'mixamorigLeftForeArm_010',
  [BodyPart.LEFT_HAND]: 'mixamorigLeftHand_011',
  [BodyPart.RIGHT_UPPER_ARM]: 'mixamorigRightArm_033',
  [BodyPart.RIGHT_LOWER_ARM]: 'mixamorigRightForeArm_034',
  [BodyPart.RIGHT_HAND]: 'mixamorigRightHand_035',
  [BodyPart.LEFT_SHOULDER]: 'mixamorigLeftShoulder_08',
  [BodyPart.RIGHT_SHOULDER]: 'mixamorigRightShoulder_032',
};

export class MocapScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animFrameId = 0;
  private postRenderCallback: (() => void) | null = null;
  private pelvisPositionCallback: ((pos: THREE.Vector3, timestamp: number) => void) | null = null;
  private _walkDebugSnapshot: WalkDebugFrame | null = null;
  private walkDebugCallback: ((data: WalkDebugFrame, timestamp: number) => void) | null = null;

  private nodes = new Map<BodyPart, { mesh: THREE.Mesh; joint: THREE.Mesh }>();
  private boneLines = new Map<string, THREE.Mesh>();

  private mixamoBones = new Map<BodyPart, THREE.Bone>();
  private mixamoScene: THREE.Group | null = null;
  private mixamoLoaded = false;
  private mixamoLoading = false;
  private onModelStatus: ((status: string) => void) | null = null;

  // World rotation of each bone in the GLB's rest pose. Server rotations are
  // applied as deltas on top of these, so identity server rotations keep the
  // model in its natural default pose.
  private bindPoseWorld = new Map<BodyPart, THREE.Quaternion>();
  private bindPoseLocal = new Map<BodyPart, THREE.Quaternion>();
  private bindHipLocalPosition = new THREE.Vector3();
  private parentWorldInv = new THREE.Quaternion();
  private worldQuat = new THREE.Quaternion();
  private desiredWorld = new THREE.Quaternion();

  private cameraTheta = 0;
  private cameraPhi = 1.2;
  private cameraRadius = 3.5;

  private poseCalibrated = false;
  private calibratedHip = new THREE.Vector3();
  private floorY = 0;
  // Foot-lock locomotion state (walk mode). Everything is in server/world space; the
  // model is translated by (hipWorldTarget - calibratedHip) so the calibration pose
  // maps to the origin. The relative geometry (foot - hip) used below is invariant to
  // any global drift the server might apply, which is why it is robust.
  private hipWorldTarget = new THREE.Vector3(); // desired hip world position this frame
  private leftAnchor: THREE.Vector3 | null = null;   // locked world position of left foot
  private rightAnchor: THREE.Vector3 | null = null;  // locked world position of right foot
  private appliedRoot = new THREE.Vector3();     // last root translation actually applied
  // A contact-state change must persist this many frames before we trust it and
  // re-anchor -- this is what tells intentional weight transfer apart from one noisy
  // frame, so standing still can't slowly random-walk the root away from center.
  // Debounce only applies to the 0→1 transition (no foot anchored → first foot
  // anchored). Once at least one foot is anchored, the second foot can join with no
  // debounce (double-support) and either foot can lift off immediately.
  private contactCandidate: BodyPart.LEFT_FOOT | BodyPart.RIGHT_FOOT | null = null;
  private contactCandidateFrames = 0;
  // Horizontal-only stationary lock: while hip speed stays below the enter threshold the
  // root's x/z are pinned to wherever they were when we went stationary, so sensor noise
  // cannot accumulate into drift. Vertical (squat/sit) is never gated by this.
  private stationary = false;
  private stationaryLockX = 0;
  private stationaryLockZ = 0;
  private walkActive = false;
  private leftPlantJustChanged = false;
  private rightPlantJustChanged = false;
  private plantFrameCount = 0;
  private leftContact = false;
  private rightContact = false;
  private currentFilterCutoff = EURO_MIN_CUTOFF;
  private floorYModel = 0;
  private floorCaptured = false;
  private _lFootWorld = new THREE.Vector3();
  private _rFootWorld = new THREE.Vector3();
  private _lTemp = new THREE.Vector3();
  private _rTemp = new THREE.Vector3();
  private _plantCorr = new THREE.Vector3();
  private hipFilter = new OneEuroFilterVector3(EURO_MIN_CUTOFF, EURO_BETA, EURO_D_CUTOFF);
  private leftFootFilter = new OneEuroFilterVector3(EURO_MIN_CUTOFF, EURO_BETA, EURO_D_CUTOFF);
  private rightFootFilter = new OneEuroFilterVector3(EURO_MIN_CUTOFF, EURO_BETA, EURO_D_CUTOFF);
  private previousLeftFoot: THREE.Vector3 | null = null;
  private previousRightFoot: THREE.Vector3 | null = null;
  private previousHip: THREE.Vector3 | null = null;
  private lastPoseTime = performance.now();

  constructor(canvas: HTMLCanvasElement, onModelStatus?: (status: string) => void) {
    this.onModelStatus = onModelStatus ?? null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.parentElement!.clientWidth, canvas.parentElement!.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbbbbbb);

    this.camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.1, 50);
    this.camera.position.set(2, 0.3, 3);

    this.setupLights();
    this.setupGround();
    this.setupOrbitControls();
    window.addEventListener('resize', () => this.resize());

    this.loadCharacter();
  }

  private setupLights() {
    // 1. Ambient Light: Base level of light everywhere
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    // 2. Key Light: Your main, bright front light (Creates the primary shadows)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 10, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    // 3. Fill Light: Softens the shadows on the front/side
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.4);
    fillLight.position.set(-5, 3, 5); 
    this.scene.add(fillLight);

    // 4. NEW - Back Light: Illuminates the back of the model
    const backLight = new THREE.DirectionalLight(0xffffff, 0.9); // Adjust intensity here (0.5 to 1.0 is usually good)
    backLight.position.set(0, 6, -10); // Placed behind (negative Z) and slightly elevated
    this.scene.add(backLight);
  }

  private setupGround() {
      const grid = new THREE.GridHelper(10, 20, 0x000000, 0x888888);
      this.scene.add(grid);
  }

  private setupOrbitControls() {
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      this.cameraTheta -= (e.clientX - prevX) * 0.01;
      this.cameraPhi = Math.max(0.05, Math.min(Math.PI - 0.05, this.cameraPhi + (e.clientY - prevY) * 0.01));
      prevX = e.clientX;
      prevY = e.clientY;
      this.updateCam();
    });
    window.addEventListener('pointerup', () => {
      isDragging = false;
    });
    this.renderer.domElement.addEventListener(
      'wheel',
      (e) => {
        this.cameraRadius = Math.max(1.2, Math.min(10, this.cameraRadius + e.deltaY * 0.005));
        this.updateCam();
      },
      { passive: true },
    );
    this.updateCam();
  }

  private updateCam() {
    const targetHeight = 0.9;
    this.camera.position.x = this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
    this.camera.position.y = this.cameraRadius * Math.cos(this.cameraPhi) + targetHeight;
    this.camera.position.z = this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
    this.camera.lookAt(0, targetHeight, 0);
  }

  resize() {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCameraFraming(theta: number, phi: number, radius: number) {
    this.cameraTheta = theta;
    this.cameraPhi = Math.max(0.05, Math.min(Math.PI - 0.05, phi));
    this.cameraRadius = Math.max(1.2, Math.min(10, radius));
    this.updateCam();
  }

  private async loadCharacter() {
    if (this.mixamoLoading) return;
    this.mixamoLoading = true;
    this.onModelStatus?.('Loading model...');

    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync('/human.glb');

      const model = gltf.scene;
      model.scale.set(1, 1, 1);
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const skinnedMesh = model.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh | null;
      if (!skinnedMesh || !skinnedMesh.skeleton) {
        this.onModelStatus?.('Model has no skeleton');
        return;
      }

      const bones = skinnedMesh.skeleton.bones;
      console.log('Model bones:', bones.map(b => b.name));
      for (const [bodyPart, boneName] of Object.entries(SLIMEVR_TO_MIXAMO)) {
        const bone = bones.find((b) => b.name === boneName);
        if (bone) {
          this.mixamoBones.set(Number(bodyPart) as BodyPart, bone);
          this.bindPoseLocal.set(Number(bodyPart) as BodyPart, bone.quaternion.clone()); // NEW
        }
      }

      this.scene.add(model);
      this.mixamoScene = model;

      const rootBone = this.mixamoBones.get(BodyPart.HIP);
      if (rootBone) {
        this.bindHipLocalPosition.copy(rootBone.position);
      }

      // Compute bind-pose world rotations
      this.mixamoScene.updateMatrixWorld(true);
      for (const [bp, bone] of this.mixamoBones) {
        this.bindPoseWorld.set(bp, bone.getWorldQuaternion(new THREE.Quaternion()));
      }

      this.mixamoLoaded = true;
      this.onModelStatus?.('Model loaded');
    } catch (err) {
      this.onModelStatus?.(`Model error: ${(err as Error).message}`);
      this.mixamoLoading = false;
    }
  }

  /**
   * Recenters walk-mode locomotion. Call this whenever the server's reference frame is
   * reset (Reset Full/Yaw/Mounting) -- those change the frame the raw tracker positions
   * are expressed in, so the client's calibration/anchor state must resync or the root
   * will drift or fail to recenter.
   */
  resetLocomotion() {
    this.poseCalibrated = false;
    this.walkActive = false;
    this.floorCaptured = false;
    this.leftPlantJustChanged = false;
    this.rightPlantJustChanged = false;
  }

  update(bones: BoneT[], syntheticTrackers: TrackerDataT[] = [], walkEnabled = false) {
    if (this.mixamoLoaded) {
      this.applyMixamoPose(bones, syntheticTrackers, walkEnabled);
      this.hideStickFigure();
    } else {
      this.updateStickFigure(bones);
    }

    if (this.mixamoLoaded && this.pelvisPositionCallback) {
      const hipBone = this.mixamoBones.get(BodyPart.HIP);
      if (hipBone) {
        const pos = hipBone.getWorldPosition(new THREE.Vector3());
        this.pelvisPositionCallback(pos, performance.now());
      }
    }

    if (this.walkDebugCallback && this._walkDebugSnapshot) {
      this.walkDebugCallback(this._walkDebugSnapshot, performance.now());
      this._walkDebugSnapshot = null;
    }
  }

  /**
   * Applies a static pose directly to Mixamo bones using local-space quaternions.
   * Bones not present in the map keep their bind-pose rotation.
   * The model is centered at the origin with no walk locomotion.
   */
  setStaticPose(localQuats: Map<BodyPart, THREE.Quaternion>) {
    if (!this.mixamoLoaded || !this.mixamoScene) return;
    this.mixamoScene.updateMatrixWorld(true);
    const order: BodyPart[] = [
      BodyPart.HIP, BodyPart.WAIST, BodyPart.CHEST, BodyPart.UPPER_CHEST,
      BodyPart.NECK, BodyPart.HEAD,
      BodyPart.LEFT_SHOULDER, BodyPart.LEFT_UPPER_ARM, BodyPart.LEFT_LOWER_ARM, BodyPart.LEFT_HAND,
      BodyPart.RIGHT_SHOULDER, BodyPart.RIGHT_UPPER_ARM, BodyPart.RIGHT_LOWER_ARM, BodyPart.RIGHT_HAND,
      BodyPart.LEFT_UPPER_LEG, BodyPart.LEFT_LOWER_LEG, BodyPart.LEFT_FOOT,
      BodyPart.RIGHT_UPPER_LEG, BodyPart.RIGHT_LOWER_LEG, BodyPart.RIGHT_FOOT,
    ];
    for (const bp of order) {
      const bone = this.mixamoBones.get(bp);
      if (!bone) continue;
      const q = localQuats.get(bp);
      if (q) {
        bone.quaternion.copy(q);
      } else {
        const rest = this.bindPoseLocal.get(bp);
        if (rest) bone.quaternion.copy(rest);
        else bone.quaternion.identity();
      }
      bone.updateMatrixWorld(true);
    }
    this.mixamoScene.updateMatrixWorld(true);
    this.mixamoScene.position.set(0, 0, 0);
    this.hideStickFigure();
  }

  private applyMixamoPose(bones: BoneT[], syntheticTrackers: TrackerDataT[], walkEnabled: boolean) {
      const rootBone = this.mixamoBones.get(BodyPart.HIP);
      if (!rootBone) return;

      const dataByPart = new Map<BodyPart, BoneT>();
      for (const b of bones) dataByPart.set(b.bodyPart, b);
      const trackerByPart = this.getSyntheticTrackerPositions(syntheticTrackers);

      this.updateRootAndPelvis(dataByPart, trackerByPart, walkEnabled, rootBone);

      const order: BodyPart[] = [
        BodyPart.HIP,
        BodyPart.WAIST,
        BodyPart.CHEST,
        BodyPart.UPPER_CHEST,
        BodyPart.NECK,
        BodyPart.HEAD,
        BodyPart.LEFT_UPPER_ARM,
        BodyPart.LEFT_LOWER_ARM,
        BodyPart.LEFT_HAND,
        BodyPart.RIGHT_UPPER_ARM,
        BodyPart.RIGHT_LOWER_ARM,
        BodyPart.RIGHT_HAND,
        BodyPart.LEFT_UPPER_LEG,
        BodyPart.LEFT_LOWER_LEG,
        BodyPart.LEFT_FOOT,
        BodyPart.RIGHT_UPPER_LEG,
        BodyPart.RIGHT_LOWER_LEG,
        BodyPart.RIGHT_FOOT,
      ];

      const usesBindOffset = new Set<BodyPart>([
        BodyPart.LEFT_UPPER_LEG, BodyPart.LEFT_LOWER_LEG, BodyPart.LEFT_FOOT,
        BodyPart.RIGHT_UPPER_LEG, BodyPart.RIGHT_LOWER_LEG, BodyPart.RIGHT_FOOT,
      ]);

      for (const bp of order) {
        const mixamoBone = this.mixamoBones.get(bp);
        if (!mixamoBone) continue;

        const data = dataByPart.get(bp);
        if (!data || !data.rotationG) {
          const restLocal = this.bindPoseLocal.get(bp);
          if (restLocal) mixamoBone.quaternion.copy(restLocal);
          else mixamoBone.quaternion.identity();
          mixamoBone.updateMatrixWorld(true);
          continue;
        }

        this.worldQuat.set(data.rotationG.x, data.rotationG.y, data.rotationG.z, data.rotationG.w);
        const bindWorld = this.bindPoseWorld.get(bp);

        if (usesBindOffset.has(bp) && bindWorld) {
          this.desiredWorld.copy(bindWorld).multiply(this.worldQuat);
        } else {
          this.desiredWorld.copy(this.worldQuat);
        }

        if (!mixamoBone.parent || !(mixamoBone.parent instanceof THREE.Bone)) {
          mixamoBone.quaternion.copy(this.desiredWorld);
        } else {
          mixamoBone.parent.updateMatrixWorld(true);
          mixamoBone.parent.getWorldQuaternion(this.parentWorldInv);
          this.parentWorldInv.invert();
          this.parentWorldInv.multiply(this.desiredWorld);
          mixamoBone.quaternion.copy(this.parentWorldInv);
        }

        mixamoBone.updateMatrixWorld(true);
      }

if (this.mixamoScene) {
        this.mixamoScene.updateMatrixWorld(true);
      }

      this.applyFootPlant(walkEnabled);
  }

private updateRootAndPelvis(
    dataByPart: Map<BodyPart, BoneT>,
    trackerByPart: Map<BodyPart, THREE.Vector3>,
    walkEnabled: boolean,
    rootBone: THREE.Bone,
  ) {
    const hip = trackerByPart.get(BodyPart.HIP) ?? this.getBonePosition(dataByPart, BodyPart.HIP);
    const leftFoot = trackerByPart.get(BodyPart.LEFT_FOOT) ?? this.getBonePosition(dataByPart, BodyPart.LEFT_FOOT);
    const rightFoot = trackerByPart.get(BodyPart.RIGHT_FOOT) ?? this.getBonePosition(dataByPart, BodyPart.RIGHT_FOOT);
    if (!hip || !leftFoot || !rightFoot || !this.mixamoScene) return;

    const now = performance.now();
    const dt = Math.max((now - this.lastPoseTime) / 1000, 1 / 120);
    this.lastPoseTime = now;

    if (!this.poseCalibrated) {
      this.calibratedHip.copy(hip);
      this.floorY = Math.min(leftFoot.y, rightFoot.y);
      this.resetLocomotionState(hip, leftFoot, rightFoot);
      this.mixamoScene.position.set(0, 0, 0);
      this.poseCalibrated = true;
    }

    // The hip bone always sits at its bind-pose local position. In walk mode ALL
    // translation (including vertical squat/sit) is carried by the model translation,
    // which applyFootPlant() derives from the posed skeleton after the bone loop.
    rootBone.position.copy(this.bindHipLocalPosition);

    if (!walkEnabled) {
      // Known-good path: vertical follows the server hip, no horizontal translation.
      rootBone.position.y += hip.y - this.calibratedHip.y;
      this.resetLocomotionState(hip, leftFoot, rightFoot);
      this.walkActive = false;
      this.mixamoScene.position.set(0, 0, 0);
      return;
    }

    // Walk off -> on: reset contact state but KEEP the current translation (no jump).
    if (!this.walkActive) {
      this.resetLocomotionState(hip, leftFoot, rightFoot);
      this.walkActive = true;
    }

    // Filter foot noise before contact detection (vertical kept raw for responsiveness).
    const fLeftFoot = this.leftFootFilter.filter(leftFoot, dt);
    const fRightFoot = this.rightFootFilter.filter(rightFoot, dt);
    fLeftFoot.y = leftFoot.y;
    fRightFoot.y = rightFoot.y;

    // Decide which foot is planted (+ debounced weight transfer). The actual root
    // translation happens later, in applyFootPlant(), using the POSED foot.
    this.updateFootContact(fLeftFoot, fRightFoot, dt);

    // Adapt filter strength based on contact: planted = more smoothing, swinging = less latency
    this.updateFilterCutoffs();
  }

  // Resets all locomotion state to "parked at the current pose, zero translation" --
  // used on first calibration, on walk-mode enable, on walk-mode disable, and from
  // resetLocomotion() (server Reset Full/Yaw/Mounting), so every one of those events
  // starts clean instead of carrying over stale anchors from a different reference frame.
  private resetLocomotionState(hip: THREE.Vector3, leftFoot: THREE.Vector3, rightFoot: THREE.Vector3) {
    this.hipWorldTarget.copy(hip);
    this.appliedRoot.set(0, 0, 0);
    this.hipFilter.reset(hip);
    this.leftFootFilter.reset(leftFoot);
    this.rightFootFilter.reset(rightFoot);
    this.leftAnchor = null;
    this.rightAnchor = null;
    this.contactCandidate = null;
    this.contactCandidateFrames = 0;
    this.stationary = false;
    this.stationaryLockX = 0;
    this.stationaryLockZ = 0;
    this.leftPlantJustChanged = false;
    this.rightPlantJustChanged = false;
    this.plantFrameCount = 0;
    this.floorCaptured = false;
    this.previousLeftFoot = leftFoot.clone();
    this.previousRightFoot = rightFoot.clone();
    this.previousHip = hip.clone();
  }

  /**
   * Foot-lock root solver. Anchors the planted foot to a fixed world point (with a
   * shared ground plane at `floorY`) and derives the hip position that keeps that foot
   * planted given the current leg pose: `hipWorld = anchor - (foot - hip)`.
   *
   * This produces both effects from one rule:
   *  - Squat/sit: as the knee bends the foot rises relative to the hip, so the hip is
   *    pushed down to keep the foot on the floor (instead of the foot floating up).
   *  - Walking: as the body passes over the stance foot, the hip advances by the full
   *    real stride in the leg's own direction.
   *
   * Two extra safeguards keep this stable at rest without adding lag while moving:
   *  - Contact-state changes are debounced (CONTACT_DEBOUNCE_FRAMES) so a single noisy
   *    frame cannot trigger a reanchor -- only a persistent change can. This is what
   *    stops the root from randomly walking away from center while standing still.
   *  - A horizontal-only "stationary lock" pins x/z to a fixed point whenever filtered
   *    hip speed is near zero (hysteresis via enter/exit thresholds), so translation can
   *    only happen in response to genuine, sustained movement. Vertical is never gated
   *    by this, so squats/sitting still work while otherwise stationary.
   */

  // Decides which feet are planted and handles debounced weight transfer. It computes NO
  // root translation -- that happens in applyFootPlant() from the posed skeleton. Sets
  // leftPlantJustChanged / rightPlantJustChanged whenever the respective foot is newly
  // (re)assigned so planting re-anchors without a jump.
  //
  // Two modes:
  //   A) No foot anchored (both null) — use debounced best-foot selection to establish
  //      the first anchor. Prevents a single noisy "contact" frame from locking an anchor.
  //   B) At least one foot anchored — each foot is managed independently with no
  //      debounce: contact → anchor immediately (double-support entry), no-contact →
  //      clear anchor immediately (lift-off). If both lift off we fall back to mode A.
  private updateFootContact(leftFoot: THREE.Vector3, rightFoot: THREE.Vector3, dt: number) {
    const leftSpeed = this.previousLeftFoot ? this.horizontalDistance(leftFoot, this.previousLeftFoot) / dt : 0;
    const rightSpeed = this.previousRightFoot ? this.horizontalDistance(rightFoot, this.previousRightFoot) / dt : 0;

    const leftContact = leftFoot.y - this.floorY <= FOOT_CONTACT_HEIGHT;
    const rightContact = rightFoot.y - this.floorY <= FOOT_CONTACT_HEIGHT;

    const leftPlanted = this.leftAnchor != null;
    const rightPlanted = this.rightAnchor != null;
    const anyPlanted = leftPlanted || rightPlanted;

    if (!anyPlanted) {
      // Mode A — no foot anchored. Debounce the establishment of the first anchor
      // so a single noisy contact frame cannot lock a spurious anchor.
      let best: BodyPart.LEFT_FOOT | BodyPart.RIGHT_FOOT | null = null;
      if (leftContact && rightContact) {
        if (Math.abs(leftFoot.y - rightFoot.y) > 0.02) {
          best = leftFoot.y < rightFoot.y ? BodyPart.LEFT_FOOT : BodyPart.RIGHT_FOOT;
        } else {
          best = leftSpeed <= rightSpeed ? BodyPart.LEFT_FOOT : BodyPart.RIGHT_FOOT;
        }
      } else if (leftContact) {
        best = BodyPart.LEFT_FOOT;
      } else if (rightContact) {
        best = BodyPart.RIGHT_FOOT;
      }

      if (best != null) {
        if (this.contactCandidate === best) {
          this.contactCandidateFrames++;
        } else {
          this.contactCandidate = best;
          this.contactCandidateFrames = 1;
        }
        if (this.contactCandidateFrames >= CONTACT_DEBOUNCE_FRAMES) {
          if (best === BodyPart.LEFT_FOOT) {
            this.leftAnchor = this._lTemp.set(leftFoot.x, this.floorYModel, leftFoot.z).clone();
            this.leftPlantJustChanged = true;
          } else {
            this.rightAnchor = this._rTemp.set(rightFoot.x, this.floorYModel, rightFoot.z).clone();
            this.rightPlantJustChanged = true;
          }
          this.contactCandidate = null;
          this.contactCandidateFrames = 0;
        }
      } else {
        this.contactCandidate = null;
        this.contactCandidateFrames = 0;
      }
    } else {
      // Mode B — at least one foot is anchored. Each foot manages its own anchor
      // immediately, with no debounce. The second foot can join in a single frame
      // (double-support entry) and either foot lifts off in a single frame (swing).
      // If both lift off we naturally fall back to Mode A next frame.
      this.contactCandidate = null;
      this.contactCandidateFrames = 0;

      if (leftContact && !leftPlanted) {
        this.leftAnchor = this._lTemp.set(leftFoot.x, this.floorYModel, leftFoot.z).clone();
        this.leftPlantJustChanged = true;
      } else if (!leftContact && leftPlanted) {
        this.leftAnchor = null;
      }

      if (rightContact && !rightPlanted) {
        this.rightAnchor = this._rTemp.set(rightFoot.x, this.floorYModel, rightFoot.z).clone();
        this.rightPlantJustChanged = true;
      } else if (!rightContact && rightPlanted) {
        this.rightAnchor = null;
      }
    }

    this.previousLeftFoot!.copy(leftFoot);
    this.previousRightFoot!.copy(rightFoot);
    this.leftContact = leftContact;
    this.rightContact = rightContact;
  }

  private updateFilterCutoffs() {
    const planted = this.leftContact || this.rightContact;
    const cutoff = planted ? 0.8 : 2.5;
    if (this.currentFilterCutoff !== cutoff) {
      this.currentFilterCutoff = cutoff;
      this.hipFilter.setMinCutoff(cutoff);
      this.leftFootFilter.setMinCutoff(cutoff);
      this.rightFootFilter.setMinCutoff(cutoff);
    }
  }

  // Runs AFTER the whole skeleton has been posed from the rotation stream. Translates
  // the model so the planted foot bone sits on its fixed world anchor (x,z) and on the
  // model's own floor level (y). Reading the foot from the posed skeleton is the whole
  // trick: the root now moves in lockstep with the leg rotations, so there is no
  // vertical lag (issue 1) and the planted foot never slides (issue 2) -- the hips move
  // over a fixed foot, exactly like a real sit/stand.
  private applyFootPlant(walkEnabled: boolean) {
    if (!this.mixamoScene || !walkEnabled) return;

    const leftBone = this.mixamoBones.get(BodyPart.LEFT_FOOT);
    const rightBone = this.mixamoBones.get(BodyPart.RIGHT_FOOT);
    if (!leftBone || !rightBone) return;

    const lw = leftBone.getWorldPosition(this._lFootWorld);
    const rw = rightBone.getWorldPosition(this._rFootWorld);

    // Capture the model's floor level once, from the lower foot at the first plant.
    if (!this.floorCaptured) {
      this.floorYModel = Math.min(lw.y, rw.y);
      this.floorCaptured = true;
    }

    // VERTICAL (issue 1): pin the LOWEST posed foot to the floor every frame, regardless
    // of the contact/plant boolean. The body then follows the legs down with zero lag,
    // even on a fast sit where the debounced contact momentarily drops out (which used
    // to leave the feet floating until it snapped down).
    let corrY = this.floorYModel - Math.min(lw.y, rw.y);

    // HORIZONTAL: foot-lock each planted foot to its own fixed anchor. When only one
    // foot is planted, correct against that one. When both are planted (double support),
    // blend the correction from both anchors so neither foot slides during weight transfer.
    // With no anchored foot (airborne) we hold x/z (correction 0) so nothing slides.
    let corrX = 0;
    let corrZ = 0;
    let effectiveAnchorX = 0;
    let effectiveAnchorY = this.floorYModel;
    let effectiveAnchorZ = 0;
    const leftPlanted = this.leftAnchor != null;
    const rightPlanted = this.rightAnchor != null;
    const leftChanged = this.leftPlantJustChanged;
    const rightChanged = this.rightPlantJustChanged;

    if (leftPlanted && rightPlanted) {
      // Double support — blend correction from both anchors so neither foot slides
      if (leftChanged) {
        this.leftAnchor!.set(lw.x, this.floorYModel, lw.z);
        this.leftPlantJustChanged = false;
      }
      if (rightChanged) {
        this.rightAnchor!.set(rw.x, this.floorYModel, rw.z);
        this.rightPlantJustChanged = false;
      }
      const lCorrX = this.leftAnchor!.x - lw.x;
      const lCorrZ = this.leftAnchor!.z - lw.z;
      const rCorrX = this.rightAnchor!.x - rw.x;
      const rCorrZ = this.rightAnchor!.z - rw.z;
      corrX = (lCorrX + rCorrX) / 2;
      corrZ = (lCorrZ + rCorrZ) / 2;
      effectiveAnchorX = (this.leftAnchor!.x + this.rightAnchor!.x) / 2;
      effectiveAnchorZ = (this.leftAnchor!.z + this.rightAnchor!.z) / 2;
      this.plantFrameCount++;
    } else if (leftPlanted) {
      // Sole stance — left foot only
      if (leftChanged) {
        this.leftAnchor!.set(lw.x, this.floorYModel, lw.z);
        this.leftPlantJustChanged = false;
      }
      corrX = this.leftAnchor!.x - lw.x;
      corrZ = this.leftAnchor!.z - lw.z;
      effectiveAnchorX = this.leftAnchor!.x;
      effectiveAnchorZ = this.leftAnchor!.z;
      this.plantFrameCount++;
    } else if (rightPlanted) {
      // Sole stance — right foot only
      if (rightChanged) {
        this.rightAnchor!.set(rw.x, this.floorYModel, rw.z);
        this.rightPlantJustChanged = false;
      }
      corrX = this.rightAnchor!.x - rw.x;
      corrZ = this.rightAnchor!.z - rw.z;
      effectiveAnchorX = this.rightAnchor!.x;
      effectiveAnchorZ = this.rightAnchor!.z;
      this.plantFrameCount++;
    }
    // else: both airborne — corrX/corrZ stay 0, plantFrameCount frozen, no anchor

    const hClamp = Math.hypot(corrX, corrZ);
    if (hClamp > MAX_ROOT_STEP) {
      const s = MAX_ROOT_STEP / hClamp;
      corrX *= s;
      corrZ *= s;
    }
    corrY = Math.max(-MAX_ROOT_STEP, Math.min(MAX_ROOT_STEP, corrY));

    this._plantCorr.set(corrX, corrY, corrZ);

    const p = this.mixamoScene.position;
    p.x += this._plantCorr.x;
    p.z += this._plantCorr.z;
    p.y += this._plantCorr.y;
    this.mixamoScene.updateMatrixWorld(true);

    // Derive single-foot compat fields for debug: plantedFoot is the foot that has been
    // planted, preferring the one anchoring sole stance, or null when airborne.
    const compatPlantedFoot: BodyPart.LEFT_FOOT | BodyPart.RIGHT_FOOT | null =
      (leftPlanted && !rightPlanted) ? BodyPart.LEFT_FOOT
      : (!leftPlanted && rightPlanted) ? BodyPart.RIGHT_FOOT
      : (leftPlanted && rightPlanted) ? (leftChanged ? BodyPart.LEFT_FOOT : rightChanged ? BodyPart.RIGHT_FOOT : BodyPart.LEFT_FOOT)
      : null;
    const compatPlantJustChanged = leftChanged || rightChanged;

    this._walkDebugSnapshot = {
      plantedFoot: compatPlantedFoot,
      plantJustChanged: compatPlantJustChanged,
      leftContact: this.leftContact,
      rightContact: this.rightContact,
      contactCandidate: this.contactCandidate ?? null,
      contactCandidateFrames: this.contactCandidateFrames,
      plantFrameCount: this.plantFrameCount,
      leftFootX: lw.x, leftFootY: lw.y, leftFootZ: lw.z,
      rightFootX: rw.x, rightFootY: rw.y, rightFootZ: rw.z,
      anchorX: effectiveAnchorX, anchorY: effectiveAnchorY, anchorZ: effectiveAnchorZ,
      corrX: this._plantCorr.x, corrY: this._plantCorr.y, corrZ: this._plantCorr.z,
      rootX: this.mixamoScene.position.x,
      rootY: this.mixamoScene.position.y,
      rootZ: this.mixamoScene.position.z,
      leftAnchorX: this.leftAnchor ? this.leftAnchor.x : 0,
      leftAnchorY: this.leftAnchor ? this.leftAnchor.y : 0,
      leftAnchorZ: this.leftAnchor ? this.leftAnchor.z : 0,
      rightAnchorX: this.rightAnchor ? this.rightAnchor.x : 0,
      rightAnchorY: this.rightAnchor ? this.rightAnchor.y : 0,
      rightAnchorZ: this.rightAnchor ? this.rightAnchor.z : 0,
    };
  }

  private getBonePosition(dataByPart: Map<BodyPart, BoneT>, bodyPart: BodyPart): THREE.Vector3 | null {
    const p = dataByPart.get(bodyPart)?.headPositionG;
    return p ? new THREE.Vector3(p.x, p.y, p.z) : null;
  }

  private getSyntheticTrackerPositions(trackers: TrackerDataT[]) {
    const positions = new Map<BodyPart, THREE.Vector3>();

    for (const tracker of trackers) {
      const bodyPart = tracker.info?.bodyPart;
      const position = tracker.position;
      if (bodyPart == null || bodyPart === BodyPart.NONE || !position) continue;
      positions.set(bodyPart, new THREE.Vector3(position.x, position.y, position.z));
    }

    return positions;
  }

  private horizontalDistance(a: THREE.Vector3, b: THREE.Vector3) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private hideStickFigure() {
    for (const [, node] of this.nodes) {
      node.joint.visible = false;
      node.mesh.visible = false;
    }
    for (const [, line] of this.boneLines) {
      line.visible = false;
    }
  }

  private updateStickFigure(bones: BoneT[]) {
    const seen = new Set<BodyPart>();

    for (const bone of bones) {
      const bp = bone.bodyPart;
      seen.add(bp);
      let node = this.nodes.get(bp);

      if (!node) {
        const color = BONE_COLORS[bp] ?? 0x888888;
        const jointGeo = new THREE.SphereGeometry(JOINT_RADIUS, 12, 12);
        const jointMat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.3,
        });
        const joint = new THREE.Mesh(jointGeo, jointMat);
        joint.castShadow = true;
        this.scene.add(joint);

        const boneGeo = new THREE.CylinderGeometry(BONE_RADIUS, BONE_RADIUS, 1, 6);
        const boneMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(boneGeo, boneMat);
        mesh.castShadow = true;
        this.scene.add(mesh);

        node = { mesh, joint };
        this.nodes.set(bp, node);
      }

      const p = bone.headPositionG;
      const q = bone.rotationG;
      if (!p || !q) {
        node.mesh.visible = false;
        node.joint.visible = false;
        continue;
      }
      node.joint.position.set(p.x, p.y, p.z);

      const len = bone.boneLength;
      if (len > 0.001) {
        node.mesh.visible = true;
        node.mesh.position.set(p.x, p.y - len / 2, p.z);
        node.mesh.quaternion.set(q.x, q.y, q.z, q.w);
        node.mesh.scale.y = len;
      } else {
        node.mesh.visible = false;
      }
    }

    for (const [bp, node] of this.nodes) {
      node.joint.visible = seen.has(bp);
      if (!seen.has(bp)) node.mesh.visible = false;
    }

    this.updateBoneLines(seen);
  }

  private updateBoneLines(activeParts: Set<BodyPart>) {
    const connKey = (a: BodyPart, b: BodyPart) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const needed = new Set<string>();

    for (const [child, parent] of Object.entries(BONE_PARENT)) {
      const c = Number(child) as BodyPart;
      const p = parent as BodyPart;
      if (activeParts.has(c) && activeParts.has(p)) {
        const key = connKey(c, p);
        needed.add(key);
        if (!this.boneLines.has(key)) {
          const geo = new THREE.CylinderGeometry(0.008, 0.008, 1, 4);
          const mat = new THREE.MeshBasicMaterial({ color: 0x666688, transparent: true, opacity: 0.4 });
          const mesh = new THREE.Mesh(geo, mat);
          this.scene.add(mesh);
          this.boneLines.set(key, mesh);
        }
      }
    }

    for (const [key, mesh] of this.boneLines) {
      if (needed.has(key)) {
        const [a, b] = key.split('-').map(Number) as [BodyPart, BodyPart];
        const posA = this.nodes.get(a)?.joint.position;
        const posB = this.nodes.get(b)?.joint.position;
        if (posA && posB) {
          const mid = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
          const dir = new THREE.Vector3().copy(posB).sub(posA);
          const len = dir.length();
          mesh.position.copy(mid);
          mesh.scale.y = len;
          if (len > 0.001) {
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
          }
          mesh.visible = true;
        }
      } else {
        mesh.visible = false;
      }
    }
  }

  start() {
    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
      if (this.postRenderCallback) {
        this.postRenderCallback();
      }
    };
    animate();
  }

  setPostRenderCallback(cb: (() => void) | null) {
    this.postRenderCallback = cb;
  }

  setPelvisPositionCallback(cb: ((pos: THREE.Vector3, timestamp: number) => void) | null) {
    this.pelvisPositionCallback = cb;
  }

  setWalkDebugCallback(cb: ((data: WalkDebugFrame, timestamp: number) => void) | null) {
    this.walkDebugCallback = cb;
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
  }
}
