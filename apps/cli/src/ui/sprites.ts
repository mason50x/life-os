/**
 * Pixel art for the rail. Each sprite is a 6×2 bitmap that folds into three
 * quadrant block characters — one terminal cell holds a 2×2 pixel square, so
 * the icons stay a single row tall and the rail keeps its height.
 */

/** Indexed by the four pixels, read TL, TR, BL, BR as bits 8/4/2/1. */
const QUADRANTS = [
  " ", "▗", "▖", "▄", "▝", "▐", "▞", "▟",
  "▘", "▚", "▌", "▙", "▀", "▜", "▛", "█",
] as const;

/**
 * Fold a bitmap — two equal-length rows of `#` (on) and anything else (off) —
 * into one line of block characters. Rows of odd width get a blank last pixel.
 */
export function sprite([top, bottom]: [string, string]): string {
  let out = "";
  for (let x = 0; x < top.length; x += 2) {
    const bit = (row: string, at: number) => (row[at] === "#" ? 1 : 0);
    out +=
      QUADRANTS[
        (bit(top, x) << 3) | (bit(top, x + 1) << 2) | (bit(bottom, x) << 1) | bit(bottom, x + 1)
      ];
  }
  return out;
}

/** Keyed by nav key. Anything unlisted renders as blank, not as a broken glyph. */
export const NAV_SPRITES: Record<string, string> = {
  // Envelope, flap notched into the middle.
  accounts: sprite(["##..##", "######"]),
  // Two blocks joined by a link.
  mcp: sprite(["###.##", "##.###"]),
  // Bow, shaft, one tooth.
  keys: sprite(["#####.", "##.#.."]),
  // Two beats and a baseline.
  doctor: sprite([".#.#..", "#.#.##"]),
  // Gear, teeth top and bottom.
  settings: sprite(["#.##.#", "##..##"]),
};

/** Cells a sprite occupies, so the rail can reserve the same width for all. */
export const SPRITE_WIDTH = 3;
