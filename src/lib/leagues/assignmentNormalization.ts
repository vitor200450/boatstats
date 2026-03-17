import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function normalizeLegacyAssignmentRoundsForSeason(
  seasonId: string,
): Promise<{ updatedCount: number; firstSeasonRound: number }> {
  const firstRace = await prisma.race.findFirst({
    where: { seasonId },
    select: { round: true },
    orderBy: { round: "asc" },
  });

  const firstSeasonRound = firstRace?.round ?? 1;

  const earliestAssignments = await prisma.$queryRaw<
    Array<{ id: string; effectiveFromRound: number }>
  >`
    SELECT DISTINCT ON (a."driverId")
      a."id",
      COALESCE(a."effectiveFromRound", 1)::int AS "effectiveFromRound"
    FROM "SeasonTeamAssignment" a
    WHERE a."seasonId" = ${seasonId}
    ORDER BY
      a."driverId" ASC,
      COALESCE(a."effectiveFromRound", 1) ASC,
      a."joinedAt" ASC,
      a."id" ASC
  `;

  const idsToBackfill = earliestAssignments
    .filter((row) => row.effectiveFromRound > firstSeasonRound)
    .map((row) => row.id);

  if (idsToBackfill.length === 0) {
    return { updatedCount: 0, firstSeasonRound };
  }

  await prisma.$executeRaw`
    UPDATE "SeasonTeamAssignment"
    SET "effectiveFromRound" = ${firstSeasonRound}
    WHERE "id" IN (${Prisma.join(idsToBackfill)})
  `;

  return { updatedCount: idsToBackfill.length, firstSeasonRound };
}
