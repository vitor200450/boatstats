import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "./auth.config";
import {
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  type AppLocale,
} from "@/i18n/config";
import { resolveLocale } from "@/i18n/detection";
import { addLocalePrefix, parseLocaleFromPathname } from "@/i18n/navigation";

const { auth } = NextAuth(authConfig);

const LOCALE_LIKE_SEGMENT = /^[a-z]{2}(?:-[A-Z]{2})?$/;

function resolvePreferredLocale(request: Request): AppLocale {
  return resolveLocale(
    request.headers.get("cookie"),
    request.headers.get("accept-language"),
  );
}

function setLocaleCookie(response: NextResponse, locale: AppLocale): void {
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 180,
  });
}

function withLocaleHeader(request: Request, locale: AppLocale): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-locale", locale);
  return requestHeaders;
}

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";
  const preferredLocale = resolvePreferredLocale(request);
  const parsed = parseLocaleFromPathname(pathname);

  if (parsed.locale) {
    const rewrittenUrl = new URL(`${parsed.pathnameWithoutLocale}${search}`, request.url);
    const response = NextResponse.rewrite(rewrittenUrl, {
      request: {
        headers: withLocaleHeader(request, parsed.locale),
      },
    });
    setLocaleCookie(response, parsed.locale);
    return response;
  }

  if (firstSegment && LOCALE_LIKE_SEGMENT.test(firstSegment) && !isSupportedLocale(firstSegment)) {
    const invalidLocaleRemainder = pathname.replace(`/${firstSegment}`, "") || "/";
    const redirectPath = addLocalePrefix(invalidLocaleRemainder, preferredLocale);
    const response = NextResponse.redirect(new URL(`${redirectPath}${search}`, request.url));
    setLocaleCookie(response, preferredLocale);
    return response;
  }

  const redirectPath = addLocalePrefix(pathname, preferredLocale);
  const response = NextResponse.redirect(new URL(`${redirectPath}${search}`, request.url));
  setLocaleCookie(response, preferredLocale);
  return response;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|_next/data|favicon.ico|apple-touch-icon.png|.*\\..*).*)"],
};
