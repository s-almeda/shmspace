# puppet rig — keyboard shortcuts

all shortcuts are handled in the keydown listener in [public/puppets/index.html](../../../index.html). shortcuts are suppressed while typing in a text input / textarea.

## scene navigation (show mode)
| key | action |
|---|---|
| `Space` | start camera on first press, then advance to next scene (or finish the current typewriter line early) |
| `→` | next scene |
| `←` | previous scene |

you can also click the `<` / `>` / scene-number input in the top-right nav pill.

## analysis panel toggles
| key | action |
|---|---|
| `R` | "Race"? |
| `A` | "Age"? |
| `G` | "Gender"? |
| `E` | "Expression"? |
| `F` | "Face"? (facemesh) |
| `B` | put face in "Box"? |
| `Q` | gestures (👍 advance / 👌 cycle left puppet) |

## dialogue overlay
| key | action |
|---|---|
| `T` | toggle dialogue hover-fade mode (dialogue fades to ~12% when mouse leaves, full opacity on hover — lets slides be truly full-screen). can also be forced per-scene via `"toggles": { "dialogueHover": true/false }` |

## hand puppets
| key | action |
|---|---|
| `[` | decrease puppet size |
| `]` | increase puppet size |
| `;` | cycle left-hand puppet ← (previous) |
| `'` | cycle left-hand puppet → (next) |

## head puppets
| key | action |
|---|---|
| `,` | cycle head puppet ← (previous) |
| `.` | cycle head puppet → (next) |

head puppet position (`heading` / `hat` / `glasses` / `mask`) is normally **baked into the filename** — suffix the file before the extension:

- `000_crown_hat.png` → hat
- `001_shades_glasses.png` → glasses
- `002_halo_heading.png` → heading (floats above, auto-clears the bbox label)
- `003_plague_doctor_mask.png` → mask
- `004_no_suffix.png` → falls back to the dropdown (defaults to hat)

precedence: scene JSON `"headPuppetPosition": "..."` > dropdown (if user explicitly picks one) > filename suffix > `hat`. cycling to a new puppet (`,` / `.` / prev/next buttons / new scene's `headPuppet`) clears any override so the new puppet's filename takes over.

on/off is either the "head puppets?" checkbox or `"toggles": { "headPuppets": true }`.

## slide audio

by default every slide video plays **muted** (so puppet scenes and silent visual beats don't surprise you). to opt a specific scene into playing its slide's audio track, add `"audio": true` to that scene's toggles:

```json
{
  "id": 42,
  "slide": "demo_with_sound.mp4",
  "toggles": { "audio": true, "dialogueHover": true },
  "dialogue": null
}
```

the audio stops automatically when you advance past the scene (the slide video is torn down and its source cleared).

## freeplay-only
| key | action |
|---|---|
| `D` | toggle the freeplay dialogue tray open/closed |

## gestures (performer's right hand, when `Q` gestures enabled)
| gesture | action |
|---|---|
| 👍 thumbs-up | advance scene (same as `Space` / `→`) — 800ms cooldown |
| 👌 OK sign | cycle left-hand puppet forward (same as `'`) |
