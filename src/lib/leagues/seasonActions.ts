"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  createSeasonSchema,
  updateSeasonSchema,
  CreateSeasonInput,
  UpdateSeasonInput,
} from "@/lib/validations/leagues";
import { F1_SPRINT_POINTS } from "@/lib/leagues/pointsSystem";
import { reprocessSeasonStandings } from "@/lib/leagues/importActions";

function getSeasonTeamScoringMode(pointsSystem: unknown):
  | "STANDARD"
  | "DEPTH_CHART"
  | "SLOT_MULLIGAN" {
  if (!pointsSystem || typeof pointsSystem !== "object") {
    return "STANDARD";
  }

  const rules = (pointsSystem as { rules?: unknown }).rules;
  if (!rules || typeof rules !== "object") {
    return "STANDARD";
  }

  const mode = (rules as { teamScoringMode?: unknown }).teamScoringMode;
  if (mode === "DEPTH_CHART" || mode === "SLOT_MULLIGAN") {
    return mode;
  }

  return "STANDARD";
}

// Helper to check league access
async function checkLeagueAccess(leagueId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Não autenticado");
  }

  const user = session.user;

  if (user.role === "SUPER_ADMIN") {
    return { user, hasAccess: true };
  }

  const league = await prisma.league.findFirst({
    where: {
      id: leagueId,
      OR: [{ ownerId: user.id }, { admins: { some: { userId: user.id } } }],
    },
  });

  if (!league) {
    throw new Error("Acesso negado ou liga não encontrada");
  }

  return { user, hasAccess: true };
}

async function resolveSeasonEffectiveRound(
  seasonId: string,
  requestedRound?: number,
): Promise<
  | { success: true; round: number; referenceDate: Date }
  | { success: false; error: string }
> {
  const rounds = await prisma.race.findMany({
    where: { seasonId },
    select: {
      round: true,
      scheduledDate: true,
      createdAt: true,
    },
    orderBy: { round: "asc" },
  });

  if (rounds.length === 0) {
    return {
      success: true,
      round: requestedRound ?? 1,
      referenceDate: new Date(),
    };
  }

  if (requestedRound !== undefined) {
    const selected = rounds.find((race) => race.round === requestedRound);
    if (!selected) {
      return { success: false, error: "Rodada de vigência inválida" };
    }

    return {
      success: true,
      round: selected.round,
      referenceDate: selected.scheduledDate ?? selected.createdAt,
    };
  }

  const firstRound = rounds[0];
  return {
    success: true,
    round: firstRound.round,
    referenceDate: firstRound.scheduledDate ?? firstRound.createdAt,
  };
}

// Create a new season for a league
export async function createSeason(leagueId: string, data: CreateSeasonInput) {
  try {

    await checkLeagueAccess(leagueId);

    const validated = createSeasonSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: "Dados inválidos",
        details: validated.error.flatten(),
      };
    }

    const season = await prisma.season.create({
      data: {
        leagueId,
        name: validated.data.name,
        year: validated.data.year,
        status: "DRAFT",
        pointsSystem: {
          ...validated.data.pointsSystem,
          rules: {
            ...validated.data.pointsSystem.rules,
            configuredByAdmin: true,
            teamScoringMode:
              validated.data.pointsSystem.rules.teamScoringMode ?? "STANDARD",
            driverMulliganCount:
              validated.data.pointsSystem.rules.driverMulliganCount ?? 0,
            teamSlotMulliganCount:
              validated.data.pointsSystem.rules.teamSlotMulliganCount ?? 0,
          },
        } as Prisma.InputJsonValue,
        sprintConfig: (validated.data.sprintConfig ?? {
          defaultMode: "CLASSIFICATION",
          pointsSystem: F1_SPRINT_POINTS,
        }) as unknown as Prisma.InputJsonValue,
      },
    });

    revalidatePath(`/admin/leagues/${leagueId}/seasons`);

    return { success: true, data: season };
  } catch (error) {
    console.error("Error creating season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar temporada",
    };
  }
}

