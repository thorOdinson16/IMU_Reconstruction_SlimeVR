import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BoneT, BodyPart, TrackerDataT } from 'solarxr-protocol';

const BONE_RADIUS = 0.02;
const JOINT_RADIUS = 0.03;
const FOOT_CONTACT_HEIGHT = 0.08;   // m above the floor plane still counts as ground contact
const FOOT_CONTACT_SPEED = 0.5;     // m/s; a foot slower than this near the floor is "planted"
const ROOT_SMOOTHING = 0.5;         // fraction of remaining root error applied per frame
const MAX_ROOT_STEP = 0.15;         // m; per-frame clamp on root motion to reject detection spikes

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

  private poseCalibrated = false;
  private calibratedHip = new THREE.Vector3();
  private floorY = 0;
  // Foot-lock locomotion state (walk mode). Everything is in server/world space; the
  // model is translated by (hipWorldTarget - calibratedHip) so the calibration pose
  // maps to the origin. The relative geometry (foot - hip) used below is invariant to
  // any global drift the server might apply, which is why it is robust.
  private hipWorldTarget = new THREE.Vector3(); // desired hip world position this frame
  private anchor = new THREE.Vector3();          // locked world position of the planted foot
  private rootSmoothed = new THREE.Vector3();    // smoothed translation actually applied
  private plantedFoot: BodyPart.LEFT_FOOT | BodyPart.RIGHT_FOOT | null = null;
  private plantedGrounded = false;
  private walkActive = false;
  private previousLeftFoot: THREE.Vector3 | null = null;
  private previousRightFoot: THREE.Vector3 | null = null;
  private lastPoseTime = performance.now();

  constructor(canvas: HTMLCanvasElement, onModelStatus?: (status: string) => void) {
    this.onModelStatus = onModelStatus ?? null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
    let theta = 0;
    let phi = 1.2;
    let radius = 3.5;

    const updateCam = () => {
      const targetHeight = 0.9; 
      this.camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      this.camera.position.y = radius * Math.cos(phi) + targetHeight; 
      this.camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      this.camera.lookAt(0, targetHeight, 0); 
    };

    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      theta -= (e.clientX - prevX) * 0.01;
      phi = Math.max(0.05, Math.min(Math.PI - 0.05, phi + (e.clientY - prevY) * 0.01));
      prevX = e.clientX;
      prevY = e.clientY;
      updateCam();
    });
    window.addEventListener('pointerup', () => {
      isDragging = false;
    });
    this.renderer.domElement.addEventListener(
      'wheel',
      (e) => {
        radius = Math.max(1.2, Math.min(10, radius + e.deltaY * 0.005));
        updateCam();
      },
      { passive: true },
    );
    updateCam();
  }

  private resize() {
    const parent = this.renderer.domElement.parentElement!;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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

  update(bones: BoneT[], syntheticTrackers: TrackerDataT[] = [], walkEnabled = false) {
    if (this.mixamoLoaded) {
      this.applyMixamoPose(bones, syntheticTrackers, walkEnabled);
      this.hideStickFigure();
    } else {
      this.updateStickFigure(bones);
    }
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

    if (!this.poseCalibrated) {
      this.calibratedHip.copy(hip);
      this.floorY = Math.min(leftFoot.y, rightFoot.y);
      this.hipWorldTarget.copy(hip);
      this.rootSmoothed.set(0, 0, 0);
      this.previousLeftFoot = leftFoot.clone();
      this.previousRightFoot = rightFoot.clone();
      this.plantedFoot = null;
      this.plantedGrounded = false;
      this.poseCalibrated = true;
    }

    // Hip bone always sits at its bind-pose local position; vertical hip motion is
    // carried by the model translation (walk mode) or a local Y offset (walk off).
    rootBone.position.copy(this.bindHipLocalPosition);

    if (!walkEnabled) {
      // Known-good path: vertical follows the server hip, no horizontal translation.
      rootBone.position.y += hip.y - this.calibratedHip.y;
      // Keep locomotion state parked at the current pose so re-enabling starts clean.
      this.hipWorldTarget.copy(hip);
      this.rootSmoothed.set(0, 0, 0);
      this.plantedFoot = null;
      this.plantedGrounded = false;
      this.walkActive = false;
      this.previousLeftFoot!.copy(leftFoot);
      this.previousRightFoot!.copy(rightFoot);
      this.lastPoseTime = performance.now();
      this.mixamoScene.position.set(0, 0, 0);
      return;
    }

    // Walk off -> on: start from the current pose with zero translation (no jump).
    if (!this.walkActive) {
      this.hipWorldTarget.copy(hip);
      this.rootSmoothed.set(0, 0, 0);
      this.plantedFoot = null;
      this.plantedGrounded = false;
      this.previousLeftFoot!.copy(leftFoot);
      this.previousRightFoot!.copy(rightFoot);
      this.lastPoseTime = performance.now();
      this.walkActive = true;
    }

    this.solveFootLockRoot(hip, leftFoot, rightFoot);

    // Translate the whole model by the solved hip displacement, smoothed and clamped.
    const px = this.hipWorldTarget.x - this.calibratedHip.x;
    const py = this.hipWorldTarget.y - this.calibratedHip.y;
    const pz = this.hipWorldTarget.z - this.calibratedHip.z;
    let sx = (px - this.rootSmoothed.x) * ROOT_SMOOTHING;
    let sy = (py - this.rootSmoothed.y) * ROOT_SMOOTHING;
    let sz = (pz - this.rootSmoothed.z) * ROOT_SMOOTHING;
    const stepLen = Math.hypot(sx, sy, sz);
    if (stepLen > MAX_ROOT_STEP) {
      const scale = MAX_ROOT_STEP / stepLen;
      sx *= scale; sy *= scale; sz *= scale;
    }
    this.rootSmoothed.x += sx;
    this.rootSmoothed.y += sy;
    this.rootSmoothed.z += sz;
    this.mixamoScene.position.set(this.rootSmoothed.x, this.rootSmoothed.y, this.rootSmoothed.z);
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
   */
  private solveFootLockRoot(hip: THREE.Vector3, leftFoot: THREE.Vector3, rightFoot: THREE.Vector3) {
    const now = performance.now();
    const dt = Math.max((now - this.lastPoseTime) / 1000, 1 / 120);
    this.lastPoseTime = now;

    const leftSpeed = this.previousLeftFoot ? this.horizontalDistance(leftFoot, this.previousLeftFoot) / dt : 0;
    const rightSpeed = this.previousRightFoot ? this.horizontalDistance(rightFoot, this.previousRightFoot) / dt : 0;

    const leftContact = leftFoot.y - this.floorY <= FOOT_CONTACT_HEIGHT && leftSpeed <= FOOT_CONTACT_SPEED;
    const rightContact = rightFoot.y - this.floorY <= FOOT_CONTACT_HEIGHT && rightSpeed <= FOOT_CONTACT_SPEED;

    // Best available ground contact: prefer the lower foot, break ties by the slower one.
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

    const plantedContact = this.plantedFoot === BodyPart.LEFT_FOOT
      ? leftContact
      : this.plantedFoot === BodyPart.RIGHT_FOOT
        ? rightContact
        : false;

    if (this.plantedFoot != null && this.plantedGrounded && plantedContact) {
      // Keep the current stance foot while it stays grounded (no flip-flop, no hysteresis
      // needed): we only ever switch feet once the current one leaves the ground.
    } else if (best != null) {
      // (Re)acquire a stance foot. Re-anchor so the hip is continuous across the switch.
      const foot = best === BodyPart.LEFT_FOOT ? leftFoot : rightFoot;
      this.anchor.set(
        this.hipWorldTarget.x + (foot.x - hip.x),
        this.floorY,
        this.hipWorldTarget.z + (foot.z - hip.z),
      );
      this.plantedFoot = best;
      this.plantedGrounded = true;
    } else {
      // Both feet airborne (e.g. mid-run/jump): freeze the root until one lands.
      this.plantedGrounded = false;
    }

    if (this.plantedFoot != null && this.plantedGrounded) {
      const foot = this.plantedFoot === BodyPart.LEFT_FOOT ? leftFoot : rightFoot;
      this.hipWorldTarget.set(
        this.anchor.x - (foot.x - hip.x),
        this.anchor.y - (foot.y - hip.y),
        this.anchor.z - (foot.z - hip.z),
      );
    }
    // else: hold the previous hipWorldTarget (frozen root while airborne).

    this.previousLeftFoot!.copy(leftFoot);
    this.previousRightFoot!.copy(rightFoot);
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
    };
    animate();
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
  }
}
