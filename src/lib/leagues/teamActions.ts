"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  createTeamSchema,
  updateTeamSchema,
  assignDriverSchema,
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
  driverId: string
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

    // Check if driver already has an active assignment in this season
    const existing = await prisma.seasonTeamAssignment.findFirst({
      where: {
        seasonId,
        driverId: driver.id,
        leftAt: null,
      },
    });

    if (existing) {
      if (existing.teamId !== teamId) {
        if (existing.teamId === null && teamId) {
          await prisma.seasonTeamAssignment.update({
            where: { id: existing.id },
            data: { teamId },
          });
          revalidateSeasonPages(seasonId, season.league.id);
          return { success: true };
        }

        // Driver is actively racing for a different team — block the assignment.
        // Use transferDriver to move between teams intentionally.
        const currentTeam = existing.teamId
          ? await prisma.team.findUnique({
              where: { id: existing.teamId },
              select: { name: true },
            })
          : null;
        return {
          success: false,
          error:
            existing.teamId === null
              ? "Piloto já está ativo na temporada sem equipe."
              : `Piloto já está ativo na equipe "${currentTeam?.name ?? existing.teamId}". Use a transferência para movê-lo entre equipes.`,
        };
      }
      // Already active on the same team — idempotent success, nothing to do
    } else {
      await prisma.seasonTeamAssignment.create({
        data: {
          seasonId,
          teamId,
          driverId: driver.id,
        } as unknown as Prisma.SeasonTeamAssignmentUncheckedCreateInput,
      });
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
) {
  return assignDriverToTeam(seasonId, null, driverId);
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
export async function removeDriverFromTeam(assignmentId: string) {
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

    await prisma.seasonTeamAssignment.update({
      where: { id: assignmentId },
      data: { leftAt: new Date() },
    });

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
  newTeamId: string
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

    // Close current assignment
    await prisma.seasonTeamAssignment.update({
      where: { id: currentAssignment.id },
      data: { leftAt: new Date() },
    });

    // Create new assignment
    await prisma.seasonTeamAssignment.create({
      data: {
        seasonId,
        teamId: newTeamId,
        driverId,
      },
    });

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