// Clone season into a new DRAFT season for testing
export async function cloneSeasonForTesting(seasonId: string) {
  try {

    const sourceSeason = await prisma.season.findUnique({
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
          orderBy: { round: "asc" },
          include: {
            eventRounds: {
              include: {
                results: true,
              },
            },
          },
        },
        teamAssignments: true,
      },
    });

    if (!sourceSeason) {
      return { success: false, error: "Temporada não encontrada" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = sourceSeason.league.ownerId === session.user.id;
    const isAdmin = sourceSeason.league.admins.some(
      (a) => a.userId === session.user.id,
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const cloneBaseName = `${sourceSeason.name} (Clone)`;
    let cloneName = cloneBaseName;
    let cloneIndex = 2;

    while (
      await prisma.season.findFirst({
        where: {
          leagueId: sourceSeason.leagueId,
          name: cloneName,
        },
        select: { id: true },
      })
    ) {
      cloneName = `${cloneBaseName} ${cloneIndex}`;
      cloneIndex += 1;
    }

    const depthChartEntries = await prisma.$queryRaw<
      Array<{
        teamId: string;
        driverId: string;
        priority: number;
        effectiveFromRound: number;
        effectiveToRound: number | null;
      }>
    >`
      SELECT "teamId", "driverId", "priority", "effectiveFromRound", "effectiveToRound"
      FROM "SeasonTeamDepthChartEntry"
      WHERE "seasonId" = ${seasonId}
      ORDER BY "teamId" ASC, "effectiveFromRound" ASC, "priority" ASC
    `;

    const sourceRosters = await prisma.$queryRaw<
      Array<{ id: string; raceId: string; teamId: string }>
    >`
      SELECT "id", "raceId", "teamId"
      FROM "SeasonRaceTeamRoster"
      WHERE "seasonId" = ${seasonId}
      ORDER BY "raceId" ASC, "teamId" ASC
    `;

    const sourceRosterItems = await prisma.$queryRaw<
      Array<{ rosterId: string; driverId: string; role: "MAIN" | "RESERVE"; priority: number }>
    >`
      SELECT i."rosterId", i."driverId", i."role", i."priority"
      FROM "SeasonRaceTeamRosterItem" i
      INNER JOIN "SeasonRaceTeamRoster" r ON r."id" = i."rosterId"
      WHERE r."seasonId" = ${seasonId}
      ORDER BY i."rosterId" ASC, i."role" ASC, i."priority" ASC
    `;

    let clonedSeason: { id: string } | null = null;

    try {
      clonedSeason = await prisma.season.create({
        data: {
          leagueId: sourceSeason.leagueId,
          name: cloneName,
          year: sourceSeason.year,
          status: "DRAFT",
          pointsSystem: sourceSeason.pointsSystem as unknown as Prisma.InputJsonValue,
          sprintConfig:
            sourceSeason.sprintConfig === null
              ? undefined
              : (sourceSeason.sprintConfig as unknown as Prisma.InputJsonValue),
        },
        select: { id: true },
      });
      const clonedSeasonId = clonedSeason.id;

      if (sourceSeason.teamAssignments.length > 0) {
        await prisma.seasonTeamAssignment.createMany({
          data: sourceSeason.teamAssignments.map((assignment) => ({
              seasonId: clonedSeasonId,
              teamId: assignment.teamId,
              driverId: assignment.driverId,
              joinedAt: assignment.joinedAt,
              leftAt: assignment.leftAt,
              effectiveFromRound:
                (assignment as unknown as { effectiveFromRound?: number })
                  .effectiveFromRound ?? 1,
              effectiveToRound:
                (assignment as unknown as { effectiveToRound?: number | null })
                  .effectiveToRound ?? null,
            })),
          });
        }

      if (depthChartEntries.length > 0) {
        for (const entry of depthChartEntries) {
          await prisma.$executeRaw`
            INSERT INTO "SeasonTeamDepthChartEntry"
            ("seasonId", "teamId", "driverId", "priority", "effectiveFromRound", "effectiveToRound", "createdAt", "updatedAt")
            VALUES (${clonedSeasonId}, ${entry.teamId}, ${entry.driverId}, ${entry.priority}, ${entry.effectiveFromRound}, ${entry.effectiveToRound}, NOW(), NOW())
          `;
        }
      }

      const raceIdMap = new Map<string, string>();

      for (const sourceRace of sourceSeason.races) {
        const clonedRace = await prisma.race.create({
          data: {
            seasonId: clonedSeasonId,
            name: sourceRace.name,
            round: sourceRace.round,
            apiEventId: null,
            apiEventCache:
              sourceRace.apiEventCache === null
                ? undefined
                : (sourceRace.apiEventCache as unknown as Prisma.InputJsonValue),
            trackApiName: sourceRace.trackApiName,
            scheduledDate: sourceRace.scheduledDate,
            status: sourceRace.status,
          },
          select: { id: true },
        });

        raceIdMap.set(sourceRace.id, clonedRace.id);

        for (const sourceRound of sourceRace.eventRounds) {
          const clonedRound = await prisma.eventRound.create({
            data: {
              raceId: clonedRace.id,
              apiRoundName: sourceRound.apiRoundName,
              apiRoundType: sourceRound.apiRoundType,
              specialType: sourceRound.specialType,
              sprintMode: sourceRound.sprintMode,
              targetHeatName: sourceRound.targetHeatName,
              pointsSystem:
                sourceRound.pointsSystem === null
                  ? undefined
                  : (sourceRound.pointsSystem as unknown as Prisma.InputJsonValue),
              countsForStandings: sourceRound.countsForStandings,
              status: sourceRound.status,
              importedAt: sourceRound.importedAt,
            },
            select: { id: true },
          });

          if (sourceRound.results.length > 0) {
            await prisma.roundResult.createMany({
              data: sourceRound.results.map((result) => ({
                eventRoundId: clonedRound.id,
                driverId: result.driverId,
                position: result.position,
                startPosition: result.startPosition,
                finishTimeMs: result.finishTimeMs,
                fastestLap: result.fastestLap,
                pitstops: result.pitstops,
                points: result.points,
                disqualified: result.disqualified,
                fastestLapTime: result.fastestLapTime,
              })),
            });
          }
        }
      }

      const rosterIdMap = new Map<string, string>();
      for (const sourceRoster of sourceRosters) {
        const clonedRaceId = raceIdMap.get(sourceRoster.raceId);
        if (!clonedRaceId) continue;

        const inserted = await prisma.$queryRaw<Array<{ id: string }>>`
          INSERT INTO "SeasonRaceTeamRoster"
          ("seasonId", "raceId", "teamId", "createdAt", "updatedAt")
          VALUES (${clonedSeasonId}, ${clonedRaceId}, ${sourceRoster.teamId}, NOW(), NOW())
          RETURNING "id"
        `;

        if (inserted[0]?.id) {
          rosterIdMap.set(sourceRoster.id, inserted[0].id);
        }
      }

      for (const item of sourceRosterItems) {
        const clonedRosterId = rosterIdMap.get(item.rosterId);
        if (!clonedRosterId) continue;

        await prisma.$executeRaw`
          INSERT INTO "SeasonRaceTeamRosterItem"
          ("rosterId", "driverId", "role", "priority", "createdAt", "updatedAt")
          VALUES (${clonedRosterId}, ${item.driverId}, ${item.role}, ${item.priority}, NOW(), NOW())
        `;
      }
    } catch (cloneError) {
      if (clonedSeason?.id) {
        await prisma.season.delete({ where: { id: clonedSeason.id } }).catch(() => undefined);
      }
      throw cloneError;
    }

    if (!clonedSeason?.id) {
      return { success: false, error: "Falha ao criar cópia da temporada" };
    }

    const reprocessResult = await reprocessSeasonStandings(clonedSeason.id, "MANUAL");
    if (!reprocessResult.success) {
      return {
        success: false,
        error: reprocessResult.error ?? "Erro ao reprocessar classificação da temporada clonada",
      };
    }

    revalidatePath(`/admin/leagues/${sourceSeason.league.id}/seasons`);
    revalidatePath(`/admin/leagues/${sourceSeason.league.id}/seasons/${seasonId}`);

    return { success: true, data: clonedSeason };
  } catch (error) {
    console.error("Error cloning season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao clonar temporada",
    };
  }
}

// Get all seasons for a league
export async function getSeasons(leagueId: string) {
  try {
    await checkLeagueAccess(leagueId);

    const seasons = await prisma.season.findMany({
      where: { leagueId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            races: true,
          },
        },
      },
    });

    // Get unique driver counts for each season
    const seasonDriverCounts = await Promise.all(
      seasons.map(async (season) => {
        // Get unique drivers from team assignments
        const assignedDrivers = await prisma.seasonTeamAssignment.findMany({
          where: { seasonId: season.id },
          distinct: ["driverId"],
          select: { driverId: true },
        });

        // Get drivers who participated in races but have no team assignment
        const assignedDriverIds = assignedDrivers.map((d) => d.driverId);
        const teamlessDriverCount = await prisma.driver.count({
          where: {
            roundResults: { some: { eventRound: { race: { seasonId: season.id } } } },
            NOT: assignedDriverIds.length > 0 ? { id: { in: assignedDriverIds } } : undefined,
          },
        });

        return {
          seasonId: season.id,
          driverCount: assignedDrivers.length + teamlessDriverCount,
        };
      })
    );

    const seasonsWithDriverCount = seasons.map((season) => ({
      ...season,
      _count: {
        ...season._count,
        teamAssignments: seasonDriverCounts.find((s) => s.seasonId === season.id)?.driverCount || 0,
      },
    }));

    return { success: true, data: seasonsWithDriverCount };
  } catch (error) {
    console.error("Error fetching seasons:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar temporadas",
    };
  }
}

