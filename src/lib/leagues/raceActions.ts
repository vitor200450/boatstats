"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { getEventResults, FrosthexEventResultResponse } from "@/services/frosthexAPI";
import { calculatePoints, F1_STANDARD_POINTS, PointsSystem } from "@/lib/leagues/pointsSystem";
import {
  getSeasonSprintConfig,
  resolveRoundPointsSystem,
  validateSpecialRoundConfig,
} from "@/lib/leagues/roundRules";
import {
  getDriverFastestLapTime,
  getFastestLapWinnerUuid,
} from "@/lib/leagues/fastestLap";
import {
  getReverseGridPoleWinnerUuidFromEvent,
  getRoundHeatFromEventCache,
} from "@/lib/leagues/importHelpers";
import { reprocessSeasonStandings } from "@/lib/leagues/importActions";
import { getSeasonReverseGridConfig, isRaceRound } from "@/lib/leagues/reverseGrid";
import {
  createRaceSchema,
  updateRaceSchema,
  configureRoundSchema,
  manualFinalRoundEditSchema,
  createManualFinalRoundSchema,
  addManualRoundDriverSchema,
  CreateRaceInput,
  UpdateRaceInput,
  ConfigureRoundInput,
  ManualFinalRoundEditInput,
  CreateManualFinalRoundInput,
  AddManualRoundDriverInput,
} from "@/lib/validations/leagues";
import {
  normalizeRaceImportBonuses,
  type RaceImportBonusInput,
} from "@/lib/leagues/raceImportBonus";

// Helper to check season access
async function checkSeasonAccess(seasonId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Não autenticado");
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
    throw new Error("Temporada não encontrada");
  }

  const user = session.user;
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isOwner = season.league.ownerId === user.id;
  const isAdmin = season.league.admins.some((a) => a.userId === user.id);

  if (!isSuperAdmin && !isOwner && !isAdmin) {
    throw new Error("Acesso negado");
  }

  return { user, season, leagueId: season.league.id };
}

function parseFrosthexEventDate(
  value: number | string | null | undefined,
): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string" && Number.isNaN(Number(value))) {
    const parsedIso = new Date(value);
    return Number.isNaN(parsedIso.getTime()) ? null : parsedIso;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;

  const timestamp =
    numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000;
  const parsed = new Date(timestamp);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isQualifyingLikeRound(round: {
  apiRoundName: string;
  apiRoundType: string;
}): boolean {
  if (/QUAL|CLASSIF/i.test(round.apiRoundType)) return true;
  return /qualy|quali|qualifying|classifica|\bQ\d+\b/i.test(
    round.apiRoundName.trim(),
  );
}

function isManualFinalRound(round: {
  origin?: string | null;
  manualKind?: string | null;
}): boolean {
  return round.origin === "MANUAL" && round.manualKind === "FINAL";
}

function normalizeManualRoundMeta(
  row: Record<string, unknown> | null | undefined,
): { origin: string | null; manualKind: string | null } {
  if (!row) {
    return { origin: null, manualKind: null };
  }

  const originRaw = row.origin;
  const manualKindRaw = row.manualKind ?? row.manualkind;

  return {
    origin: typeof originRaw === "string" ? originRaw : null,
    manualKind: typeof manualKindRaw === "string" ? manualKindRaw : null,
  };
}

function isMissingRaceResultBonusTableError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2010") {
    return false;
  }

  const message = String((error.meta as { message?: string } | undefined)?.message ?? "");
  return message.includes("RaceResultBonus") && message.includes("does not exist");
}

export type ImportRaceResultsOptions = {
  bonuses?: RaceImportBonusInput[];
  reason?: string;
};

// Create a new race for a season
export async function createRace(seasonId: string, data: CreateRaceInput) {
  try {

    const { leagueId } = await checkSeasonAccess(seasonId);

    const validated = createRaceSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: "Dados inválidos",
        details: validated.error.flatten(),
      };
    }

    // Check if round number already exists
    const existing = await prisma.race.findUnique({
      where: {
        seasonId_round: {
          seasonId,
          round: validated.data.round,
        },
      },
    });

    if (existing) {
      return {
        success: false,
        error: `Já existe uma corrida na rodada ${validated.data.round}`,
      };
    }

    const race = await prisma.race.create({
      data: {
        seasonId,
        name: validated.data.name,
        round: validated.data.round,
        trackApiName: validated.data.trackApiName,
        scheduledDate: validated.data.scheduledDate
          ? new Date(validated.data.scheduledDate)
          : undefined,
        reverseGridEnabled: validated.data.reverseGridEnabled ?? false,
        status: "SCHEDULED",
      } as Prisma.RaceUncheckedCreateInput,
    });

    revalidatePath(`/admin/leagues/${leagueId}/seasons/${seasonId}/races`);

    return { success: true, data: race };
  } catch (error) {
    console.error("Error creating race:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar corrida",
    };
  }
}

// Get all races for a season
export async function getRaces(seasonId: string) {
  try {
    await checkSeasonAccess(seasonId);

    const races = await prisma.race.findMany({
      where: { seasonId },
      orderBy: { round: "asc" },
      include: {
        eventRounds: {
          orderBy: { apiRoundName: "asc" },
        },
        _count: {
          select: {
            eventRounds: true,
          },
        },
      },
    });

    return { success: true, data: races };
  } catch (error) {
    console.error("Error fetching races:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar corridas",
    };
  }
}

