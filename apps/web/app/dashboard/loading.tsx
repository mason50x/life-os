import { Bar, PageBody, Panel, cellBorders } from "@/components/dashboard/page-parts";
import { cn } from "@/lib/utils";

/**
 * What a click on Home paints instantly. The page is dynamic — every
 * navigation waits on the session and a Convex read — so without a loading
 * state the browser sits on the old page for the whole round trip and
 * `<Link>` has nothing it can prefetch. The sidebar lives in the layout, so
 * only the column swaps. `keys/` and `mcp/` have their own, shaped like the
 * page they stand in for.
 */
export default function Loading() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b px-6">
        <div className="flex items-center gap-2.5">
          <Bar className="size-5" />
          <Bar className="h-4 w-28" />
        </div>
        <Bar className="h-8 w-32" />
      </header>

      <PageBody>
        <Panel className="grid sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("space-y-3 px-5 py-6", cellBorders(i, 3))}>
              <Bar className="h-2.5 w-16" />
              <Bar className="h-9 w-20" />
              <Bar className="h-3 w-32" />
            </div>
          ))}
        </Panel>

        <div>
          <Bar className="h-7 w-44" />
          <Panel className="mt-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn("flex items-center gap-4 px-5 py-3.5", i > 0 && "border-t")}
              >
                <Bar className="size-5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Bar className="h-3.5 w-56 max-w-full" />
                  <Bar className="h-2.5 w-40 max-w-full" />
                </div>
                <Bar className="h-3 w-14" />
              </div>
            ))}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
