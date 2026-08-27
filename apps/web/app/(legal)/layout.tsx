import Link from "next/link";
import { BrandMenu } from "@/components/BrandMenu";
import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { PendingButton } from "@/components/PendingButton";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Footer links are 20px of text; on touch they get a 44px row to land in. */
const footerLink =
  "transition-colors hover:text-foreground max-sm:flex max-sm:h-11 max-sm:items-center";

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
          <BrandMenu
            render={
              <Link
                href="/"
                aria-label="LifeOS — home"
                className="group/logo -m-2 flex items-center gap-2 p-2 text-lg font-normal tracking-tight"
              />
            }
          >
            <Logo size={26} interactive />
            LifeOS
          </BrandMenu>
          <div className="flex items-center gap-2">
            <span className="max-sm:hidden">
              <ThemeToggle />
            </span>
            <PendingButton href="/login" variant="ghost" size="default" className="max-sm:hidden">
              Sign in
            </PendingButton>
            <MobileNav className="sm:hidden" />
          </div>
        </nav>
      </header>

      <main className="page-col flex-1 border-x px-6 py-10 sm:px-10 sm:py-16 lg:py-24">{children}</main>

      <footer className="border-t">
        <div className="page-col flex flex-col justify-between gap-6 border-x px-6 py-10 sm:flex-row sm:items-center">
          <BrandMenu render={<span className="group/logo flex w-fit items-center gap-2 text-sm" />}>
            <Logo size={20} interactive />
            LifeOS
          </BrandMenu>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground max-sm:gap-y-0">
            <Link href="/privacy" className={footerLink}>
              Privacy
            </Link>
            <Link href="/terms" className={footerLink}>
              Terms
            </Link>
            <a href="/support" className={footerLink}>
              Support
            </a>
            <a
              href="https://cognify.design"
              target="_blank"
              rel="noreferrer"
              className={footerLink}
            >
              © {new Date().getFullYear()} Cognify
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
