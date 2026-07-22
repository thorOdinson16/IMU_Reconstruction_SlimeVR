import { ProtocolClient } from './protocol';
import { MocapScene } from './scene';
import { extractJointAngles, type JointAngles } from './jointAngles';

const connStatus = document.getElementById('conn-status')!;
const trackerCount = document.getElementById('tracker-count')!;
const modelStatus = document.getElementById('model-status')!;
const recIndicator = document.getElementById('rec-indicator')!;
const recTimer = document.getElementById('rec-timer')!;
const angleDebugPanel = document.getElementById('angle-debug')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const WS_URL = `ws://${location.hostname}:21110`;

const scene = new MocapScene(canvas, (status) => {
  modelStatus.textContent = status;
});
scene.start();

const offscreen = document.createElement('canvas');
let offscreenCtx: CanvasRenderingContext2D | null = null;
function ensureOffscreen() {
  if (offscreen.width !== canvas.width || offscreen.height !== canvas.height) {
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    offscreenCtx = offscreen.getContext('2d');
  }
}

let walkEnabled = false;
let angleDebugEnabled = false;
let recording = false;
let runNumber = '';
let mediaRecorder: MediaRecorder | null = null;
const videoChunks: Blob[] = [];
let pelvisCsvRows: string[] = [];
let walkDebugRows: string[] = [];
let lastPelvisPos: { x: number; y: number; z: number } | null = null;
let pelvisChangedThisFrame = false;
const PELVIS_EPSILON = 1e-5;
let recStartTime = 0;
let timerInterval: number | null = null;

interface PendingLabel {
  label: string;
  timestamp: number;
}
const pendingLabels: PendingLabel[] = [];

const CMD_TO_LABEL: Record<string, string> = {
  'reset-yaw': 'Reset Yaw',
  'reset-full': 'Reset Full',
  'reset-mounting': 'Reset Mounting',
  'autobone-record': 'AutoBone Record',
  'autobone-process': 'AutoBone Process',
  'autobone-apply': 'AutoBone Apply',
};

function pushLabel(text: string) {
  const idx = pendingLabels.findIndex(p => p.label === text);
  if (idx >= 0) {
    pendingLabels[idx].timestamp = performance.now();
  } else {
    pendingLabels.push({ label: text, timestamp: performance.now() });
  }
}

function drawLabels(ctx: CanvasRenderingContext2D) {
  const now = performance.now();
  let i = pendingLabels.length - 1;
  while (i >= 0) {
    const age = now - pendingLabels[i].timestamp;
    if (age > 2000) {
      pendingLabels.splice(i, 1);
    }
    i--;
  }

  if (pendingLabels.length === 0) return;

  const padding = 14;
  const lineHeight = 28;
  const fontSize = 16;
  ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;

  let y = padding;
  for (let j = pendingLabels.length - 1; j >= 0; j--) {
    const age = now - pendingLabels[j].timestamp;
    if (age < 1500) {
      ctx.globalAlpha = 1.0;
    } else {
      ctx.globalAlpha = Math.max(0, 1.0 - (age - 1500) / 500);
    }

    const metrics = ctx.measureText(pendingLabels[j].label);
    const tw = metrics.width;
    const x = ctx.canvas.width - tw - padding - 12;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 6, y - 2, tw + 12, lineHeight - 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(pendingLabels[j].label, x, y + 19);

    y += lineHeight;
  }
  ctx.globalAlpha = 1.0;
}

scene.setPostRenderCallback(() => {
  ensureOffscreen();
  if (!offscreenCtx) return;
  offscreenCtx.drawImage(canvas, 0, 0);
  drawLabels(offscreenCtx);
});

scene.setPelvisPositionCallback((pos, ts) => {
  if (!recording) { pelvisChangedThisFrame = false; return; }
  pelvisChangedThisFrame = false;
  if (lastPelvisPos) {
    const dx = pos.x - lastPelvisPos.x;
    const dy = pos.y - lastPelvisPos.y;
    const dz = pos.z - lastPelvisPos.z;
    if (Math.abs(dx) < PELVIS_EPSILON && Math.abs(dy) < PELVIS_EPSILON && Math.abs(dz) < PELVIS_EPSILON) return;
  }
  lastPelvisPos = { x: pos.x, y: pos.y, z: pos.z };
  pelvisChangedThisFrame = true;
  pelvisCsvRows.push(`${ts},${pos.x},${pos.y},${pos.z}`);
});

