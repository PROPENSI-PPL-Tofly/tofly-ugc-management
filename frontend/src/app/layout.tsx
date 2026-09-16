import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font: no request to a third-party font host at runtime,
// and no layout shift while a face loads.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Tofly",
  description: "Manajemen konten UGC Tofly",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${inter.variable} ${sora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
