import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-heading" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = { title: "BIGstock by BIGhub" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" className={`${manrope.variable} ${dmSans.variable}`}>
      <body className="bg-surface font-body text-nav antialiased">{children}</body>
    </html>
  );
}
