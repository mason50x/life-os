"use client";

/**
 * THROWAWAY harness — a filmstrip of the collapse. Each cell is the real
 * sidebar in its own frame, toggled and then frozen at a fixed point in the
 * transition, so the whole curve is legible in one screenshot.
 *
 * ?dir=out  collapse (default) · ?dir=in  expand
 * ?ms=0,40,…  the freeze points
 * ?h=520     cell height
 */

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

function Film() {
  const params = useSearchParams();
  const dir = params.get("dir") === "in" ? "in" : "out";
  const height = Number(params.get("h") ?? 520);
  const stops = (params.get("ms") ?? "0,60,120,180,240,300")
    .split(",")
    .map((s) => Number(s.trim()));
  const [ready, setReady] = useState(0);

  const freeze = useCallback(
    (frame: HTMLIFrameElement | null, ms: number) => {
      const doc = frame?.contentDocument;
      const win = frame?.contentWindow;
      if (!doc || !win) return "no frame";

      const label = dir === "out" ? "Collapse sidebar" : "Expand sidebar";
      const button = doc.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      if (!button) return "no button";

      // click() is a discrete event, so React commits the new classes before it
      // returns; reading a layout property forces the style recalc that starts
      // the transitions, which is what getAnimations() then hands back.
      button.click();
      void doc.documentElement.offsetHeight;
      const anims = doc.getAnimations();
      for (const a of anims) {
        a.pause();
        a.currentTime = ms;
      }
      return `${anims.length} anims`;
    },
    [dir],
  );

  // Driven from the page (on load) and from automation (window.__film()), so a
  // background tab that never fires rAF still ends up in the frozen state.
  const run = useCallback(() => {
    const out = [...document.querySelectorAll("iframe")].map((f, i) =>
      freeze(f as HTMLIFrameElement, stops[i]),
    );
    setReady((n) => n + 1);
    return out.join(" | ");
  }, [freeze, stops]);

  useEffect(() => {
    (window as unknown as { __film: () => string }).__film = run;
  }, [run]);

  return (
    <div className="min-h-dvh bg-background p-4">
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {dir === "out" ? "collapse" : "expand"} · frozen at {stops.join(" / ")} ms · {ready} runs
      </p>
      <div className="flex gap-3">
        {stops.map((ms, i) => (
          <div key={`${ms}-${i}`} className="flex flex-col gap-1">
            <span className="font-mono text-[0.65rem] text-muted-foreground">{ms}ms</span>
            <iframe
              title={`${ms}ms`}
              src={`/harness/sidebar?bare${dir === "in" ? "&collapsed" : ""}`}
              width={280}
              height={height}
              className="border bg-background"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Film />
    </Suspense>
  );
}