// Get race by ID with rounds
export async function getRaceById(raceId: string) {
  try {
    const race = await prisma.race.findUnique({
      where: { id: raceId },
      include: {
        season: {
          include: {
            league: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                admins: { select: { userId: true } },
              },
            },
          },
        },
        eventRounds: {
          include: {
            results: {
              include: {
                driver: true,
              },
              orderBy: { position: "asc" },
            },
          },
          orderBy: { apiRoundName: "asc" },
        },
      },
    });

    if (!race) {
      return { success: false, error: "Corrida não encontrada" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = race.season.league.ownerId === session.user.id;
    const isAdmin = race.season.league.admins.some((a) => a.userId === session.user!.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    return { success: true, data: race };
  } catch (error) {
    console.error("Error fetching race:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar corrida",
    };
  }
}

export async function saveRaceTeamRoster(
  seasonId: string,
  raceId: string,
  teamId: string,
  mainDriverIds: string[],
  reserveDriverIds: string[],
  effectiveRound?: number,
) {
  try {

    const { leagueId } = await checkSeasonAccess(seasonId);

    const uniqueMain = [...new Set(mainDriverIds)];
    const uniqueReserve = [...new Set(reserveDriverIds)];

    if (uniqueMain.length !== mainDriverIds.length) {
      return { success: false, error: "Pilotos principais duplicados" };
    }

    if (uniqueReserve.length !== reserveDriverIds.length) {
      return { success: false, error: "Pilotos reserva duplicados" };
    }

    if (uniqueMain.length > 3) {
      return { success: false, error: "Máximo de 3 pilotos principais" };
    }

    if (uniqueReserve.length > 2) {
      return { success: false, error: "Máximo de 2 pilotos reservas" };
    }

    const overlap = uniqueMain.some((driverId) => uniqueReserve.includes(driverId));
    if (overlap) {
      return {
        success: false,
        error: "Um mesmo piloto não pode ser principal e reserva",
      };
    }

    const race = await prisma.race.findFirst({
      where: { id: raceId, seasonId },
      select: { id: true, status: true, round: true },
    });

    if (!race) {
      return { success: false, error: "Corrida não encontrada" };
    }

    const targetRound = effectiveRound ?? race.round;
    if (!Number.isInteger(targetRound) || targetRound < 1) {
      return { success: false, error: "Rodada de vigência inválida" };
    }

    const targetRoundRace = await prisma.race.findFirst({
      where: { seasonId, round: targetRound },
      select: { id: true },
    });
    if (!targetRoundRace) {
      return { success: false, error: "Rodada de vigência inválida" };
    }

    const targetRaces = await prisma.race.findMany({
      where: {
        seasonId,
        round: { gte: targetRound },
      },
      select: { id: true, round: true },
      orderBy: { round: "asc" },
    });

    if (targetRaces.length === 0) {
      return { success: false, error: "Rodada de vigência inválida" };
    }

    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        league: {
          seasons: {
            some: { id: seasonId },
          },
        },
      },
      select: { id: true },
    });

    if (!team) {
      return { success: false, error: "Equipe inválida para esta temporada" };
    }

    const allRosterDriverIds = [...uniqueMain, ...uniqueReserve];
    const activeAssignments = await prisma.$queryRaw<Array<{ driverId: string }>>`
      WITH active_assignments AS (
        SELECT
          "id",
          "driverId",
          "teamId",
          "joinedAt"
        FROM "SeasonTeamAssignment"
        WHERE "seasonId" = ${seasonId}
          AND COALESCE("effectiveFromRound", 1) <= ${targetRound}
          AND ("effectiveToRound" IS NULL OR "effectiveToRound" >= ${targetRound})
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

    const activeSet = new Set(activeAssignments.map((a) => a.driverId));
    for (const driverId of allRosterDriverIds) {
      if (!activeSet.has(driverId)) {
        return {
          success: false,
          error: "Roster contém piloto que não está ativo na equipe",
        };
      }
    }

    if (allRosterDriverIds.length > 0) {
      const targetRaceIds = targetRaces.map((entry) => entry.id);
      const conflictingRosterRows = await prisma.$queryRaw<
        Array<{ driverId: string; teamId: string }>
      >`
        SELECT i."driverId", r."teamId"
        FROM "SeasonRaceTeamRoster" r
        INNER JOIN "SeasonRaceTeamRosterItem" i ON i."rosterId" = r."id"
        WHERE r."seasonId" = ${seasonId}
          AND r."raceId" IN (${Prisma.join(targetRaceIds)})
          AND r."teamId" <> ${teamId}
          AND i."driverId" IN (${Prisma.join(allRosterDriverIds)})
      `;

      if (conflictingRosterRows.length > 0) {
        return {
          success: false,
          error:
            "Roster inválido: há piloto já registrado em outra equipe nesta corrida",
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const targetRace of targetRaces) {
        await tx.$executeRaw`
          DELETE FROM "SeasonRaceTeamRosterItem"
          WHERE "rosterId" IN (
            SELECT "id" FROM "SeasonRaceTeamRoster"
            WHERE "seasonId" = ${seasonId}
              AND "raceId" = ${targetRace.id}
              AND "teamId" = ${teamId}
          )
        `;

        await tx.$executeRaw`
          DELETE FROM "SeasonRaceTeamRoster"
          WHERE "seasonId" = ${seasonId}
            AND "raceId" = ${targetRace.id}
            AND "teamId" = ${teamId}
        `;

        if (allRosterDriverIds.length > 0) {
          const rosterId = `${seasonId}_${targetRace.id}_${teamId}`;

          await tx.$executeRaw`
            INSERT INTO "SeasonRaceTeamRoster"
              ("id", "seasonId", "raceId", "teamId", "createdAt", "updatedAt")
            VALUES
              (${rosterId}, ${seasonId}, ${targetRace.id}, ${teamId}, NOW(), NOW())
          `;

          for (let i = 0; i < uniqueMain.length; i++) {
            const driverId = uniqueMain[i];
            await tx.$executeRaw`
              INSERT INTO "SeasonRaceTeamRosterItem"
                ("id", "rosterId", "driverId", "role", "priority", "createdAt", "updatedAt")
              VALUES
                (${`${rosterId}_main_${driverId}_${i + 1}`}, ${rosterId}, ${driverId}, CAST('MAIN' AS "RosterDriverRole"), ${i + 1}, NOW(), NOW())
            `;
          }

          for (let i = 0; i < uniqueReserve.length; i++) {
            const driverId = uniqueReserve[i];
            await tx.$executeRaw`
              INSERT INTO "SeasonRaceTeamRosterItem"
                ("id", "rosterId", "driverId", "role", "priority", "createdAt", "updatedAt")
              VALUES
                (${`${rosterId}_reserve_${driverId}_${i + 1}`}, ${rosterId}, ${driverId}, CAST('RESERVE' AS "RosterDriverRole"), ${i + 1}, NOW(), NOW())
            `;
          }
        }
      }
    });

    await reprocessSeasonStandings(seasonId, "RACE_UPDATE");

    revalidatePath(`/admin/leagues/${leagueId}/seasons/${seasonId}/races/${raceId}`);
    revalidatePath(`/admin/leagues/${leagueId}/seasons/${seasonId}/standings`);
    revalidatePath(`/admin/leagues/${leagueId}/seasons/${seasonId}`);
    revalidatePath(`/leagues/${leagueId}`);

    return { success: true };
  } catch (error) {
    console.error("Error saving race roster:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao salvar roster",
    };
  }
}

// Update race
export async function updateRace(raceId: string, data: UpdateRaceInput) {
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

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = race.season.league.ownerId === session.user.id;
    const isAdmin = race.season.league.admins.some((a) => a.userId === session.user!.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const validated = updateRaceSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: "Dados inválidos",
        details: validated.error.flatten(),
      };
    }

    const updateData: Prisma.RaceUpdateInput = {};
    if (validated.data.name !== undefined)
      updateData.name = validated.data.name;
    if (validated.data.trackApiName !== undefined)
      updateData.trackApiName = validated.data.trackApiName;
    if (validated.data.scheduledDate !== undefined) {
      updateData.scheduledDate = validated.data.scheduledDate
        ? new Date(validated.data.scheduledDate)
        : null;
    }
    if (validated.data.reverseGridEnabled !== undefined) {
      (updateData as Record<string, unknown>).reverseGridEnabled =
        validated.data.reverseGridEnabled;
    }

    // Check round uniqueness if changing
    if (
      validated.data.round !== undefined &&
      validated.data.round !== race.round
    ) {
      const existing = await prisma.race.findUnique({
        where: {
          seasonId_round: {
            seasonId: race.season.id,
            round: validated.data.round,
          },
        },
      });

      if (existing) {
        return {
          success: false,
          error: `Já existe uma corrida na rodada ${validated.data.round}`,
        };
      }

      updateData.round = validated.data.round;
    }

    const updatedRace = await prisma.race.update({
      where: { id: raceId },
      data: updateData,
    });

    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/races`,
    );
    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/races/${raceId}`,
    );

    return { success: true, data: updatedRace };
  } catch (error) {
    console.error("Error updating race:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao atualizar corrida",
    };
  }
}

// Delete race
export async function deleteRace(raceId: string) {
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
        _count: {
          select: {
            eventRounds: true,
          },
        },
      },
    });

    if (!race) {
      return { success: false, error: "Corrida não encontrada" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = race.season.league.ownerId === session.user.id;
    const isAdmin = race.season.league.admins.some((a) => a.userId === session.user!.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    if (race._count.eventRounds > 0) {
      return {
        success: false,
        error: "Não é possível deletar corrida com rounds importados",
      };
    }

    await prisma.race.delete({
      where: { id: raceId },
    });

    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/races`,
    );

    return { success: true };
  } catch (error) {
    console.error("Error deleting race:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao deletar corrida",
    };
  }
}

// Reorder races (update round numbers)
export async function reorderRaces(seasonId: string, raceIds: string[]) {
  try {

    const { leagueId } = await checkSeasonAccess(seasonId);

    // Update each race with new round number
    await prisma.$transaction(
      raceIds.map((raceId, index) =>
        prisma.race.update({
          where: { id: raceId },
          data: { round: index + 1 },
        }),
      ),
    );

    revalidatePath(`/admin/leagues/${leagueId}/seasons/${seasonId}/races`);

    return { success: true };
  } catch (error) {
    console.error("Error reordering races:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao reordenar corridas",
    };
  }
}

