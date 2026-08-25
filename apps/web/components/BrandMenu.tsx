"use client";

import { useRef, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

/**
 * Right-click any LifeOS mark to grab it: the master SVG, or the 2-color PNG
 * that fits under the ChatGPT Apps SDK's 10 KB cap. Both files are emitted
 * into `public/` by `brand/generate.py`, so nothing here restates the artwork.
 */

const BRANDMARK_SVG = "/brandmark.svg";
const CHATGPT_PNG = "/logo.png";

export function BrandMenu({ children }: { children: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<span className="inline-flex" />}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel>Brandmark</ContextMenuLabel>
          <CopyItem run={copySvg}>Copy SVG</CopyItem>
          <ContextMenuItem onClick={() => download(BRANDMARK_SVG, "lifeos-mark.svg")}>
            Download SVG
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel>ChatGPT mark &middot; under 10 KB</ContextMenuLabel>
          <CopyItem run={copyPng}>Copy PNG</CopyItem>
          <ContextMenuItem onClick={() => download(CHATGPT_PNG, "lifeos-chatgpt-mark.png")}>
            Download PNG
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Stays open after the click so the result has somewhere to show up. */
function CopyItem({ children, run }: { children: React.ReactNode; run: () => Promise<void> }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return (
    <ContextMenuItem
      closeOnClick={false}
      onClick={async () => {
        let next: "copied" | "failed" = "copied";
        try {
          await run();
        } catch {
          next = "failed";
        }
        setResult(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setResult(null), 1500);
      }}
    >
      {children}
      {result && (
        <span className="ml-auto text-xs text-muted-foreground">
          {result === "copied" ? "Copied" : "Failed"}
        </span>
      )}
    </ContextMenuItem>
  );
}

async function copySvg() {
  await navigator.clipboard.writeText(await fetch(BRANDMARK_SVG).then((r) => r.text()));
}

async function copyPng() {
  // Safari only accepts a pending blob here, and only while the click is still
  // the current task — awaiting the fetch first loses the user gesture.
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": fetch(CHATGPT_PNG).then((r) => r.blob()) }),
  ]);
}

function download(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}
