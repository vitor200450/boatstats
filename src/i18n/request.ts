import { cookies, headers } from "next/headers";

import {
  LOCALE_COOKIE_NAME,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type AppLocale,
} from "@/i18n/config";
import { pickLocaleFromAcceptLanguage } from "@/i18n/detection";

export async function getRequestLocale(): Promise<AppLocale> {
  const requestHeaders = await headers();
  const localeHeader = requestHeaders.get("x-locale");
  if (localeHeader && isSupportedLocale(localeHeader)) {
    return localeHeader;
  }

  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (localeCookie && isSupportedLocale(localeCookie)) {
    return localeCookie;
  }

  return pickLocaleFromAcceptLanguage(requestHeaders.get("accept-language"));
}

export function getLocaleList(): readonly AppLocale[] {
  return SUPPORTED_LOCALES;
}
