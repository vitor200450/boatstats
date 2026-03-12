export const SUPPORTED_LOCALES = ["pt-BR", "en"] as const;

export const DEFAULT_LOCALE = "en" as const;

export const LOCALE_COOKIE_NAME = "boatstats_locale";

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}
