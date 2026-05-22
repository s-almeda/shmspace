# pieces.css — notes

quick reference for the classes in `pieces.css` — a small framework for art-piece pages built on top of [xp.css](https://botoxparty.github.io/XP.css/).

see [examples.html](./examples.html) for a rendered demo of every class.

---

## page-level

| class | what it does |
|---|---|
| `.piece-page` | the outer flex column. centers content, gap 60px, max-width 1100px. wrap everything in this. |
| `.piece-title` | big monospace title at the top of the page |
| `.piece-subtitle` | grey monospace subtitle under the title |

---

## rows (control horizontal alignment of one window/image)

wrap each window in a row so you can shove it left, center, or right.

```html
<div class="piece-row left|center|right"> ... </div>
```

| class | what it does |
|---|---|
| `.piece-row` | flex row |
| `.piece-row.left` | aligns its child to the left edge |
| `.piece-row.left-center` | halfway between left and center (15% padding on the left side) |
| `.piece-row.center` | center (default) |
| `.piece-row.right-center` | halfway between right and center (15% padding on the right side) |
| `.piece-row.right` | right edge |

both `.left-center` and `.right-center` collapse to plain `.center` on screens under 600px so the window doesn't overflow.

---

## the window itself

base: combine xp.css's `.window` with `.piece-window`.

```html
<div class="window piece-window size-md askew-left">
  <div class="title-bar"> ... </div>
  <div class="window-body"> ... </div>
  <div class="status-bar"> ... </div>
</div>
```

### sizes (max widths, all responsive)
| class | width |
|---|---|
| `.piece-window` (no modifier) | min(90vw, 520px) |
| `.size-sm` | min(80vw, 320px) |
| `.size-md` | min(85vw, 460px) |
| `.size-lg` | min(92vw, 640px) |

### tilt
| class | rotation |
|---|---|
| `.askew-left` | -1.2deg |
| `.askew-right` | +1.2deg |
| `.askew-none` | none |

(tilt auto-disables on mobile < 600px for readability)

### body theming
| class | what it does |
|---|---|
| `.window-body` | default xp.css beige (#ece9d8) |
| `.window-body.dark` | dark grey (#1a1a1a) + light text |

### hover behavior
by default `.piece-window`s sit still — no animation on hover. opt IN to a 2px lift with `.float-on-hover` (rare; use sparingly to make a single window feel "alive" or clickable).

```html
<div class="window piece-window size-md float-on-hover"> ... </div>
```

---

## images

### inside a window — use `.piece-img`

```html
<img class="piece-img" src="..." alt="..." />
```

| modifier | what it does |
|---|---|
| (none) | full-width, cover-fit, max-height 60vh |
| `.contain` | use contain instead of cover (no cropping) |
| `.tall` | max-height 75vh |
| `.short` | max-height 40vh |

### outside a window — use `.piece-bare`

centers an image in its own column (no window chrome). optional caption below.

```html
<div class="piece-bare w-md">
  <img src="..." alt="..." />
  <p>optional caption</p>
</div>
```

| width modifier | max-width |
|---|---|
| `.w-sm` | 300px |
| `.w-md` | 500px (default if no modifier) |
| `.w-lg` | 700px |

#### side-by-side (image + caption in a row)

markup is always `<img>` then `<p>`. the modifier flips which side the image lands on.

```html
<!-- image on the LEFT, caption on the right -->
<div class="piece-bare side-left">
  <img src="..." alt="..." />
  <p>caption text</p>
</div>

<!-- image on the RIGHT, caption on the left -->
<div class="piece-bare side-right">
  <img src="..." alt="..." />
  <p>caption text</p>
</div>
```

| modifier | layout |
|---|---|
| `.side-left` | image left, caption right (50/50, gap 24px, max-width 780px) |
| `.side-right` | image right, caption left (same proportions, just mirrored) |

auto-collapses to stacked column on screens < 600px.

### hover-swap (image A on rest, image B on hover)

```html
<div class="piece-img-wrapper">
  <img class="piece-img" src="rest.png" />
  <img class="piece-img hover-img" src="hover.png" />
</div>
```

works inside a `.window-body` or on its own.

---

## popup window (click-to-open modal)

two parts: a **trigger** + a hidden **popup**. needs the `<script>` block from `examples.html` to wire up open/close.

```html
<!-- the trigger -->
<img class="popup-trigger" data-popup="my-popup-id" src="..." alt="..." />

<!-- the popup itself (hidden until opened) -->
<div class="popup-backdrop" id="my-popup-id">
  <div class="popup window piece-window size-md">
    <div class="title-bar">
      <div class="title-bar-text">popup title</div>
      <div class="title-bar-controls">
        <button class="popup-close" aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body">
      <p>popup content goes here</p>
    </div>
  </div>
</div>
```

| class | role |
|---|---|
| `.popup-trigger` | put on the element that opens the popup. needs `data-popup="some-id"` matching a backdrop. |
| `.popup-backdrop` | fixed full-screen dark overlay. needs `id` matching the trigger. hidden by default. |
| `.popup-backdrop.is-open` | toggled by JS to show the popup. |
| `.popup` | put on the inner window. caps size at min(90vw, 640px) and disables hover-lift. |
| `.popup-close` | put on the close button inside the title bar. |

**how it closes:** clicking `.popup-close`, clicking the dark backdrop outside the window, or pressing ESC.

**multiple popups on one page:** just give each a unique `id` and matching `data-popup` on each trigger. one trigger per popup or many — both work. the JS handles all of them.

---

## text helpers (use anywhere)

| class | what it does |
|---|---|
| `.redacted` | renders as black bar over text; click to reveal (JS at bottom of html toggles `.revealed`) |
| `.struck` | strikethrough + faded |

```html
i could <span class="struck">remember</span> edit this
i want to remember <span class="redacted">the part where it hurt</span>
```

---

## title-bar buttons (from xp.css)

valid `aria-label` values:
- `"Minimize"`
- `"Maximize"`
- `"Restore"`
- `"Help"`
- `"Close"`

```html
<div class="title-bar-controls">
  <button aria-label="Minimize"></button>
  <button aria-label="Maximize"></button>
  <button aria-label="Close"></button>
</div>
```

---

## status bar

multiple `.status-bar-field` `<p>`s sit side-by-side.

```html
<div class="status-bar">
  <p class="status-bar-field">last modified: never</p>
  <p class="status-bar-field">size: 1 lifetime</p>
</div>
```

---

## boilerplate

every page should start with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>your piece</title>
  <link rel="stylesheet" href="https://unpkg.com/xp.css" />
  <link rel="stylesheet" href="pieces.css" />
</head>
<body>
  <div class="piece-page">
    <h1 class="piece-title">your piece</h1>
    <p class="piece-subtitle">shm — date</p>

    <!-- ... your content ... -->

  </div>

  <script>
    // include only if using .redacted or .popup-* — see examples.html
  </script>
</body>
</html>
```

---

## quick recipes

**a centered standalone image with caption** (no window):
```html
<div class="piece-bare w-md">
  <img src="assets/foo.png" alt="foo" />
  <p>caption</p>
</div>
```

**a small askew window on the right with just an image**:
```html
<div class="piece-row right">
  <div class="window piece-window size-sm askew-right">
    <div class="title-bar">
      <div class="title-bar-text">do_not_open.png</div>
      <div class="title-bar-controls">
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body">
      <img class="piece-img short" src="assets/foo.png" />
    </div>
    <div class="status-bar">
      <p class="status-bar-field">read-only</p>
    </div>
  </div>
</div>
```

**a dark-bodied window with redacted text**:
```html
<div class="window piece-window size-md">
  <div class="title-bar">
    <div class="title-bar-text">draft_001.txt — Notepad</div>
    <div class="title-bar-controls">
      <button aria-label="Close"></button>
    </div>
  </div>
  <div class="window-body dark">
    <p>i want to remember <span class="redacted">the part where it hurt</span></p>
  </div>
</div>
```

**a clickable image that opens a popup**:
```html
<img class="popup-trigger" data-popup="memory-01" src="assets/foo.png" />

<div class="popup-backdrop" id="memory-01">
  <div class="popup window piece-window">
    <div class="title-bar">
      <div class="title-bar-text">memory_01</div>
      <div class="title-bar-controls">
        <button class="popup-close" aria-label="Close"></button>
      </div>
    </div>
    <div class="window-body">
      <p>full memory shown here.</p>
    </div>
  </div>
</div>
```
