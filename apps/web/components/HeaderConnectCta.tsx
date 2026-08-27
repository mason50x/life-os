"use client";

import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { cn } from "@/lib/utils";

/**
 * The hero's "Connect my Accounts" button, mirrored into the header for as
 * long as the real one is out of sight.
 *
 * The observer's root is inset by the header's own height, so the handover
 * happens at the moment the hero button slides under the sticky bar rather
 * than when it leaves the viewport — the CTA is never absent from the screen.
 *
 * Width animates from nothing to the button's measured width, so the button
 * opens the space it needs instead of jumping "Sign in" sideways. The measure
 * is what makes the transition land exactly on the content: a `max-width`
 * guess would finish early and stall. The clip margin leaves the focus ring
 * room to sit outside the box, but only once it is open — a clip margin on a
 * zero-width box still counts toward the document's scroll width, and with the
 * page column touching both edges that is 8px of sideways scroll on a phone.
 *
 * Below `sm` there is no room to dock into — the hamburger carries the CTA
 * there — so it stays collapsed. Collapsed, not `display: none`: the provider
 * marks share one set of gradient ids across every copy on the page, and a
 * duplicate id resolves to the first in document order. Hide this one and it
 * is still what the hero's and the menu's copies paint from, so all three
 * come out blank.
 */
export function HeaderConnectCta({
  watch,
  headerHeight = 64,
}: {
  /** Element id of the hero button to shadow. */
  watch: string;
  headerHeight?: number;
}) {
  const [docked, setDocked] = useState(false);
  const [dockable, setDockable] = useState(true);
  const [width, setWidth] = useState(0);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 40rem)");
    const sync = () => setDockable(wide.matches);
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const target = document.getElementById(watch);
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setDocked(!entry.isIntersecting),
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [watch, headerHeight]);

  useEffect(() => {
    const el = content.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.offsetWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const open = docked && dockable;

  return (
    <div
      style={{ width: open ? width : 0 }}
      className={cn(
        "overflow-clip transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        open && "[overflow-clip-margin:8px]",
      )}
    >
      {/* `w-max` keeps the button at its natural size while the box around it
          is still collapsing — a block child would shrink with it. */}
      <div
        ref={content}
        inert={!open}
        className={cn(
          "w-max pl-2 transition-[opacity,translate,scale] duration-300 ease-out motion-reduce:transition-none",
          open
            ? "translate-y-0 scale-100 opacity-100 delay-150"
            : "-translate-y-1 scale-95 opacity-0",
        )}
      >
        <ConnectButton compact />
      </div>
    </div>
  );
}
