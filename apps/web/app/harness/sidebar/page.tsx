"use client";

/**
 * THROWAWAY harness — renders the dashboard sidebar with fake data so the
 * collapse animation can be watched in isolation. Delete before shipping.
 *
 * ?bare       drop the page column, so the frame is just the rail
 * ?collapsed   start collapsed
 * ?auto=out|in toggle on mount, so a plain screenshot catches the transition
 * ?freeze=120  …and pin it at that many ms in, so the frame is reproducible
 * ?tint        paint the first nav row as if it were hovered / the live page
 */

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";

const accounts = [
  {
    id: "1",
    email: "masonsyzn@gmail.com",
    provider: "gmail" as const,
    status: "active" as const,
    capabilities: ["email" as const, "calendar" as const],
  },
  {
    id: "2",
    email: "mason@cognify.software",
    provider: "gmail" as const,
    status: "active" as const,
    capabilities: ["email" as const, "calendar" as const],
  },
  {
    id: "3",
    email: "mason.long.address@outlook.com",
    provider: "outlook" as const,
    status: "needs_reauth" as const,
    capabilities: ["email" as const],
  },
  {
    id: "4",
    email: "mason@icloud.com",
    provider: "icloud" as const,
    status: "active" as const,
    capabilities: ["email" as const],
  },
];

function Harness() {
  const params = useSearchParams();
  const bare = params.get("bare") !== null;
  const auto = params.get("auto");
  const freeze = params.get("freeze");

  // Screenshot driver: fire the toggle, then hold every transition it started
  // at one instant, so a still frame can be taken anywhere along the curve.
  useEffect(() => {
    if (!auto) return;
    const label = auto === "in" ? "Expand sidebar" : "Collapse sidebar";
    const id = setTimeout(() => {
      document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
      if (freeze === null) return;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const anims = document.getAnimations();
          for (const a of anims) {
            a.pause();
            a.currentTime = Number(freeze);
          }
          document.title = `frozen ${freeze}ms · ${anims.length} anims`;
        }),
      );
    }, 100);
    return () => clearTimeout(id);
  }, [auto, freeze]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {params.get("tint") !== null && (
        <style>{`nav > a:first-of-type { background: var(--muted); font-weight: 600 }`}</style>
      )}
      <AppSidebar
        user={{ name: "Mason Sy", email: "masonsyzn@gmail.com" }}
        accounts={accounts}
        defaultCollapsed={params.get("collapsed") !== null}
        signOut={async () => {}}
      />
      {!bare && (
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center border-b px-6 text-sm text-muted-foreground">
            Sidebar animation harness
          </header>
          <main className="flex-1 p-6">
            <div className="h-40 border border-dashed" />
          </main>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Harness />
    </Suspense>
  );
}