// Get season by ID with all related data
export async function getSeasonById(seasonId: string) {
  try {
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: {
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
        races: {
          orderBy: { round: "asc" },
          include: {
            _count: {
              select: { eventRounds: true },
            },
          },
        },
        teamAssignments: {
          include: {
            driver: true,
            team: true,
          },
        },
        standings: {
          include: {
            driver: true,
            team: true,
          },
          orderBy: [{ type: "asc" }, { position: "asc" }],
        },
      },
    });

    if (!season) {
      return { success: false, error: "Temporada não encontrada" };
    }

    // Check access
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = season.league.ownerId === session.user.id;
    const isAdmin = season.league.admins.some(
      (a) => a.userId === session.user.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    // Get unique assigned driver IDs (a driver may have multiple assignments if they changed teams)
    const assignedDriverIds = [...new Set(season.teamAssignments.map((a) => a.driverId))];
    
    // Count drivers who participated in this season's races but have no team assignment
    const teamlessDriverCount = await prisma.driver.count({
      where: {
        roundResults: { some: { eventRound: { race: { seasonId } } } },
        NOT: assignedDriverIds.length > 0 ? { id: { in: assignedDriverIds } } : undefined,
      },
    });

    return { success: true, data: { ...season, assignedDriverCount: assignedDriverIds.length, teamlessDriverCount } };
  } catch (error) {
    console.error("Error fetching season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar temporada",
    };
  }
}

