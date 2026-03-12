import Link from "next/link";
import { unstable_cache } from "next/cache";
import { Trophy } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/Badge";
import HeroTypewriter from "@/components/HeroTypewriter";
import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import { getRequestLocale } from "@/i18n/request";

export const revalidate = 30;

const getLeaguesData = unstable_cache(
  async () => {
    return prisma.league.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        logoUrl: true,
        seasons: {
          where: { status: { in: ["ACTIVE", "COMPLETED"] } },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            name: true,
            status: true,
            standings: {
              where: { type: "DRIVER", position: { lte: 3 } },
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
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },
  ["public-leagues-index-v3"],
  { revalidate: 60 },
);

export default async function LeaguesIndexPage() {
  const locale = await getRequestLocale();
  const leagues = await getLeaguesData();

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-10 mt-8 text-center flex flex-col items-center">
        <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight font-mono mb-4">
          <HeroTypewriter text={t(locale, "public.leaguesIndex.title")} className="block" highlightStart={8} />
        </h1>
        <p className="text-neutral-400 text-lg mb-12 max-w-xl mx-auto">
          {t(locale, "public.leaguesIndex.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {leagues.length === 0 ? (
          <p className="text-neutral-500 col-span-3 text-center py-12">
            {t(locale, "public.leaguesIndex.empty")}
          </p>
        ) : (
          leagues.map((league) => {
            const latestSeason = league.seasons[0];
            const topStandings = latestSeason?.standings ?? [];

            return (
              <Link
                key={league.id}
                href={addLocalePrefix(`/leagues/${league.slug}`, locale)}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-cyan-500/50 transition-colors group flex flex-col"
              >
                <div
                  className="relative h-32 bg-zinc-800"
                  style={
                    league.logoUrl
                      ? {
                          backgroundImage: `url(${league.logoUrl})`,
                          backgroundSize: "120%",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                        }
                      : {}
                  }
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent" />
                  {!league.logoUrl && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Trophy className="w-10 h-10 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
                    </div>
                  )}

                  {latestSeason && (
                    <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1">
                      <Badge size="md" className="bg-zinc-950/85 border-zinc-600/80 text-zinc-100">
                        {latestSeason.name}
                      </Badge>
                      <Badge
                        className="bg-zinc-950/95 border-zinc-600"
                        dotColorClassName={latestSeason.status === "ACTIVE" ? "bg-emerald-400" : undefined}
                      >
                        {latestSeason.status === "ACTIVE"
                          ? t(locale, "public.leaguesIndex.statusInProgress")
                          : t(locale, "public.leaguesIndex.statusCompleted")}
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="p-6 flex flex-col flex-1">

                  <h3 className="text-white text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">
                    {league.name}
                  </h3>
                  <p className="text-zinc-500 text-sm mb-6 flex-grow whitespace-pre-line break-words">
                    {league.description || t(locale, "public.leaguesIndex.fallbackDescription")}
                  </p>

                  {/* Top 3 */}
                  {topStandings.length > 0 && (
                    <div className="border-t border-zinc-800 pt-4 mt-auto">
                      <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-mono">
                        {t(locale, "public.leaguesIndex.currentTop3")}
                      </div>
                      <div className="space-y-2">
                        {topStandings.map((standing, idx) => (
                          <div key={standing.id} className="flex items-center gap-2">
                            <span
                              className={`w-4 text-xs font-mono font-bold ${
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
                                  src={`https://mc-heads.net/avatar/${standing.driver.uuid}/20`}
                                  alt={standing.driver.currentName || "Driver"}
                                  className="w-5 h-5 rounded"
                                />
                                <div className="text-sm text-zinc-200 truncate flex-1">
                                  {standing.driver.currentName}
                                </div>
                              </>
                            ) : (
                              <div className="text-sm text-zinc-500 italic flex-1">
                                {t(locale, "public.leaguesIndex.driverRemoved")}
                              </div>
                            )}
                            <div className="text-xs text-cyan-400 font-mono">
                              {standing.totalPoints} pts
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center text-sm font-mono text-zinc-400 group-hover:text-white transition-colors mt-4">
                    {t(locale, "public.leaguesIndex.viewStandings")}
                    <span className="material-symbols-outlined ml-2 text-sm">
                      arrow_forward
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
