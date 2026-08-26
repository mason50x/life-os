import { KeyIcon } from "@heroicons/react/24/solid";
import { KeyManager } from "@/components/KeyManager";
import {
  PageBody,
  PageHeader,
  Panel,
  Section,
  cellBorders,
} from "@/components/dashboard/page-parts";
import { cn } from "@/lib/utils";
import { keysOf, session } from "../data";

const cliSteps = [
  { n: "01", cmd: "npm i -g @cognify-software/lifeos", body: "Installs the lifeos command." },
  {
    n: "02",
    cmd: "lifeos login",
    body: "Opens your browser to confirm. No key to paste; the session goes in your keychain.",
  },
  { n: "03", cmd: "lifeos", body: "Everything on this dashboard, in your terminal." },
] as const;

export default async function ApiKeys() {
  const { user } = await session();
  const keys = await keysOf(user.id);

  return (
    <>
      <PageHeader title="API keys" icon={KeyIcon} />

      <PageBody>
        <Section
          title="Keys"
        >
          <Panel className="px-5 py-5">
            <KeyManager keys={keys} />
          </Panel>
        </Section>

        <Section title="You probably don't need one">
          <Panel className="grid sm:grid-cols-3">
            {cliSteps.map((s, i) => (
              <div key={s.n} className={cn("px-5 py-4", cellBorders(i, 3))}>
                <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
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
