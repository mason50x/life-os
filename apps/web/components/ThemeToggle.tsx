"use client";

import { MoonIcon, SunIcon } from "@heroicons/react/24/solid";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** `className` is for the hit area — public footers widen it for touch. */
export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className={cn("relative", className)} aria-label="Toggle theme">
            {/* Both icons stack centred; the dark class swaps which one is up.
                Sun spins out clockwise as the moon swings in from the left. */}
            <SunIcon className="theme-icon absolute inset-0 m-auto size-4 rotate-0 scale-100 opacity-100 dark:rotate-90 dark:scale-50 dark:opacity-0" />
            <MoonIcon className="theme-icon absolute inset-0 m-auto size-4 -rotate-90 scale-50 opacity-0 dark:rotate-0 dark:scale-100 dark:opacity-100" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
