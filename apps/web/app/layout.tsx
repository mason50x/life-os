import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LifeOS — every inbox, one connection",
  description:
    "Connect all your Gmail and Outlook accounts and give Claude, ChatGPT, and any MCP client one secure connection to your entire email life.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