// Link API event to race (parses rounds)
export async function linkApiEvent(raceId: string, apiEventId: string) {
  try {

    const normalizedEventId = apiEventId.trim();
    if (!normalizedEventId) {
      return { success: false, error: "Informe um ID de evento válido" };
    }

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

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = race.season.league.ownerId === session.user.id;
    const isAdmin = race.season.league.admins.some((a) => a.userId === session.user!.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const raceUsingSameEvent = await prisma.race.findFirst({
      where: {
        apiEventId: normalizedEventId,
        NOT: { id: raceId },
      },
      select: {
        name: true,
        season: {
          select: {
            name: true,
            league: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (raceUsingSameEvent) {
      return {
        success: false,
        error: `Este evento da API já está vinculado à corrida "${raceUsingSameEvent.name}" da temporada "${raceUsingSameEvent.season.name}" (${raceUsingSameEvent.season.league.name}). Desvincule lá primeiro para reutilizar o mesmo evento.`,
      };
    }

    // Fetch event data from Frosthex API
    let eventData;
    try {
      eventData = await getEventResults(normalizedEventId);
    } catch {
      return {
        success: false,
        error: `Evento "${normalizedEventId}" não encontrado na API FrostHex. Verifique o ID e tente novamente.`,
      };
    }

    if (!eventData || !Array.isArray(eventData.rounds) || eventData.rounds.length === 0) {
      return {
        success: false,
        error:
          "Evento encontrado, mas sem rodadas válidas para vincular. Verifique se o ID está correto.",
      };
    }

    const eventDate = parseFrosthexEventDate(eventData.date);

    // Save event ID, cache raw response, and create EventRound records
    await prisma.$transaction(async (tx) => {
      await tx.race.update({
        where: { id: raceId },
        data: {
          apiEventId: normalizedEventId,
          apiEventCache: eventData as unknown as Prisma.InputJsonValue,
          status: "PENDING",
          trackApiName: eventData.track_name || undefined,
          scheduledDate: race.scheduledDate ?? eventDate ?? undefined,
        },
      });

      for (const round of eventData.rounds) {
        // Auto-select the last heat of each round (usually the final/deciding heat)
        const lastHeat = round.heats.at(-1);
        const targetHeatName = lastHeat?.name ?? null;
        const status = targetHeatName ? "CONFIGURED" : "PENDING";

        // Qualifying rounds don't count for standings by default
        const isQualifying = /qualy|quali|qualifying/i.test(round.name);

        await tx.eventRound.upsert({
          where: { raceId_apiRoundName: { raceId, apiRoundName: round.name } },
        create: {
          raceId,
          apiRoundName: round.name,
          apiRoundType: round.type,
          targetHeatName,
          status,
          countsForStandings: !isQualifying,
          specialType: "NONE",
          sprintMode: null,
        },
        update: {
          apiRoundType: round.type,
          targetHeatName,
          status,
          },
        });
      }
    });

    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/races/${raceId}`,
    );

    return { success: true };
  } catch (error) {
    console.error("Error linking API event:", error);

    const prismaError = error as { code?: string; meta?: { target?: unknown } };
    const target = Array.isArray(prismaError.meta?.target)
      ? prismaError.meta?.target
      : [];
    if (prismaError.code === "P2002" && target.includes("apiEventId")) {
      return {
        success: false,
        error:
          "Este evento da API já está vinculado a outra corrida. Desvincule o evento da corrida anterior antes de reutilizá-lo.",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao vincular evento da API",
    };
  }
}

// Unlink API event
export async function unlinkApiEvent(raceId: string) {
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
        eventRounds: true,
      },
    });

    if (!race) {
      return { success: false, error: "Corrida não encontrada" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = race.season.league.ownerId === session.user.id;
    const isAdmin = race.season.league.admins.some((a) => a.userId === session.user!.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    // Check if any imported result rows exist for this race
    const eventRoundIds = race.eventRounds.map((r) => r.id);
    const importedResultsCount = eventRoundIds.length
      ? await prisma.roundResult.count({
          where: { eventRoundId: { in: eventRoundIds } },
        })
      : 0;

    if (importedResultsCount > 0) {
      return {
        success: false,
        error: "Não é possível desvincular evento com resultados importados",
      };
    }

    // Delete event rounds and unlink
    await prisma.$transaction([
      prisma.eventRound.deleteMany({
        where: { raceId },
      }),
      prisma.race.update({
        where: { id: raceId },
        data: {
          apiEventId: null,
          apiEventCache: Prisma.DbNull,
          status: "SCHEDULED",
        },
      }),
    ]);

    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/races/${raceId}`,
    );

    return { success: true };
  } catch (error) {
    console.error("Error unlinking API event:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao desvincular evento",
    };
  }
}

// Configure an event round
export async function configureRound(
  roundId: string,
  data: ConfigureRoundInput,
) {
  try {

    const round = await prisma.eventRound.findUnique({
      where: { id: roundId },
      include: {
        race: {
          include: {
            season: {
              select: {
                id: true,
                pointsSystem: true,
                sprintConfig: true,
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

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = round.race.season.league.ownerId === session.user.id;
    const isAdmin = round.race.season.league.admins.some((a) => a.userId === session.user!.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const validated = configureRoundSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: "Dados inválidos",
        details: validated.error.flatten(),
      };
    }

    const updateData: Prisma.EventRoundUpdateInput = {};
    if (validated.data.targetHeatName !== undefined) {
      updateData.targetHeatName = validated.data.targetHeatName;
    }
    if (validated.data.pointsSystem !== undefined) {
      updateData.pointsSystem = validated.data.pointsSystem as Prisma.InputJsonValue;
    }
    if (validated.data.countsForStandings !== undefined) {
      updateData.countsForStandings = validated.data.countsForStandings;
    }
    if (validated.data.specialType !== undefined) {
      updateData.specialType = validated.data.specialType;
    }
    if (validated.data.sprintMode !== undefined) {
      updateData.sprintMode = validated.data.sprintMode;
    }

    const nextSpecialType =
      validated.data.specialType !== undefined
        ? validated.data.specialType
        : round.specialType;
    const nextSprintMode =
      validated.data.sprintMode !== undefined
        ? validated.data.sprintMode
        : round.sprintMode;

    const specialValidation = validateSpecialRoundConfig({
      specialType: nextSpecialType,
      sprintMode: nextSprintMode,
    });
    if (!specialValidation.valid) {
      return { success: false, error: specialValidation.error || "Configuração inválida" };
    }

    if (nextSpecialType === "SPRINT") {
      const existingSprint = await prisma.eventRound.findFirst({
        where: {
          raceId: round.raceId,
          specialType: "SPRINT",
          NOT: { id: round.id },
        },
        select: { id: true },
      });

      if (existingSprint) {
        return {
          success: false,
          error: "Esta corrida já possui uma rodada sprint",
        };
      }

      updateData.countsForStandings = nextSprintMode === "POINTS";
    } else if (nextSpecialType === "NONE") {
      updateData.sprintMode = null;
    }

    // Update status to CONFIGURED if all required fields are set
    if (updateData.targetHeatName) {
      updateData.status = "CONFIGURED";
    }

    const updatedRound = await prisma.eventRound.update({
      where: { id: roundId },
      data: updateData,
    });

    const existingResultsCount = await prisma.roundResult.count({
      where: { eventRoundId: roundId },
    });

    if (existingResultsCount > 0) {
      const seasonPointsSystem =
        ((round.race.season.pointsSystem as unknown) as PointsSystem | null) ??
        F1_STANDARD_POINTS;
      const seasonSprintConfig = getSeasonSprintConfig(
        round.race.season.sprintConfig,
      );
      const previousEffectivePointsSystem = resolveRoundPointsSystem(
        round,
        seasonPointsSystem,
        seasonSprintConfig,
      );
      const effectiveRoundConfig = {
        specialType: nextSpecialType,
        sprintMode: nextSpecialType === "NONE" ? null : nextSprintMode,
        pointsSystem:
          validated.data.pointsSystem !== undefined
            ? validated.data.pointsSystem
            : round.pointsSystem,
        countsForStandings:
          nextSpecialType === "SPRINT"
            ? nextSprintMode === "POINTS"
            : validated.data.countsForStandings !== undefined
              ? validated.data.countsForStandings
              : round.countsForStandings,
      };

      const effectivePointsSystem = resolveRoundPointsSystem(
        effectiveRoundConfig,
        seasonPointsSystem,
        seasonSprintConfig,
      );

      const previousPolicySignature = previousEffectivePointsSystem
        ? JSON.stringify(previousEffectivePointsSystem)
        : "none";
      const nextPolicySignature = effectivePointsSystem
        ? JSON.stringify(effectivePointsSystem)
        : "none";
      const scoringPolicyChanged =
        previousPolicySignature !== nextPolicySignature;

      if (scoringPolicyChanged) {
        if (!effectivePointsSystem) {
          await prisma.roundResult.updateMany({
            where: { eventRoundId: roundId },
            data: { points: 0 },
          });
        } else {
          await prisma.$transaction(async (tx) => {
            await recalculateRoundPointsWithDSQ(tx, roundId, effectivePointsSystem);
          });
        }

        await reprocessSeasonStandings(round.race.season.id, "RACE_UPDATE");
        revalidatePath(
          `/admin/leagues/${round.race.season.league.id}/seasons/${round.race.season.id}/standings`,
        );
      }
    }

    revalidatePath(
      `/admin/leagues/${round.race.season.league.id}/seasons/${round.race.season.id}/races/${round.raceId}`,
    );

    return { success: true, data: updatedRound };
  } catch (error) {
    console.error("Error configuring round:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao configurar round",
    };
  }
}

// Import race results from cached API data and compute standings
export async function importRaceResults(
  raceId: string,
  options?: ImportRaceResultsOptions,
) {
  try {

    const race = await prisma.race.findUnique({
      where: { id: raceId },
      include: {
        season: {
          select: {
            id: true,
            pointsSystem: true,
            sprintConfig: true,
            league: {
              select: {
                id: true,
                ownerId: true,
                admins: { select: { userId: true } },
              },
            },
          },
        },
        eventRounds: true,
      },
    });

    if (!race) return { success: false, error: "Corrida não encontrada" };

    const session = await auth();
    if (!session?.user) return { success: false, error: "Não autenticado" };

    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = race.season.league.ownerId === session.user.id;
    const isAdmin = race.season.league.admins.some((a) => a.userId === session.user!.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    if (!race.apiEventCache) {
      return {
        success: false,
        error: "Dados do evento não encontrados. Vincule o evento novamente.",
      };
    }

    const normalizedBonusResult = normalizeRaceImportBonuses(options?.bonuses);
    if (!normalizedBonusResult.ok) {
      return { success: false, error: normalizedBonusResult.error };
    }

    const bonusReason = options?.reason?.trim() || null;

    const eventData =
      race.apiEventCache as unknown as FrosthexEventResultResponse;
    const eventDate = parseFrosthexEventDate(eventData.date);
    const seasonPointsSystem =
      (race.season.pointsSystem as unknown as PointsSystem | null) ??
      F1_STANDARD_POINTS;
    const reverseGridConfig = getSeasonReverseGridConfig(seasonPointsSystem);
    const reverseGridFlagRows = await prisma.$queryRaw<
      Array<{ reverseGridEnabled: boolean }>
    >`
      SELECT "reverseGridEnabled"
      FROM "Race"
      WHERE "id" = ${raceId}
      LIMIT 1
    `;
    const raceReverseGridEnabled = Boolean(
      reverseGridFlagRows[0]?.reverseGridEnabled,
    );

    const reverseGridPoleWinnerUuid =
      reverseGridConfig.enabled && raceReverseGridEnabled
        ? getReverseGridPoleWinnerUuidFromEvent(eventData, race.eventRounds)
        : null;

    let importedCount = 0;
    let skippedCount = 0;

    const targetDriverUuids = new Set<string>();
    for (const eventRound of race.eventRounds) {
      if (!eventRound.targetHeatName) continue;
      const apiRound = eventData.rounds.find(
        (round) => round.name === eventRound.apiRoundName,
      );
      if (!apiRound) continue;
      const heat = apiRound.heats.find(
        (roundHeat) => roundHeat.name === eventRound.targetHeatName,
      );
      if (!heat) continue;
      for (const driverResult of heat.driver_results) {
        targetDriverUuids.add(driverResult.uuid);
      }
    }

    const knownDrivers =
      targetDriverUuids.size > 0
        ? await prisma.driver.findMany({
            where: { uuid: { in: [...targetDriverUuids] } },
            select: { id: true, uuid: true },
          })
        : [];
    const driverIdByUuid = new Map(knownDrivers.map((driver) => [driver.uuid, driver.id]));

    const hasExplicitBonusPayload = options?.bonuses !== undefined;
    const bonusRowsToPersist: Array<{ driverId: string; points: number }> = [];

    if (hasExplicitBonusPayload) {
      try {
        await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "RaceResultBonus"
          LIMIT 1
        `;
      } catch (bonusTableError) {
        if (isMissingRaceResultBonusTableError(bonusTableError)) {
          return {
            success: false,
            error:
              "Tabela de bônus ainda não existe no banco. Rode as migrations antes de importar com bônus.",
          };
        }
        throw bonusTableError;
      }

      for (const bonusEntry of normalizedBonusResult.bonuses) {
        let driverId = driverIdByUuid.get(bonusEntry.driverUuid);

        if (!driverId) {
          const ensuredDriver = await prisma.driver.upsert({
            where: { uuid: bonusEntry.driverUuid },
            update: {},
            create: {
              uuid: bonusEntry.driverUuid,
              currentName: bonusEntry.driverUuid,
            },
            select: { id: true },
          });
          driverId = ensuredDriver.id;
          driverIdByUuid.set(bonusEntry.driverUuid, driverId);
        }

        bonusRowsToPersist.push({ driverId, points: bonusEntry.points });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (!race.scheduledDate && eventDate) {
        await tx.race.update({
          where: { id: raceId },
          data: { scheduledDate: eventDate },
        });
      }

      for (const eventRound of race.eventRounds) {
        if (!eventRound.targetHeatName) {
          skippedCount++;
          continue;
        }

        const apiRound = eventData.rounds.find(
          (r) => r.name === eventRound.apiRoundName,
        );
        if (!apiRound) { skippedCount++; continue; }

        const heat = apiRound.heats.find(
          (h) => h.name === eventRound.targetHeatName,
        );
        if (!heat) { skippedCount++; continue; }

        const seasonSprintConfig = getSeasonSprintConfig(
          race.season.sprintConfig,
        );
        const effectivePointsSystem = resolveRoundPointsSystem(
          eventRound,
          seasonPointsSystem,
          seasonSprintConfig,
        );
        const fastestLapWinnerUuid = getFastestLapWinnerUuid(heat.driver_results);
        const hasAnyFastestLapData = heat.driver_results.some(
          (driverResult) => getDriverFastestLapTime(driverResult.laps) !== null,
        );
        const previousRoundResults = await tx.roundResult.findMany({
          where: { eventRoundId: eventRound.id },
          select: {
            driverId: true,
            fastestLap: true,
            fastestLapTime: true,
            disqualified: true,
          },
        });
        const previousResultByDriverId = new Map(
          previousRoundResults.map((row) => [row.driverId, row] as const),
        );
        const previousActiveResults = previousRoundResults.filter(
          (row) => !row.disqualified,
        );
        const previousFastestByTime = previousActiveResults
          .filter((row) => (row.fastestLapTime ?? 0) > 0)
          .sort(
            (a, b) =>
              (a.fastestLapTime ?? Number.MAX_SAFE_INTEGER) -
              (b.fastestLapTime ?? Number.MAX_SAFE_INTEGER),
          )[0];
        const previousFastestByFlag = previousActiveResults.find(
          (row) => row.fastestLap,
        );
        const preservedFastestDriverId =
          !hasAnyFastestLapData && fastestLapWinnerUuid === null
            ? previousFastestByTime?.driverId ?? previousFastestByFlag?.driverId ?? null
            : null;
        let manualOverrideRows: Array<{
          driverId: string;
          manualPositionOverride: number | null;
          manualPreviousPosition: number | null;
          manualOriginalPosition: number | null;
          manualEditedById: string | null;
          manualEditedAt: Date | null;
          manualEditReason: string | null;
        }> = [];

        try {
          manualOverrideRows = await tx.$queryRaw<
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
            WHERE "eventRoundId" = ${eventRound.id}
              AND "manualPositionOverride" IS NOT NULL
          `;
        } catch {
          manualOverrideRows = [];
        }
        const manualOverrideByDriverId = new Map(
          manualOverrideRows.map((row) => [row.driverId, row] as const),
        );

        for (const dr of heat.driver_results) {
          const driverId = driverIdByUuid.get(dr.uuid);
          if (!driverId) continue;

          const manualOverride = manualOverrideByDriverId.get(driverId);
          const effectivePosition =
            manualOverride?.manualPositionOverride ?? dr.position;

          const fastestLapTime = getDriverFastestLapTime(dr.laps);
          const hasFastestLap =
            fastestLapWinnerUuid !== null
              ? dr.uuid === fastestLapWinnerUuid
              : preservedFastestDriverId !== null &&
                driverId === preservedFastestDriverId;
          const hasPolePosition =
            reverseGridPoleWinnerUuid && isRaceRound(eventRound)
              ? dr.uuid === reverseGridPoleWinnerUuid
              : dr.start_position === 1;
          const pitstops = dr.laps.filter((l) => l.pitstop).length;
          const points = effectivePointsSystem
            ? calculatePoints(
                effectivePosition,
                hasFastestLap,
                hasPolePosition,
                effectivePointsSystem,
              )
            : 0;

          await tx.roundResult.upsert({
            where: {
                eventRoundId_driverId: {
                  eventRoundId: eventRound.id,
                  driverId,
                },
              },
              create: {
                eventRoundId: eventRound.id,
                driverId,
                position: effectivePosition,
                startPosition: dr.start_position,
                finishTimeMs: dr.finish_time,
                fastestLap: hasFastestLap,
                fastestLapTime:
                  fastestLapTime ??
                  previousResultByDriverId.get(driverId)?.fastestLapTime ??
                  null,
                pitstops,
                points,
              },
              update: {
                position: effectivePosition,
                startPosition: dr.start_position,
                finishTimeMs: dr.finish_time,
                fastestLap: hasFastestLap,
                fastestLapTime:
                  fastestLapTime ??
                  previousResultByDriverId.get(driverId)?.fastestLapTime ??
                  null,
                pitstops,
                points,
              },
            });

          if (manualOverride?.manualPositionOverride) {
            await tx.$executeRaw`
              UPDATE "RoundResult"
              SET
                "manualPositionOverride" = ${manualOverride.manualPositionOverride},
                "manualPreviousPosition" = ${manualOverride.manualPreviousPosition},
                "manualOriginalPosition" = ${manualOverride.manualOriginalPosition},
                "manualEditedById" = ${manualOverride.manualEditedById},
                "manualEditedAt" = ${manualOverride.manualEditedAt},
                "manualEditReason" = ${manualOverride.manualEditReason}
              WHERE "eventRoundId" = ${eventRound.id}
                AND "driverId" = ${driverId}
            `;
          }
        }

        if (effectivePointsSystem) {
          const disqualifiedCount = await tx.roundResult.count({
              where: {
                eventRoundId: eventRound.id,
                disqualified: true,
              },
            });

          if (disqualifiedCount > 0) {
            await recalculateRoundPointsWithDSQ(
              tx,
              eventRound.id,
              effectivePointsSystem,
              reverseGridPoleWinnerUuid && isRaceRound(eventRound)
                ? driverIdByUuid.get(reverseGridPoleWinnerUuid) ?? null
                : null,
            );
          }
        }

        await tx.eventRound.update({
          where: { id: eventRound.id },
          data: { status: "IMPORTED", importedAt: new Date() },
        });

        importedCount++;
      }

      await tx.race.update({
        where: { id: raceId },
        data: {
          status: "COMPLETED",
          trackApiName: eventData.track_name || undefined,
        },
      });

    }, {
      maxWait: 10000,
      timeout: 120000,
    });

    if (hasExplicitBonusPayload) {
      await prisma.$executeRaw`
        DELETE FROM "RaceResultBonus"
        WHERE "raceId" = ${raceId}
      `;

      if (bonusRowsToPersist.length > 0) {
        for (const bonus of bonusRowsToPersist) {
          await prisma.$executeRaw`
            INSERT INTO "RaceResultBonus" (
              "id",
              "raceId",
              "driverId",
              "points",
              "reason",
              "updatedById",
              "createdAt",
              "updatedAt"
            ) VALUES (
              ${randomUUID()},
              ${raceId},
              ${bonus.driverId},
              ${bonus.points},
              ${bonusReason},
              ${session.user!.id},
              ${new Date()},
              ${new Date()}
            )
          `;
        }
      }
    }

    // Recalculate both driver and team standings after the transaction commits
    await reprocessSeasonStandings(race.season.id, "RACE_UPDATE");

    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/races/${raceId}`,
    );
    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/races`,
    );
    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}`,
    );
    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/drivers`,
    );
    revalidatePath(
      `/admin/leagues/${race.season.league.id}/seasons/${race.season.id}/standings`,
    );
    revalidatePath(`/leagues/${race.season.league.id}`);

    return { success: true, data: { importedCount, skippedCount } };
  } catch (error) {
    console.error("Error importing race results:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao importar resultados",
    };
  }
}

async function recalculateRoundPointsWithDSQ(
  tx: Prisma.TransactionClient,
  eventRoundId: string,
  pointsSystem: PointsSystem,
  poleWinnerDriverId?: string | null,
) {
  const results = await tx.roundResult.findMany({
    where: { eventRoundId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  if (results.length === 0) return;

  const activeResults = results.filter((result) => !result.disqualified);

  const fastestByTime = activeResults
    .filter((result) => (result.fastestLapTime ?? 0) > 0)
    .sort((a, b) => (a.fastestLapTime ?? Number.MAX_SAFE_INTEGER) - (b.fastestLapTime ?? Number.MAX_SAFE_INTEGER))[0];

  const fastestMarked = activeResults
    .filter((result) => result.fastestLap)
    .sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime())[0];

  const minFastestLapTime = fastestByTime?.fastestLapTime ?? null;
  const tiedFastestByTime =
    minFastestLapTime && minFastestLapTime > 0
      ? activeResults.filter((result) => result.fastestLapTime === minFastestLapTime)
      : [];

  const fastestActive =
    tiedFastestByTime.find((result) => result.fastestLap) ?? fastestByTime ?? fastestMarked;

  for (const result of results) {
    if (result.disqualified) {
      await tx.roundResult.update({
        where: { id: result.id },
        data: {
          points: 0,
          fastestLap: false,
        },
      });
      continue;
    }

    const compensatedPosition = activeResults.findIndex((r) => r.id === result.id) + 1;
    const hasFastestLap = fastestActive?.id === result.id;
    const hasPolePosition = poleWinnerDriverId
      ? result.driverId === poleWinnerDriverId
      : result.startPosition === 1;
    const compensatedPoints = calculatePoints(
      compensatedPosition,
      hasFastestLap,
      hasPolePosition,
      pointsSystem,
    );

    await tx.roundResult.update({
      where: { id: result.id },
      data: {
        points: compensatedPoints,
        fastestLap: hasFastestLap,
      },
    });
  }
}

export async function createManualFinalRound(input: CreateManualFinalRoundInput) {
  try {

    const validated = createManualFinalRoundSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message ?? "Dados inválidos",
      };
    }

    const { raceId, baseRoundId } = validated.data;
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const race = await prisma.race.findUnique({
      where: { id: raceId },
      select: {
        id: true,
        season: {
          select: {
            id: true,
            pointsSystem: true,
            sprintConfig: true,
            league: {
              select: {
                id: true,
                ownerId: true,
                admins: { select: { userId: true } },
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
            results: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                driverId: true,
                position: true,
                disqualified: true,
                fastestLap: true,
                fastestLapTime: true,
                finishTimeMs: true,
              },
            },
          },
        },
        apiEventCache: true,
      },
    });

    if (!race) {
      return { success: false, error: "Corrida não encontrada" };
    }

    const league = race.season.league;
    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = league.ownerId === session.user.id;
    const isAdmin = league.admins.some((a) => a.userId === session.user!.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const eventData = race.apiEventCache
      ? (race.apiEventCache as unknown as FrosthexEventResultResponse)
      : null;

    const hasQualifyingPreview = (round: {
      apiRoundName: string;
      targetHeatName: string | null;
    }): boolean => {
      if (!eventData || !round.targetHeatName) return false;
      const roundHeat = getRoundHeatFromEventCache(
        eventData,
        round.apiRoundName,
        round.targetHeatName,
      );
      return (roundHeat?.heat.driver_results?.length ?? 0) > 0;
    };

    const baseRound = baseRoundId
      ? race.eventRounds.find((round) => round.id === baseRoundId)
      : [...race.eventRounds].reverse().find((round) => {
          if (!isQualifyingLikeRound(round)) return false;
          if (round.results.length > 0) return true;
          return hasQualifyingPreview(round);
        });

    if (!baseRound) {
      return {
        success: false,
        error: "Nenhum round de classificação importado foi encontrado para usar como base",
      };
    }

    type SourceEntry = {
      driverId?: string;
      uuid?: string;
      name?: string;
      position: number;
      disqualified: boolean;
      fastestLap: boolean;
      fastestLapTime: number | null;
      finishTimeMs: number | null;
    };

    let sourceEntries: SourceEntry[] = [];

    if (baseRound.results.length > 0) {
      sourceEntries = [...baseRound.results]
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((result) => ({
          driverId: result.driverId,
          position: result.position,
          disqualified: result.disqualified,
          fastestLap: result.fastestLap,
          fastestLapTime: result.fastestLapTime,
          finishTimeMs: result.finishTimeMs,
        }));
    } else if (eventData && baseRound.targetHeatName) {
      const roundHeat = getRoundHeatFromEventCache(
        eventData,
        baseRound.apiRoundName,
        baseRound.targetHeatName,
      );

      sourceEntries =
        roundHeat?.heat.driver_results
          ?.slice()
          .sort((a, b) => a.position - b.position)
          .map((result) => ({
            uuid: result.uuid,
            name: result.name,
            position: result.position,
            disqualified: false,
            fastestLap: false,
            fastestLapTime: getDriverFastestLapTime(result.laps),
            finishTimeMs: result.finish_time,
          })) ?? [];
    }

    if (sourceEntries.length === 0) {
      return {
        success: false,
        error:
          "O round base não possui resultados para copiar. Importe uma qualificação ou configure a bateria correta.",
      };
    }

    let manualFinalCount = 0;
    try {
      const manualCountRows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM "EventRound"
        WHERE "raceId" = ${race.id}
          AND "origin" = ${"MANUAL"}::"RoundOrigin"
          AND "manualKind" = ${"FINAL"}::"ManualRoundKind"
      `;
      const rawCount = manualCountRows[0]?.count ?? 0;
      manualFinalCount = typeof rawCount === "bigint" ? Number(rawCount) : rawCount;
    } catch {
      manualFinalCount = race.eventRounds.filter((round) =>
        /^Manual Final #/i.test(round.apiRoundName),
      ).length;
    }
    const existingRoundNames = new Set(
      race.eventRounds.map((round) => round.apiRoundName.toLowerCase()),
    );
    let manualRoundNumber = manualFinalCount + 1;
    let manualRoundName = `Manual Final #${manualRoundNumber}`;
    while (existingRoundNames.has(manualRoundName.toLowerCase())) {
      manualRoundNumber += 1;
      manualRoundName = `Manual Final #${manualRoundNumber}`;
    }

    const seasonPointsSystem =
      (race.season.pointsSystem as unknown as PointsSystem | null) ??
      F1_STANDARD_POINTS;
    const seasonSprintConfig = getSeasonSprintConfig(race.season.sprintConfig);
    const manualRoundRuleInput = {
      apiRoundType: "FINAL_MANUAL",
      pointsSystem: null,
      specialType: "NONE",
      sprintMode: null,
      countsForStandings: true,
    };
    const pointsSystem = resolveRoundPointsSystem(
      manualRoundRuleInput,
      seasonPointsSystem,
      seasonSprintConfig,
    );

    const createdAt = new Date();

    const createdRound = await prisma.$transaction(async (tx) => {
      const createdRoundId = randomUUID();

      await tx.$executeRaw`
        INSERT INTO "EventRound" (
          "id",
          "raceId",
          "apiRoundName",
          "apiRoundType",
          "specialType",
          "sprintMode",
          "targetHeatName",
          "countsForStandings",
          "status",
          "importedAt",
          "origin",
          "manualKind",
          "manualBaseRoundId",
          "manualCreatedById",
          "manualCreatedAt"
        )
        VALUES (
          ${createdRoundId},
          ${race.id},
          ${manualRoundName},
          ${"FINAL_MANUAL"},
          ${"NONE"}::"RoundSpecialType",
          NULL,
          NULL,
          ${true},
          ${"IMPORTED"}::"RoundStatus",
          ${createdAt},
          ${"MANUAL"}::"RoundOrigin",
          ${"FINAL"}::"ManualRoundKind",
          ${baseRound.id},
          ${session.user.id},
          ${createdAt}
        )
      `;

      const driverIdByUuid = new Map<string, string>();
      const resultRows: Array<{
        eventRoundId: string;
        driverId: string;
        position: number;
        startPosition: number;
        finishTimeMs: number | null;
        fastestLap: boolean;
        fastestLapTime: number | null;
        pitstops: number;
        disqualified: boolean;
        points: number;
      }> = [];

      for (const [index, source] of sourceEntries.entries()) {
        const position = index + 1;
        const startPosition = position;
        let driverId = source.driverId;

        if (!driverId && source.uuid && source.name) {
          driverId = driverIdByUuid.get(source.uuid);

          if (!driverId) {
            const existingDriver = await tx.driver.findUnique({
              where: { uuid: source.uuid },
              select: { id: true, currentName: true },
            });

            if (existingDriver) {
              driverId = existingDriver.id;

              if (existingDriver.currentName !== source.name) {
                await tx.driver.update({
                  where: { id: existingDriver.id },
                  data: { currentName: source.name },
                });
              }
            } else {
              const createdDriver = await tx.driver.create({
                data: {
                  uuid: source.uuid,
                  currentName: source.name,
                },
                select: { id: true },
              });
              driverId = createdDriver.id;
            }

            driverIdByUuid.set(source.uuid, driverId);
          }
        }

        if (!driverId) {
          continue;
        }

        resultRows.push({
          eventRoundId: createdRoundId,
          driverId,
          position,
          startPosition,
          finishTimeMs: source.finishTimeMs,
          fastestLap: source.fastestLap,
          fastestLapTime: source.fastestLapTime,
          pitstops: 0,
          disqualified: source.disqualified,
          points: 0,
        });
      }

      if (resultRows.length === 0) {
        throw new Error("Não foi possível montar resultados válidos para o round manual");
      }

      const activeResults = resultRows.filter((row) => !row.disqualified);
      const fastestByTime = activeResults
        .filter((row) => (row.fastestLapTime ?? 0) > 0)
        .sort(
          (a, b) =>
            (a.fastestLapTime ?? Number.MAX_SAFE_INTEGER) -
            (b.fastestLapTime ?? Number.MAX_SAFE_INTEGER),
        )[0];
      const fastestByFlag = activeResults.find((row) => row.fastestLap);
      const fastestDriverId =
        fastestByTime?.driverId ?? fastestByFlag?.driverId ?? null;

      for (const row of resultRows) {
        const hasFastestLap =
          fastestDriverId !== null && row.driverId === fastestDriverId;
        const hasPolePosition = row.position === 1;
        row.fastestLap = hasFastestLap;
        row.points = row.disqualified
          ? 0
          : pointsSystem
            ? calculatePoints(
                row.position,
                hasFastestLap,
                hasPolePosition,
                pointsSystem,
              )
            : 0;
      }

      await tx.roundResult.createMany({ data: resultRows });

      await tx.race.update({
        where: { id: race.id },
        data: { status: "COMPLETED" },
      });

      return { id: createdRoundId, name: manualRoundName };
    });

    await reprocessSeasonStandings(race.season.id, "RACE_UPDATE");

    revalidatePath(
      `/admin/leagues/${league.id}/seasons/${race.season.id}/races/${race.id}`,
    );
    revalidatePath(`/admin/leagues/${league.id}/seasons/${race.season.id}`);
    revalidatePath(
      `/admin/leagues/${league.id}/seasons/${race.season.id}/standings`,
    );

    return {
      success: true,
      data: {
        eventRoundId: createdRound.id,
        apiRoundName: createdRound.name,
      },
    };
  } catch (error) {
    console.error("Error creating manual final round:", error);
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("RoundOrigin") ||
      message.includes("manualKind") ||
      message.includes("manualCreatedAt")
    ) {
      return {
        success: false,
        error:
          "Sua base ainda não possui as colunas de rounds manuais. Rode a migração de manual final round antes de criar rounds manuais.",
      };
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao criar round final manual",
    };
  }
}

export async function addManualRoundDriver(input: AddManualRoundDriverInput) {
  try {

    const validated = addManualRoundDriverSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message ?? "Dados inválidos",
      };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const eventRound = await prisma.eventRound.findUnique({
      where: { id: validated.data.eventRoundId },
      select: {
        id: true,
        apiRoundName: true,
        race: {
          select: {
            id: true,
            season: {
              select: {
                id: true,
                pointsSystem: true,
                sprintConfig: true,
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

    if (!eventRound) {
      return { success: false, error: "Round não encontrado" };
    }

    const manualOriginRows = await prisma.$queryRaw<
      Array<{ origin: string; manualKind: string | null }>
    >`
      SELECT "origin"::text AS "origin", "manualKind"::text AS "manualKind"
      FROM "EventRound"
      WHERE "id" = ${eventRound.id}
      LIMIT 1
    `;
    const manualOrigin = normalizeManualRoundMeta(
      (manualOriginRows[0] as unknown as Record<string, unknown>) ?? null,
    );

    if (!isManualFinalRound(manualOrigin)) {
      return {
        success: false,
        error: "Só é possível adicionar pilotos em rounds finais manuais",
      };
    }

    const league = eventRound.race.season.league;
    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = league.ownerId === session.user.id;
    const isAdmin = league.admins.some((a) => a.userId === session.user!.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const cleanUuid = validated.data.uuid.trim();
    const cleanName = validated.data.name.trim();

    const seasonPointsSystem =
      (eventRound.race.season.pointsSystem as unknown as PointsSystem | null) ??
      F1_STANDARD_POINTS;
    const seasonSprintConfig = getSeasonSprintConfig(
      eventRound.race.season.sprintConfig,
    );
    const pointsSystem = resolveRoundPointsSystem(
      {
        pointsSystem: null,
        specialType: "NONE",
        sprintMode: null,
        countsForStandings: true,
      },
      seasonPointsSystem,
      seasonSprintConfig,
    );

    await prisma.$transaction(async (tx) => {
      const existingDriver = await tx.driver.findUnique({
        where: { uuid: cleanUuid },
        select: { id: true, currentName: true },
      });

      let driverId = existingDriver?.id;

      if (!driverId) {
        const created = await tx.driver.create({
          data: { uuid: cleanUuid, currentName: cleanName },
          select: { id: true },
        });
        driverId = created.id;
      } else if (existingDriver?.currentName !== cleanName) {
        await tx.driver.update({
          where: { id: driverId },
          data: { currentName: cleanName },
        });
      }

      const alreadyInRound = await tx.roundResult.findUnique({
        where: {
          eventRoundId_driverId: {
            eventRoundId: eventRound.id,
            driverId,
          },
        },
        select: { id: true },
      });

      if (alreadyInRound) {
        throw new Error("Este piloto já existe no round manual");
      }

      const maxPosition = await tx.roundResult.aggregate({
        where: { eventRoundId: eventRound.id },
        _max: { position: true },
      });
      const nextPosition = (maxPosition._max.position ?? 0) + 1;
      const hasPolePosition = nextPosition === 1;
      const points = pointsSystem
        ? calculatePoints(nextPosition, false, hasPolePosition, pointsSystem)
        : 0;

      await tx.roundResult.create({
        data: {
          eventRoundId: eventRound.id,
          driverId,
          position: nextPosition,
          startPosition: nextPosition,
          finishTimeMs: null,
          fastestLap: false,
          fastestLapTime: null,
          pitstops: 0,
          disqualified: false,
          points,
        },
      });

      if (pointsSystem) {
        await recalculateRoundPointsWithDSQ(tx, eventRound.id, pointsSystem);
      }

      await tx.race.update({
        where: { id: eventRound.race.id },
        data: { status: "COMPLETED" },
      });
    });

    await reprocessSeasonStandings(eventRound.race.season.id, "RACE_UPDATE");

    revalidatePath(
      `/admin/leagues/${league.id}/seasons/${eventRound.race.season.id}/races/${eventRound.race.id}`,
    );
    revalidatePath(
      `/admin/leagues/${league.id}/seasons/${eventRound.race.season.id}/standings`,
    );

    return { success: true };
  } catch (error) {
    console.error("Error adding manual round driver:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("origin") || message.includes("manualKind")) {
      return {
        success: false,
        error:
          "Sua base ainda não possui as colunas de rounds manuais. Rode a migração de manual final round antes de adicionar pilotos.",
      };
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao adicionar piloto no round manual",
    };
  }
}

export async function applyManualFinalRoundPositions(
  input: ManualFinalRoundEditInput,
) {
  try {

    const validated = manualFinalRoundEditSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message ?? "Dados inválidos",
      };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    type ManualEditRound = {
      id: string;
      apiRoundName: string;
      apiRoundType: string;
      specialType: string;
      sprintMode: string | null;
      pointsSystem: unknown;
      countsForStandings: boolean;
      race: {
        id: string;
        apiEventCache: unknown;
        eventRounds: Array<{
          id: string;
          apiRoundName: string;
          apiRoundType: string;
          targetHeatName: string | null;
        }>;
        season: {
          id: string;
          sprintConfig: unknown;
          pointsSystem: unknown;
          league: {
            id: string;
            ownerId: string;
            admins: Array<{ userId: string }>;
          };
        };
      };
      results: Array<{
        id: string;
        driverId: string;
        position: number;
        disqualified: boolean;
      }>;
    };

    const eventRound = (await prisma.eventRound.findUnique({
      where: { id: validated.data.eventRoundId },
      select: {
        id: true,
        apiRoundName: true,
        apiRoundType: true,
        specialType: true,
        sprintMode: true,
        pointsSystem: true,
        countsForStandings: true,
        race: {
          select: {
            eventRounds: {
              select: {
                id: true,
                apiRoundName: true,
                apiRoundType: true,
                targetHeatName: true,
              },
            },
            apiEventCache: true,
            id: true,
            season: {
              select: {
                id: true,
                sprintConfig: true,
                pointsSystem: true,
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
        results: {
          select: {
            id: true,
            driverId: true,
            position: true,
            disqualified: true,
          },
        },
      },
    })) as unknown as ManualEditRound | null;

    if (!eventRound) {
      return { success: false, error: "Round não encontrado" };
    }

    const roundOriginRows = await prisma.$queryRaw<
      Array<{ origin: string; manualKind: string | null }>
    >`
      SELECT "origin"::text AS "origin", "manualKind"::text AS "manualKind"
      FROM "EventRound"
      WHERE "id" = ${eventRound.id}
      LIMIT 1
    `;
    const roundOrigin = normalizeManualRoundMeta(
      (roundOriginRows[0] as unknown as Record<string, unknown>) ?? null,
    );
    const canEditManualRound =
      isManualFinalRound(roundOrigin) || eventRound.apiRoundType === "FINAL_MANUAL";

    if (!isRaceRound(eventRound) && !canEditManualRound) {
      return {
        success: false,
        error: "Edição manual permitida apenas no round final da corrida",
      };
    }

    const league = eventRound.race.season.league;
    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = league.ownerId === session.user.id;
    const isAdmin = league.admins.some(
      (a: { userId: string }) => a.userId === session.user.id,
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const duplicatePositions = validated.data.positions
      .map((item) => item.position)
      .filter((pos, index, arr) => arr.indexOf(pos) !== index);
    if (duplicatePositions.length > 0) {
      return {
        success: false,
        error: "Posições finais duplicadas não são permitidas",
      };
    }

    const updatesByResultId = new Map(
      validated.data.positions.map((item) => [item.roundResultId, item.position] as const),
    );

    const unknownResultId = validated.data.positions.find(
      (item) =>
        !(eventRound.results as Array<{ id: string }>).some(
          (result) => result.id === item.roundResultId,
        ),
    );
    if (unknownResultId) {
      return {
        success: false,
        error: "Um ou mais resultados informados não pertencem a este round",
      };
    }

    const seasonPointsSystem =
      (eventRound.race.season.pointsSystem as unknown as PointsSystem | null) ??
      F1_STANDARD_POINTS;
    const seasonSprintConfig = getSeasonSprintConfig(eventRound.race.season.sprintConfig);
    const pointsSystem = resolveRoundPointsSystem(
      eventRound,
      seasonPointsSystem,
      seasonSprintConfig,
    );

    let poleWinnerDriverId: string | null = null;
    const reverseGridConfig = getSeasonReverseGridConfig(seasonPointsSystem);
    if (reverseGridConfig.enabled && eventRound.race.apiEventCache) {
      const reverseGridFlagRows = await prisma.$queryRaw<
        Array<{ reverseGridEnabled: boolean }>
      >`
        SELECT "reverseGridEnabled"
        FROM "Race"
        WHERE "id" = ${eventRound.race.id}
        LIMIT 1
      `;

      if (reverseGridFlagRows[0]?.reverseGridEnabled) {
        const poleWinnerUuid = getReverseGridPoleWinnerUuidFromEvent(
          eventRound.race.apiEventCache as unknown as FrosthexEventResultResponse,
          eventRound.race.eventRounds,
        );

        if (poleWinnerUuid) {
          const poleWinnerDriver = await prisma.driver.findUnique({
            where: { uuid: poleWinnerUuid },
            select: { id: true },
          });
          poleWinnerDriverId = poleWinnerDriver?.id ?? null;
        }
      }
    }

    let manualMetaRows: Array<{
      id: string;
      manualPositionOverride: number | null;
      manualOriginalPosition: number | null;
    }> = [];
    try {
      manualMetaRows = await prisma.$queryRaw<
        Array<{
          id: string;
          manualPositionOverride: number | null;
          manualOriginalPosition: number | null;
        }>
      >`
        SELECT "id", "manualPositionOverride", "manualOriginalPosition"
        FROM "RoundResult"
        WHERE "eventRoundId" = ${eventRound.id}
      `;
    } catch {
      return {
        success: false,
        error:
          "Sua base ainda não possui as colunas de edição manual. Rode a migração de override manual.",
      };
    }
    const manualMetaByResultId = new Map(
      manualMetaRows.map((row) => [row.id, row] as const),
    );

    await prisma.$transaction(async (tx) => {
      for (const result of eventRound.results) {
        const nextPosition = updatesByResultId.get(result.id);
        if (!nextPosition || nextPosition === result.position) continue;

        const manualMeta = manualMetaByResultId.get(result.id);
        const previousPosition =
          manualMeta?.manualPositionOverride ?? result.position;
        const originalPosition =
          manualMeta?.manualOriginalPosition ?? result.position;

        await tx.roundResult.update({
          where: { id: result.id },
          data: {
            position: nextPosition,
          },
        });

        await tx.$executeRaw`
          UPDATE "RoundResult"
          SET
            "manualPositionOverride" = ${nextPosition},
            "manualPreviousPosition" = ${previousPosition},
            "manualOriginalPosition" = ${originalPosition},
            "manualEditedById" = ${session.user.id},
            "manualEditedAt" = ${new Date()},
            "manualEditReason" = ${validated.data.reason?.trim() || null}
          WHERE "id" = ${result.id}
        `;
      }

      if (!pointsSystem) {
        await tx.roundResult.updateMany({
          where: { eventRoundId: eventRound.id },
          data: { points: 0, fastestLap: false },
        });
        await tx.race.update({
          where: { id: eventRound.race.id },
          data: { status: "COMPLETED" },
        });
      } else {
        await recalculateRoundPointsWithDSQ(
          tx,
          eventRound.id,
          pointsSystem,
          poleWinnerDriverId,
        );
        await tx.race.update({
          where: { id: eventRound.race.id },
          data: { status: "COMPLETED" },
        });
      }
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    await reprocessSeasonStandings(eventRound.race.season.id, "RACE_UPDATE");

    revalidatePath(
      `/admin/leagues/${league.id}/seasons/${eventRound.race.season.id}/races/${eventRound.race.id}`,
    );
    revalidatePath(
      `/admin/leagues/${league.id}/seasons/${eventRound.race.season.id}/standings`,
    );
    revalidatePath(`/admin/leagues/${league.id}/seasons/${eventRound.race.season.id}`);

    return { success: true };
  } catch (error) {
    console.error("Error applying manual final round positions:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao aplicar edição manual do round final",
    };
  }
}

export async function setRoundResultDisqualification(
  roundResultId: string,
  disqualified: boolean,
) {
  try {

    const roundResult = await prisma.roundResult.findUnique({
      where: { id: roundResultId },
      include: {
        eventRound: {
          include: {
            race: {
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
            },
          },
        },
      },
    });

    if (!roundResult) {
      return { success: false, error: "Resultado não encontrado" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const league = roundResult.eventRound.race.season.league;
    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = league.ownerId === session.user.id;
    const isAdmin = league.admins.some(
      (a) => a.userId === session.user.id,
    );

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const eventRound = roundResult.eventRound;
    const race = eventRound.race;
    const seasonPointsSystem =
      (race.season.pointsSystem as unknown as PointsSystem | null) ??
      F1_STANDARD_POINTS;
    const seasonSprintConfig = getSeasonSprintConfig(race.season.sprintConfig);
    const pointsSystem = resolveRoundPointsSystem(
      eventRound,
      seasonPointsSystem,
      seasonSprintConfig,
    );

    await prisma.$transaction(async (tx) => {
      await tx.roundResult.update({
        where: { id: roundResultId },
        data: {
          disqualified,
        },
      });

      if (!pointsSystem) {
        await tx.roundResult.updateMany({
          where: { eventRoundId: eventRound.id },
          data: { points: 0, fastestLap: false },
        });
        await tx.race.update({
          where: { id: race.id },
          data: { status: "COMPLETED" },
        });
        return;
      }

      await recalculateRoundPointsWithDSQ(tx, eventRound.id, pointsSystem);
      await tx.race.update({
        where: { id: race.id },
        data: { status: "COMPLETED" },
      });
    }, {
      maxWait: 10000,
      timeout: 120000,
    });

    await reprocessSeasonStandings(race.season.id, "RACE_UPDATE");

    revalidatePath(
      `/admin/leagues/${league.id}/seasons/${race.season.id}/races/${race.id}`,
    );
    revalidatePath(`/admin/leagues/${league.id}/seasons/${race.season.id}`);
    revalidatePath(`/admin/leagues/${league.id}/seasons/${race.season.id}/standings`);

    return { success: true };
  } catch (error) {
    console.error("Error updating disqualification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar desqualificação",
    };
  }
}

export async function setRoundResultFastestLap(
  roundResultId: string,
  fastestLap: boolean,
) {
  try {

    const roundResult = await prisma.roundResult.findUnique({
      where: { id: roundResultId },
      include: {
        eventRound: {
          include: {
            race: {
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
            },
          },
        },
      },
    });

    if (!roundResult) {
      return { success: false, error: "Resultado não encontrado" };
    }

    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Não autenticado" };
    }

    const league = roundResult.eventRound.race.season.league;
    const isSuperAdmin = session.user.role === "SUPER_ADMIN";
    const isOwner = league.ownerId === session.user.id;
    const isAdmin = league.admins.some((a) => a.userId === session.user.id);

    if (!isSuperAdmin && !isOwner && !isAdmin) {
      return { success: false, error: "Acesso negado" };
    }

    const eventRound = roundResult.eventRound;
    const race = eventRound.race;
    const seasonPointsSystem =
      (race.season.pointsSystem as unknown as PointsSystem | null) ??
      F1_STANDARD_POINTS;
    const seasonSprintConfig = getSeasonSprintConfig(race.season.sprintConfig);
    const pointsSystem = resolveRoundPointsSystem(
      eventRound,
      seasonPointsSystem,
      seasonSprintConfig,
    );

    await prisma.$transaction(async (tx) => {
      await tx.roundResult.updateMany({
        where: { eventRoundId: eventRound.id },
        data: { fastestLap: false },
      });

      if (fastestLap) {
        await tx.roundResult.update({
          where: { id: roundResultId },
          data: { fastestLap: true },
        });
      }

      if (!pointsSystem) {
        await tx.roundResult.updateMany({
          where: { eventRoundId: eventRound.id },
          data: { points: 0 },
        });
        await tx.race.update({
          where: { id: race.id },
          data: { status: "COMPLETED" },
        });
        return;
      }

      await recalculateRoundPointsWithDSQ(tx, eventRound.id, pointsSystem);
      await tx.race.update({
        where: { id: race.id },
        data: { status: "COMPLETED" },
      });
    }, {
      maxWait: 10000,
      timeout: 120000,
    });

    await reprocessSeasonStandings(race.season.id, "RACE_UPDATE");

    revalidatePath(
      `/admin/leagues/${league.id}/seasons/${race.season.id}/races/${race.id}`,
    );
    revalidatePath(`/admin/leagues/${league.id}/seasons/${race.season.id}`);
    revalidatePath(`/admin/leagues/${league.id}/seasons/${race.season.id}/standings`);

    return { success: true };
  } catch (error) {
    console.error("Error updating fastest lap:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao atualizar volta mais rápida",
    };
  }
}

// Register a driver found in an event that isn't in the DB yet
export async function registerDriverFromEvent(uuid: string, name: string) {
  try {

    const session = await auth();
    if (!session?.user) return { success: false, error: "Não autenticado" };

    await prisma.driver.upsert({
      where: { uuid },
      create: { uuid, currentName: name },
      update: {},
    });

    return { success: true };
  } catch (error) {
    console.error("Error registering driver from event:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao registrar piloto",
    };
  }
}
