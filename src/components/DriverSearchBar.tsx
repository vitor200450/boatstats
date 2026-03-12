"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { searchDriverSuggestions } from "@/lib/leagues/driverActions";
import { Loader2 } from "lucide-react";
import { t } from "@/i18n/messages";
import { addLocalePrefix, getLocaleFromPathname } from "@/i18n/navigation";

interface DriverSuggestion {
  id: string;
  uuid: string;
  currentName: string | null;
}

type DriverSearchBarProps = {
  variant?: "hero" | "navbar";
  placeholder?: string;
};

export default function DriverSearchBar({
  variant = "hero",
  placeholder,
}: DriverSearchBarProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DriverSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const isNavbar = variant === "navbar";

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setIsLoading(true);
        const result = await searchDriverSuggestions(query.trim());
        if (result.success && 'data' in result) {
          setSuggestions(result.data as DriverSuggestion[]);
          setShowSuggestions(true);
        }
        setIsLoading(false);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
      setSelectedIndex(-1);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (suggestions.length === 0) return;

    for (const suggestion of suggestions.slice(0, 3)) {
      router.prefetch(
        addLocalePrefix(`/driver/${encodeURIComponent(suggestion.uuid)}`, locale),
      );
    }
  }, [locale, router, suggestions]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setShowSuggestions(false);
      router.push(addLocalePrefix(`/driver/${encodeURIComponent(query.trim())}`, locale));
    }
  };

  const handleSuggestionClick = (suggestion: DriverSuggestion) => {
    setQuery(suggestion.currentName || suggestion.uuid);
    setShowSuggestions(false);
    const targetPath = addLocalePrefix(`/driver/${encodeURIComponent(suggestion.uuid)}`, locale);
    router.prefetch(targetPath);
    router.push(targetPath);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else {
          handleSearch(e);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        break;
    }
  };

  return (
    <div className="relative w-full" ref={suggestionsRef}>
      <form onSubmit={handleSearch} className="relative">
        <span
          className={`absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-neutral-500 ${
            isNavbar ? "text-[18px]" : ""
          }`}
        >
          search
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim().length >= 2 && setShowSuggestions(true)}
          className={`bg-zinc-900 border border-zinc-800 text-neutral-200 rounded-lg pl-12 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 placeholder-neutral-600 w-full ${
            isNavbar
              ? "pr-12 py-2.5 text-sm"
              : "pr-20 sm:pr-24 py-3 sm:py-4 text-base sm:text-lg shadow-lg"
          }`}
          placeholder={
            placeholder ||
            (isNavbar
              ? t(locale, "public.search.placeholderNavbar")
              : t(locale, "public.search.placeholderHero"))
          }
          type="text"
          autoComplete="off"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading && (
            <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
          )}
          {!isNavbar && (
            <button
              type="submit"
              className="hidden sm:inline-flex bg-zinc-800 hover:bg-zinc-700 text-white rounded px-4 py-1.5 text-sm transition-colors"
            >
              {t(locale, "public.search.submit")}
            </button>
          )}
        </div>
      </form>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden z-[100]">
          <div className="py-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                onClick={() => handleSuggestionClick(suggestion)}
                onMouseEnter={() => {
                  router.prefetch(
                    addLocalePrefix(`/driver/${encodeURIComponent(suggestion.uuid)}`, locale),
                  );
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  index === selectedIndex
                    ? "bg-cyan-500/10 border-l-2 border-cyan-500"
                    : "hover:bg-zinc-800 border-l-2 border-transparent"
                }`}
              >
                <img
                  src={`https://mc-heads.net/avatar/${suggestion.uuid}/32`}
                  alt={suggestion.currentName || t(locale, "public.search.unknownDriver")}
                  className="w-8 h-8 rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">
                    {suggestion.currentName || t(locale, "public.search.unknownDriver")}
                  </div>
                  <div className="text-zinc-500 text-xs font-mono truncate">
                    {suggestion.uuid.substring(0, 8)}...
                  </div>
                </div>
                <span className="material-symbols-outlined text-zinc-600 text-sm">
                  arrow_forward
                </span>
              </button>
            ))}
          </div>
          <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 text-xs text-zinc-500">
            {t(locale, "public.search.keyboardHint")}
          </div>
        </div>
      )}

      {/* No results message */}
      {showSuggestions && query.trim().length >= 2 && suggestions.length === 0 && !isLoading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden z-[100]">
          <div className="px-4 py-3 text-zinc-500 text-center">
            {t(locale, "public.search.noResults")}
          </div>
        </div>
      )}
    </div>
  );
}
