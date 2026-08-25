import Link from "next/link";
import { Cross } from "@/components/Cross";

/** Title block: document name, when it took effect, and the plain-English gist. */
export function LegalHeader({
  title,
  effective,
  summary,
}: {
  title: string;
  effective: string;
  summary: React.ReactNode[];
}) {
  return (
    <header className="mb-16">
      <h1 className="text-balance text-4xl font-normal tracking-tighter sm:text-5xl">{title}</h1>
      <p className="mt-4 font-mono text-xs tracking-widest text-muted-foreground uppercase">
        In effect since {effective}
      </p>

      <div className="relative mt-10 border p-6 sm:p-8">
        <Cross className="-top-[8.5px] -left-[8.5px]" />
        <Cross className="-right-[8.5px] -bottom-[8.5px]" />
        <h2 className="text-sm font-medium">The short version</h2>
        <ul className="mt-4 flex flex-col gap-2">
          {summary.map((line, i) => (
            <li key={i} className="flex gap-3 leading-relaxed text-muted-foreground">
              <span aria-hidden className="select-none text-muted-foreground/60">
                —
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          The summary is not the agreement. Everything below it is.
        </p>
      </div>
    </header>
  );
}

/** Jump list. Section numbers match the `Section` headings one for one. */
export function Contents({ sections }: { sections: { id: string; title: string }[] }) {
  return (
    <nav aria-label="Contents" className="mb-16 border-t pt-8">
      <h2 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Contents</h2>
      <ol className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {sections.map((s, i) => (
          <li key={s.id} className="flex gap-3 text-sm">
            <span className="font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            <Link href={`#${s.id}`} className="text-muted-foreground transition-colors hover:text-foreground">
              {s.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t pt-10 pb-10 last:pb-0">
      <h2 className="flex gap-4 text-2xl font-normal tracking-tighter">
        <span className="mt-1.5 font-mono text-sm text-muted-foreground">
          {String(n).padStart(2, "0")}
        </span>
        {title}
      </h2>
      <div className="mt-4 sm:pl-10">{children}</div>
    </section>
  );
}
