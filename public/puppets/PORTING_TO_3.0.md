# shmuppetry 3.0 — design & porting guide

Handoff document. Written for an LLM starting fresh in the **3.0 repo**, with the 2.5.0 rig
available on disk as reference.

3.0 is a **ground-up rebuild in a separate repository**, not a refactor. §2 is the target
design; everything after it is the old rig — what to steal from it and what to avoid.

Provenance markers in §2–3: unmarked text is shm's design intent. **▸ rec** marks a
recommendation added during handoff — reasoned, but not a requirement. Treat unmarked as
settled and **▸ rec** as open.

---

## 1. The one-paragraph version

A general **stage** on which any number of **objects** appear at positions, each with a
transform and a `z`. Scenes are JSON listing what is on stage. The webcam, the dialogue box,
the drawing surface, hand puppets, background art and cut-out pieces of the puppeteer's own
body are all *the same kind of thing* — a positioned object — rather than separate features
with separate toggles. The look is **paper puppet theatre**: flat cut-outs with white
polygonal borders and drop shadows on a shallow stage.

---

## 2. The 3.0 design

### 2.1 Stage and coordinates

Objects have `x`, `y`, and optional `z` (layering, default `0`), and can be transformed —
scaled, skewed, rotated.

Named position constants exist (`CENTER`, `LEFT`, `RIGHT`) and support offsets from them.
`BACKGROUND` is `z: -200`; `FOREGROUND` is `z: +200`.

> **▸ rec — normalized units, structured offsets.** Use `0..1` of stage rather than pixels;
> 2.5.0's element-space pixel math is why every module re-derives the cover-fit transform and
> why nothing survives a resize cleanly. For "CENTER plus a bit", prefer a structured
> `{ "at": "CENTER", "dx": 0.03 }` over parsing the string `"CENTER + 30"` — a string
> expression means writing and maintaining an evaluator on day one, for syntax sugar.

