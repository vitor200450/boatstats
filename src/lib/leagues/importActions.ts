"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculatePoints, PointsSystem } from "./pointsSystem";
import {
  getSeasonSprintConfig,
  resolveRoundPointsSystem,
  roundCountsForStandings,
} from "./roundRules";
import { getTeamScoringConfig } from "./teamScoringConfig";
import { calculateTeamStatsByMode } from "./teamScoringStrategies";
import {
  buildRoundResultsFromHeat,
  getReverseGridPoleWinnerUuidFromEvent,
  getRoundHeatFromEventCache,
} from "./importHelpers";
import {
  compareStandingsByTieBreak,
  sumLowestRacePoints,
} from "./standingsMath";
import { Prisma } from "@prisma/client";
import { fillMissingSlotRosters } from "./slotRosterUtils";
import {
  computeReverseGridPointsForRace,
  getSeasonReverseGridConfig,
  isRaceRound,
  selectLatestQualifyingRound,
} from "./reverseGrid";
import {
  FrosthexEventResultResponse,
} from "@/services/frosthexAPI";
import {
  reprocessSeasonStandingsWithLock,
  type SeasonReprocessReason,
} from "./reprocessStandings";
import { normalizeLegacyAssignmentRoundsForSeason } from "./assignmentNormalization";

export async function reprocessSeasonStandings(
  seasonId: string,
  reason: SeasonReprocessReason = "MANUAL",
  deps?: {
    calculateStandingsFn?: (seasonId: string) => Promise<{ success: boolean; error?: string }>;
  },
): Promise<{ success: boolean; error?: string; durationMs?: number; reason?: SeasonReprocessReason }> {
  if (!deps?.calculateStandingsFn) {
    const normalization = await normalizeLegacyAssignmentRoundsForSeason(seasonId);
    if (normalization.updatedCount > 0) {
      console.info(
        `[LegacyAssignments] Backfilled ${normalization.updatedCount} drivers to round ${normalization.firstSeasonRound} before reprocess season=${seasonId}`,
      );
    }
  }

  const calculateStandingsFn = deps?.calculateStandingsFn ?? calculateStandings;
  return reprocessSeasonStandingsWithLock(seasonId, reason, {
    calculateStandingsFn,
    logger: console,
  });
}

// Fetch event from Frosthex API
async function fetchEventFromAPI(
  apiEventId: string,
): Promise<FrosthexEventResultResponse | null> {
  try {
    // TODO: Replace with actual API endpoint
    const response = await fetch(`https://api.frosthex.com/events/${apiEventId}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching from API:", error);
    return null;
  }
}

// Detect rounds from API event
export async function detectRounds(raceId: string) {
  try {

    const race = await prisma.race.findUnique({
      where: { id: raceId },
      include: {
        season: {
          select: {
            id: true,
            league: {
              select: {
                id: true,
                ownerId: true,
                admins: { select: { userId: true } },
              },
            },
          },
        },
      },
    });

    if (!race) {
      return { success: false, error: "Corrida não encontrada" };
    }

    if (!race.apiEventId) {
      return { success: false, error: "Evento da API não vinculado" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = race.season.league.ownerId === session.user.id;
    const isAdmin = race.season.league.admins.some(
      (a) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    // Fetch event data from API
    const eventData = await fetchEventFromAPI(race.apiEventId);
    if (!eventData) {
      return { success: false, error: "Erro ao buscar dados da API" };
    }

    // Cache the event data
    await prisma.race.update({
      where: { id: raceId },
      data: { apiEventCache: eventData as unknown as Prisma.InputJsonValue },
    });

    // Create EventRounds from API rounds
    const createdRounds = [];
    for (const apiRound of eventData.rounds) {
      // Determine default heat (usually the last one)
      const defaultHeat = apiRound.heats[apiRound.heats.length - 1];

      const round = await prisma.eventRound.upsert({
        where: {
          raceId_apiRoundName: {
            raceId,
            apiRoundName: apiRound.name,
          },
        },
        update: {},
        create: {
          raceId,
          apiRoundName: apiRound.name,
          apiRoundType: apiRound.type,
          targetHeatName: defaultHeat?.name,
          status: "PENDING",
        },
      });

      createdRounds.push(round);
    }

    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/races/${raceId}`
    );

    return { success: true, data: createdRounds };
  } catch (error) {
    console.error("Error detecting rounds:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao detectar rounds",
    };
  }
}

