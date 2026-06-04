# puppet rig — README & dev notes

a webcam puppet-show / presentation rig by shm garanganao almeda. live at **shmuh.co/puppets**.
all the client logic is one file: [index.html](index.html). server routes are in [puppet_routes.js](puppet_routes.js) (mounted by the top-level `App.js`).

this doc records both the keyboard/gesture **shortcuts** for performing, and the **dev notes** (modes, toggles, scene-JSON fields) for building shows.

---

## modes

the rig has two modes, chosen by the `show` URL param:

| URL | mode | what it does |
|---|---|---|
| `/puppets` | **freeplay** | no script. dialogue box is editable, hover-fade on, hands + head puppets auto-enabled. lets you upload your own puppets. |
| `/puppets?show=<name>` | **show** | loads `shows/<name>/game_script.json` and steps through its scenes. spacebar to start/advance. |

each show lives in `shows/<name>/` with a `game_script.json` and a `slides/` folder. puppet **graphics** are centralized into collections (see below), not stored per-show.

## running locally

```
node App.js          # serves on http://localhost:8000
```
then open `http://localhost:8000/puppets` (or `?show=cs10`).

> the file-listing routes (and, later, script-saving) need the **Node** server (`node App.js`), not the static `http-server` task. on Vercel these run as a serverless function.

---

## puppet collections

all puppet graphics live in two centralized trees, organized into named **collections**:

```
puppets/hand_puppets/<collection>/   # hand puppets
puppets/head_puppets/<collection>/   # head puppets (optional per collection)
```

current collections: `default` (freeplay), `cs10`, `lightning_talk`. add a new collection by making a `hand_puppets/<name>/` folder (and optionally `head_puppets/<name>/`).

- **active collection** — the set the rig is currently drawing from. a show's "home" collection is its own name (`?show=cs10` → `cs10`); freeplay's is `default`.
- the analysis panel's **collection** dropdown switches the active collection live (drives BOTH hand & head puppets) — handy for grabbing a puppet from another set mid-performance.
- in show mode, **navigating to any scene resets the active collection to that scene's collection** — `scene.collection` if set, otherwise the home collection — so scripts always render with their intended puppets. (a manual dropdown switch lasts only until the next scene change.)
- a scene can **borrow another collection** for itself with `"collection": "<name>"` (e.g. a `cs10` scene that shows a `lightning_talk` puppet); the next scene without the field snaps back to home. one `collection` field switches both hand & head puppets, and that scene's `puppetNum`s index into the chosen collection.
- the **puppetNumber** and **headPuppet** fields are filename dropdowns (`<index>: <filename>`); the index is the `puppetNum` used in scripts. the `<` / `>` arrows and the `;`/`'` (hand) and `,`/`.` (head) keys step through them.

`puppetNum` is the index into the active collection's sorted file list — see [scene JSON](#puppetnum--files).

## keyboard shortcuts

shortcuts are handled in the `keydown` listener in [index.html](index.html), and are suppressed while typing in a text input / textarea / contenteditable.

### scene navigation (show mode)
| key | action |
|---|---|
| `Space` | start camera on first press, then advance to next scene (or finish the current typewriter line early) |
| `→` | next scene |
| `←` | previous scene |

you can also click the `<` / `>` / scene-number input in the top-right nav pill.

