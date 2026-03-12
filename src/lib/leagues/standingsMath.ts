export type StandingSortEntry = {
  totalPoints: number;
  wins: number;
  podiums: number;
  bestFinishes: Record<string, number>;
};

export function sumLowestRacePoints(
  racePoints: Record<string, Record<string, number>>,
  count: number,
): number {
  if (count <= 0) return 0;

  const raceEntries = Object.entries(racePoints).map(([raceId, rounds]) => ({
    raceId,
    points: Object.values(rounds).reduce((acc, points) => acc + points, 0),
  }));

  if (raceEntries.length <= 1) return 0;

  const effectiveCount = Math.min(count, raceEntries.length - 1);
  if (effectiveCount <= 0) return 0;

  return raceEntries
    .sort((a, b) => a.points - b.points || a.raceId.localeCompare(b.raceId))
    .slice(0, effectiveCount)
    .reduce((acc, entry) => acc + entry.points, 0);
}

export function compareStandingsByTieBreak(
  a: StandingSortEntry,
  b: StandingSortEntry,
): number {
  if (b.totalPoints !== a.totalPoints) {
    return b.totalPoints - a.totalPoints;
  }

  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.podiums !== a.podiums) return b.podiums - a.podiums;

  for (let pos = 1; pos <= 20; pos++) {
    const posKey = pos.toString();
    const aCount = a.bestFinishes[posKey] || 0;
    const bCount = b.bestFinishes[posKey] || 0;
    if (bCount !== aCount) return bCount - aCount;
  }

  return 0;
}
