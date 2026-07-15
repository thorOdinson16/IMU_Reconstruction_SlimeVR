import { ProtocolClient } from './protocol';
import { MocapScene } from './scene';
import { PoseManager } from './pose/PoseManager';
import { YogaModule } from './applications/yoga/YogaModule';
import { JointScore } from './pose/types';
import tadasana from './applications/yoga/poses/tadasana';
import vrikshasana from './applications/yoga/poses/vrikshasana';

const connStatus = document.getElementById('conn-status')!;
const trackerCount = document.getElementById('tracker-count')!;
const modelStatus = document.getElementById('model-status')!;
const recIndicator = document.getElementById('rec-indicator')!;
const recTimer = document.getElementById('rec-timer')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const yogaEnable = document.getElementById('yoga-enable') as HTMLInputElement;
const yogaBody = document.getElementById('yoga-body')!;
const yogaPoseSelect = document.getElementById('yoga-pose-select') as HTMLSelectElement;
const yogaScore = document.getElementById('yoga-score')!;
const yogaHold = document.getElementById('yoga-hold')!;
const yogaStatus = document.getElementById('yoga-status')!;

const WS_URL = `ws://${location.hostname}:21110`;

const scene = new MocapScene(canvas, (status) => {
  modelStatus.textContent = status;
});
scene.start();

let lastPoseTime = performance.now();
const poseManager = new PoseManager();
const yogaModule = new YogaModule([tadasana, vrikshasana]);
poseManager.register('yoga', yogaModule);

const yogaPoses = yogaModule.getPoseList();
for (const p of yogaPoses) {
  const opt = document.createElement('option');
  opt.value = String(p.index);
  opt.textContent = p.name;
  yogaPoseSelect.appendChild(opt);
}

yogaEnable.addEventListener('change', () => {
  if (yogaEnable.checked) {
    poseManager.activate('yoga');
    yogaBody.style.display = 'block';
    yogaPoseSelect.value = '0';
    yogaModule.selectPose(0);
  } else {
    poseManager.deactivate();
    yogaBody.style.display = 'none';
    scene.setJointScores(null);
    yogaScore.textContent = '--';
    yogaHold.textContent = '--';
    yogaStatus.textContent = '--';
  }
});

yogaPoseSelect.addEventListener('change', () => {
  const idx = parseInt(yogaPoseSelect.value, 10);
  yogaModule.selectPose(idx);
});

function updateYogaUI(scores: JointScore[] | null) {
  if (!yogaEnable.checked || !scores) {
    scene.setJointScores(null);
    return;
  }
  scene.setJointScores(scores);

  const lastScore = yogaModule.getLastScore();
  if (!lastScore) return;

  yogaScore.textContent = `${(lastScore.smoothedScore * 100).toFixed(0)}%`;

  if (lastScore.completionState === 'holding' || lastScore.completionState === 'completed') {
    yogaHold.textContent = `${lastScore.holdElapsed.toFixed(1)} / ${lastScore.holdDuration} sec`;
  } else {
    yogaHold.textContent = '--';
  }

  yogaStatus.textContent = yogaModule.getStatusText();

  if (yogaModule.getCompleted()) {
    yogaStatus.textContent = 'Completed';
    yogaStatus.style.color = '#0f0';
  } else {
    yogaStatus.style.color = '';
  }
}

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
let recording = false;
let runNumber = '';
let mediaRecorder: MediaRecorder | null = null;
const videoChunks: Blob[] = [];
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

const client = new ProtocolClient(
  WS_URL,
  (bones, syntheticTrackers, _index) => {
    scene.update(bones, syntheticTrackers, walkEnabled);
    if (yogaEnable.checked) {
      const now = performance.now();
      const dt = Math.min((now - lastPoseTime) / 1000, 0.5);
      lastPoseTime = now;
      const result = poseManager.update(bones, dt);
      if (result) {
        updateYogaUI(result.jointScores);
      }
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
  }
});

window.addEventListener('beforeunload', () => {
  if (recording) stopRecording();
  client.disconnect();
  scene.stop();
});