// Update season
export async function updateSeason(seasonId: string, data: UpdateSeasonInput) {
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
      (a) => a.userId === session.user.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const validated = updateSeasonSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: "Dados inválidos",
        details: validated.error.flatten(),
      };
    }

    const updateData: Prisma.SeasonUpdateInput = {};
    if (validated.data.name !== undefined) updateData.name = validated.data.name;
    if (validated.data.year !== undefined) updateData.year = validated.data.year;
    if (validated.data.status !== undefined)
      updateData.status = validated.data.status;
    if (validated.data.pointsSystem !== undefined)
      {
        const reverseGridPointsTable = Object.fromEntries(
          Object.entries(
            validated.data.pointsSystem.rules.reverseGridPointsTable ?? {},
          )
            .filter(([position, points]) => {
              const parsed = Number(position);
              return Number.isInteger(parsed) && parsed >= 1 && points >= 0;
            })
            .map(([position, points]) => [String(Number(position)), points]),
        );

      updateData.pointsSystem = {
        ...validated.data.pointsSystem,
        rules: {
          ...validated.data.pointsSystem.rules,
          configuredByAdmin: true,
          teamScoringMode:
            validated.data.pointsSystem.rules.teamScoringMode ?? "STANDARD",
          driverMulliganCount:
            validated.data.pointsSystem.rules.driverMulliganCount ?? 0,
          teamSlotMulliganCount:
            validated.data.pointsSystem.rules.teamSlotMulliganCount ?? 0,
          reverseGridEnabled:
            validated.data.pointsSystem.rules.reverseGridEnabled ?? false,
          reverseGridPointsTable,
        },
      } as Prisma.InputJsonValue;
      }
    if (validated.data.sprintConfig !== undefined)
      updateData.sprintConfig = validated.data.sprintConfig as unknown as Prisma.InputJsonValue;

    const updatedSeason = await prisma.season.update({
      where: { id: seasonId },
      data: updateData,
    });

    revalidatePath(`/admin/leagues/${season.league.id}/seasons/${seasonId}`);
    revalidatePath(`/admin/leagues/${season.league.id}/seasons/${seasonId}/settings`);
    revalidatePath(`/admin/leagues/${season.league.id}/seasons`);
    revalidatePath(`/leagues/${season.league.id}`);

    return { success: true, data: updatedSeason };
  } catch (error) {
    console.error("Error updating season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar temporada",
    };
  }
}

// Activate season (only one active per league)
export async function activateSeason(seasonId: string) {
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
      (a) => a.userId === session.user.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    // Deactivate other seasons and activate this one
    await prisma.$transaction(async (tx) => {
      await tx.season.updateMany({
        where: {
          leagueId: season.league.id,
          status: "ACTIVE",
        },
        data: { status: "COMPLETED" },
      });

      await tx.season.update({
        where: { id: seasonId },
        data: { status: "ACTIVE" },
      });
    });

    revalidatePath(`/admin/leagues/${season.league.id}/seasons`);

    return { success: true };
  } catch (error) {
    console.error("Error activating season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao ativar temporada",
    };
  }
}

// Complete season (ACTIVE → COMPLETED)
export async function completeSeason(seasonId: string) {
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
      (a) => a.userId === session.user.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    if (season.status !== "ACTIVE") {
      return {
        success: false,
        error: "Apenas temporadas ativas podem ser finalizadas",
      };
    }

    await prisma.season.update({
      where: { id: seasonId },
      data: { status: "COMPLETED" },
    });

    revalidatePath(`/admin/leagues/${season.league.id}/seasons/${seasonId}`);
    revalidatePath(`/admin/leagues/${season.league.id}/seasons`);

    return { success: true };
  } catch (error) {
    console.error("Error completing season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao finalizar temporada",
    };
  }
}

// Archive season
export async function archiveSeason(seasonId: string) {
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
      (a) => a.userId === session.user.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    await prisma.season.update({
      where: { id: seasonId },
      data: { status: "ARCHIVED" },
    });

    revalidatePath(`/admin/leagues/${season.league.id}/seasons`);

    return { success: true };
  } catch (error) {
    console.error("Error archiving season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao arquivar temporada",
    };
  }
}