// Import results for a specific round
export async function importRoundResults(roundId: string) {

  return importRoundResultsWithDeps(roundId, {
    prismaClient: prisma,
    authFn: auth,
    revalidateFn: revalidatePath,
    calculateStandingsFn: (seasonId: string) =>
      reprocessSeasonStandings(seasonId, "ROUND_IMPORT"),
  });
}

type ImportRoundResultsDeps = {
  prismaClient: {
    eventRound: {
      findUnique: typeof prisma.eventRound.findUnique;
      findMany: typeof prisma.eventRound.findMany;
      update: typeof prisma.eventRound.update;
    };
    driver: {
      findUnique: typeof prisma.driver.findUnique;
      create: typeof prisma.driver.create;
      update: typeof prisma.driver.update;
    };
    roundResult: {
      deleteMany: typeof prisma.roundResult.deleteMany;
      createMany: typeof prisma.roundResult.createMany;
    };
    race: {
      update: typeof prisma.race.update;
    };
    $transaction: typeof prisma.$transaction;
  };
  authFn: () => Promise<{
    user?: {
      id?: string;
      role?: string;
    };
  } | null>;
  revalidateFn: typeof revalidatePath;
  calculateStandingsFn: (seasonId: string) => Promise<{ success: boolean; error?: string }>;
};

