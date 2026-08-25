import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The pieces every dashboard page is built from. Whitespace separates the
 * sections and a single border frames each one's content — the landing page's
 * full-bleed bands and crosshairs need dense material either side of a rule to
 * read as structure, and a dashboard section is mostly a heading and a short
 * list. Hairlines here earn their place by dividing things, not by decorating.
 */

export function PageHeader({
  title,
  icon: Icon,
  action,
}: {
  title: string;
  /** The solid twin of the sidebar row that leads here — filled, so the two
      read as the same item seen once in the rail and once at the top. */
  icon: React.ComponentType<React.ComponentProps<"svg">>;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="size-5 shrink-0" aria-hidden />
        <h1 className="truncate text-lg font-medium tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto scroll-smooth">
      <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-8">{children}</div>
    </main>
  );
}

/**
 * A titled block. The title carries it alone — set at the landing page's
 * heading weight, which reads as bold against a body set in `font-light`.
 * Anything that would have been a subheading belongs in the content or in the
 * page's closing note.
 */
export function Section({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-normal tracking-tighter">{title}</h2>
        {action}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** The bordered box a section's content sits in. Square, like everything. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("border", className)}>{children}</div>;
}

/**
 * Borders for one cell of a grid inside a Panel — the Panel draws the outside,
 * so cells only draw the edges between them. `cols` is how many the grid has
 * at `sm` and up; below that it's always one column.
 */
export function cellBorders(i: number, cols: 2 | 3) {
  return cn(
    i > 0 && "border-t",
    i > 0 && i < cols && "sm:border-t-0",
    i % cols !== 0 && "sm:border-l",
  );
}

/** One cell of the status strip. With `href` the whole cell is the link. */
export function Stat({
  label,
  value,
  note,
  href,
  dot,
  className,
}: {
  label: string;
  value: string;
  note: React.ReactNode;
  href?: string;
  dot?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 flex items-center gap-2.5 text-4xl tracking-tighter">
        {dot && (
          <span
            className="size-2 rounded-full bg-foreground motion-safe:animate-pulse"
            aria-hidden
          />
        )}
        {value}
      </p>
      <p className="mt-1 truncate text-sm text-muted-foreground">{note}</p>
    </>
  );

  const classes = cn("block px-5 py-6", className);
  return href ? (
    <Link href={href} className={cn(classes, "transition-colors hover:bg-muted")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
