import { PointsSystem, TeamScoringMode } from "@/lib/leagues/pointsSystem";

export type TeamScoringConfig = {
  mode: TeamScoringMode;
  driverMulliganCount: number;
  teamSlotMulliganCount: number;
};

export function getTeamScoringConfig(
  pointsSystem: PointsSystem,
): TeamScoringConfig {
  const rules = pointsSystem.rules ?? {};

  const mode =
    rules.teamScoringMode === "DEPTH_CHART" ||
    rules.teamScoringMode === "SLOT_MULLIGAN"
      ? rules.teamScoringMode
      : "STANDARD";

  return {
    mode,
    driverMulliganCount: normalizeCount(rules.driverMulliganCount, 0),
    teamSlotMulliganCount: normalizeCount(rules.teamSlotMulliganCount, 0),
  };
}

function normalizeCount(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.floor(value));
}
