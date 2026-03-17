"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { reprocessSeasonStandings } from "@/lib/leagues/importActions";
import {
  createTeamSchema,
  updateTeamSchema,
  CreateTeamInput,
  UpdateTeamInput,
} from "@/lib/validations/leagues";

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

function revalidateSeasonPages(
  seasonId: string,
  leagueId: string,
): void {
  revalidatePath(`/admin/leagues/${leagueId}/seasons/${seasonId}`);
  revalidatePath(`/admin/leagues/${leagueId}/seasons/${seasonId}/drivers`);
  revalidatePath(`/admin/leagues/${leagueId}/seasons/${seasonId}/standings`);
  revalidatePath(`/leagues/${leagueId}`);
}

type SeasonRoundInfo = {
  seasonId: string;
  leagueId: string;
  rounds: Array<{ id: string; round: number; referenceDate: Date }>;
};

async function getSeasonRoundInfo(seasonId: string): Promise<SeasonRoundInfo | null> {
  const seasonRows = await prisma.$queryRaw<
    Array<{
      seasonId: string;
      leagueId: string;
      raceId: string | null;
      round: number | null;
      referenceDate: Date | null;
    }>
  >`
    SELECT
      s."id" AS "seasonId",
      s."leagueId" AS "leagueId",
      r."id" AS "raceId",
      r."round" AS "round",
      COALESCE(r."scheduledDate", r."createdAt") AS "referenceDate"
    FROM "Season" s
    LEFT JOIN "Race" r ON r."seasonId" = s."id"
    WHERE s."id" = ${seasonId}
    ORDER BY r."round" ASC
  `;

  if (seasonRows.length === 0) return null;

  const rounds = seasonRows
    .filter((row) => row.raceId && row.round !== null)
    .map((row) => ({
      id: row.raceId as string,
      round: row.round as number,
      referenceDate: row.referenceDate ?? new Date(),
    }));

  return {
    seasonId: seasonRows[0].seasonId,
    leagueId: seasonRows[0].leagueId,
    rounds,
  };
}

async function resolveEffectiveRound(
  seasonId: string,
  requestedRound?: number,
): Promise<{
  success: boolean;
  error?: string;
  round?: number;
  referenceDate?: Date;
  seasonInfo?: SeasonRoundInfo;
}> {
  const seasonInfo = await getSeasonRoundInfo(seasonId);
  if (!seasonInfo) {
    return { success: false, error: "Temporada não encontrada" };
  }

  if (seasonInfo.rounds.length === 0) {
    const fallbackRound = requestedRound ?? 1;
    return {
      success: true,
      round: fallbackRound,
      referenceDate: new Date(),
      seasonInfo,
    };
  }

  if (requestedRound !== undefined) {
    const selectedRound = seasonInfo.rounds.find((entry) => entry.round === requestedRound);
    if (!selectedRound) {
      return { success: false, error: "Rodada de vigência inválida para esta temporada" };
    }

    return {
      success: true,
      round: selectedRound.round,
      referenceDate: selectedRound.referenceDate,
      seasonInfo,
    };
  }

  const firstRound = seasonInfo.rounds[0];
  return {
    success: true,
    round: firstRound.round,
    referenceDate: firstRound.referenceDate,
    seasonInfo,
  };
}

