import type { Metadata } from "next";
import { Geist_Mono, Inter, Sora } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site-url";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700", "800"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TechService Hub — Your Ideas. Our Expertise. One Digital Solution.",
    template: "%s · TechService Hub",
  },
  description:
    "From academic projects to professional software development, we turn your ideas into meaningful digital solutions. Choose your project lead — two founders, direct access, full transparency.",
  openGraph: {
    siteName: "TechService Hub",
    type: "website",
    // app/opengraph-image.tsx supplies the 1200×630 card for every route.
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistMono.variable, sora.variable, "font-sans", inter.variable)}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
