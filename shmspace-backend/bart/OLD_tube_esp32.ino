/*
 * Transbay Tube — ESP32 control code!
 *
 * This is the code for one of three identical ESP32s in a sound sculpture, each should be flashed with a
 * different TUBE_NUM (0, 1, or 2). 
 * First, it tries to connect to wifi (see NETWORKS array) and remembers the last-working network in flash for faster reconnects.
 * Then, once we're connected to wifi.....
 * Every 5s, polls:
 *   GET https://art.snailbunny.site/api/bart/tube/tube_arrivals
 * which returns a 3-slot array of real BART trains inside the Transbay Tube.
 *
 * Example response:
 *   {
 *     "tubes": [
 *       { "line": "Yellow-N", "dest": "Antioch", "vehicleRef": "1842199", "color": "#ffd700", "minutesUntil": 3 },
 *       { "line": "Green-S",  "dest": "Daly City", "vehicleRef": "1842097", "color": "#44ff88", "minutesUntil": 6 },
 *       null
 *     ]
 *   }
 * The device with (TUBE_NUM=0) would light up yellow. TUBE_NUM=1 would light green. TUBE_NUM=2 stays off.
 *
 * This device watches tubes[TUBE_NUM] only:
 *   new train  → NeoPixel on in line color, sound on for 3s, LED stays on
 *   same train → nothing (LED stays on for the full ~7-min transit)
 *   slot empty → LED off, sound off
 *
 * TO DO (hi sudhu): uncomment / rewrite analogWrite lines in soundOn()/soundOff() below.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ── Per-device config ─────────────────────────────────────────────────────────
const int TUBE_NUM = 0;  // CHANGE to 1 or 2 on the other two devices

const char* server = "art.snailbunny.site";
const char* path   = "/api/bart/tube/tube_arrivals";

const unsigned long POLL_INTERVAL  = 5000;   // how often to check the server (ms)
const unsigned long SOUND_DURATION = 3000;   // how long the tube sound plays (ms)
const unsigned long WIFI_TIMEOUT   = 10000;  // max wait per network attempt (ms)

// ── Known networks (tries in order, remembers the winner in flash) ────────────
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
String prevKey = "";          // journey ID of train in this slot ("" = empty)
unsigned long lastPoll       = 0;
unsigned long soundStartedAt = 0;
bool soundActive             = false;

// ── WiFi helpers ──────────────────────────────────────────────────────────────

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

// Tries last-working SSID first (stored in flash), then NETWORKS in order. Blocks until connected.
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
        if (tryConnect(NETWORKS[i].ssid, NETWORKS[i].pass)) return;
        break;
      }
    }
    Serial.println("Last-known network unavailable, falling back to default order...");
  }

  // Try remaining networks in order
  for (int i = 0; i < NUM_NETWORKS; i++) {
    if (lastSsid == NETWORKS[i].ssid) continue;  // already tried above
    if (tryConnect(NETWORKS[i].ssid, NETWORKS[i].pass)) {
      prefs.begin("wifi", false);
      prefs.putString("last_ssid", NETWORKS[i].ssid);
      prefs.end();
      Serial.printf("Saved \"%s\" as last-working network\n", NETWORKS[i].ssid);
      return;
    }
  }

  // All networks failed — retry indefinitely
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

// ── LED helpers ───────────────────────────────────────────────────────────────

// Map BART line name (e.g. "Yellow-N") to a pure RGB color.
// Uses only the prefix before the dash.
void lineColor(const char* line, uint8_t &r, uint8_t &g, uint8_t &b) {
  if      (strncmp(line, "Yellow", 6) == 0) { r=255; g=200; b=0;   }
  else if (strncmp(line, "Blue",   4) == 0) { r=0;   g=0;   b=255; }
  else if (strncmp(line, "Red",    3) == 0) { r=255; g=0;   b=0;   }
  else if (strncmp(line, "Green",  5) == 0) { r=0;   g=255; b=0;   }
  else if (strncmp(line, "Orange", 6) == 0) { r=255; g=80;  b=0;   }
  else                                       { r=255; g=255; b=255; }  // unknown → white
}

void ledOn(uint8_t r, uint8_t g, uint8_t b) {
  pixel.setPixelColor(0, pixel.Color(r, g, b));
  pixel.show();
}

void ledOff() {
  pixel.setPixelColor(0, 0);
  pixel.show();
}

// ── Tube activation ───────────────────────────────────────────────────────────
// soundOn() is called when a train enters this tube.
// soundOff() is called automatically after SOUND_DURATION ms (non-blocking).
// Also called on tube exit in case the sound needs to cut short.
//
// TODO: uncomment the analogWrite lines once the tube hardware is wired.
//       Pins 4, 5, 19 → set to 255 to activate, 0 to deactivate.

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

  client.setInsecure();  // skip TLS cert verification (server uses self-signed cert)
  connectWifi();
  Serial.println("IP: " + WiFi.localIP().toString());

  poll();  // poll immediately on boot rather than waiting POLL_INTERVAL
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  // Non-blocking sound timer: cut off sound after SOUND_DURATION ms
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

  // Poll the server every POLL_INTERVAL ms
  if (millis() - lastPoll >= POLL_INTERVAL) {
    lastPoll = millis();
    poll();
  }
}

// ── Poll ──────────────────────────────────────────────────────────────────────
// Fetches /api/bart/tube/tube_arrivals and checks tubes[TUBE_NUM].
// Response shape: { "tubes": [ {train} | null, {train} | null, {train} | null ] }
// Each train object: { "line", "dest", "vehicleRef", "color", "minutesUntil" }
void poll() {
  Serial.println("Polling...");

  if (!client.connect(server, 443)) {
    Serial.println("Connection failed — keeping current state");
    return;  // don't flicker the LED on network errors
  }

  client.print("GET "); client.print(path); client.println(" HTTP/1.1");
  client.print("Host: "); client.println(server);
  client.println("Connection: close");
  client.println();

  // Wait for response
  unsigned long timeout = millis();
  while (client.available() == 0) {
    if (millis() - timeout > 5000) {
      Serial.println("Timeout — keeping current state");
      client.stop();
      return;
    }
  }

  // Skip HTTP headers (read until blank line)
  while (client.available()) {
    String line = client.readStringUntil('\n');
    if (line == "\r") break;
  }

  // Read JSON body
  String body = "";
  while (client.available()) body += (char)client.read();
  client.stop();

  Serial.println(body);

  // Parse JSON
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, body)) {
    Serial.println("JSON parse failed — keeping current state");
    return;
  }

  // Read this device's assigned slot
  JsonVariant slot = doc["tubes"][TUBE_NUM];

  // Build a stable key for the current occupant of this slot.
  // vehicleRef is a journey ID like "1842199" — unique per train run.
  // Falls back to "line|dest" if somehow missing.
  // Empty string means the slot is unoccupied.
  String currentKey = "";
  if (!slot.isNull()) {
    const char* vref = slot["vehicleRef"];
    if (vref && strlen(vref) > 0) {
      currentKey = String(vref);
    } else {
      currentKey = String(slot["line"] | "") + "|" + String(slot["dest"] | "");
    }
  }

  // Only act on changes — if the same train is still in the slot, do nothing
  if (currentKey == prevKey) return;

  if (currentKey != "") {
    // A new train has entered this tube (or replaced the previous one).
    // Light the LED in the train's line color and trigger the tube sound.
    uint8_t r, g, b;
    lineColor(slot["line"] | "", r, g, b);
    ledOn(r, g, b);  // LED stays on until the train exits (~7 min)

    // ── ACTIVATE TUBE SOUND HERE ──────────────────────────────────────────────
    soundOn();          // triggers pins 4, 5, 19 (uncomment lines in soundOn())
    soundStartedAt = millis();
    soundActive    = true;
    // soundOff() is called automatically after SOUND_DURATION ms in loop()
    // ─────────────────────────────────────────────────────────────────────────

    Serial.println("TUBE " + String(TUBE_NUM) + " ON: "
                   + String(slot["line"] | "?")
                   + " dest=" + String(slot["dest"] | "?")
                   + " key=" + currentKey);
  } else {
    // Slot is now empty — the train has exited the tube.
    // Turn off the LED and silence the sound immediately.
    ledOff();

    // ── DEACTIVATE TUBE HERE ──────────────────────────────────────────────────
    soundOff();
    soundActive = false;
    // ─────────────────────────────────────────────────────────────────────────

    Serial.println("TUBE " + String(TUBE_NUM) + " OFF");
  }

  prevKey = currentKey;
}
