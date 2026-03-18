"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Users, Minus, X, RefreshCw } from "lucide-react";
import { recalculateStandings } from "@/lib/leagues/importActions";

interface TeamInfo {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  logoScale?: number | null;
  logoPosX?: number | null;
  logoPosY?: number | null;
}

interface Standing {
  id: string;
  position: number;
  totalPoints: number;
  wins: number;
  podiums: number;
  racePoints?: Record<string, Record<string, number>>;
  driver?: { id: string; uuid: string; currentName: string | null } | null;
  team?: TeamInfo | null;
}

type RaceBreakdownRow = {
  raceId: string;
  label: string;
  total: number;
  detail: string;
  position?: number;
  contributors?: Array<{ name: string; uuid: string | null; points: number }>;
};

type ProgressionModalState = {
  title: string;
  position: number;
  rows: RaceBreakdownRow[];
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

function buildRaceBreakdownRows(
  racePoints: Record<string, Record<string, number>> | undefined,
  raceLabels: Record<string, string>,
  racePositionsByRaceId?: Record<string, number>,
): RaceBreakdownRow[] {
  if (!racePoints) return [];

  const rows: RaceBreakdownRow[] = [];

  for (const [raceId, raceData] of Object.entries(racePoints)) {
    const hasSlotData =
      typeof raceData.D1 === "number" ||
      typeof raceData.D2 === "number" ||
      typeof raceData.D3 === "number";

    if (hasSlotData) {
      const d1 = raceData.D1 ?? 0;
      const d2 = raceData.D2 ?? 0;
      const d3 = raceData.D3 ?? 0;
      const total = raceData.total ?? d1 + d2 + d3;
      rows.push({
        raceId,
        label: raceLabels[raceId] || raceId.slice(-6),
        total,
        detail: `D1 ${d1} • D2 ${d2} • D3 ${d3}`,
        position: racePositionsByRaceId?.[raceId],
      });
      continue;
    }

    const roundEntries = Object.entries(raceData).filter(
      ([, value]) => typeof value === "number",
    );
    const total = roundEntries.reduce((acc, [, value]) => acc + value, 0);
    const detail = roundEntries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([roundName]) => roundName)
      .join(" • ");

    rows.push({
      raceId,
      label: raceLabels[raceId] || raceId.slice(-6),
      total,
      detail,
      position: racePositionsByRaceId?.[raceId],
    });
  }

  return rows.sort((a, b) => compareRaceLabels(a.label, b.label));
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

interface StandingsClientProps {
  seasonId: string;
  driverStandings: Standing[];
  teamStandings: Standing[];
  driverTeamMap: Record<string, TeamInfo>;
  raceLabels: Record<string, string>;
  driverRacePositions: Record<string, Record<string, number>>;
  teamRaceContributors: Record<
    string,
    Record<string, Array<{ name: string; uuid: string | null; points: number }>>
  >;
}

function resolveAvatarSeed(uuid: string | null | undefined, name: string | null | undefined): string {
  const uuidValue = uuid?.trim() ?? "";
  const nameValue = name?.trim() ?? "";
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidPattern.test(uuidValue)) return uuidValue;
  if (nameValue) return nameValue;
  if (uuidValue) return uuidValue;
  return "Steve";
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
        <Trophy size={28} className="text-zinc-600" />
      </div>
      <div>
        <p className="text-zinc-400 font-semibold">Nenhum resultado ainda</p>
        <p className="text-zinc-600 text-sm mt-1">
          Importe resultados de uma corrida para ver o campeonato de {label}.
        </p>
      </div>
    </div>
  );
}

