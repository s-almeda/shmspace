void led1Off(){
  pixels1.clear();
  pixels1.show();   // Send the updated pixel colors to the hardware.
}

// ================= LED <-> HEATER STATUS =================
// Each heater's base color, used when it's the only one active.
int redColorR = 255, redColorG = 0, redColorB = 0;
int yellowColorR = 255, yellowColorG = 200, yellowColorB = 0;
int greenColorR = 0, greenColorG = 255, greenColorB = 0;
int blueColorR = 0, blueColorG = 0, blueColorB = 255;

// Call this any time a heater's Active flag changes (start, stop, or
// timed off). Both LEDs always show the sum of every heater that's
// currently on - one heater shows its own color, two heaters at once
// mix their colors together, and no heaters active means LEDs off.
void updateLEDs() {
  int r = 0, g = 0, b = 0;

  if (redHeaterActive) {
    r += redColorR;
    g += redColorG;
    b += redColorB;
  }
  if (yellowHeaterActive) {
    r += yellowColorR;
    g += yellowColorG;
    b += yellowColorB;
  }
  if (greenHeaterActive) {
    r += greenColorR;
    g += greenColorG;
    b += greenColorB;
  }
  if (blueHeaterActive) {
    r += blueColorR;
    g += blueColorG;
    b += blueColorB;
  }

  r = min(r, 255);
  g = min(g, 255);
  b = min(b, 255);

  if (r == 0 && g == 0 && b == 0) {
    led1Off();
    led2Off();
  } else {
    pixels1.setPixelColor(0, r, g, b);
    pixels1.show();
    pixels2.setPixelColor(0, r, g, b);
    pixels2.show();
  }
}

void red1(){
  pixels1.setPixelColor(0, 255, 0, 0);    
  pixels1.show();   // Send the updated pixel colors to the hardware.
}

void yellow1(){
  pixels1.setPixelColor(0, 255, 200, 0);    
  pixels1.show();   // Send the updated pixel colors to the hardware.
}
void green1(){
  pixels1.setPixelColor(0, 0, 255, 0);    
  pixels1.show();   // Send the updated pixel colors to the hardware.
}
void blue1(){
  pixels1.setPixelColor(0, 0, 0, 255);    
  pixels1.show();   // Send the updated pixel colors to the hardware.
}
void newColor1(){
      //pixels.setPixelColor(i, pixels.Color(0, 150, 0));  // set pixel color most simple
    pixels1.setPixelColor(0, Wheel1(random(0, 255)));    // set pixel color using wheel to define color with a single value 0-255
    //pixels.setPixelColor(0, Wheel(pos));      // set pixel color using wheel to define color with a variable (myBPM)
    pixels1.show();   // Send the updated pixel colors to the hardware.
}

// NeoPixel single number -> color function =====================
  // Input a value 0 to 255 to get a color value.
    // The colours are a transition r - g - b - back to r.
    uint32_t Wheel1(byte WheelPos){
        WheelPos = 255 - WheelPos;
        if(WheelPos < 85){
            return pixels1.Color(255 - WheelPos * 3, 0, WheelPos * 3);
        }
        else if(WheelPos < 170){
            WheelPos -= 85;
            return pixels1.Color(0, WheelPos * 3, 255 - WheelPos * 3);
        }
        else{
            WheelPos -= 170;
            return pixels1.Color(WheelPos * 3, 255 - WheelPos * 3, 0);
        }
      }

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// LED2 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

void led2Off(){
    pixels2.clear();
    pixels2.show();   // Send the updated pixel colors to the hardware.
}

void red2(){
  pixels2.setPixelColor(0, 255, 0, 0);    
  pixels2.show();   // Send the updated pixel colors to the hardware.
}

void yellow2(){
  pixels2.setPixelColor(0, 255, 200, 0);    
  pixels2.show();   // Send the updated pixel colors to the hardware.
}
void green2(){
  pixels2.setPixelColor(0, 0, 255, 0);    
  pixels2.show();   // Send the updated pixel colors to the hardware.
}
void blue2(){
  pixels2.setPixelColor(0, 0, 0, 255);    
  pixels2.show();   // Send the updated pixel colors to the hardware.
}
void newColor2(){
      //pixels.setPixelColor(i, pixels.Color(0, 150, 0));  // set pixel color most simple
    pixels2.setPixelColor(0, Wheel2(random(0, 255)));    // set pixel color using wheel to define color with a single value 0-255
    //pixels.setPixelColor(0, Wheel(pos));      // set pixel color using wheel to define color with a variable (myBPM)
    pixels2.show();   // Send the updated pixel colors to the hardware.
}


// NeoPixel single number -> color function =====================
  // Input a value 0 to 255 to get a color value.
    // The colours are a transition r - g - b - back to r.
    uint32_t Wheel2(byte WheelPos){
        WheelPos = 255 - WheelPos;
        if(WheelPos < 85){
            return pixels2.Color(255 - WheelPos * 3, 0, WheelPos * 3);
        }
        else if(WheelPos < 170){
            WheelPos -= 85;
            return pixels2.Color(0, WheelPos * 3, 255 - WheelPos * 3);
        }
        else{
            WheelPos -= 170;
            return pixels2.Color(WheelPos * 3, 255 - WheelPos * 3, 0);
        }
      }

