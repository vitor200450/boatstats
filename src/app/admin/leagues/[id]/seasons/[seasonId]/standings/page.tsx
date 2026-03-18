import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { F1_STANDARD_POINTS, PointsSystem } from "@/lib/leagues/pointsSystem";
import { getSeasonSprintConfig } from "@/lib/leagues/roundRules";
import { getTeamScoringConfig } from "@/lib/leagues/teamScoringConfig";
import { calculateTeamRaceContributorsByMode } from "@/lib/leagues/teamScoringStrategies";
import { fillMissingSlotRosters } from "@/lib/leagues/slotRosterUtils";
import { prisma } from "@/lib/prisma";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { StandingsClient } from "./StandingsClient";

type StandingRow = {
  id: string;
  type: "DRIVER" | "TEAM";
  position: number;
  totalPoints: number;
  wins: number;
  podiums: number;
  racePoints: Record<string, Record<string, number>>;
  driver?: { id: string; uuid: string; currentName: string | null } | null;
  team?: {
    id: string;
    name: string;
    color: string | null;
    logoUrl: string | null;
    logoScale: number | null;
    logoPosX: number | null;
    logoPosY: number | null;
  } | null;
};

interface StandingsPageProps {
  params: Promise<{
    id: string;
    seasonId: string;
  }>;
}

