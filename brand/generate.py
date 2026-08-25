#!/usr/bin/env python3
"""Regenerate LifeOS brand rasters, favicon, ChatGPT plugin logos, and CLI banners.

Source of truth is the mail-slot geometry in this file (and the matching SVGs).
Run from repo root:  python3 brand/generate.py
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
WEB_APP = REPO / "apps" / "web" / "app"
WEB_PUBLIC = REPO / "apps" / "web" / "public"
CLI_BANNER = REPO / "apps" / "cli" / "src" / "banner.ts"

# 256-space padded mark (matches apps/web/components/Logo.tsx)
PAD = 36
SQUARE = 184
SLOT_INSET_X = 36
SLOT_INSET_Y = 48
SLOT_W = 112
SLOT_H = 28
CANVAS = 256

INK = (9, 9, 11, 255)
PAPER = (250, 250, 250, 255)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)
INDIGO = (99, 102, 241, 255)
GRAY = (102, 102, 102, 255)
TRANSPARENT = (0, 0, 0, 0)

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"


def slot_on_square(size: int) -> tuple[int, int, int, int]:
    """Mail-slot rect inside a full-bleed square of `size` pixels."""
    x = round(SLOT_INSET_X / SQUARE * size)
    y = round(SLOT_INSET_Y / SQUARE * size)
    w = round(SLOT_W / SQUARE * size)
    h = round(SLOT_H / SQUARE * size)
    # Keep the slot horizontally centered after rounding.
    x = (size - w) // 2
    return x, y, w, h


def draw_mark(
    size: int,
    *,
    fill: tuple[int, int, int, int],
    background: tuple[int, int, int, int] = TRANSPARENT,
    padded: bool = True,
) -> Image.Image:
    """Padded mark (transparent slot) or full-bleed app icon (opaque slot)."""
    im = Image.new("RGBA", (size, size), background)
    draw = ImageDraw.Draw(im)
    if padded:
        scale = size / CANVAS
        sq = round(PAD * scale)
        sq_size = round(SQUARE * scale)
        slot_x = round((PAD + SLOT_INSET_X) * scale)
        slot_y = round((PAD + SLOT_INSET_Y) * scale)
        slot_w = round(SLOT_W * scale)
        slot_h = round(SLOT_H * scale)
        draw.rectangle([sq, sq, sq + sq_size - 1, sq + sq_size - 1], fill=fill)
        draw.rectangle(
            [slot_x, slot_y, slot_x + slot_w - 1, slot_y + slot_h - 1],
            fill=background,
        )
    else:
        draw.rectangle([0, 0, size - 1, size - 1], fill=fill)
        x, y, w, h = slot_on_square(size)
        draw.rectangle([x, y, x + w - 1, y + h - 1], fill=background)
    return im


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=True)


def save_chatgpt_png(im: Image.Image, path: Path, max_bytes: int = 10240) -> None:
    """Square PNG for ChatGPT plugins / Apps SDK (hard 10 KB cap)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rgb = im.convert("RGB")
    buf = io.BytesIO()
    rgb.save(buf, format="PNG", optimize=True, compress_level=9)
    data = buf.getvalue()
    if len(data) >= max_bytes:
        raise SystemExit(f"{path.name} is {len(data)} bytes (cap {max_bytes})")
    path.write_bytes(data)
    print(f"  {path.relative_to(REPO)}  {len(data)} bytes")


def write_svg_logo(path: Path, fill: str, padded: bool = True) -> None:
    if padded:
        d = f"M{PAD} {PAD} H{PAD + SQUARE} V{PAD + SQUARE} H{PAD} Z M{PAD + SLOT_INSET_X} {PAD + SLOT_INSET_Y} H{PAD + SLOT_INSET_X + SLOT_W} V{PAD + SLOT_INSET_Y + SLOT_H} H{PAD + SLOT_INSET_X} Z"
        vb = CANVAS
    else:
        d = f"M0 0 H{SQUARE} V{SQUARE} H0 Z M{SLOT_INSET_X} {SLOT_INSET_Y} H{SLOT_INSET_X + SLOT_W} V{SLOT_INSET_Y + SLOT_H} H{SLOT_INSET_X} Z"
        vb = SQUARE
    path.write_text(
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}" width="{vb}" height="{vb}">
  <path fill="{fill}" fill-rule="evenodd" d="{d}"/>
</svg>
'''
    )


def write_app_icon_svg(path: Path) -> None:
    x, y, w, h = SLOT_INSET_X, SLOT_INSET_Y, SLOT_W, SLOT_H
    path.write_text(
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SQUARE} {SQUARE}" width="512" height="512">
  <rect width="{SQUARE}" height="{SQUARE}" fill="#000"/>
  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff"/>
</svg>
'''
    )


