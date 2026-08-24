import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const features = [
  {
    title: "Every account, one hub",
    body: "Connect unlimited Gmail, Outlook, and iCloud accounts. LifeOS never stores your email — every request passes straight through to your provider.",
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
        <span className="flex items-center gap-2 text-lg font-normal tracking-tight">
          <Logo size={26} />
          LifeOS
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" nativeButton={false} render={<Link href="/login">Sign in</Link>} />
        </div>
      </nav>

      <section className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <Badge variant="outline" className="mb-6">
          Free while in beta
        </Badge>
        <h1 className="max-w-3xl text-balance text-5xl font-thin tracking-tight sm:text-7xl">
          Every inbox.
          <br />
          One connection.
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
          LifeOS turns all of your email accounts into a single MCP connection for Claude, ChatGPT,
          and every AI tool you use. Connect once, then just ask.
        </p>
        <div className="mt-10 flex items-center gap-3">
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
      </section>

      <section className="grid gap-6 pb-24 sm:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <CardTitle>{f.title}</CardTitle>
            </CardHeader>
            <CardContent className="leading-relaxed text-muted-foreground">{f.body}</CardContent>
          </Card>
        ))}
      </section>

      <footer className="pb-8">
        <Separator className="mb-8" />
        <p className="text-center text-xs text-muted-foreground">
          LifeOS · your email, your rules · nothing stored, everything connected
        </p>
      </footer>
    </main>
  );
}
