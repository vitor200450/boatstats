// Default F1-style point system if none provided by League
export const DEFAULT_POINTS_SYSTEM: Record<string, number> = {
  "1": 25,
  "2": 18,
  "3": 15,
  "4": 12,
  "5": 10,
  "6": 8,
  "7": 6,
  "8": 4,
  "9": 2,
  "10": 1,
  fastestLap: 1,
};

export function calculatePoints(
  position: number,
  hasFastestLap: boolean,
  pointsSystem: Record<string, number> = DEFAULT_POINTS_SYSTEM,
): number {
  let points = 0;

  // Add position points
  const positionStr = position.toString();
  if (pointsSystem[positionStr]) {
    points += pointsSystem[positionStr];
  }

  // Add fastest lap points
  if (hasFastestLap && pointsSystem["fastestLap"]) {
    points += pointsSystem["fastestLap"];
  }

  return points;
}
