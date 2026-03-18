import Link from "next/link";
import { unstable_cache } from "next/cache";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Clock, Flag, MapPin, Trophy, Zap } from "lucide-react";

import { Badge } from "@/components/Badge";
import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import { getRequestLocale } from "@/i18n/request";
import { prisma } from "@/lib/prisma";

export const revalidate = 30;

interface PageProps {
  params: Promise<{ id: string; raceId: string }>;
  searchParams: Promise<{ round?: string }>;
}

function formatTime(ms: number | null): string {
  if (ms === null || ms <= 0) return "--";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const milliseconds = (ms % 1000).toString().padStart(3, "0");
  return `${minutes}:${seconds}.${milliseconds}`;
}

function isDidNotFinish(position: number): boolean {
  return position <= 0;
}

function getResultStatus(result: {
  disqualified: boolean;
  position: number;
  finishTimeMs: number | null;
}): "DSQ" | "DNF" | "FINISHED" {
  if (result.disqualified) return "DSQ";
  if (isDidNotFinish(result.position)) return "DNF";
  return "FINISHED";
}

function translateRaceStatus(
  status: string,
  locale: "pt-BR" | "en",
): string {
  if (status === "COMPLETED") {
    return t(locale, "public.leagueDetail.statusCompleted");
  }

  if (status === "PENDING") {
    return t(locale, "public.leagueDetail.statusPending");
  }

  if (status === "IN_PROGRESS") {
    return t(locale, "public.leagueDetail.statusInProgress");
  }

  return status;
}

