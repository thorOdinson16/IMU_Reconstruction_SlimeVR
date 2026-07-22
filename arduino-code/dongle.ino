#include <esp_now.h>
#include <esp_wifi.h>
#include <WiFi.h>

// ============================================================
// USB DONGLE — receives ESP-NOW from both hubs, forwards each
// packet over USB serial the instant it arrives. No batching,
// no sync tick: minimum latency is the priority.
//
// The dongle is the ESP-NOW "master": it owns the channel and
// hubs discover IT (same WHO?/HERE pattern sensor.ino already
// uses to find a hub — just inverted one layer up).
// ============================================================

// Fixed channel. Pick one that doesn't overlap a nearby Wi-Fi AP.
// (No router to inherit a channel from anymore, so this has to
// be chosen explicitly.)
const uint8_t DONGLE_CHANNEL = 6;

const int LED_RED   = 1;
const int LED_GREEN = 0;

#pragma pack(1)
// Wire struct sent by BOTH sensor.ino and hub.ino once updated to match.
// label kept (not sensorId int) for now to minimize churn on sensor/hub
// side during bring-up — swap to a 1-byte sensorId later if you want to
// shave a few more bytes off the ESP-NOW payload.
struct SensorData {
  char label[8];
  float qw, qx, qy, qz;
  uint16_t seq;   // per-sensor monotonic counter, wraps — for loss detection downstream
};

struct ProbePacket {
  char magic[4];   // "WHO?"
};
struct ProbeReply {
  char magic[4];   // "HERE"
  uint8_t channel;
};

// Serial wire frame: [0xAA 0x55][SensorData][checksum]
struct SerialFrame {
  uint8_t sync0;   // 0xAA
  uint8_t sync1;   // 0x55
  SensorData data;
  uint8_t checksum; // XOR of all bytes in `data`
};
#pragma pack()

uint8_t computeChecksum(const uint8_t* buf, size_t len) {
  uint8_t c = 0;
  for (size_t i = 0; i < len; i++) c ^= buf[i];
  return c;
}

void onEspNowReceive(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  if (len == sizeof(SensorData)) {
    // Forward immediately — no buffering, no waiting for a batch.
    SerialFrame frame;
    frame.sync0 = 0xAA;
    frame.sync1 = 0x55;
    memcpy(&frame.data, incomingData, sizeof(SensorData));
    frame.checksum = computeChecksum((const uint8_t*)&frame.data, sizeof(SensorData));
    Serial.write((const uint8_t*)&frame, sizeof(frame));
    return;
  }

  if (len == sizeof(ProbePacket)) {
    ProbePacket probe;
    memcpy(&probe, incomingData, sizeof(probe));
    if (memcmp(probe.magic, "WHO?", 4) != 0) return;

    // A hub is looking for us. Register it as a peer (if not already) and reply.
    esp_now_peer_info_t existing;
    bool alreadyPeer = (esp_now_get_peer(info->src_addr, &existing) == ESP_OK);

    if (!alreadyPeer) {
      esp_now_peer_info_t replyPeer = {};
      memcpy(replyPeer.peer_addr, info->src_addr, 6);
      replyPeer.channel = DONGLE_CHANNEL;
      replyPeer.encrypt = false;
      esp_err_t addResult = esp_now_add_peer(&replyPeer);
      if (addResult != ESP_OK && addResult != ESP_ERR_ESPNOW_EXIST) {
        return; // table full or other failure — hub will retry next sweep pass
      }
    }

    ProbeReply reply;
    memcpy(reply.magic, "HERE", 4);
    reply.channel = DONGLE_CHANNEL;
    esp_now_send(info->src_addr, (uint8_t*)&reply, sizeof(reply));
    // Peer stays registered — hubs push continuously, we want them to
    // stay in the peer table for as long as they're active.
  }
}

void onSend(const wifi_tx_info_t *info, esp_now_send_status_t status) {}

void setup() {
  Serial.begin(921600);
  pinMode(LED_RED,   OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  digitalWrite(LED_RED,   HIGH);
  digitalWrite(LED_GREEN, HIGH);

  WiFi.mode(WIFI_STA);
  esp_wifi_set_channel(DONGLE_CHANNEL, WIFI_SECOND_CHAN_NONE);

  if (esp_now_init() != ESP_OK) {
    while (1) { digitalWrite(LED_RED, LOW); delay(100); digitalWrite(LED_RED, HIGH); delay(100); }
  }
  esp_now_register_recv_cb(onEspNowReceive);
  esp_now_register_send_cb(onSend);

  // Solid green once ready — dongle is now advertising/listening.
  digitalWrite(LED_GREEN, LOW);
}

void loop() {
  // Heartbeat blink so "dongle alive" is visible without a serial monitor.
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

  // Everything else happens in the ESP-NOW receive callback — loop()
  // just keeps the heartbeat alive. No polling, no batching here.
}
