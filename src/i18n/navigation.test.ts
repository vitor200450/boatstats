import { describe, expect, it } from "vitest";

import {
  addLocalePrefix,
  parseLocaleFromPathname,
  replacePathLocale,
} from "@/i18n/navigation";

describe("i18n locale navigation", () => {
  it("extracts locale and normalized path", () => {
    expect(parseLocaleFromPathname("/pt-BR/leagues/abc")).toEqual({
      locale: "pt-BR",
      pathnameWithoutLocale: "/leagues/abc",
    });
  });

  it("returns null locale when path has no prefix", () => {
    expect(parseLocaleFromPathname("/tracks")).toEqual({
      locale: null,
      pathnameWithoutLocale: "/tracks",
    });
  });

  it("adds locale prefix to root and nested paths", () => {
    expect(addLocalePrefix("/", "en")).toBe("/en");
    expect(addLocalePrefix("/tracks", "en")).toBe("/en/tracks");
  });

  it("replaces existing locale while preserving pathname and query segment in string", () => {
    expect(replacePathLocale("/pt-BR/leagues/abc", "en")).toBe("/en/leagues/abc");
    expect(replacePathLocale("/leagues/abc", "pt-BR")).toBe("/pt-BR/leagues/abc");
  });
});