const getRaceBaseData = unstable_cache(
  async (raceId: string) => {
    return prisma.race.findUnique({
      where: { id: raceId },
      select: {
        id: true,
        round: true,
        name: true,
        trackApiName: true,
        scheduledDate: true,
        status: true,
        season: {
          select: {
            id: true,
            name: true,
            league: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
        },
        eventRounds: {
          orderBy: { apiRoundName: "asc" },
          select: {
            id: true,
            apiRoundName: true,
            apiRoundType: true,
            countsForStandings: true,
          },
        },
      },
    });
  },
  ["public-race-base-v2"],
  { revalidate: 60 },
);

const getRoundResults = unstable_cache(
  async (eventRoundId: string) => {
    return prisma.roundResult.findMany({
      where: { eventRoundId },
      orderBy: [{ position: "asc" }, { points: "desc" }],
      select: {
        id: true,
        position: true,
        finishTimeMs: true,
        points: true,
        disqualified: true,
        fastestLap: true,
        fastestLapTime: true,
        driver: {
          select: {
            uuid: true,
            currentName: true,
          },
        },
      },
    });
  },
  ["public-round-results-v1"],
  { revalidate: 60 },
);

export default async function PublicRaceResultsPage({
  params,
  searchParams,
}: PageProps) {
  const locale = await getRequestLocale();
  const { id: leagueIdentifier, raceId } = await params;
  const { round: requestedRoundId } = await searchParams;

  const race = await getRaceBaseData(raceId);

  if (!race) {
    notFound();
  }

  const canonicalLeagueSlug = race.season.league.slug;
  if (leagueIdentifier === race.season.league.id) {
    const queryString = requestedRoundId ? `?round=${requestedRoundId}` : "";
    permanentRedirect(
      addLocalePrefix(`/leagues/${canonicalLeagueSlug}/races/${raceId}${queryString}`, locale),
    );
  }

  if (leagueIdentifier !== canonicalLeagueSlug) {
    notFound();
  }

  const defaultRound =
    race.eventRounds.find((round) => round.countsForStandings) ?? race.eventRounds[0];
  const activeRound =
    race.eventRounds.find((round) => round.id === requestedRoundId) ?? defaultRound;
  const activeRoundResults = activeRound ? await getRoundResults(activeRound.id) : [];

  return (
    <div className="animate-in fade-in duration-500 max-w-6xl mx-auto">
      <Link
        href={addLocalePrefix(`/leagues/${canonicalLeagueSlug}?season=${race.season.id}&tab=races`, locale)}
        className="inline-flex items-center gap-2 text-zinc-500 hover:text-cyan-400 transition-colors mb-6 text-sm font-mono"
      >
        <ArrowLeft size={16} />
        {t(locale, "public.racePage.backToRaces")}
      </Link>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono mb-2">
              {race.season.league.name} - {race.season.name}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-white font-mono">
              R{race.round} - {race.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} className="text-zinc-500" />
                {race.trackApiName || t(locale, "public.racePage.unknownTrack")}
              </span>
              {race.scheduledDate && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={14} className="text-zinc-500" />
                  {new Date(race.scheduledDate).toLocaleDateString(locale)}
                </span>
              )}
            </div>
          </div>

          <Badge
            size="md"
            variant={
              race.status === "COMPLETED"
                ? "success"
                : race.status === "PENDING"
                ? "warning"
                : "neutral"
            }
            className="uppercase font-mono"
          >
            {translateRaceStatus(race.status, locale)}
          </Badge>
        </div>
      </div>

      <div className="space-y-6">
        {race.eventRounds.length === 0 ? (
          <div className="p-10 text-center bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500">
            <Flag className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
            {t(locale, "public.racePage.noRounds")}
          </div>
        ) : (
          <>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 flex flex-wrap gap-2">
              {race.eventRounds.map((round) => {
                const isActive = activeRound?.id === round.id;
                return (
                  <Link
                    key={round.id}
                    href={addLocalePrefix(`/leagues/${canonicalLeagueSlug}/races/${raceId}?round=${round.id}`, locale)}
                    className={`px-3 py-2 rounded-lg text-sm font-mono transition-colors border ${
                      isActive
                        ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
                    }`}
                  >
                    {round.apiRoundName}
                  </Link>
                );
              })}
            </div>

            {activeRound && (
              <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-950/40 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg text-white font-semibold flex items-center gap-2">
                      <Trophy size={16} className="text-cyan-400" />
                      {activeRound.apiRoundName}
                    </h2>
                    <p className="text-xs text-zinc-500 mt-1">
                      {t(locale, "public.racePage.type")} {activeRound.apiRoundType}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeRound.countsForStandings && (
                      <Badge variant="accent" className="text-[10px] uppercase tracking-wider">
                        {t(locale, "public.racePage.countsForStandings")}
                      </Badge>
                    )}
                  </div>
                </div>

                {activeRoundResults.length === 0 ? (
                  <div className="px-5 py-6 text-zinc-600 text-sm">
                    {t(locale, "public.racePage.noRoundResults")}
                  </div>
                ) : (
                  <>
                    <div className="md:hidden divide-y divide-zinc-800/50">
                      {activeRoundResults.map((result) => {
                        const status = getResultStatus(result);
                        return (
                          <div key={result.id} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-mono text-sm mb-1">
                                  {status === "DSQ" ? (
                                    <span className="text-red-400">{t(locale, "public.racePage.dsqShort")}</span>
                                  ) : status === "DNF" ? (
                                    <span className="text-zinc-300">{t(locale, "public.racePage.dnfShort")}</span>
                                  ) : (
                                    <span className="text-zinc-300">P{result.position}</span>
                                  )}
                                </div>
                                <Link
                                  href={addLocalePrefix(`/driver/${result.driver.uuid}`, locale)}
                                  className="inline-flex items-center gap-2 text-zinc-200 hover:text-cyan-400 transition-colors min-w-0"
                                >
                                  <img
                                    src={`https://mc-heads.net/avatar/${result.driver.uuid}/24`}
                                    alt={result.driver.currentName || t(locale, "public.racePage.driver")}
                                    className="w-6 h-6 rounded shrink-0"
                                  />
                                  <span className="truncate">
                                    {result.driver.currentName || t(locale, "public.racePage.unknownDriver")}
                                  </span>
                                  {result.fastestLap && (
                                    <span className="relative inline-flex items-center group/fastlap shrink-0">
                                      <Zap size={12} className="text-purple-400" />
                                      <span className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover/fastlap:opacity-100">
                                        {result.fastestLapTime && result.fastestLapTime > 0
                                          ? `${t(locale, "public.racePage.fastestLap")}: ${formatTime(result.fastestLapTime)}`
                                          : t(locale, "public.racePage.fastestLap")}
                                      </span>
                                    </span>
                                  )}
                                </Link>
                              </div>
                              <span className="font-mono text-cyan-400 font-semibold shrink-0">
                                {result.points > 0 ? `+${result.points}` : result.points}
                              </span>
                            </div>
                            <div className="mt-2 text-xs font-mono text-zinc-400">
                              {status === "DSQ"
                                ? t(locale, "public.racePage.disqualified")
                                : status === "DNF"
                                ? t(locale, "public.racePage.didNotFinish")
                                : formatTime(result.finishTimeMs)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs uppercase tracking-wider text-zinc-500 bg-zinc-950/30 font-mono">
                          <tr>
                            <th className="text-left px-5 py-3 w-16">{t(locale, "public.racePage.position")}</th>
                            <th className="text-left px-4 py-3">{t(locale, "public.racePage.driver")}</th>
                            <th className="text-left px-4 py-3">{t(locale, "public.racePage.time")}</th>
                            <th className="text-right px-5 py-3">{t(locale, "public.racePage.points")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {activeRoundResults.map((result) => {
                            const status = getResultStatus(result);
                            return (
                              <tr key={result.id} className="hover:bg-zinc-800/20 transition-colors">
                                <td className="px-5 py-3 font-mono">
                                  {status === "DSQ" ? (
                                    <span className="text-red-400">{t(locale, "public.racePage.dsqShort")}</span>
                                  ) : status === "DNF" ? (
                                    <span className="text-zinc-300">{t(locale, "public.racePage.dnfShort")}</span>
                                  ) : (
                                    <span className="text-zinc-300">P{result.position}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <Link
                                    href={addLocalePrefix(`/driver/${result.driver.uuid}`, locale)}
                                    className="inline-flex items-center gap-2 text-zinc-200 hover:text-cyan-400 transition-colors"
                                  >
                                    <img
                                      src={`https://mc-heads.net/avatar/${result.driver.uuid}/24`}
                                      alt={result.driver.currentName || t(locale, "public.racePage.driver")}
                                      className="w-6 h-6 rounded"
                                    />
                                    <span>
                                      {result.driver.currentName || t(locale, "public.racePage.unknownDriver")}
                                    </span>
                                    {result.fastestLap && (
                                      <span className="relative inline-flex items-center group/fastlap">
                                        <Zap size={12} className="text-purple-400" />
                                        <span className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover/fastlap:opacity-100">
                                          {result.fastestLapTime && result.fastestLapTime > 0
                                            ? `${t(locale, "public.racePage.fastestLap")}: ${formatTime(result.fastestLapTime)}`
                                            : t(locale, "public.racePage.fastestLap")}
                                        </span>
                                      </span>
                                    )}
                                  </Link>
                                </td>
                                <td className="px-4 py-3 font-mono text-zinc-400">
                                  {status === "DSQ"
                                    ? t(locale, "public.racePage.disqualified")
                                    : status === "DNF"
                                    ? t(locale, "public.racePage.didNotFinish")
                                    : formatTime(result.finishTimeMs)}
                                </td>
                                <td className="px-5 py-3 text-right font-mono text-cyan-400 font-semibold">
                                  {result.points > 0 ? `+${result.points}` : result.points}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
