/**
 * Hero diagram: provider inboxes flow into the LifeOS hub, which flows out to
 * AI agents. Pure SVG + CSS (`.flow-dash` in globals.css) — no client JS.
 * All paths use pathLength={100} so one dash cycle equals one full traversal,
 * letting inbound and outbound pulses on the same row stay in phase through
 * the hub. Brand marks live in `brand-marks.tsx`.
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
  { label: "Gmail", cx: 68, cy: 88, glyph: <GmailMark /> },
  { label: "Outlook", cx: 68, cy: 240, glyph: <OutlookMark /> },
  { label: "iCloud", cx: 68, cy: 392, glyph: <ICloudMark /> },
];

// `tile` paints the whole square in the product's brand color; the glyph then
// sits on it in reverse. Without it a tile is a plain bordered card.
const agents = [
  { label: "Claude", cx: 492, cy: 88, tile: "#D97757", glyph: <ClaudeMark fill="#FFFFFF" /> },
  { label: "ChatGPT", cx: 492, cy: 240, glyph: <ChatGPTMark /> },
  { label: "Claude Code", cx: 492, cy: 392, tile: "#1F1E1D", glyph: <ClaudeCodeMark /> },
];

const inbound = [
  "M96 88 C 178 88, 166 240, 236 240",
  "M96 240 H 236",
  "M96 392 C 178 392, 166 240, 236 240",
];

const outbound = [
  "M324 240 C 394 240, 382 88, 464 88",
  "M324 240 H 464",
  "M324 240 C 394 240, 382 392, 464 392",
];

// Row-staggered so the three lanes pulse in sequence; negative delays mean
// every lane is already mid-flight on first paint.
const rowDelay = ["-0.2s", "-1.2s", "-2.2s"];

export function FlowDiagram() {
  return (
    <svg
      viewBox="0 0 560 480"
      role="img"
      aria-label="Diagram: Gmail, Outlook, and iCloud flow into LifeOS, which connects out to Claude, ChatGPT, and Claude Code."
      className="w-full max-w-[560px]"
    >
      <defs>
        <radialGradient id="hub-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--foreground)" stopOpacity="0.07" />
          <stop offset="1" stopColor="var(--foreground)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="280" cy="240" r="150" fill="url(#hub-glow)" />

      {/* Static rails */}
      {[...inbound, ...outbound].map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--border)" strokeWidth="1" />
      ))}

      {/* Traveling pulses */}
      {inbound.map((d, i) => (
        <path
          key={d}
          d={d}
          pathLength={100}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="flow-dash"
          style={{ animationDelay: rowDelay[i] }}
        />
      ))}
      {outbound.map((d, i) => (
        <path
          key={d}
          d={d}
          pathLength={100}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="flow-dash"
          style={{ animationDelay: rowDelay[i] }}
        />
      ))}

      {sources.map((n) => (
        <Node key={n.label} {...n} />
      ))}
      {agents.map((n) => (
        <Node key={n.label} {...n} />
      ))}

      {/* The hub: full-bleed mail-slot tile, same geometry as the app icon. */}
      <g>
        <rect
          x={280 - HUB / 2 - 8}
          y={240 - HUB / 2 - 8}
          width={HUB + 16}
          height={HUB + 16}
          fill="none"
          stroke="var(--border)"
        />
        <rect x={280 - HUB / 2} y={240 - HUB / 2} width={HUB} height={HUB} fill="var(--foreground)" />
        <rect
          x={254.4}
          y={219.9}
          width={51.2}
          height={12.9}
          fill="var(--background)"
          className="hub-slot"
        />
        <text
          x={280}
          y={240 + HUB / 2 + 28}
          textAnchor="middle"
          fontSize="12"
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
}: {
  label: string;
  cx: number;
  cy: number;
  glyph: React.ReactNode;
  tile?: string;
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
      <g transform={`translate(${cx - 14} ${cy - 14}) scale(${28 / 24})`}>{glyph}</g>
      <text x={cx} y={cy + TILE / 2 + 18} textAnchor="middle" fontSize="11" className="fill-muted-foreground">
        {label}
      </text>
    </g>
  );
}
