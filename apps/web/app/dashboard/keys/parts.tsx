import { KeyIcon } from "@heroicons/react/24/solid";
import {
  Bar,
  PageBody,
  PageHeader,
  Panel,
  Section,
  cellBorders,
} from "@/components/dashboard/page-parts";
import { cn } from "@/lib/utils";

const cliSteps = [
  { n: "01", cmd: "npm i -g @cognify-software/lifeos", body: "Installs the lifeos command." },
  {
    n: "02",
    cmd: "lifeos login",
    body: "Opens your browser to confirm. No key to paste; the session goes in your keychain.",
  },
  { n: "03", cmd: "lifeos", body: "Everything on this dashboard, in your terminal." },
] as const;

/**
 * Everything on this page that doesn't wait on a read — which is all of it
 * bar the key list. The page and its loading state render the same shell, so
 * a click paints the finished layout and only the keys arrive late.
 */
export function KeysShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="API keys" icon={KeyIcon} />

      <PageBody>
        <Section title="Keys">
          <Panel className="px-5 py-5">{children}</Panel>
        </Section>

        <Section title="You probably don't need one">
          <Panel className="grid sm:grid-cols-3">
            {cliSteps.map((s, i) => (
              <div key={s.n} className={cn("px-5 py-4", cellBorders(i, 3))}>
                <span className="text-xs tabular-nums text-muted-foreground">{s.n}</span>
                <p className="mt-2">
                  <code className="font-mono text-sm">{s.cmd}</code>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}

/** The shape KeyManager holds: the mint form, and the rows beneath it. */
export function KeysSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Bar className="h-9 flex-1" />
        <Bar className="h-9 w-28 shrink-0" />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          className={cn("flex items-center justify-between gap-4 py-2", i > 0 && "border-t pt-4")}
        >
          <div className="space-y-2">
            <Bar className="h-3.5 w-32" />
            <Bar className="h-2.5 w-52 max-w-full" />
          </div>
          <Bar className="h-8 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
