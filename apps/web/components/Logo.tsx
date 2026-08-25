/**
 * The mark: a solid square with a mail-slot cutout, monochrome, following text
 * color. With `interactive`, the slot drops from the top of the square to the
 * bottom on hover — identical inset from the edge either way, so it throws like
 * a lightswitch. Drive it from a parent carrying `group/logo`.
 */
export function Logo({ size = 28, interactive = false }: { size?: number; interactive?: boolean }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true">
      <rect x="36" y="36" width="184" height="184" fill="currentColor" />
      {/* Slot sits 48 below the square's top edge; 60 down puts it 48 above the
          bottom edge. Painted in the page color rather than punched out with a
          mask so the two rects need no shared id. */}
      <rect
        x="72"
        y="84"
        width="112"
        height="28"
        fill="var(--background)"
        className={
          interactive
            ? "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/logo:translate-y-[60px]"
            : undefined
        }
      />
    </svg>
  );
}