def write_wordmark_svg(path: Path, mark_fill: str, text_fill: str) -> None:
    # Unpadded 184-square mark, scaled to 140px, then "LifeOS".
    scale = 140 / SQUARE
    d = f"M0 0 H{SQUARE} V{SQUARE} H0 Z M{SLOT_INSET_X} {SLOT_INSET_Y} H{SLOT_INSET_X + SLOT_W} V{SLOT_INSET_Y + SLOT_H} H{SLOT_INSET_X} Z"
    path.write_text(
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 200" width="560" height="200">
  <g transform="translate(16,30) scale({scale:.6f})">
    <path fill="{mark_fill}" fill-rule="evenodd" d="{d}"/>
  </g>
  <text x="176" y="128" font-family="system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="88" font-weight="700" letter-spacing="-3" fill="{text_fill}">LifeOS</text>
</svg>
'''
    )


def write_favicon_svg(path: Path) -> None:
    """Adaptive tab icon: 16px inset so the square reads at 16–32 px."""
    inset = 16
    outer = CANVAS - inset * 2
    sx = inset + round(SLOT_INSET_X / SQUARE * outer)
    sy = inset + round(SLOT_INSET_Y / SQUARE * outer)
    sw = round(SLOT_W / SQUARE * outer)
    sh = round(SLOT_H / SQUARE * outer)
    d = f"M{inset} {inset} H{inset + outer} V{inset + outer} H{inset} Z M{sx} {sy} H{sx + sw} V{sy + sh} H{sx} Z"
    path.write_text(
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" width="{CANVAS}" height="{CANVAS}">
  <style>
    path {{ fill: #000; }}
    @media (prefers-color-scheme: dark) {{ path {{ fill: #fff; }} }}
  </style>
  <path fill-rule="evenodd" d="{d}"/>
</svg>
'''
    )


