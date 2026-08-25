"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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
  ["create_draft", "Compose without sending"],
  ["send_email", "From whichever address fits"],
  ["modify_labels", "Label, archive, mark read"],
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
            aria-label="Close reader"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>
      </div>

      <div className="px-6 py-10 sm:px-10">
        <h2 className="text-balance text-3xl font-normal tracking-tighter">
          What is MCP?
        </h2>
        <p className="mt-5 text-pretty leading-relaxed text-muted-foreground">
          The Model Context Protocol is an open standard for wiring AI assistants to the tools and
          data they act on. Anthropic published it in late 2024 and gave it away; Claude, ChatGPT,
          Cursor, and most agent tooling speak it now.
        </p>

        <Heading>Why it exists</Heading>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          Before it, every assistant needed its own integration with every service — an
          N&times;M problem where nothing built for one tool carried over to the next. MCP collapses
          that into one interface. Build a server once and every client that speaks the protocol can
          use it.
        </p>

        <Heading>How a connection works</Heading>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          A <em className="not-italic text-foreground">client</em> is the app you talk to. A{" "}
          <em className="not-italic text-foreground">server</em> is a program that exposes
          capabilities — tools it can run, resources it can read. The client asks the server what it
          offers, the model decides when to call something, and results come back into the
          conversation. You connect the two with a URL and an OAuth sign-in, the same way you would
          authorize any other app.
        </p>

        <Heading>Where LifeOS fits</Heading>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          LifeOS is the server, standing in front of every inbox you own. Gmail, Outlook, and iCloud
          go in one side; a single endpoint comes out the other. Your assistant connects once and
          gets the whole set — nothing is copied or stored here, every call passes through to the
          provider and back.
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
