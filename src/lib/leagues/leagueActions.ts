"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { F1_SPRINT_POINTS, F1_STANDARD_POINTS } from "./pointsSystem";
import { buildUniqueLeagueSlug } from "./slug";
import {
  createLeagueSchema,
  updateLeagueSchema,
  CreateLeagueInput,
  UpdateLeagueInput,
} from "@/lib/validations/leagues";

// Helper to check if user has access to a league
async function checkLeagueAccess(leagueId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Não autenticado");
  }

  const user = session.user;

  // Super admin has access to everything
  if (user.role === "SUPER_ADMIN") {
    return { user, hasAccess: true };
  }

  // Check if user is owner or admin of this league
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

// Create a new league with first season
export async function createLeague(data: CreateLeagueInput) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    // Validate input
    const validated = createLeagueSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: "Dados inválidos",
        details: validated.error.flatten(),
      };
    }

    const { name, description, logoUrl, seasonName } = validated.data;

    let league = null;
    const maxSlugAttempts = 5;

    for (let attempt = 0; attempt < maxSlugAttempts; attempt++) {
      const slug = await buildUniqueLeagueSlug(name);

      try {
        // Create league with first season in a transaction
        league = await prisma.$transaction(async (tx) => {
          const newLeague = await tx.league.create({
            data: {
              slug,
              name,
              description,
              logoUrl: logoUrl || null,
              ownerId: session.user!.id,
            } as any,
          });

          // Create first season
          await tx.season.create({
            data: {
              leagueId: newLeague.id,
              name: seasonName,
              year: new Date().getFullYear(),
              status: "DRAFT",
              pointsSystem: {
                ...F1_STANDARD_POINTS,
                rules: {
                  ...F1_STANDARD_POINTS.rules,
                  configuredByAdmin: false,
                },
              } as Prisma.InputJsonValue,
              sprintConfig: {
                defaultMode: "CLASSIFICATION",
                pointsSystem: F1_SPRINT_POINTS,
              } as unknown as Prisma.InputJsonValue,
            },
          });

          return newLeague;
        });

        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          Array.isArray(error.meta?.target) &&
          error.meta.target.includes("slug")
        ) {
          continue;
        }

        throw error;
      }
    }

    if (!league) {
      return {
        success: false,
        error: "Nao foi possivel gerar um slug unico para a liga",
      };
    }

    revalidatePath("/admin/leagues");

    return { success: true, data: league };
  } catch (error) {
    console.error("Error creating league:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar liga",
    };
  }
}

// Get leagues where current user is owner or admin
export async function getMyLeagues() {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const userId = session.user.id;
    const isSuperAdmin = session.user.role === "SUPER_ADMIN";

    const leagues = await prisma.league.findMany({
      where: isSuperAdmin
        ? {}
        : {
            OR: [{ ownerId: userId }, { admins: { some: { userId } } }],
          },
      select: {
        id: true,
        name: true,
        description: true,
        logoUrl: true,
        ownerId: true,
        createdAt: true,
        owner: {
          select: { id: true, name: true, email: true },
        },
        admins: {
          select: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        _count: {
          select: {
            seasons: true,
            teams: true,
          },
        },
        seasons: {
          where: { status: "ACTIVE" },
          take: 1,
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: leagues };
  } catch (error) {
    console.error("Error fetching leagues:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar ligas",
    };
  }
}

// Get league by ID with all related data
export async function getLeagueById(id: string) {
  try {
    await checkLeagueAccess(id);

    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        logoUrl: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: { id: true, name: true, email: true, image: true },
        },
        admins: {
          select: {
            id: true,
            addedAt: true,
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        seasons: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            year: true,
            status: true,
            createdAt: true,
            _count: {
              select: {
                races: true,
                teamAssignments: true,
              },
            },
          },
        },
        teams: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            color: true,
            logoUrl: true,
          },
        },
        _count: {
          select: {
            seasons: true,
            teams: true,
          },
        },
      },
    });

    if (!league) {
      return { success: false, error: "Liga não encontrada" };
    }

    // Calculate unique driver counts for each season
    const seasonsWithCorrectDriverCount = await Promise.all(
      league.seasons.map(async (season) => {
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
          ...season,
          _count: {
            ...season._count,
            teamAssignments: assignedDrivers.length + teamlessDriverCount,
          },
        };
      })
    );

    return { success: true, data: { ...league, seasons: seasonsWithCorrectDriverCount } };
  } catch (error) {
    console.error("Error fetching league:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar liga",
    };
  }
}

