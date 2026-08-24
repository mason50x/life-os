import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { Logo } from "@/components/Logo";

const features = [
  {
    title: "Every account, one hub",
    body: "Connect unlimited Gmail and Outlook accounts. LifeOS never stores your email — every request passes straight through to your provider.",
  },
  {
    title: "One MCP connection",
    body: "Add a single MCP URL to Claude, ChatGPT, Cursor, or any MCP client and it can search, read, draft, and send across all of your inboxes.",
  },
  {
    title: "Built for developers too",
    body: "A clean dashboard for humans, a lifeos CLI for terminals, and OAuth done properly with WorkOS AuthKit end to end.",
  },
];

export default async function Home() {
  // Reading the session makes this route dynamic; signed-in users skip the pitch.
  const { user } = await withAuth();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <nav className="flex items-center justify-between py-8">
        <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Logo size={26} />
          Life<span className="text-indigo-400">OS</span>
        </span>
        <Link href="/login" className="btn-ghost">
          Sign in
        </Link>
      </nav>

      <section className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <p className="mb-6 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-4 py-1.5 text-xs font-medium text-indigo-300">
          Free while in beta
        </p>
        <h1 className="max-w-3xl text-balance text-5xl font-bold tracking-tight sm:text-7xl">
          Every inbox.
          <br />
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            One connection.
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-lg text-zinc-400">
          LifeOS turns all of your email accounts into a single MCP connection for Claude, ChatGPT,
          and every AI tool you use. Connect once, then just ask.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Link href="/login" className="btn-primary">
            Connect your inboxes
          </Link>
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
          >
            What is MCP?
          </a>
        </div>
      </section>

      <section className="grid gap-6 pb-24 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card p-6">
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-500">
        LifeOS · your email, your rules · nothing stored, everything connected
      </footer>
    </main>
  );
}