export default async function StandingsPage({ params }: StandingsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

  const { id, seasonId } = await params;

  const season = await prisma.season.findFirst({
    where:
      session.user.role === "SUPER_ADMIN"
        ? { id: seasonId, leagueId: id }
        : {
            id: seasonId,
            leagueId: id,
            league: {
              OR: [
                { ownerId: session.user.id },
                { admins: { some: { userId: session.user.id } } },
              ],
            },
          },
    select: {
      id: true,
      name: true,
      pointsSystem: true,
      sprintConfig: true,
      league: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!season) {
    notFound();
  }

  const [allStandings, teamAssignments, allAssignments, races, roundResults, depthChartEntries, slotRosterEntries] = await prisma.$transaction([
    prisma.standing.findMany({
      where: { seasonId },
      orderBy: [{ type: "asc" }, { position: "asc" }],
      select: {
        id: true,
        type: true,
        position: true,
        totalPoints: true,
        wins: true,
        podiums: true,
        racePoints: true,
        driver: {
          select: {
            id: true,
            uuid: true,
            currentName: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            color: true,
            logoUrl: true,
            logoScale: true,
            logoPosX: true,
            logoPosY: true,
          },
        },
      },
    }),
    prisma.seasonTeamAssignment.findMany({
      where: { seasonId, leftAt: null, teamId: { not: null } },
      select: {
        driverId: true,
        team: {
          select: {
            id: true,
            name: true,
            color: true,
            logoUrl: true,
            logoScale: true,
            logoPosX: true,
            logoPosY: true,
          },
        },
      },
    }),
    prisma.seasonTeamAssignment.findMany({
      where: { seasonId, teamId: { not: null } },
      select: {
        teamId: true,
        driverId: true,
        joinedAt: true,
        leftAt: true,
        effectiveFromRound: true,
        effectiveToRound: true,
        driver: {
          select: {
            uuid: true,
            currentName: true,
          },
        },
      },
    }),
    prisma.race.findMany({
      where: { seasonId },
      select: {
        id: true,
        round: true,
        name: true,
        createdAt: true,
        scheduledDate: true,
      },
      orderBy: { round: "asc" },
    }),
    prisma.roundResult.findMany({
      where: {
        disqualified: false,
        eventRound: {
          countsForStandings: true,
          race: { seasonId },
        },
      },
      select: {
        driverId: true,
        position: true,
        points: true,
        driver: {
          select: {
            uuid: true,
            currentName: true,
          },
        },
        eventRound: {
          select: {
            raceId: true,
          },
        },
      },
    }),
    prisma.$queryRaw`
      SELECT "seasonId", "teamId", "driverId", "priority"
      FROM "SeasonTeamDepthChartEntry"
      WHERE "seasonId" = ${seasonId}
      ORDER BY "teamId" ASC, "priority" ASC
    `,
    prisma.$queryRaw`
      SELECT r."seasonId", r."raceId", r."teamId", i."driverId", i."role", i."priority"
      FROM "SeasonRaceTeamRoster" r
      INNER JOIN "SeasonRaceTeamRosterItem" i ON i."rosterId" = r."id"
      WHERE r."seasonId" = ${seasonId}
      ORDER BY r."raceId" ASC, r."teamId" ASC, i."role" ASC, i."priority" ASC
    `,
  ]);

  const league = season.league;

  const normalizedStandings = allStandings as unknown as StandingRow[];
  const driverStandings = normalizedStandings.filter((s) => s.type === "DRIVER");
  const teamStandings = normalizedStandings.filter((s) => s.type === "TEAM");

  const teamMetaById = new Map<
    string,
    {
      id: string;
      name: string;
      color: string | null;
      logoUrl: string | null;
      logoScale: number;
      logoPosX: number;
      logoPosY: number;
    }
  >();
  for (const standing of teamStandings) {
    if (!standing.team) continue;
    teamMetaById.set(standing.team.id, {
      id: standing.team.id,
      name: standing.team.name,
      color: standing.team.color,
      logoUrl: standing.team.logoUrl,
      logoScale: standing.team.logoScale ?? 100,
      logoPosX: standing.team.logoPosX ?? 50,
      logoPosY: standing.team.logoPosY ?? 50,
    });
  }

  // Build driverId → active team map from season assignments
  const driverTeamMap: Record<string, { id: string; name: string; color: string | null; logoUrl: string | null; logoScale: number; logoPosX: number; logoPosY: number }> = {};
  for (const assignment of teamAssignments) {
    if (!assignment.team) continue;
    const resolvedTeam = {
      id: assignment.team.id,
      name: assignment.team.name,
      color: assignment.team.color,
      logoUrl: assignment.team.logoUrl,
      logoScale: assignment.team.logoScale ?? 100,
      logoPosX: assignment.team.logoPosX ?? 50,
      logoPosY: assignment.team.logoPosY ?? 50,
    };
    driverTeamMap[assignment.driverId] = resolvedTeam;
    if (!teamMetaById.has(assignment.team.id)) {
      teamMetaById.set(assignment.team.id, resolvedTeam);
    }
  }

  if (Object.keys(driverTeamMap).length === 0) {
    const raceRoundById = new Map(races.map((race) => [race.id, race.round] as const));
    const sortedRosterEntries = [...(slotRosterEntries as Array<{
      seasonId: string;
      raceId: string;
      teamId: string;
      driverId: string;
      role: "MAIN" | "RESERVE";
      priority: number;
    }>)].sort((a, b) => {
      const roundA = raceRoundById.get(a.raceId) ?? 0;
      const roundB = raceRoundById.get(b.raceId) ?? 0;
      if (roundA !== roundB) return roundB - roundA;
      if (a.role !== b.role) return a.role === "MAIN" ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.driverId.localeCompare(b.driverId);
    });

    for (const entry of sortedRosterEntries) {
      if (driverTeamMap[entry.driverId]) continue;
      const teamMeta = teamMetaById.get(entry.teamId);
      if (!teamMeta) continue;
      driverTeamMap[entry.driverId] = teamMeta;
    }
  }

  const raceLabels: Record<string, string> = {};
  for (const race of races) {
    raceLabels[race.id] = `R${race.round} - ${race.name}`;
  }

  const raceDriverStatsByRaceId: Record<
    string,
    Record<string, { points: number; bestPosition: number }>
  > = {};
  for (const row of roundResults) {
    const raceId = row.eventRound.raceId;
    const byDriver = raceDriverStatsByRaceId[raceId] ?? {};
    const current = byDriver[row.driverId];

    byDriver[row.driverId] = current
      ? {
          points: current.points + row.points,
          bestPosition: Math.min(current.bestPosition, row.position),
        }
      : {
          points: row.points,
          bestPosition: row.position,
        };

    raceDriverStatsByRaceId[raceId] = byDriver;
  }

  const driverRacePositions: Record<string, Record<string, number>> = {};
  const driverPointsByRaceId: Record<string, Record<string, number>> = {};
  for (const [raceId, byDriver] of Object.entries(raceDriverStatsByRaceId)) {
    const pointsByDriver: Record<string, number> = {};

    for (const [driverId, stats] of Object.entries(byDriver)) {
      pointsByDriver[driverId] = stats.points;

      const currentByRace = driverRacePositions[driverId] ?? {};
      currentByRace[raceId] = stats.bestPosition;
      driverRacePositions[driverId] = currentByRace;
    }

    driverPointsByRaceId[raceId] = pointsByDriver;
  }

  const seasonPointsSystem =
    (season.pointsSystem as unknown as PointsSystem | null) ?? F1_STANDARD_POINTS;
  const teamConfig = getTeamScoringConfig(seasonPointsSystem);
  const seasonSprintConfig = getSeasonSprintConfig(season.sprintConfig);

  const driverMetaById = new Map<string, { name: string; uuid: string | null }>();
  for (const standing of driverStandings) {
    if (!standing.driver) continue;
    driverMetaById.set(standing.driver.id, {
      name: standing.driver.currentName ?? standing.driver.uuid,
      uuid: standing.driver.uuid,
    });
  }

  for (const row of roundResults) {
    if (driverMetaById.has(row.driverId)) continue;
    driverMetaById.set(row.driverId, {
      name: row.driver?.currentName ?? row.driver?.uuid ?? row.driverId,
      uuid: row.driver?.uuid ?? null,
    });
  }

  for (const assignment of allAssignments) {
    if (!driverMetaById.has(assignment.driverId)) {
      driverMetaById.set(assignment.driverId, {
        name: assignment.driver.currentName ?? assignment.driverId,
        uuid: assignment.driver.uuid,
      });
    }
  }

  const normalizedDepthChartEntries = depthChartEntries as Array<{
    seasonId: string;
    teamId: string;
    driverId: string;
    priority: number;
  }>;
  const normalizedSlotRosterEntries = slotRosterEntries as Array<{
    seasonId: string;
    raceId: string;
    teamId: string;
    driverId: string;
    role: "MAIN" | "RESERVE";
    priority: number;
  }>;
  const teamAssignmentsForScoring = allAssignments.flatMap((assignment) =>
    assignment.teamId
      ? [
          {
            teamId: assignment.teamId,
            driverId: assignment.driverId,
            joinedAt: assignment.joinedAt,
            leftAt: assignment.leftAt,
            effectiveFromRound: assignment.effectiveFromRound,
            effectiveToRound: assignment.effectiveToRound,
          },
        ]
      : [],
  );

  // Fill missing slot rosters by inheriting from previous races
  const filledSlotRosterEntries =
    teamConfig.mode === "SLOT_MULLIGAN"
      ? fillMissingSlotRosters(
          races,
          normalizedSlotRosterEntries,
          teamAssignmentsForScoring,
        )
      : normalizedSlotRosterEntries;

  const racesForContributors = races.map((race) => {
    const byDriver = raceDriverStatsByRaceId[race.id] ?? {};

    return {
      ...race,
      eventRounds: [
        {
          apiRoundName: "TOTAL",
          apiRoundType: "RACE",
          countsForStandings: true,
          results: Object.entries(byDriver).map(([driverId, stats]) => ({
            driverId,
            position: stats.bestPosition,
            points: stats.points,
            disqualified: false,
          })),
        },
      ],
    };
  });

  const contributorsByMode = calculateTeamRaceContributorsByMode({
    mode: teamConfig.mode,
    races: racesForContributors,
    teamAssignments: teamAssignmentsForScoring,
    depthChartEntries: normalizedDepthChartEntries,
    slotRosterEntries: filledSlotRosterEntries,
    teamSlotMulliganCount: teamConfig.teamSlotMulliganCount,
    seasonSprintConfig,
  });

  const teamRaceContributors: Record<
    string,
    Record<string, Array<{ name: string; uuid: string | null; points: number }>>
  > = {};
  for (const [teamId, byRace] of contributorsByMode.entries()) {
    const raceMap: Record<
      string,
      Array<{ name: string; uuid: string | null; points: number }>
    > = {};
    for (const [raceId, driverIds] of Object.entries(byRace)) {
      const contributors = driverIds
        .map((driverId) => {
          const meta = driverMetaById.get(driverId) ?? {
            name: driverId,
            uuid: null,
          };
          return {
            ...meta,
            points: driverPointsByRaceId[raceId]?.[driverId] ?? 0,
          };
        });

      raceMap[raceId] =
        teamConfig.mode === "DEPTH_CHART"
          ? contributors
          : contributors.sort((a, b) => a.name.localeCompare(b.name));
    }
    teamRaceContributors[teamId] = raceMap;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
        <Link
          href={`/admin/leagues/${id}/seasons/${seasonId}`}
          className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors group"
        >
          <ArrowLeft
            size={20}
            className="text-zinc-400 group-hover:text-white transition-colors"
          />
        </Link>

        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
            <Link
              href={`/admin/leagues/${id}`}
              className="hover:text-cyan-400 transition-colors"
            >
              {league.name}
            </Link>
            <ChevronRight size={14} />
            <Link
              href={`/admin/leagues/${id}/seasons/${seasonId}`}
              className="hover:text-cyan-400 transition-colors"
            >
              {season.name}
            </Link>
            <ChevronRight size={14} />
            <span className="text-zinc-300">Classificação</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight font-mono">
            Classificação
          </h1>
        </div>
      </div>

      <StandingsClient
        seasonId={seasonId}
        driverStandings={driverStandings}
        teamStandings={teamStandings}
        driverTeamMap={driverTeamMap}
        raceLabels={raceLabels}
        driverRacePositions={driverRacePositions}
        teamRaceContributors={teamRaceContributors}
      />
    </div>
  );
}
