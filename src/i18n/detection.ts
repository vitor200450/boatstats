import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isSupportedLocale, type AppLocale } from "@/i18n/config";

export function pickLocaleFromAcceptLanguage(value: string | null): AppLocale {
  if (!value) {
    return DEFAULT_LOCALE;
  }

  const candidates = value
    .split(",")
    .map((part) => part.trim().split(";")[0])
    .filter(Boolean)
    .flatMap((token) => {
      const lower = token.toLowerCase();
      if (lower.startsWith("pt")) {
        return ["pt-BR"];
      }
      if (lower.startsWith("en")) {
        return ["en"];
      }
      return [];
    });

  for (const candidate of candidates) {
    if (isSupportedLocale(candidate)) {
      return candidate;
    }
  }

  return DEFAULT_LOCALE;
}

export function readLocaleCookie(cookieHeader: string | null): AppLocale | null {
  if (!cookieHeader) {
    return null;
  }

  const localeCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.split("=")[1];

  if (!localeCookie || !isSupportedLocale(localeCookie)) {
    return null;
  }

  return localeCookie;
}

export function resolveLocale(
  cookieHeader: string | null,
  acceptLanguage: string | null,
): AppLocale {
  const fromCookie = readLocaleCookie(cookieHeader);
  if (fromCookie) {
    return fromCookie;
  }

  return pickLocaleFromAcceptLanguage(acceptLanguage);
}