> **▸ rec — one canvas, one sorted pass.** Draw all objects into a single canvas in `z`
> order (painter's algorithm) rather than mapping `z` onto stacked DOM canvases. Stacked
> mirrored layers are the direct cause of 2.5.0's worst structural mess — see §8.2. It also
> makes drop shadows across objects behave like one scene instead of per-layer accidents.

### 2.2 Objects

**`WebcamFeed`** — a rectangle showing the mirrored webcam, as in the original rig.

**`WebcamCanvas`** — a transparent, stage-sized layer that contains **BodyParts**.

**`BodyPart`** — a region cut from the webcam feed where detected: `Face`, `LeftHand`,
`RightHand`. Everything outside the cut region is hidden, so the part appears disembodied.

- BodyParts can be scaled and skewed.
- Their *position* stays driven by the puppeteer in the underlying webcam feed. (See 2.4 —
  this is the part the original plan flagged as unresolved.)
- A BodyPart can **turn its webcam cutout off** and act purely as a mount for Puppets. Put
  `0001_mikuface` on the NOSE, disable the cutout, and it reads as Miku moving with your nose.

**`Puppet`** — an image pinned to a BodyPart (including the Face). Face mounts use
`FACE_LOCATIONS`: `HAT`, `GLASSES`, `MOUTH`, `NOSE`, `LEFT_EYE`, `RIGHT_EYE`, `BEARD`
(hangs off the chin).

> **▸ rec — mounts need an attachment origin, not just a point.** `HAT` and `BEARD` both sit
> near the face's vertical axis but attach oppositely: a hat rests its *bottom* edge on the
> top of the head, a beard hangs its *top* edge from the chin. So a mount is a face point
> plus which edge of the asset meets it (and a default scale reference — hats scale to head
> width, beards to jaw width). Getting this in early avoids per-asset nudge offsets, which
> is what 2.5.0 ended up doing with `headXOffset`/`headYOffset`. Chin is landmark **8** in
> the 68-point model; the jaw arc is 0–16.

Puppets must be attachable **both** to the face/body as detected in the normal `WebcamFeed`
**and** to the disembodied `BodyPart` cutouts.

**`TextBox`** — dialogue, optionally with a speaker name. **Multiple TextBoxes**, individually
styleable (thought bubble, speech bubble, caption).

**`Canvas`** — a transparent full-stage surface for drawing mode.

Ordinary image objects cover the rest: backgrounds, cut trees, curtains, props, signs.

### 2.3 Paper puppet theatre look

The visual target. Every trait below is **configurable per object**, with show-level defaults.

- **Polygonal white border** around each cut-out — faceted, following the cut polygon.
- **Drop shadow**, so pieces read as paper held slightly off the backdrop.
- **Paper textures**, optionally overlaid on cut-outs and props.

> **▸ rec — the cheap cutout is also the correct one, but it must be dilated.** Build the cut
> path from landmarks you already have (face-api gives 68 points; MediaPipe gives 21 per
> hand) and use it as a `clip()` path against the video frame. No new model, works today.
>
> **Landmarks are skeletal, not silhouette — a raw hull cuts inside the body.** MediaPipe's
> 21 hand points are *joints*: a hull of them slices each finger down its centerline and
> returns a shape with no thickness — dots and lines, not a hand. The 68 face points hug the
> jawline and eyebrows, so a raw face hull shaves skin off every edge. **Every cut path needs
> an outward offset**, and it has to be configurable per body part — hands need far more
> dilation relative to their size than a face does.
>
> Make the offset a **fraction of the part's detected size**, not a pixel constant, or the
> cutout breaks the moment the puppeteer moves toward or away from the camera.
>
> **One canvas trick does the dilation, the rounding, and the white border at once.** Stroking
> a path with a round-joined line of width `2r` and also filling it yields exactly that path
> dilated by `r` — Minkowski dilation by a disc, for free:
>
> ```js
> ctx.lineJoin = ctx.lineCap = 'round';   // 'miter' for crisp facets instead
> ctx.lineWidth = 2 * r;                  // r = dilation, as a fraction of part size
> ctx.stroke(path); ctx.fill(path);       // together = the shape grown by r
> ```
>
> So: draw the silhouette once in white at `r + borderWidth` → that's the paper border.
> Then build the same path at `r`, `clip()`, and draw the video through it. **The border is
> not extra work; it is the same operation at a larger radius.** The drop shadow is
> `shadowBlur`/`shadowOffset` on the white pass.
>
> **For hands, skip the hull entirely.** Stroke the landmark *connection skeleton* — the bone
> segments between joints — with a thick round-capped line. That directly produces finger
> thickness and a hand-shaped silhouette, and it handles splayed fingers correctly, which a
> dilated hull does not (a hull bridges the gaps between fingers and returns a mitten).
>
> Round joins are also the aesthetically correct default: hand-cut paper has slightly rounded
> corners, not razor points. Expose `join` so crisp facets stay available.
>
> This all matters aesthetically, not just practically: a dilated landmark path is **already
> faceted**, which is exactly the paper-cutout look. True per-pixel segmentation (MediaPipe
> ImageSegmenter) would give smooth photographic edges you'd then have to re-simplify to get
> the polygonal quality back. **Start with dilated landmark paths; segmentation is a later
> option, not the starting point, and may never be wanted.**
>
> Caveat: the 68-point face hull stops at the jaw and eyebrows — a forehead/crown arc has to
> be extrapolated, or the face cuts off at the brow no matter how much you dilate.

Suggested shape for the configurable traits, so they compose as ordinary object properties:
`cut { dilate, join }`, `outline { width, color }`, `shadow { dx, dy, blur, color }`,
`texture { src, blend, opacity }`. A show config (2.6) can set the defaults for all cutouts
at once, with per-part overrides — hands and face will not want the same `dilate`.

### 2.4 Motion, anchoring and bindings

> **▸ rec — this whole subsection is a handoff addition.** It resolves the "arbitrary
> position vs. puppeteer-controlled position" tension the original plan flagged as unsolved,
> and it is the single highest-leverage idea in this document.

Make position always `anchor(t) ⊕ offset`:

- **No anchor** → static object at `offset`.
- **Anchor** → tracks a live source, with `offset` / scale / skew / rotation applied on top,
  each channel independently overridable.

BodyParts then need no special positioning rules — they are ordinary objects that happen to
be anchored to tracked sources.

Generalize one step further: **let any transform channel be either a constant or bound to a
live signal.** That single primitive turns most of the feature list into data:

| effect | expressed as |
|---|---|
| hand puppet | object anchored to `rightHand`, with offset + scale |
| face puppet | object anchored to `face.NOSE` |
| pngtuber bounce | `y` bound to `mic.level` |
| mouth open/closed swap | `frame` bound to `mic.level > floor` |
| curtains pulled open by hands | `x` bound to `leftHand.x` / `rightHand.x` |
| sign held on a stick | `rotation` bound to `rightHand.middleFinger.angle + 90°` |

All six are separate hand-written code paths in 2.5.0. As bindings they are scene JSON, and
the seventh one thought of later costs nothing.

### 2.5 Scenes and the script

The rig walks a script scene by scene, following the stage directions, as in 2.0/2.5.

A scene declares which objects and object states are on stage.

> **▸ rec — resolve to absolute, author sparse.** "Objects entering and leaving" is a delta
> model, and delta-vs-absolute confusion is the single biggest documented pain in 2.5.0
> (§6, row 3) — it is also why edit-mode "save scene" only ever captured a subset of state.
> Instead: a scene *resolves* to the complete stage; the file may be sparse and inherit from
> the previous scene; **the editor always writes back fully-resolved absolute state.** Then
> "save scene" is a pure serialization of what is on screen, which is the property 2.5.0
> never had.

### 2.6 Per-show configs

As in 2.5.0, each show carries a config listing the features it needs, so a show without
face recognition never loads it. This is the one structural idea from 2.5.0 that worked
well and should carry over directly.

A config may also specify a **custom CSS template** instead of the default xp.css-based
skin — and is the natural place for the show-wide paper-theatre defaults from 2.3.

*Reach goal:* a script that generates or updates a config by reading a `script.json`.

### 2.7 Control panel

Successor to 2.5.0's AnalysisPanel. Near-invisible until hover. Lets you change scenes,
manually toggle objects, adjust their positions, and **save edits back into the scene JSON**.

Uniform objects pay off here: one generic inspector for any object, instead of a bespoke
panel section per feature. 2.5.0 grew four separate hand-written panel blocks that each
needed individual wiring.

### 2.8 Public demo

A `default_demo` version, live on the web: **no edit mode**, but public visitors can try the
features listed in `default_demo_config.json`. Same split as 2.5.0, which works — see §5.

### 2.9 Assets

One centralized assets directory for all puppets and props, every file numbered
(`0001_miku`, `0002_sonic`).

> **▸ rec** — 2.5.0 indexes puppets by *position in the sorted file listing*, so inserting or
> renaming a file silently renumbers every scene that referenced it. Since files are being
> numbered by hand anyway, key on the **number parsed from the filename**, not on array
> index. Also decide early where assets live given they are deliberately kept out of git
> (§9.6) — a manifest that maps id → URL keeps shows portable.

---

## 3. Why this design is the right move

Recorded so the rationale survives the session it came from.

Scenes as lists of positioned objects — instead of a set of per-feature toggles — dissolves
four separate 2.5.0 problems at once: the two-classes-of-capability split, the inconsistent
sticky/reset rules, the colliding z-indexes, and the bespoke-panel-per-feature problem. It is
the correct central abstraction.

**Scope warning.** This is a large system, and the rig has to stay performable while it is
rebuilt. Suggested spine, each step independently demoable:

1. Stage + transform + render loop + scene player + control panel, with `WebcamFeed` as the
   only object.
2. Bindings (2.4).
3. BodyParts + cutout rendering (2.2, 2.3).

---

## 4. Where the old rig lives

| | |
|---|---|
| **read these first** | `reference/` in this repo — a text-only copy of the 2.5.0 rig (engine, feature modules, show scripts, rig manifests). No assets, no models. Everything §7–§10 refers to is in there |
| full original | `/Users/loaner1-main/Projects/shmspace/public/puppets/` — only needed for assets, models, or to actually run 2.5.0 |
| repo | `github.com/s-almeda/shmspace` (public), tag **`v2.5.0`** |
| entry point | `reference/index.html` — open it first, it is the whole engine |
| its own docs | `README.md` in that directory; its "architecture notes" section is the condensed form of §6 |
| live | `shmuh.co/puppets` (freeplay demo), `shmuh.co/puppets/directory` |
| run locally | `node App.js` from repo root → `localhost:8000/puppets` |

Vanilla throughout: no build step, no client framework. ES modules loaded by URL. The server
is one express router mounted by a top-level `App.js`.

### File map

| file | lines | what it is | port value |
|---|---:|---|---|
| `index.html` | 2044 | **the entire engine** — markup, CV loops, scene player, puppet rendering, dialogue, edit mode, feature loader, in one inline module | read for behavior, port nothing structurally |
| `js/features/potato.js` | 350 | ONNX object detection (YOLOv8n) via onnxruntime-web | **high** — decode + letterbox math |
| `js/features/stagePuppets.js` | 301 | free-standing puppets, mic-driven bounce + mouth swap | **high** — nearest existing thing to the 3.0 stage |
| `js/features/faceId.js` | 152 | face recognition against a roster; per-face label + color | medium |
| `js/features/capture.js` | 160 | auto-labeled dataset capture → local YOLO training | medium, self-contained |
| `js/features/faceEnroll.js` | 131 | face descriptor enrollment | medium, self-contained |
| `js/features/drawing.js` | 120 | fingertip painting on a persistent layer | **high** — small and clean |
| `js/constants.js` | 25 | race class names, 68-point mesh triangles, lerp constants | **lift verbatim** |
| `js/blurhash.js` | 53 | blurred webcam background | low |
| `css/puppet_rig.css` | 612 | xp.css-based skin, panel, dialogue, overlays | reference only |
| `puppet_routes.js` | 301 | express routes; all writes localhost-guarded | **high** — the guard pattern |
| `directory.html` | 102 | auto-discovered index of rigs/shows/tools | low |
| `roster_editor.html` | 127 | roster name/color editor | low |
| `dataset_review.html` | 110 | flip through captured frames + labels | low |
| `../../scripts/build-manifests.js` | ~120 | bakes static JSON listings for the static host | medium |
| `../../scripts/train_potato.py` | 61 | YOLOv8 finetune + ONNX export | lift as-is |

### The regression corpus

200 authored scenes proving what the format had to express. **If a 3.0 scene format cannot
represent these, it is under-powered.**

| show | scenes |
|---|---:|
| `shows/cs10/game_script.json` | 63 |
| `shows/stochastic_intro/game_script.json` | 55 — richest; uses every feature |
| `shows/lightning_talk/game_script.json` | 43 |
| `shows/computational_artifice_puppet_show/game_script.json` | 39 |

Read `stochastic_intro` first; its `rig.json` and `ASSETS.md` show the full shape of a show.

---

## 5. How 2.5.0 works, in one pass

1. URL decides a **rig manifest** (`rig.default.json`, `rig.<name>.json`, or
   `shows/<show>/rig.json`) → a `Set` of enabled feature ids.
2. Core capabilities are hardcoded in `index.html`, driven by checkboxes; a disabled feature's
   row is hidden and its keyboard shortcut goes inert.
3. Module capabilities under `js/features/` are **dynamically imported only if enabled**, each
   registering hooks: `loadModels / onFace / onFrame / drawFace / drawHand / onScene`.
4. A scene is a JSON object; `loadScene(i)` applies it and calls every `onScene` hook.
5. Rendering is several stacked `<canvas>` elements with hand-picked `z-index`, some
   CSS-mirrored to match the mirrored webcam.
6. Edit mode (localhost only) snapshots live state into the scene and rewrites the script.

Item 1 is the idea worth carrying forward (§2.6). Items 2–5 are what 3.0 replaces.

---

## 6. Architecture delta

| concern | 2.5.0 (actual) | 3.0 (intended) |
|---|---|---|
| what's on screen | implicit; a scene toggles booleans and the engine infers | explicit list of positioned objects |
| capability shape | two kinds — core checkboxes vs. feature modules — with different scene syntax (`toggles.hands` vs `scene.potato`) | one uniform object model |
| persistence | per-feature folklore: toggles sticky, `stage` sticky-absolute, `potato` per-scene, `drawingClear` one-shot | one declared policy, uniformly enforced |
| layering | ad-hoc `z-index` ints (6,7,8,9) picked per module, already colliding | single `z` per object, one sorted pass |
| coordinates | element-space px; cover-fit transform copy-pasted in 4 places; canvases CSS-mirrored then individually un-mirrored per draw | one stage owning its transforms |
| timing | 3 `setInterval`s (100/33/100ms) + a rAF loop; heavy inference starved the typewriter | one frame loop with a budget |
| authoring | `snapshotState()` is a fixed field list plus one hand-wired escape hatch; most feature state cannot round-trip | every object serializes itself |
| identity | `detect_shm`, a hardcoded name and green hex, in the render path | no identities in the engine |
| assets | ~130MB in git; media coupled to deploys | centralized numbered assets, out of the repo |

---

## 7. Feature inventory

What already exists, so it can be deliberately chosen or skipped rather than rediscovered.

**Hand puppets** — image pinned to each hand, size multiplier, cycling through a numbered
folder. `index.html` `detectHands()`. → 3.0: object anchored to a hand.

**Head puppets** — image pinned to the face at `hat`/`glasses`/`heading`/`mask`, placement
parsed from a **filename suffix** (`000_crown_hat.png`), plus x/y nudge offsets.
`effectiveHeadPuppetPosition()`, `updateHeadPuppetDisplay()`. → 3.0: `FACE_LOCATIONS`. The
filename-encodes-placement trick is good and worth keeping.

**Stage puppets / ventriloquy** — free-standing puppets at named positions, easing between
them, bouncing and mouth-swapping to mic volume. `stagePuppets.js`. **Nearest existing thing
to the 3.0 stage model — read it first.** Its scene format is already an absolute array,
which is the direction §2.5 recommends.

**Face recognition** — 128-d descriptors matched against `face_ids/roster.json`, per-face
label + color, per-scene relabeling (`faceLabels: {"shm": "VALIANT HERO"}`). `faceId.js`.
The roster is world-readable when deployed; only consented people belong in it.

**Face enrollment** — descriptor capture, one keypress per sample, or batch from a folder.
`faceEnroll.js`. Localhost only.

**Potato detection** — self-trained YOLOv8n via onnxruntime-web, LERP-smoothed tracking that
survives a throw, arbitrary graphic pinned to the detection, plus a **manual keyboard
fallback** for when the model loses it mid-performance. `potato.js`.

**Dataset capture + training** — a target box jumps around the frame; put the object in it,
hit SPACE, and the frame saves with an auto-generated YOLO label. No manual annotation. Then
trains locally and exports ONNX. `capture.js` + `scripts/train_potato.py`. **This is a
general "teach it a new prop" pipeline, not potato-specific.**

**Drawing** — fingertip painting; one-index-finger pose draws, two open hands clear.
`drawing.js`.

**Descriptive CV readouts** — race/age/gender/emotion via face-api, face mesh, bounding box.
These are the *subject* of the work, not features; 3.0 should keep them expressible but never
privileged in the engine.

**Slides** — full-screen image/video, muted by default. → 3.0: an object at `BACKGROUND`.

**Dialogue** — typewriter with speed settings, speaker name, hover-fade so slides can be
truly full-screen. → 3.0: `TextBox`, now multiple and styleable.

**Gestures** — 👍 advances the scene, 👌 cycles a puppet, 800ms cooldown.
`checkThumbsUpGesture()`, `checkPinchGesture()`.

**Edit mode** — localhost-only WYSIWYG: drive the scene live, save it back into the JSON,
dirty-state banner. The workflow is right; only the implementation is limited.

---

## 8. Code worth lifting near-verbatim

Solved problems. Copy the math, not the surrounding structure.

1. **Cover-fit transform, raw video → element space.** Appears 4× (`detectFace`,
   `faceId.recognize`, `potato.infer`, `capture.onFrame`). In 3.0 this must exist exactly
   once, on the stage.
   ```js
   const coverScale = Math.max(elemW / vw, elemH / vh);
   const cropX = (vw * coverScale - elemW) / 2, cropY = (vh * coverScale - elemH) / 2;
   const toElem = (x, y) => ({ x: x * coverScale - cropX, y: y * coverScale - cropY });
   ```
2. **YOLOv8 output decode** — `potato.js` `infer()`. Handles both channel-major `[1,4+nc,A]`
   and anchor-major `[1,A,4+nc]` exports plus letterbox-undo back to frame coords. Fiddly,
   correct, hard to re-derive.
3. **Letterbox preprocessing** to a square model input with aspect preserved — same function.
4. **Mic RMS + smoothing** — `stagePuppets.readLevel()`. See also `TALK_FLOOR`/`TALK_CEIL`:
   speech RMS lives in ~0.04–0.22, and normalizing across the full 0–1 range instead of that
   window is what made the pngtuber bounce invisible for months.
5. **`FACE_TRIANGLES`** — `constants.js`, the 68-point mesh triangulation. Tedious data.
   Also the starting point for a face cut polygon (§2.3).
6. **Hand pose predicates** — `isPointing()`, `isOpenHand()` in `drawing.js`; thumbs-up and
   pinch in `index.html`. Cheap landmark heuristics, no classifier.
7. **`makeMediaEl(src)`** — returns an `<img>` or `<video>` from one call, so every asset path
   handles both. 3.0 wants this on day one.
8. **Filename-suffix placement parsing** — `parseHeadPosition`.
9. **Localhost-only write guard** — `isLoopback()` in `puppet_routes.js`. Every write route
   rejects non-loopback, so authoring can never be public.
10. **Static-host baking** — `build-manifests.js` + `vercel.json` rewrites turn dynamic listing
    routes into build-time JSON. Relevant only if 3.0 also deploys static.

---

## 9. Traps that cost real time in 2.5.0

1. **Canvas resize wipes the canvas.** `canvas.width = x` clears it even when `x` is
   unchanged-but-fractional. `getBoundingClientRect()` returns fractional widths, so comparing
   raw against the integer `canvas.width` differed every frame and continuously wiped the
   drawing layer. Round before comparing; assign only on real change.
2. **Mirroring.** The webcam is CSS-mirrored, so overlay canvases are too — meaning every text
   and image draw needs an individual `ctx.scale(-1,1)` un-flip. A stage that owns mirroring
   as a transform avoids this entirely. This is the strongest argument for §2.1's single
   canvas.
3. **Inference starves timers.** Per-frame ONNX work made the typewriter stutter so badly that
   potato scenes had to force `instant` dialogue. Budget the frame.
4. **Two `getUserMedia` permissions.** Camera and mic are separate prompts; users enable
   ventriloquy and wonder why nothing moves. Surface mic state in the UI.
5. **Blocking model loads.** Everything was awaited before the start button appeared. 2.5.0
   now defers all but the face detector and landmark model, gating each control on its own
   load, behind a progress bar. Build for this from the start: **a control that is visible but
   not yet functional reads as broken.**
6. **`git rm --cached` + `git add -A`** silently undo each other. Relevant if 3.0 inherits the
   "assets on disk, not in git" arrangement.
7. **Top-level `const` in a long module** — a helper referencing a promise declared 40 lines
   below throws a TDZ `ReferenceError` at load and the whole rig fails to boot.
8. **`.vercelignore` does not work on Git-integration deploys** — only on CLI deploys. To keep
   a file out of a Vercel deploy it must live outside the served directory.

---

## 10. Do not port

- `index.html`'s structure. 2044 lines of everything, the residue of a 72-hour sprint.
- The `toggles` delta system.
- Stacked CSS-mirrored canvases with hand-picked `z-index`.
- `snapshotState()` / `isSceneDirty()` — the concept survives, the fixed field list does not.
- Hardcoded identity (`detect_shm`, `detectPrettyCute`, the literal name and hex in the render
  path). `faceId` is the general version; the specific one was never removed.
- The `race` TF.js model path unless deliberately wanted — 9MB, and it loads a second ML
  runtime alongside onnxruntime-web.

---

## 11. First questions for the 3.0 session

1. Does the object/transform/binding model express all 200 existing scenes? Port
   `stochastic_intro` (55 scenes, every feature) as the acceptance test.
2. Absolute or delta scenes — decide before writing the player (§2.5).
3. Normalized or pixel coordinates — decide before writing the stage (§2.1).
4. One canvas or DOM layers (§2.1).
5. Landmark-hull cutouts or segmentation — affects whether the paper-cutout look comes free
   (§2.3).
6. Where do assets live, given they are deliberately out of git (§2.9)?
7. What is the minimum stage that is still *performable*, so the rig stays usable while it is
   rebuilt (§3)?
