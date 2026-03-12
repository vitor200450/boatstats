"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchPlayerData, fetchPlayerDataByUUID, isValidMinecraftUsername, fetchMojangProfileByUUID, formatUUID } from "@/lib/minecraft-api";

// Create driver from external APIs (Frosthex -> Mojang fallback)
export async function createDriverFromAPI(username: string) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    // Validate username
    if (!isValidMinecraftUsername(username)) {
      return {
        success: false,
        error: "Nome de usuário inválido. Use apenas letras, números e underscore (3-16 caracteres).",
      };
    }

    const normalizedUsername = username.trim();

    // Always resolve through Mojang first — the name is not a reliable identifier,
    // only the UUID is. A player may have renamed (old name stale in DB) or a
    // different player may have taken the same name.
    const playerData = await fetchPlayerData(normalizedUsername);

    if (!playerData) {
      return {
        success: false,
        error: "Jogador não encontrado. Verifique se o nome está correto e se o jogador possui Minecraft Original.",
      };
    }

    // Check if driver exists by UUID — handles both "already exists" and "renamed" cases
    const existingByUUID = await prisma.driver.findUnique({
      where: { uuid: playerData.uuid },
    });

    if (existingByUUID) {
      if (existingByUUID.currentName !== playerData.name) {
        // Name changed in Minecraft — keep DB in sync
        const updated = await prisma.driver.update({
          where: { id: existingByUUID.id },
          data: { currentName: playerData.name },
        });
        return {
          success: true,
          data: updated,
          message: "Nome do piloto atualizado",
        };
      }

      return {
        success: true,
        data: existingByUUID,
        message: "Piloto já existe no sistema",
      };
    }

    // Create new driver
    const driver = await prisma.driver.create({
      data: {
        uuid: playerData.uuid,
        currentName: playerData.name,
        colorCode: playerData.colorCode,
        boatType: playerData.boatType,
        boatMaterial: playerData.boatMaterial,
      },
    });

    // Revalidate any paths that show driver lists
    revalidatePath("/admin/leagues", "layout");

    return {
      success: true,
      data: driver,
      message: `Piloto criado com dados da ${playerData.source === "frosthex" ? "API Frosthex" : "API Mojang"}`,
    };
  } catch (error) {
    console.error("Error creating driver from API:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar piloto",
    };
  }
}

