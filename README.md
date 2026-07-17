# SlimeVR_IMUReconstruction

A minimal motion-capture pipeline using ESP32 + MPU6050 IMUs, the SlimeVR server for skeleton IK, and a Three.js web viewer for a Mixamo-rigged character.

## Architecture

```
┌──────────────────────┐      ESP-NOW         ┌──────────────┐      UDP :5005    ┌───────────────────────┐
│  10× Sensor Nodes    │ ──────────────────▶  │  2× Hubs     │ ────────────────▶  │   SlimeVR Server      │
│  (MPU6050 per joint) │  (per-board label)   │ (CHEST/HIPS) │                    │  (Kotlin/JVM)         │
└──────────────────────┘                      └──────────────┘                    │                       │
                                                                                  │  IK skeleton          │
                                                                  WebSocket :21110 │  Reset/calibration    │
                                                                      │           │  UDP text parser      │
                                                                      ▼           └───────────────────────┘
                                                           ┌──────────────────────┐
                                                           │  Three.js Viewer     │
                                                           │  (Vite, :5173)       │
                                                           │  Mixamo character    │
                                                           └──────────────────────┘
```

## Quick Start (Docker)

```bash
git clone https://github.com/BioMechanicalDigitalTwin/IMU_Reconstruction_SlimeVR.git
cd IMU_Reconstruction_SlimeVR
docker compose up --build
```

Open `http://localhost:5173`.

That's it — Docker installs all dependencies, builds the server, installs the frontend, and starts both services.

## Manual Setup (No Docker)

### Prerequisites

- **Java 17+**
- **Node.js 18+**

### Server

```bash
./gradlew build
./gradlew run --no-daemon
```

The server loads `config.json` from the working directory and starts three listeners:

| Port | Protocol | Purpose |
|------|----------|---------|
| 5005 | UDP | Receives IMU data from ESP32 hubs |
| 21110 | WebSocket | Serves bone data to the viewer (FlatBuffers) |
| 21111 | HTTP | Video/CSV upload endpoint (`POST /upload`) |

### Viewer

```bash
cd gui-mocap
npm install
npx vite dev
```

Open `http://localhost:5173`. The viewer connects to the server at `ws://localhost:21110`.

## Hardware

| Component | Quantity | Notes |
|-----------|----------|-------|
| ESP32 | 12 | 2 hubs + 10 sensors |
| MPU6050 | 10 | I²C, DMP mode |

### Sensor Placement (10 joints)

| Label | Joint | Hub |
|-------|-------|-----|
| `L_FA`  | Left forearm    | CHEST |
| `L_UA`  | Left upper arm  | CHEST |
| `R_FA`  | Right forearm   | CHEST |
| `R_UA`  | Right upper arm | CHEST |
| `CHEST` | Chest (hub)     | —     |
| `L_SH`  | Left shin       | HIPS  |
| `L_TH`  | Left thigh      | HIPS  |
| `R_SH`  | Right shin      | HIPS  |
| `R_TH`  | Right thigh     | HIPS  |
| `HIPS`  | Hips (hub)      | —     |

### Flashing the ESP32s

**Hubs** — Open `hub.ino` in Arduino IDE. Update the WiFi SSID, password, and the server IP address. Flash each of the 2 hubs.

**Sensors** — Open `sensor.ino`. For each of the 10 boards, set `SENSOR_LABEL` to the joint label from the table above and `HUB_MAC` to the MAC address of its hub. Flash each board.

Sensors send `LABEL,qw,qx,qy,qz` via ESP-NOW to their hub. The hub forwards to the server via UDP unicast on port 5005.

## Usage

### Reset / Calibration Buttons

| Button | Type | Effect |
|--------|------|--------|
| **Reset Yaw** | Yaw | Zeroes horizontal heading |
| **Reset Full** | Full | T-pose calibration (instant) |
| **Reset Mounting** | Mounting | Corrects sensor-to-bone misalignment |

### Walk Mode

Toggle **Walk: ON** to enable the foot-plant root solver. The character root moves with the pelvis instead of staying centered.

### Recording

Toggle **Record: ON** to capture screen video (WebM), pelvis position CSV, and walk debug CSV. Files are saved to `RecordLogs/run_NNN/` on the machine running the server.

## Project Layout

```
├── src/main/kotlin/com/bmdt/
│   └── ServerLauncher.kt         # Entry point
├── core/                         # SlimeVR server (Kotlin/JVM)
│   └── src/main/java/dev/slimevr/
│       ├── VRServer.kt           # Master server loop
│       ├── tracking/trackers/udp/  # UDP text parser
│       ├── config/               # Config management
│       └── protocol/datafeed/    # Bone data feed
├── gui-mocap/                    # Three.js web viewer
│   ├── src/
│   │   ├── main.ts               # Entry, wires protocol ↔ scene
│   │   ├── protocol.ts           # FlatBuffers WebSocket client
│   │   └── scene.ts              # Three.js GLB renderer + bone mapping
│   ├── public/human.glb          # Mixamo-rigged character
│   └── index.html
├── solarxr-protocol/             # FlatBuffers protocol schema
├── hub.ino                       # ESP32 CHEST/HIPS hub firmware
├── sensor.ino                    # ESP32 per-joint sensor firmware
├── config.json                   # Server configuration
├── Dockerfile.backend            # Docker backend build
├── Dockerfile.frontend           # Docker frontend build
├── docker-compose.yml
└── RecordLogs/                   # Capture output (CSV, WebM)
    └── run_NNN/
```

## Notes

- The server's text parser auto-registers trackers by label. Labels map to `TrackerPosition` → `BodyPart` for IK.
- The viewer receives only bones with an active tracker attached, keeping the GLB T-pose intact for untracked bones.
- The GLB rig uses `mixamorig`-prefixed bone names without colons (e.g. `mixamorigHips`, not `mixamorig:Hips`).
- `config.json` is YAML format despite the `.json` extension — use YAML syntax when editing.