### analysis-panel toggles
each key flips a checkbox in the analysis panel. (the corresponding `toggles` JSON key is in the next column — see [scene JSON](#scene-json-schema).)
| key | checkbox | `toggles` key |
|---|---|---|
| `R` | "Race"? | `race` |
| `A` | "Age"? | `age` |
| `G` | "Gender"? | `gender` |
| `E` | "Expression"? | `emotion` |
| `F` | "Face"? (facemesh) | `facemesh` |
| `B` | put face in "Box"? | `bbox` |
| `Q` | gestures (👍 advance / 👌 cycle left puppet) | `gestures` |

the "Hands"? and "head puppets?" checkboxes have no key binding — set them in the panel or via `toggles` (`hands`, `headPuppets`).

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

## gestures
performer's **right** hand, only when `Q` gestures are enabled:
| gesture | action |
|---|---|
| 👍 thumbs-up | advance scene (same as `Space` / `→`) — 800 ms cooldown |
| 👌 OK sign | cycle left-hand puppet forward (same as `'`) |

---

## scene JSON schema

a show script (`shows/<name>/game_script.json`) is an array of scene objects. all fields are optional except a scene needs *something* to do. fields consumed by `loadScene`:

| field | type | meaning |
|---|---|---|
| `id` | number | scene number (display/reference only; navigation uses array order) |
| `leftPuppet` | number \| null | `puppetNum` (index into the puppet folder, sorted) for the performer's left hand. `null` = none |
| `rightPuppet` | number \| null | same, right hand |
| `headPuppet` | number \| null | index into the head-puppet folder. `null` = none. omit the key entirely to leave the current head puppet unchanged |
| `collection` | string | optional — render this scene from another [collection](#puppet-collections) (switches both hand & head puppets). omit to use the show's home collection |
| `headPuppetPosition` | string | hard override for head placement: `heading` \| `hat` \| `glasses` \| `mask`. omit to use the filename suffix (below); pass `null` to clear a previous override |
| `slide` | string \| null | filename in `shows/<name>/slides/` to show full-screen (image or video). `null` clears the slide |
| `toggles` | object | analysis-panel state for this scene — see [toggles](#toggles). **delta-based**: only the keys you list change; everything else carries over from the previous scene |
| `dialogue` | object \| null | `{ show, characterName, text, speed?, instant? }`, or `null` for no dialogue (e.g. a silent slide). `speed` ∈ `fast`/`normal`/`medium`/`slow` (typewriter rate). `instant: true` skips the typewriter |
| `_note` | string | ignored by the rig — a comment for the author (e.g. "use ,/. to cycle hats across this line") |
| `actionRequired` / `popupConfig` | — | mostly stubbed in this rig; `popup` still shows the alert window. condition-gating (smile/wink/etc.) is inert here |

### puppetNum ↔ files
`puppetNum` is the **index into the folder's sorted file list**. files are name-prefixed (`000_ruler.png`, `001_paintbrush.png`, …) so the prefix == the index. moving/renaming files changes indices, so keep the numbering stable or update the scripts.

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
| `detectShm` | when `bbox` is on, label the face "shm garanganao almeda" (green box) |
| `detectPrettyCute` | label the face "pretty cute!" / pink box when smiling |
| `audio` | let this scene's **slide video** play its audio (default: all slide videos are muted) |

remember toggles are deltas — set a key once and it persists until a later scene changes it.

## head puppet positions

head-puppet placement (`heading` / `hat` / `glasses` / `mask`) is normally **baked into the filename** — suffix the file before the extension:

- `000_crown_hat.png` → hat
- `001_shades_glasses.png` → glasses
- `002_halo_heading.png` → heading (floats above the head, auto-clears the bbox label)
- `003_plague_doctor_mask.png` → mask
- `004_no_suffix.png` → falls back to the dropdown (defaults to `hat`)

**precedence:** scene `headPuppetPosition` > dropdown (if the user explicitly picks one) > filename suffix > `hat`. cycling to a new puppet (`,` / `.` / prev/next buttons / a new scene's `headPuppet`) clears any override so the new puppet's filename takes over.

on/off is the "head puppets?" checkbox or `"toggles": { "headPuppets": true }`.

## slide audio

every slide video plays **muted** by default. to let a scene's slide play its audio track, add `"audio": true` to that scene's toggles:

```json
{
  "id": 42,
  "slide": "demo_with_sound.mp4",
  "toggles": { "audio": true, "dialogueHover": true },
  "dialogue": null
}
```

audio stops automatically when you leave the scene (the slide video is torn down).

## authoring helper

the analysis panel has a **copy scene** button that copies the current toggles/puppets/dialogue as a JSON scene you can paste into a script.
