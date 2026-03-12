"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n/config";
import { getLocaleFromPathname, replacePathLocale } from "@/i18n/navigation";
import { t } from "@/i18n/messages";

type LocaleSwitcherProps = {
  className?: string;
};

function BrazilFlagIcon() {
  return (
    <svg viewBox="0 0 24 16" className="h-3.5 w-5 rounded-sm" aria-hidden="true">
      <rect width="24" height="16" fill="#009B3A" />
      <polygon points="12,2 21,8 12,14 3,8" fill="#FFDF00" />
      <circle cx="12" cy="8" r="3.3" fill="#002776" />
    </svg>
  );
}

function UsaFlagIcon() {
  return (
    <svg viewBox="0 0 24 16" className="h-3.5 w-5 rounded-sm" aria-hidden="true">
      <rect width="24" height="16" fill="#B22234" />
      <rect y="2" width="24" height="2" fill="#fff" />
      <rect y="6" width="24" height="2" fill="#fff" />
      <rect y="10" width="24" height="2" fill="#fff" />
      <rect y="14" width="24" height="2" fill="#fff" />
      <rect width="10" height="7" fill="#3C3B6E" />
    </svg>
  );
}

function LocaleFlag({ locale }: { locale: AppLocale }) {
  if (locale === "pt-BR") {
    return <BrazilFlagIcon />;
  }

  return <UsaFlagIcon />;
}

export default function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeLocale = useMemo(() => getLocaleFromPathname(pathname), [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (!containerRef.current) {
        return;
      }

      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function handleLocaleChange(nextLocale: AppLocale): void {
    if (nextLocale === activeLocale) {
      setOpen(false);
      return;
    }

    const nextPath = replacePathLocale(pathname, nextLocale);
    const query = searchParams.toString();
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    const targetUrl = `${nextPath}${query ? `?${query}` : ""}${hash}`;

    setOpen(false);
    window.location.assign(targetUrl);
  }

  function getLocaleLabel(locale: AppLocale): string {
    if (locale === "pt-BR") {
      return t(activeLocale, "locale.ptBR");
    }

    return t(activeLocale, "locale.en");
  }

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center gap-2 text-xs text-zinc-400 ${className ?? ""}`}
    >
      <span className="font-mono uppercase tracking-wider">
        {t(activeLocale, "locale.label")}
      </span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-cyan-500 focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <LocaleFlag locale={activeLocale} />
          {getLocaleLabel(activeLocale)}
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? "rotate-180" : "rotate-0"}`}
          >
            <path
              d="M5.5 7.5 10 12l4.5-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 min-w-44 rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-lg"
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => handleLocaleChange(locale)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                locale === activeLocale
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "text-zinc-100 hover:bg-zinc-800"
              }`}
            >
              <LocaleFlag locale={locale} />
              {getLocaleLabel(locale)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
