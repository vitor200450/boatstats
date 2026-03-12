import { describe, expect, it } from "vitest";

import sampleEvent from "../../../W4FC-response.json";
import { F1_STANDARD_POINTS } from "@/lib/leagues/pointsSystem";
import {
  buildRoundResultsFromHeat,
  getRoundHeatFromEventCache,
} from "@/lib/leagues/importHelpers";
import { FrosthexEventResultResponse } from "@/services/frosthexAPI";

const event = sampleEvent as FrosthexEventResultResponse;

describe("importHelpers using Frosthex API model", () => {
  it("finds round/heat from cached event payload", () => {
    const roundHeat = getRoundHeatFromEventCache(event, "R1-Qualy", "R1Q1");

    expect(roundHeat).not.toBeNull();
    expect(roundHeat?.apiRoundName).toBe("R1-Qualy");
    expect(roundHeat?.heat.name).toBe("R1Q1");
    expect(roundHeat?.heat.driver_results.length).toBeGreaterThan(40);
  });

  it("maps heat driver_results to round results with points and lap metadata", async () => {
    const roundHeat = getRoundHeatFromEventCache(event, "R1-Qualy", "R1Q1");
    expect(roundHeat).not.toBeNull();

    const uuidToDriverId = new Map<string, string>();

    const rows = await buildRoundResultsFromHeat({
      roundId: "round-1",
      heat: roundHeat!.heat,
      effectivePointsSystem: F1_STANDARD_POINTS,
      resolveDriverId: async (uuid) => {
        if (!uuidToDriverId.has(uuid)) {
          uuidToDriverId.set(uuid, `driver-${uuidToDriverId.size + 1}`);
        }
        return uuidToDriverId.get(uuid)!;
      },
    });

    expect(rows).toHaveLength(roundHeat!.heat.driver_results.length);

    const first = rows[0];
    expect(first.eventRoundId).toBe("round-1");
    expect(first.position).toBe(1);
    expect(first.startPosition).toBe(2);
    expect(first.finishTimeMs).toBe(370350);
    expect(first.fastestLap).toBe(true);
    expect(first.fastestLapTime).toBe(92750);
    expect(first.pitstops).toBe(0);
    expect(first.points).toBe(26);
    expect(first.disqualified).toBe(false);
  });

  it("returns zero points when the round does not count for standings", async () => {
    const roundHeat = getRoundHeatFromEventCache(event, "R1-Qualy", "R1Q1");
    expect(roundHeat).not.toBeNull();

    const rows = await buildRoundResultsFromHeat({
      roundId: "round-1",
      heat: roundHeat!.heat,
      effectivePointsSystem: null,
      resolveDriverId: async (uuid) => uuid,
    });

    expect(rows.every((row) => row.points === 0)).toBe(true);
  });
});
