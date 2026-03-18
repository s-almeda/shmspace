#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ── Per-device config ─────────────────────────────────────────────────────────
const int TUBE_NUM = 0;  // Change to 1 or 2 on the other two devices

const char* server = "art.snailbunny.site";
const char* path   = "/api/bart/tube/tube_arrivals";

const unsigned long POLL_INTERVAL  = 5000;
const unsigned long SOUND_DURATION = 3000;
const unsigned long WIFI_TIMEOUT   = 10000;  // ms to wait per network attempt

// ── Known networks (default try order) ───────────────────────────────────────
typedef struct { const char* ssid; const char* pass; } WifiCred;

const WifiCred NETWORKS[] = {
  { "tiat-guest",   "artandtechnology" },
  { "Berkeley-IoT", "Hopper12!"        },
  { "shmzone",      "hopper&anya"      },
};
const int NUM_NETWORKS = sizeof(NETWORKS) / sizeof(NETWORKS[0]);

// ── Hardware ──────────────────────────────────────────────────────────────────
WiFiClientSecure client;
Adafruit_NeoPixel pixel(1, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
Preferences prefs;

// ── State ─────────────────────────────────────────────────────────────────────
String prevKey = "";
unsigned long lastPoll       = 0;
unsigned long soundStartedAt = 0;
bool soundActive             = false;

// ── WiFi helpers ──────────────────────────────────────────────────────────────

// Try to connect to one network; return true on success
bool tryConnect(const char* ssid, const char* pass) {
  Serial.printf("  Trying \"%s\"... ", ssid);
  WiFi.begin(ssid, pass);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_TIMEOUT) {
      WiFi.disconnect(true);
      Serial.println("timeout");
      return false;
    }
    delay(250);
  }
  Serial.println("connected!");
  return true;
}

// Connect to the best available network.
// Strategy: try the last-working SSID first (from flash), then the default order.
void connectWifi() {
  prefs.begin("wifi", false);
  String lastSsid = prefs.getString("last_ssid", "");
  prefs.end();

  Serial.println("Starting WiFi connection sequence...");

  // Try last-working network first (if we have one stored)
  if (lastSsid.length() > 0) {
    Serial.printf("Trying last-known network \"%s\" first\n", lastSsid.c_str());
    for (int i = 0; i < NUM_NETWORKS; i++) {
      if (lastSsid == NETWORKS[i].ssid) {
        if (tryConnect(NETWORKS[i].ssid, NETWORKS[i].pass)) return;  // already saved — no need to re-save
        break;
      }
    }
    Serial.println("Last-known network unavailable, falling back to default order...");
  }

  // Default order: tiat-guest → Berkeley-IoT → shmzone
  for (int i = 0; i < NUM_NETWORKS; i++) {
    // Skip if we already tried this one above
    if (lastSsid == NETWORKS[i].ssid) continue;

    if (tryConnect(NETWORKS[i].ssid, NETWORKS[i].pass)) {
      // Persist the winner
      prefs.begin("wifi", false);
      prefs.putString("last_ssid", NETWORKS[i].ssid);
      prefs.end();
      Serial.printf("Saved \"%s\" as last-working network\n", NETWORKS[i].ssid);
      return;
    }
  }

  // All networks failed — keep retrying indefinitely
  Serial.println("All networks failed. Retrying from default order...");
  while (true) {
    for (int i = 0; i < NUM_NETWORKS; i++) {
      if (tryConnect(NETWORKS[i].ssid, NETWORKS[i].pass)) {
        prefs.begin("wifi", false);
        prefs.putString("last_ssid", NETWORKS[i].ssid);
        prefs.end();
        return;
      }
    }
    delay(2000);
  }
}

// ── LED / sound helpers ───────────────────────────────────────────────────────

void parseHexColor(const char* hex, uint8_t &r, uint8_t &g, uint8_t &b) {
  const char* h = (hex && hex[0] == '#') ? hex + 1 : hex;
  unsigned long v = strtoul(h, nullptr, 16);
  r = (v >> 16) & 0xFF;
  g = (v >> 8)  & 0xFF;
  b =  v        & 0xFF;
}

void ledOn(uint8_t r, uint8_t g, uint8_t b) {
  pixel.setPixelColor(0, pixel.Color(r, g, b));
  pixel.show();
}

void ledOff() {
  pixel.setPixelColor(0, 0);
  pixel.show();
}

void soundOn() {
  // analogWrite(4,  255);
  // analogWrite(5,  255);
  // analogWrite(19, 255);
}

void soundOff() {
  // analogWrite(4,  0);
  // analogWrite(5,  0);
  // analogWrite(19, 0);
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pixel.begin();
  pixel.setBrightness(50);
  ledOff();
  soundOff();

  client.setInsecure();
  connectWifi();
  Serial.println("IP: " + WiFi.localIP().toString());

  poll();
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  // Non-blocking sound timer
  if (soundActive && (millis() - soundStartedAt >= SOUND_DURATION)) {
    soundOff();
    soundActive = false;
    Serial.println("TUBE " + String(TUBE_NUM) + " sound off");
  }

  // Reconnect if WiFi dropped mid-session
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost — reconnecting...");
    connectWifi();
  }

  if (millis() - lastPoll >= POLL_INTERVAL) {
    lastPoll = millis();
    poll();
  }
}

// ── Poll ──────────────────────────────────────────────────────────────────────
void poll() {
  Serial.println("Polling...");

  if (!client.connect(server, 443)) {
    Serial.println("Connection failed — keeping current state");
    return;
  }

  client.print("GET "); client.print(path); client.println(" HTTP/1.1");
  client.print("Host: "); client.println(server);
  client.println("Connection: close");
  client.println();

  unsigned long timeout = millis();
  while (client.available() == 0) {
    if (millis() - timeout > 5000) {
      Serial.println("Timeout — keeping current state");
      client.stop();
      return;
    }
  }

  // Skip HTTP headers
  while (client.available()) {
    String line = client.readStringUntil('\n');
    if (line == "\r") break;
  }

  // Read body
  String body = "";
  while (client.available()) body += (char)client.read();
  client.stop();

  Serial.println(body);

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, body)) {
    Serial.println("JSON parse failed — keeping current state");
    return;
  }

  JsonVariant slot = doc["tubes"][TUBE_NUM];

  String currentKey = "";
  if (!slot.isNull()) {
    const char* vref = slot["vehicleRef"];
    if (vref && strlen(vref) > 0) {
      currentKey = String(vref);
    } else {
      currentKey = String(slot["line"] | "") + "|" + String(slot["dest"] | "");
    }
  }

  if (currentKey == prevKey) return;

  if (currentKey != "") {
    uint8_t r, g, b;
    parseHexColor(slot["color"] | "#ffffff", r, g, b);
    ledOn(r, g, b);

    soundOn();
    soundStartedAt = millis();
    soundActive    = true;

    Serial.println("TUBE " + String(TUBE_NUM) + " ON: "
                   + String(slot["line"] | "?")
                   + " dest=" + String(slot["dest"] | "?")
                   + " key=" + currentKey);
  } else {
    ledOff();
    soundOff();
    soundActive = false;
    Serial.println("TUBE " + String(TUBE_NUM) + " OFF");
  }

  prevKey = currentKey;
}
