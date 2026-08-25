import Link from "next/link";
import { BrandMenu } from "@/components/BrandMenu";
import { Logo } from "@/components/Logo";
import { PendingButton } from "@/components/PendingButton";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Chrome shared by `/privacy` and `/terms`. Same 72rem column and hairlines as
 * the landing page — these are public pages a Google reviewer lands on cold,
 * so they should look like the product, not like a pasted document.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <nav className="page-col flex h-16 items-center justify-between border-x px-6">
          <Link
            href="/"
            aria-label="LifeOS — home"
            className="group/logo -m-2 flex items-center gap-2 p-2 text-lg font-normal tracking-tight"
          >
            <BrandMenu>
              <Logo size={26} interactive />
            </BrandMenu>
            LifeOS
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <PendingButton href="/login" variant="ghost" size="default">
              Sign in
            </PendingButton>
          </div>
        </nav>
      </header>

      <main className="page-col flex-1 border-x px-6 py-16 sm:px-10 lg:py-24">{children}</main>

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
    </div>
  );
}
