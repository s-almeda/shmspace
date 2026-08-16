# puppet rig — README & dev notes

**shmuppetry 2.5.0** — a webcam puppet-show / presentation rig by shm garanganao almeda.
live at **shmuh.co/puppets**.

> this is the last major version of rig 1.x. it stays up as a working historical piece;
> **shmuppetry 3.0** is a ground-up rebuild in its own repo, and the
> [architecture notes](#architecture-notes--what-id-change-in-30) at the bottom are written
> as the brief for it.

the core client logic is one big file — [index.html](index.html) — plus a set of opt-in
**feature modules** under [js/features/](js/features/). server routes are in
[puppet_routes.js](puppet_routes.js) (mounted by the top-level `App.js`, **local only** —
see [deployment](#deployment--local-vs-prod)).

**making a new show? start at the [quickstart](#quickstart--make-a-new-show).**
**adding a capability? read [rigs & feature modules](#rigs--feature-modules).**
the rest is reference: **shortcuts**, the **scene-JSON schema**, **toggles**, **collections**,
**edit mode**, and [architecture notes for rig 3.0](#architecture-notes--what-id-change-in-30).

---

## the 60-second mental model

```
                        ┌─ index.html ────────────────────────────────────┐
  ?show= / ?rig=  ──▶   │  rig manifest → `enabled` Set of feature ids     │
                        │                                                 │
                        │  CORE (always compiled in, hidden if disabled)  │
                        │    face detect · facemesh · bbox · race/age/    │
                        │    gender/emotion · hand puppets · head puppets │
                        │    · gestures · slides · dialogue · scenes      │
                        │                                                 │
                        │  HOOKS: onFace onFrame drawFace drawHand onScene│
                        └───────────────┬─────────────────────────────────┘
                                        │ dynamic import, only if enabled
                        ┌───────────────▼─────────────────────────────────┐
                        │  js/features/*.js — faceId, faceEnroll, potato, │
                        │  capture, stagePuppets, drawing                 │
                        │  each: own canvas layer + own analysis-panel UI │
                        └─────────────────────────────────────────────────┘
```

three things drive everything:

1. **a rig manifest** decides *which capabilities exist* this page load.
2. **a scene object** decides *what's on screen right now*.
3. **the analysis panel** is the live control surface for both (and the authoring UI).

---

## quickstart — make a new show

a "show" = a folder with a script + slides + stage art, plus a puppet **collection** for its
hand/head graphics. to scaffold one called `myshow`:

1. **make the folders + drop in numbered assets** (the number prefix *is* the `puppetNum`
   you reference in the script):
   ```
   public/puppets/shows/myshow/slides/     # full-screen images/videos          (optional)
   public/puppets/shows/myshow/stage/      # stage-puppet art + potato overlays (optional)
   public/puppets/hand_puppets/myshow/     # 000_*.png, 001_*.png, …  hand puppets
   public/puppets/head_puppets/myshow/     # 000_*_hat.png, …         head puppets (optional)
   ```
   collections are auto-discovered from `hand_puppets/<name>/`, so `myshow` becomes a
   collection automatically — and the show's "home" collection.

2. **write the script** `public/puppets/shows/myshow/game_script.json` — a JSON array of
   scene objects (templates below; full field list in the [schema](#scene-json-schema)).

3. **(optional) declare a rig manifest** `public/puppets/shows/myshow/rig.json` if the show
   needs any of the newer capabilities (potato, drawing, stage puppets, face id). a show with
   **no** `rig.json` gets the legacy feature set and behaves exactly as it always did.
   see [rigs & feature modules](#rigs--feature-modules).

4. **run it:** `node App.js` → open `http://localhost:8000/puppets?show=myshow` → click
   **it's showtime!** (grants camera), then **Space** to begin and **Space**/`→` to advance.

5. **author WYSIWYG** instead of hand-editing: drive a scene live, then **edit mode** →
   **save scene N** (localhost only), or the **copy scene** button to grab JSON.
   see [authoring helpers](#authoring-helpers).

6. **commit** `shows/myshow/` plus the `hand_puppets/myshow/` (and `head_puppets/myshow/`)
   assets.

### what a scene can do

- put a hand puppet on each hand (`leftPuppet` / `rightPuppet`) and a **head puppet**
  (`headPuppet`) placed as hat / glasses / heading / mask
- nudge the head puppet (`headXOffset` / `headYOffset`) and scale hand puppets (`puppetSize`)
- borrow another collection's puppets for that one scene (`collection`)
- show a full-screen **slide** image or video (`slide`), optionally un-muted (`toggles.audio`)
- show **dialogue** — character name + typewriter text (`speed` / `instant`), or hide it
- toggle any **CV overlay**: face box, face mesh, race/age/gender/emotion readouts,
  hand/head puppet drawing, gestures, dialogue hover-fade
- **(feature modules)** place independent **stage puppets** that lip-sync to your mic
  (`stage`), track a real **potato** and stick a graphic on it (`potato`, `potatoOverlay`),
  turn on **finger-painting** (`drawing`), and **name the faces** it recognizes
  (`faceId`, `faceLabels`)

### scene templates

**minimal** — one line of dialogue; everything else carries over from the previous scene:
```json
{ "id": 1, "dialogue": { "show": true, "characterName": "shm", "text": "hi everyone!" } }
```

**fully loaded** — every field, for reference:
```json
{
  "id": 2,
  "collection": "myshow",
  "leftPuppet": 3,
  "rightPuppet": null,
  "headPuppet": 1,
  "headPuppetPosition": "hat",
  "headXOffset": 0,
  "headYOffset": -10,
  "puppetSize": 1.1,
  "slide": "001_intro.png",
  "toggles": { "bbox": true, "hands": true, "headPuppets": true, "dialogueHover": true, "audio": false },
  "dialogue": { "show": true, "characterName": "shm", "text": "…", "speed": "normal", "instant": false },

  "stage": [
    { "id": "narrator", "image": "000_sock_puppet.png", "talkImage": "001_sock_puppet_open.png",
      "at": { "x": 0.22, "y": 0.44 }, "size": 0.6,
      "pngtuber": { "bounce": true, "talk": true, "bounceHeight": 0.07 } }
  ],
  "potato": true,
  "potatoManualTrigger": true,
  "potatoOverlay": "mr_potato_head.png",
  "drawing": true,
  "drawingColor": "#ffffff",
  "drawingClear": true,
  "faceId": true,
  "faceLabels": { "shm": "VALIANT HERO", "max": "SCARY VILLAIN" },

  "_note": "author comment, ignored by the rig"
}
```

> **sticky vs. reset (important):** unspecified `toggles` keys carry over from the previous
> scene, and so do an omitted `headPuppet`, `headPuppetPosition`, and `puppetSize`. but
> `leftPuppet`/`rightPuppet` (→ none), `slide` (→ cleared), `headXOffset`/`headYOffset` (→ 0),
> and `collection` (→ home) **reset to their defaults each scene** unless you set them.
> the feature-module keys have their *own* rules — see
> [scene keys: sticky vs. reset, per feature](#scene-keys-sticky-vs-reset-per-feature).
> so most scenes only need a handful of fields.

---

## modes

the rig has three entry points, chosen by URL params:

| URL | mode | what it does |
|---|---|---|
| `/puppets` | **freeplay** | no script. dialogue box is editable, hover-fade on, hands + head puppets auto-enabled. lets you upload your own puppets. features come from `rig.default.json`. |
| `/puppets?show=<name>` | **show** | loads `shows/<name>/game_script.json` and steps through its scenes. spacebar to start/advance. features come from `shows/<name>/rig.json` (or the legacy set if absent). |
| `/puppets?rig=<name>` | **named rig** | freeplay with a swapped feature set from `rig.<name>.json` — the test/tool rigs (`draw`, `capture`, `enroll`, `facetest`, `potatotest`, `stagetest`). |

there's also `?features=a,b,c` — a raw override that beats everything else, for testing.

**`/puppets/directory`** ([directory.html](directory.html)) auto-lists every rig, show, and
tool page it can find. that's the easiest way to see what exists.

## running locally

```
node App.js          # serves on http://localhost:8000
```
then open `http://localhost:8000/puppets` (or `?show=cs10`, or `/puppets/directory`).

> the file-listing, script-saving, roster, capture, and training routes need the **Node**
> server (`node App.js`), not the static `http-server` task.

## deployment — local vs. prod

these two run the *same* client but very different servers, and it matters:

| | local (`node App.js`) | prod (Vercel, shmuh.co) |
|---|---|---|
| server | express, [puppet_routes.js](puppet_routes.js) | **none** — fully static hosting of `public/` |
| directory listings | read from disk per request | baked at build time by [scripts/build-manifests.js](../../scripts/build-manifests.js) into `collections.json`, `hand-puppets-list/<c>.json`, `head-puppets-list/<c>.json`, `directory-data.json` |
| pretty URLs (`/puppets/collections`, `/puppets/shows/:show/rig`, `/puppets/directory`) | express routes | `rewrites` in [vercel.json](../../vercel.json) pointing at those static JSON files |
| script saving / face enroll / potato capture / training | ✅ (loopback-only) | ❌ — the routes don't exist, and the FS is read-only |
| shows, non-`default` collections, slides, stage art | ✅ on disk | ❌ not deployed — see [assets](#assets-whats-tracked-vs-local) |
| `/puppets/directory` contents | everything | trimmed: no local-only rigs, no tool pages, no shows |

so: **all authoring and all training is a local-only workflow**, and the public site is a
read-only freeplay demo. the generated manifests are gitignored; Vercel regenerates them
via `buildCommand`.

> if you add a new dynamic route to `puppet_routes.js` that the *public* site needs, you
> must also (a) generate its data in `build-manifests.js` and (b) add a rewrite in
> `vercel.json`. otherwise it works locally and 404s in prod.

### assets: what's tracked vs. local

as of **2.5.0** the repo tracks only what the public demo needs — about **2 MB**, down from
~131 MB. everything else still lives in the working tree and the rig runs from disk exactly
as before; it's just not in git.

| tracked (deployed) | local only (gitignored) |
|---|---|
| `hand_puppets/default/`, `head_puppets/default/` | every other collection |
| every `shows/*/game_script.json` + `rig.json` | every `shows/*/slides/` + `stage/` |
| `face_ids/roster.json` (shm + max, 20 descriptors each) | `face_ids/refs/` enrollment photos |
| `potato_model/potato.onnx` (see below) | `potato_model/*.pt`, `dataset/`, `runs/` |
| — | `face_model/` (the race classifier, ~9 MB) |

> ⚠️ **git is no longer a second copy of your show assets.** back up `hand_puppets/`,
> `shows/*/slides/` and `shows/*/stage/` somewhere outside the repo. a `git clean -xdf` or a
> fresh clone will not bring them back.

`potato.onnx` is the one big tracked file (11.6 MB) — it stays in the public GitHub repo so
**jsDelivr** can serve it, which is where prod fetches it from (see `MODEL_TAG` in
[potato.js](js/features/potato.js)). everything else the rig loads at runtime (face-api
weights, MediaPipe wasm, onnxruntime-web) already comes from CDNs.

> a `.vercelignore` does **not** keep files out of a Git-integration deploy — Vercel only
> applies it to CLI deploys. so `potato.onnx`, `roster_editor.html` and
> `dataset_review.html` are all still uploaded and reachable by direct URL. nothing links
> or requests them (prod's model comes from jsDelivr; the tool pages are filtered out of
> the directory and their save routes don't exist), so the cost is deployment storage, not
> bandwidth. the only real fix is moving them outside `public/`.

---

## rigs & feature modules

this is the big architectural change. the rig used to load every capability on every page
load. now a **rig manifest** declares a list of feature ids, and only those are enabled.

### rig manifests

a manifest is a tiny JSON file:

```json
{
  "_note": "human explanation of what this rig is for and how to drive it",
  "title": "drawing",
  "local": false,
  "features": ["drawing"]
}
```

- `features` — the list of enabled feature ids.
- `title` — optional; shown in the titlebar + browser tab (freeplay/named rigs only).
- `local` — optional; `true` marks a rig that only works under `node App.js` (it depends on
  localhost-only routes). `build-manifests.js` filters these out of the public directory.
- `_note` — ignored by the rig; this is where the usage instructions for each rig live.
  **read these first** — `rig.capture.json` and `rig.enroll.json` in particular document
  their whole workflow.

resolution order, highest priority first:

1. `?features=a,b,c` — explicit override
2. `?rig=<name>` → `/puppets/rig.<name>.json`
3. show mode → `/puppets/shows/<show>/rig.json`
4. defaults — a **show with no manifest** gets the full legacy set (so existing shows are
   untouched); **freeplay** loads `rig.default.json`

### the feature ids

**core features** — implemented inline in `index.html`, controlled by analysis-panel
checkboxes and scene `toggles`. listing one in `features` just means "show its row":

`race` · `age` · `gender` · `emotion` · `facemesh` · `bbox` · `gestures` · `hands` · `headPuppets`

**module features** — live in `js/features/<id>.js`, dynamically imported only when enabled,
and each installs its own analysis-panel section and (usually) its own canvas layer:

`faceId` · `faceEnroll` · `potato` · `capture` · `stagePuppets` · `drawing`

> **enabled ≠ active.** an enabled feature still starts *off*; it's activated by a scene key,
> a checkbox, or a keypress. disabling a feature hides its panel row, force-unchecks it,
> makes its `toggles` key a no-op, and makes its keyboard shortcut inert — so a rig can
> safely reuse a key another feature owns (e.g. `r` is "race" in most rigs and "reroll the
> capture box" in `?rig=capture`).

### the ones that ship today

| rig | URL | what it's for |
|---|---|---|
| default | `/puppets` | **the public demo.** the legacy set minus `race`, plus `drawing`, `stagePuppets`, `faceId` and `potato` — everything that costs no deployed bytes, plus a potato detector because it's funny |
| draw | `/puppets?rig=draw` | finger-paint testbed |
| stagetest | `/puppets?rig=stagetest` | place/animate an independent stage puppet, mic-driven |
| potatotest | `/puppets?rig=potatotest` | run the potato detector in freeplay |
| capture | `/puppets?rig=capture` | **local only** — build a dataset + train the potato model |
| enroll | `/puppets?rig=enroll` | **local only** — enroll faces into the recognition roster |
| facetest | `/puppets?rig=facetest` | test face recognition against the roster |

### the feature-module contract

a module default-exports a plain object. every hook is optional:

```js
export default {
  id: 'myFeature',

  // one-time setup: load models, create a canvas layer, install panel UI + key handlers.
  // awaited before the camera starts.
  async loadModels(ctx) { … },

  onFace(results, ctx) { … },   // each face-detect tick (~100ms), with face-api results
  onFrame(video, ctx) { … },    // every animation frame, once the camera is live
  drawFace(faceCtx, ctx) { … }, // after the core face overlay is drawn
  drawHand(handCtx, ctx) { … }, // after the core hand puppets are drawn
  onScene(scene, ctx) { … },    // every scene load — read your own scene keys here
};
```

`ctx` (the shared `featureCtx`) hands you:

- **elements** — `video`, `faceCanvas`, `handCanvas`, `slideCanvas`, `bgCanvas`
- **libraries** — `faceapi`, `tf`, `handLandmarker`
- **constants/helpers** — `LERP`, `FADE_IN`, `FADE_OUT`, `makeMediaEl(src)`
- **rig info** — `isShowMode`, `showName`, `homeCollection`, `enabled` (Set), `manifest`
- **live state getters** — `faceTarget`, `faceDisplay`, `lastDetections`, `handLandmarks`
  (normalized MediaPipe landmarks per hand), `currentScene`
- **plumbing** — `getEl(id)`, `createLayer(id, {zIndex})`, `registerPanelHTML(html)`,
  `loadScene(i, instant)`

modules can also **push capability back onto `ctx`** for the core to call — that's how the
core bbox picks up per-face names (`ctx.identifyFace`) and how edit-mode saves stage puppets
(`ctx.getStagePuppets`). it works, but it's an undeclared back-channel — see
[architecture notes](#architecture-notes--what-id-change-in-30).

a module that throws during import or `loadModels` is logged and skipped; the rig keeps
running without it.

### to add a new feature

1. write `js/features/<id>.js` exporting the object above.
2. register it in the `FEATURE_MODULES` map in `index.html`.
3. add `<id>` to a rig manifest (or `?features=<id>` to try it).
4. document its scene keys here and in the manifest `_note`.

---

## the feature modules

### `stagePuppets` — independent puppets + pngtuber lip-sync
[js/features/stagePuppets.js](js/features/stagePuppets.js) · test: `?rig=stagetest`

puppets that aren't on your hands. they live on their own **non-mirrored** layer (so "stage
left" is really stage left), ease between positions, and can be "pngtuber" animated: bounce
up while you're talking, and swap between a closed-mouth and open-mouth frame. mic input
drives it — **you have to click "enable mic" in the panel** (a separate `getUserMedia` grant
from the camera).

a scene's `stage` is the **absolute list of visible puppets**:

```json
"stage": [
  { "id": "sock",
    "image": "000_sock_puppet.png",
    "talkImage": "001_sock_puppet_open.png",
    "at": { "x": 0.22, "y": 0.44 },
    "size": 0.6,
    "transition": "ease",
    "pngtuber": { "bounce": true, "talk": true, "bounceHeight": 0.07 } }
]
```

- `at` — `{x, y}` as fractions of the stage, or a named slot: `farleft` `left` `center`
  `middle` `right` `farright` (y defaults to `0.60`)
- `size` — height as a fraction of stage height
- `transition` — `"ease"` glides from the current position; anything else snaps
- images resolve from `shows/<show>/stage/` (or an absolute `/path`); before art loads you
  get a 🙂/😮 placeholder so you can still position it
- omit the `stage` key → puppets persist unchanged. `"stage": []` → clear the stage.
- the panel has a **show stage puppets** master checkbox, and grows a y / size / bounce
  slider per puppet; tune live and **save the scene** to write the values back.

### `potato` — real object tracking
[js/features/potato.js](js/features/potato.js) · test: `?rig=potatotest`

a self-trained YOLOv8n model (`potato_model/potato.onnx`) run in-browser via
**onnxruntime-web**, deliberately on a runtime separate from the page's TF.js so it can't
disturb the race model. inference runs every other frame on its own async cadence; the box is
LERP-smoothed and drawn every frame, so a *thrown* potato still reads as tracked.

scene keys:

| key | effect |
|---|---|
| `potato` | `true` runs detection this scene |
| `potatoOverlay` | filename in `shows/<show>/stage/` (or absolute path) drawn onto the potato — Mr. Potato Head parts, a dog, whatever. no overlay → just a box labeled "potato" |
| `potatoManualTrigger` | arms the **manual fallback**: press `p` to pin the overlay to your hand instead of the detector. a safety net for live shows when the model loses the potato |

the panel gives you a **detect potatoes** checkbox (on by default in freeplay) plus live
`conf` (detection threshold) and `smooth` (LERP) sliders — tune those before a performance
under the actual stage lighting.

**model loading.** the `.onnx` is ~12 MB, so `loadModels` only sets up the canvas and panel;
the download is kicked off *without* being awaited, and the status readout says
`loading model…` until the session resolves. that keeps the 12 MB out of the path between a
visitor and the "it's showtime!" button. locally the model is read from disk; in prod it
comes from **jsDelivr** off the public GitHub repo, pinned to a tag (`MODEL_TAG` in
[potato.js](js/features/potato.js)) so it caches forever. **retrain → re-tag → bump
`MODEL_TAG`.**

> potato scenes force their dialogue to render **instantly** — the per-frame inference
> starves the typewriter timer and it stutters otherwise.

### `capture` — teachable-machine for object detection
[js/features/capture.js](js/features/capture.js) · **local only**: `?rig=capture`

how the potato model got made, and the pipeline for training a detector for *any* prop.
a dashed target box jumps around the frame; you put the object inside it and hit **SPACE**.
each shot saves the raw (un-mirrored) frame **plus an auto-generated YOLO label** — the box
you just filled — so you build an annotated dataset with zero manual labeling. the box moves
so the model learns to localize the object anywhere in frame (necessary to track a throw).
press **`r`** to reroll the box shape if it doesn't fit your object.

then **train on captured frames** spawns local Python
([scripts/train_potato.py](../../scripts/train_potato.py)) to finetune YOLOv8 and export a
new `potato_model/potato.onnx`; progress streams into the panel.

aim for ~40–150 captures with real variety (distance, angles, in-hand, corners, motion
blur). needs `potato_model/train_config.json` pointing at a python with `ultralytics`
installed (see `train_config.example.json` and [potato_model/TRAIN.md](potato_model/TRAIN.md),
which also covers the Colab route). review what you captured at
[dataset_review.html](dataset_review.html).

dataset/runs/logs are gitignored; only the exported `.onnx` (+ `best.pt`) get committed.

### `faceId` — recognize specific people
[js/features/faceId.js](js/features/faceId.js) · test: `?rig=facetest`

runs face-api's recognition net over **every** face in frame and matches each against the
enrolled roster (`face_ids/roster.json`), then feeds the core bbox a per-face
`{ label, color }` — so boxes get people's actual names in their own colors instead of the
generic age/gender readout.

roster entry:
```json
{ "label": "shm", "name": "shm garanganao almeda", "color": "#90bd42",
  "descriptors": [[…128 floats…], …] }
```

- **off by default in shows** (so the descriptive race/age/gender/emotion labels show first);
  a scene turns it on with `"faceId": true`. **on by default in freeplay.**
- `"faceLabels": { "shm": "VALIANT HERO" }` relabels recognized people for that scene — the
  joke engine. `"faceLabels": null` reverts.
- unrecognized faces read as "someone" in grey.
- **match strictness** slider is live; rebuild happens on the fly. tune it before a show —
  too strict and it won't find you, too loose and it calls everyone by your name.
- edit names/colors at [roster_editor.html](roster_editor.html).

### `faceEnroll` — put people in the roster
[js/features/faceEnroll.js](js/features/faceEnroll.js) · **local only**: `?rig=enroll`

type a name, then press **`E`** a few times per person from different angles/expressions.
each press computes a 128-d descriptor and appends it to the roster. or drop a folder of
photos at `face_ids/refs/<name>/` and hit **add from refs/<name>/ folder** to enroll them all
in a batch (good for someone who isn't in the room).

`face_ids/refs/` is gitignored — only the descriptors in `roster.json` are committed, not the
source photos.

### `drawing` — finger-paint
[js/features/drawing.js](js/features/drawing.js) · test: `?rig=draw`

point **one** index finger up (others curled) and it paints at your fingertip on a persistent
mirrored layer. drop the pose — or bring up a second hand — to pause. **two open hands clears
the canvas.** panel has color / size / clear; `d` toggles drawing mode.

scene keys: `"drawing": true|false`, `"drawingColor": "#ffffff"`, `"drawingClear": true`.
a typical beat is `{ "drawing": true, "drawingClear": true, "drawingColor": "#fff" }` to start
a fresh sketch, then `{ "drawing": false, "drawingClear": true }` to wipe it.

---

## scene keys: sticky vs. reset, per feature

the feature modules each chose their own persistence rule. this trips you up, so:

| key | behavior when the key is **absent** from a scene |
|---|---|
| `toggles.*` | **sticky** — each key persists until a later scene changes it |
| `stage` | **sticky** — puppets persist. `[]` clears. (the array itself is absolute, not a delta) |
| `drawing`, `drawingColor` | **sticky** — stays on/keeps color until a scene says otherwise |
| `drawingClear` | one-shot; only fires on the scene that sets it |
| `faceId`, `faceLabels` | **sticky** — `faceLabels: null` explicitly reverts |
| `potato`, `potatoManualTrigger`, `potatoOverlay` | **resets to off/none every scene** — you must repeat `"potato": true` on every consecutive potato scene |

(yes, `potato` behaving differently from everything else is an inconsistency, not a design.
noted in [architecture notes](#architecture-notes--what-id-change-in-30).)

---

## puppet collections

all hand/head puppet graphics live in two centralized trees, organized into named
**collections**:

```
puppets/hand_puppets/<collection>/   # hand puppets
puppets/head_puppets/<collection>/   # head puppets (optional per collection)
```

current collections: `default` (freeplay), `cs10`, `lightning_talk`,
`computational_artifice_puppet_show`, `stochastic_intro`. add one by making a
`hand_puppets/<name>/` folder (and optionally `head_puppets/<name>/`).

- **active collection** — the set the rig is currently drawing from. a show's "home"
  collection is its own name (`?show=cs10` → `cs10`); freeplay's is `default`.
- the analysis panel's **collection** dropdown switches the active collection live (drives
  BOTH hand & head puppets) — handy for grabbing a puppet from another set mid-performance.
- in show mode, **navigating to any scene resets the active collection to that scene's
  collection** — `scene.collection` if set, otherwise the home collection — so scripts always
  render with their intended puppets. (a manual dropdown switch lasts only until the next
  scene change.)
- a scene can **borrow another collection** with `"collection": "<name>"`; the next scene
  without the field snaps back to home. one field switches both hand & head puppets, and that
  scene's `puppetNum`s index into the chosen collection.
- the **puppetNumber** and **headPuppet** fields are filename dropdowns
  (`<index>: <filename>`); the index is the `puppetNum` used in scripts. the `<` / `>` arrows
  and the `;`/`'` (hand) and `,`/`.` (head) keys step through them.

note that **stage puppets and potato overlays are NOT collections** — they come from
`shows/<show>/stage/`, per show.

`puppetNum` is the index into the active collection's sorted file list — see
[scene JSON](#puppetnum--files).

## keyboard shortcuts

shortcuts are handled in the `keydown` listener in [index.html](index.html) (feature modules
install their own listeners), and are suppressed while typing in a text input / textarea /
contenteditable. **a key bound to a disabled feature does nothing** — that's how the rigs
reuse letters.

### scene navigation (show mode)
| key | action |
|---|---|
| `Space` | start camera on first press, then advance to next scene (or finish the current typewriter line early) |
| `→` | next scene |
| `←` | previous scene |

you can also click the `<` / `>` / scene-number input in the top-right nav pill.

### analysis-panel toggles
each key flips a checkbox in the analysis panel. (the corresponding `toggles` JSON key is in
the next column — see [scene JSON](#scene-json-schema).)
| key | checkbox | `toggles` key |
|---|---|---|
| `R` | "Race"? | `race` |
| `A` | "Age"? | `age` |
| `G` | "Gender"? | `gender` |
| `E` | "Expression"? | `emotion` |
| `F` | "Face"? (facemesh) | `facemesh` |
| `B` | Face "Box"? | `bbox` |
| `Q` | gestures (👍 advance / 👌 cycle left puppet) | `gestures` |

the "Hands"? and "head puppets?" checkboxes have no key binding — set them in the panel or
via `toggles` (`hands`, `headPuppets`).

### dialogue overlay
| key | action |
|---|---|
| `T` | toggle dialogue hover-fade mode (dialogue fades to ~12% when the mouse leaves, full opacity on hover — lets slides be truly full-screen). can also be forced per-scene via `"toggles": { "dialogueHover": true/false }` |

### hand puppets
| key | action |
|---|---|
| `[` | decrease puppet size |
| `]` | increase puppet size |
| `;` | cycle left-hand puppet ← (previous) |
| `'` | cycle left-hand puppet → (next) |

cycling iterates `puppetNum` through the current puppet folder (wrapping around).

### head puppets
| key | action |
|---|---|
| `,` | cycle head puppet ← (previous) |
| `.` | cycle head puppet → (next) |

### feature modules
| key | feature | action |
|---|---|---|
| `D` | drawing | toggle drawing mode |
| `P` | potato | toggle the manual fallback (only while `potatoManualTrigger` is armed / in freeplay) |
| `E` | faceEnroll | capture an enrollment sample (`?rig=enroll`; overrides the `emotion` binding, whose row is hidden there) |
| `Space` | capture | save a labeled frame (`?rig=capture`) |
| `R` | capture | reroll the target box (`?rig=capture`; overrides the `race` binding, whose row is hidden there) |

## gestures
performer's **right** hand, only when `Q` gestures are enabled:
| gesture | action |
|---|---|
| 👍 thumbs-up | advance scene (same as `Space` / `→`) — 800 ms cooldown |
| 👌 OK sign | cycle left-hand puppet forward (same as `'`) |

drawing mode has its own poses (☝️ one index finger = draw, ✋✋ two open hands = clear) and
they're independent of the `gestures` toggle.

---

## scene JSON schema

a show script (`shows/<name>/game_script.json`) is an array of scene objects. all fields are
optional except a scene needs *something* to do. fields consumed by `loadScene`:

| field | type | meaning |
|---|---|---|
| `id` | number | scene number (display/reference only; navigation uses array order) |
| `leftPuppet` | number \| null | `puppetNum` (index into the puppet folder, sorted) for the performer's left hand. `null` = none |
| `rightPuppet` | number \| null | same, right hand |
| `headPuppet` | number \| null | index into the head-puppet folder. `null` = none. omit the key entirely to leave the current head puppet unchanged |
| `collection` | string | optional — render this scene from another [collection](#puppet-collections) (switches both hand & head puppets). omit to use the show's home collection |
| `headPuppetPosition` | string | hard override for head placement: `heading` \| `hat` \| `glasses` \| `mask`. omit to use the filename suffix (below); pass `null` to clear a previous override |
| `headXOffset` / `headYOffset` | number | nudge the head puppet by N pixels (x: +right in canvas space, y: +down). defaults to `0`; resets every scene. set easily via edit mode |
| `puppetSize` | number | hand puppet size multiplier (slider range 0.1–2). if omitted, the size stays sticky from the previous scene |
| `slide` | string \| null | filename in `shows/<name>/slides/` to show full-screen (image or video). `null` clears the slide |
| `toggles` | object | analysis-panel state for this scene — see [toggles](#toggles). **delta-based**: only the keys you list change; everything else carries over from the previous scene |
| `dialogue` | object \| null | `{ show, characterName, text, speed?, instant? }`, or `null` for no dialogue (e.g. a silent slide). `speed` ∈ `fast`/`normal`/`medium`/`slow` (typewriter rate). `instant: true` skips the typewriter |
| `_note` | string | ignored by the rig — a comment for the author (e.g. "use ,/. to cycle hats across this line") |
| `actionRequired` / `popupConfig` | — | mostly stubbed in this rig; `popup` still shows the alert window. condition-gating (smile/wink/etc.) is inert here |

**feature-module fields** (only meaningful if the feature is in the show's `rig.json`; ignored
otherwise — a scene key for a disabled feature is harmless):

| field | feature | meaning |
|---|---|---|
| `stage` | stagePuppets | absolute array of on-stage puppets — see [stagePuppets](#stagepuppets--independent-puppets--pngtuber-lip-sync) |
| `potato` | potato | run potato detection this scene |
| `potatoOverlay` | potato | graphic (in `shows/<show>/stage/`) to draw on the tracked potato |
| `potatoManualTrigger` | potato | arm the `p` manual-fallback key |
| `drawing` | drawing | finger-paint mode on/off |
| `drawingColor` | drawing | `#rrggbb` brush color |
| `drawingClear` | drawing | wipe the drawing layer on entering this scene |
| `faceId` | faceId | turn face recognition on/off (labels boxes with people's names) |
| `faceLabels` | faceId | `{ "<roster label>": "display name" }` — relabel recognized people; `null` reverts |

### puppetNum ↔ files
`puppetNum` is the **index into the folder's sorted file list**. files are name-prefixed
(`000_ruler.png`, `001_paintbrush.png`, …) so the prefix == the index. moving/renaming files
changes indices, so keep the numbering stable or update the scripts.

### toggles
keys recognized in a scene's `toggles` object:

| key | effect |
|---|---|
| `bbox` | draw the face bounding box + label |
| `facemesh` | draw the 68-point face mesh |
| `race`, `age`, `gender`, `emotion` | run + display that face-api prediction |
| `hands` | draw hand puppets |
| `headPuppets` | draw the head puppet |
| `gestures` | enable 👍/👌 hand gestures |
| `dialogueHover` | hover-fade the dialogue box (true) or keep it solid (false) |
| `detectShm` | when `bbox` is on, label the face "shm garanganao almeda" (green box) — the hardcoded predecessor to `faceId` |
| `detectPrettyCute` | label the face "pretty cute!" / pink box when smiling |
| `audio` | let this scene's **slide video** play its audio (default: all slide videos are muted) |

remember toggles are deltas — set a key once and it persists until a later scene changes it.
**a toggle whose feature isn't in the rig manifest is silently ignored.**

## head puppet positions

head-puppet placement (`heading` / `hat` / `glasses` / `mask`) is normally **baked into the
filename** — suffix the file before the extension:

- `000_crown_hat.png` → hat
- `001_shades_glasses.png` → glasses
- `002_halo_heading.png` → heading (floats above the head, auto-clears the bbox label)
- `003_plague_doctor_mask.png` → mask
- `004_no_suffix.png` → falls back to the dropdown (defaults to `hat`)

**precedence:** scene `headPuppetPosition` > dropdown (if the user explicitly picks one) >
filename suffix > `hat`. cycling to a new puppet (`,` / `.` / prev/next buttons / a new
scene's `headPuppet`) clears any override so the new puppet's filename takes over.

on/off is the "head puppets?" checkbox or `"toggles": { "headPuppets": true }`.

## slide audio

every slide video plays **muted** by default. to let a scene's slide play its audio track,
add `"audio": true` to that scene's toggles:

```json
{
  "id": 42,
  "slide": "demo_with_sound.mp4",
  "toggles": { "audio": true, "dialogueHover": true },
  "dialogue": null
}
```

audio stops automatically when you leave the scene (the slide video is torn down).

## authoring helpers

### copy scene
the analysis panel has a **copy scene** button that copies the current toggles/puppets/
dialogue (and `collection`, if overridden) as a JSON scene you can paste into a script.

### edit mode (local only)
when you run the rig from **localhost** in a show, an **edit** button appears at the top of
the analysis panel (it never shows on the public site). edit mode lets you author scenes
WYSIWYG instead of hand-editing JSON:

1. click **edit** → **reset** and **save scene N** buttons appear, and the dialogue
   character-name + text become editable in place.
2. adjust anything — toggles, puppet/head selection, collection, head x/y offsets, hand
   puppet size, stage-puppet positions, dialogue. while the live state differs from the saved
   scene, an **"unsaved changes"** banner shows top-center.
3. **save scene N** writes the current state into that scene and saves the whole script to
   disk (`shows/<name>/game_script.json`), then exits edit mode. **reset** discards your
   changes back to the file.

what `save` captures (absolute — the scene becomes self-contained): `leftPuppet`,
`rightPuppet`, `headPuppet`, `puppetSize`, the full `toggles` state, `dialogue`, `stage`, and
(only when non-default) `collection`, `headPuppetPosition`, `headXOffset`, `headYOffset`.
it preserves the scene's existing `id`, `slide`, `_note`, and dialogue `speed`/`instant`.

> **edit mode does not capture the other feature keys** — `potato`, `drawing`, `faceId`,
> `faceLabels` and friends must still be hand-written into the JSON. only `stage` was wired
> through (via `ctx.getStagePuppets`).

> **saving is localhost-only.** the save endpoint rejects any non-loopback request, and prod
> has no server at all — so the public can never edit. workflow: edit locally with
> `node App.js`, then `git commit` the updated script.

### tool pages
| page | what |
|---|---|
| [directory.html](directory.html) (`/puppets/directory`) | auto-discovered index of every rig, show, and tool page. public build shows a trimmed list |
| [roster_editor.html](roster_editor.html) | rename / recolor / delete enrolled faces (save is localhost-only) |
| [dataset_review.html](dataset_review.html) | flip through captured potato frames + their auto labels |
| `/puppets/source` | `index.html` served as `text/plain`, so you can link "view the source". **local only** — it's an express handler, so the public directory links to GitHub instead |

---

## file map

```
public/puppets/
├── index.html              # the rig: core CV, puppets, scenes, dialogue, edit mode, feature loader
├── puppet_routes.js        # express routes (LOCAL ONLY — see deployment)
├── directory.html          # /puppets/directory — index of everything
├── roster_editor.html      # face roster editor
├── dataset_review.html     # potato dataset review
│
├── rig.default.json        # freeplay feature set
├── rig.<name>.json         # named rigs: draw, capture, enroll, facetest, potatotest, stagetest
│
├── js/
│   ├── constants.js        # race classes, face-mesh triangles, LERP/FADE constants
│   ├── blurhash.js         # background blur renderer
│   └── features/           # opt-in feature modules
│       ├── faceId.js       drawing.js      potato.js
│       └── faceEnroll.js   capture.js      stagePuppets.js
│
├── hand_puppets/<collection>/   # 000_*.png … — index = puppetNum
├── head_puppets/<collection>/   # 000_*_hat.png … — suffix = placement
│
├── shows/<show>/
│   ├── game_script.json    # the scene array
│   ├── rig.json            # (optional) this show's feature set
│   ├── slides/             # full-screen images/videos
│   ├── stage/              # stage-puppet art + potato overlays
│   └── ASSETS.md           # (optional) asset checklist for the show
│
├── face_ids/roster.json    # enrolled face descriptors (refs/ photos are gitignored)
├── face_model/             # race model (TF.js graph model)
└── potato_model/           # potato.onnx + best.pt + TRAIN.md (dataset/runs gitignored)
```

---

## architecture notes — what I'd change in 3.0

what this rig gets *right* is worth keeping: **scenes as plain declarative JSON**, **assets
indexed by sorted filename**, **placement baked into filenames**, **WYSIWYG authoring that
writes back to the same JSON**, **a live control panel that doubles as the authoring UI**,
and the **manual fallback for every CV feature** (a live show cannot depend on a model
firing). the rig-manifest idea is also good — pay only for the capabilities a show uses.

the things that hurt, in rough priority order for a rewrite:

1. **two classes of capability.** core features are hardcoded checkboxes driven by
   `toggles` deltas; module features are ES modules driven by *top-level* scene keys with
   their own panel UI. same concept, two totally different shapes, and the scene schema is
   split across `toggles.hands` and `scene.potato` for no principled reason. **3.0: one
   uniform capability abstraction; core features are just modules that happen to ship in
   the box.**

2. **persistence is per-feature folklore.** toggles are sticky, `stage` is sticky-but-
   absolute, `potato` resets every scene, `drawingClear` is one-shot, `leftPuppet` resets but
   `puppetSize` doesn't. every one of these is defensible alone and unlearnable together.
   **3.0: each capability declares its persistence policy (`sticky` / `per-scene` /
   `one-shot`) once, and the runtime enforces it uniformly.**

3. **every module re-derives the same coordinate math.** the cover-fit raw→element
   transform is copy-pasted in `faceId`, `potato`, and `capture`; canvases are CSS-mirrored
   and then individually un-flipped with `g.scale(-1,1)` to draw text and images the right way
   round. **3.0: one stage/viewport object owning `raw ⇄ video ⇄ element ⇄ stage` transforms
   and a mirrored/unmirrored draw API. nobody should type `coverScale` again.**

4. **layers are ad-hoc integers.** `stageCanvas: 6`, `potatoCanvas: 7`, `captureCanvas: 8`,
   `drawCanvas: 9`, hand-picked per module and already colliding with the core canvases.
   **3.0: named, ordered layers (`background < slide < video < tracking < puppets < stage <
   ink < ui`) that modules request by name.**

5. **timing is four independent clocks.** `setInterval(detectFace, 100)`,
   `setInterval(detectHands, 33)`, `setInterval(checkConditions, 100)`, plus a rAF loop for
   `onFrame`. heavy inference starves the typewriter badly enough that potato scenes had to
   force instant dialogue. **3.0: one frame loop with an explicit budget; inference is async
   work scheduled against it, never something that can block UI.**

6. **edit mode only knows about core fields.** `snapshotState()` is a fixed list plus a
   hand-wired `ctx.getStagePuppets()` escape hatch, which is why `potato`/`drawing`/`faceId`
   state can't round-trip through the save button. **3.0: modules expose
   `snapshot()`/`apply(state)` and edit mode composes them automatically — WYSIWYG authoring
   for every capability, free.**

7. **`featureCtx` is a grab-bag with a reverse channel.** it's ~20 unrelated properties, and
   modules *mutate it* (`ctx.identifyFace = …`, `ctx.getStagePuppets = …`) to hand capability
   back to the core — an undeclared dependency that only works because of load order.
   **3.0: a real registry with typed provides/requires, so `bbox` can ask "does anything
   provide face identity?" instead of the identity module reaching in.**

8. **`index.html` is ~2000 lines of everything.** it was a 72-hour sprint and it stayed. the
   feature-module seam pulled ~1200 lines out into `js/features/`, which is the right
   direction — 3.0 should start there and keep the shell thin.

9. **assets live in git.** this branch alone adds ~105 MB of PNGs, WEBMs, and model weights,
   and `public/` is now ~456 MB. it works but it makes the repo miserable to clone and
   couples deploys to media. **3.0: media on external storage (or LFS), with shows
   referencing URLs; the repo holds code + scripts + manifests only.**

10. **hardcoded shm-isms.** `detect_shm`, `detectPrettyCute`, `'shm garanganao almeda'`, and
    a green hex live in the core render path — `faceId` is the general version of exactly
    that, and the old code never got removed. **3.0: no identities in the engine; it's all
    roster + scene data.**

one more thing worth carrying over deliberately: **the `_note` field, and the `_note` in every
rig manifest.** writing the usage instructions into the artifact itself is why this system is
still legible months later. keep doing that.
