import { PointsSystem } from "@/lib/leagues/pointsSystem";

export type RoundSpecialType = "NONE" | "SPRINT";
export type SprintMode = "CLASSIFICATION" | "POINTS";

export type SeasonSprintConfig = {
  defaultMode: SprintMode;
  pointsSystem?: PointsSystem;
};

export function getSprintModeLabel(mode: SprintMode | null): string {
  if (mode === "POINTS") return "Sprint (pontuavel)";
  if (mode === "CLASSIFICATION") return "Sprint (classificatoria)";
  return "Sprint";
}

export function getSeasonSprintConfig(raw: unknown): SeasonSprintConfig {
  if (!raw || typeof raw !== "object") {
    return { defaultMode: "CLASSIFICATION" };
  }

  const data = raw as Record<string, unknown>;
  const defaultMode =
    data.defaultMode === "POINTS" ? "POINTS" : "CLASSIFICATION";

  const pointsSystem =
    data.pointsSystem && typeof data.pointsSystem === "object"
      ? (data.pointsSystem as PointsSystem)
      : undefined;

  return { defaultMode, pointsSystem };
}

export function isSprintRound(round: {
  specialType?: string | null;
  sprintMode?: string | null;
  apiRoundType?: string | null;
  apiRoundName?: string | null;
}): boolean {
  if (round.specialType === "SPRINT") {
    return true;
  }

  const roundType = round.apiRoundType?.toUpperCase();
  const roundName = round.apiRoundName?.toLowerCase() ?? "";
  return roundType === "SPRINT_RACE" || roundName.includes("sprint");
}

export function getRoundSpecialType(round: {
  specialType?: string | null;
  apiRoundType?: string | null;
  apiRoundName?: string | null;
}): RoundSpecialType {
  return isSprintRound(round) ? "SPRINT" : "NONE";
}

export function getEffectiveSprintMode(
  round: { specialType?: string | null; sprintMode?: string | null },
  seasonSprintConfig: SeasonSprintConfig,
): SprintMode | null {
  if (round.specialType !== "SPRINT") {
    return null;
  }

  if (round.sprintMode === "POINTS") {
    return "POINTS";
  }

  if (round.sprintMode === "CLASSIFICATION") {
    return "CLASSIFICATION";
  }

  return seasonSprintConfig.defaultMode;
}

export function roundCountsForStandings(
  round: {
    specialType?: string | null;
    sprintMode?: string | null;
    countsForStandings?: boolean | null;
  },
  seasonSprintConfig: SeasonSprintConfig,
): boolean {
  if (round.specialType !== "SPRINT") {
    return Boolean(round.countsForStandings);
  }

  return getEffectiveSprintMode(round, seasonSprintConfig) === "POINTS";
}

export function resolveRoundPointsSystem(
  round: {
    specialType?: string | null;
    sprintMode?: string | null;
    pointsSystem?: unknown;
    countsForStandings?: boolean | null;
  },
  seasonPointsSystem: PointsSystem,
  seasonSprintConfig: SeasonSprintConfig,
): PointsSystem | null {
  if (!roundCountsForStandings(round, seasonSprintConfig)) {
    return null;
  }

  if (round.specialType === "SPRINT") {
    return (
      (round.pointsSystem as PointsSystem | null) ??
      seasonSprintConfig.pointsSystem ??
      seasonPointsSystem
    );
  }

  return (round.pointsSystem as PointsSystem | null) ?? seasonPointsSystem;
}

export function validateSpecialRoundConfig(input: {
  specialType?: string | null;
  sprintMode?: string | null;
}): { valid: boolean; error?: string } {
  if (input.specialType === "SPRINT") {
    if (input.sprintMode !== "CLASSIFICATION" && input.sprintMode !== "POINTS") {
      return {
        valid: false,
        error: "Selecione o modo da sprint (classificatoria ou pontuavel)",
      };
    }
  }

  if (input.specialType !== "SPRINT" && input.sprintMode) {
    return {
      valid: false,
      error: "Modo da sprint so pode ser usado quando o tipo especial for sprint",
    };
  }

  return { valid: true };
}
