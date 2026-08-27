/**
 * Hero diagram: provider inboxes flow into the LifeOS hub, which flows out to
 * AI agents. Pure SVG + CSS (`.flow-dash` in globals.css) — no client JS.
 * All paths use pathLength={100} so one dash cycle equals one full traversal,
 * letting inbound and outbound pulses on the same row stay in phase through
 * the hub. Brand marks live in `brand-marks.tsx`.
 *
 * Two layouts, swapped by a media query rather than by JS so the first paint
 * is right either way. The landscape one squeezed into a phone would render
 * its 11-unit labels at about 6px — the portrait one turns the flow through 90°
 * so a 320-unit viewBox fills the screen width and the labels come back up to
 * size. The hub's wordmark moves alongside it: under the tile when there's
 * room beneath, beside it when the outbound lanes need that space.
 */

import {
  ChatGPTMark,
  ClaudeCodeMark,
  ClaudeMark,
  GmailMark,
  ICloudMark,
  OutlookMark,
} from "@/components/brand-marks";

const TILE = 56;
const HUB = 84;

const sources = [
  { label: "Gmail", glyph: <GmailMark /> },
  { label: "Outlook", glyph: <OutlookMark /> },
  { label: "iCloud", glyph: <ICloudMark /> },
];

// `tile` paints the whole square in the product's brand color; the glyph then
// sits on it in reverse. Without it a tile is a plain bordered card.
const agents = [
  { label: "Claude", tile: "#D97757", glyph: <ClaudeMark fill="#FFFFFF" /> },
  { label: "ChatGPT", glyph: <ChatGPTMark /> },
  // The prompt glyph is two thin strokes where the others are solid marks, so
  // it needs more of the tile to carry the same weight.
  { label: "Claude Code", tile: "#1F1E1D", glyph: <ClaudeCodeMark />, glyphSize: 38 },
];

interface Layout {
  id: string;
  viewBox: string;
  /** Centre of each source tile, top row first / left column first. */
  from: [number, number][];
  to: [number, number][];
  hub: [number, number];
  /** Where the "LifeOS" caption sits relative to the hub tile. */
  caption: { x: number; y: number; anchor: "middle" | "start"; size: number };
  inbound: string[];
  outbound: string[];
}

const landscape: Layout = {
  id: "h",
  viewBox: "0 0 560 480",
  from: [
    [68, 88],
    [68, 240],
    [68, 392],
  ],
  to: [
    [492, 88],
    [492, 240],
    [492, 392],
  ],
  hub: [280, 240],
  caption: { x: 280, y: 240 + HUB / 2 + 28, anchor: "middle", size: 12 },
  inbound: [
    "M96 88 C 178 88, 166 240, 236 240",
    "M96 240 H 236",
    "M96 392 C 178 392, 166 240, 236 240",
  ],
  outbound: [
    "M324 240 C 394 240, 382 88, 464 88",
    "M324 240 H 464",
    "M324 240 C 394 240, 382 392, 464 392",
  ],
};

const portrait: Layout = {
  id: "v",
  viewBox: "0 0 320 500",
  from: [
    [56, 40],
    [160, 40],
    [264, 40],
  ],
  to: [
    [56, 430],
    [160, 430],
    [264, 430],
  ],
  hub: [160, 240],
  // Beside the tile, not under it: the outbound lanes leave from the bottom
  // edge here, so the mark and the wordmark read as the header's lockup does.
  caption: { x: 160 + HUB / 2 + 18, y: 245, anchor: "start", size: 14 },
  inbound: [
    "M56 68 C 56 139, 160 129, 160 190",
    "M160 68 V 190",
    "M264 68 C 264 139, 160 129, 160 190",
  ],
  outbound: [
    "M160 290 C 160 355, 56 346, 56 402",
    "M160 290 V 402",
    "M160 290 C 160 355, 264 346, 264 402",
  ],
};

// Row-staggered so the three lanes pulse in sequence; negative delays mean
// every lane is already mid-flight on first paint.
const rowDelay = ["-0.2s", "-1.2s", "-2.2s"];

export function FlowDiagram() {
  return (
    <>
      <Diagram layout={portrait} className="w-full max-w-[22rem] sm:hidden" />
      <Diagram layout={landscape} className="hidden w-full max-w-[420px] sm:block" />
    </>
  );
}

function Diagram({ layout, className }: { layout: Layout; className: string }) {
  const [hx, hy] = layout.hub;
  const glow = `hub-glow-${layout.id}`;

  return (
    <svg
      viewBox={layout.viewBox}
      role="img"
      aria-label="Diagram: Gmail, Outlook, and iCloud flow into LifeOS, which connects out to Claude, ChatGPT, and Claude Code."
      className={className}
    >
      <defs>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--foreground)" stopOpacity="0.07" />
          <stop offset="1" stopColor="var(--foreground)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={hx} cy={hy} r="150" fill={`url(#${glow})`} />

      {/* Static rails */}
      {[...layout.inbound, ...layout.outbound].map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--border)" strokeWidth="1" />
      ))}

      {/* Traveling pulses */}
      {[layout.inbound, layout.outbound].map((lane, l) =>
        lane.map((d, i) => (
          <path
            key={`${l}-${d}`}
            d={d}
            pathLength={100}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="flow-dash"
            style={{ animationDelay: rowDelay[i] }}
          />
        )),
      )}

      {sources.map((n, i) => (
        <Node key={n.label} {...n} cx={layout.from[i][0]} cy={layout.from[i][1]} />
      ))}
      {agents.map((n, i) => (
        <Node key={n.label} {...n} cx={layout.to[i][0]} cy={layout.to[i][1]} />
      ))}

      {/* The hub: full-bleed mail-slot tile, same geometry as the app icon. */}
      <g>
        <rect
          x={hx - HUB / 2 - 8}
          y={hy - HUB / 2 - 8}
          width={HUB + 16}
          height={HUB + 16}
          fill="none"
          stroke="var(--border)"
        />
        <rect x={hx - HUB / 2} y={hy - HUB / 2} width={HUB} height={HUB} fill="var(--foreground)" />
        <rect
          x={hx - 25.6}
          y={hy - 20.1}
          width={51.2}
          height={12.9}
          fill="var(--background)"
          className="hub-slot"
        />
        <text
          x={layout.caption.x}
          y={layout.caption.y}
          textAnchor={layout.caption.anchor}
          fontSize={layout.caption.size}
          className="fill-foreground"
        >
          LifeOS
        </text>
      </g>
    </svg>
  );
}

function Node({
  label,
  cx,
  cy,
  glyph,
  tile,
  glyphSize = 28,
}: {
  label: string;
  cx: number;
  cy: number;
  glyph: React.ReactNode;
  tile?: string;
  /** Rendered size of the 24-unit glyph inside the 56-unit tile. */
  glyphSize?: number;
}) {
  return (
    <g>
      <rect
        x={cx - TILE / 2}
        y={cy - TILE / 2}
        width={TILE}
        height={TILE}
        fill={tile ?? "var(--card)"}
        stroke="var(--border)"
      />
      <g transform={`translate(${cx - glyphSize / 2} ${cy - glyphSize / 2}) scale(${glyphSize / 24})`}>
        {glyph}
      </g>
      <text x={cx} y={cy + TILE / 2 + 18} textAnchor="middle" fontSize="11" className="fill-muted-foreground">
        {label}
      </text>
    </g>
  );
}