def make_wordmark_png(dark_surface: bool) -> Image.Image:
    width, height = 1120, 400
    fg = PAPER if dark_surface else INK
    im = Image.new("RGBA", (width, height), TRANSPARENT)
    mark = draw_mark(280, fill=fg, background=TRANSPARENT, padded=False)
    im.alpha_composite(mark, (40, (height - 280) // 2))
    draw = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT_BOLD, 168)
    draw.text((360, 108), "LifeOS", font=font, fill=fg)
    return im


def make_social_card() -> Image.Image:
    width, height = 1200, 630
    im = Image.new("RGBA", (width, height), WHITE)
    mark_size = 96
    mark = draw_mark(mark_size, fill=BLACK, background=WHITE, padded=False)
    font = ImageFont.truetype(FONT_BOLD, 72)
    tag_font = ImageFont.truetype(FONT_REG, 28)
    draw = ImageDraw.Draw(im)
    word = "LifeOS"
    bbox = draw.textbbox((0, 0), word, font=font)
    text_w = bbox[2] - bbox[0]
    gap = 28
    total = mark_size + gap + text_w
    x0 = (width - total) // 2
    y0 = 220
    im.alpha_composite(mark, (x0, y0))
    draw.text((x0 + mark_size + gap, y0 + 8), word, font=font, fill=BLACK)
    tag = "Every inbox. One connection."
    tb = draw.textbbox((0, 0), tag, font=tag_font)
    tw = tb[2] - tb[0]
    draw.text(((width - tw) // 2, y0 + mark_size + 28), tag, font=tag_font, fill=GRAY)
    return im


def make_favicon_ico(path: Path) -> None:
    sizes = [(16, 16), (32, 32), (48, 48)]
    src = draw_mark(48, fill=BLACK, background=WHITE, padded=False).convert("RGBA")
    src.save(path, format="ICO", sizes=sizes)


def ansi_banner(im: Image.Image, cols: int = 12) -> str:
    """Truecolor half-block art from a square RGBA image."""
    rows = cols
    small = im.convert("RGBA").resize((cols, rows * 2), Image.Resampling.NEAREST)

    def px(x: int, y: int) -> tuple[int, int, int, int]:
        return small.getpixel((x, y))

    def visible(c: tuple[int, int, int, int]) -> bool:
        return c[3] > 16

    lines: list[str] = []
    for y in range(rows):
        parts: list[str] = ["  "]
        for x in range(cols):
            top = px(x, y * 2)
            bot = px(x, y * 2 + 1)
            tv, bv = visible(top), visible(bot)
            if not tv and not bv:
                parts.append(" ")
                continue
            if tv and bv:
                parts.append(
                    f"\x1b[38;2;{top[0]};{top[1]};{top[2]};48;2;{bot[0]};{bot[1]};{bot[2]}m▀\x1b[0m"
                )
            elif tv:
                parts.append(f"\x1b[38;2;{top[0]};{top[1]};{top[2]}m▀\x1b[0m")
            else:
                parts.append(f"\x1b[38;2;{bot[0]};{bot[1]};{bot[2]}m▄\x1b[0m")
        line = "".join(parts).rstrip()
        if y == 1:
            line += "  LifeOS"
        if y == 2:
            line += "  every inbox, one connection"
        lines.append(line)
    return "\n".join(lines) + "\n"


def ascii_banner() -> str:
    return (
        "    ##########\n"
        "    ##      ##     LifeOS\n"
        "    ##########     every inbox, one connection\n"
    )


def js_string(s: str) -> str:
    return s.encode("unicode_escape").decode("ascii").replace('"', '\\"')


def write_cli_banner(ansi: str, ascii_art: str) -> None:
    CLI_BANNER.write_text(
        f"""// Generated from brand/svg/logo.svg — see brand/README.md. Do not edit by hand.

const ANSI_BANNER = "{js_string(ansi.rstrip(chr(10)))}";

const ASCII_BANNER = "{js_string(ascii_art.rstrip(chr(10)))}";

/** True when the terminal can render 24-bit color half-block art. */
function supportsTruecolor(): boolean {{
  if (!process.stdout.isTTY || process.env.NO_COLOR) return false;
  const ct = process.env.COLORTERM ?? "";
  if (/truecolor|24bit/i.test(ct)) return true;
  const term = process.env.TERM_PROGRAM ?? "";
  return ["iTerm.app", "Apple_Terminal", "vscode", "WarpTerminal", "ghostty"].includes(term);
}}

export function banner(): string {{
  return supportsTruecolor() ? ANSI_BANNER : ASCII_BANNER;
}}
"""
    )


def main() -> None:
    png = ROOT / "png"
    svg = ROOT / "svg"
    ascii_dir = ROOT / "ascii"
    plugin = ROOT / "chatgpt-plugin"
    png.mkdir(exist_ok=True)
    svg.mkdir(exist_ok=True)
    ascii_dir.mkdir(exist_ok=True)
    plugin.mkdir(exist_ok=True)

    write_svg_logo(svg / "logo.svg", "#09090b")
    write_svg_logo(svg / "logo-mono-black.svg", "#09090b")
    write_svg_logo(svg / "logo-mono-white.svg", "#ffffff")
    write_svg_logo(svg / "logo-mono-indigo.svg", "#6366f1")
    write_app_icon_svg(svg / "app-icon.svg")
    write_wordmark_svg(svg / "wordmark-light.svg", "#09090b", "#09090b")
    write_wordmark_svg(svg / "wordmark-dark.svg", "#fafafa", "#fafafa")
    write_favicon_svg(WEB_APP / "icon.svg")

    for size in (64, 128, 256, 512, 1024):
        save_png(draw_mark(size, fill=INK, padded=True), png / f"logo-{size}.png")

    for size in (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024):
        save_png(
            draw_mark(size, fill=BLACK, background=WHITE, padded=False),
            png / f"app-icon-{size}.png",
        )

    save_png(
        draw_mark(512, fill=INK, padded=True),
        png / "logo-mono-black-512.png",
    )
    save_png(
        draw_mark(512, fill=WHITE, background=INK, padded=True),
        png / "logo-mono-white-512.png",
    )
    save_png(
        draw_mark(512, fill=INDIGO, padded=True),
        png / "logo-mono-indigo-512.png",
    )

    save_png(make_wordmark_png(dark_surface=False), png / "wordmark-light.png")
    save_png(make_wordmark_png(dark_surface=True), png / "wordmark-dark.png")
    social = make_social_card()
    save_png(social, png / "social-card.png")

    apple = draw_mark(180, fill=BLACK, background=WHITE, padded=False)
    save_png(apple, WEB_APP / "apple-icon.png")
    save_png(social, WEB_APP / "opengraph-image.png")

    make_favicon_ico(ROOT / "favicon.ico")
    make_favicon_ico(WEB_APP / "favicon.ico")

    # ChatGPT plugin / Apps SDK: square PNG, >= 48px, < 10 KB.
    plugin_logo = draw_mark(512, fill=BLACK, background=WHITE, padded=False)
    save_chatgpt_png(plugin_logo, plugin / "logo.png")
    composer = draw_mark(128, fill=BLACK, background=WHITE, padded=False)
    save_chatgpt_png(composer, plugin / "composer-icon.png")
    WEB_PUBLIC.mkdir(parents=True, exist_ok=True)
    save_chatgpt_png(plugin_logo, WEB_PUBLIC / "logo.png")
    # Served for the logo's right-click menu alongside the ChatGPT PNG above.
    write_svg_logo(WEB_PUBLIC / "brandmark.svg", "#09090b")

    # White square, open slot — readable on dark terminals.
    art_src = draw_mark(256, fill=WHITE, background=TRANSPARENT, padded=False)
    ansi = ansi_banner(art_src)
    ascii_art = ascii_banner()
    (ascii_dir / "logo.ansi").write_text(ansi)
    (ascii_dir / "logo.txt").write_text(ascii_art)
    write_cli_banner(ansi, ascii_art)

    print("brand assets regenerated.")


if __name__ == "__main__":
    main()
