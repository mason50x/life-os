import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { Inbox, KeyRound, Link2, Send, ShieldCheck, Terminal } from "lucide-react";
import { Logo } from "@/components/Logo";
import { FlowDiagram } from "@/components/FlowDiagram";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mcpUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

const steps = [
  {
    n: "01",
    title: "Connect your inboxes",
    body: "Sign in and link every Gmail, Outlook, and iCloud account you own — personal, work, all of them.",
  },
  {
    n: "02",
    title: "Add one MCP URL",
    body: "Paste your LifeOS endpoint into Claude, ChatGPT, Cursor, or any MCP client — or run a single CLI command.",
  },
  {
    n: "03",
    title: "Just ask",
    body: "“What did my landlord say last week?” Your AI searches every inbox at once and answers.",
  },
];

const features = [
  {
    icon: ShieldCheck,
    title: "Nothing stored",
    body: "LifeOS never stores your email. Every request passes straight through to Gmail, Outlook, or iCloud and comes straight back.",
  },
  {
    icon: Inbox,
    title: "Unlimited accounts",
    body: "Connect as many inboxes as you like. They all meet behind one endpoint, searchable together or one at a time.",
  },
  {
    icon: Link2,
    title: "One URL, every client",
    body: "A single MCP endpoint works everywhere MCP does — Claude, ChatGPT, Claude Code, Cursor, and whatever ships next.",
  },
  {
    icon: KeyRound,
    title: "Auth done properly",
    body: "OAuth end to end with WorkOS AuthKit for Google and Microsoft; iCloud app-specific passwords stay encrypted. Credentials never reach your AI tools.",
  },
  {
    icon: Send,
    title: "The full toolkit",
    body: "Search threads, read messages, manage labels, archive, draft, and send — the whole inbox surface, exposed as MCP tools.",
  },
  {
    icon: Terminal,
    title: "Dashboard and CLI",
    body: "A clean dashboard for humans and a lifeos CLI for terminals. Same accounts, same connection.",
  },
];

export default async function Home() {
  // Reading the session makes this route dynamic; signed-in users skip the pitch.
  const { user } = await withAuth();
  if (user) redirect("/dashboard");

  const endpoint = mcpUrl();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between border-x px-6">
          <span className="flex items-center gap-2 text-lg font-normal tracking-tight">
            <Logo size={26} />
            LifeOS
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" nativeButton={false} render={<Link href="/login">Sign in</Link>} />
            <Button nativeButton={false} render={<Link href="/login">Get started</Link>} />
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 border-x">
        {/* Hero — copy left, flow diagram right */}
        <section className="relative border-b">
          <Cross className="-bottom-[8.5px] -left-[8.5px]" />
          <Cross className="-bottom-[8.5px] -right-[8.5px]" />
          <div className="grid items-center gap-x-8 gap-y-16 px-6 py-20 sm:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:py-28">
            <div>
              <Badge variant="outline" className="mb-6">
                Free while in beta
              </Badge>
              <h1 className="text-balance text-5xl font-thin tracking-tight sm:text-6xl xl:text-7xl">
                Every inbox.
                <br />
                One connection.
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
                LifeOS turns all of your email accounts into a single MCP connection for Claude,
                ChatGPT, and every AI tool you use. Connect once, then just ask.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button size="lg" nativeButton={false} render={<Link href="/login">Connect your inboxes</Link>} />
                <Button
                  size="lg"
                  variant="outline"
                  nativeButton={false}
                  render={
                    <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">
                      What is MCP?
                    </a>
                  }
                />
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <FlowDiagram />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="relative border-b">
          <Cross className="-bottom-[8.5px] -left-[8.5px]" />
          <Cross className="-bottom-[8.5px] -right-[8.5px]" />
          <SectionHeading label="How it works" title="Three steps, then it disappears" />
          <div className="grid border-t sm:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.n} className={cn("px-6 py-10 sm:px-10", i > 0 && "border-t sm:border-l sm:border-t-0")}>
                <span className="font-mono text-sm text-muted-foreground">{s.n}</span>
                <h3 className="mt-3 text-lg font-normal">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="border-t px-6 py-10 sm:px-10">
            <div className="border bg-black font-mono text-sm text-white">
              <div className="flex items-center gap-1.5 border-b border-white/15 px-4 py-3">
                <span className="size-2.5 rounded-full bg-white/25" />
                <span className="size-2.5 rounded-full bg-white/25" />
                <span className="size-2.5 rounded-full bg-white/25" />
              </div>
              <div className="overflow-x-auto px-4 py-4">
                <p className="whitespace-nowrap">
                  <span className="select-none text-white/40">$ </span>
                  claude mcp add -t http lifeos {endpoint}
                </p>
                <p className="mt-2 whitespace-nowrap text-white/40"># or paste the URL into any MCP client</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="relative border-b">
          <Cross className="-bottom-[8.5px] -left-[8.5px]" />
          <Cross className="-bottom-[8.5px] -right-[8.5px]" />
          <SectionHeading label="What you get" title="Built like infrastructure, not another inbox" />
          <div className="grid gap-px border-t bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="bg-background px-6 py-10 sm:px-10">
                <f.icon className="size-5 text-muted-foreground" aria-hidden />
                <h3 className="mt-4 text-lg font-normal">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="flex flex-col items-center px-6 py-24 text-center">
          <h2 className="text-balance text-4xl font-thin tracking-tight sm:text-5xl">
            Connect once. Then just ask.
          </h2>
          <p className="mt-4 max-w-md text-pretty text-muted-foreground">
            Free while in beta. Your email stays with your provider — LifeOS is just the wire.
          </p>
          <Button size="lg" className="mt-8" nativeButton={false} render={<Link href="/login">Get started</Link>} />
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 border-x px-6 py-10 sm:flex-row sm:items-center">
          <span className="flex items-center gap-2 text-sm">
            <Logo size={20} />
            LifeOS
            <span className="text-muted-foreground">— your email, your rules</span>
          </span>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              MCP
            </a>
            <span>© {new Date().getFullYear()} LifeOS</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ label, title }: { label: string; title: string }) {
  return (
    <div className="px-6 py-10 sm:px-10">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <h2 className="mt-2 text-3xl font-thin tracking-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

/** Vercel-style crosshair marking a grid intersection. */
function Cross({ className }: { className?: string }) {
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
