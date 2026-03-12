"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AppLocale } from "@/i18n/config";
import { t } from "@/i18n/messages";

type Option = {
  id: string;
  name: string;
};

type DriverDashboardFiltersProps = {
  locale: AppLocale;
  leagueOptions: Option[];
  seasonOptions: Option[];
  selectedLeagueId: string;
  selectedSeasonId: string;
  countDnfs: boolean;
};

export function DriverDashboardFilters({
  locale,
  leagueOptions,
  seasonOptions,
  selectedLeagueId,
  selectedSeasonId,
  countDnfs,
}: DriverDashboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateQuery = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "performance");
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 w-full lg:w-auto">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">{t(locale, "public.driverPage.filterLeague")}</label>
        <select
          value={selectedLeagueId}
          onChange={(event) => updateQuery("league", event.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
        >
          {leagueOptions.map((league) => (
            <option key={league.id} value={league.id}>
              {league.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">{t(locale, "public.driverPage.filterSeason")}</label>
        <select
          value={selectedSeasonId}
          onChange={(event) => updateQuery("season", event.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
        >
          {seasonOptions.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">{t(locale, "public.driverPage.filterCountDnfs")}</label>
        <div className="grid grid-cols-2 bg-zinc-950 border border-zinc-800 rounded-lg p-1">
          <button
            type="button"
            onClick={() => updateQuery("countDnfs", "no")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              !countDnfs
                ? "bg-zinc-800 text-cyan-300"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t(locale, "public.driverPage.filterNo")}
          </button>
          <button
            type="button"
            onClick={() => updateQuery("countDnfs", "yes")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              countDnfs
                ? "bg-zinc-800 text-cyan-300"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t(locale, "public.driverPage.filterYes")}
          </button>
        </div>
      </div>

      <div className="flex items-end">
        <p className="text-xs text-zinc-500 leading-5">
          {t(locale, "public.driverPage.filterAutoUpdate")}
        </p>
      </div>
    </div>
  );
}
