export type RaceImportBonusInput = {
  driverUuid: string;
  points: number;
};

export type RaceRoundLike = {
  id: string;
  apiRoundName: string;
  apiRoundType: string;
  origin?: string | null;
  manualKind?: string | null;
};

function isManualFinalRound(round: {
  origin?: string | null;
  manualKind?: string | null;
}): boolean {
  return round.origin === "MANUAL" && round.manualKind === "FINAL";
}

export function selectPrimaryScoringRound<T extends RaceRoundLike>(
  rounds: T[],
): T | null {
  if (rounds.length === 0) return null;

  const finalRound = rounds.find(
    (round) => /RACE|FINAL/i.test(round.apiRoundType) || /race|final/i.test(round.apiRoundName),
  );
  if (finalRound) return finalRound;

  const manualFinalRound = rounds.find((round) =>
    isManualFinalRound({
      origin: round.origin ?? null,
      manualKind: round.manualKind ?? null,
    }),
  );
  if (manualFinalRound) return manualFinalRound;

  const reversed = [...rounds].reverse();
  const latestScoringLike = reversed.find(
    (round) =>
      !/QUAL|CLASSIF/i.test(round.apiRoundType) &&
      !/qualy|quali|qualifying|classifica|\bQ\d+\b/i.test(round.apiRoundName.trim()),
  );

  return latestScoringLike ?? rounds[rounds.length - 1] ?? null;
}

export function normalizeRaceImportBonuses(
  bonuses: RaceImportBonusInput[] | undefined,
): {
  ok: true;
  bonuses: RaceImportBonusInput[];
} | {
  ok: false;
  error: string;
} {
  if (bonuses === undefined) {
    return { ok: true, bonuses: [] };
  }

  const normalized: RaceImportBonusInput[] = [];
  const seen = new Set<string>();

  for (const entry of bonuses) {
    const driverUuid = entry.driverUuid?.trim();
    if (!driverUuid) {
      return { ok: false, error: "Piloto inválido no bônus da corrida" };
    }

    if (!Number.isInteger(entry.points)) {
      return { ok: false, error: "Bônus deve ser um número inteiro" };
    }

    if (seen.has(driverUuid)) {
      return { ok: false, error: "Piloto duplicado no bônus da corrida" };
    }

    seen.add(driverUuid);

    if (entry.points !== 0) {
      normalized.push({
        driverUuid,
        points: entry.points,
      });
    }
  }

  return { ok: true, bonuses: normalized };
}
