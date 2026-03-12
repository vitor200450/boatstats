import Link from "next/link";
import { CheckCircle2, Trophy, Users, Flag, ArrowRight } from "lucide-react";
import { Badge } from "@/components/Badge";
import type { AppLocale } from "@/i18n/config";
import { t } from "@/i18n/messages";

type SummaryEntry = {
  id: string;
  name: string;
  points: number;
  imageUrl?: string | null;
  imageBgColor?: string | null;
  imageVariant?: "avatar" | "teamLogo";
  imageScale?: number | null;
  imagePosX?: number | null;
  imagePosY?: number | null;
};

type SeasonFinalSummaryProps = {
  locale?: AppLocale;
  driverChampion: SummaryEntry | null;
  teamChampion: SummaryEntry | null;
  topDrivers: SummaryEntry[];
  topTeams: SummaryEntry[];
  completedRacesCount: number;
  standingsHref: string;
  racesHref: string;
  showLinks?: boolean;
};

function TopList({
  locale,
  title,
  entries,
}: {
  locale: AppLocale;
  title: string;
  entries: SummaryEntry[];
}) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
      <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-mono mb-3">
        {title}
      </h4>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">{t(locale, "public.seasonFinalSummary.insufficientData")}</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className="flex items-center justify-between text-sm rounded-lg px-3 py-2 bg-zinc-950/40 border border-zinc-800"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-zinc-800 text-zinc-300 text-xs font-mono shrink-0">
                  {index + 1}
                </span>
                {entry.imageUrl ? (
                  <div
                    className="w-7 h-7 rounded-md overflow-hidden border border-white/10 shrink-0"
                    style={{ backgroundColor: entry.imageBgColor ?? "#27272a" }}
                  >
                    <img
                      src={entry.imageUrl}
                      alt={entry.name}
                      className={`w-full h-full ${entry.imageVariant === "teamLogo" ? "object-contain" : "object-cover"}`}
                      style={
                        entry.imageVariant === "teamLogo"
                          ? {
                              transform: `scale(${entry.imageScale ?? 1}) translate(${entry.imagePosX ?? 0}%, ${entry.imagePosY ?? 0}%)`,
                              transformOrigin: "center",
                            }
                          : undefined
                      }
                    />
                  </div>
                ) : null}
                <span className="text-zinc-200 truncate">{entry.name}</span>
              </div>
              <span className="text-cyan-400 font-mono shrink-0">
                {entry.points} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SeasonFinalSummary({
  locale = "pt-BR",
  driverChampion,
  teamChampion,
  topDrivers,
  topTeams,
  completedRacesCount,
  standingsHref,
  racesHref,
  showLinks = true,
}: SeasonFinalSummaryProps) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-5 border-b border-zinc-800 bg-zinc-900">
        <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
          <CheckCircle2 className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white font-mono">
            {t(locale, "public.seasonFinalSummary.title")}
          </h3>
          <p className="text-xs text-blue-300/70">
            {t(locale, "public.seasonFinalSummary.subtitle")}
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900/70 border border-yellow-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2 text-yellow-400">
              <Trophy size={16} />
              <Badge
                variant="warning"
                size="md"
                className="uppercase tracking-wider font-mono"
              >
                {t(locale, "public.seasonFinalSummary.driverChampion")}
              </Badge>
            </div>
            {driverChampion ? (
              <>
                <div className="flex items-center gap-2">
                  {driverChampion.imageUrl ? (
                    <div className="w-7 h-7 rounded-md overflow-hidden border border-white/10 bg-zinc-800">
                      <img
                        src={driverChampion.imageUrl}
                        alt={driverChampion.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : null}
                  <p className="text-white font-semibold truncate">{driverChampion.name}</p>
                </div>
                <p className="text-yellow-400 font-mono text-sm">
                  {driverChampion.points} pts
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">{t(locale, "public.seasonFinalSummary.insufficientChampionData")}</p>
            )}
          </div>

          <div className="bg-zinc-900/70 border border-cyan-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2 text-cyan-400">
              <Users size={16} />
              <Badge
                variant="accent"
                size="md"
                className="uppercase tracking-wider font-mono"
              >
                {t(locale, "public.seasonFinalSummary.teamChampion")}
              </Badge>
            </div>
            {teamChampion ? (
              <>
                <div className="flex items-center gap-2">
                  {teamChampion.imageUrl ? (
                    <div
                      className="w-7 h-7 rounded-md overflow-hidden border border-white/10"
                      style={{ backgroundColor: teamChampion.imageBgColor ?? "#27272a" }}
                    >
                      <img
                        src={teamChampion.imageUrl}
                        alt={teamChampion.name}
                        className="w-full h-full object-contain"
                        style={{
                          transform: `scale(${teamChampion.imageScale ?? 1}) translate(${teamChampion.imagePosX ?? 0}%, ${teamChampion.imagePosY ?? 0}%)`,
                          transformOrigin: "center",
                        }}
                      />
                    </div>
                  ) : null}
                  <p className="text-white font-semibold truncate">{teamChampion.name}</p>
                </div>
                <p className="text-cyan-400 font-mono text-sm">
                  {teamChampion.points} pts
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">{t(locale, "public.seasonFinalSummary.insufficientChampionData")}</p>
            )}
          </div>

          <div className="bg-zinc-900/70 border border-green-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2 text-green-400">
              <Flag size={16} />
              <Badge
                variant="success"
                size="md"
                className="uppercase tracking-wider font-mono"
              >
                {t(locale, "public.seasonFinalSummary.completedRaces")}
              </Badge>
            </div>
            <p className="text-white font-semibold">{completedRacesCount}</p>
            <p className="text-sm text-zinc-500">{t(locale, "public.seasonFinalSummary.totalInSeason")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopList locale={locale} title={t(locale, "public.seasonFinalSummary.topDrivers")} entries={topDrivers} />
          <TopList locale={locale} title={t(locale, "public.seasonFinalSummary.topTeams")} entries={topTeams} />
        </div>

        {showLinks && (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={standingsHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 transition-colors"
            >
              {t(locale, "public.seasonFinalSummary.viewFullStandings")}
              <ArrowRight size={16} />
            </Link>
            <Link
              href={racesHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              {t(locale, "public.seasonFinalSummary.viewSeasonRaces")}
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
