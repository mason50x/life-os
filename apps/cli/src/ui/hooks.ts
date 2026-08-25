import { useEffect, useState } from "react";

/** Terminal size, kept current across resizes so the layout always fills it. */
export function useTerminalSize(): { columns: number; rows: number } {
  const read = () => ({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });
  const [size, setSize] = useState(read);

  useEffect(() => {
    const onResize = () => setSize(read());
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);

  return size;
}

/**
 * The slice of a list that fits, scrolled to keep `index` visible. Ink redraws
 * the whole frame, so windowing here is what stops a long account list from
 * pushing the footer off the bottom of the terminal.
 */
export function windowed<T>(items: T[], index: number, height: number): { slice: T[]; start: number } {
  if (items.length <= height) return { slice: items, start: 0 };
  const start = Math.max(0, Math.min(index - Math.floor(height / 2), items.length - height));
  return { slice: items.slice(start, start + height), start };
}
