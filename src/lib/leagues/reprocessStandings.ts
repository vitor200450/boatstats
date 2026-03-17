export type SeasonReprocessReason =
  | "MANUAL"
  | "TRANSFER"
  | "REMOVE_DRIVER"
  | "DEPTH_CHART_UPDATE"
  | "RACE_UPDATE"
  | "ROUND_IMPORT"
  | "POINTS_RECALC";

type ReprocessResult = {
  success: boolean;
  error?: string;
  durationMs?: number;
  reason?: SeasonReprocessReason;
};

type ReprocessDeps = {
  calculateStandingsFn: (seasonId: string) => Promise<{ success: boolean; error?: string }>;
  logger?: {
    info: (message: string) => void;
    error: (message: string) => void;
  };
};

const seasonReprocessLocks = new Set<string>();

function acquireSeasonReprocessLock(seasonId: string): boolean {
  if (seasonReprocessLocks.has(seasonId)) return false;
  seasonReprocessLocks.add(seasonId);
  return true;
}

function releaseSeasonReprocessLock(seasonId: string): void {
  seasonReprocessLocks.delete(seasonId);
}

export async function reprocessSeasonStandingsWithLock(
  seasonId: string,
  reason: SeasonReprocessReason,
  deps: ReprocessDeps,
): Promise<ReprocessResult> {
  if (!acquireSeasonReprocessLock(seasonId)) {
    return {
      success: false,
      error: "Temporada já está em reprocessamento. Tente novamente em instantes.",
      reason,
    };
  }

  const startedAt = Date.now();
  const logger = deps.logger;

  try {
    logger?.info(`[StandingsReprocess] start season=${seasonId} reason=${reason}`);
    const result = await deps.calculateStandingsFn(seasonId);
    const durationMs = Date.now() - startedAt;

    if (!result.success) {
      logger?.error(
        `[StandingsReprocess] failed season=${seasonId} reason=${reason} durationMs=${durationMs}`,
      );
      return {
        success: false,
        error: result.error,
        durationMs,
        reason,
      };
    }

    logger?.info(
      `[StandingsReprocess] success season=${seasonId} reason=${reason} durationMs=${durationMs}`,
    );

    return {
      success: true,
      durationMs,
      reason,
    };
  } finally {
    releaseSeasonReprocessLock(seasonId);
  }
}