async function upsertTemporalAssignment(params: {
  seasonId: string;
  driverId: string;
  teamId: string | null;
  effectiveRound: number;
  effectiveDate: Date;
}): Promise<void> {
  const { seasonId, driverId, teamId, effectiveRound, effectiveDate } = params;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "SeasonTeamAssignment"
      SET "leftAt" = "joinedAt"
      WHERE "seasonId" = ${seasonId}
        AND "driverId" = ${driverId}
        AND "effectiveToRound" IS NOT NULL
        AND "leftAt" IS NULL
    `;

    const coveringRows = await tx.$queryRaw<
      Array<{
        id: string;
        effectiveFromRound: number;
        effectiveToRound: number | null;
      }>
    >`
      SELECT "id", "effectiveFromRound", "effectiveToRound"
      FROM "SeasonTeamAssignment"
      WHERE "seasonId" = ${seasonId}
        AND "driverId" = ${driverId}
        AND "effectiveFromRound" <= ${effectiveRound}
        AND ("effectiveToRound" IS NULL OR "effectiveToRound" >= ${effectiveRound})
      ORDER BY "effectiveFromRound" DESC, "joinedAt" DESC, "id" DESC
      LIMIT 1
    `;

    const futureRows = await tx.$queryRaw<
      Array<{ id: string; effectiveFromRound: number; teamId: string | null }>
    >`
      SELECT "id", "effectiveFromRound", "teamId"
      FROM "SeasonTeamAssignment"
      WHERE "seasonId" = ${seasonId}
        AND "driverId" = ${driverId}
        AND "effectiveFromRound" > ${effectiveRound}
      ORDER BY "effectiveFromRound" ASC, "joinedAt" DESC, "id" DESC
    `;

    const rowsToAbsorb = futureRows;
    const nextRound = null;
    const newEffectiveToRound = nextRound ? nextRound - 1 : null;
    const newLeftAt = newEffectiveToRound === null ? null : effectiveDate;

    if (rowsToAbsorb.length > 0) {
      await tx.$executeRaw`
        DELETE FROM "SeasonTeamAssignment"
        WHERE "id" IN (${Prisma.join(rowsToAbsorb.map((row) => row.id))})
      `;
    }

    const sameRoundRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "SeasonTeamAssignment"
      WHERE "seasonId" = ${seasonId}
        AND "driverId" = ${driverId}
        AND "effectiveFromRound" = ${effectiveRound}
      ORDER BY "joinedAt" DESC, "id" DESC
      LIMIT 1
    `;

    if (coveringRows[0] && coveringRows[0].effectiveFromRound < effectiveRound) {
      await tx.$executeRaw`
        UPDATE "SeasonTeamAssignment"
        SET
          "effectiveToRound" = ${effectiveRound - 1},
          "leftAt" = ${effectiveDate}
        WHERE "id" = ${coveringRows[0].id}
      `;
    }

    if (sameRoundRows[0]) {
      await tx.$executeRaw`
        UPDATE "SeasonTeamAssignment"
        SET
          "teamId" = ${teamId},
          "joinedAt" = ${effectiveDate},
          "leftAt" = ${newLeftAt},
          "effectiveToRound" = ${newEffectiveToRound}
        WHERE "id" = ${sameRoundRows[0].id}
      `;

      await tx.$executeRaw`
        DELETE FROM "SeasonTeamAssignment"
        WHERE "seasonId" = ${seasonId}
          AND "driverId" = ${driverId}
          AND "effectiveFromRound" = ${effectiveRound}
          AND "id" <> ${sameRoundRows[0].id}
      `;

    } else {
      try {
        await tx.$executeRaw`
          INSERT INTO "SeasonTeamAssignment"
            ("id", "seasonId", "teamId", "driverId", "joinedAt", "leftAt", "effectiveFromRound", "effectiveToRound")
          VALUES
            (${`asg_${seasonId}_${driverId}_${effectiveRound}_${Date.now()}`}, ${seasonId}, ${teamId}, ${driverId}, ${effectiveDate}, ${newLeftAt}, ${effectiveRound}, ${newEffectiveToRound})
        `;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("23505") || !message.includes("seasonId") || !message.includes("driverId")) {
          throw error;
        }

        const latestRow = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "SeasonTeamAssignment"
          WHERE "seasonId" = ${seasonId}
            AND "driverId" = ${driverId}
          ORDER BY "joinedAt" DESC, "id" DESC
          LIMIT 1
        `;

        if (!latestRow[0]) {
          throw error;
        }

        await tx.$executeRaw`
          UPDATE "SeasonTeamAssignment"
          SET
            "teamId" = ${teamId},
            "joinedAt" = ${effectiveDate},
            "leftAt" = ${newLeftAt},
            "effectiveFromRound" = ${effectiveRound},
            "effectiveToRound" = ${newEffectiveToRound}
          WHERE "id" = ${latestRow[0].id}
        `;
      }

    }
  });
}

// Create a new team in a league
export async function createTeam(leagueId: string, data: CreateTeamInput) {
  try {

    await checkLeagueAccess(leagueId);

    const validated = createTeamSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: "Dados inválidos",
        details: validated.error.flatten(),
      };
    }

    const normalizedName = validated.data.name.trim();
    if (!normalizedName) {
      return {
        success: false,
        error: "Nome da equipe é obrigatório",
      };
    }

    const existingTeam = await prisma.team.findFirst({
      where: {
        leagueId,
        name: {
          equals: normalizedName,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (existingTeam) {
      return {
        success: false,
        error: "Já existe uma equipe com este nome nesta liga",
      };
    }

    const team = await prisma.team.create({
      data: {
        leagueId,
        name: normalizedName,
        color: validated.data.color,
        logoUrl: validated.data.logoUrl,
        logoScale: validated.data.logoScale ?? 1,
        logoPosX: validated.data.logoPosX ?? 0,
        logoPosY: validated.data.logoPosY ?? 0,
      },
    });

    revalidatePath(`/admin/leagues/${leagueId}/teams`);

    return { success: true, data: team };
  } catch (error) {
    console.error("Error creating team:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "Já existe uma equipe com este nome nesta liga",
      };
    }

    return {
      success: false,
      error: "Erro ao criar equipe",
    };
  }
}

type ImportableTeamsByLeague = Array<{
  id: string;
  name: string;
  teams: Array<{
    id: string;
    name: string;
    color: string | null;
    logoUrl: string | null;
    logoScale: number;
    logoPosX: number;
    logoPosY: number;
  }>;
}>;

export async function getImportableTeams(targetLeagueId: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    await checkLeagueAccess(targetLeagueId);

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";

    const leagues = await prisma.league.findMany({
      where: {
        id: { not: targetLeagueId },
        ...(isSuperAdmin
          ? {}
          : {
              OR: [
                { ownerId: session.user.id },
                { admins: { some: { userId: session.user.id } } },
              ],
            }),
      },
      select: {
        id: true,
        name: true,
        teams: {
          orderBy: { name: "asc" },
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
      orderBy: { name: "asc" },
    });

    const leaguesWithTeams: ImportableTeamsByLeague = leagues.filter(
      (league) => league.teams.length > 0,
    );

    return { success: true, data: leaguesWithTeams };
  } catch (error) {
    console.error("Error loading importable teams:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao carregar equipes importáveis",
    };
  }
}

export async function importTeamToLeague(input: {
  targetLeagueId: string;
  sourceTeamId: string;
}) {
  try {

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const targetLeagueId = input.targetLeagueId.trim();
    const sourceTeamId = input.sourceTeamId.trim();

    if (!targetLeagueId || !sourceTeamId) {
      return { success: false, error: "Dados inválidos" };
    }

    await checkLeagueAccess(targetLeagueId);

    const sourceTeam = await prisma.team.findUnique({
      where: { id: sourceTeamId },
      select: {
        id: true,
        leagueId: true,
        name: true,
        color: true,
        logoUrl: true,
        logoScale: true,
        logoPosX: true,
        logoPosY: true,
      },
    });

    if (!sourceTeam) {
      return { success: false, error: "Equipe de origem não encontrada" };
    }

    if (sourceTeam.leagueId === targetLeagueId) {
      return { success: false, error: "Não é possível importar da mesma liga" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";

    if (!isSuperAdmin) {
      const canAccessSourceLeague = await prisma.league.findFirst({
        where: {
          id: sourceTeam.leagueId,
          OR: [
            { ownerId: session.user.id },
            { admins: { some: { userId: session.user.id } } },
          ],
        },
        select: { id: true },
      });

      if (!canAccessSourceLeague) {
        return { success: false, error: "Acesso negado" };
      }
    }

    const existingName = await prisma.team.findFirst({
      where: {
        leagueId: targetLeagueId,
        name: sourceTeam.name,
      },
      select: { id: true },
    });

    if (existingName) {
      return {
        success: false,
        error: "Já existe uma equipe com este nome na liga de destino",
      };
    }

    const importedTeam = await prisma.team.create({
      data: {
        leagueId: targetLeagueId,
        name: sourceTeam.name,
        color: sourceTeam.color,
        logoUrl: sourceTeam.logoUrl,
        logoScale: sourceTeam.logoScale,
        logoPosX: sourceTeam.logoPosX,
        logoPosY: sourceTeam.logoPosY,
      },
    });

    revalidatePath(`/admin/leagues/${targetLeagueId}/teams`);

    return { success: true, data: importedTeam };
  } catch (error) {
    console.error("Error importing team:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "Já existe uma equipe com este nome na liga de destino",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao importar equipe",
    };
  }
}

// Get all teams for a league
export async function getTeams(leagueId: string) {
  try {
    await checkLeagueAccess(leagueId);

    const teams = await prisma.team.findMany({
      where: { leagueId },
      orderBy: { name: "asc" },
      include: {
        assignments: {
          where: { leftAt: null },
          include: {
            driver: true,
            season: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    return { success: true, data: teams };
  } catch (error) {
    console.error("Error fetching teams:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar equipes",
    };
  }
}

// Get team by ID with full history
export async function getTeamById(teamId: string) {
  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        league: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            admins: { select: { userId: true } },
          },
        },
        assignments: {
          include: {
            driver: true,
            season: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
          orderBy: { joinedAt: "desc" },
        },
        standings: {
          include: {
            season: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!team) {
      return { success: false, error: "Equipe não encontrada" };
    }

    // Check access
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = team.league.ownerId === session.user.id;
    const isAdmin = team.league.admins.some(
      (a: { userId: string }) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    return { success: true, data: team };
  } catch (error) {
    console.error("Error fetching team:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar equipe",
    };
  }
}

// Update team
export async function updateTeam(teamId: string, data: UpdateTeamInput) {
  try {

    const team = await prisma.team.findUnique({
      where: { id: teamId },
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

    if (!team) {
      return { success: false, error: "Equipe não encontrada" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = team.league.ownerId === session.user.id;
    const isAdmin = team.league.admins.some(
      (a: { userId: string }) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const validated = updateTeamSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: "Dados inválidos",
        details: validated.error.flatten(),
      };
    }

    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: validated.data,
    });

    revalidatePath(`/admin/leagues/${team.league.id}/teams`);
    revalidatePath(`/admin/leagues/${team.league.id}/teams/${teamId}`);

    return { success: true, data: updatedTeam };
  } catch (error) {
    console.error("Error updating team:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar equipe",
    };
  }
}

// Update team logo display settings
export async function updateTeamLogoSettings(
  teamId: string,
  settings: {
    logoScale?: number;
    logoPosX?: number;
    logoPosY?: number;
  }
) {
  try {

    const team = await prisma.team.findUnique({
      where: { id: teamId },
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

    if (!team) {
      return { success: false, error: "Equipe não encontrada" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = team.league.ownerId === session.user.id;
    const isAdmin = team.league.admins.some(
      (a: { userId: string }) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    // Validate and clamp values
    const validatedSettings = {
      logoScale: settings.logoScale !== undefined
        ? Math.max(0.5, Math.min(3, settings.logoScale))
        : undefined,
      logoPosX: settings.logoPosX !== undefined
        ? Math.max(-50, Math.min(50, settings.logoPosX))
        : undefined,
      logoPosY: settings.logoPosY !== undefined
        ? Math.max(-50, Math.min(50, settings.logoPosY))
        : undefined,
    };

    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: {
        ...(validatedSettings.logoScale !== undefined && { logoScale: validatedSettings.logoScale }),
        ...(validatedSettings.logoPosX !== undefined && { logoPosX: validatedSettings.logoPosX }),
        ...(validatedSettings.logoPosY !== undefined && { logoPosY: validatedSettings.logoPosY }),
      },
    });

    revalidatePath(`/admin/leagues/${team.league.id}/teams`);
    revalidatePath(`/admin/leagues/${team.league.id}/teams/${teamId}`);

    return { success: true, data: updatedTeam };
  } catch (error) {
    console.error("Error updating team logo settings:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar configurações do logo",
    };
  }
}

// Delete team (only if no assignments)
export async function deleteTeam(teamId: string) {
  try {

    const team = await prisma.team.findUnique({
      where: { id: teamId },
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
            assignments: true,
          },
        },
      },
    });

    if (!team) {
      return { success: false, error: "Equipe não encontrada" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = team.league.ownerId === session.user.id;
    const isAdmin = team.league.admins.some(
      (a: { userId: string }) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    if (team._count.assignments > 0) {
      return {
        success: false,
        error: "Não é possível deletar equipe com pilotos vinculados",
      };
    }

    await prisma.team.delete({
      where: { id: teamId },
    });

    revalidatePath(`/admin/leagues/${team.league.id}/teams`);

    return { success: true };
  } catch (error) {
    console.error("Error deleting team:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao deletar equipe",
    };
  }
}

// Assign driver to team for a season
export async function assignDriverToTeam(
  seasonId: string,
  teamId: string | null,
  driverId: string,
  effectiveRound?: number,
) {
  try {

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    // Check if driver exists, if not create
    let driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      // Try to find by UUID
      driver = await prisma.driver.findUnique({
        where: { uuid: driverId },
      });
    }

    if (!driver) {
      return { success: false, error: "Piloto não encontrado" };
    }

    // Get season to check league access
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

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = season.league.ownerId === session.user.id;
    const isAdmin = season.league.admins.some(
      (a) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    if (teamId) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, leagueId: true },
      });

      if (!team || team.leagueId !== season.league.id) {
        return { success: false, error: "Equipe inválida para esta temporada" };
      }
    }

    const resolvedRound = await resolveEffectiveRound(seasonId, effectiveRound);
    if (!resolvedRound.success || resolvedRound.round === undefined || !resolvedRound.referenceDate) {
      return { success: false, error: resolvedRound.error ?? "Rodada de vigência inválida" };
    }

    try {
      await upsertTemporalAssignment({
        seasonId,
        driverId: driver.id,
        teamId,
        effectiveRound: resolvedRound.round,
        effectiveDate: resolvedRound.referenceDate,
      });
    } catch (assignmentError) {
      const message = assignmentError instanceof Error ? assignmentError.message : "";
      const isLegacyUniqueConflict =
        message.includes("23505") &&
        message.includes("seasonId") &&
        message.includes("driverId");

      if (!isLegacyUniqueConflict) {
        throw assignmentError;
      }

      await prisma.$transaction(async (tx) => {
        const latestRow = await tx.$queryRaw<
          Array<{ id: string; effectiveFromRound: number }>
        >`
          SELECT "id", "effectiveFromRound"
          FROM "SeasonTeamAssignment"
          WHERE "seasonId" = ${seasonId}
            AND "driverId" = ${driver.id}
          ORDER BY "joinedAt" DESC, "id" DESC
          LIMIT 1
        `;

        if (!latestRow[0]) {
          throw assignmentError;
        }

        await tx.$executeRaw`
          UPDATE "SeasonTeamAssignment"
          SET
            "teamId" = ${teamId},
            "joinedAt" = ${resolvedRound.referenceDate},
            "leftAt" = NULL,
            "effectiveFromRound" = ${resolvedRound.round},
            "effectiveToRound" = NULL
          WHERE "id" = ${latestRow[0].id}
        `;

        await tx.$executeRaw`
          UPDATE "SeasonTeamAssignment"
          SET
            "leftAt" = COALESCE("leftAt", "joinedAt"),
            "effectiveToRound" = COALESCE(
              "effectiveToRound",
              CASE
                WHEN "effectiveFromRound" < ${resolvedRound.round}
                  THEN ${resolvedRound.round - 1}
                ELSE "effectiveFromRound"
              END
            )
          WHERE "seasonId" = ${seasonId}
            AND "driverId" = ${driver.id}
            AND "id" <> ${latestRow[0].id}
            AND "leftAt" IS NULL
        `;
      });
    }

    const reprocessResult = await reprocessSeasonStandings(seasonId, "MANUAL");
    if (!reprocessResult.success) {
      return {
        success: false,
        error: reprocessResult.error ?? "Erro ao reprocessar classificação da temporada",
      };
    }

    revalidateSeasonPages(seasonId, season.league.id);

    return { success: true };
  } catch (error) {
    console.error("Error assigning driver:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao vincular piloto",
    };
  }
}

export async function assignDriverWithoutTeam(
  seasonId: string,
  driverId: string,
  effectiveRound?: number,
) {
  return assignDriverToTeam(seasonId, null, driverId, effectiveRound);
}

// Search for drivers by UUID or name
export async function searchDrivers(query: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const drivers = await prisma.driver.findMany({
      where: {
        OR: [
          { uuid: { contains: query, mode: "insensitive" } },
          { currentName: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { currentName: "asc" },
    });

    return { success: true, data: drivers };
  } catch (error) {
    console.error("Error searching drivers:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar pilotos",
    };
  }
}

// Remove driver from team (mark as left)
export async function removeDriverFromTeam(
  assignmentId: string,
  effectiveRound?: number,
) {
  try {

    const assignment = await prisma.seasonTeamAssignment.findUnique({
      where: { id: assignmentId },
      include: {
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
    });

    if (!assignment) {
      return { success: false, error: "Vínculo não encontrado" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = assignment.season.league.ownerId === session.user.id;
    const isAdmin = assignment.season.league.admins.some(
      (a) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const resolvedRound = await resolveEffectiveRound(
      assignment.seasonId,
      effectiveRound,
    );
    if (!resolvedRound.success || resolvedRound.round === undefined || !resolvedRound.referenceDate) {
      return { success: false, error: resolvedRound.error ?? "Rodada de vigência inválida" };
    }

    await upsertTemporalAssignment({
      seasonId: assignment.seasonId,
      driverId: assignment.driverId,
      teamId: null,
      effectiveRound: resolvedRound.round,
      effectiveDate: resolvedRound.referenceDate,
    });

    const reprocessResult = await reprocessSeasonStandings(
      assignment.seasonId,
      "REMOVE_DRIVER",
    );
    if (!reprocessResult.success) {
      return {
        success: false,
        error: reprocessResult.error ?? "Erro ao reprocessar classificação da temporada",
      };
    }

    revalidateSeasonPages(
      assignment.seasonId,
      assignment.season.league.id,
    );

    return { success: true };
  } catch (error) {
    console.error("Error removing driver:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao remover piloto",
    };
  }
}

// Transfer driver to another team
export async function transferDriver(
  seasonId: string,
  driverId: string,
  newTeamId: string | null,
  effectiveRound?: number,
) {
  try {

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    // Get current active assignment
    const currentAssignment = await prisma.seasonTeamAssignment.findFirst({
      where: {
        seasonId,
        driverId,
        leftAt: null,
      },
      include: {
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
    });

    if (!currentAssignment) {
      return { success: false, error: "Piloto não está vinculado a nenhuma equipe" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = currentAssignment.season.league.ownerId === session.user.id;
    const isAdmin = currentAssignment.season.league.admins.some(
      (a) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    if (newTeamId) {
      const targetTeam = await prisma.team.findUnique({
        where: { id: newTeamId },
        select: { id: true, leagueId: true },
      });

      if (!targetTeam || targetTeam.leagueId !== currentAssignment.season.league.id) {
        return { success: false, error: "Equipe de destino inválida para esta temporada" };
      }
    }

    const resolvedRound = await resolveEffectiveRound(seasonId, effectiveRound);
    if (!resolvedRound.success || resolvedRound.round === undefined || !resolvedRound.referenceDate) {
      return { success: false, error: resolvedRound.error ?? "Rodada de vigência inválida" };
    }

    await upsertTemporalAssignment({
      seasonId,
      driverId,
      teamId: newTeamId,
      effectiveRound: resolvedRound.round,
      effectiveDate: resolvedRound.referenceDate,
    });

    const reprocessResult = await reprocessSeasonStandings(seasonId, "TRANSFER");
    if (!reprocessResult.success) {
      return {
        success: false,
        error: reprocessResult.error ?? "Erro ao reprocessar classificação da temporada",
      };
    }

    const leagueId = currentAssignment.season.league.id;
    revalidateSeasonPages(seasonId, leagueId);

    return { success: true };
  } catch (error) {
    console.error("Error transferring driver:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao transferir piloto",
    };
  }
}

// Get team assignments for a season
export async function getTeamAssignments(seasonId: string, teamId?: string) {
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
      (a) => a.userId === session.user!.id
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const assignments = await prisma.seasonTeamAssignment.findMany({
      where: {
        seasonId,
        ...(teamId ? { teamId } : {}),
      },
      include: {
        driver: true,
        team: true,
      },
      orderBy: { joinedAt: "desc" },
    });

    return { success: true, data: assignments };
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar vínculos",
    };
  }
}
