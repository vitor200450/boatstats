"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Route, Search } from "lucide-react";

import type { AppLocale } from "@/i18n/config";
import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import type { FrosthexTrack } from "@/services/frosthexAPI";

type TracksCatalogClientProps = {
  locale: AppLocale;
  tracks: FrosthexTrack[];
  trackStatsByCommand: Record<
    string,
    {
      entries: number;
      bestTimeMs: number | null;
      recordHolder: string | null;
    }
  >;
};

function formatTime(ms: number | null): string {
  if (!ms || ms <= 0) return "--:--.---";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
}

export default function TracksCatalogClient({
  locale,
  tracks,
  trackStatsByCommand,
}: TracksCatalogClientProps) {
  const [query, setQuery] = useState("");

  const filteredTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tracks.filter((track) => {
      const stats = trackStatsByCommand[track.commandName.toLowerCase()];
      const shouldHideForNoData =
        stats !== undefined && stats.entries === 0 && stats.bestTimeMs === null;

      if (shouldHideForNoData) return false;

      if (!normalizedQuery) return true;

      const trackName = track.name.toLowerCase();
      const commandName = track.commandName.toLowerCase();

      return (
        trackName.includes(normalizedQuery) ||
        commandName.includes(normalizedQuery)
      );
    });
  }, [query, trackStatsByCommand, tracks]);

  return (
    <div>
      <div className="mb-6">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(locale, "public.tracksCatalog.searchPlaceholder")}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            type="text"
          />
        </div>
      </div>

      {filteredTracks.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-xl">
          <Route className="w-14 h-14 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-300 font-medium">{t(locale, "public.tracksCatalog.searchNoResultsTitle")}</p>
          <p className="text-zinc-500 mt-2">{t(locale, "public.tracksCatalog.searchNoResultsSubtitle")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredTracks.map((track) => {
            const stats = trackStatsByCommand[track.commandName.toLowerCase()];

            return (
            <Link
              key={track.id}
              href={addLocalePrefix(`/tracks/${encodeURIComponent(track.commandName)}`, locale)}
              className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-500/50 hover:bg-zinc-900"
            >
              <div className="relative mb-4 flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800/80">
                  <Route className="h-5 w-5 text-zinc-300 group-hover:text-cyan-300 transition-colors" />
                </div>
              </div>

              <h2 className="relative text-white text-xl font-bold mb-2 truncate group-hover:text-cyan-300 transition-colors">
                {track.name}
              </h2>

              <p className="relative mb-6 text-xs font-mono text-zinc-500 truncate">
                /tt {track.commandName}
              </p>

              <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {t(locale, "public.tracksCatalog.attempts")}
                  </div>
                  <div className="text-sm font-mono text-zinc-200">
                    {stats?.entries ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {t(locale, "public.tracksCatalog.record")}
                  </div>
                  <div className="text-sm font-mono text-zinc-200">
                    {formatTime(stats?.bestTimeMs ?? null)}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {stats?.recordHolder ?? t(locale, "public.tracksCatalog.noHolder")}
                  </div>
                </div>
              </div>

              <div className="relative mt-auto inline-flex items-center gap-2 text-cyan-400 text-sm font-medium">
                {t(locale, "public.tracksCatalog.viewRecords")}
                <ChevronRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
