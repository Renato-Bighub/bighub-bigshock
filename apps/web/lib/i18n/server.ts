import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, format, fromAcceptLanguage, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { messagesFor } from "./messages";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return fromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}

export async function getT() {
  const locale = await getLocale();
  const m = messagesFor(locale);
  return {
    locale,
    t: (text: string, vars?: Record<string, string | number>) => format(m[text] ?? text, vars),
  };
}