export async function importRoundResultsWithDeps(
  roundId: string,
  deps: ImportRoundResultsDeps,
) {
  const { prismaClient, authFn, revalidateFn, calculateStandingsFn } = deps;

  try {

    const round = await prismaClient.eventRound.findUnique({
      where: { id: roundId },
      include: {
        race: {
          include: {
            eventRounds: {
              select: {
                apiRoundName: true,
                apiRoundType: true,
                targetHeatName: true,
              },
            },
            season: {
              include: {
                league: {
                  select: {
                    id: true,
                    ownerId: true,
                    admins: { select: { userId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!round) {
      return { success: false, error: "Round não encontrado" };
    }

    const session = await authFn();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = round.race.season.league.ownerId === session.user.id;
    const isAdmin = round.race.season.league.admins.some(
      (a) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    if (!round.race.apiEventCache) {
      return { success: false, error: "Cache do evento não disponível" };
    }

    if (!round.targetHeatName) {
      return { success: false, error: "Heat alvo não configurado" };
    }

    // Parse cached event data
    const eventData = round.race.apiEventCache as unknown as FrosthexEventResultResponse;

    const roundHeat = getRoundHeatFromEventCache(
      eventData,
      round.apiRoundName,
      round.targetHeatName,
    );
    if (!roundHeat) {
      return { success: false, error: "Heat não encontrado" };
    }
    const { heat } = roundHeat;

    // Determine points system for this round
    const seasonPointsSystem = (round.race.season.pointsSystem as unknown) as PointsSystem;
    const reverseGridConfig = getSeasonReverseGridConfig(seasonPointsSystem);
    const queryRawFn = (prismaClient as unknown as {
      $queryRaw?: typeof prisma.$queryRaw;
    }).$queryRaw;
    const reverseGridFlagRows: Array<{ reverseGridEnabled: boolean }> = queryRawFn
      ? await (queryRawFn as unknown as <T = unknown>(
          query: TemplateStringsArray,
          ...values: unknown[]
        ) => Promise<T>)`
          SELECT "reverseGridEnabled"
          FROM "Race"
          WHERE "id" = ${round.raceId}
          LIMIT 1
        `
      : [];
    const raceReverseGridEnabled = Boolean(reverseGridFlagRows[0]?.reverseGridEnabled);
    const reverseGridPoleWinnerUuid =
      reverseGridConfig.enabled && raceReverseGridEnabled && isRaceRound(round)
        ? getReverseGridPoleWinnerUuidFromEvent(
            eventData,
            round.race.eventRounds ?? [],
          )
        : null;

    const seasonSprintConfig = getSeasonSprintConfig(round.race.season.sprintConfig);
    const effectivePointsSystem = resolveRoundPointsSystem(
      round,
      seasonPointsSystem,
      seasonSprintConfig,
    );

    // Process results
    const driverIdByUuid = new Map<string, string>();
    let results = await buildRoundResultsFromHeat({
      roundId,
      heat,
      effectivePointsSystem,
      poleWinnerUuidOverride: reverseGridPoleWinnerUuid,
      resolveDriverId: async (uuid, name) => {
        let driver = await prismaClient.driver.findUnique({ where: { uuid } });

        if (!driver) {
          driver = await prismaClient.driver.create({
            data: {
              uuid,
              currentName: name,
            },
          });
        } else if (driver.currentName !== name) {
          await prismaClient.driver.update({
            where: { id: driver.id },
            data: { currentName: name },
          });
        }

        driverIdByUuid.set(uuid, driver.id);

        return driver.id;
      },
    });

    let existingOverrides: Array<{
      driverId: string;
      manualPositionOverride: number | null;
      manualPreviousPosition: number | null;
      manualOriginalPosition: number | null;
      manualEditedById: string | null;
      manualEditedAt: Date | null;
      manualEditReason: string | null;
    }> = [];

    try {
      existingOverrides = await prisma.$queryRaw<
        Array<{
          driverId: string;
          manualPositionOverride: number | null;
          manualPreviousPosition: number | null;
          manualOriginalPosition: number | null;
          manualEditedById: string | null;
          manualEditedAt: Date | null;
          manualEditReason: string | null;
        }>
      >`
        SELECT
          "driverId",
          "manualPositionOverride",
          "manualPreviousPosition",
          "manualOriginalPosition",
          "manualEditedById",
          "manualEditedAt",
          "manualEditReason"
        FROM "RoundResult"
        WHERE "eventRoundId" = ${roundId}
          AND "manualPositionOverride" IS NOT NULL
      `;
    } catch {
      existingOverrides = [];
    }

    const overrideByDriverId = new Map(
      existingOverrides.map((row) => [row.driverId, row] as const),
    );
    const appliedOverrides: typeof existingOverrides = [];
    if (overrideByDriverId.size > 0) {
      results = results.map((result) => {
        const override = overrideByDriverId.get(result.driverId);
        if (!override?.manualPositionOverride) return result;

        appliedOverrides.push(override);

        return {
          ...result,
          position: override.manualPositionOverride,
        };
      });
    }

    if (effectivePointsSystem) {
      const orderedResults = [...results].sort(
        (a, b) => a.position - b.position || a.driverId.localeCompare(b.driverId),
      );

      const activeResults = orderedResults.filter((result) => !result.disqualified);
      const compensatedPositionByDriverId = new Map(
        activeResults.map((result, index) => [result.driverId, index + 1] as const),
      );

      const fastestByTime = activeResults
        .filter((result) => (result.fastestLapTime ?? 0) > 0)
        .sort(
          (a, b) =>
            (a.fastestLapTime ?? Number.MAX_SAFE_INTEGER) -
            (b.fastestLapTime ?? Number.MAX_SAFE_INTEGER),
        )[0];

      const fastestMarked = activeResults.find((result) => result.fastestLap);
      const minFastestLapTime = fastestByTime?.fastestLapTime ?? null;
      const tiedFastestByTime =
        minFastestLapTime && minFastestLapTime > 0
          ? activeResults.filter(
              (result) => result.fastestLapTime === minFastestLapTime,
            )
          : [];
      const fastestLapDriverId =
        tiedFastestByTime.find((result) => result.fastestLap)?.driverId ??
        fastestByTime?.driverId ??
        fastestMarked?.driverId ??
        null;

      const poleWinnerDriverId = reverseGridPoleWinnerUuid
        ? driverIdByUuid.get(reverseGridPoleWinnerUuid) ?? null
        : null;

      results = orderedResults.map((result) => {
        const hasFastestLap =
          fastestLapDriverId !== null && result.driverId === fastestLapDriverId;
        const hasPolePosition = poleWinnerDriverId
          ? result.driverId === poleWinnerDriverId
          : result.startPosition === 1;

        const compensatedPosition =
          compensatedPositionByDriverId.get(result.driverId) ?? result.position;

        const points = result.disqualified
          ? 0
          : calculatePoints(
              compensatedPosition,
              hasFastestLap,
              hasPolePosition,
              effectivePointsSystem,
            );

        return {
          ...result,
          fastestLap: hasFastestLap,
          points,
        };
      });
    }

    // Delete existing results and insert new ones
    if (appliedOverrides.length === 0) {
      await prismaClient.$transaction([
        prismaClient.roundResult.deleteMany({
          where: { eventRoundId: roundId },
        }),
        prismaClient.roundResult.createMany({
          data: results,
        }),
        prismaClient.eventRound.update({
          where: { id: roundId },
          data: {
            status: "IMPORTED",
            importedAt: new Date(),
          },
        }),
      ]);
    } else {
      await prismaClient.$transaction(async (tx) => {
        await tx.roundResult.deleteMany({ where: { eventRoundId: roundId } });

        await tx.roundResult.createMany({ data: results });

        for (const override of appliedOverrides) {
          await tx.$executeRaw`
            UPDATE "RoundResult"
            SET
              "manualPositionOverride" = ${override.manualPositionOverride},
              "manualPreviousPosition" = ${override.manualPreviousPosition},
              "manualOriginalPosition" = ${override.manualOriginalPosition},
              "manualEditedById" = ${override.manualEditedById},
              "manualEditedAt" = ${override.manualEditedAt},
              "manualEditReason" = ${override.manualEditReason}
            WHERE "eventRoundId" = ${roundId}
              AND "driverId" = ${override.driverId}
          `;
        }

        await tx.eventRound.update({
          where: { id: roundId },
          data: {
            status: "IMPORTED",
            importedAt: new Date(),
          },
        });
      });
    }

    // Update race status if all rounds are imported
    const allRounds = await prismaClient.eventRound.findMany({
      where: { raceId: round.raceId },
    });

    const allImported = allRounds.every((r) => r.status === "IMPORTED");
    if (allImported) {
      await prismaClient.race.update({
        where: { id: round.raceId },
        data: { status: "COMPLETED" },
      });
    }

    // Recalculate standings
    await calculateStandingsFn(round.race.seasonId);

    revalidateFn(
      `/admin/leagues/${round.race.season.league.id}/seasons/${round.race.season.id}/races/${round.raceId}`
    );
    revalidateFn(
      `/admin/leagues/${round.race.season.league.id}/seasons/${round.race.season.id}/standings`
    );

    return { success: true, data: { imported: results.length } };
  } catch (error) {
    console.error("Error importing round results:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao importar resultados",
    };
  }
}

// Calculate standings for a season
export async function calculateStandings(seasonId: string) {
  try {

    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        races: {
          select: {
            id: true,
            round: true,
            createdAt: true,
            scheduledDate: true,
            eventRounds: {
              where: { status: "IMPORTED" },
              select: {
                apiRoundName: true,
                apiRoundType: true,
                specialType: true,
                sprintMode: true,
                pointsSystem: true,
                countsForStandings: true,
                results: {
                  select: {
                    driverId: true,
                    position: true,
                    points: true,
                    disqualified: true,
                  },
                },
              },
            },
          },
          orderBy: { round: "asc" },
        },
        teamAssignments: {
          select: {
            teamId: true,
            driverId: true,
            joinedAt: true,
            leftAt: true,
          },
        },
      },
    });

    if (!season) {
      return { success: false, error: "Temporada não encontrada" };
    }

    // Process all races and rounds
    const seasonPointsSystem = (season.pointsSystem as unknown) as PointsSystem;
    const seasonSprintConfig = getSeasonSprintConfig(season.sprintConfig);
    const reverseGridConfig = getSeasonReverseGridConfig(seasonPointsSystem);

    const reverseGridFlagRows = await prisma.$queryRaw<
      Array<{ id: string; reverseGridEnabled: boolean }>
    >`
      SELECT "id", "reverseGridEnabled"
      FROM "Race"
      WHERE "seasonId" = ${seasonId}
    `;
    const reverseGridFlagByRaceId = new Map(
      reverseGridFlagRows.map((row) => [row.id, row.reverseGridEnabled] as const),
    );

    const racesWithReverseGrid = season.races.map((race) => {
      const raceReverseGridEnabled = Boolean(reverseGridFlagByRaceId.get(race.id));
      if (!raceReverseGridEnabled || !reverseGridConfig.enabled) {
        return race;
      }

      const reverseGridPointsByDriver = computeReverseGridPointsForRace(
        race,
        reverseGridConfig,
      );
      if (reverseGridPointsByDriver.size === 0) {
        return race;
      }

      const reverseGridRound = {
        apiRoundName: "Reverse Grid Quali",
        apiRoundType: "REVERSE_GRID_QUALI",
        specialType: "NONE",
        sprintMode: null,
        pointsSystem: null,
        countsForStandings: true,
        results: Array.from(reverseGridPointsByDriver.entries()).map(
          ([driverId, points]) => ({
            driverId,
            position: 0,
            points,
            disqualified: false,
          }),
        ),
      };

      return {
        ...race,
        eventRounds: [...race.eventRounds, reverseGridRound],
      };
    });

    const teamScoringConfig = getTeamScoringConfig(seasonPointsSystem);

    const depthChartEntries = await prisma.$queryRaw<
      Array<{
        seasonId: string;
        teamId: string;
        driverId: string;
        priority: number;
        effectiveFromRound: number;
        effectiveToRound: number | null;
      }>
    >`
      SELECT "seasonId", "teamId", "driverId", "priority", "effectiveFromRound", "effectiveToRound"
      FROM "SeasonTeamDepthChartEntry"
      WHERE "seasonId" = ${seasonId}
    `;

    const temporalAssignments = await prisma.$queryRaw<
      Array<{
        id: string;
        teamId: string | null;
        driverId: string;
        joinedAt: Date;
        leftAt: Date | null;
        effectiveFromRound: number;
        effectiveToRound: number | null;
      }>
    >`
      SELECT "id", "teamId", "driverId", "joinedAt", "leftAt", "effectiveFromRound", "effectiveToRound"
      FROM "SeasonTeamAssignment"
      WHERE "seasonId" = ${seasonId}
      ORDER BY "driverId" ASC, "effectiveFromRound" ASC, "joinedAt" ASC, "id" ASC
    `;

    const slotRosterEntries =
      teamScoringConfig.mode === "SLOT_MULLIGAN"
        ? await prisma.$queryRaw<
            Array<{
              seasonId: string;
              raceId: string;
              teamId: string;
              driverId: string;
              role: "MAIN" | "RESERVE";
              priority: number;
            }>
          >`
            SELECT r."seasonId", r."raceId", r."teamId", i."driverId", i."role", i."priority"
            FROM "SeasonRaceTeamRoster" r
            INNER JOIN "SeasonRaceTeamRosterItem" i ON i."rosterId" = r."id"
            WHERE r."seasonId" = ${seasonId}
          `
        : [];

    const raceBonuses = await prisma.$queryRaw<
      Array<{ raceId: string; driverId: string; points: number }>
    >`
      SELECT b."raceId", b."driverId", b."points"
      FROM "RaceResultBonus" b
      INNER JOIN "Race" r ON r."id" = b."raceId"
      WHERE r."seasonId" = ${seasonId}
    `;
    const raceBonusesByRaceId = new Map<string, Array<{ driverId: string; points: number }>>();
    for (const bonus of raceBonuses) {
      const existing = raceBonusesByRaceId.get(bonus.raceId) ?? [];
      existing.push({ driverId: bonus.driverId, points: bonus.points });
      raceBonusesByRaceId.set(bonus.raceId, existing);
    }

    const teamAssignmentsForScoring = temporalAssignments.flatMap((assignment) =>
      assignment.teamId
        ? [
            {
              id: assignment.id,
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

    // Calculate driver standings
    const driverStats = new Map<
      string,
      {
        totalPoints: number;
        wins: number;
        podiums: number;
        bestFinishes: Record<string, number>;
        racePoints: Record<string, Record<string, number>>;
      }
    >();

    for (const race of racesWithReverseGrid) {
      for (const round of race.eventRounds) {
        if (!roundCountsForStandings(round, seasonSprintConfig)) continue;

        for (const result of round.results) {
          if (result.disqualified) continue;

          const driverId = result.driverId;
          const stats = driverStats.get(driverId) || {
            totalPoints: 0,
            wins: 0,
            podiums: 0,
            bestFinishes: {},
            racePoints: {},
          };

          stats.totalPoints += result.points;

          const isReverseGridRound = round.apiRoundType === "REVERSE_GRID_QUALI";
          if (!isReverseGridRound) {
            if (result.position === 1) stats.wins++;
            if (result.position <= 3) stats.podiums++;
          }

          if (!isReverseGridRound) {
            const posKey = result.position.toString();
            stats.bestFinishes[posKey] = (stats.bestFinishes[posKey] || 0) + 1;
          }

          if (!stats.racePoints[race.id]) {
            stats.racePoints[race.id] = {};
          }
          stats.racePoints[race.id][round.apiRoundName] = result.points;

          driverStats.set(driverId, stats);
        }
      }

      for (const bonus of raceBonusesByRaceId.get(race.id) ?? []) {
        const stats = driverStats.get(bonus.driverId) || {
          totalPoints: 0,
          wins: 0,
          podiums: 0,
          bestFinishes: {},
          racePoints: {},
        };

        stats.totalPoints += bonus.points;

        if (!stats.racePoints[race.id]) {
          stats.racePoints[race.id] = {};
        }
        stats.racePoints[race.id]["Bônus Manual"] = bonus.points;

        driverStats.set(bonus.driverId, stats);
      }
    }

    // Fill missing slot rosters by inheriting from previous races
    const filledSlotRosterEntries =
      teamScoringConfig.mode === "SLOT_MULLIGAN"
        ? fillMissingSlotRosters(
            racesWithReverseGrid,
            slotRosterEntries,
            teamAssignmentsForScoring,
          )
        : slotRosterEntries;
    
    const teamStats = calculateTeamStatsByMode({
      mode: teamScoringConfig.mode,
      races: racesWithReverseGrid,
      teamAssignments: teamAssignmentsForScoring,
      depthChartEntries,
      slotRosterEntries: filledSlotRosterEntries,
      teamSlotMulliganCount: teamScoringConfig.teamSlotMulliganCount,
      seasonSprintConfig,
      seasonCompleted: season.status !== "ACTIVE",
    });

    const driverMulliganCount = teamScoringConfig.driverMulliganCount;
    const canApplyDriverMulligans =
      driverMulliganCount > 0 &&
      season.status !== "ACTIVE" &&
      racesWithReverseGrid.length >= driverMulliganCount;
    
    if (canApplyDriverMulligans) {
      for (const [, driver] of driverStats) {
        const removed = sumLowestRacePoints(
          driver.racePoints,
          driverMulliganCount,
        );
        driver.totalPoints -= removed;
      }
    }

    // Sort and assign positions with tie-breakers
    const sortedDrivers = Array.from(driverStats.entries())
      .map(([driverId, stats]) => ({ driverId, ...stats }))
      .sort(compareStandingsByTieBreak);

    const sortedTeams = Array.from(teamStats.entries())
      .map(([teamId, stats]) => ({ teamId, ...stats }))
      .sort(compareStandingsByTieBreak);

    const driverStandingRows = sortedDrivers.map((driver, index) => ({
      seasonId,
      type: "DRIVER" as const,
      driverId: driver.driverId,
      teamId: null,
      position: index + 1,
      totalPoints: driver.totalPoints,
      wins: driver.wins,
      podiums: driver.podiums,
      racePoints: driver.racePoints as unknown as Prisma.InputJsonValue,
      bestFinishes: driver.bestFinishes as unknown as Prisma.InputJsonValue,
    }));

    const teamStandingRows = sortedTeams.map((team, index) => ({
      seasonId,
      type: "TEAM" as const,
      driverId: null,
      teamId: team.teamId,
      position: index + 1,
      totalPoints: team.totalPoints,
      wins: team.wins,
      podiums: team.podiums,
      racePoints: team.racePoints as unknown as Prisma.InputJsonValue,
      bestFinishes: team.bestFinishes as unknown as Prisma.InputJsonValue,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.standing.deleteMany({ where: { seasonId } });

      if (driverStandingRows.length > 0) {
        await tx.standing.createMany({
          data: driverStandingRows,
        });
      }

      if (teamStandingRows.length > 0) {
        await tx.standing.createMany({
          data: teamStandingRows,
        });
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error calculating standings:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao calcular classificação",
    };
  }
}

// Get standings for a season
export async function getStandings(seasonId: string, type?: "DRIVER" | "TEAM") {
  try {
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        league: {
          select: {
            id: true,
            ownerId: true,
            admins: { select: { userId: true } },
            teams: true,
          },
        },
      },
    });

    if (!season) {
      return { success: false, error: "Temporada não encontrada" };
    }

    const standings = await prisma.standing.findMany({
      where: {
        seasonId,
        ...(type ? { type } : {}),
      },
      include: {
        driver: true,
        team: true,
      },
      orderBy: [{ type: "asc" }, { position: "asc" }],
    });

    return { success: true, data: standings };
  } catch (error) {
    console.error("Error fetching standings:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao buscar classificação",
    };
  }
}

// Recalculate all points for a season (after rule change)
export async function recalculatePoints(seasonId: string) {
  try {

    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        league: {
          select: {
            id: true,
            ownerId: true,
            admins: { select: { userId: true } },
          },
        },
        races: {
          select: {
            id: true,
            round: true,
            scheduledDate: true,
            createdAt: true,
            eventRounds: {
              where: { status: "IMPORTED" },
              include: {
                results: true,
              },
            },
          },
          orderBy: { round: "asc" },
        },
      },
    });

    if (!season) {
      return { success: false, error: "Temporada não encontrada" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = season.league.ownerId === session.user.id;
    const isAdmin = season.league.admins.some(
      (a) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const pointsSystem = (season.pointsSystem as unknown) as PointsSystem;
    const reverseGridConfig = getSeasonReverseGridConfig(pointsSystem);
    const seasonSprintConfig = getSeasonSprintConfig(season.sprintConfig);

    const reverseGridFlagRows = await prisma.$queryRaw<
      Array<{ id: string; reverseGridEnabled: boolean }>
    >`
      SELECT "id", "reverseGridEnabled"
      FROM "Race"
      WHERE "seasonId" = ${seasonId}
    `;
    const reverseGridFlagByRaceId = new Map(
      reverseGridFlagRows.map((row) => [row.id, row.reverseGridEnabled] as const),
    );

    // Recalculate all results
    for (const race of season.races) {
      const raceReverseGridEnabled = Boolean(reverseGridFlagByRaceId.get(race.id));
      const reverseGridPoleWinnerDriverId =
        reverseGridConfig.enabled && raceReverseGridEnabled
          ? selectLatestQualifyingRound(race.eventRounds)
              ?.results.find((result) => !result.disqualified && result.position === 1)
              ?.driverId ?? null
          : null;

      for (const round of race.eventRounds) {
        const roundPointsSystem = resolveRoundPointsSystem(
          round,
          pointsSystem,
          seasonSprintConfig,
        );

        if (!roundPointsSystem) {
          await prisma.roundResult.updateMany({
            where: { eventRoundId: round.id },
            data: {
              points: 0,
              fastestLap: false,
            },
          });
          continue;
        }

        const orderedResults = [...round.results].sort((a, b) => {
          if (a.position !== b.position) return a.position - b.position;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

        const activeResults = orderedResults.filter((result) => !result.disqualified);

        const compensatedPositionById = new Map(
          activeResults.map((result, index) => [result.id, index + 1] as const),
        );

        const fastestByTime = activeResults
          .filter((result) => (result.fastestLapTime ?? 0) > 0)
          .sort(
            (a, b) =>
              (a.fastestLapTime ?? Number.MAX_SAFE_INTEGER) -
              (b.fastestLapTime ?? Number.MAX_SAFE_INTEGER),
          )[0];

        const fastestMarked = activeResults
          .filter((result) => result.fastestLap)
          .sort(
            (a, b) =>
              a.position - b.position ||
              a.createdAt.getTime() - b.createdAt.getTime(),
          )[0];

        const minFastestLapTime = fastestByTime?.fastestLapTime ?? null;
        const tiedFastestByTime =
          minFastestLapTime && minFastestLapTime > 0
            ? activeResults.filter(
                (result) => result.fastestLapTime === minFastestLapTime,
              )
            : [];

        const fastestActive =
          tiedFastestByTime.find((result) => result.fastestLap) ??
          fastestByTime ??
          fastestMarked;

        for (const result of orderedResults) {
          const shouldBeFastestLap = fastestActive?.id === result.id;
          const hasPolePosition =
            reverseGridPoleWinnerDriverId && isRaceRound(round)
              ? result.driverId === reverseGridPoleWinnerDriverId
              : result.startPosition === 1;
          const newPoints = result.disqualified
            ? 0
            : calculatePoints(
                compensatedPositionById.get(result.id) ?? result.position,
                shouldBeFastestLap,
                hasPolePosition,
                roundPointsSystem,
              );

          if (
            newPoints !== result.points ||
            shouldBeFastestLap !== result.fastestLap
          ) {
            await prisma.roundResult.update({
              where: { id: result.id },
              data: {
                points: newPoints,
                fastestLap: shouldBeFastestLap,
              },
            });
          }
        }
      }
    }

    // Recalculate standings
    const standingsResult = await reprocessSeasonStandings(
      seasonId,
      "POINTS_RECALC",
    );
    if (!standingsResult.success) {
      return standingsResult;
    }

    revalidatePath(
      `/admin/leagues/${season.league.id}/seasons/${seasonId}/standings`
    );
    revalidatePath(`/admin/leagues/${season.league.id}/seasons/${seasonId}`);
    revalidatePath(`/admin/leagues/${season.league.id}/seasons/${seasonId}/drivers`);
    revalidatePath(`/leagues/${season.league.id}`);

    return { success: true };
  } catch (error) {
    console.error("Error recalculating points:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao recalcular pontos",
    };
  }
}

// Recalculate standings only (faster, does not recompute roundResult points)
export async function recalculateStandings(seasonId: string) {
  try {

    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        league: {
          select: {
            id: true,
            ownerId: true,
            admins: { select: { userId: true } },
          },
        },
      },
    });

    if (!season) {
      return { success: false, error: "Temporada não encontrada" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = season.league.ownerId === session.user.id;
    const isAdmin = season.league.admins.some(
      (a) => a.userId === session.user!.id,
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const standingsResult = await reprocessSeasonStandings(seasonId, "MANUAL");
    if (!standingsResult.success) {
      return standingsResult;
    }

    revalidatePath(`/admin/leagues/${season.league.id}/seasons/${seasonId}`);
    revalidatePath(`/admin/leagues/${season.league.id}/seasons/${seasonId}/drivers`);
    revalidatePath(`/admin/leagues/${season.league.id}/seasons/${seasonId}/standings`);
    revalidatePath(`/leagues/${season.league.id}`);

    return { success: true };
  } catch (error) {
    console.error("Error recalculating standings only:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao recalcular classificação",
    };
  }
}
