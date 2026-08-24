# OG share-image cards

Design for episode Open Graph / Twitter card images served by the Api Worker
`GET /og-image`. Replaces a generic mic watermark with a **composed Cult Podcasts
card** that embeds episode art and brand type.

## Goals

- Make shared short URLs (`s.cultpodcasts.com`) and episode pages read as Cult Podcasts,
  not anonymous art with a stock icon.
- Keep crawlers working when render fails (307 to the source art URL).
- Support two `/og-image` canvas sizes via `imageAspect` (website always uses
  `twitter:card=summary_large_image` when episode art is shown):
  - **wide** (YouTube / BBC iPlayer / Internet Archive)
  - **square** (Spotify / Apple / BBC Sounds)

## Non-goals

- Full site rebrand (favicon, marketing site) — card system only.
- Rewriting existing shortener KV keys (still: create with image on miss; never patch existing).
- Official platform trademark lockups beyond simple icon marks (no “Listen on …” copy).

## Shared layout

Wide and square share the same **content**. Aspect changes canvas size, type scale,
and chrome.

**Wide** (YouTube 16:9 and similar) uses the empty column instead of packing
everything into a centred right stack:

```
            CULT PODCASTS             ← taller centred header // pragma: allowlist secret

[ episode art ]  episode name         ← title gets the full right column

show name              51 min  24 Aug 2026
                       [ yt  spotify  apple ]   ← same left edge as the title
```

**Square** (Spotify / Apple 1:1 art) uses the **same columns chrome** as wide,
scaled by canvas width `800/1200`. See the style guide below.

## Wide style guide (source of truth)

Extrapolated from `CARD_SCALE.wide` + the default `wl=columns` path in
`src/ogShareImage.ts`. Square must follow these relationships; it must not
change these tokens.

| Token | Wide value | Role |
|-------|------------|------|
| Canvas | 1200×630 | Twitter/OG large image |
| Background | `#0b0d12` | Ink |
| Brand typeface | Instrument Serif Regular | `CULT PODCASTS` only | <!-- pragma: allowlist secret -->
| Brand colour | `#f5c056` | Amber |
| Brand size | 96px, letter-spacing 0.4, line-height 0.85 | Caps meet logo |
| Site logo | 88×88 | Left of brand wordmark |
| Brand gap | 16px | Logo ↔ wordmark |
| Brand bar | Horizontally centred; pad 12×40, extra 12px under | Top of card |
| Title / show / meta typeface | Figtree Semibold 600 | Never fall back to Instrument Serif |
| Title size | **72px** (one size for every title) | Hyphenated and wrapped match |
| Title line-height | 1.1 | Explicit `\n` lines |
| Title max lines | 5 | Then ASCII `...` |
| Title colour | `#ffffff` | |
| Title vertical align | Whole title block middle-aligned to **art height** (`margin-top` pad) | Satori ignores flex center |
| Show name | Figtree 600, 48px (min 32), max 2 lines, under the art | Width = art width | <!-- pragma: allowlist secret -->
| Show colour | `#f0f2f5` | |
| Meta | Figtree 600, 28px, `51 min · 24 Aug 2026` | Colour `#e8ebf0` |
| Platform icons | 32×32, gap 10 | Under meta, left-aligned with title |
| Art max box | 700×440, radius 12 | Source aspect, no crop |
| Art left pad | 28 | Flush-left, no frame |
| Title column pads | 32 left (`gap+24`), 36 right, 40 chrome X | |
| Footer pad | 8 top, 12 bottom, 40 right, 28 left | Show name \| meta+icons |

**Layout (columns):**

```
            [logo 88] CULT PODCASTS 96            ← centred <!-- pragma: allowlist secret -->

[ art ]               title 72 (v-centred to art)

show 48               51 min · date 28 <!-- pragma: allowlist secret -->
                      [icons 32]
```

Full token tables, faces, and alignment rules:
[`docs/og-share-image-style-guide.md`](og-share-image-style-guide.md).
**Square application** (do not edit wide): multiply linear tokens by `800/1200`
(title 48, logo 59, brand 64, icons 21, art max 467×293, canvas 800×418).

| Zone (wide) | Content |
|-------------|---------|
| Top | Site logo + `CULT PODCASTS`, horizontally centred | <!-- pragma: allowlist secret -->
| Left | Episode art sized to the **source aspect ratio**, fitted inside a max box — never cropped |
| Right | episode title, vertically centred against the art (show name is in the footer) |
| Bottom | show name left (shrinks, then wraps to two lines, then truncates); duration/date + icons stacked on the right, same column as the title |

