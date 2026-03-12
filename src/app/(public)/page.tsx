import Link from "next/link";
import { unstable_cache } from "next/cache";
import { Trophy, Calendar, ChevronRight, Flag } from "lucide-react";

import DriverSearchBar from "@/components/DriverSearchBar";
import HeroTypewriter from "@/components/HeroTypewriter";
import HeroReveal from "@/components/HeroReveal";
import ScrollReveal from "@/components/ScrollReveal";
import { Badge } from "@/components/Badge";
import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import { getRequestLocale } from "@/i18n/request";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

const getPublicHomeData = unstable_cache(
  async () => {
    try {
      const [activeSeasons, leaguesWithRecentRaces] = await prisma.$transaction(
        [
          prisma.season.findMany({
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 4,
            select: {
              id: true,
              name: true,
              league: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  logoUrl: true,
                },
              },
              standings: {
                where: { type: "DRIVER", position: { in: [1, 2, 3] } },
                orderBy: { position: "asc" },
                take: 3,
                select: {
                  id: true,
                  position: true,
                  totalPoints: true,
                  driver: {
                    select: {
                      uuid: true,
                      currentName: true,
                    },
                  },
                },
              },
            },
          }),
          prisma.league.findMany({
            where: {
              seasons: {
                some: {
                  races: {
                    some: { status: { in: ["COMPLETED", "PENDING", "SCHEDULED"] } },
                  },
                },
              },
            },
            select: {
              id: true,
              slug: true,
              name: true,
              logoUrl: true,
            seasons: {
              select: {
                id: true,
                name: true,
                status: true,
                races: {
                  where: { status: { in: ["COMPLETED", "PENDING", "SCHEDULED"] } },
                  orderBy: [{ scheduledDate: "desc" }, { updatedAt: "desc" }],
                  take: 3,
                    select: {
                      id: true,
                      name: true,
                      status: true,
                      trackApiName: true,
                      scheduledDate: true,
                      updatedAt: true,
                      eventRounds: {
                        where: { countsForStandings: true },
                        orderBy: { apiRoundName: "asc" },
                        take: 1,
                        select: {
                          id: true,
                          results: {
                            where: { position: { in: [1, 2, 3] } },
                            orderBy: { position: "asc" },
                            take: 3,
                            select: {
                              id: true,
                              position: true,
                              driver: {
                                select: {
                                  uuid: true,
                                  currentName: true,
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        ],
      );

      const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
      const staleLeagueCutoff = Date.now() - oneMonthMs;

      const recentRaces = leaguesWithRecentRaces.flatMap((league) => {
        const activeSeasons = league.seasons.filter((season) => season.status === "ACTIVE");
        const prioritizedSeasons = activeSeasons.length > 0 ? activeSeasons : league.seasons;

        if (activeSeasons.length === 0) {
          const latestCompletedRaceTimestamp = league.seasons
            .flatMap((season) => season.races)
            .filter((race) => race.status === "COMPLETED")
            .map((race) => (race.scheduledDate ?? race.updatedAt).getTime())
            .sort((a, b) => b - a)[0];

          if (!latestCompletedRaceTimestamp || latestCompletedRaceTimestamp < staleLeagueCutoff) {
            return [];
          }
        }

        const racesForLeague = prioritizedSeasons
          .flatMap((season) =>
            season.races.map((race) => ({
              id: race.id,
              name: race.name,
              status: race.status,
              trackApiName: race.trackApiName,
              scheduledDate: race.scheduledDate,
              updatedAt: race.updatedAt,
              season: {
                id: season.id,
                name: season.name,
                league: {
                  id: league.id,
                  slug: league.slug,
                  name: league.name,
                  logoUrl: league.logoUrl,
                },
              },
              eventRounds: race.eventRounds,
            })),
          )
          .sort((a, b) => {
            const aTimestamp = (a.scheduledDate ?? a.updatedAt).getTime();
            const bTimestamp = (b.scheduledDate ?? b.updatedAt).getTime();
            return bTimestamp - aTimestamp;
          })
          .slice(0, 3)
          .map(({ updatedAt, ...race }) => race);

        return racesForLeague;
      });

      return { activeSeasons, recentRaces };
    } catch (error) {
      console.error("Error loading public home data:", error);
      return { activeSeasons: [], recentRaces: [] };
    }
  },
  ["public-home-data-v3"],
  { revalidate: 60 },
);

export default async function PublicHomePage() {
  const locale = await getRequestLocale();
  const heroTitle = t(locale, "public.home.heroTitle");
  const heroHighlightStart = Math.max(heroTitle.indexOf("\n") + 1, 0);
  const { activeSeasons, recentRaces } = await getPublicHomeData();
  const homeLeaguesHref = addLocalePrefix("/leagues", locale);
  const homeTracksHref = addLocalePrefix("/tracks", locale);

  return (
    <div className="animate-in fade-in duration-500">
      {/* Hero Section */}
      <div className="relative z-20 mb-14 md:mb-16 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-white tracking-tight font-mono mb-4">
          <HeroTypewriter
            text={heroTitle}
            className="block"
            highlightStart={heroHighlightStart}
          />
        </h1>
        <HeroReveal
          delayMs={300}
          className="mb-8 max-w-2xl mx-auto text-zinc-400 text-base sm:text-lg px-1"
        >
          {t(locale, "public.home.heroDescription")}
        </HeroReveal>

        <HeroReveal
          delayMs={390}
          className="mb-6 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300"
        >
          <Badge
            variant="accent"
            className="px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide"
          >
            Beta
          </Badge>
          <span className="text-zinc-500">•</span>
          <span>
            {t(locale, "public.home.betaNotice")}
          </span>
        </HeroReveal>

        <HeroReveal
          delayMs={480}
          className="relative z-30 flex items-center justify-center w-full max-w-xl mx-auto"
        >
          <DriverSearchBar />
        </HeroReveal>

      </div>

      {/* Active Championships */}
      <ScrollReveal className="mb-16">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
              <Trophy className="text-yellow-400" size={24} />
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-mono">
                {t(locale, "public.home.activeChampionships")}
              </h2>
            </div>
            <Link
             href={homeLeaguesHref}
             className="text-sm text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1"
           >
             {t(locale, "public.home.viewAll")}
             <ChevronRight size={16} />
           </Link>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-yellow-500/50 via-zinc-800 to-transparent mb-6"></div>

        {activeSeasons.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <Trophy className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
            <p className="text-zinc-500 mb-5">{t(locale, "public.home.noActiveChampionships")}</p>
            <Link
              href={homeLeaguesHref}
              className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors border border-zinc-700"
            >
              {t(locale, "public.home.browseLeagues")}
              <ChevronRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeSeasons.map((season) => {
              const topStandings = season.standings.slice(0, 3);

              return (
                <Link
                  key={season.id}
                  href={addLocalePrefix(`/leagues/${season.league.slug}?season=${season.id}`, locale)}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-cyan-500/50 transition-all group"
                >
                  {/* Banner Section - Logo as full background */}
                  <div
                    className="relative h-40 bg-zinc-800"
                    style={
                      season.league.logoUrl
                        ? {
                            backgroundImage: `url(${season.league.logoUrl})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : {}
                    }
                  >
                    {/* Gradient overlay for better text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent"></div>

                    {/* Active Badge */}
                    <div className="absolute top-4 right-4 z-10">
                      <Badge
                        size="md"
                        dotColorClassName="bg-emerald-400"
                        className="border-zinc-600/80 bg-zinc-950/85 text-zinc-200 shadow-sm"
                      >
                        {t(locale, "public.home.inProgress")}
                      </Badge>
                    </div>

                    {/* League name overlay at bottom of banner */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
                      <h3 className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg group-hover:text-cyan-400 transition-colors">
                        {season.league.name}
                      </h3>
                      <p className="text-zinc-300 text-sm drop-shadow-md">
                        {season.name}
                      </p>
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="pb-5 px-6 pt-4">
                    {/* Top 3 Standings */}
                    {topStandings.length > 0 ? (
                      <div className="space-y-3">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                          {t(locale, "public.home.currentLeaderboard")}
                        </div>
                        <div className="space-y-2">
                          {topStandings.map((standing, idx) => (
                            <div
                              key={standing.id}
                              className={`flex items-center gap-3 p-2 rounded-lg ${
                                idx === 0
                                  ? "bg-yellow-500/5 border border-yellow-500/20"
                                  : idx === 1
                                    ? "bg-zinc-400/5 border border-zinc-400/10"
                                    : "bg-orange-500/5 border border-orange-500/10"
                              }`}
                            >
                              <span
                                className={`text-sm font-mono font-bold w-6 ${
                                  idx === 0
                                    ? "text-yellow-400"
                                    : idx === 1
                                      ? "text-zinc-300"
                                      : "text-orange-400"
                                }`}
                              >
                                {standing.position}º
                              </span>
                              {standing.driver ? (
                                <>
                                  <img
                                    src={`https://mc-heads.net/avatar/${standing.driver.uuid}/24`}
                                    alt={
                                      standing.driver.currentName || t(locale, "public.home.unknownDriver")
                                    }
                                    className="w-6 h-6 rounded"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className={`text-sm truncate ${idx === 0 ? "text-white font-medium" : "text-zinc-400"}`}
                                    >
                                      {standing.driver.currentName}
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm text-zinc-500 italic">
                                     {t(locale, "public.home.driverRemoved")}
                                    </div>
                                </div>
                              )}
                              <div className="text-sm text-cyan-400 font-mono font-semibold">
                                {standing.totalPoints} pts
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center">
                        <div className="text-zinc-600 text-sm italic">
                          {t(locale, "public.home.noStandingsYet")}
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </ScrollReveal>

      {/* Recent Races */}
      <ScrollReveal className="mb-12" delayMs={120}>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <Calendar className="text-cyan-400" size={24} />
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-mono">
               {t(locale, "public.home.recentRaces")}
              </h2>
          </div>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-cyan-500/50 via-zinc-800 to-transparent mb-6"></div>

        {recentRaces.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <Flag className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
            <p>{t(locale, "public.home.noCompletedRaces")}</p>
          </div>
        ) : (
          (() => {
            // Group races by league
            const groupedRaces = recentRaces.reduce(
              (acc, race) => {
                const leagueId = race.season.league.id;
                const leagueName = race.season.league.name;
                const leagueLogo = race.season.league.logoUrl;

                if (!acc[leagueId]) {
                  acc[leagueId] = {
                    league: {
                      id: leagueId,
                      name: leagueName,
                      logoUrl: leagueLogo,
                    },
                    races: [],
                  };
                }
                acc[leagueId].races.push(race);
                return acc;
              },
              {} as Record<
                string,
                {
                  league: { id: string; name: string; logoUrl: string | null };
                  races: typeof recentRaces;
                }
              >,
            );

            const leagueGroups = Object.values(groupedRaces);

            return leagueGroups.map((group) => {
              // Limit to 3 most recent races per league
              const limitedRaces = group.races.slice(0, 3);
              const seasonNames = Array.from(
                new Set(group.races.map((race) => race.season.name)),
              );
              const seasonLabel =
                seasonNames.length === 1
                  ? seasonNames[0]
                  : `${seasonNames.length} ${t(locale, "public.home.seasonsSuffix")}`;

              return (
                <div key={group.league.id} className="mb-8 last:mb-0">
                  {/* League Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {group.league.logoUrl ? (
                        <img
                          src={group.league.logoUrl}
                          alt={group.league.name}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <Flag className="w-5 h-5 text-zinc-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="flex items-center gap-2 text-lg font-bold text-white font-mono">
                        <span>{group.league.name}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-sm font-medium text-zinc-400">{seasonLabel}</span>
                      </h3>
                      <p className="text-xs text-zinc-500">
                        {group.races.length > 1
                          ? t(locale, "public.home.recentRacesCount", { count: group.races.length })
                          : `1 ${t(locale, "public.home.recentRaceSingular")}`}
                      </p>
                    </div>
                  </div>

                  {/* Races Grid for this League */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {limitedRaces.map((race) => {
                      // Get top 3 from first counting round
                      const topResults =
                        race.eventRounds[0]?.results?.slice(0, 3) || [];
                      const isComingSoon =
                        race.status === "PENDING" || race.status === "SCHEDULED";

                      return (
                        <Link
                          key={race.id}
                          href={addLocalePrefix(
                            `/leagues/${race.season.league.slug}?season=${race.season.id}`,
                            locale,
                          )}
                          className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl hover:border-cyan-500/50 transition-colors group flex flex-col"
                        >
                          {/* Race Info */}
                          <div className="mb-3">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="min-w-0 flex-1 text-white font-bold group-hover:text-cyan-400 transition-colors truncate">
                                {race.name}
                              </h4>
                              {isComingSoon && (
                                <Badge className="shrink-0" dotColorClassName="bg-cyan-400">
                                  {t(locale, "public.home.comingSoon")}
                                </Badge>
                              )}
                            </div>
                            {race.trackApiName && (
                              <p className="text-zinc-500 text-sm truncate">
                                {race.trackApiName}
                              </p>
                            )}
                            {race.scheduledDate && (
                              <p className="text-[10px] text-zinc-400 font-mono mt-1">
                                {new Date(race.scheduledDate).toLocaleString(
                                  locale,
                                  {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </p>
                            )}
                          </div>

                          {/* Top 3 Results */}
                          <div className="space-y-2 flex-grow">
                            {topResults.length > 0 ? (
                              topResults.map((result, idx) => (
                                <div
                                  key={result.id}
                                  className="flex items-center gap-2"
                                >
                                  <span
                                    className={`text-xs font-mono font-bold w-4 ${
                                      idx === 0
                                        ? "text-yellow-400"
                                        : idx === 1
                                          ? "text-zinc-300"
                                          : "text-orange-400"
                                    }`}
                                  >
                                    {idx + 1}º
                                  </span>
                                  <img
                                    src={`https://mc-heads.net/avatar/${result.driver.uuid}/20`}
                                    alt={result.driver.currentName || t(locale, "public.home.unknownDriver")}
                                    className="w-5 h-5 rounded"
                                  />
                                  <span
                                    className={`text-sm truncate flex-1 ${
                                      idx === 0
                                        ? "text-white font-medium"
                                        : "text-zinc-400"
                                    }`}
                                  >
                                    {result.driver.currentName}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                                  <Calendar size={14} className="text-zinc-500" />
                                  {t(locale, "public.home.resultsComingSoon")}
                                </div>
                                <p className="mt-1 text-[11px] text-zinc-600">
                                  {t(locale, "public.home.raceScheduledNoResults")}
                                </p>
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()
        )}
      </ScrollReveal>

      {/* CTA Section */}
      <ScrollReveal
        delayMs={180}
        className="bg-gradient-to-br from-cyan-500/10 via-zinc-900 to-zinc-900 border border-zinc-800 rounded-2xl p-8 md:p-12 text-center"
      >
        <Trophy className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white font-mono mb-2">
          {t(locale, "public.home.ctaTitle")}
        </h2>
        <p className="text-zinc-400 mb-6 max-w-md mx-auto">
          {t(locale, "public.home.ctaDescription")}
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
          <Link
            href={homeLeaguesHref}
            className="inline-flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            <Trophy size={18} />
            {t(locale, "public.home.ctaViewLeagues")}
          </Link>
          <Link
            href={homeTracksHref}
            className="inline-flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors border border-zinc-700"
          >
            <Flag size={18} />
            {t(locale, "public.home.ctaTrackRecords")}
          </Link>
        </div>
      </ScrollReveal>
    </div>
  );
}