// Restore season (COMPLETED/ARCHIVED -> ACTIVE)
export async function restoreSeason(seasonId: string) {
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
      (a) => a.userId === session.user.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    if (season.status !== "COMPLETED" && season.status !== "ARCHIVED") {
      return {
        success: false,
        error: "Apenas temporadas finalizadas ou arquivadas podem ser restauradas",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.season.updateMany({
        where: {
          leagueId: season.league.id,
          status: "ACTIVE",
          NOT: { id: seasonId },
        },
        data: { status: "COMPLETED" },
      });

      await tx.season.update({
        where: { id: seasonId },
        data: { status: "ACTIVE" },
      });
    });

    revalidatePath(`/admin/leagues/${season.league.id}`);
    revalidatePath(`/admin/leagues/${season.league.id}/seasons`);
    revalidatePath(`/admin/leagues/${season.league.id}/seasons/${seasonId}`);

    return { success: true };
  } catch (error) {
    console.error("Error restoring season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao restaurar temporada",
    };
  }
}

// Get season drivers grouped by team
export async function getSeasonDrivers(seasonId: string) {
  try {
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        races: {
          select: {
            id: true,
            round: true,
            name: true,
            status: true,
          },
          orderBy: { round: "asc" },
        },
        league: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            admins: { select: { userId: true } },
            teams: {
              orderBy: { name: "asc" },
              include: {
                assignments: {
                  where: { seasonId },
                  include: {
                    driver: true,
                  },
                  orderBy: { joinedAt: "desc" },
                },
              },
            },
          },
        },
      },
    });

    if (!season) {
      return { success: false, error: "Temporada não encontrada" };
    }

    // Check access
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = season.league.ownerId === session.user.id;
    const isAdmin = season.league.admins.some(
      (a) => a.userId === session.user.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const referenceRound =
      season.status === "COMPLETED" || season.status === "ARCHIVED"
        ? (season.races[season.races.length - 1]?.round ?? 1)
        : (() => {
            const completedRounds = season.races
              .filter((race) => race.status === "COMPLETED")
              .map((race) => race.round);

            if (completedRounds.length > 0) {
              return Math.max(...completedRounds);
            }

            return season.races[0]?.round ?? 1;
          })();

    const activeAssignmentsAtReferenceRound = await prisma.$queryRaw<
      Array<{
        id: string;
        seasonId: string;
        teamId: string | null;
        driverId: string;
        joinedAt: Date;
        leftAt: Date | null;
        effectiveFromRound: number;
        effectiveToRound: number | null;
        driverCurrentName: string | null;
        driverUuid: string;
        driverColorCode: string | null;
        driverBoatType: string | null;
        driverBoatMaterial: string | null;
        driverPreviousNames: string[];
        driverCreatedAt: Date;
        driverUpdatedAt: Date;
      }>
    >`
      WITH ranked_assignments AS (
        SELECT
          a."id",
          a."seasonId",
          a."teamId",
          a."driverId",
          a."joinedAt",
          a."leftAt",
          COALESCE(a."effectiveFromRound", 1) AS "effectiveFromRound",
          a."effectiveToRound",
          ROW_NUMBER() OVER (
            PARTITION BY a."driverId"
            ORDER BY
              COALESCE(a."effectiveFromRound", 1) DESC,
              (a."teamId" IS NULL) ASC,
              a."joinedAt" DESC,
              a."id" DESC
          ) AS rn
        FROM "SeasonTeamAssignment" a
        WHERE a."seasonId" = ${seasonId}
          AND COALESCE(a."effectiveFromRound", 1) <= ${referenceRound}
          AND (a."effectiveToRound" IS NULL OR a."effectiveToRound" >= ${referenceRound})
      )
      SELECT
        ra."id",
        ra."seasonId",
        ra."teamId",
        ra."driverId",
        ra."joinedAt",
        ra."leftAt",
        ra."effectiveFromRound",
        ra."effectiveToRound",
        d."currentName" AS "driverCurrentName",
        d."uuid" AS "driverUuid",
        d."colorCode" AS "driverColorCode",
        d."boatType" AS "driverBoatType",
        d."boatMaterial" AS "driverBoatMaterial",
        d."previousNames" AS "driverPreviousNames",
        d."createdAt" AS "driverCreatedAt",
        d."updatedAt" AS "driverUpdatedAt"
      FROM ranked_assignments ra
      INNER JOIN "Driver" d ON d."id" = ra."driverId"
      WHERE ra.rn = 1
    `;

    const normalizedActiveAssignments = activeAssignmentsAtReferenceRound.map(
      (assignment) => ({
        id: assignment.id,
        seasonId: assignment.seasonId,
        teamId: assignment.teamId,
        driverId: assignment.driverId,
        joinedAt: assignment.joinedAt,
        leftAt: assignment.leftAt,
        effectiveFromRound: assignment.effectiveFromRound,
        effectiveToRound: assignment.effectiveToRound,
        driver: {
          id: assignment.driverId,
          currentName: assignment.driverCurrentName,
          uuid: assignment.driverUuid,
          colorCode: assignment.driverColorCode,
          boatType: assignment.driverBoatType,
          boatMaterial: assignment.driverBoatMaterial,
          previousNames: assignment.driverPreviousNames,
          createdAt: assignment.driverCreatedAt,
          updatedAt: assignment.driverUpdatedAt,
        },
      }),
    );

    const activeAssignmentsByTeamId = new Map<string, typeof normalizedActiveAssignments>();
    for (const assignment of normalizedActiveAssignments) {
      if (!assignment.teamId) continue;
      const list = activeAssignmentsByTeamId.get(assignment.teamId) ?? [];
      list.push(assignment);
      activeAssignmentsByTeamId.set(assignment.teamId, list);
    }

    const teamsWithDrivers = season.league.teams.map((team) => ({
      ...team,
      activeAssignments: activeAssignmentsByTeamId.get(team.id) ?? [],
    }));

    // Find drivers who participated in this season's races but have no team assignment
    const assignedDriverIds = new Set(
      teamsWithDrivers.flatMap((team) => team.activeAssignments.map((assignment) => assignment.driverId)),
    );

    const teamlessDriversFromRaceResults = await prisma.driver.findMany({
      where: {
        roundResults: {
          some: {
            eventRound: {
              race: { seasonId },
            },
          },
        },
        NOT: { id: { in: [...assignedDriverIds] } },
      },
      orderBy: { currentName: "asc" },
    });

    const teamlessAssignments = normalizedActiveAssignments
      .filter((assignment) => assignment.teamId === null)
      .map((assignment) => assignment.driver);

    const teamlessDriverMap = new Map<string, (typeof teamlessDriversFromRaceResults)[number]>();
    for (const driver of teamlessDriversFromRaceResults) {
      teamlessDriverMap.set(driver.id, driver);
    }
    for (const driver of teamlessAssignments) {
      teamlessDriverMap.set(driver.id, driver);
    }
    const teamlessDrivers = [...teamlessDriverMap.values()].sort((a, b) =>
      (a.currentName || a.uuid).localeCompare(b.currentName || b.uuid),
    );

    const driverPoints = await prisma.roundResult.groupBy({
      by: ["driverId"],
      where: {
        eventRound: {
          race: {
            seasonId,
          },
        },
      },
      _sum: {
        points: true,
      },
    });

    const pointsByDriverId = new Map(
      driverPoints.map((entry) =>
        [entry.driverId, entry._sum.points ?? 0] as const,
      ),
    );

    const depthChartEntries = await prisma.$queryRaw<
      Array<{
        teamId: string;
        driverId: string;
        priority: number;
        effectiveFromRound: number;
        effectiveToRound: number | null;
      }>
    >`
      SELECT "teamId", "driverId", "priority", "effectiveFromRound", "effectiveToRound"
      FROM "SeasonTeamDepthChartEntry"
      WHERE "seasonId" = ${seasonId}
      ORDER BY "teamId" ASC, "effectiveFromRound" DESC, "priority" ASC, "updatedAt" DESC
    `;

    const latestDepthChartByTeam = await prisma.$queryRaw<
      Array<{
        teamId: string;
        updatedAt: Date;
        effectiveFromRound: number;
        raceName: string | null;
      }>
    >`
      WITH latest_team_depth_chart AS (
        SELECT
          e."teamId" AS "teamId",
          e."updatedAt" AS "updatedAt",
          e."effectiveFromRound" AS "effectiveFromRound",
          ROW_NUMBER() OVER (
            PARTITION BY e."teamId"
            ORDER BY e."effectiveFromRound" DESC, e."updatedAt" DESC, e."id" DESC
          ) AS rn
        FROM "SeasonTeamDepthChartEntry" e
        WHERE e."seasonId" = ${seasonId}
      )
      SELECT
        l."teamId",
        l."updatedAt",
        l."effectiveFromRound",
        r."name" AS "raceName"
      FROM latest_team_depth_chart l
      LEFT JOIN "Race" r
        ON r."seasonId" = ${seasonId}
       AND r."round" = l."effectiveFromRound"
      WHERE l.rn = 1
    `;

    const depthChartMetaByTeamId = new Map(
      latestDepthChartByTeam.map((entry) =>
        [
          entry.teamId,
          {
            updatedAt: entry.updatedAt,
            round: entry.effectiveFromRound,
            raceName: entry.raceName,
          },
        ] as const,
      ),
    );

    const depthPriorityByTeamDriver = new Map<string, number>();
    for (const entry of depthChartEntries) {
      const key = `${entry.teamId}:${entry.driverId}`;
      if (depthPriorityByTeamDriver.has(key)) continue;
      if (entry.effectiveToRound !== null) continue;
      depthPriorityByTeamDriver.set(key, entry.priority);
    }

    const teamStandings = await prisma.standing.findMany({
      where: {
        seasonId,
        type: "TEAM",
      },
      select: {
        teamId: true,
        totalPoints: true,
      },
    });

    const teamPointsByTeamId = new Map(
      teamStandings
        .filter((entry): entry is { teamId: string; totalPoints: number } =>
          Boolean(entry.teamId),
        )
        .map((entry) => [entry.teamId, entry.totalPoints] as const),
    );

    const teamsWithDriverPoints = teamsWithDrivers.map((team) => ({
      ...team,
      teamSeasonPoints: teamPointsByTeamId.get(team.id),
      lastDepthChartUpdatedAt: depthChartMetaByTeamId.get(team.id)?.updatedAt ?? null,
      lastDepthChartRound: depthChartMetaByTeamId.get(team.id)?.round ?? null,
      lastDepthChartRaceName: depthChartMetaByTeamId.get(team.id)?.raceName ?? null,
      activeAssignments: team.activeAssignments.map((assignment) => ({
        ...assignment,
        driver: {
          ...assignment.driver,
          seasonPoints: pointsByDriverId.get(assignment.driver.id) ?? 0,
          depthPriority:
            depthPriorityByTeamDriver.get(
              `${team.id}:${assignment.driver.id}`,
            ) ?? null,
        },
      })),
    }));

    const teamlessDriversWithPoints = teamlessDrivers.map((driver) => ({
      ...driver,
      seasonPoints: pointsByDriverId.get(driver.id) ?? 0,
    }));

    return {
      success: true,
      data: {
        season: {
          id: season.id,
          name: season.name,
          status: season.status,
          leagueId: season.league.id,
          leagueName: season.league.name,
          teamScoringMode: getSeasonTeamScoringMode(season.pointsSystem),
          rounds: season.races,
        },
        teams: teamsWithDriverPoints,
        teamlessDrivers: teamlessDriversWithPoints,
        totalDrivers:
          teamsWithDriverPoints.reduce(
            (acc, t) => acc + t.activeAssignments.length,
            0,
          ) + teamlessDriversWithPoints.length,
      },
    };
  } catch (error) {
    console.error("Error fetching season drivers:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao buscar pilotos da temporada",
    };
  }
}

