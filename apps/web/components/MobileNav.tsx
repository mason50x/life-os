"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Bars3Icon, ChevronRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";
import { ConnectButton } from "@/components/ConnectButton";
import { Logo } from "@/components/Logo";
import { PendingButton } from "@/components/PendingButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The public header's menu below `sm`, where "Sign in" and the CTA can't sit
 * beside the lockup without crushing it.
 *
 * A sheet dropping out of the header rather than a dropdown: the CTA is the
 * point of the page, so it gets the same full-size button it has in the hero
 * instead of a menu row. The sheet's own top row repeats the header's 64px
 * lockup so the panel reads as the header opening, not as something landing
 * on top of it.
 *
 * The panel only mounts once opened, so nothing here renders on the server —
 * reading the active theme straight from `next-themes` can't mismatch.
 */
const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  // A route handler that hands off to a mail composer, so a plain anchor.
  { href: "/support", label: "Support", external: true },
];

const themes = ["light", "dark", "system"] as const;

export function MobileNav({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button variant="ghost" size="icon" aria-label="Open menu" className={cn("-mr-2 size-11", className)}>
            <Bars3Icon className="size-5" />
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <Dialog.Popup className="fixed inset-x-0 top-0 z-[70] max-h-dvh overflow-y-auto overscroll-contain border-b bg-background outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-4 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-4">
          <Dialog.Title className="sr-only">Menu</Dialog.Title>

          <div className="flex h-16 items-center justify-between border-b px-6">
            <span className="flex items-center gap-2 text-lg font-normal tracking-tight">
              <Logo size={26} />
              LifeOS
            </span>
            <Dialog.Close
              render={
                <Button variant="ghost" size="icon" aria-label="Close menu" className="-mr-2 size-11">
                  <XMarkIcon className="size-5" />
                </Button>
              }
            />
          </div>

          <div className="px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <ConnectButton className="h-11 w-full" />
            <PendingButton href="/login" variant="outline" className="mt-3 h-11 w-full">
              Sign in
            </PendingButton>

            <nav className="mt-8 border-t">
              {links.map((l) => (
                <Dialog.Close
                  key={l.href}
                  nativeButton={false}
                  render={
                    l.external ? (
                      <a href={l.href} className={rowClass} />
                    ) : (
                      <Link href={l.href} className={rowClass} />
                    )
                  }
                >
                  {l.label}
                  <ChevronRightIcon className="size-4 text-muted-foreground/60" />
                </Dialog.Close>
              ))}
            </nav>

            <p className="mt-8 font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Theme
            </p>
            <div className="mt-3 grid grid-cols-3 border">
              {themes.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  aria-pressed={theme === t}
                  className={cn(
                    "h-11 text-sm capitalize transition-colors",
                    i > 0 && "border-l",
                    theme === t
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** 56px rows, hairline between — a touch target the whole width of the sheet. */
const rowClass =
  "flex h-14 w-full items-center justify-between border-b text-base text-muted-foreground transition-colors hover:text-foreground";
