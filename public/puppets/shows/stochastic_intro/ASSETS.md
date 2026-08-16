# stochastic_intro — assets to add

Add the files below and the show is ready: `/puppets?show=stochastic_intro`.

> **Every image is its own file, in a row.** A hand-puppet index = its position in the
> sorted filename list, so name files `000_…`, `001_…`, etc. Multi-puppet beats jump to
> the **first** index in their range; you cycle through the rest live with **`'`** (next)
> and **`;`** (prev). So a beat listing 3 logos needs 3 separate PNGs at consecutive
> indices.

## Hand puppets → `public/puppets/hand_puppets/stochastic_intro/`

| idx | file | what it is |
|-----|------|------------|
| 0  | `000_shm_bear.png`             | shm with bear photo |
| 1  | `001_bid_logo.png`             | Berkeley Institute of Design logo |
| 2  | `002_smithsonian.png`          | Smithsonian logo |
| 3  | `003_adobe_research.png`       | Adobe Research logo |
| 4  | `004_midjourney_storytelling.png` | Midjourney Storytelling Lab logo |
| 5  | `005_tiat.png`                 | tiat logo |
| 6  | `006_bpigment.png`             | bPigment |
| 7  | `007_cse.png`                  | CSE |
| 8  | `008_teaching_1.png`           | teaching / student work #1 |
| 9  | `009_teaching_2.png`           | teaching / student work #2 |
| 10 | `010_teaching_3.png`           | teaching / student work #3 |
| 11 | `011_art_1.png`                | shm's art #1 |
| 12 | `012_art_2.png`                | shm's art #2 |
| 13 | `013_art_3.png`                | shm's art #3 |
| 14 | `014_art_4.png`                | shm's art #4 |
| 15 | `015_art_5.png`                | shm's art #5 |
| 16 | `016_college_art_1.png`        | college art #1 (self-portrait) |
| 17 | `017_college_art_2.png`        | college art #2 (charcoal) |
| 18 | `018_college_art_3.png`        | college art #3 (oil) |
| 19 | `019_college_art_4.png`        | college art #4 |
| 20 | `020_college_art_5.png`        | college art #5 |
| 21 | `021_theatre.png`              | shm in theatre |
| 22 | `022_performance.png`          | performance png |
| 23 | `023_creative_computation.png` | creative computation png (used as the **right** puppet) |
| 24 | `024_bart_costume.png`         | BART costume (legacy) |
| 25 | `025_bart_costume_2.png`       | 2nd / new BART costume |

(For the art/teaching beats you can add fewer or more — just keep them consecutive; the
script jumps to the first index of each range and you cycle from there. If you change the
counts, the later indices shift — tell me and I'll renumber the `leftPuppet` values.)

## Head puppets → `public/puppets/head_puppets/stochastic_intro/`
| idx | file | what it is |
|-----|------|------------|
| 0 | `000_visual_art_heading.png` | "visual art" head puppet (`_heading` = drawn above the head) |

## Stage puppets (sock-puppet pngtuber) → `public/puppets/shows/stochastic_intro/stage/`
Each needs a **rest** frame + an **open-mouth (talk)** frame. Transparent PNGs.
- `sock_puppet.png` + `sock_puppet_open.png`
- `sock_puppet_hat.png` + `sock_puppet_hat_open.png`
- `sock_puppet_puppeteer.png` + `sock_puppet_puppeteer_open.png`

> ⚠️ Stage puppets bounce / animate off **mic volume** — click **"enable mic 🎤"** in the
> analysis panel once before the show (browsers require a click to grant the mic). Without
> it, they just sit in the rest frame.

## Potato overlays → `public/puppets/shows/stochastic_intro/stage/`
- `mr_potato_head.png`, `mrs_potato_head.png`, `silly_cat.png` (transparent, centred on the potato)

## Slides → `public/puppets/shows/stochastic_intro/slides/`
- `artographer.mp4`, `painting_performance.mp4`, `potatoes.mp4`, `max_training.mp4` (play with audio)

## Face roster
`face_ids/roster.json` must have **shm** and **max** enrolled (done via `?rig=enroll`).

## Interactive beats (already wired)
- **Stage sock puppets** (id 17–20): one, then three L/M/R, bounce + mouth-swap on your voice.
- **Potato** (id 21, 28–32, 40): tracking box + label; overlays swap Mr./Mrs. Potato Head / cat; `p` pins to your hand as a live safety net.
- **Drawing** (id 24 white distribution, id 54 gratitude `#b4dd1e`): point one finger to draw; two open palms clear.
- **Face relabel** (id 50–51): max → SCARY VILLAIN, shm → VALIANT HERO, reverts after.
- **Static-append** text (id 13/14): `instant: true` so "visual art" / "creative computation" appear without retyping.
