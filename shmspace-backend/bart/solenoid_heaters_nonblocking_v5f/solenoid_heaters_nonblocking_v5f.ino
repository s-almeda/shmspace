// testing solenoid PCB for tiat time project
// -- now with non-blocking, timed heater activation --
// -- v4c3: polls the server for trains entering a tube (see trainCode.ino) --

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "secrets.h"  // wifi credentials (NETWORKS) - v5e

//onboard neopixel
#define PIN1 0        // pin 0 connected to the neoPIxel
#define NUMPIXELS1 1  // 1 neopixel on this Feather

Adafruit_NeoPixel pixels1(NUMPIXELS1, PIN1, NEO_GRB + NEO_KHZ800);

// external neopixel
#define PIN2 14       // pin 0 connected to the neoPIxel
#define NUMPIXELS2 1  // 1 neopixel on this Feather

Adafruit_NeoPixel pixels2(NUMPIXELS2, PIN2, NEO_GRB + NEO_KHZ800);

int yellowHeater = 4;  //heater 1 on pin 4 (A5)
int redHeater = 5;     //heater 2 on pin 5 (SCK)
int greenHeater = 19;  //heater 3 on pin 19 (MOSI)
int blueHeater = 21;   //heater 4 on pin 21 (MISO)

int redSwitch = A2;
int yellowSwitch = A3;
int greenSwitch = 33;
int blueSwitch = 32;

int redStatus = 1;
int yellowStatus = 1;
int greenStatus = 1;
int blueStatus = 1;

int oldRedStatus = 1;
int oldYellowStatus = 1;
int oldGreenStatus = 1;
int oldBlueStatus = 1;

int redStart = 0;
int yellowStart = 0;
int greenStart = 0;
int blueStart = 0;
int redStop = 0;
int yellowStop = 0;
int greenStop = 0;
int blueStop = 0;
int redTime = 0;
int yellowTime = 0;
int greenTime = 0;
int blueTime = 0;

int delayVal = 250;  // Time (in milliseconds) to pause between pixels
int choice = 0;

// ================= NON-BLOCKING HEATER TIMERS =================
// "on-time" variables for each heater - edit these to whatever duration
// each heater should stay on for, in milliseconds.
// -> currently set to slightly longer than needed to make the tube sound
//    but transistors get quite hot -> so don't run them longer!!
//    9/20/26 -> adding extra time because beefed up traces and/or new heatsinks seem to reduce the heat a little
unsigned long redHeaterOnTime = 5998 + 2500;     // 5998 - 5.998 sec
unsigned long yellowHeaterOnTime = 6329 + 2500;  // 6329 - 6.329 sec. 
unsigned long greenHeaterOnTime = 9123 + 2000;   // 9123 - 9.123 sec.  
unsigned long blueHeaterOnTime = 6958 + 2000;    // 6958 - 6.958 sec

// Internal state - tracks whether each heater's timed run is active,
// and when it started. You shouldn't need to touch these.
bool redHeaterActive = false;
bool yellowHeaterActive = false;
bool greenHeaterActive = false;
bool blueHeaterActive = false;

unsigned long redHeaterStartMillis = 0;
unsigned long yellowHeaterStartMillis = 0;
unsigned long greenHeaterStartMillis = 0;
unsigned long blueHeaterStartMillis = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("Tubes V2 code v5f - added CCA network - 10/30/26");

  pixels1.begin();             // INITIALIZE NeoPixel strip object (REQUIRED)
  pixels1.setBrightness(50);   // set brightness of onboard LED
  pixels1.clear();             // Set all pixel colors to 'off'
  pixels2.begin();             
  pixels2.setBrightness(255);  // set brightness of external LED
  pixels2.clear();             

  pinMode(redHeater, OUTPUT);
  pinMode(yellowHeater, OUTPUT);
  pinMode(greenHeater, OUTPUT);
  pinMode(blueHeater, OUTPUT);

  pinMode(redSwitch, INPUT);  // A2 does not have an internal pullup
  pinMode(yellowSwitch, INPUT); // A3 does not have an internal pullup
  pinMode(greenSwitch, INPUT_PULLUP);
  pinMode(blueSwitch, INPUT_PULLUP);

  trainSetup();  // connect wifi + first poll (see trainCode.ino)
}

void loop() {
  readButtons();
  updateHeaterTimers();       // must be called every loop, with nothing blocking above it

  trainLoop();                // wifi check + poll server every POLL_INTERVAL (see trainCode.ino)
}

