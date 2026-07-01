import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Crucible — AI Model Proving Ground",
  description:
    "SOTA multi-model LLM benchmarking, red-team & arena platform. Benchmark, battle, break and observe frontier models across psychology, trading, software, business, marketing and logic.",
};

// Umami analytics (shared self-hosted instance, e.g. stats.hypexio.com). Only
// emitted when a website id is configured — set NEXT_PUBLIC_UMAMI_WEBSITE_ID.
const UMAMI_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC || "https://stats.hypexio.com/script.js";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        {UMAMI_ID && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script defer src={UMAMI_SRC} data-website-id={UMAMI_ID} />
        )}
      </body>
    </html>
  );
}
