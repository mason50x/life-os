"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CapabilityIcons,
  ProviderMark,
  connectRoutes,
  providerCapabilities,
  providerLabel,
} from "./ProviderMark";

export function AddAccountMenu({
  children,
  align = "end",
  side = "bottom",
}: {
  /** The trigger. Rendered as-is, so pass a button. */
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={children as React.ReactElement<Record<string, unknown>>} />
      <DropdownMenuContent align={align} side={side} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Connect an account</DropdownMenuLabel>
          {connectRoutes.map((r) => (
            <DropdownMenuItem
              key={r.provider}
              className="gap-2.5 py-1.5"
              render={
                // OAuth routes are plain <a> — a Next.js prefetch of an external
                // redirect would burn the state cookie before the click.
                r.href.startsWith("/api") ? <a href={r.href} /> : <Link href={r.href} />
              }
            >
              <ProviderMark provider={r.provider} />
              {providerLabel[r.provider]}
              <CapabilityIcons
                capabilities={providerCapabilities[r.provider]}
                className="ml-auto"
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