// ================= BUTTON READING (calls the timed start/stop functions) =================
void readButtons() {
  // RED =========================================================================================
  redStatus = digitalRead(redSwitch);
  if (redStatus != oldRedStatus) {
    if (redStatus == LOW) {
      Serial.print("red ON - ");
      startRedHeater();  // kicks off a timed, non-blocking run
      redStart = millis();
    }
    if (redStatus == HIGH) {
      Serial.print("\t red OFF - ");
      stopRedHeater();  // early cutoff - button released before onTime elapsed
      redStop = millis();
      redTime = redStop - redStart;
      Serial.print("\t redTime: ");
      Serial.println(redTime);
    }
    oldRedStatus = redStatus;
  }

  // YELLOW =========================================================================================
  yellowStatus = digitalRead(yellowSwitch);
  if (yellowStatus != oldYellowStatus) {
    if (yellowStatus == LOW) {
      Serial.print("yellow ON - ");
      startYellowHeater();
      yellowStart = millis();
    }
    if (yellowStatus == HIGH) {
      Serial.print("\t yellow OFF");
      stopYellowHeater();  // early cutoff - button released before onTime elapsed
      yellowStop = millis();
      yellowTime = yellowStop - yellowStart;
      Serial.print("\t yellowTime: ");
      Serial.println(yellowTime);
    }
    oldYellowStatus = yellowStatus;
  }

  // GREEN =========================================================================================
  greenStatus = digitalRead(greenSwitch);
  if (greenStatus != oldGreenStatus) {
    if (greenStatus == LOW) {
      Serial.print("green ON - ");
      startGreenHeater();
      greenStart = millis();
    }
    if (greenStatus == HIGH) {
      Serial.print("\t green OFF - ");
      stopGreenHeater();  // early cutoff - button released before onTime elapsed
      greenStop = millis();
      greenTime = greenStop - greenStart;
      Serial.print("\t greenTime: ");
      Serial.println(greenTime);
    }
    oldGreenStatus = greenStatus;
  }

  // BLUE =========================================================================================
  blueStatus = digitalRead(blueSwitch);
  if (blueStatus != oldBlueStatus) {
    if (blueStatus == LOW) {
      Serial.print("blue ON - ");
      startBlueHeater();
      blueStart = millis();
    }
    if (blueStatus == HIGH) {
      Serial.print("blue OFF - ");
      stopBlueHeater();  // early cutoff - button released before onTime elapsed
      blueStop = millis();
      blueTime = blueStop - blueStart;
      Serial.print("\t blueTime: ");
      Serial.println(blueTime);
    }
    oldBlueStatus = blueStatus;
  }
}

// ================= START FUNCTIONS =================
// Call one of these to begin a timed heater run. Each turns the
// heater on, stamps the start time, and updates the LEDs to match
// (does NOT wait or block).
void startRedHeater() {
  digitalWrite(redHeater, HIGH);
  redHeaterStartMillis = millis();
  redHeaterActive = true;
  updateLEDs();
}

void startYellowHeater() {
  digitalWrite(yellowHeater, HIGH);
  yellowHeaterStartMillis = millis();
  yellowHeaterActive = true;
  updateLEDs();
}

void startGreenHeater() {
  digitalWrite(greenHeater, HIGH);
  greenHeaterStartMillis = millis();
  greenHeaterActive = true;
  updateLEDs();
}

void startBlueHeater() {
  digitalWrite(blueHeater, HIGH);
  blueHeaterStartMillis = millis();
  blueHeaterActive = true;
  updateLEDs();
}

// ================= STOP FUNCTIONS (early cutoff) =================
// Call one of these to cut a heater off immediately, before its onTime
// has elapsed - e.g. when the button is released early. Safe to call
// even if the heater isn't active (it just does nothing extra).
void stopRedHeater() {
  digitalWrite(redHeater, LOW);
  redHeaterActive = false;
  updateLEDs();
}

void stopYellowHeater() {
  digitalWrite(yellowHeater, LOW);
  yellowHeaterActive = false;
  updateLEDs();
}

void stopGreenHeater() {
  digitalWrite(greenHeater, LOW);
  greenHeaterActive = false;
  updateLEDs();
}

void stopBlueHeater() {
  digitalWrite(blueHeater, LOW);
  blueHeaterActive = false;
  updateLEDs();
}

// ================= UPDATE FUNCTION (call every loop) =================
// Checks elapsed time for each active heater and turns it off once its
// predefined on-time has passed. No delay() anywhere, so buttons/other
// code keep running while a heater is timing out.
void updateHeaterTimers() {
  if (redHeaterActive && (millis() - redHeaterStartMillis >= redHeaterOnTime)) {
    digitalWrite(redHeater, LOW);
    redHeaterActive = false;
    updateLEDs();
    Serial.println("red heater timed off");
  }

  if (yellowHeaterActive && (millis() - yellowHeaterStartMillis >= yellowHeaterOnTime)) {
    digitalWrite(yellowHeater, LOW);
    yellowHeaterActive = false;
    updateLEDs();
    Serial.println("yellow heater timed off");
  }

  if (greenHeaterActive && (millis() - greenHeaterStartMillis >= greenHeaterOnTime)) {
    digitalWrite(greenHeater, LOW);
    greenHeaterActive = false;
    updateLEDs();
    Serial.println("green heater timed off");
  }

  if (blueHeaterActive && (millis() - blueHeaterStartMillis >= blueHeaterOnTime)) {
    digitalWrite(blueHeater, LOW);
    blueHeaterActive = false;
    updateLEDs();
    Serial.println("blue heater timed off");
  }
}