scene.setWalkDebugCallback((data, ts) => {
  if (!recording) return;
  if (!pelvisChangedThisFrame) return;
  walkDebugRows.push([
    ts,
    data.plantedFoot ?? '',
    data.plantJustChanged ? 1 : 0,
    data.leftContact ? 1 : 0,
    data.rightContact ? 1 : 0,
    data.contactCandidate ?? '',
    data.contactCandidateFrames,
    data.plantFrameCount,
    data.leftFootX, data.leftFootY, data.leftFootZ,
    data.rightFootX, data.rightFootY, data.rightFootZ,
    data.anchorX, data.anchorY, data.anchorZ,
    data.corrX, data.corrY, data.corrZ,
    data.rootX, data.rootY, data.rootZ,
    data.leftAnchorX, data.leftAnchorY, data.leftAnchorZ,
    data.rightAnchorX, data.rightAnchorY, data.rightAnchorZ,
  ].join(','));
});

function updateAngleDebugDisplay(angles: JointAngles): void {
  document.getElementById('angle-leftElbow')!.textContent = angles.leftElbow !== null ? angles.leftElbow.toFixed(1) + '°' : '--';
  document.getElementById('angle-rightElbow')!.textContent = angles.rightElbow !== null ? angles.rightElbow.toFixed(1) + '°' : '--';
  document.getElementById('angle-leftKnee')!.textContent = angles.leftKnee !== null ? angles.leftKnee.toFixed(1) + '°' : '--';
  document.getElementById('angle-rightKnee')!.textContent = angles.rightKnee !== null ? angles.rightKnee.toFixed(1) + '°' : '--';
  document.getElementById('angle-leftShoulderAbduction')!.textContent = angles.leftShoulderAbduction !== null ? angles.leftShoulderAbduction.toFixed(1) + '°' : '--';
  document.getElementById('angle-rightShoulderAbduction')!.textContent = angles.rightShoulderAbduction !== null ? angles.rightShoulderAbduction.toFixed(1) + '°' : '--';
  document.getElementById('angle-leftHipFlexion')!.textContent = angles.leftHipFlexion !== null ? angles.leftHipFlexion.toFixed(1) + '°' : '--';
  document.getElementById('angle-rightHipFlexion')!.textContent = angles.rightHipFlexion !== null ? angles.rightHipFlexion.toFixed(1) + '°' : '--';
  document.getElementById('angle-trunkLean')!.textContent = angles.trunkLean !== null ? angles.trunkLean.toFixed(1) + '°' : '--';
  document.getElementById('angle-spineRotationYaw')!.textContent = angles.spineRotationYaw !== null ? angles.spineRotationYaw.toFixed(1) + '°' : '--';
}

const client = new ProtocolClient(
  WS_URL,
  (bones, syntheticTrackers, _index) => {
    scene.update(bones, syntheticTrackers, walkEnabled);
    if (angleDebugEnabled) {
      updateAngleDebugDisplay(extractJointAngles(bones));
    }
  },
  (connected, msg) => {
    connStatus.textContent = msg;
    connStatus.className = connected ? 'connected' : 'disconnected';
  },
  (count) => {
    trackerCount.textContent = `Trackers: ${count}`;
  },
);

client.setTextCallback((msg: string) => {
  if (msg.startsWith('RUN:NUMBER:')) {
    runNumber = msg.substring(11);
  }
});

client.connect();
const walkBtn = document.querySelector('[data-cmd="toggle-walk"]') as HTMLElement;
const recordBtn = document.querySelector('[data-cmd="toggle-record"]') as HTMLElement;

function updateTimer() {
  if (!recStartTime) return;
  const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  recTimer.textContent = `${m}:${s}`;
}

function showRecIndicator() {
  recIndicator.style.display = 'flex';
  recStartTime = Date.now();
  recTimer.textContent = '00:00';
  timerInterval = window.setInterval(updateTimer, 500);
}

