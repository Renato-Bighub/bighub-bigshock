import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

/**
 * Idioma vindo do site: bigstock.tech envia ?lang=xx nas ligações para a aplicação (ou grava o cookie
 * partilhado .bigstock.tech). Gravamos o cookie, removemos o parâmetro do URL e seguimos.
 */
export function proxy(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang");
  if (!lang) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.searchParams.delete("lang");
  const res = NextResponse.redirect(url);
  if (isLocale(lang)) {
    const host = req.nextUrl.hostname;
    res.cookies.set(LOCALE_COOKIE, lang, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
      ...(host === "bigstock.tech" || host.endsWith(".bigstock.tech") ? { domain: ".bigstock.tech" } : {}),
    });
  }
  return res;
}

export const config = { matcher: ["/((?!api/|_next/|.*\\..*).*)"] };