// Update league
export async function updateLeague(id: string, data: UpdateLeagueInput) {
  try {
    await checkLeagueAccess(id);

    const validated = updateLeagueSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: "Dados inválidos",
        details: validated.error.flatten(),
      };
    }

    const league = await prisma.league.update({
      where: { id },
      data: validated.data,
    });

    revalidatePath(`/admin/leagues/${id}`);
    revalidatePath("/admin/leagues");

    return { success: true, data: league };
  } catch (error) {
    console.error("Error updating league:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar liga",
    };
  }
}

// Delete league (soft delete could be added later)
export async function deleteLeague(id: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    // Only owner or super admin can delete
    const league = await prisma.league.findFirst({
      where: {
        id,
        OR: [
          { ownerId: session.user.id },
          ...(session.user.role === "SUPER_ADMIN" ? [{}] : []),
        ],
      },
    });

    if (!league) {
      return { success: false, error: "Acesso negado ou liga não encontrada" };
    }

    await prisma.league.delete({
      where: { id },
    });

    revalidatePath("/admin/leagues");

    return { success: true };
  } catch (error) {
    console.error("Error deleting league:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao deletar liga",
    };
  }
}

// Invite admin to league
export async function inviteAdmin(leagueId: string, email: string) {
  try {
    await checkLeagueAccess(leagueId);

    const session = await auth();

    // Find user by email
    const userToAdd = await prisma.user.findUnique({
      where: { email },
    });

    if (!userToAdd) {
      return { success: false, error: "Usuário não encontrado com este email" };
    }

    // Check if already admin
    const existing = await prisma.leagueAdmin.findUnique({
      where: {
        leagueId_userId: {
          leagueId,
          userId: userToAdd.id,
        },
      },
    });

    if (existing) {
      return { success: false, error: "Usuário já é administrador desta liga" };
    }

    // Check if user is owner
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
    });

    if (league?.ownerId === userToAdd.id) {
      return { success: false, error: "Usuário já é proprietário da liga" };
    }

    const admin = await prisma.leagueAdmin.create({
      data: {
        leagueId,
        userId: userToAdd.id,
        addedBy: session?.user?.id,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    revalidatePath(`/admin/leagues/${leagueId}`);
    revalidatePath(`/admin/leagues/${leagueId}/settings`);
    revalidatePath(`/admin/leagues`);

    return { success: true, data: admin };
  } catch (error) {
    console.error("Error inviting admin:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao adicionar admin",
    };
  }
}

// Remove admin from league
export async function removeAdmin(leagueId: string, userId: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    // Only owner or super admin can remove admins
    const league = await prisma.league.findFirst({
      where: {
        id: leagueId,
        OR: [
          { ownerId: session.user.id },
          ...(session.user.role === "SUPER_ADMIN" ? [{}] : []),
        ],
      },
    });

    if (!league) {
      return { success: false, error: "Acesso negado" };
    }

    await prisma.leagueAdmin.delete({
      where: {
        leagueId_userId: {
          leagueId,
          userId,
        },
      },
    });

    revalidatePath(`/admin/leagues/${leagueId}`);
    revalidatePath(`/admin/leagues/${leagueId}/settings`);
    revalidatePath(`/admin/leagues`);

    return { success: true };
  } catch (error) {
    console.error("Error removing admin:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao remover admin",
    };
  }
}
