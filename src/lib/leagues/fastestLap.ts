type DriverLapLike = {
  time: number;
};

type DriverResultLike = {
  uuid: string;
  position: number;
  finish_time: number;
  laps: DriverLapLike[];
};

export function getDriverFastestLapTime(laps: DriverLapLike[]): number | null {
  const validLapTimes = laps
    .map((lap) => lap.time)
    .filter((time) => Number.isFinite(time) && time > 0);

  if (validLapTimes.length === 0) {
    return null;
  }

  return Math.min(...validLapTimes);
}

export function getFastestLapWinnerUuid<T extends DriverResultLike>(
  driverResults: T[],
): string | null {
  const driversWithFastestLap = driverResults
    .map((driver) => ({
      uuid: driver.uuid,
      position: driver.position,
      finishTime: driver.finish_time,
      fastestLapTime: getDriverFastestLapTime(driver.laps),
      earliestFastestLapIndex: (() => {
        const fastestLapTime = getDriverFastestLapTime(driver.laps);
        if (fastestLapTime === null) return Number.MAX_SAFE_INTEGER;
        const index = driver.laps.findIndex((lap) => lap.time === fastestLapTime);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
      })(),
    }))
    .filter(
      (
        driver,
      ): driver is {
        uuid: string;
        position: number;
        finishTime: number;
        fastestLapTime: number;
        earliestFastestLapIndex: number;
      } => driver.fastestLapTime !== null,
    )
    .sort((a, b) => {
      if (a.fastestLapTime !== b.fastestLapTime) {
        return a.fastestLapTime - b.fastestLapTime;
      }

      if (a.earliestFastestLapIndex !== b.earliestFastestLapIndex) {
        return a.earliestFastestLapIndex - b.earliestFastestLapIndex;
      }

      if (a.position !== b.position) {
        return a.position - b.position;
      }

      if (a.finishTime !== b.finishTime) {
        return a.finishTime - b.finishTime;
      }

      return a.uuid.localeCompare(b.uuid);
    });

  return driversWithFastestLap[0]?.uuid ?? null;
}