// Get driver by ID or UUID
export async function getDriverById(driverId: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const driver = await prisma.driver.findFirst({
      where: {
        OR: [{ id: driverId }, { uuid: driverId }],
      },
      include: {
        assignments: {
          include: {
            team: {
              include: {
                league: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
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
        roundResults: {
          include: {
            eventRound: {
              include: {
                race: {
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
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!driver) {
      return { success: false, error: "Piloto não encontrado" };
    }

    return { success: true, data: driver };
  } catch (error) {
    console.error("Error fetching driver:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar piloto",
    };
  }
}

// Sync driver data from APIs (re-fetch to update/enrich)
export async function syncDriverFromAPI(driverId: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    // Get current driver data
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return { success: false, error: "Piloto não encontrado" };
    }

    // Try to fetch fresh data from Frosthex API using UUID (more reliable than username)
    const playerData = await fetchPlayerDataByUUID(driver.uuid, driver.currentName || undefined);

    if (!playerData) {
      return {
        success: false,
        error: "Não foi possível buscar dados atualizados. A API pode estar indisponível.",
      };
    }

    // Update driver with new data
    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        currentName: playerData.name,
        colorCode: playerData.colorCode,
        boatType: playerData.boatType,
        boatMaterial: playerData.boatMaterial,
      },
    });

    // Revalidate paths
    revalidatePath("/admin/leagues", "layout");

    return {
      success: true,
      data: updatedDriver,
      message: `Dados sincronizados com ${playerData.source === "frosthex" ? "API Frosthex" : "API Mojang"}`,
      enriched: playerData.source === "frosthex" && !!playerData.colorCode,
    };
  } catch (error) {
    console.error("Error syncing driver:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao sincronizar piloto",
    };
  }
}

// List all drivers with pagination
export async function listDrivers(page: number = 1, limit: number = 50) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const skip = (page - 1) * limit;

    const [drivers, total] = await Promise.all([
      prisma.driver.findMany({
        orderBy: { currentName: "asc" },
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              assignments: true,
              roundResults: true,
            },
          },
        },
      }),
      prisma.driver.count(),
    ]);

    return {
      success: true,
      data: drivers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error("Error listing drivers:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao listar pilotos",
    };
  }
}

// Create driver manually with UUID (for players found via NameMC or other sources)
export async function createDriverManually(uuid: string, currentName?: string) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    // Validate UUID format (basic check)
    const cleanUUID = uuid.replace(/-/g, "");
    if (!/^[a-f0-9]{32}$/i.test(cleanUUID)) {
      return {
        success: false,
        error: "UUID inválido. Formato esperado: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      };
    }

    const formattedUUID = formatUUID(cleanUUID);

    // Check if driver already exists
    const existingByUUID = await prisma.driver.findUnique({
      where: { uuid: formattedUUID },
    });

    if (existingByUUID) {
      return {
        success: true,
        data: existingByUUID,
        message: "Piloto já existe no sistema",
      };
    }

    // Try to fetch current name from Mojang if not provided
    let playerName = currentName;
    if (!playerName) {
      const mojangData = await fetchMojangProfileByUUID(formattedUUID);
      if (mojangData) {
        playerName = mojangData.name;
      } else {
        return {
          success: false,
          error: "Não foi possível verificar o UUID. Verifique se está correto.",
        };
      }
    }

    // Try to fetch enriched data from Frosthex
    const playerData = await fetchPlayerDataByUUID(formattedUUID, playerName);

    if (playerData) {
      // Create driver with enriched data
      const driver = await prisma.driver.create({
        data: {
          uuid: formattedUUID,
          currentName: playerData.name,
          colorCode: playerData.colorCode,
          boatType: playerData.boatType,
          boatMaterial: playerData.boatMaterial,
        },
      });

      revalidatePath("/admin/leagues", "layout");

      return {
        success: true,
        data: driver,
        message: `Piloto criado com dados da ${playerData.source === "frosthex" ? "API Frosthex" : "API Mojang"}`,
      };
    }

    // Fallback: create with just UUID and name
    const driver = await prisma.driver.create({
      data: {
        uuid: formattedUUID,
        currentName: playerName,
      },
    });

    revalidatePath("/admin/leagues", "layout");

    return {
      success: true,
      data: driver,
      message: "Piloto criado com dados básicos",
    };
  } catch (error) {
    console.error("Error creating driver manually:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar piloto",
    };
  }
}

type DriverRow = {
  id: string;
  uuid: string;
  currentName: string | null;
  colorCode: string | null;
  boatType: string | null;
  boatMaterial: string | null;
};

/**
 * Search for a driver by any of their previous names.
 *
 * Only queries the local DB `previousNames[]` array — zero API calls.
 * The Mojang name history endpoint was removed in Sept 2022, so this field
 * is legacy data. Most drivers will have previousNames = [] and won't be
 * found here; the caller should ask the admin to use the current username.
 */
export async function searchDriverByPreviousName(username: string) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const lowerUsername = username.toLowerCase();

    const rows = await prisma.$queryRaw<DriverRow[]>`
      SELECT id, uuid, "currentName", "colorCode", "boatType", "boatMaterial"
      FROM "Driver"
      WHERE ${lowerUsername} = ANY("previousNames")
      LIMIT 1
    `;

    if (rows.length > 0) {
      return buildResult(rows[0], username);
    }

    return {
      success: false,
      error: "Piloto não encontrado no histórico de nomes",
    };
  } catch (error) {
    console.error("Error searching driver by previous name:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar piloto",
    };
  }
}

function buildResult(driver: DriverRow, searchedName: string) {
  return {
    success: true,
    data: {
      driver,
      currentName: driver.currentName || searchedName,
      nameHistory: [] as { name: string }[],
      searchedName,
    },
  };
}

// Search drivers for autocomplete suggestions
export async function searchDriverSuggestions(query: string, limit: number = 5) {
  try {
    if (!query || query.trim().length < 2) {
      return { success: true, data: [] };
    }

    const searchTerm = query.trim();

    // Search by current name or UUID
    const drivers = await prisma.driver.findMany({
      where: {
        OR: [
          { currentName: { contains: searchTerm, mode: "insensitive" } },
          { uuid: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        uuid: true,
        currentName: true,
      },
      take: limit,
      orderBy: { currentName: "asc" },
    });

    return { success: true, data: drivers };
  } catch (error) {
    console.error("Error searching driver suggestions:", error);
    return { success: false, error: "Erro ao buscar sugestões" };
  }
}
