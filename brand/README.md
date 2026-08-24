# LifeOS brand

The mark is **the mail slot** — a solid square with a horizontal opening. Every
inbox, one opening. Strictly monochrome so it holds at 16 px and on any
surface.

## Palette

| Token     | Hex       | Use                                      |
| --------- | --------- | ---------------------------------------- |
| Ink       | `#09090b` | mark on light, light-mode text           |
| Paper     | `#fafafa` | mark on dark, wordmark on dark           |
| Slot      | paper / transparent | the opening; never fill it with color |
| Accent    | `#6366f1` | UI links only — not the mark             |

## Files

- `svg/logo.svg` — master mark (ink square, transparent slot). Source of truth.
- `svg/logo-mono-{white,black,indigo}.svg` — single-color marks. Indigo is for
  rare tinted contexts; prefer black/white.
- `svg/app-icon.svg` — full-bleed black tile, white slot. Favicon, apple-touch,
  PWA, ChatGPT plugin.
- `svg/wordmark-{dark,light}.svg` — mark + "LifeOS" for dark / light surfaces.
- `png/` — rasters: `logo-{64..1024}`, `app-icon-{16..1024}` (180 = apple
  touch, 192/512 = PWA), mono 512s, wordmarks, `social-card.png` (1200×630 OG).
- `favicon.ico` — 16/32/48 multi-size, built from the app icon.
- `chatgpt-plugin/logo.png` — 512×512 PNG **under 10 KB** for ChatGPT plugins
  and the Apps SDK (`interface.logo`). `composer-icon.png` is the 128×128 twin
  (`interface.composerIcon`). Served at `/logo.png` from the web app.
- `ascii/logo.ansi` — truecolor half-block terminal banner (the CLI embeds a
  copy in `apps/cli/src/banner.ts`); `ascii/logo.txt` — plain-ASCII fallback.

## Usage rules

- Minimum clear space: a quarter of the square on all sides.
- Below 24 px use the app icon tile (full-bleed), not the padded mark — the
  slot collapses.
- Don't recolor the mark. Use a mono variant if the surface fights black/white.
- The slot stays empty. That's the signature.

## Regenerating

```bash
python3 brand/generate.py
```

Rasters and the favicon are built with Pillow. The ChatGPT plugin PNGs are
2-color indexed so they stay under the 10 KB Apps SDK cap. ANSI art is a
nearest-neighbor downsample of the app icon to 24 columns, mapped to `▀`
half-blocks.
