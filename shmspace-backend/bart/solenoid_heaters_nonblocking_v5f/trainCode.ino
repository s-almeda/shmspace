/*
 * Train polling — ported from 20260318d_tube_esp32_usedForShow
 *
 * Connects to wifi (see NETWORKS in secrets.h), then every 5s polls:
 *   GET https://art.shmuh.co/api/bart/tube/tube_arrivals
 *
 * Example response:
 *   {
 *     "tubes": [
 *       { "id": "1842199", "line": "Yellow-N", "dest": "Antioch",   "vehicleRef": "1842199", "color": "#ffd700", "minutesUntil": 3 },
 *       null,
 *       { "id": "1842310", "line": "Blue-S",   "dest": "Daly City", "vehicleRef": "1842310", "color": "#4a9eff", "minutesUntil": 5 },
 *       null
 *     ],
 *     "fetchedAt": "...",
 *     "testMode": false
 *   }
 *
 * 4 slots, each null or a train that's in the Transbay Tube right now.
 * Only "id" and "line" are used.
 * When a new id shows up in a slot, the heater for that train's LINE gets a
 * normal timed, non-blocking run (same startXHeater() functions the buttons use).
 * Slot numbers don't mean anything anymore (v5d):
 *   "Red-*"    -> redHeater    (pin 5)
 *   "Yellow-*" -> yellowHeater (pin 4)
 *   "Green-*"  -> greenHeater  (pin 19)
 *   "Blue-*"   -> blueHeater   (pin 21)
 *   any other line is ignored
 */

// ── Config ────────────────────────────────────────────────────────────────────
const char* server = "art.shmuh.co";  // was art.snailbunny.site
const char* path   = "/api/bart/tube/tube_arrivals";

const unsigned long POLL_INTERVAL  = 5000;   // how often to check the server (ms)
const unsigned long WIFI_TIMEOUT   = 10000;  // max wait per network attempt (ms)
const unsigned long HTTP_TIMEOUT   = 5000;   // max wait for server response (ms)

// ── Known networks ────────────────────────────────────────────────────────────
// NETWORKS + NUM_NETWORKS now live in secrets.h (v5e)

// ── Network objects ───────────────────────────────────────────────────────────
WiFiClientSecure client;
Preferences prefs;

// ── State ─────────────────────────────────────────────────────────────────────
const int NUM_TUBES = 4;                  // 4 slots from the server (one per line)
String prevId[NUM_TUBES]  = {"", "", "", ""};  // last seen train id per slot
unsigned long lastPoll = 0;
bool firstPoll                  = true;  // on first poll, snapshot state without firing

// ── Keep-alive ────────────────────────────────────────────────────────────────
// Called from inside every wait loop below, so buttons still work and heaters
// still time OFF while we're waiting on wifi or the server.
// (transistors get hot - a heater must never get stuck on during a wait!!)
void keepHeatersAlive() {
  readButtons();
  updateHeaterTimers();
}

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
    keepHeatersAlive();  // was delay(250)
  }
  Serial.println("connected!");
  return true;
}

// Tries last-working SSID first (stored in flash), then NETWORKS in order. Blocks until connected
// (but buttons + heater timers keep running the whole time).
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
    unsigned long pause = millis();
    while (millis() - pause < 2000) keepHeatersAlive();  // was delay(2000)
  }
}

// ── Setup / Loop hooks (called from setup() and loop() in the main tab) ──────
void trainSetup() {
  client.setInsecure();  // skip TLS cert verification (server uses self-signed cert)
  connectWifi();
  Serial.println("IP: " + WiFi.localIP().toString());

  poll();  // poll immediately on boot rather than waiting POLL_INTERVAL
}

void trainLoop() {
  // Reconnect if WiFi dropped mid-session (buttons + heater timers keep running while it retries)
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

// ── TUBE ACTIVATION ───────────────────────────────────────────────────────────
// Picks the heater by the train's line (e.g. "Yellow-N" - the -N/-S is just
// direction, so only the prefix is checked). Skips it if that heater is
// already running, so a back-to-back train can't stretch the on-time past its limit.
// Returns false for any other line (ignored).
bool activateTube(const char* line) {
  if (strncmp(line, "Red", 3) == 0) {
    if (!redHeaterActive) startRedHeater();        // pin 5
  } else if (strncmp(line, "Yellow", 6) == 0) {
    if (!yellowHeaterActive) startYellowHeater();  // pin 4
  } else if (strncmp(line, "Green", 5) == 0) {
    if (!greenHeaterActive) startGreenHeater();    // pin 19
  } else if (strncmp(line, "Blue", 4) == 0) {
    if (!blueHeaterActive) startBlueHeater();      // pin 21
  } else {
    return false;
  }
  return true;
}

// Server sends the id ready-made now (v5d) - "" = empty slot
String trainId(JsonVariant slot) {
  return slot.isNull() ? "" : String(slot["id"] | "");
}

// ── Poll ──────────────────────────────────────────────────────────────────────
// Fetches /api/bart/tube/tube_arrivals and checks all NUM_TUBES (4) slots.
// Response shape: { "tubes": [ {train} | null, {train} | null, {train} | null, {train} | null ], "fetchedAt", "testMode" }
// Each train object: { "id", "line", "dest", "vehicleRef", "color", "minutesUntil" } - only id + line are used
void poll() {
  // *st* Serial.println("Polling...");

  if (!client.connect(server, 443, HTTP_TIMEOUT)) {
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
    if (millis() - timeout > HTTP_TIMEOUT) {
      Serial.println("Timeout — keeping current state");
      client.stop();
      return;
    }
    keepHeatersAlive();
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

  // *st* Serial.println(body);  // comment out for less to read while waiting for tube activations

  // Parse JSON
  StaticJsonDocument<1536> doc;  // was 1024 - all 4 slots full needs ~850 bytes
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.print("JSON parse failed (");
    Serial.print(err.c_str());  // "NoMemory" = buffer too small
    Serial.println(") — keeping current state");
    return;
  }
  // *st* Serial.println(doc.memoryUsage());  // actual bytes used - uncomment to check headroom

  // On first poll, silently record current state — don't fire heaters for trains already in tube
  if (firstPoll) {
    firstPoll = false;
    for (int i = 0; i < NUM_TUBES; i++) {
      prevId[i] = trainId(doc["tubes"][i]);
      if (prevId[i] != "") Serial.println("SLOT " + String(i) + " startup (no fire): id=" + prevId[i]);
    }
    return;
  }

  // Check all slots
  for (int i = 0; i < NUM_TUBES; i++) {
    JsonVariant slot = doc["tubes"][i];
    String currentId = trainId(slot);

    if (currentId == prevId[i]) continue;  // no change in this slot
    prevId[i] = currentId;

    if (currentId != "") {
      // New train entered the tube — start the heater for its line (LEDs follow via updateLEDs())
      const char* line = slot["line"] | "";
      Serial.print("SLOT " + String(i) + ": " + String(line) + " id=" + currentId);
      if (activateTube(line)) Serial.println(" - fired");
      else                    Serial.println(" - unknown line, ignored");
    } else {
      // Slot cleared — heater turns itself off via updateHeaterTimers()
      Serial.println("SLOT " + String(i) + " cleared");
    }
  }
}
// hi shm!
