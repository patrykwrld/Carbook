import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { NavAuth } from "@/components/NavAuth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Carbook — comment on cars, not people",
  description:
    "A public guestbook for every car on the road. Look up a registration plate, read what others said, leave your own comment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-edge/60 bg-background/80 backdrop-blur">
          <nav className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
            <Link
              href="/"
              className="font-display text-lg font-semibold tracking-tight"
            >
              car<span className="text-amber">book</span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/rules" className="text-muted hover:text-foreground">
                Rules
              </Link>
              <NavAuth />
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-edge/60 py-6 text-center text-xs text-muted">
          Comment on cars, not people. ·{" "}
          <Link href="/rules" className="underline hover:text-foreground">
            Content policy
          </Link>
        </footer>
      </body>
    </html>
  );
}
