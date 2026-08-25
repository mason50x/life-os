"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * A link-button that acknowledges its own click. Every destination here hands
 * off to WorkOS, which loads before it replaces the page, so an inert button
 * reads as a dead one.
 *
 * The leading slot is a fixed-width well that animates to the spinner's width:
 * with no `leading` it opens from nothing and pushes the label over, and with
 * one it collapses whatever was there. Either way the two states read as one
 * object changing rather than a swap. The well carries its own margin and the
 * button drops its gap — a flex gap would apply to the empty well too and sit
 * the label off-center inside its padding.
 */
export function PendingButton({
  href,
  children,
  leading,
  leadingWidth = "w-0",
  variant,
  size = "lg",
}: {
  href: string;
  children: React.ReactNode;
  leading?: React.ReactNode;
  /** Width (and any margin) of the well at rest. */
  leadingWidth?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant={variant}
      size={size}
      className="gap-0"
      nativeButton={false}
      render={
        <Link href={href} aria-busy={pending} onClick={() => setPending(true)}>
          <span
            aria-hidden
            data-pending={pending}
            className={cn(
              "relative inline-flex h-6 items-center transition-[width,margin] duration-300 ease-out",
              pending ? "mr-2.5 w-4" : leadingWidth,
            )}
          >
            {leading ? (
              <span
                className={cn(
                  "absolute inset-y-0 left-0 flex items-center -space-x-1.5 transition-opacity duration-300 ease-out",
                  pending ? "opacity-0" : "opacity-100",
                )}
              >
                {leading}
              </span>
            ) : null}
            <span
              className={cn(
                "absolute inset-y-0 left-0 flex items-center transition-opacity duration-200 ease-out",
                pending ? "opacity-100 delay-150" : "opacity-0",
              )}
            >
              <Spinner />
            </span>
          </span>
          {children}
        </Link>
      }
    />
  );
}
