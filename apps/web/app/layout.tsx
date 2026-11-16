import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/components/i18n/provider";
import { getLocale } from "@/lib/i18n/server";
import { messagesFor } from "@/lib/i18n/messages";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans" });

export const metadata: Metadata = { title: "BIGstock by BIGhub" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${manrope.variable} ${dmSans.variable}`}>
      <body className="bg-surface font-body text-nav antialiased"><I18nProvider locale={locale} messages={messagesFor(locale)}>{children}</I18nProvider></body>
    </html>
  );
}
