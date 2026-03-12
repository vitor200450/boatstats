import { PointsSystem } from "@/lib/leagues/pointsSystem";

export type ReverseGridConfig = {
  enabled: boolean;
  pointsTable: Record<string, number>;
};

type ReverseGridRaceLike = {
  eventRounds: Array<{
    apiRoundName: string;
    apiRoundType: string;
    results: Array<{
      driverId: string;
      position: number;
      disqualified?: boolean | null;
    }>;
  }>;
};

export type RoundMetaLike = {
  apiRoundName: string;
  apiRoundType: string;
};

export function getSeasonReverseGridConfig(
  pointsSystem: PointsSystem | null | undefined,
): ReverseGridConfig {
  const enabled = Boolean(pointsSystem?.rules?.reverseGridEnabled);
  const pointsTable = pointsSystem?.rules?.reverseGridPointsTable ?? {};
  return { enabled, pointsTable };
}

function isQualifyingRound(round: RoundMetaLike): boolean {
  if (/QUAL|CLASSIF/i.test(round.apiRoundType)) return true;
  if (/qualy|quali|qualifying|classifica/i.test(round.apiRoundName)) return true;
  return /\bQ\d+\b/i.test(round.apiRoundName.trim());
}

export function isRaceRound(round: RoundMetaLike): boolean {
  if (/RACE|FINAL/i.test(round.apiRoundType)) return true;
  if (/race|final/i.test(round.apiRoundName)) return true;
  return false;
}

function getQualifyingRoundOrder(round: { apiRoundName: string }): number {
  const match = round.apiRoundName.match(/\bQ(\d+)\b/i);
  if (!match) return -1;
  return Number(match[1]);
}

export function getLatestQualifyingRound(
  race: ReverseGridRaceLike,
): ReverseGridRaceLike["eventRounds"][number] | null {
  const qualifyingRounds = race.eventRounds.filter(isQualifyingRound);
  if (qualifyingRounds.length === 0) return null;

  const sorted = [...qualifyingRounds].sort((a, b) => {
    const aOrder = getQualifyingRoundOrder(a);
    const bOrder = getQualifyingRoundOrder(b);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.apiRoundName.localeCompare(b.apiRoundName);
  });

  return sorted[sorted.length - 1] ?? null;
}

export function selectLatestQualifyingRound<T extends RoundMetaLike>(
  rounds: T[],
): T | null {
  const qualifyingRounds = rounds.filter(isQualifyingRound);
  if (qualifyingRounds.length === 0) return null;

  const sorted = [...qualifyingRounds].sort((a, b) => {
    const aOrder = getQualifyingRoundOrder(a);
    const bOrder = getQualifyingRoundOrder(b);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.apiRoundName.localeCompare(b.apiRoundName);
  });

  return sorted[sorted.length - 1] ?? null;
}

export function computeReverseGridPointsForRace(
  race: ReverseGridRaceLike,
  config: ReverseGridConfig,
): Map<string, number> {
  const pointsByDriver = new Map<string, number>();

  if (!config.enabled) return pointsByDriver;

  const latestQualifyingRound = getLatestQualifyingRound(race);
  if (!latestQualifyingRound) return pointsByDriver;

  for (const result of latestQualifyingRound.results) {
    if (result.disqualified) continue;
    const points = config.pointsTable[result.position.toString()] ?? 0;
    if (points <= 0) continue;
    pointsByDriver.set(
      result.driverId,
      (pointsByDriver.get(result.driverId) ?? 0) + points,
    );
  }

  return pointsByDriver;
}