function ProgressionModal({
  state,
  onClose,
}: {
  state: ProgressionModalState | null;
  onClose: () => void;
}) {
  if (!state) return null;

  const totalFromRows = state.rows.reduce((acc, row) => acc + row.total, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
        <div className="relative border-b border-zinc-800 p-6">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-transparent to-yellow-500/10" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono">
                Progressão da temporada
              </p>
              <h3 className="text-white text-xl font-semibold mt-1">{state.title}</h3>
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
            <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              Posição atual: P{state.position}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
              Corridas com pontuação: {state.rows.length}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">
              Total no detalhe: {totalFromRows} pts
            </span>
          </div>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-3">
          {state.rows.map((race) => {
            const isPodium =
              typeof race.position === "number" && race.position > 0 && race.position <= 3;
            const medalTone =
              race.position === 1
                ? {
                    card: "border-yellow-500/45 bg-gradient-to-r from-yellow-500/14 to-zinc-950/50",
                    title: "text-yellow-200",
                    badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
                    label: "Ouro",
                  }
                : race.position === 2
                  ? {
                      card: "border-slate-300/40 bg-gradient-to-r from-slate-300/12 to-zinc-950/50",
                      title: "text-slate-200",
                      badge: "bg-slate-300/15 text-slate-200 border-slate-300/30",
                      label: "Prata",
                    }
                  : race.position === 3
                    ? {
                        card: "border-amber-700/50 bg-gradient-to-r from-amber-700/15 to-zinc-950/50",
                        title: "text-amber-300",
                        badge: "bg-amber-700/20 text-amber-300 border-amber-700/35",
                        label: "Bronze",
                      }
                    : {
                        card: "",
                        title: "text-cyan-300",
                        badge: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
                        label: "",
                      };

            return (
              <div
                key={`${state.title}-${race.raceId}`}
                className={`group rounded-xl border p-4 transition-colors ${
                  isPodium
                    ? medalTone.card
                    : "border-zinc-800 bg-zinc-950/40 hover:border-cyan-500/30 hover:bg-zinc-900/80"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className={`font-semibold text-sm ${medalTone.title}`}>
                    {race.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {isPodium && (
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono border ${medalTone.badge}`}>
                        {medalTone.label}
                      </span>
                    )}
                    {typeof race.position === "number" && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                        P{race.position}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono border ${medalTone.badge}`}>
                      {race.total} pts
                    </span>
                  </div>
                </div>
                {race.detail && (
                  <div className="mt-2 text-xs font-mono text-zinc-500 leading-relaxed">
                    {race.detail}
                  </div>
                )}
                {race.contributors && race.contributors.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {race.contributors.map((contributor) => (
                      <div
                        key={`${race.raceId}-${contributor.name}-${contributor.uuid ?? "no-uuid"}`}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700"
                      >
                        {contributor.uuid ? (
                          <img
                            src={`https://mc-heads.net/avatar/${resolveAvatarSeed(contributor.uuid, contributor.name)}/20`}
                            alt={contributor.name}
                            width={16}
                            height={16}
                            className="w-4 h-4 rounded"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded bg-zinc-700" />
                        )}
                        <span className="text-[11px] font-mono text-zinc-300">{contributor.name}</span>
                        <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded">
                          {contributor.points} pts
                        </span>
                      </div>
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

function DriverTable({ standings, driverTeamMap, raceLabels, driverRacePositions, onOpenDetails }: { standings: Standing[]; driverTeamMap: Record<string, TeamInfo>; raceLabels: Record<string, string>; driverRacePositions: Record<string, Record<string, number>>; onOpenDetails: (title: string, position: number, rows: RaceBreakdownRow[]) => void; }) {

  if (standings.length === 0) return <EmptyState label="pilotos" />;

  const leader = standings[0];

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-sm text-left">
        <thead className="text-xs text-zinc-400 bg-zinc-950/40 uppercase font-mono border-b border-zinc-800">
          <tr>
            <th className="px-6 py-4 font-medium w-16">Pos</th>
            <th className="px-4 py-4 font-medium w-[52%]">Piloto</th>
            <th className="px-4 py-4 font-medium text-center w-[120px]">Vitórias</th>
            <th className="px-4 py-4 font-medium text-center w-[120px]">Pódios</th>
            <th className="px-6 py-4 font-medium text-right w-[140px]">Pontos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {standings.map((s, idx) => {
            const gap = idx === 0 ? null : leader.totalPoints - s.totalPoints;
            const team = s.driver ? driverTeamMap[s.driver.id] : undefined;
            const raceRows = buildRaceBreakdownRows(
              s.racePoints,
              raceLabels,
              s.driver ? driverRacePositions[s.driver.id] : undefined,
            );
            return (
              <tr key={s.id} className="h-[72px] transition-colors hover:bg-zinc-800/20">
                <td className="px-6 py-3 align-middle">
                  <PositionBadge position={s.position} />
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center gap-3">
                    {s.driver ? (
                      <img
                        src={`https://mc-heads.net/avatar/${resolveAvatarSeed(s.driver.uuid, s.driver.currentName)}/32`}
                        alt={s.driver.currentName ?? s.driver.uuid}
                        width={28}
                        height={28}
                        className="w-7 h-7 rounded-md shrink-0 bg-zinc-800"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-md bg-zinc-800 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium truncate max-w-[220px] block">
                          {s.driver?.currentName ?? (
                            <span className="text-zinc-500 italic">Piloto removido</span>
                          )}
                        </span>
                        {gap !== null && (
                          <span className="text-xs text-zinc-600 font-mono">
                            -{gap} pts
                          </span>
                        )}
                      </div>
                      {team ? (
                        <div className="flex items-center gap-1.5 mt-0.5 min-h-[16px]">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: team.color ?? "#3f3f46" }}
                          />
                          <span className="text-xs text-zinc-500 truncate max-w-[220px]">
                            {team.name}
                          </span>
                        </div>
                      ) : (
                        <div className="min-h-[16px] mt-0.5">
                          <span className="text-xs text-zinc-600">Sem equipe</span>
                        </div>
                      )}
                      {raceRows.length > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenDetails(
                                `Progressão — ${s.driver?.currentName ?? "Piloto"}`,
                                s.position,
                                raceRows,
                              )
                            }
                            className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                          >
                            Detalhes da temporada
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center align-middle">
                  {s.wins > 0 ? (
                    <span className="text-yellow-400 font-mono font-semibold">{s.wins}</span>
                  ) : (
                    <Minus size={14} className="mx-auto text-zinc-700" />
                  )}
                </td>
                <td className="px-4 py-3 text-center align-middle">
                  {s.podiums > 0 ? (
                    <span className="text-zinc-300 font-mono">{s.podiums}</span>
                  ) : (
                    <Minus size={14} className="mx-auto text-zinc-700" />
                  )}
                </td>
                <td className="px-6 py-3 text-right align-middle">
                  <span className="text-white font-bold font-mono text-base">
                    {s.totalPoints}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamTable({ standings, raceLabels, teamRaceContributors, onOpenDetails }: { standings: Standing[]; raceLabels: Record<string, string>; teamRaceContributors: Record<string, Record<string, Array<{ name: string; uuid: string | null; points: number }>>>; onOpenDetails: (title: string, position: number, rows: RaceBreakdownRow[]) => void; }) {

  if (standings.length === 0) return <EmptyState label="equipes" />;

  const leader = standings[0];

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-sm text-left">
        <thead className="text-xs text-zinc-400 bg-zinc-950/40 uppercase font-mono border-b border-zinc-800">
          <tr>
            <th className="px-6 py-4 font-medium w-16">Pos</th>
            <th className="px-4 py-4 font-medium w-[52%]">Equipe</th>
            <th className="px-4 py-4 font-medium text-center w-[120px]">Vitórias</th>
            <th className="px-4 py-4 font-medium text-center w-[120px]">Pódios</th>
            <th className="px-6 py-4 font-medium text-right w-[140px]">Pontos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {standings.map((s, idx) => {
            const gap = idx === 0 ? null : leader.totalPoints - s.totalPoints;
            const raceRows = buildRaceBreakdownRows(s.racePoints, raceLabels);
            const contributorsByRace = s.team
              ? teamRaceContributors[s.team.id] ?? {}
              : {};
            const raceRowsForModal = raceRows
              .map((row) => ({
                ...row,
                contributors: contributorsByRace[row.raceId] ?? [],
              }))
              .filter(
                (row) => !(row.total === 0 && (row.contributors?.length ?? 0) === 0),
              );

            return (
              <tr key={s.id} className="h-[72px] transition-colors hover:bg-zinc-800/20">
                <td className="px-6 py-3 align-middle">
                  <PositionBadge position={s.position} />
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center gap-3">
                    {s.team ? (
                      <TeamLogo team={s.team} size="sm" />
                    ) : (
                      <div className="w-7 h-7 rounded-md shrink-0 bg-zinc-800 border border-white/10" />
                    )}
                    <div className="min-w-0">
                      <span className="text-white font-medium truncate max-w-[220px] block">
                        {s.team?.name ?? (
                          <span className="text-zinc-500 italic">Equipe removida</span>
                        )}
                      </span>
                      {raceRowsForModal.length > 0 && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-zinc-500 font-mono">
                            {raceRowsForModal.length} corrida(s) com pontuação registrada
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenDetails(
                                `Progressão — ${s.team?.name ?? "Equipe"}`,
                                s.position,
                                raceRowsForModal,
                              )
                            }
                            className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                          >
                            Ver detalhes
                          </button>
                        </div>
                      )}
                      {gap !== null && (
                        <span className="ml-2 text-xs text-zinc-600 font-mono">
                          -{gap} pts
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center align-middle">
                  {s.wins > 0 ? (
                    <span className="text-yellow-400 font-mono font-semibold">{s.wins}</span>
                  ) : (
                    <Minus size={14} className="mx-auto text-zinc-700" />
                  )}
                </td>
                <td className="px-4 py-3 text-center align-middle">
                  {s.podiums > 0 ? (
                    <span className="text-zinc-300 font-mono">{s.podiums}</span>
                  ) : (
                    <Minus size={14} className="mx-auto text-zinc-700" />
                  )}
                </td>
                <td className="px-6 py-3 text-right align-middle">
                  <span className="text-white font-bold font-mono text-base">
                    {s.totalPoints}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StandingsClient({
  seasonId,
  driverStandings,
  teamStandings,
  driverTeamMap,
  raceLabels,
  driverRacePositions,
  teamRaceContributors,
}: StandingsClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"drivers" | "teams">("drivers");
  const [progressionModal, setProgressionModal] = useState<ProgressionModalState | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessStatus, setReprocessStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleReprocessSeason(): Promise<void> {
    if (reprocessing) return;

    setReprocessing(true);
    setReprocessStatus(null);
    const result = await recalculateStandings(seasonId);

    if (!result.success) {
      setReprocessStatus({
        type: "error",
        message: result.error ?? "Erro ao reprocessar classificação",
      });
      setReprocessing(false);
      return;
    }

    const durationLabel =
      typeof result.durationMs === "number"
        ? ` em ${(result.durationMs / 1000).toFixed(2)}s`
        : "";

    setReprocessStatus({
      type: "success",
      message: `Classificação reprocessada com sucesso${durationLabel}.`,
    });
    router.refresh();
    setReprocessing(false);
  }

  const driverLeader = driverStandings[0];
  const teamLeader = teamStandings[0];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Driver leader */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-yellow-500/20 flex items-center gap-4 relative overflow-hidden">
          {driverLeader?.driver ? (
            <img
              src={`https://mc-heads.net/avatar/${resolveAvatarSeed(driverLeader.driver.uuid, driverLeader.driver.currentName)}/48`}
              alt={driverLeader.driver.currentName ?? driverLeader.driver.uuid}
              width={48}
              height={48}
              className="w-12 h-12 rounded-full shrink-0 bg-zinc-800 border border-yellow-500/30"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-yellow-500/15 flex items-center justify-center shrink-0 border border-yellow-500/30">
              <Trophy size={22} className="text-yellow-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
              Líder — Pilotos
            </p>
            <p className="text-lg font-bold text-white font-mono truncate">
              {driverLeader?.driver?.currentName ?? "Sem dados"}
            </p>
            <p className="text-sm text-yellow-400 font-mono font-semibold">
              {driverLeader?.totalPoints ?? 0} pts
            </p>
          </div>
          <div className="absolute -right-4 -bottom-4 text-yellow-500/5">
            <Trophy size={100} />
          </div>
        </div>

        {/* Team leader */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-cyan-500/20 flex items-center gap-4 relative overflow-hidden">
          {teamLeader?.team ? (
            <TeamLogo team={teamLeader.team} size="lg" />
          ) : (
            <div className="w-12 h-12 rounded-full shrink-0 bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Users size={22} className="text-cyan-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
              Líder — Equipes
            </p>
            <p className="text-lg font-bold text-white font-mono truncate">
              {teamLeader?.team?.name ?? "Sem dados"}
            </p>
            <p className="text-sm text-cyan-400 font-mono font-semibold">
              {teamLeader?.totalPoints ?? 0} pts
            </p>
          </div>
          <div className="absolute -right-4 -bottom-4 text-cyan-500/5">
            <Users size={100} />
          </div>
        </div>
      </div>

      {/* Tab + table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {/* Tab header */}
        <div className="flex items-center justify-between gap-3 p-2 border-b border-zinc-800 bg-zinc-950/30">
          <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("drivers")}
            className={`flex items-center justify-between min-w-[140px] gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              tab === "drivers"
                ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            <span className="flex items-center gap-2">
              <Trophy size={15} />
              Pilotos
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-500">
              {driverStandings.length}
            </span>
          </button>
          <button
            onClick={() => setTab("teams")}
            className={`flex items-center justify-between min-w-[140px] gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              tab === "teams"
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            <span className="flex items-center gap-2">
              <Users size={15} />
              Equipes
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-500">
              {teamStandings.length}
            </span>
          </button>
          </div>

          <button
            type="button"
            onClick={handleReprocessSeason}
            disabled={reprocessing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/30 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/15 disabled:opacity-60 disabled:cursor-not-allowed text-xs font-mono"
          >
            <RefreshCw size={14} className={reprocessing ? "animate-spin" : ""} />
            {reprocessing ? "Reprocessando..." : "Reprocessar classificação"}
          </button>
        </div>

        {reprocessStatus && (
          <div
            className={`px-4 py-2 text-xs font-mono border-b ${
              reprocessStatus.type === "success"
                ? "text-green-300 bg-green-500/10 border-green-500/20"
                : "text-red-300 bg-red-500/10 border-red-500/20"
            }`}
          >
            {reprocessStatus.message}
          </div>
        )}

        <div className="min-h-[420px]">
          {tab === "drivers" ? (
            <DriverTable
              standings={driverStandings}
              driverTeamMap={driverTeamMap}
              raceLabels={raceLabels}
              driverRacePositions={driverRacePositions}
              onOpenDetails={(title, position, rows) =>
                setProgressionModal({ title, position, rows })
              }
            />
          ) : (
            <TeamTable
              standings={teamStandings}
              raceLabels={raceLabels}
              teamRaceContributors={teamRaceContributors}
              onOpenDetails={(title, position, rows) =>
                setProgressionModal({ title, position, rows })
              }
            />
          )}
        </div>
      </div>
      <ProgressionModal
        state={progressionModal}
        onClose={() => setProgressionModal(null)}
      />
    </div>
  );
}
