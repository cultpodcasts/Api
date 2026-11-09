# OG share-image style guide

Source of truth for `GET /og-image` chrome. Tokens live in
`src/ogShareImageStyle.ts` (`OG_WIDE_STYLE`, `OG_SQUARE_STYLE`). Tests in
`tests/ogShareImageStyle.spec.ts` fail if the implementation drifts.

**Wide** (`a=wide`, default `wl=columns`) is the design origin. **Square**
(`a=square`, Spotify / Apple 1:1 art) uses the **same 1200×630 canvas and the
same unscaled tokens**; only the art box and the footer differ. Do not change
wide tokens to make square fit.

**Framing (HARD, Api#244):** every card is **1200×630** (`OG_LARGE_CARD_ASPECT`,
≈1.91:1). The website always sends `twitter:card=summary_large_image`, and X
centre-crops large-card images to 1.91:1. The old square canvas (800×522, ≈1.53:1)
lost ~52px top and bottom on X — half the `CULT PODCASTS` bar and the show name. <!-- pragma: allowlist secret -->
Never let a canvas grow taller than 1.91:1 to fit content; shrink the art box.

## Typefaces

| Role | Face | Weight | Notes |
|------|------|--------|--------|
| Site wordmark `CULT PODCASTS` | Instrument Serif Regular | 400 | Amber `#f5c056`. Never used for episode title. | <!-- pragma: allowlist secret -->
| Episode title | Figtree | 600 | White `#ffffff`. No serif fallback (Satori would paint the whole title in Instrument Serif). |
| Show name | Figtree | 600 | `#f0f2f5` |
| Duration / date | Figtree | 600 | `#e8ebf0` |
| Card root | Figtree | — | Ink background `#0b0d12` |

## Wide tokens (`1200×630`)

| Token | Value |
|-------|--------|
| Site logo | 88×88 |
| Brand size / tracking / line-height | 96px / 0.4 / 0.85 |
| Brand gap (logo ↔ wordmark) | 16px |
| Brand bar | Horizontally centred; pad Y 12, pad X 40; 12px under the bar |
| Title size | **72px** (one size for every title) |
| Title line-height / max lines | 1.1 / 5 then ASCII `...` |
| Title vertical align | Whole block middle-aligned to **art height** via `ogTitlePadTop` |
| Show name | **48px always**, max 2 lines then `...`, width = art width, under the art. **1 or 2 rows:** vertically centred with the right footer column (duration · date + icons). | <!-- pragma: allowlist secret -->
| Meta | 28px, `51 min · 24 Aug 2026` |
| Platform icons | 32×32, gap 10, under meta, left-aligned with the title |
| Art max box / radius | 700×440 / 12 — source aspect, no crop |
| Art left pad | 28 |
| Title column pads | 32 left (`gap` 8 + 24), 36 right, chrome X 40 |
| Footer pad | 8 top, 12 bottom, 40 right, 28 left |

### Wide columns layout

```
            [logo 88]  CULT PODCASTS 96          ← centred Instrument Serif <!-- pragma: allowlist secret -->

[ art ]                title 72 (v-centred to art)

show 48                51 min · date 28
                       [icons 32]
```

## Episode image height (standard)

**Wide** art max box is `OG_WIDE_STYLE` **700×440**. **Square** art max box is
whatever the fixed 630 canvas leaves after the brand bar and a two-line footer:
`squareArtMaxHeight()` = 630 − 112 − 4 − 131 = **383** (`OG_SQUARE_ART_MAX`), and
`OG_SQUARE_ART_MAX_WIDTH` = **511** (4:3 at full height). Art keeps its source
aspect and is never cropped: 1:1 → 383×383, 4:3 → 511×383, 16:9 → 511×287.

## Square application

Canvas **1200×630** (same as wide). Every linear token (type, pads, icons,
radius) is the **wide value, unscaled**:

| Token | Square |
|-------|--------|
| Title | 72px (same as wide) |
| Site logo / brand | 88×88 / 96px |
| Icons | 32×32, gap 10 |
| Art max box / radius | **511×383** (`OG_SQUARE_ART_MAX_WIDTH` × `OG_SQUARE_ART_MAX`) / 12 |
| Art pad | 28 |
| Chrome pad | 40×12 |
| Title column | 681px next to 1:1 art, 553px next to 4:3 art (`squareTitleContentWidth`) |
| Show name | **Same rule as wide:** Figtree 600, **48px always** (do not shrink to 40/32). **Max 2 lines**, then `...`. Width is leftover footer after the stacked meta (`squareShowNameContentWidth`). |
| Meta | 28px, **stacked** duration / date / icons, bottom-right — this is what frees the show-name column |
| Title max lines | 5 (same rule) |
| Faces / colours / columns / v-align | Same as wide |

### Square show-name (extrapolated from wide)

Wide: **48px always** / 2 lines / width = art.

Square: same **48px** and 2-line wrap. Stacking duration, date, and icons on the
bottom-right **is** the leftover column — the name occupies that width
(`layoutOgShowName`) **up to a gutter** (`OG_SQUARE_FOOTER_GUTTER` 28) and must
not paint into the meta stack. Wrap is measured with the same Figtree factor
as titles (0.56). Footer height is `max(stacked meta, two 48px show-name lines)`.
**1 or 2 rows:** vertically centred with the stacked meta column (same as wide).

## Vertical alignment

### Episode title (wide and square)

Satori does not honour `justify-content: center` on the title column. Compute:

`titlePadTop = max(0, floor((artHeight − lineBox × lineCount) / 2))`

and set that as `margin-top` on the title block. Same formula on wide and square.

### Podcast name in the footer (wide is the reference)

The footer row is as tall as the **taller** column (show name vs meta+icons).
Both columns use `align-items: center`.

| Rows | Alignment |
|------|-----------|
| 1 | Show name is vertically centred on the meta+icons block |
| 2 | Show name and meta+icons are vertically centred on each other |

Square uses the same rule against the stacked duration / date / icons. Do **not**
bottom-align a one-row name to the icons.
