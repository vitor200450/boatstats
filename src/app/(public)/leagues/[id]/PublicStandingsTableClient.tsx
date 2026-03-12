"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Badge } from "@/components/Badge";
import type { AppLocale } from "@/i18n/config";
import { t } from "@/i18n/messages";

type TeamInfo = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  logoScale?: number | null;
  logoPosX?: number | null;
  logoPosY?: number | null;
};

type Standing = {
  id: string;
  position: number;
  totalPoints: number;
  wins: number;
  podiums: number;
  racePoints?: unknown;
  driver?: { id: string; uuid: string; currentName: string | null } | null;
  team?: TeamInfo | null;
};

type RaceRow = {
  raceId: string;
  label: string;
  total: number;
  detail: string;
  position?: number;
  contributors?: Array<{ name: string; uuid: string | null; points: number }>;
};

function compareRaceLabels(a: string, b: string): number {
  const aMatch = /^R(\d+)\b/.exec(a);
  const bMatch = /^R(\d+)\b/.exec(b);
  if (aMatch && bMatch) {
    const diff = Number(aMatch[1]) - Number(bMatch[1]);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

function toRaceRows(
  racePoints: unknown,
  raceLabels: Record<string, string>,
  racePositionsByRaceId?: Record<string, number>,
  slotNamesByRaceId?: Record<string, { D1?: string; D2?: string; D3?: string }>,
  roundContributorsByRaceId?: Record<
    string,
    Record<string, Array<{ name: string; uuid: string | null; points: number }>>
  >,
): RaceRow[] {
  if (!racePoints || typeof racePoints !== "object") return [];
  const racePointsRecord = racePoints as Record<string, Record<string, number>>;

  const rows: RaceRow[] = [];
  for (const [raceId, raceData] of Object.entries(racePointsRecord)) {
    const hasSlotData =
      typeof raceData.D1 === "number" ||
      typeof raceData.D2 === "number" ||
      typeof raceData.D3 === "number";

    if (hasSlotData) {
      const d1 = raceData.D1 ?? 0;
      const d2 = raceData.D2 ?? 0;
      const d3 = raceData.D3 ?? 0;
      const slotNames = slotNamesByRaceId?.[raceId];
      const scoredContributors = [
        { slot: "D1" as const, points: d1 },
        { slot: "D2" as const, points: d2 },
        { slot: "D3" as const, points: d3 },
      ].filter((entry) => entry.points > 0);

      const detail =
        scoredContributors.length > 0
          ? scoredContributors
              .map(({ slot, points }) => `${slotNames?.[slot] ?? slot} ${points}`)
              .join(" • ")
          : `D1 ${d1} • D2 ${d2} • D3 ${d3}`;

      rows.push({
        raceId,
        label: raceLabels[raceId] || raceId.slice(-6),
        total: raceData.total ?? d1 + d2 + d3,
        detail,
        position: racePositionsByRaceId?.[raceId],
      });
      continue;
    }

    const entries = Object.entries(raceData).filter(([, value]) => typeof value === "number");
    const total = entries.reduce((acc, [, value]) => acc + value, 0);
    const detail = entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([roundName]) => {
        const contributors = roundContributorsByRaceId?.[raceId]?.[roundName] ?? [];
        if (contributors.length === 0) {
          return roundName;
        }

        const contributorsLabel = contributors
          .map((entry) => `${entry.name} ${entry.points}`)
          .join(", ");

        return `${roundName}: ${contributorsLabel}`;
      })
      .join(" • ");

    const contributorsByName = new Map<string, { uuid: string | null; points: number }>();
    const raceContributorsByRound = roundContributorsByRaceId?.[raceId] ?? {};
    for (const contributors of Object.values(raceContributorsByRound)) {
      for (const contributor of contributors) {
        const existing = contributorsByName.get(contributor.name);
        contributorsByName.set(contributor.name, {
          uuid: existing?.uuid ?? contributor.uuid,
          points: (existing?.points ?? 0) + contributor.points,
        });
      }
    }

    const contributors = Array.from(contributorsByName.entries())
      .map(([name, meta]) => ({ name, uuid: meta.uuid, points: meta.points }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    rows.push({
      raceId,
      label: raceLabels[raceId] || raceId.slice(-6),
      total,
      detail,
      position: racePositionsByRaceId?.[raceId],
      contributors,
    });
  }

  return rows.sort((a, b) => compareRaceLabels(a.label, b.label));
}

function PositionBadge({ position }: { position: number }) {
  if (position === 1)
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 font-bold font-mono text-sm">
        1
      </span>
    );
  if (position === 2)
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-zinc-400/10 border border-zinc-400/30 text-zinc-300 font-bold font-mono text-sm">
        2
      </span>
    );
  if (position === 3)
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-700/20 border border-orange-700/30 text-orange-400 font-bold font-mono text-sm">
        3
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 text-zinc-500 font-mono text-sm">
      {position}
    </span>
  );
}

