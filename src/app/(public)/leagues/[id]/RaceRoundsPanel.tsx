"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/Badge";
import type { AppLocale } from "@/i18n/config";
import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import { getSprintModeLabel } from "@/lib/leagues/roundRules";
import type { SprintMode } from "@/lib/leagues/roundRules";

type RaceRound = {
  id: string;
  apiRoundName: string;
  specialType: string | null;
  sprintMode: SprintMode | null;
  countsForStandings: boolean;
  _count: { results: number };
  results: Array<{
    id: string;
    position: number;
    points: number;
    driver: {
      uuid: string;
      currentName: string | null;
    };
  }>;
};

type RaceRoundsPanelProps = {
  locale: AppLocale;
  leagueId: string;
  raceId: string;
  rounds: RaceRound[];
};

function isQualifyingRound(roundName: string): boolean {
  const normalizedRoundName = roundName.toLowerCase();
  return normalizedRoundName.includes("quali") || normalizedRoundName.includes("qualy");
}

export function RaceRoundsPanel({ locale, leagueId, raceId, rounds }: RaceRoundsPanelProps) {
  const defaultRoundId = useMemo(
    () => rounds.find((round) => round.countsForStandings && !isQualifyingRound(round.apiRoundName))?.id ?? rounds[0]?.id,
    [rounds],
  );
  const [activeRoundId, setActiveRoundId] = useState<string | undefined>(defaultRoundId);

  const activeRound =
    rounds.find((round) => round.id === activeRoundId) ?? rounds[0];

  if (!activeRound) {
    return <div className="p-4 text-center text-zinc-600">{t(locale, "public.leagueDetail.noResultsImported")}</div>;
  }

  const shouldShowPoints =
    activeRound.countsForStandings && !isQualifyingRound(activeRound.apiRoundName);

  return (
    <div className="p-4">
      <div className="flex justify-end mb-3">
        <Link
          href={addLocalePrefix(`/leagues/${leagueId}/races/${raceId}`, locale)}
          className="text-xs text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1 rounded-full transition-colors"
        >
          {t(locale, "public.raceRoundsPanel.viewFullResult")}
        </Link>
      </div>

      {rounds.length > 1 && (
        <div className="mb-4 overflow-x-auto">
          <div className="flex min-w-full w-max items-center gap-2 pb-1">
            {rounds.map((round) => {
              const isActive = round.id === activeRound.id;
              const roundShowsPoints =
                round.countsForStandings && !isQualifyingRound(round.apiRoundName);

              return (
                <button
                  key={round.id}
                  type="button"
                  onClick={() => setActiveRoundId(round.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                    isActive
                      ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                      : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  {round.apiRoundName}
                  {roundShowsPoints && <span className="ml-1.5 text-cyan-400">•</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          {activeRound.apiRoundName}
          {activeRound.specialType === "SPRINT" && (
            <Badge className="text-[10px] text-purple-300 border-purple-500/30 bg-purple-500/10">
              {getSprintModeLabel(
                activeRound.sprintMode === "POINTS" ||
                  activeRound.sprintMode === "CLASSIFICATION"
                  ? activeRound.sprintMode
                  : null,
              )}
            </Badge>
          )}
          {shouldShowPoints && <Badge variant="accent">{t(locale, "public.raceRoundsPanel.scoring")}</Badge>}
        </h4>

        {activeRound.results.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeRound.results.slice(0, 10).map((result) => (
                <Link
                  key={result.id}
                  href={addLocalePrefix(`/driver/${result.driver.uuid}`, locale)}
                  className="flex items-center gap-3 p-2 rounded-lg bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors group"
                >
                  <span className={`text-sm font-mono font-bold w-6 ${
                    result.position === 1
                      ? "text-yellow-400"
                      : result.position === 2
                      ? "text-zinc-300"
                      : result.position === 3
                      ? "text-orange-400"
                      : "text-zinc-500"
                  }`}>
                    P{result.position}
                  </span>
                  <img
                    src={`https://mc-heads.net/avatar/${result.driver.uuid}/24`}
                    alt={result.driver.currentName || t(locale, "public.raceRoundsPanel.unknownDriver")}
                    className="w-6 h-6 rounded"
                  />
                  <span className="text-zinc-300 group-hover:text-cyan-400 transition-colors truncate flex-1">
                    {result.driver.currentName || t(locale, "public.raceRoundsPanel.unknownDriver")}
                  </span>
                  {shouldShowPoints && (
                    <span className="text-sm text-cyan-400 font-mono">+{result.points}</span>
                  )}
                </Link>
              ))}
            </div>
            {activeRound._count.results > 10 && (
              <p className="mt-2 text-xs text-zinc-600">
                {t(locale, "public.raceRoundsPanel.showingTop10")}
              </p>
            )}
          </>
        ) : (
          <p className="text-zinc-600 text-sm">{t(locale, "public.raceRoundsPanel.noResults")}</p>
        )}
      </div>
    </div>
  );
}
