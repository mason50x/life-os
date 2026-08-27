import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "LifeOS — your life, one connection",
  description:
    "Connect all your Gmail, Outlook, and iCloud accounts and give Claude, ChatGPT, and any MCP client one secure connection to your mail and your calendars.",
};

// Paints the phone's browser chrome to match the page rather than leaving a
// white bar over a black page. Two entries, not one: the class that decides
// the theme isn't on the document until React runs.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans motion-safe:scroll-smooth", inter.variable)} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
