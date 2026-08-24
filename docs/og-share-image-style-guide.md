# OG share-image style guide

Source of truth for `GET /og-image` chrome. Tokens live in
`src/ogShareImageStyle.ts` (`OG_WIDE_STYLE`, `OG_SQUARE_STYLE`). Tests in
`tests/ogShareImageStyle.spec.ts` fail if the implementation drifts.

**Wide** (`a=wide`, default `wl=columns`) is the design origin. **Square**
(`a=square`, Spotify / Apple 1:1 art) is the same chrome scaled by
`800 / 1200`. Do not change wide tokens to make square fit.

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
| Show name | 48px (min 32), max 2 lines, width = art width, under the art | <!-- pragma: allowlist secret -->
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

## Square application (`800×418`)

Canvas stays **800×418** (not `630 × 2/3`). Every other linear token is
`Math.round(wide × 800/1200)`:

| Token | Square |
|-------|--------|
| Title | 48px |
| Site logo | 59×59 |
| Brand size | 64px |
| Icons | 21×21, gap 7 |
| Art max box / radius | 467×293 scaled, **height reduced** so the footer fits (`squareArtMaxHeight`) / 8 |
| Art pad | 19 |
| Chrome pad | 27×8 |
| Show name | 32px (min 21), **one line**, width = footer minus meta stack |
| Meta | 19px, **stacked** duration / date / icons, bottom-right |
| Title max lines | 5 (same rule) |
| Faces / colours / columns / v-align | Same as wide |

Two show-name rows at 32px are taller than the leftover under 1:1 art on a 418px
canvas, so square does **not** use two podcast-name lines. The name grows
sideways into the space freed by stacking meta.

## Vertical alignment

Satori does not honour `justify-content: center` on the title column. Compute:

`titlePadTop = max(0, floor((artHeight − lineBox × lineCount) / 2))`

and set that as `margin-top` on the title block. Same formula on wide and square.
