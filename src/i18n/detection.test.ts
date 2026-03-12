import { describe, expect, it } from "vitest";

import {
  pickLocaleFromAcceptLanguage,
  readLocaleCookie,
  resolveLocale,
} from "@/i18n/detection";

describe("i18n locale detection", () => {
  it("prefers pt-BR when accept-language starts with pt", () => {
    expect(pickLocaleFromAcceptLanguage("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt-BR");
  });

  it("falls back to en when accept-language has unsupported locales", () => {
    expect(pickLocaleFromAcceptLanguage("es-ES,fr;q=0.8")).toBe("en");
  });

  it("reads supported locale cookie", () => {
    expect(readLocaleCookie("foo=1; boatstats_locale=pt-BR; bar=2")).toBe("pt-BR");
  });

  it("ignores invalid locale cookie", () => {
    expect(readLocaleCookie("boatstats_locale=es")).toBeNull();
  });

  it("resolveLocale prioritizes cookie over accept-language", () => {
    expect(
      resolveLocale("boatstats_locale=en", "pt-BR,pt;q=0.9"),
    ).toBe("en");
  });
});
