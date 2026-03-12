import { describe, expect, it } from "vitest";

import {
  computeReverseGridPointsForRace,
  getLatestQualifyingRound,
  getSeasonReverseGridConfig,
} from "@/lib/leagues/reverseGrid";

describe("reverseGrid", () => {
  it("returns disabled config by default", () => {
    const config = getSeasonReverseGridConfig(null);
    expect(config.enabled).toBe(false);
    expect(config.pointsTable).toEqual({});
  });

  it("uses latest qualifying round (Q3) for reverse-grid points", () => {
    const race = {
      eventRounds: [
        {
          apiRoundName: "Q1",
          apiRoundType: "QUALIFICATION",
          results: [
            { driverId: "d1", position: 5, disqualified: false },
            { driverId: "d2", position: 1, disqualified: false },
          ],
        },
        {
          apiRoundName: "Q3",
          apiRoundType: "QUALIFICATION",
          results: [
            { driverId: "d1", position: 1, disqualified: false },
            { driverId: "d2", position: 2, disqualified: false },
          ],
        },
        {
          apiRoundName: "Race",
          apiRoundType: "RACE",
          results: [],
        },
      ],
    };

    const latest = getLatestQualifyingRound(race);
    expect(latest?.apiRoundName).toBe("Q3");

    const points = computeReverseGridPointsForRace(race, {
      enabled: true,
      pointsTable: { "1": 6, "2": 4, "3": 2 },
    });

    expect(points.get("d1")).toBe(6);
    expect(points.get("d2")).toBe(4);
  });

  it("recognizes Q1/Q2/Q3 names even without QUALIFICATION apiRoundType", () => {
    const race = {
      eventRounds: [
        {
          apiRoundName: "Q1",
          apiRoundType: "ROUND",
          results: [{ driverId: "d1", position: 3, disqualified: false }],
        },
        {
          apiRoundName: "Q3",
          apiRoundType: "ROUND",
          results: [{ driverId: "d1", position: 1, disqualified: false }],
        },
      ],
    };

    const latest = getLatestQualifyingRound(race);
    expect(latest?.apiRoundName).toBe("Q3");

    const points = computeReverseGridPointsForRace(race, {
      enabled: true,
      pointsTable: { "1": 8 },
    });
    expect(points.get("d1")).toBe(8);
  });

  it("gives zero when latest qualifying is DSQ/missing/outside table", () => {
    const race = {
      eventRounds: [
        {
          apiRoundName: "Q2",
          apiRoundType: "QUALIFICATION",
          results: [
            { driverId: "d1", position: 1, disqualified: true },
            { driverId: "d2", position: 8, disqualified: false },
          ],
        },
      ],
    };

    const points = computeReverseGridPointsForRace(race, {
      enabled: true,
      pointsTable: { "1": 6, "2": 4 },
    });

    expect(points.size).toBe(0);
    expect(points.get("d1")).toBeUndefined();
    expect(points.get("d2")).toBeUndefined();
  });
});
