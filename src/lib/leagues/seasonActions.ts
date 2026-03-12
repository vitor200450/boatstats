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
import { calculateStandings } from "@/lib/leagues/importActions";

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
      Array<{ teamId: string; driverId: string; priority: number }>
    >`
      SELECT "teamId", "driverId", "priority"
      FROM "SeasonTeamDepthChartEntry"
      WHERE "seasonId" = ${seasonId}
      ORDER BY "teamId" ASC, "priority" ASC
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
          })),
        });
      }

      if (depthChartEntries.length > 0) {
        for (const entry of depthChartEntries) {
          await prisma.$executeRaw`
            INSERT INTO "SeasonTeamDepthChartEntry"
            ("seasonId", "teamId", "driverId", "priority", "createdAt", "updatedAt")
            VALUES (${clonedSeasonId}, ${entry.teamId}, ${entry.driverId}, ${entry.priority}, NOW(), NOW())
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

    await calculateStandings(clonedSeason.id);

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

    // Group assignments by team
    const teamsWithDrivers = season.league.teams.map((team) => ({
      ...team,
      activeAssignments: team.assignments.filter((a) => !a.leftAt),
    }));

    // Find drivers who participated in this season's races but have no team assignment
    const assignedDriverIds = new Set(
      season.league.teams.flatMap((t) =>
        t.assignments.filter((a) => !a.leftAt).map((a) => a.driverId)
      )
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

    const teamlessAssignments = await prisma.$queryRaw<
      Array<{
        id: string;
        uuid: string;
        currentName: string | null;
        colorCode: string | null;
        boatType: string | null;
        boatMaterial: string | null;
        previousNames: string[];
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT
        d."id",
        d."uuid",
        d."currentName",
        d."colorCode",
        d."boatType",
        d."boatMaterial",
        d."previousNames",
        d."createdAt",
        d."updatedAt"
      FROM "SeasonTeamAssignment" a
      INNER JOIN "Driver" d ON d."id" = a."driverId"
      WHERE a."seasonId" = ${seasonId}
        AND a."teamId" IS NULL
        AND a."leftAt" IS NULL
      ORDER BY d."currentName" ASC, d."uuid" ASC
    `;

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
      Array<{ teamId: string; driverId: string; priority: number }>
    >`
      SELECT "teamId", "driverId", "priority"
      FROM "SeasonTeamDepthChartEntry"
      WHERE "seasonId" = ${seasonId}
    `;

    const depthPriorityByTeamDriver = new Map(
      depthChartEntries.map((entry) => [
        `${entry.teamId}:${entry.driverId}`,
        entry.priority,
      ]),
    );

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

    const activeAssignments = await prisma.seasonTeamAssignment.findMany({
      where: {
        seasonId,
        teamId,
        leftAt: null,
      },
      select: { driverId: true },
    });

    const activeDriverIds = new Set(activeAssignments.map((a) => a.driverId));
    for (const driverId of driverIdsInPriorityOrder) {
      if (!activeDriverIds.has(driverId)) {
        return {
          success: false,
          error: "Lista contém piloto que não está ativo nesta equipe",
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM "SeasonTeamDepthChartEntry"
        WHERE "seasonId" = ${seasonId} AND "teamId" = ${teamId}
      `;

      const values = driverIdsInPriorityOrder.map((driverId, index) =>
        Prisma.sql`(${`dc_${seasonId}_${teamId}_${driverId}_${index + 1}`}, ${seasonId}, ${teamId}, ${driverId}, ${index + 1}, NOW(), NOW())`,
      );

      if (values.length > 0) {
        await tx.$executeRaw`
          INSERT INTO "SeasonTeamDepthChartEntry"
          ("id", "seasonId", "teamId", "driverId", "priority", "createdAt", "updatedAt")
          VALUES ${Prisma.join(values)}
        `;
      }
    });

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
