import { ProtocolClient } from './protocol';
import { MocapScene } from './scene';

const connStatus = document.getElementById('conn-status')!;
const trackerCount = document.getElementById('tracker-count')!;
const modelStatus = document.getElementById('model-status')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const WS_URL = `ws://${location.hostname}:21110`;

const scene = new MocapScene(canvas, (status) => {
  modelStatus.textContent = status;
});
scene.start();

let walkEnabled = false;

const client = new ProtocolClient(
  WS_URL,
  (bones, syntheticTrackers, _index) => scene.update(bones, syntheticTrackers, walkEnabled),
  (connected, msg) => {
    connStatus.textContent = msg;
    connStatus.className = connected ? 'connected' : 'disconnected';
  },
  (count) => {
    trackerCount.textContent = `Trackers: ${count}`;
  },
);

client.connect();
const walkBtn = document.querySelector('[data-cmd="toggle-walk"]') as HTMLElement;

document.getElementById('controls')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('[data-cmd]') as HTMLElement;
  if (!btn) return;
  switch (btn.dataset.cmd) {
    case 'reset-yaw': client.sendResetYaw(); break;
    case 'reset-full': client.sendResetFull(); break;
    case 'reset-mounting': client.sendResetMounting(); break;
    case 'autobone-record': client.sendAutoBoneRecord(); break;
    case 'autobone-process': client.sendAutoBoneProcess(); break;
    case 'autobone-apply': client.sendAutoBoneApply(); break;
    case 'toggle-walk':
      walkEnabled = !walkEnabled;
      client.sendToggleWalk(walkEnabled);
      walkBtn.textContent = walkEnabled ? 'Walk: ON' : 'Walk: OFF';
      break;
  }
});

window.addEventListener('beforeunload', () => {
  client.disconnect();
  scene.stop();
});
