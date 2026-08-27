import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  CalendarDaysIcon,
  CommandLineIcon,
  InboxStackIcon,
  KeyIcon,
  LinkIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { ConnectButton } from "@/components/ConnectButton";
import { Cross } from "@/components/Cross";
import { PendingButton } from "@/components/PendingButton";
import { BrandMenu } from "@/components/BrandMenu";
import { Logo } from "@/components/Logo";
import { FlowDiagram } from "@/components/FlowDiagram";
import { McpReaderTrigger, ReaderShell } from "@/components/McpReader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const steps = [
  {
    n: "01",
    title: "Connect your accounts",
    body: "Sign in and link every Gmail, Outlook, and iCloud account you own. Google and iCloud bring their calendars along with their mail.",
  },
  {
    n: "02",
    title: "Add one MCP URL",
    body: "Paste your LifeOS endpoint into Claude, ChatGPT, Cursor, or any MCP client — or run a single CLI command.",
  },
  {
    n: "03",
    title: "Just ask",
    body: "“What did my landlord say last week?” “Am I free Thursday afternoon?” Your AI reads every account at once and answers.",
  },
];

const features = [
  {
    icon: ShieldCheckIcon,
    title: "Nothing stored",
    body: "LifeOS never stores your email or your calendar. Every request passes straight through to Gmail, Google Calendar, Outlook, or iCloud and comes straight back.",
  },
  {
    icon: InboxStackIcon,
    title: "Every inbox, all of it",
    body: "Search threads, read messages, manage labels, archive, draft, and send \u2014 the whole mailbox surface, across as many accounts as you like.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Every calendar too",
    body: "List calendars, find gaps that are actually free, create and move events, invite people, RSVP \u2014 across every connected account at once.",
  },
  {
    icon: LinkIcon,
    title: "One URL, every client",
    body: "A single MCP endpoint works everywhere MCP does — Claude, ChatGPT, Claude Code, Cursor, and whatever ships next.",
  },
  {
    icon: KeyIcon,
    title: "Auth done properly",
    body: "OAuth end to end with WorkOS AuthKit for Google and Microsoft; iCloud app-specific passwords stay encrypted. One consent screen covers mail and calendar, and credentials never reach your AI tools.",
  },
  {
    icon: CommandLineIcon,
    title: "Dashboard and CLI",
    body: "A clean dashboard for humans and a lifeos CLI for terminals. Same accounts, same connection.",
  },
];

export default async function Home() {
  // Reading the session makes this route dynamic; signed-in users skip the pitch.
  const { user } = await withAuth();
  if (user) redirect("/dashboard");

  return (
    <ReaderShell>
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <nav className="page-col flex h-16 items-center justify-between border-x px-6">
          <a
            href="#top"
            aria-label="LifeOS — back to top"
            className="group/logo -m-2 flex items-center gap-2 p-2 text-lg font-normal tracking-tight"
          >
            <BrandMenu>
              <Logo size={26} interactive />
            </BrandMenu>
            LifeOS
          </a>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <PendingButton href="/login" variant="ghost" size="default">
              Sign in
            </PendingButton>
            <PendingButton href="/login?signup" size="default">
              Get started
            </PendingButton>
          </div>
        </nav>
      </header>

      <main className="page-col flex-1 border-x">
        {/* Hero — copy left, flow diagram right */}
        <section className="relative border-b">
          <Cross className="-bottom-[8.5px] -left-[8.5px]" />
          <Cross className="-bottom-[8.5px] -right-[8.5px]" />
          <div className="grid items-center gap-x-8 gap-y-16 px-6 py-20 sm:px-10 lg:grid-cols-2 lg:py-28">
            <div>
              <h1 className="text-balance text-5xl font-normal tracking-tighter sm:text-6xl xl:text-7xl">
                Every inbox,
                <br />
                every calendar,
                <br />
                one connection.
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
                LifeOS turns your email accounts and their calendars into one MCP. One
                connection, persistent across all your services.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <ConnectButton />
                <McpReaderTrigger />
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
          <SectionHeading title="Three steps, then it disappears" />
          <div className="grid border-t sm:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.n} className={cn("px-6 py-10 sm:px-10", i > 0 && "border-t sm:border-l sm:border-t-0")}>
                <span className="font-mono text-sm text-muted-foreground">{s.n}</span>
                <h3 className="mt-3 text-lg font-normal">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="relative border-b">
          <Cross className="-bottom-[8.5px] -left-[8.5px]" />
          <Cross className="-bottom-[8.5px] -right-[8.5px]" />
          <SectionHeading title="Built like infrastructure, not another inbox" />
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
          <h2 className="text-balance text-4xl font-normal tracking-tighter sm:text-5xl">
            Connect once. Then just ask.
          </h2>
          <p className="mt-4 max-w-md text-pretty text-muted-foreground">
            We&rsquo;re free for now, until we can&rsquo;t afford to cover the costs. Let&rsquo;s get
            you setup now!
          </p>
          <div className="mt-8">
            <PendingButton href="/login?signup">Get started</PendingButton>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="page-col flex flex-col justify-between gap-6 border-x px-6 py-10 sm:flex-row sm:items-center">
          <span className="group/logo flex w-fit items-center gap-2 text-sm">
            <BrandMenu>
              <Logo size={20} interactive />
            </BrandMenu>
            LifeOS
          </span>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <a href="/support" className="transition-colors hover:text-foreground">
              Support
            </a>
            <a
              href="https://cognify.design"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              © {new Date().getFullYear()} Cognify
            </a>
          </div>
        </div>
      </footer>
    </ReaderShell>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="px-6 py-10 sm:px-10">
      <h2 className="text-3xl font-normal tracking-tighter sm:text-4xl">{title}</h2>
    </div>
  );
}
