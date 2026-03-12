import { DEFAULT_LOCALE, isSupportedLocale, type AppLocale } from "@/i18n/config";

type LocalePathParseResult = {
  locale: AppLocale | null;
  pathnameWithoutLocale: string;
};

function normalizePath(pathname: string): string {
  if (!pathname.startsWith("/")) {
    return `/${pathname}`;
  }
  return pathname;
}

export function parseLocaleFromPathname(pathname: string): LocalePathParseResult {
  const normalizedPath = normalizePath(pathname);
  const segments = normalizedPath.split("/");
  const maybeLocale = segments[1] ?? "";

  if (!isSupportedLocale(maybeLocale)) {
    return {
      locale: null,
      pathnameWithoutLocale: normalizedPath,
    };
  }

  const remainder = `/${segments.slice(2).join("/")}`;
  return {
    locale: maybeLocale,
    pathnameWithoutLocale: remainder === "/" ? "/" : remainder.replace(/\/$/, "") || "/",
  };
}

export function addLocalePrefix(pathname: string, locale: AppLocale): string {
  const normalizedPath = normalizePath(pathname);
  if (normalizedPath === "/") {
    return `/${locale}`;
  }
  return `/${locale}${normalizedPath}`;
}

export function replacePathLocale(pathname: string, locale: AppLocale): string {
  const { pathnameWithoutLocale } = parseLocaleFromPathname(pathname);
  return addLocalePrefix(pathnameWithoutLocale, locale);
}

export function getLocaleFromPathname(pathname: string): AppLocale {
  const parsed = parseLocaleFromPathname(pathname);
  return parsed.locale ?? DEFAULT_LOCALE;
}