function TeamLogo({ team, size }: { team: TeamInfo; size: "sm" | "lg" }) {
  const dim = size === "sm" ? "w-7 h-7" : "w-12 h-12";
  const radius = size === "sm" ? "rounded-md" : "rounded-full";
  const scale = team.logoScale ?? 1;
  const posX = team.logoPosX ?? 0;
  const posY = team.logoPosY ?? 0;

  return (
    <div
      className={`${dim} ${radius} shrink-0 overflow-hidden border border-white/10 flex items-center justify-center`}
      style={{ backgroundColor: team.color ?? "#3f3f46" }}
    >
      {team.logoUrl && (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="w-full h-full object-contain"
          style={{
            transform: `scale(${scale}) translate(${posX}%, ${posY}%)`,
            transformOrigin: "center",
          }}
        />
      )}
    </div>
  );
}

export function PublicStandingsTableClient({
  locale,
  tab,
  driverStandings,
  teamStandings,
  driverTeamMap,
  raceLabels,
  driverRacePositions,
  teamSlotNamesByTeamRace,
  teamRoundContributors,
}: {
  locale: AppLocale;
  tab: "drivers" | "teams";
  driverStandings: Standing[];
  teamStandings: Standing[];
  driverTeamMap: Record<string, TeamInfo>;
  raceLabels: Record<string, string>;
  driverRacePositions: Record<string, Record<string, number>>;
  teamSlotNamesByTeamRace: Record<
    string,
    Record<string, { D1?: string; D2?: string; D3?: string }>
  >;
  teamRoundContributors: Record<
    string,
    Record<string, Record<string, Array<{ name: string; uuid: string | null; points: number }>>>
  >;
}) {
  const [modal, setModal] = useState<{ title: string; rows: RaceRow[] } | null>(null);

  if (tab === "drivers") {
    return (
      <>
        <div className="md:hidden divide-y divide-zinc-800/50">
          {driverStandings.length === 0 ? (
            <div className="px-6 py-12 text-center text-zinc-500">{t(locale, "public.leagueStandingsTable.noDriverStandings")}</div>
          ) : (
            driverStandings.map((standing, idx) => {
              const gap = idx === 0 ? null : driverStandings[0].totalPoints - standing.totalPoints;
              const team = standing.driver ? driverTeamMap[standing.driver.id] : undefined;
              const rows = toRaceRows(
                standing.racePoints,
                raceLabels,
                standing.driver ? driverRacePositions[standing.driver.id] : undefined,
              );
              return (
                <div key={standing.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <PositionBadge position={standing.position} />
                      {standing.driver ? (
                        <>
                          <img
                            src={`https://mc-heads.net/avatar/${standing.driver.uuid}/32`}
                            alt={standing.driver.currentName || t(locale, "public.leagueStandingsTable.unknownDriver")}
                            className="w-8 h-8 rounded-md shrink-0 bg-zinc-800"
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/driver/${standing.driver.uuid}`}
                              className="block truncate text-white font-medium hover:text-cyan-400 transition-colors"
                            >
                              {standing.driver.currentName || t(locale, "public.leagueStandingsTable.unknownDriver")}
                            </Link>
                            {team && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: team.color ?? "#3f3f46" }}
                                />
                                <span className="text-xs text-zinc-500 truncate">{team.name}</span>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-zinc-500 italic">{t(locale, "public.leagueStandingsTable.driverRemoved")}</span>
                      )}
                    </div>
                    <span className="text-white font-bold font-mono text-base shrink-0">{standing.totalPoints}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge>{t(locale, "public.leagueStandingsTable.winsLabel")}: {standing.wins}</Badge>
                    <Badge>{t(locale, "public.leagueStandingsTable.podiumsLabel")}: {standing.podiums}</Badge>
                    {gap !== null && <Badge className="font-mono">-{gap} pts</Badge>}
                  </div>
                  {rows.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setModal({
                          title: `${t(locale, "public.leagueStandingsTable.progressionTitlePrefix")} - ${standing.driver?.currentName ?? t(locale, "public.leagueStandingsTable.driverFallback")}`,
                          rows,
                        })
                      }
                      className="mt-2 block text-[11px] text-cyan-400 hover:text-cyan-300"
                    >
                      {t(locale, "public.leagueStandingsTable.seasonDetails")}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-400 bg-zinc-950/40 uppercase font-mono border-b border-zinc-800">
              <tr>
                 <th className="px-6 py-4 font-medium w-16">{t(locale, "public.leagueStandingsTable.tablePosition")}</th>
                 <th className="px-4 py-4 font-medium">{t(locale, "public.leagueStandingsTable.tableDriver")}</th>
                 <th className="px-4 py-4 font-medium text-center">{t(locale, "public.leagueStandingsTable.tableWins")}</th>
                 <th className="px-4 py-4 font-medium text-center">{t(locale, "public.leagueStandingsTable.tablePodiums")}</th>
                 <th className="px-6 py-4 font-medium text-right">{t(locale, "public.leagueStandingsTable.tablePoints")}</th>
               </tr>
             </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {driverStandings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                    {t(locale, "public.leagueStandingsTable.noDriverStandings")}
                  </td>
                </tr>
              ) : (
                driverStandings.map((standing, idx) => {
                  const gap = idx === 0 ? null : driverStandings[0].totalPoints - standing.totalPoints;
                  const team = standing.driver ? driverTeamMap[standing.driver.id] : undefined;
                  const rows = toRaceRows(
                    standing.racePoints,
                    raceLabels,
                    standing.driver ? driverRacePositions[standing.driver.id] : undefined,
                  );
                  return (
                    <tr key={standing.id} className="transition-colors hover:bg-zinc-800/20">
                      <td className="px-6 py-4">
                        <PositionBadge position={standing.position} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {standing.driver ? (
                            <>
                              <img
                                src={`https://mc-heads.net/avatar/${standing.driver.uuid}/32`}
                                 alt={standing.driver.currentName || t(locale, "public.leagueStandingsTable.unknownDriver")}
                                className="w-7 h-7 rounded-md shrink-0 bg-zinc-800"
                              />
                              <div>
                                <Link
                                  href={`/driver/${standing.driver.uuid}`}
                                  className="text-white font-medium hover:text-cyan-400 transition-colors"
                                >
                                  {standing.driver.currentName || t(locale, "public.leagueStandingsTable.unknownDriver")}
                                </Link>
                                {gap !== null && (
                                  <span className="text-xs text-zinc-600 font-mono ml-2">-{gap} pts</span>
                                )}
                                {team && (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <div
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: team.color ?? "#3f3f46" }}
                                    />
                                    <span className="text-xs text-zinc-500">{team.name}</span>
                                  </div>
                                )}
                                {!team && <div className="min-h-[16px] mt-0.5" />}
                                {rows.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setModal({
                                         title: `${t(locale, "public.leagueStandingsTable.progressionTitlePrefix")} - ${standing.driver?.currentName ?? t(locale, "public.leagueStandingsTable.driverFallback")}`,
                                         rows,
                                       })
                                     }
                                    className="mt-1 block text-[11px] text-cyan-400 hover:text-cyan-300"
                                  >
                                     {t(locale, "public.leagueStandingsTable.seasonDetails")}
                                   </button>
                                 )}
                               </div>
                             </>
                           ) : (
                             <span className="text-zinc-500 italic">{t(locale, "public.leagueStandingsTable.driverRemoved")}</span>
                           )}
                         </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {standing.wins > 0 ? (
                          <span className="text-yellow-400 font-mono font-semibold">{standing.wins}</span>
                        ) : (
                          <span className="text-zinc-700">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {standing.podiums > 0 ? (
                          <span className="text-zinc-300 font-mono">{standing.podiums}</span>
                        ) : (
                          <span className="text-zinc-700">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-white font-bold font-mono text-base">{standing.totalPoints}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {modal && <ProgressionModal locale={locale} modal={modal} onClose={() => setModal(null)} />}
      </>
    );
  }

  return (
    <>
      <div className="md:hidden divide-y divide-zinc-800/50">
        {teamStandings.length === 0 ? (
          <div className="px-6 py-12 text-center text-zinc-500">{t(locale, "public.leagueStandingsTable.noTeamStandings")}</div>
        ) : (
          teamStandings.map((standing, idx) => {
            const gap = idx === 0 ? null : teamStandings[0].totalPoints - standing.totalPoints;
            const rows = toRaceRows(
              standing.racePoints,
              raceLabels,
              undefined,
              standing.team ? teamSlotNamesByTeamRace[standing.team.id] : undefined,
              standing.team ? teamRoundContributors[standing.team.id] : undefined,
            );
            return (
              <div key={standing.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PositionBadge position={standing.position} />
                    {standing.team ? (
                      <>
                        <TeamLogo team={standing.team as TeamInfo} size="sm" />
                        <span className="text-white font-medium truncate">{standing.team.name}</span>
                      </>
                    ) : (
                      <span className="text-zinc-500 italic">{t(locale, "public.leagueStandingsTable.teamRemoved")}</span>
                    )}
                  </div>
                  <span className="text-white font-bold font-mono text-base shrink-0">{standing.totalPoints}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge>{t(locale, "public.leagueStandingsTable.winsLabel")}: {standing.wins}</Badge>
                  <Badge>{t(locale, "public.leagueStandingsTable.podiumsLabel")}: {standing.podiums}</Badge>
                  {gap !== null && <Badge className="font-mono">-{gap} pts</Badge>}
                </div>
                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setModal({
                        title: `${t(locale, "public.leagueStandingsTable.progressionTitlePrefix")} - ${standing.team?.name ?? t(locale, "public.leagueStandingsTable.teamFallback")}`,
                        rows,
                      })
                    }
                    className="mt-2 block text-[11px] text-cyan-400 hover:text-cyan-300"
                  >
                    {t(locale, "public.leagueStandingsTable.seasonDetails")}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="hidden md:block">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-zinc-400 bg-zinc-950/40 uppercase font-mono border-b border-zinc-800">
            <tr>
              <th className="px-6 py-4 font-medium w-16">{t(locale, "public.leagueStandingsTable.tablePosition")}</th>
              <th className="px-4 py-4 font-medium">{t(locale, "public.leagueStandingsTable.tableTeam")}</th>
              <th className="px-4 py-4 font-medium text-center">{t(locale, "public.leagueStandingsTable.tableWins")}</th>
              <th className="px-4 py-4 font-medium text-center">{t(locale, "public.leagueStandingsTable.tablePodiums")}</th>
              <th className="px-6 py-4 font-medium text-right">{t(locale, "public.leagueStandingsTable.tablePoints")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {teamStandings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                  {t(locale, "public.leagueStandingsTable.noTeamStandings")}
                </td>
              </tr>
            ) : (
              teamStandings.map((standing, idx) => {
                const gap = idx === 0 ? null : teamStandings[0].totalPoints - standing.totalPoints;
                const rows = toRaceRows(
                  standing.racePoints,
                  raceLabels,
                  undefined,
                  standing.team ? teamSlotNamesByTeamRace[standing.team.id] : undefined,
                  standing.team ? teamRoundContributors[standing.team.id] : undefined,
                );
                return (
                  <tr key={standing.id} className="transition-colors hover:bg-zinc-800/20">
                    <td className="px-6 py-4">
                      <PositionBadge position={standing.position} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {standing.team ? (
                          <>
                            <TeamLogo team={standing.team as TeamInfo} size="sm" />
                            <div>
                              <span className="text-white font-medium">{standing.team.name}</span>
                              {gap !== null && (
                                <span className="text-xs text-zinc-600 font-mono ml-2">-{gap} pts</span>
                              )}
                              {rows.length > 0 && (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setModal({
                                         title: `${t(locale, "public.leagueStandingsTable.progressionTitlePrefix")} - ${standing.team?.name ?? t(locale, "public.leagueStandingsTable.teamFallback")}`,
                                         rows,
                                       })
                                     }
                                    className="mt-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                                  >
                                     {t(locale, "public.leagueStandingsTable.seasonDetails")}
                                   </button>
                                 </div>
                               )}
                             </div>
                           </>
                         ) : (
                          <span className="text-zinc-500 italic">{t(locale, "public.leagueStandingsTable.teamRemoved")}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {standing.wins > 0 ? (
                        <span className="text-yellow-400 font-mono font-semibold">{standing.wins}</span>
                      ) : (
                        <span className="text-zinc-700">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {standing.podiums > 0 ? (
                        <span className="text-zinc-300 font-mono">{standing.podiums}</span>
                      ) : (
                        <span className="text-zinc-700">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-white font-bold font-mono text-base">{standing.totalPoints}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {modal && <ProgressionModal locale={locale} modal={modal} onClose={() => setModal(null)} />}
    </>
  );
}

function ProgressionModal({
  locale,
  modal,
  onClose,
}: {
  locale: AppLocale;
  modal: { title: string; rows: RaceRow[] };
  onClose: () => void;
}) {
  const totalFromRows = modal.rows.reduce((acc, row) => acc + row.total, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
        <div className="relative border-b border-zinc-800 p-6">
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono">
                {t(locale, "public.leagueStandingsTable.seasonProgression")}
              </p>
              <h3 className="text-white text-xl font-semibold mt-1">{modal.title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X size={18} className="text-zinc-400" />
            </button>
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            <Badge size="md" className="font-mono">
              {t(locale, "public.leagueStandingsTable.racesWithPoints")}: {modal.rows.length}
            </Badge>
            <Badge size="md" variant="accent" className="font-mono">
              {t(locale, "public.leagueStandingsTable.totalInDetails")}: {totalFromRows} pts
            </Badge>
          </div>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-3">
          {modal.rows.map((row) => {
            const isPodium =
              typeof row.position === "number" && row.position > 0 && row.position <= 3;
            const medalTone =
              row.position === 1
                    ? {
                        card: "border-yellow-400/55 bg-yellow-500/10 ring-1 ring-yellow-500/20",
                        title: "text-zinc-100",
                        badge: "bg-zinc-900 text-zinc-200 border-zinc-600",
                        label: t(locale, "public.leagueStandingsTable.goldLabel"),
                      }
                : row.position === 2
                  ? {
                      card: "border-slate-300/55 bg-slate-300/10 ring-1 ring-slate-300/20",
                      title: "text-zinc-100",
                      badge: "bg-zinc-900 text-zinc-200 border-zinc-600",
                      label: t(locale, "public.leagueStandingsTable.silverLabel"),
                    }
                  : row.position === 3
                    ? {
                        card: "border-amber-500/55 bg-amber-600/10 ring-1 ring-amber-500/20",
                        title: "text-zinc-100",
                        badge: "bg-zinc-900 text-zinc-200 border-zinc-600",
                        label: t(locale, "public.leagueStandingsTable.bronzeLabel"),
                      }
                    : {
                        card: "",
                        title: "text-zinc-100",
                        badge: "bg-zinc-900 text-zinc-300 border-zinc-700",
                        label: "",
                      };

            return (
              <div
                key={`${modal.title}-${row.raceId}`}
                className={`group rounded-xl border p-4 transition-colors ${
                  isPodium
                    ? medalTone.card
                    : "border-zinc-800 bg-zinc-950/40 hover:border-cyan-500/30 hover:bg-zinc-900/80"
                }`}
              >
                {isPodium && (
                  <div className="mb-2 text-[11px] font-mono uppercase tracking-wide text-zinc-400">
                    {t(locale, "public.leagueStandingsTable.podiumFinish")}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm font-semibold ${medalTone.title}`}>{row.label}</span>
                  <div className="flex items-center gap-2">
                    {isPodium && (
                      <Badge className={medalTone.badge}>
                        {medalTone.label}
                      </Badge>
                    )}
                    {typeof row.position === "number" && (
                      <Badge>
                        P{row.position}
                      </Badge>
                    )}
                    <Badge className={medalTone.badge}>
                      {row.total} pts
                    </Badge>
                  </div>
                </div>
                {row.detail && (
                  <div className="mt-2 text-xs font-mono text-zinc-500 leading-relaxed">{row.detail}</div>
                )}
                {row.contributors && row.contributors.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {row.contributors.map((contributor) => (
                      <Badge
                        key={`${row.raceId}-${contributor.name}`}
                        className="gap-1.5 py-1 text-zinc-300"
                      >
                        {contributor.uuid ? (
                          <img
                            src={`https://mc-heads.net/avatar/${contributor.uuid}/20`}
                            alt={contributor.name}
                            width={16}
                            height={16}
                            className="w-4 h-4 rounded"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded bg-zinc-700" />
                        )}
                        <span className="text-xs font-medium">{contributor.name}</span>
                        <Badge className="text-[11px]">
                          {contributor.points} pts
                        </Badge>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
