import { getDriverFastestLapTime, getFastestLapWinnerUuid } from "./fastestLap";
import { calculatePoints, PointsSystem } from "./pointsSystem";
import { selectLatestQualifyingRound } from "./reverseGrid";
import {
  FrosthexEventResultResponse,
  FrosthexHeat,
} from "@/services/frosthexAPI";

export function getRoundHeatFromEventCache(
  eventData: FrosthexEventResultResponse,
  apiRoundName: string,
  targetHeatName: string,
): { apiRoundName: string; heat: FrosthexHeat } | null {
  const apiRound = eventData.rounds.find((round) => round.name === apiRoundName);
  if (!apiRound) return null;

  const heat = apiRound.heats.find((candidate) => candidate.name === targetHeatName);
  if (!heat) return null;

  return { apiRoundName: apiRound.name, heat };
}

export async function buildRoundResultsFromHeat(params: {
  roundId: string;
  heat: FrosthexHeat;
  effectivePointsSystem: PointsSystem | null;
  poleWinnerUuidOverride?: string | null;
  resolveDriverId: (uuid: string, name: string) => Promise<string>;
}): Promise<
  Array<{
    eventRoundId: string;
    driverId: string;
    position: number;
    startPosition: number | null;
    finishTimeMs: number | null;
    fastestLap: boolean;
    pitstops: number;
    points: number;
    disqualified: boolean;
    fastestLapTime: number | null;
  }>
> {
  const {
    roundId,
    heat,
    effectivePointsSystem,
    poleWinnerUuidOverride,
    resolveDriverId,
  } = params;

  const results: Array<{
    eventRoundId: string;
    driverId: string;
    position: number;
    startPosition: number | null;
    finishTimeMs: number | null;
    fastestLap: boolean;
    pitstops: number;
    points: number;
    disqualified: boolean;
    fastestLapTime: number | null;
  }> = [];
  const fastestLapWinnerUuid = getFastestLapWinnerUuid(heat.driver_results);

  for (const driverResult of heat.driver_results) {
    const driverId = await resolveDriverId(driverResult.uuid, driverResult.name);

    const hasFastestLap =
      fastestLapWinnerUuid !== null &&
      driverResult.uuid === fastestLapWinnerUuid;
    const hasPolePosition = poleWinnerUuidOverride
      ? driverResult.uuid === poleWinnerUuidOverride
      : driverResult.start_position === 1;
    const points = effectivePointsSystem
      ? calculatePoints(
          driverResult.position,
          hasFastestLap,
          hasPolePosition,
          effectivePointsSystem,
        )
      : 0;

    const fastestLapTime = getDriverFastestLapTime(driverResult.laps);

    results.push({
      eventRoundId: roundId,
      driverId,
      position: driverResult.position,
      startPosition: driverResult.start_position,
      finishTimeMs: driverResult.finish_time,
      fastestLap: hasFastestLap,
      pitstops: driverResult.laps.filter((lap) => lap.pitstop).length,
      points,
      disqualified: false,
      fastestLapTime,
    });
  }

  return results;
}

export function getReverseGridPoleWinnerUuidFromEvent(
  eventData: FrosthexEventResultResponse,
  eventRounds: Array<{
    apiRoundName: string;
    apiRoundType: string;
    targetHeatName: string | null;
  }>,
): string | null {
  const latestQualifyingRound = selectLatestQualifyingRound(
    eventRounds.filter((round) => Boolean(round.targetHeatName)),
  );

  if (!latestQualifyingRound?.targetHeatName) return null;

  const apiRound = eventData.rounds.find(
    (round) => round.name === latestQualifyingRound.apiRoundName,
  );
  if (!apiRound) return null;

  const heat = apiRound.heats.find(
    (candidate) => candidate.name === latestQualifyingRound.targetHeatName,
  );
  if (!heat) return null;

  const poleWinner = heat.driver_results.find((result) => result.position === 1);
  return poleWinner?.uuid ?? null;
}