// Save depth chart order for a team in a season
export async function saveTeamDepthChart(
  seasonId: string,
  teamId: string,
  driverIdsInPriorityOrder: string[],
  effectiveRound?: number,
) {
  try {

    if (driverIdsInPriorityOrder.length === 0) {
      return { success: false, error: "Informe ao menos um piloto" };
    }

    const uniqueDriverIds = [...new Set(driverIdsInPriorityOrder)];
    if (uniqueDriverIds.length !== driverIdsInPriorityOrder.length) {
      return { success: false, error: "Lista de pilotos contém duplicidades" };
    }

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

    const resolvedRound = await resolveSeasonEffectiveRound(seasonId, effectiveRound);
    if (!resolvedRound.success) {
      return { success: false, error: resolvedRound.error };
    }

    const activeAssignments = await prisma.$queryRaw<
      Array<{ driverId: string }>
    >`
      WITH active_assignments AS (
        SELECT
          "id",
          "driverId",
          "teamId",
          "joinedAt"
        FROM "SeasonTeamAssignment"
        WHERE "seasonId" = ${seasonId}
          AND COALESCE("effectiveFromRound", 1) <= ${resolvedRound.round}
          AND ("effectiveToRound" IS NULL OR "effectiveToRound" >= ${resolvedRound.round})
      ),
      latest_assignments AS (
        SELECT
          aa."driverId",
          aa."teamId",
          ROW_NUMBER() OVER (
            PARTITION BY aa."driverId"
            ORDER BY (aa."teamId" IS NULL) ASC, aa."joinedAt" DESC, aa."id" DESC
          ) AS rn
        FROM active_assignments aa
      )
      SELECT "driverId"
      FROM latest_assignments
      WHERE rn = 1
        AND "teamId" = ${teamId}
    `;

    let activeDriverIds = new Set(activeAssignments.map((a) => a.driverId));
    if (activeDriverIds.size === 0) {
      const currentAssignments = await prisma.$queryRaw<Array<{ driverId: string }>>`
        WITH latest_assignments AS (
          SELECT
            a."driverId",
            a."teamId",
            ROW_NUMBER() OVER (
              PARTITION BY a."driverId"
              ORDER BY (a."teamId" IS NULL) ASC, a."joinedAt" DESC, a."id" DESC
            ) AS rn
          FROM "SeasonTeamAssignment" a
          WHERE a."seasonId" = ${seasonId}
        )
        SELECT "driverId"
        FROM latest_assignments
        WHERE rn = 1
          AND "teamId" = ${teamId}
      `;

      activeDriverIds = new Set(currentAssignments.map((a) => a.driverId));

      if (activeDriverIds.size === 0) {
        return {
          success: false,
          error: `Esta equipe ainda não possui pilotos vinculados para salvar depth chart na rodada ${resolvedRound.round}.`,
        };
      }
    }

    const eligibleDriverIds = driverIdsInPriorityOrder.filter((driverId) =>
      activeDriverIds.has(driverId),
    );

    if (eligibleDriverIds.length === 0) {
      return {
        success: false,
        error: `Nenhum dos pilotos informados está ativo na equipe na rodada ${resolvedRound.round}.`,
      };
    }

    const inactiveDriverIds = driverIdsInPriorityOrder.filter(
      (driverId) => !activeDriverIds.has(driverId),
    );
    if (inactiveDriverIds.length > 0) {
      const inactiveDrivers = await prisma.driver.findMany({
        where: { id: { in: inactiveDriverIds } },
        select: { id: true, currentName: true, uuid: true },
      });

      const inactiveDriverFirstRoundRows = await prisma.$queryRaw<
        Array<{ driverId: string; firstRound: number | null }>
      >`
        SELECT
          "driverId",
          MIN(COALESCE("effectiveFromRound", 1))::int AS "firstRound"
        FROM "SeasonTeamAssignment"
        WHERE "seasonId" = ${seasonId}
          AND "teamId" = ${teamId}
          AND "driverId" IN (${Prisma.join(inactiveDriverIds)})
        GROUP BY "driverId"
      `;

      const labelByDriverId = new Map(
        inactiveDrivers.map((driver) => [
          driver.id,
          driver.currentName || driver.uuid.slice(0, 8),
        ] as const),
      );

      const firstRoundByDriverId = new Map(
        inactiveDriverFirstRoundRows.map((row) => [row.driverId, row.firstRound] as const),
      );

      const labels = inactiveDriverIds.map(
        (driverId) => {
          const name = labelByDriverId.get(driverId) || driverId;
          const firstRound = firstRoundByDriverId.get(driverId);
          return firstRound ? `${name} (desde rodada ${firstRound})` : name;
        },
      );

      console.info(
        `[DepthChart] Ignorando pilotos fora da equipe na rodada ${resolvedRound.round} (season=${seasonId} team=${teamId}): ${labels.join(", ")}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "SeasonTeamDepthChartEntry"
        SET "effectiveToRound" = ${resolvedRound.round - 1}, "updatedAt" = NOW()
        WHERE "seasonId" = ${seasonId}
          AND "teamId" = ${teamId}
          AND "effectiveFromRound" < ${resolvedRound.round}
          AND ("effectiveToRound" IS NULL OR "effectiveToRound" >= ${resolvedRound.round})
      `;

      const values = eligibleDriverIds.map((driverId, index) =>
        Prisma.sql`(${`dc_${seasonId}_${teamId}_${driverId}_${resolvedRound.round}_${index + 1}_${Date.now()}`}, ${seasonId}, ${teamId}, ${driverId}, ${index + 1}, ${resolvedRound.round}, NULL, NOW(), NOW())`,
      );

      await tx.$executeRaw`
        DELETE FROM "SeasonTeamDepthChartEntry"
        WHERE "seasonId" = ${seasonId}
          AND "teamId" = ${teamId}
          AND "effectiveFromRound" = ${resolvedRound.round}
      `;

      if (values.length > 0) {
        await tx.$executeRaw`
          INSERT INTO "SeasonTeamDepthChartEntry"
          ("id", "seasonId", "teamId", "driverId", "priority", "effectiveFromRound", "effectiveToRound", "createdAt", "updatedAt")
          VALUES ${Prisma.join(values)}
        `;
      }
    });

    const reprocessResult = await reprocessSeasonStandings(
      seasonId,
      "DEPTH_CHART_UPDATE",
    );
    if (!reprocessResult.success) {
      return {
        success: false,
        error: reprocessResult.error ?? "Erro ao reprocessar classificação da temporada",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error saving team depth chart:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao salvar depth chart",
    };
  }
}

// Delete season (only if draft and no races)
export async function deleteSeason(seasonId: string) {
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
        _count: {
          select: {
            races: true,
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
      (a) => a.userId === session.user.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    if (season.status !== "DRAFT") {
      return {
        success: false,
        error: "Apenas temporadas em rascunho podem ser deletadas",
      };
    }

    if (season._count.races > 0) {
      return {
        success: false,
        error: "Não é possível deletar temporada com corridas",
      };
    }

    await prisma.season.delete({
      where: { id: seasonId },
    });

    revalidatePath(`/admin/leagues/${season.league.id}/seasons`);

    return { success: true };
  } catch (error) {
    console.error("Error deleting season:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao deletar temporada",
    };
  }
}
