import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "BIGstock by BIGhub" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="bg-surface text-nav antialiased">{children}</body>
    </html>
  );
}
