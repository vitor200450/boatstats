import { describe, expect, it } from "vitest";

import sampleEvent from "../../../W4FC-response.json";
import { getFastestLapWinnerUuid } from "@/lib/leagues/fastestLap";
import { FrosthexEventResultResponse } from "@/services/frosthexAPI";

const event = sampleEvent as FrosthexEventResultResponse;

describe("getFastestLapWinnerUuid with Frosthex API model", () => {
  it("calculates fastest lap winner from real driver_results payload", () => {
    const round = event.rounds.find((r) => r.name === "R1-Qualy");
    expect(round).toBeDefined();

    const heat = round!.heats.find((h) => h.name === "R1Q1");
    expect(heat).toBeDefined();

    const winnerUuid = getFastestLapWinnerUuid(heat!.driver_results);
    expect(winnerUuid).toBe("2f0217dc-d617-435b-ad5b-329b9fbf9ece");
  });

  it("ignores drivers without lap times and still returns a valid winner", () => {
    const round = event.rounds.find((r) => r.name === "R1-Qualy");
    expect(round).toBeDefined();

    const heat = round!.heats.find((h) => h.name === "R1Q1");
    expect(heat).toBeDefined();

    const subsetWithEmptyLaps = [
      ...heat!.driver_results.slice(0, 3),
      {
        ...heat!.driver_results[0],
        uuid: "00000000-0000-0000-0000-000000000000",
        laps: [],
      },
    ];

    const winnerUuid = getFastestLapWinnerUuid(subsetWithEmptyLaps);
    expect(winnerUuid).toBe("2f0217dc-d617-435b-ad5b-329b9fbf9ece");
  });
});
