#include <esp_now.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <Wire.h>
#include "I2Cdev.h"
#include "MPU6050_6Axis_MotionApps612.h"

// ============================================================
// HUB — no Wi-Fi. Relays sensor ESP-NOW packets to the dongle
// over ESP-NOW, and sends its own MPU6050 reading the same way.
//
// PER-BOARD CONFIG — only this line changes across the 2 hubs.
// ============================================================

const char* SELF_LABEL = "HIPS"; // or "CHEST" on the other hub

// The dongle's MAC. Same discovery pattern sensor.ino uses to find
// a hub, just pointed one layer up at the dongle instead.
uint8_t DONGLE_MAC[] = {0xE8, 0x3D, 0xC1, 0x9C, 0x59, 0x78};

const int LED_RED   = 1;
const int LED_GREEN = 0;

MPU6050 mpu;
uint8_t fifoBuffer[64];
esp_now_peer_info_t peerInfo;

#pragma pack(1)
struct SensorData {
  char label[8];
  float qw, qx, qy, qz;
  uint16_t seq;
};
struct ProbePacket {
  char magic[4];   // "WHO?"
};
struct ProbeReply {
  char magic[4];   // "HERE"
  uint8_t channel;
};
#pragma pack()

static SensorData bufA[8], bufB[8];
static volatile SensorData* writeBuf = bufA;
static SensorData* readBuf = bufB;
static volatile int writeCount = 0;
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

uint16_t hubSeq = 0;

const unsigned long DWELL_MS = 300;
volatile bool replyReceived = false;
volatile uint8_t replyChannel = 0;

void onSend(const wifi_tx_info_t *info, esp_now_send_status_t status) {}

// ---- Discovery reply handler (used only during discoverDongleChannel) ----
void onDiscoveryReply(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  if (len != sizeof(ProbeReply)) return;
  ProbeReply reply;
  memcpy(&reply, incomingData, sizeof(reply));
  if (memcmp(reply.magic, "HERE", 4) != 0) return;
  if (memcmp(info->src_addr, DONGLE_MAC, 6) != 0) return;
  replyChannel = reply.channel;
  replyReceived = true;
}

void blinkSearching() {
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, HIGH);
  delay(60);
  digitalWrite(LED_RED, HIGH);
  digitalWrite(LED_GREEN, LOW);
  delay(60);
  digitalWrite(LED_GREEN, HIGH);
}

// Sweeps channels 1..13 indefinitely until the dongle answers.
// Same "never guess, always confirm" policy as sensor.ino.
uint8_t discoverDongleChannel() {
  esp_now_register_recv_cb(onDiscoveryReply);

  while (true) {
    for (uint8_t ch = 1; ch <= 13; ch++) {
      esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);

      memcpy(peerInfo.peer_addr, DONGLE_MAC, 6);
      peerInfo.channel = ch;
      peerInfo.encrypt = false;
      esp_now_add_peer(&peerInfo);

      replyReceived = false;
      ProbePacket probe;
      memcpy(probe.magic, "WHO?", 4);
      esp_now_send(DONGLE_MAC, (uint8_t*)&probe, sizeof(probe));

      unsigned long start = millis();
      while (millis() - start < DWELL_MS) {
        if (replyReceived) {
          uint8_t found = replyChannel;
          esp_now_del_peer(DONGLE_MAC);
          return found;
        }
        blinkSearching();
      }
      esp_now_del_peer(DONGLE_MAC);
    }
  }
}
// ---- End discovery ----

// Receives packets from limb sensors (already ESP-NOW SensorData shaped)
// and buffers them for relay, exactly like before — just no more Wi-Fi
// path involved.
void onEspNowReceive(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  if (len == sizeof(SensorData)) {
    portENTER_CRITICAL_ISR(&mux);
    if (writeCount < 8) {
      memcpy((void*)&writeBuf[writeCount], incomingData, sizeof(SensorData));
      writeCount++;
    }
    portEXIT_CRITICAL_ISR(&mux);
    return;
  }

  if (len == sizeof(ProbePacket)) {
    // A limb sensor is looking for THIS hub (hub still answers sensors
    // exactly as before — that layer of discovery is unchanged).
    ProbePacket probe;
    memcpy(&probe, incomingData, sizeof(probe));
    if (memcmp(probe.magic, "WHO?", 4) != 0) return;

    // Guard against duplicate registration: with up to 4 sensors sweeping
    // 13 channels each at boot, this handler can be hit by bursts of WHO?
    // probes in quick succession. Blindly calling esp_now_add_peer every
    // time can exhaust/corrupt the peer table and cause other sensors'
    // probes to silently fail. Check first, and only add if genuinely new.
    esp_now_peer_info_t existing;
    bool alreadyPeer = (esp_now_get_peer(info->src_addr, &existing) == ESP_OK);

    if (!alreadyPeer) {
      esp_now_peer_info_t replyPeer = {};
      memcpy(replyPeer.peer_addr, info->src_addr, 6);
      replyPeer.channel = WiFi.channel(); // whatever channel we're locked to post-discovery
      replyPeer.encrypt = false;
      esp_err_t addResult = esp_now_add_peer(&replyPeer);
      if (addResult != ESP_OK && addResult != ESP_ERR_ESPNOW_EXIST) {
        // Table full or other failure — don't reply, sensor will retry
        // on its next channel sweep pass instead of getting a broken ack.
        return;
      }
    }

    ProbeReply reply;
    memcpy(reply.magic, "HERE", 4);
    reply.channel = WiFi.channel();
    esp_now_send(info->src_addr, (uint8_t*)&reply, sizeof(reply));
    // NOTE: peer intentionally NOT deleted here anymore — the sensor is
    // about to start sending real SensorData packets on this same peer
    // entry. Deleting it right after the reply created a window where a
    // fast-following data packet could arrive before the sensor's own
    // peer registration completed, causing it to be silently dropped.
  }
}

