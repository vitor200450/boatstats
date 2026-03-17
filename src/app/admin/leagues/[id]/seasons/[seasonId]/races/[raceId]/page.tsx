import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  computeReverseGridPointsForRace,
  getSeasonReverseGridConfig,
} from "@/lib/leagues/reverseGrid";
import type { PointsSystem } from "@/lib/leagues/pointsSystem";
import {
  ArrowLeft,
  ChevronRight,
  Calendar,
  MapPin,
  FlagTriangleRight,
} from "lucide-react";

// We will import a Client Component for handling the "Import from FrostHex" interaction
import { RaceDetailsClient } from "./RaceDetailsClient";

interface RaceDetailsPageProps {
  params: Promise<{
    id: string; // League ID
    seasonId: string;
    raceId: string;
  }>;
}

type EventCacheHeatDriver = {
  uuid: string;
  name: string;
  position: number;
  finish_time: number;
};

type EventCacheHeat = {
  name: string;
  driver_results?: EventCacheHeatDriver[];
};

type EventCacheRound = {
  name: string;
  heats?: EventCacheHeat[];
};

type EventCacheData = {
  rounds?: EventCacheRound[];
};

export default async function RaceDetailsPage({
  params,
}: RaceDetailsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

  const { id, seasonId, raceId } = await params;

  const race = await prisma.race.findFirst({
    where:
      session.user.role === "SUPER_ADMIN"
        ? { id: raceId, seasonId, season: { leagueId: id } }
        : {
            id: raceId,
            seasonId,
            season: {
              leagueId: id,
              league: {
                OR: [
                  { ownerId: session.user.id },
                  { admins: { some: { userId: session.user.id } } },
                ],
              },
            },
          },
    select: {
      id: true,
      seasonId: true,
      name: true,
      round: true,
      trackApiName: true,
      scheduledDate: true,
      status: true,
      apiEventId: true,
      apiEventCache: true,
      season: {
        select: {
          id: true,
          name: true,
          status: true,
          pointsSystem: true,
          league: {
            select: {
              id: true,
              name: true,
              ownerId: true,
              admins: {
                select: { userId: true },
              },
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
          targetHeatName: true,
          status: true,
          countsForStandings: true,
          specialType: true,
          sprintMode: true,
          results: {
            orderBy: { position: "asc" },
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
                  id: true,
                  uuid: true,
                  currentName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!race) {
    notFound();
  }

  const league = race.season.league;

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const isOwner = league.ownerId === session.user.id;
  const isAdmin =
    isSuperAdmin ||
    isOwner ||
    league.admins.some((a: { userId: string }) => a.userId === session.user.id);

  // Compute players from event cache that aren't registered in the DB
  let unregisteredPlayers: { uuid: string; name: string }[] = [];
  const roundPreviewByName: Record<
    string,
    Array<{ uuid: string; name: string; position: number; finish_time: number }>
  > = {};
  if (isAdmin && race.season.status === "ACTIVE" && race.apiEventCache) {
    const eventData = race.apiEventCache as EventCacheData;

    for (const round of eventData.rounds ?? []) {
      const targetHeatName = race.eventRounds.find(
        (r) => r.apiRoundName === round.name,
      )?.targetHeatName;
      const heat = (round.heats ?? []).find((h) => h.name === targetHeatName);

      if (heat?.driver_results?.length) {
        roundPreviewByName[round.name] = heat.driver_results.map((dr) => ({
          uuid: dr.uuid,
          name: dr.name,
          position: dr.position,
          finish_time: dr.finish_time,
        }));
      }
    }

    const allDrivers = new Map<string, string>();
    for (const round of eventData.rounds ?? []) {
      for (const heat of round.heats ?? []) {
        for (const dr of heat.driver_results ?? []) {
          if (!allDrivers.has(dr.uuid)) allDrivers.set(dr.uuid, dr.name);
        }
      }
    }

    if (allDrivers.size > 0) {
      const existing = await prisma.driver.findMany({
        where: { uuid: { in: [...allDrivers.keys()] } },
        select: { uuid: true },
      });
      const existingSet = new Set(existing.map((d) => d.uuid));
      unregisteredPlayers = [...allDrivers.entries()]
        .filter(([uuid]) => !existingSet.has(uuid))
        .map(([uuid, name]) => ({ uuid, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  const teamScoringMode =
    ((race.season.pointsSystem as { rules?: { teamScoringMode?: string } } | null)
      ?.rules?.teamScoringMode as "STANDARD" | "DEPTH_CHART" | "SLOT_MULLIGAN" | undefined) ??
    "STANDARD";

  const seasonReverseGridEnabled = Boolean(
    (race.season.pointsSystem as { rules?: { reverseGridEnabled?: boolean } } | null)
      ?.rules?.reverseGridEnabled,
  );

  const reverseGridFlagRows = await prisma.$queryRaw<Array<{ reverseGridEnabled: boolean }>>`
    SELECT "reverseGridEnabled"
    FROM "Race"
    WHERE "id" = ${raceId}
    LIMIT 1
  `;
  const raceReverseGridEnabled = Boolean(reverseGridFlagRows[0]?.reverseGridEnabled);
  const seasonReverseGridConfig = getSeasonReverseGridConfig(
    race.season.pointsSystem as unknown as PointsSystem,
  );

  const reverseGridEnabledForRace =
    seasonReverseGridEnabled &&
    seasonReverseGridConfig.enabled &&
    raceReverseGridEnabled;

  const reverseGridPointsByDriverId = reverseGridEnabledForRace
    ? Object.fromEntries(
        computeReverseGridPointsForRace(
          {
            eventRounds: race.eventRounds.map((round) => ({
              apiRoundName: round.apiRoundName,
              apiRoundType: round.apiRoundType,
              results: round.results
                .filter((result) => result.driver?.id)
                .map((result) => ({
                  driverId: result.driver!.id,
                  position: result.position,
                  disqualified: result.disqualified,
                })),
            })),
          },
          seasonReverseGridConfig,
        ).entries(),
      )
    : {};

  const displayRoundForReverseGrid = reverseGridEnabledForRace
    ? race.eventRounds.find(
        (round) =>
          /RACE|FINAL/i.test(round.apiRoundType) ||
          /race|final/i.test(round.apiRoundName),
      ) ??
      [...race.eventRounds]
        .reverse()
        .find(
          (round) =>
            !/QUAL|CLASSIF/i.test(round.apiRoundType) &&
            !/qualy|quali|qualifying|classifica|\bQ\d+\b/i.test(
              round.apiRoundName.trim(),
            ),
        ) ??
      null
    : null;

  let slotRosterConfig:
    | {
        enabled: boolean;
        teams: Array<{
          teamId: string;
          teamName: string;
          drivers: Array<{ id: string; uuid: string; currentName: string | null }>;
          mainDriverIds: string[];
          reserveDriverIds: string[];
          lastRosterUpdatedAt: Date | null;
          lastRosterRound: number | null;
          lastRosterRaceName: string | null;
        }>;
      }
    | undefined;

  if (isAdmin && teamScoringMode === "SLOT_MULLIGAN") {
    let activeAssignments = await prisma.$queryRaw<
      Array<{
        teamId: string;
        teamName: string;
        driverId: string;
        driverUuid: string;
        driverName: string | null;
      }>
    >`
      WITH active_assignments AS (
        SELECT
          a."id",
          a."driverId",
          a."teamId",
          a."joinedAt"
        FROM "SeasonTeamAssignment" a
        WHERE a."seasonId" = ${seasonId}
          AND COALESCE(a."effectiveFromRound", 1) <= ${race.round}
          AND (a."effectiveToRound" IS NULL OR a."effectiveToRound" >= ${race.round})
      ),
      latest_assignments AS (
        SELECT
          aa."driverId",
          aa."teamId",
          ROW_NUMBER() OVER (
            PARTITION BY aa."driverId"
            ORDER BY aa."joinedAt" DESC, (aa."teamId" IS NULL) ASC, aa."id" DESC
          ) AS rn
        FROM active_assignments aa
      )
      SELECT
        la."teamId" AS "teamId",
        t."name" AS "teamName",
        d."id" AS "driverId",
        d."uuid" AS "driverUuid",
        d."currentName" AS "driverName"
      FROM latest_assignments la
      INNER JOIN "Team" t ON t."id" = la."teamId"
      INNER JOIN "Driver" d ON d."id" = la."driverId"
      WHERE la.rn = 1
        AND la."teamId" IS NOT NULL
      ORDER BY t."name" ASC, d."currentName" ASC
    `;

    if (activeAssignments.length === 0) {
      activeAssignments = await prisma.$queryRaw<
        Array<{
          teamId: string;
          teamName: string;
          driverId: string;
          driverUuid: string;
          driverName: string | null;
        }>
      >`
        WITH latest_non_null_assignments AS (
          SELECT
            a."id",
            a."driverId",
            a."teamId",
            a."effectiveFromRound",
            a."joinedAt",
            ROW_NUMBER() OVER (
              PARTITION BY a."driverId"
              ORDER BY a."effectiveFromRound" DESC, a."joinedAt" DESC, a."id" DESC
            ) AS rn
          FROM "SeasonTeamAssignment" a
          WHERE a."seasonId" = ${seasonId}
            AND a."teamId" IS NOT NULL
        )
        SELECT
          lna."teamId" AS "teamId",
          t."name" AS "teamName",
          d."id" AS "driverId",
          d."uuid" AS "driverUuid",
          d."currentName" AS "driverName"
        FROM latest_non_null_assignments lna
        INNER JOIN "Team" t ON t."id" = lna."teamId"
        INNER JOIN "Driver" d ON d."id" = lna."driverId"
        WHERE lna.rn = 1
        ORDER BY t."name" ASC, d."currentName" ASC
      `;
    }

    // Get roster for current race, then inherit missing teams from latest previous roster.
    const currentRaceRosterRows = await prisma.$queryRaw<
      Array<{ teamId: string; driverId: string; role: "MAIN" | "RESERVE"; priority: number }>
    >`
      SELECT r."teamId", i."driverId", i."role", i."priority"
      FROM "SeasonRaceTeamRoster" r
      INNER JOIN "SeasonRaceTeamRosterItem" i ON i."rosterId" = r."id"
      WHERE r."seasonId" = ${seasonId} AND r."raceId" = ${raceId}
    `;

    const inheritedRowsByTeam =
      race.round > 1
        ? await prisma.$queryRaw<
            Array<{ teamId: string; driverId: string; role: "MAIN" | "RESERVE"; priority: number }>
          >`
            WITH ranked_rosters AS (
              SELECT
                r."id" AS "rosterId",
                r."teamId" AS "teamId",
                ROW_NUMBER() OVER (
                  PARTITION BY r."teamId"
                  ORDER BY rr."round" DESC, r."updatedAt" DESC, r."id" DESC
                ) AS rn
              FROM "SeasonRaceTeamRoster" r
              INNER JOIN "Race" rr ON rr."id" = r."raceId"
              WHERE r."seasonId" = ${seasonId}
                AND rr."round" < ${race.round}
            )
            SELECT rr."teamId", i."driverId", i."role", i."priority"
            FROM ranked_rosters rr
            INNER JOIN "SeasonRaceTeamRosterItem" i ON i."rosterId" = rr."rosterId"
            WHERE rr.rn = 1
          `
        : [];

    const currentRosterTeamIds = new Set(currentRaceRosterRows.map((row) => row.teamId));
    const rosterRows = [
      ...currentRaceRosterRows,
      ...inheritedRowsByTeam.filter((row) => !currentRosterTeamIds.has(row.teamId)),
    ];

    const teamsMap = new Map<
      string,
      {
        teamId: string;
        teamName: string;
        drivers: Array<{ id: string; uuid: string; currentName: string | null }>;
        mainDriverIds: string[];
        reserveDriverIds: string[];
        lastRosterUpdatedAt: Date | null;
        lastRosterRound: number | null;
        lastRosterRaceName: string | null;
      }
    >();

    const latestRosterByTeam = await prisma.$queryRaw<
      Array<{ teamId: string; raceRound: number; raceName: string; updatedAt: Date }>
    >`
      WITH ranked_rosters AS (
        SELECT
          r."teamId" AS "teamId",
          rr."round" AS "raceRound",
          rr."name" AS "raceName",
          r."updatedAt" AS "updatedAt",
          ROW_NUMBER() OVER (
            PARTITION BY r."teamId"
            ORDER BY rr."round" DESC, r."updatedAt" DESC, r."id" DESC
          ) AS rn
        FROM "SeasonRaceTeamRoster" r
        INNER JOIN "Race" rr ON rr."id" = r."raceId"
        WHERE r."seasonId" = ${seasonId}
          AND rr."round" <= ${race.round}
      )
      SELECT "teamId", "raceRound", "raceName", "updatedAt"
      FROM ranked_rosters
      WHERE rn = 1
    `;
    const rosterMetaByTeam = new Map(
      latestRosterByTeam.map((row) =>
        [
          row.teamId,
          { updatedAt: row.updatedAt, round: row.raceRound, raceName: row.raceName },
        ] as const,
      ),
    );

    for (const assignment of activeAssignments) {
      if (!assignment.teamId) continue;
      const existing = teamsMap.get(assignment.teamId) ?? {
        teamId: assignment.teamId,
        teamName: assignment.teamName,
        drivers: [],
        mainDriverIds: [],
        reserveDriverIds: [],
        lastRosterUpdatedAt: rosterMetaByTeam.get(assignment.teamId)?.updatedAt ?? null,
        lastRosterRound: rosterMetaByTeam.get(assignment.teamId)?.round ?? null,
        lastRosterRaceName: rosterMetaByTeam.get(assignment.teamId)?.raceName ?? null,
      };

      existing.drivers.push({
        id: assignment.driverId,
        uuid: assignment.driverUuid,
        currentName: assignment.driverName,
      });
      teamsMap.set(assignment.teamId, existing);
    }

    const rosterOnlyTeamIds = Array.from(
      new Set(rosterRows.map((row) => row.teamId).filter((teamId) => !teamsMap.has(teamId))),
    );
    if (rosterOnlyTeamIds.length > 0) {
      const rosterOnlyTeams = await prisma.team.findMany({
        where: {
          id: { in: rosterOnlyTeamIds },
          leagueId: id,
        },
        select: { id: true, name: true },
      });

      for (const team of rosterOnlyTeams) {
        teamsMap.set(team.id, {
          teamId: team.id,
          teamName: team.name,
          drivers: [],
          mainDriverIds: [],
          reserveDriverIds: [],
          lastRosterUpdatedAt: rosterMetaByTeam.get(team.id)?.updatedAt ?? null,
          lastRosterRound: rosterMetaByTeam.get(team.id)?.round ?? null,
          lastRosterRaceName: rosterMetaByTeam.get(team.id)?.raceName ?? null,
        });
      }
    }

    for (const row of rosterRows) {
      const team = teamsMap.get(row.teamId);
      if (!team) continue;
      if (row.role === "MAIN") {
        team.mainDriverIds.push(row.driverId);
      } else {
        team.reserveDriverIds.push(row.driverId);
      }
    }

    slotRosterConfig = {
      enabled: true,
      teams: Array.from(teamsMap.values()),
    };
  }

  let manualResultRows: Array<{
    id: string;
    manualPositionOverride: number | null;
    manualPreviousPosition: number | null;
    manualOriginalPosition: number | null;
    manualEditedAt: Date | null;
    manualEditReason: string | null;
  }> = [];
  let roundMetaRows: Array<{
    id: string;
    origin: string;
    manualKind: string | null;
  }> = [];

  try {
    manualResultRows = await prisma.$queryRaw<
      Array<{
        id: string;
        manualPositionOverride: number | null;
        manualPreviousPosition: number | null;
        manualOriginalPosition: number | null;
        manualEditedAt: Date | null;
        manualEditReason: string | null;
      }>
    >`
      SELECT
        "id",
        "manualPositionOverride",
        "manualPreviousPosition",
        "manualOriginalPosition",
        "manualEditedAt",
        "manualEditReason"
      FROM "RoundResult"
      WHERE "eventRoundId" IN (
        SELECT "id" FROM "EventRound" WHERE "raceId" = ${raceId}
      )
    `;
  } catch {
    manualResultRows = [];
  }

  try {
    roundMetaRows = await prisma.$queryRaw<
      Array<{ id: string; origin: string; manualKind: string | null }>
    >`
      SELECT
        "id",
        "origin"::text AS "origin",
        "manualKind"::text AS "manualKind"
      FROM "EventRound"
      WHERE "raceId" = ${raceId}
    `;
  } catch {
    roundMetaRows = [];
  }

  const manualByResultId = new Map(
    manualResultRows.map((row) => [row.id, row] as const),
  );
  const roundMetaByRoundId = new Map(
    roundMetaRows.map((row) => [row.id, row] as const),
  );

  const raceForClient = {
    ...race,
    reverseGridEnabled: raceReverseGridEnabled,
    apiEventCache: null,
    eventRounds: race.eventRounds.map((round) => ({
      ...round,
      origin: roundMetaByRoundId.get(round.id)?.origin ?? "API",
      manualKind: roundMetaByRoundId.get(round.id)?.manualKind ?? null,
      results: round.results.map((result) => {
        const manual = manualByResultId.get(result.id);
        return {
          ...result,
          manualPositionOverride: manual?.manualPositionOverride ?? null,
          manualPreviousPosition: manual?.manualPreviousPosition ?? null,
          manualOriginalPosition: manual?.manualOriginalPosition ?? null,
          manualEditedAt: manual?.manualEditedAt ?? null,
          manualEditReason: manual?.manualEditReason ?? null,
        };
      }),
    })),
  };

  let existingRaceBonuses: Array<{
    driverId: string;
    driverUuid: string;
    driverName: string | null;
    points: number;
    reason: string | null;
  }> = [];

  const seasonAssignedDrivers = await prisma.seasonTeamAssignment.findMany({
    where: { seasonId },
    select: {
      driver: {
        select: {
          id: true,
          uuid: true,
          currentName: true,
        },
      },
    },
    orderBy: {
      driver: {
        currentName: "asc",
      },
    },
  });

  const seasonRoundsRows = await prisma.race.findMany({
    where: { seasonId },
    select: { round: true, name: true },
    orderBy: { round: "asc" },
  });
  const seasonRounds = seasonRoundsRows.map((entry) => entry.round);
  const seasonRoundOptions = seasonRoundsRows.map((entry) => ({
    round: entry.round,
    raceName: entry.name,
  }));

  try {
    existingRaceBonuses = await prisma.$queryRaw<
      Array<{
        driverId: string;
        driverUuid: string;
        driverName: string | null;
        points: number;
        reason: string | null;
      }>
    >`
      SELECT
        b."driverId" AS "driverId",
        d."uuid" AS "driverUuid",
        d."currentName" AS "driverName",
        b."points" AS "points",
        b."reason" AS "reason"
      FROM "RaceResultBonus" b
      INNER JOIN "Driver" d ON d."id" = b."driverId"
      WHERE b."raceId" = ${raceId}
      ORDER BY d."currentName" ASC, d."uuid" ASC
    `;
  } catch (error) {
    const isMissingBonusTableError =
      error instanceof Error &&
      error.message.includes("RaceResultBonus") &&
      error.message.includes("does not exist");

    if (!isMissingBonusTableError) {
      throw error;
    }
  }

  // Status Badge Logic
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SCHEDULED":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            Agendada
          </span>
        );
      case "PENDING":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            Configuração Pendente
          </span>
        );
      case "COMPLETED":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
            Finalizada
          </span>
        );
      case "CANCELLED":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
            Cancelada
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-zinc-800 text-zinc-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header Pipeline */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <Link
            href={`/admin/leagues/${id}/seasons/${seasonId}/races`}
            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors group self-start mt-1"
          >
            <ArrowLeft
              size={20}
              className="text-zinc-400 group-hover:text-white transition-colors"
            />
          </Link>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400 mb-1">
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
                {race.season.name}
              </Link>
              <ChevronRight size={14} />
              <Link
                href={`/admin/leagues/${id}/seasons/${seasonId}/races`}
                className="hover:text-cyan-400 transition-colors"
              >
                Corridas
              </Link>
              <ChevronRight size={14} />
              <span className="text-zinc-300">Round {race.round}</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-white tracking-tight font-mono">
                {race.name}
              </h1>
              {getStatusBadge(race.status)}
            </div>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Track Card */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0 relative z-10 border border-zinc-700">
            <MapPin size={24} />
          </div>
          <div className="relative z-10 min-w-0">
            <p className="text-sm text-zinc-500 font-medium">Pista</p>
            <p className="text-lg font-semibold text-white truncate font-mono">
              {race.trackApiName || "Não Definida"}
            </p>
          </div>
          <div className="absolute -right-4 -bottom-4 text-zinc-800/30">
            <MapPin size={100} />
          </div>
        </div>

        {/* Date Card */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-500 shrink-0 relative z-10 border border-cyan-500/20">
            <Calendar size={24} />
          </div>
          <div className="relative z-10 min-w-0">
            <p className="text-sm text-zinc-500 font-medium">Data Agendada</p>
            <p className="text-lg font-semibold text-white truncate font-mono">
              {race.scheduledDate
                ? new Date(race.scheduledDate).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "TBD"}
            </p>
          </div>
          <div className="absolute -right-4 -bottom-4 text-cyan-500/5">
            <Calendar size={100} />
          </div>
        </div>

        {/* Rounds Info Card */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0 relative z-10 border border-indigo-500/20">
            <FlagTriangleRight size={24} />
          </div>
          <div className="relative z-10 min-w-0">
            <p className="text-sm text-zinc-500 font-medium">
              Sessões do Evento
            </p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-white font-mono">
                {race.eventRounds.length}
              </p>
              <span className="text-xs text-zinc-500">rodadas registradas</span>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 text-indigo-500/5">
            <FlagTriangleRight size={100} />
          </div>
        </div>
      </div>

      <RaceDetailsClient
        race={raceForClient}
        isAdmin={isAdmin}
        leagueId={id}
        seasonId={seasonId}
        seasonStatus={race.season.status}
        seasonRounds={seasonRounds}
        seasonRoundOptions={seasonRoundOptions}
        unregisteredPlayers={unregisteredPlayers}
        roundPreviewByName={roundPreviewByName}
        teamScoringMode={teamScoringMode}
        seasonReverseGridEnabled={seasonReverseGridEnabled}
        reverseGridDisplay={{
          enabled: reverseGridEnabledForRace,
          displayRoundId: displayRoundForReverseGrid?.id ?? null,
          pointsByDriverId: reverseGridPointsByDriverId,
        }}
        existingRaceBonuses={existingRaceBonuses.map((entry) => ({
          driverId: entry.driverId,
          driverUuid: entry.driverUuid,
          driverName: entry.driverName ?? entry.driverUuid,
          points: entry.points,
          reason: entry.reason,
        }))}
        seasonAssignedDrivers={seasonAssignedDrivers
          .map((assignment) => assignment.driver)
          .filter(
            (driver, index, array) =>
              array.findIndex((candidate) => candidate.id === driver.id) === index,
          )
          .map((driver) => ({
            id: driver.id,
            uuid: driver.uuid,
            name: driver.currentName ?? driver.uuid,
          }))}
        slotRosterConfig={slotRosterConfig}
      />
    </div>
  );
}
