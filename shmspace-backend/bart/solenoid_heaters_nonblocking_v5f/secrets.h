// secrets.h — wifi credentials (keep this file out of git / don't share it!)
// Tries networks in order; the last one that worked is remembered in flash.
#pragma once

typedef struct { const char* ssid; const char* pass; } WifiCred;

const WifiCred NETWORKS[] = {
  { "tiat-guest",   "artandtechnology" },
  { "Berkeley-IoT", "Hopper12!"        },
  { "shmzone",      "hopper&anya"      },
  { "SparkleMotion2",  "SparkleMotion" },
  { "CCA", "" },
};
const int NUM_NETWORKS = sizeof(NETWORKS) / sizeof(NETWORKS[0]);