Preview-only `wl=` wide variants (page-details does not send this; default is `columns`):

| `wl` | Bottom / meta |
|------|----------------|
| `footer` | Icons left, duration + date far right on one row |
| `columns` | Icons under the art; duration + date under the title column |
| `stack` | Duration + date under the podcast name; icons tight under the art |
| `inline` | `51 min · 24 Aug 2026` under the show name; icons tight under the art |

| Aspect | Canvas | Art max box | Website twitter:card (episode art ON) |
|--------|--------|-------------|---------------------------------------|
| `a=wide` | 1200×630 | 700×440 | `summary_large_image` |
| `a=square` | 800×418 | 467×293 | `summary_large_image` |

## Query contract

```
GET /og-image
  ?u=<https episode art>
  &a=wide|square          # default square
  &t=<episode title>
  &p=<podcast name>
  &d=<duration>           # `51 min` / `1h` / `1h 5m`
  &r=<release date>       # display string (`24 Aug 2026`)
  &pl=youtube,spotify,apple,bbc
  &wl=footer|columns|stack|inline  # wide chrome preview; default columns
```

- `u` must be `https` and an allowlisted host (`episodeShareImage.isAllowedShareImageSourceHost`).
- `p`, `d`, and `r` apply to **both** aspects (omitted from the card when empty).
- `pl` is optional; chips omitted when empty.
- Page-details builds this URL via `buildBrandedOgImageUrl` when share art exists.
- Existing shortener KV is **never rewritten**. Platform chips are resolved from **live search** (`spotifyId` / `appleId` / `youtubeId`) on each page-details request so an image created when only YouTube existed still shows Spotify/Apple once those ids are in the index. Already-cached `/og-image` responses may stay stale; new URLs (new `pl` / `r` / title) render with current chrome.

## Rendering stack

| Layer | Choice | Why |
|-------|--------|-----|
| HTML → SVG layout | `workers-og` (`ImageResponse`) | Satori + Yoga/resvg Wasm **imported as modules** (Workers block runtime Wasm *compile*) |
| Type | **Instrument Serif** (brand) + **Figtree Semibold** (title / podcast / meta); site logo mark inline with brand | Matches website display/UI fonts |
| Colour | Ink `#0b0d12`, amber brand `#f5c056`, secondary/meta `#f0f2f5` / `#e8ebf0` | High contrast on dark card |
| Platform icons | Copied from website assets / `apple-podcasts-svg` (Apple purple person + arcs; Spotify Material green; YouTube play; BBC Sounds bars) | Must match site marks at chip size |
| Long titles | One title size per canvas (72 wide / 48 square); tokens wider than the column **hyphenate**; leftover after 5 lines gets `...` | Soft-wrap-only overflow hid the ellipsis and sat long tokens high |
| Failure | 307 → source `u` (+ `X-Og-Error` on preview/debug) | Crawlers still get an image |

Do **not** use bare `@resvg/resvg-wasm` / Satori without module-bundled Yoga on Workers — that yields `Wasm code generation disallowed by embedder`.

## Data flow

```mermaid
sequenceDiagram
  participant Web as Website SSR
  participant Api as Api Worker
  participant KV as shortner KV
  participant Search as Azure Search

  Web->>Api: GET /page-details/...
  alt KV hit with image
    Api->>KV: get metadata
    Api->>Search: episode by id (platforms only; KV unchanged)
    Api-->>Web: image = /og-image?...pl=live
  else KV miss
    Api->>Search: episode by id
    Api->>KV: put (image + platforms on create only)
    Api-->>Web: image = /og-image?...
  end
  Note over Web: og:image / twitter:image
  Web-->>Api: crawler GET /og-image
  Api-->>Web: image/png card (or 307 source)
```

## Local testing

See [README § OG cards](../README.md#og-share-image-cards) and `npm run og:preview`.

## Related PRs / surfaces

| Repo | Role |
|------|------|
| Api | `/og-image`, page-details URL builder, KV `platforms` on create |
| Website | SEO tags from page-details `image` / `imageAspect` |
| RPP | Shortener write with share-image metadata; short-URL-only social when `HasShareImage` |

## Open tweaks

- Icon SVGs are simplified marks, not official assets — replace if brand/legal requires.
