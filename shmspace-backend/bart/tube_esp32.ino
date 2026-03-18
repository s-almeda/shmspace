/*
 * Transbay Tube — ESP32 control code!
 *
 * One ESP32 controls all 3 physical tubes (heaters on pins 4, 5, 19) and one NeoPixel LED.
 * Connects to wifi (see NETWORKS), then every 5s polls:
 *   GET https://art.snailbunny.site/api/bart/tube/tube_arrivals
 *
 * Example response:
 *   {
 *     "tubes": [
 *       { "line": "Yellow-N", "dest": "Antioch",   "vehicleRef": "1842199", "color": "#ffd700", "minutesUntil": 3 },
 *       { "line": "Green-S",  "dest": "Daly City", "vehicleRef": "1842097", "color": "#44ff88", "minutesUntil": 6 },
 *       null
 *     ]
 *   }
 *
  */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ── Config ────────────────────────────────────────────────────────────────────
const char* server = "art.snailbunny.site";
const char* path   = "/api/bart/tube/tube_arrivals";

const unsigned long POLL_INTERVAL  = 5000;   // how often to check the server (ms)
const unsigned long WIFI_TIMEOUT   = 10000;  // max wait per network attempt (ms)

const int SOUND_PINS[3] = {4, 5, 19};  // solenoid driver pins: tube 0, 1, 2

// ── Known networks (tries in order, remembers the winner in flash) ────────────
typedef struct { const char* ssid; const char* pass; } WifiCred;

const WifiCred NETWORKS[] = {
  { "tiat-guest",   "artandtechnology" },
  { "Berkeley-IoT", "Hopper12!"        },
  { "shmzone",      "hopper&anya"      },
  { "SparkleMotion2",  "SparkleMotion" },
};
const int NUM_NETWORKS = sizeof(NETWORKS) / sizeof(NETWORKS[0]);

// ── Hardware ──────────────────────────────────────────────────────────────────
WiFiClientSecure client;
Adafruit_NeoPixel pixel(1, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
Preferences prefs;

// ── State ─────────────────────────────────────────────────────────────────────
String prevKey[3]  = {"", "", ""};  // last seen train key per slot
unsigned long lastPoll = 0;
bool firstPoll                  = true;  // on first poll, snapshot state without firing

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

// ── TUBE ACTIVATION CODE!! ───────────────────────────────────────────────────────────
void soundOn(int i)  { analogWrite(SOUND_PINS[i], 255); }
void soundOff(int i) { analogWrite(SOUND_PINS[i], 0);   }

void activateTube0() {
  soundOn(0);
  // heater sequence code for tube0 !!!
      Serial.print("1 - red - 5.5sec"); 
      analogWrite(redPin, 255);
      delay(5500);  // not longer than 5sec...(!)
      analogWrite(redPin, 0); 
      delay(500); 
      analogWrite(redPin, 255); Serial.print(" - pulse"); 
      delay(500); 
      analogWrite(redPin, 0);
      delay(500); 
      analogWrite(redPin, 255); Serial.print(" - pulse"); 
      delay(700); 
      analogWrite(redPin, 0);
      Serial.println("\t OFF - cooldown time");
  soundOff(0);
  ledOff();
}
void activateTube1() {
  soundOn(1);
  // heater sequence code for tube1 !!!
      Serial.print("2 - yellow - 7.5sec");
      analogWrite(yellowPin, 255);
      delay(7500);
      analogWrite(yellowPin, 0);
      delay(500);
      analogWrite(yellowPin, 255); Serial.print(" - pulse"); 
      delay(500);
      analogWrite(yellowPin, 0);
      Serial.println("\t OFF - cooldown time");
  soundOff(1);
  ledOff();
}
void activateTube2() {
  soundOn(2);
  // heater sequence code for tube2 !!!
       Serial.print("3 - green - 9sec");
      analogWrite(greenPin, 255);
      delay(9000);
      analogWrite(greenPin, 0);
      delay(500);
      analogWrite(greenPin, 255); Serial.print(" - pulse"); 
      delay(500);
      analogWrite(greenPin, 0);
      delay(500);
      analogWrite(greenPin, 255); Serial.print(" - pulse"); 
      delay(700);
      analogWrite(greenPin, 0);
      Serial.println("\t OFF - cooldown time");
  soundOff(2);
  ledOff();
}
// hi sudhu

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pixel.begin();
  pixel.setBrightness(50);
  ledOff();
  for (int i = 0; i < 3; i++) { pinMode(SOUND_PINS[i], OUTPUT); soundOff(i); }

  client.setInsecure();  // skip TLS cert verification (server uses self-signed cert)
  connectWifi();
  Serial.println("IP: " + WiFi.localIP().toString());

  poll();  // poll immediately on boot rather than waiting POLL_INTERVAL
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
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
// Fetches /api/bart/tube/tube_arrivals and checks all 3 slots.
// Response shape: { "tubes": [ {train} | null, {train} | null, {train} | null ] }
// Each train object: { "line", "dest", "vehicleRef", "color", "minutesUntil" }
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

  // On first poll, silently record current state — don't fire solenoids for trains already in tube
  if (firstPoll) {
    firstPoll = false;
    for (int i = 0; i < 3; i++) {
      JsonVariant slot = doc["tubes"][i];
      if (!slot.isNull()) {
        const char* vref = slot["vehicleRef"];
        prevKey[i] = (vref && strlen(vref) > 0)
          ? String(vref)
          : String(slot["line"] | "") + "|" + String(slot["dest"] | "");
        Serial.println("TUBE " + String(i) + " startup (no fire): key=" + prevKey[i]);
      }
    }
    return;
  }

  // Check all 3 slots
  for (int i = 0; i < 3; i++) {
    JsonVariant slot = doc["tubes"][i];

    // Build stable key: vehicleRef (journey ID) or "line|dest" fallback; "" = empty
    String currentKey = "";
    if (!slot.isNull()) {
      const char* vref = slot["vehicleRef"];
      currentKey = (vref && strlen(vref) > 0)
        ? String(vref)
        : String(slot["line"] | "") + "|" + String(slot["dest"] | "");
    }

    if (currentKey == prevKey[i]) continue;  // no change in this slot
    prevKey[i] = currentKey;

    if (currentKey != "") {
      // New train in slot i — activate solenoid and LED
      uint8_t r, g, b;
      lineColor(slot["line"] | "", r, g, b);
      ledOn(r, g, b); 
      // activate the correct tube based on the assigned slot number from server
      if      (i == 0) activateTube0();
      else if (i == 1) activateTube1();
      else             activateTube2();
      Serial.println("TUBE " + String(i) + " ON: "
                     + String(slot["line"] | "?")
                     + " dest=" + String(slot["dest"] | "?")
                     + " key=" + currentKey);
    } else {
      // Slot cleared — sound/LED managed by timer in loop()
      Serial.println("TUBE " + String(i) + " OFF");
    }
  }
}