function hideRecIndicator() {
  recIndicator.style.display = 'none';
  recStartTime = 0;
  if (timerInterval != null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

async function uploadPelvisCsv() {
  if (pelvisCsvRows.length <= 1) return;
  const csvText = pelvisCsvRows.join('\n');
  const blob = new Blob([csvText], { type: 'text/csv' });
  const safeRun = runNumber || Date.now().toString();
  const fileName = `run_${safeRun}_pelvis.csv`;
  let uploaded = false;

  try {
    await fetch(`http://${location.hostname}:21111/upload`, {
      method: 'POST',
      headers: { 'X-Filename': fileName },
      body: blob,
    });
    console.log(`[Record] Uploaded ${fileName}`);
    uploaded = true;
  } catch (err) {
    console.error('[Record] Pelvis CSV upload failed:', err);
  }

  if (!uploaded) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}

async function uploadWalkDebugCsv() {
  if (walkDebugRows.length <= 1) return;
  const csvText = walkDebugRows.join('\n');
  const blob = new Blob([csvText], { type: 'text/csv' });
  const safeRun = runNumber || Date.now().toString();
  const fileName = `run_${safeRun}_walk_debug.csv`;
  let uploaded = false;

  try {
    await fetch(`http://${location.hostname}:21111/upload`, {
      method: 'POST',
      headers: { 'X-Filename': fileName },
      body: blob,
    });
    console.log(`[Record] Uploaded ${fileName}`);
    uploaded = true;
  } catch (err) {
    console.error('[Record] Walk debug CSV upload failed:', err);
  }

  if (!uploaded) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}

async function startRecording() {
  ensureOffscreen();
  const stream = offscreen.captureStream(60);

  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }
  }

  videoChunks.length = 0;
  pelvisCsvRows = ['timestamp_ms,x,y,z'];
  walkDebugRows = ['timestamp_ms,planted_foot,plant_changed,left_contact,right_contact,contact_candidate,contact_candidate_frames,plant_frame_count,left_foot_x,left_foot_y,left_foot_z,right_foot_x,right_foot_y,right_foot_z,anchor_x,anchor_y,anchor_z,correction_x,correction_y,correction_z,root_x,root_y,root_z'];
  lastPelvisPos = null;
  pelvisChangedThisFrame = false;
  mediaRecorder = new MediaRecorder(stream, { mimeType });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) videoChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(videoChunks, { type: mimeType });
    const safeRun = runNumber || Date.now().toString();
    const fileName = `run_${safeRun}.webm`;
    let uploaded = false;

    try {
      await fetch(`http://${location.hostname}:21111/upload`, {
        method: 'POST',
        headers: { 'X-Filename': fileName },
        body: blob,
      });
      console.log(`[Record] Uploaded ${fileName}`);
      uploaded = true;
    } catch (err) {
      console.error('[Record] Upload failed:', err);
      connStatus.textContent = 'Upload failed - saved locally';
      connStatus.className = 'disconnected';
    }

    if (!uploaded) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  client.sendRecordStart();
  showRecIndicator();
  mediaRecorder.start();
}

function stopRecording() {
  client.sendRecordStop();
  hideRecIndicator();
  uploadPelvisCsv();
  uploadWalkDebugCsv();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

document.getElementById('controls')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('[data-cmd]') as HTMLElement;
  if (!btn) return;
  const cmd = btn.dataset.cmd!;

  const known = CMD_TO_LABEL[cmd];
  if (known) pushLabel(known);

  switch (cmd) {
    case 'reset-yaw': client.sendResetYaw(); scene.resetLocomotion(); break;
    case 'reset-full': client.sendResetFull(); scene.resetLocomotion(); break;
    case 'reset-mounting': client.sendResetMounting(); scene.resetLocomotion(); break;
    case 'autobone-record': client.sendAutoBoneRecord(); break;
    case 'autobone-process': client.sendAutoBoneProcess(); break;
    case 'autobone-apply': client.sendAutoBoneApply(); break;
    case 'toggle-walk':
      walkEnabled = !walkEnabled;
      client.sendToggleWalk(walkEnabled);
      walkBtn.textContent = walkEnabled ? 'Walk: ON' : 'Walk: OFF';
      client.sendCsvEvent(walkEnabled ? 'WALK_ON' : 'WALK_OFF');
      pushLabel(walkEnabled ? 'Walk ON' : 'Walk OFF');
      break;
    case 'toggle-record':
      if (recording) {
        recording = false;
        stopRecording();
        recordBtn.textContent = 'Record: OFF';
        recordBtn.classList.remove('active');
        pushLabel('Record OFF');
      } else {
        recording = true;
        startRecording();
        recordBtn.textContent = 'Record: ON';
        recordBtn.classList.add('active');
        pushLabel('Record ON');
      }
      break;
    case 'toggle-angle-debug':
      angleDebugEnabled = !angleDebugEnabled;
      angleDebugPanel.style.display = angleDebugEnabled ? 'block' : 'none';
      (btn as HTMLElement).textContent = angleDebugEnabled ? 'Angles: ON' : 'Angles: OFF';
      break;
  }
});

window.addEventListener('beforeunload', () => {
  if (recording) stopRecording();
  client.disconnect();
  scene.stop();
});
