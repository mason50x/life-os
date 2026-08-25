import { cn } from "@/lib/utils";

/**
 * A crosshair marking a grid intersection — the landing page's signature, and
 * the dashboard's. Position it with the half-size offsets (`-left-[8.5px]`,
 * `-bottom-2`, …) so its centre lands on the rule it marks rather than beside
 * it. Half a pixel of the 16px box is the hairline itself.
 */
export function Cross({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn("pointer-events-none absolute z-10 size-4 text-muted-foreground/60", className)}
    >
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