// Forward one SensorData packet to the dongle. Sent immediately,
// no batching — matches the "minimum latency" priority.
void forwardToDongle(SensorData* d) {
  esp_now_send(DONGLE_MAC, (uint8_t*)d, sizeof(SensorData));
}

void setup() {
  Wire.begin(8, 9);
  pinMode(LED_RED,   OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  digitalWrite(LED_RED,   HIGH);
  digitalWrite(LED_GREEN, HIGH);

  for (int i = 0; i < 11; i++) {
    digitalWrite(LED_RED,   (i % 2) ? HIGH : LOW);
    digitalWrite(LED_GREEN, (i % 2) ? LOW  : HIGH);
    delay(500);
  }
  digitalWrite(LED_RED,   HIGH);
  digitalWrite(LED_GREEN, HIGH);

  mpu.initialize();

  // Same rationale as before: let the board thermally settle before
  // calibrating so a cold-boot calibration doesn't bake in a bad bias.
  delay(2000);
  mpu.CalibrateGyro(15);
  mpu.CalibrateAccel(15);

  WiFi.mode(WIFI_STA);

  if (esp_now_init() != ESP_OK) {
    while (1) { digitalWrite(LED_RED, LOW); delay(100); digitalWrite(LED_RED, HIGH); delay(100); }
  }

  // --- Discovery phase: find which channel the dongle is on ---
  uint8_t ch = discoverDongleChannel();
  esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
  esp_now_register_send_cb(onSend);
  esp_now_register_recv_cb(onEspNowReceive); // now handles both sensor probes AND sensor data

  memcpy(peerInfo.peer_addr, DONGLE_MAC, 6);
  peerInfo.channel = ch;
  peerInfo.encrypt = false;
  esp_err_t dongleAddResult = esp_now_add_peer(&peerInfo);
  if (dongleAddResult != ESP_OK && dongleAddResult != ESP_ERR_ESPNOW_EXIST) {
    while (1) { digitalWrite(LED_RED, LOW); delay(100); digitalWrite(LED_RED, HIGH); delay(100); }
  }

  digitalWrite(LED_GREEN, LOW);
  delay(2000);
  digitalWrite(LED_GREEN, HIGH);

  if (mpu.dmpInitialize() == 0) {
    mpu.setDMPEnabled(true);
  } else {
    while (1) {
      digitalWrite(LED_RED, LOW);   delay(100);
      digitalWrite(LED_RED, HIGH);  delay(100);
    }
  }
}

void loop() {
  static unsigned long lastOwnSend = 0;
  static unsigned long lastHB = 0;
  static bool hbOn = false;
  static unsigned long hbStart = 0;

  unsigned long now = millis();

  if (!hbOn && now - lastHB >= 1000) {
    digitalWrite(LED_RED, LOW);
    hbOn = true; hbStart = now; lastHB = now;
  }
  if (hbOn && now - hbStart >= 150) {
    digitalWrite(LED_RED, HIGH);
    hbOn = false;
  }

  // Hub's own MPU6050 reading — sent as a normal SensorData packet now,
  // not formatted as text. Same 10ms send-gate as before.
  if (now - lastOwnSend >= 10) {
    lastOwnSend = now;
    bool gotPacket = false;
    Quaternion q;
    uint16_t packetSize = mpu.dmpGetFIFOPacketSize();
    while (mpu.getFIFOCount() >= packetSize) {
      if (mpu.getFIFOCount() >= 1024) {
        mpu.resetFIFO();
        break;
      }
      if (mpu.dmpGetCurrentFIFOPacket(fifoBuffer)) {
        mpu.dmpGetQuaternion(&q, fifoBuffer);
        gotPacket = true;
      } else {
        break;
      }
    }
    if (gotPacket) {
      SensorData d;
      strncpy(d.label, SELF_LABEL, 7);
      d.label[7] = 0;
      d.qw = q.w; d.qx = q.x; d.qy = q.y; d.qz = q.z;
      d.seq = hubSeq++;
      forwardToDongle(&d);
    }
  }

  // Relay whatever limb-sensor packets arrived since last loop —
  // forwarded immediately, one esp_now_send per packet, no batching.
  int count = 0;
  portENTER_CRITICAL(&mux);
  count = writeCount;
  writeCount = 0;
  volatile SensorData* tmp = writeBuf;
  writeBuf = (volatile SensorData*)readBuf;
  readBuf = (SensorData*)tmp;
  portEXIT_CRITICAL(&mux);

  for (int i = 0; i < count; i++) {
    forwardToDongle((SensorData*)&readBuf[i]);
  }
}
