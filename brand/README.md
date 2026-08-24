# LifeOS brand

The mark is **the plug** — every inbox plugged into one connection — with a
four-point spark between the prongs (the "live" signal). Gradient runs
diagonally sky → indigo so it bridges the product UI's indigo accent.

## Palette

| Token          | Hex       | Use                                    |
| -------------- | --------- | -------------------------------------- |
| Spark Sky      | `#38bdf8` | gradient start, highlights             |
| Current Indigo | `#6366f1` | gradient end, primary accent           |
| Accent (UI)    | `#818cf8` | links, "OS" in the wordmark on dark    |
| Ink            | `#09090b` | mono-dark fill, light-mode text        |
| Paper          | `#fafafa` | wordmark text on dark                  |

Gradient: `linear-gradient(135deg, #38bdf8, #6366f1)`.

## Files

- `svg/logo.svg` — master mark (gradient, transparent). Source of truth; all
  rasters are generated from the SVGs with sharp.
- `svg/logo-mono-{white,black,indigo}.svg` — single-color marks for contexts
  where the gradient can't be used (engraving, favicons on odd backgrounds).
- `svg/app-icon.svg` — rounded-square tile, white mark on gradient. Used for
  the favicon, apple-touch icon, and any app-store style placement.
- `svg/wordmark-{dark,light}.svg` — mark + "LifeOS" for dark / light surfaces.
- `png/` — rasters: `logo-{64..1024}`, `app-icon-{16..1024}` (180 = apple
  touch, 192/512 = PWA), mono 512s, wordmarks, `social-card.png` (1200×630 OG).
- `favicon.ico` — 16/32/48 multi-size, built from the app icon.
- `ascii/logo.ansi` — truecolor half-block terminal banner (the CLI embeds a
  copy in `apps/cli/src/banner.ts`); `ascii/logo.txt` — plain-ASCII fallback.

## Usage rules

- Minimum clear space: half the collar width on all sides.
- Below 24 px use the app icon tile, not the bare mark — the prongs vanish.
- Don't recolor the gradient per-surface; use a mono variant instead.
- The spark stays in every variant. It's the signature.

## Regenerating

Rasters were generated with `sharp` (SVG → PNG at each size), the favicon with
Pillow, and the ANSI art by downsampling `png/logo-256.png` to 24 columns and
mapping pixel pairs to `▀` half-blocks with truecolor foreground/background.
