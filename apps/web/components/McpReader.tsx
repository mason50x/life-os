"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

/**
 * The landing page's reading mode: the page slides left by one gutter and the
 * panel fills both, so it reads as a two-column layout rather than a modal
 * covering the pitch. The shift is a transform on the whole shell — the 72rem
 * column keeps its width, so no headline rewraps and no grid reflows. Widths
 * live on `--page-gutter` / `--reader-w` in globals.css. Where the window is
 * too narrow to have gutters worth taking, the panel overlays instead.
 */

const ReaderContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

function useReader() {
  const ctx = useContext(ReaderContext);
  if (!ctx) throw new Error("useReader must be used inside <ReaderShell>");
  return ctx;
}

export function ReaderShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Where focus goes back to on close, so the panel doesn't strand the keyboard.
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <ReaderContext.Provider
      value={{
        open,
        setOpen: (v) => {
          if (v) returnTo.current = document.activeElement as HTMLElement | null;
          else returnTo.current?.focus({ preventScroll: true });
          setOpen(v);
        },
      }}
    >
      <div
        id="top"
        data-reader={open ? "open" : "closed"}
        className="reader-shell flex min-h-dvh flex-col"
      >
        {children}
      </div>
      <McpPanel />
    </ReaderContext.Provider>
  );
}

/** The "MCP?" affordance in the hero. */
export function McpReaderTrigger() {
  const { open, setOpen } = useReader();

  return (
    <Button
      size="lg"
      variant="outline"
      className="h-11 w-full sm:h-9 sm:w-auto"
      aria-expanded={open}
      aria-controls="mcp-reader"
      onClick={() => setOpen(!open)}
    >
      MCP?
    </Button>
  );
}

const tools = [
  ["search_emails", "One query across every connected inbox"],
  ["get_thread", "A full conversation, messages in order"],
  ["send_email", "From whichever address fits"],
  ["list_events", "What's on, across every calendar"],
  ["find_free_time", "Gaps that are actually free"],
  ["create_event", "Book it, and invite the room"],
];

function McpPanel() {
  const { open, setOpen } = useReader();
  const panelRef = useRef<HTMLElement>(null);

  // Opening moves the keyboard into the panel; the shell hands focus back.
  // Without `preventScroll` the browser chases the panel in from off-screen
  // and drags the page down with it.
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <aside
      ref={panelRef}
      id="mcp-reader"
      aria-label="What is MCP?"
      tabIndex={-1}
      inert={!open}
      className={
        "reader-panel fixed inset-y-0 right-0 z-[60] w-full overflow-y-auto overscroll-contain " +
        "border-l bg-background outline-none lg:w-[var(--reader-w)] " +
        (open ? "translate-x-0" : "invisible translate-x-full")
      }
    >
      {/* Same construction as the page header — a 64px row over its own
          border — so the two rules line up across the seam. The panel is the
          scroll container (not an inner div) so a wheel anywhere in it, this
          row included, scrolls the reader; `overscroll-contain` keeps that
          from chaining into the page once the reader hits an end. */}
      <div className="sticky top-0 z-10 border-b bg-background">
        <div className="flex h-16 items-center justify-between px-6">
          <p className="font-mono text-sm text-muted-foreground">About MCP</p>
          <Button
            size="icon-lg"
            variant="ghost"
            className="-mr-2 max-sm:size-11"
            aria-label="Close reader"
            onClick={() => setOpen(false)}
          >
            <XMarkIcon className="size-5" />
          </Button>
        </div>
      </div>

      <div className="px-6 pt-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-10 sm:pt-10">
        <h2 className="text-balance text-2xl font-normal tracking-tighter sm:text-3xl">
          What is MCP?
        </h2>
        <p className="mt-5 text-pretty leading-relaxed text-muted-foreground">
          The Model Context Protocol is an open standard that lets an AI assistant use your apps
          and services for you. Anthropic published it in late 2024 and gave it away; Claude,
          ChatGPT, Cursor, and most AI tools speak it now.
        </p>

        <Heading>Why it exists</Heading>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          Before it, every assistant had to be wired up to every service one pair at a time, and
          the work done for one assistant was no use to the next. MCP replaces all of that with a
          single shared standard. Build one server, and every app that speaks the protocol can use
          it.
        </p>

        <Heading>How a connection works</Heading>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          A <em className="not-italic text-foreground">client</em> is the app you talk to. A{" "}
          <em className="not-italic text-foreground">server</em> is a program that offers it a set
          of things it can do — actions it can take, information it can read. The client asks the
          server what is on offer, the assistant picks what it needs while you talk, and the answer
          comes back in the conversation. You connect the two with a URL and an OAuth sign-in, the
          same way you would authorize any other app.
        </p>

        <Heading>Where LifeOS fits</Heading>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          LifeOS is the server, sitting in front of every inbox and calendar you own. Gmail,
          Google Calendar, Outlook, and iCloud go in one side; one URL comes out the other. Your
          assistant connects once and gets all of them — nothing is copied or stored here, every
          request passes straight through to the provider and back.
        </p>

        <ul className="mt-6 border-t">
          {tools.map(([name, what]) => (
            <li key={name} className="flex flex-col gap-0.5 border-b py-3 sm:flex-row sm:gap-4">
              <span className="font-mono text-sm sm:w-40 sm:shrink-0">{name}</span>
              <span className="text-sm text-muted-foreground">{what}</span>
            </li>
          ))}
        </ul>

      </div>
    </aside>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-10 text-lg font-normal">{children}</h3>;
}
