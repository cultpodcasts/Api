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
                       [ yt  spotify  apple ]
```

**Square** keeps a compact right column (brand, title, podcast, duration, date,
icons) with the same larger date/duration type.

| Zone (wide) | Content |
|-------------|---------|
| Top | Site logo + `CULT PODCASTS`, horizontally centred | <!-- pragma: allowlist secret -->
| Left | Episode art sized to the **source aspect ratio**, fitted inside a max box — never cropped |
| Right | episode title (show name is in the footer) |
| Bottom | show name left; duration/date + icons stacked on the right of the same row |

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
| `a=square` | 800×418 | 360×378 | `summary_large_image` |

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
  &cv=9                   # layout revision (cache key)
  &wl=footer|columns|stack|inline  # wide chrome preview; default columns
```

- `u` must be `https` and an allowlisted host (`episodeShareImage.isAllowedShareImageSourceHost`).
- `p`, `d`, and `r` apply to **both** aspects (omitted from the card when empty).
- `pl` is optional; chips omitted when empty.
- Page-details builds this URL via `buildBrandedOgImageUrl` when share art exists.
- Existing shortener KV is **never rewritten**. Platform chips are resolved from **live search** (`spotifyId` / `appleId` / `youtubeId`) on each page-details request so an image created when only YouTube existed still shows Spotify/Apple once those ids are in the index. `cv` plus the updated `pl` / `r` query values bust the `/og-image` HTTP cache.

## Rendering stack

| Layer | Choice | Why |
|-------|--------|-----|
| HTML → SVG layout | `workers-og` (`ImageResponse`) | Satori + Yoga/resvg Wasm **imported as modules** (Workers block runtime Wasm *compile*) |
| Type | **Instrument Serif** (brand) + **Figtree Semibold** (title / podcast / meta); site logo mark inline with brand | Matches website display/UI fonts |
| Colour | Ink `#0b0d12`, amber brand `#f5c056`, secondary/meta `#f0f2f5` / `#e8ebf0` | High contrast on dark card |
| Platform icons | Copied from website assets / `apple-podcasts-svg` (Apple purple person + arcs; Spotify Material green; YouTube play; BBC Sounds bars) | Must match site marks at chip size |
| Long titles | Soft wrap; smaller type when long **or** any token ≥14–16 chars; hard truncate to a **line budget** from text-column width (≈3–4 lines) on a word boundary so `…` stays on the last visible line | Char-only caps can overflow the line clamp and hide the ellipsis |
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
    Api-->>Web: image = /og-image?...pl=live,cv=9
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
