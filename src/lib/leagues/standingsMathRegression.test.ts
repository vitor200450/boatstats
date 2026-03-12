import { describe, expect, it } from "vitest";

import {
  compareStandingsByTieBreak,
  sumLowestRacePoints,
  StandingSortEntry,
} from "@/lib/leagues/standingsMath";

describe("standings math regression", () => {
  it("keeps deterministic mulligan removal order stable", () => {
    const racePoints = {
      r3: { Race: 8 },
      r1: { Race: 8 },
      r2: { Race: 12 },
      r4: { Race: 20 },
    };

    // For equal low scores (r1/r3 = 8), alphabetical raceId tiebreak applies.
    expect(sumLowestRacePoints(racePoints, 2)).toBe(16);
    expect(sumLowestRacePoints(racePoints, 1)).toBe(8);
  });

  it("never removes all race points when mulligan exceeds races", () => {
    const oneRace = {
      r1: { Final: 40 },
    };

    const twoRaces = {
      r1: { Final: 40 },
      r2: { Final: 20 },
    };

    expect(sumLowestRacePoints(oneRace, 3)).toBe(0);
    expect(sumLowestRacePoints(twoRaces, 3)).toBe(20);
  });

  it("keeps standings tie-break order stable", () => {
    const entries: Array<{ id: string } & StandingSortEntry> = [
      {
        id: "driver-a",
        totalPoints: 100,
        wins: 2,
        podiums: 4,
        bestFinishes: { "1": 2, "2": 1, "3": 1 },
      },
      {
        id: "driver-b",
        totalPoints: 100,
        wins: 2,
        podiums: 4,
        bestFinishes: { "1": 2, "2": 2 },
      },
      {
        id: "driver-c",
        totalPoints: 100,
        wins: 1,
        podiums: 6,
        bestFinishes: { "1": 1, "2": 4, "3": 1 },
      },
      {
        id: "driver-d",
        totalPoints: 98,
        wins: 5,
        podiums: 5,
        bestFinishes: { "1": 5 },
      },
    ];

    const ordered = [...entries]
      .sort((a, b) => compareStandingsByTieBreak(a, b))
      .map((entry) => entry.id);

    expect(ordered).toMatchInlineSnapshot(`
      [
        "driver-b",
        "driver-a",
        "driver-c",
        "driver-d",
      ]
    `);
  });
});
