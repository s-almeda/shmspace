#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>

// ── Per-device config ─────────────────────────────────────────────────────────
const int TUBE_NUM = 0;  // Change to 1 or 2 on the other two devices

const char* ssid   = "shmzone";
const char* pass   = "hopper&anya";
const char* server = "art.snailbunny.site";
const char* path   = "/api/bart/tube/tube_arrivals";

const unsigned long POLL_INTERVAL = 5000;

// ── Hardware ──────────────────────────────────────────────────────────────────
WiFiClientSecure client;
Adafruit_NeoPixel pixel(1, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);

// ── State ─────────────────────────────────────────────────────────────────────
String prevKey = "";        // key of the train currently lighting this tube, or "" if off
unsigned long lastPoll = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Parse a CSS hex color string like "#ffd700" into R, G, B bytes
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

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pixel.begin();
  pixel.setBrightness(50);
  ledOff();

  client.setInsecure();
  WiFi.begin(ssid, pass);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nConnected: " + WiFi.localIP().toString());

  poll();
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  if (millis() - lastPoll >= POLL_INTERVAL) {
    lastPoll = millis();
    poll();
  }
}

// ── Poll ──────────────────────────────────────────────────────────────────────
void poll() {
  Serial.println("Polling...");

  if (!client.connect(server, 443)) {
    Serial.println("Connection failed");
    return;  // keep whatever state we have — don't flicker the LED on network errors
  }

  client.print("GET "); client.print(path); client.println(" HTTP/1.1");
  client.print("Host: "); client.println(server);
  client.println("Connection: close");
  client.println();

  unsigned long timeout = millis();
  while (client.available() == 0) {
    if (millis() - timeout > 5000) {
      Serial.println("Timeout");
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

  // Parse JSON — response is: { "tubes": [obj|null, obj|null, obj|null], ... }
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, body)) {
    Serial.println("JSON parse failed");
    return;
  }

  // Our slot — could be a train object or JSON null
  JsonVariant slot = doc["tubes"][TUBE_NUM];

  // Build a stable key for this slot's current occupant.
  // vehicleRef (e.g. "1106") is preferred. Falls back to "line|dest".
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

  // Act only on changes
  if (currentKey == prevKey) return;

  if (currentKey != "") {
    // New train entered this tube (or an older train was evicted and replaced)
    uint8_t r, g, b;
    parseHexColor(slot["color"] | "#ffffff", r, g, b);
    ledOn(r, g, b);
    Serial.println("TUBE " + String(TUBE_NUM) + " ON: " + String(slot["line"] | "?") + " #" + currentKey);

    // Trigger tube sound — uncomment when wired:
    // analogWrite(4, 255);
    // analogWrite(5, 255);
    // analogWrite(19, 255);
  } else {
    // Slot is now empty — train has exited the tube
    ledOff();
    Serial.println("TUBE " + String(TUBE_NUM) + " OFF");

    // analogWrite(4, 0);
    // analogWrite(5, 0);
    // analogWrite(19, 0);
  }

  prevKey = currentKey;
}
