# puppet rig — README & dev notes

a webcam puppet-show / presentation rig by shm garanganao almeda. live at **shmuh.co/puppets**.
all the client logic is one file: [index.html](index.html). server routes are in [puppet_routes.js](puppet_routes.js) (mounted by the top-level `App.js`).

**making a new show? start at the [quickstart](#quickstart--make-a-new-show).** the rest is reference: performing **shortcuts**, the **scene-JSON schema**, **toggles**, **collections**, and **edit mode**.

---

## quickstart — make a new show

a "show" = a folder with a script + slides, plus a puppet **collection** for its graphics. to scaffold one called `myshow`:

1. **make the folders + drop in numbered assets** (the number prefix *is* the `puppetNum` you reference in the script):
   ```
   public/puppets/shows/myshow/slides/     # full-screen images/videos          (optional)
   public/puppets/hand_puppets/myshow/     # 000_*.png, 001_*.png, …  hand puppets
   public/puppets/head_puppets/myshow/     # 000_*_hat.png, …         head puppets (optional)
   ```
   collections are auto-discovered from `hand_puppets/<name>/`, so `myshow` becomes a collection automatically — and the show's "home" collection.

2. **write the script** `public/puppets/shows/myshow/game_script.json` — a JSON array of scene objects (templates below; full field list in the [schema](#scene-json-schema)).

3. **run it:** `node App.js` → open `http://localhost:8000/puppets?show=myshow` → click **it's showtime!** (grants camera), then **Space** to begin the show and **Space**/`→` to advance.

4. **author WYSIWYG** instead of hand-editing: drive a scene live, then **edit mode** → **save scene N** (localhost only), or the **copy scene** button to grab JSON. see [authoring helpers](#authoring-helpers).

5. **commit** `shows/myshow/` plus the `hand_puppets/myshow/` (and `head_puppets/myshow/`) assets.

### what a scene can do
- put a hand puppet on each hand (`leftPuppet` / `rightPuppet`) and a **head puppet** (`headPuppet`) placed as hat / glasses / heading / mask
- nudge the head puppet (`headXOffset` / `headYOffset`) and scale hand puppets (`puppetSize`)
- borrow another collection's puppets for that one scene (`collection`)
- show a full-screen **slide** image or video (`slide`), optionally un-muted (`toggles.audio`)
- show **dialogue** — character name + typewriter text (`speed` / `instant`), or hide it
- toggle any **CV overlay**: face box, face mesh, race/age/gender/emotion readouts, hand/head puppet drawing, gestures, dialogue hover-fade

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
  "_note": "author comment, ignored by the rig"
}
```

> **sticky vs. reset (important):** unspecified `toggles` keys carry over from the previous scene, and so do an omitted `headPuppet`, `headPuppetPosition`, and `puppetSize`. but `leftPuppet`/`rightPuppet` (→ none), `slide` (→ cleared), `headXOffset`/`headYOffset` (→ 0), and `collection` (→ home) **reset to their defaults each scene** unless you set them. so most scenes only need a handful of fields.

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

> the file-listing + script-saving routes need the **Node** server (`node App.js`), not the static `http-server` task. on Vercel these run as a serverless function (saving is localhost-only — see [edit mode](#edit-mode-local-only)).

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
| `headXOffset` / `headYOffset` | number | nudge the head puppet by N pixels (x: +right in canvas space, y: +down). defaults to `0`; resets every scene. set easily via edit mode |
| `puppetSize` | number | hand puppet size multiplier (slider range 0.1–2). if omitted, the size stays sticky from the previous scene |
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

## authoring helpers

### copy scene
the analysis panel has a **copy scene** button that copies the current toggles/puppets/dialogue (and `collection`, if overridden) as a JSON scene you can paste into a script.

### edit mode (local only)
when you run the rig from **localhost** in a show, an **edit** button appears at the top of the analysis panel (it never shows on the public site). edit mode lets you author scenes WYSIWYG instead of hand-editing JSON:

1. click **edit** → **reset** and **save scene N** buttons appear, and the dialogue character-name + text become editable in place.
2. adjust anything — toggles, puppet/head selection, collection, head x/y offsets, hand puppet size, dialogue. while the live state differs from the saved scene, an **"unsaved changes"** banner shows top-center.
3. **save scene N** writes the current state into that scene and saves the whole script to disk (`shows/<name>/game_script.json`), then exits edit mode. **reset** discards your changes back to the file.

what `save` captures (absolute — the scene becomes self-contained): `leftPuppet`, `rightPuppet`, `headPuppet`, `puppetSize`, the full `toggles` state, `dialogue`, and (only when non-default) `collection`, `headPuppetPosition`, `headXOffset`, `headYOffset`. it preserves the scene's existing `id`, `slide`, `_note`, and dialogue `speed`/`instant`.

> **saving is localhost-only.** the save endpoint rejects any non-loopback request, and Vercel's filesystem is read-only anyway — so the public can never edit. workflow: edit locally with `node App.js`, then `git commit` the updated script.
