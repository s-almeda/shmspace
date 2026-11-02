# ESP32 changes for the 4-tube sculpture

The server now supports 4 tubes, one per line (Red, Yellow, Green, Blue). These are the changes `tube_esp32.ino` needs.

## Polling

Same as before: `GET https://art.shmuh.co/api/bart/tube/tube_arrivals` every 5s (`art.snailbunny.site` still points to the same server, so either works) with `client.setInsecure()`. If a request fails, keep the current state and try again next poll.

## Response

```json
{
  "tubes": [
    { "id": "1842199", "line": "Yellow-N", "dest": "Antioch", "vehicleRef": "1842199", "color": "#ffd700", "minutesUntil": 3 },
    null,
    { "id": "1842310", "line": "Blue-S", "dest": "Daly City", "vehicleRef": "1842310", "color": "#4a9eff", "minutesUntil": 5 },
    null
  ],
  "fetchedAt": "...",
  "testMode": false
}
```

There are now 4 slots instead of 3. Each slot is either `null` or a train that's in the Transbay Tube right now. Each train also has a new `id` field. You only need `id` and `line`.

## 1. JSON buffer size

```cpp
StaticJsonDocument<1024> doc;   →   StaticJsonDocument<1536> doc;
```

With all 4 slots full, the response needs about 850 bytes, which is close to 1024. If it doesn't fit, parsing fails and nothing fires, so bump it for some headroom. To check how much it actually uses:

```cpp
DeserializationError err = deserializeJson(doc, body);
if (err) { Serial.println(err.c_str()); return; }   // prints "NoMemory" if too small
Serial.println(doc.memoryUsage());                   // actual bytes used
```

(If you're on ArduinoJson 7, use `JsonDocument doc;` instead. It sizes itself, so you can skip this step.)

## 2. Track 4 slots instead of 3

```cpp
String prevKey[3] = {"", "", ""};   →   String prevId[4] = {"", "", "", ""};
for (int i = 0; i < 3; i++)         →   for (int i = 0; i < 4; i++)    // both loops
```

With `i < 3`, a train in the 4th slot never gets seen.

## 3. Use `id` instead of building a key

```cpp
// before
const char* vref = slot["vehicleRef"];
currentKey = (vref && strlen(vref) > 0)
  ? String(vref)
  : String(slot["line"] | "") + "|" + String(slot["dest"] | "");

// after
String currentId = slot.isNull() ? "" : String(slot["id"] | "");
```

The server sends the ID ready-made now. The rest of the logic stays the same:

- if a slot's `id` changes to something new and non-empty, a train just entered the tube, so fire once
- on the first poll after boot, just record the IDs and don't fire, so a reboot doesn't replay trains already in the tube

## 4. Pick the tube by line, not slot number

```cpp
// before
if (i == 0) activateTube0();
else if (i == 1) activateTube1();
else activateTube2();

// after (swap the tube numbers to match which physical tube is which color)
const char* line = slot["line"] | "";
if      (strncmp(line, "Red",    3) == 0) activateTube0();
else if (strncmp(line, "Yellow", 6) == 0) activateTube1();
else if (strncmp(line, "Green",  5) == 0) activateTube2();
else if (strncmp(line, "Blue",   4) == 0) activateTube3();
```

Slot numbers don't mean anything anymore. `line` looks like `"Yellow-N"`, where `-N`/`-S` is the direction. Ignore any other line. This is the same prefix check `lineColor()` already does.

## 5. Add the 4th tube

Add a `tube3` pin, set it up in `setup()` like the others (`pinMode` + `analogWrite(..., 0)`), and write an `activateTube3()` with its heater time.

## Things to decide

- **Two new trains in the same poll** (like Red and Blue): both should fire. With the current `delay()` sequences they'll play one after the other, and polling pauses while they run. If you want them heating at the same time, you'd need to switch to `millis()` timers.
- **Same line twice in a row**: at rush hour two Yellows can come through 2-3 min apart. Should the tube fire again, or skip if it hasn't cooled down?

## Please send back

The 4 heater pins and each tube's on/off timing, so we can match the website animation to the hardware.
