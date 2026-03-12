import { describe, expect, it } from "vitest";

import {
  normalizeRaceImportBonuses,
  selectPrimaryScoringRound,
} from "@/lib/leagues/raceImportBonus";

describe("raceImportBonus helpers", () => {
  it("selects final/race round as primary scoring round", () => {
    const selected = selectPrimaryScoringRound([
      {
        id: "q1",
        apiRoundName: "R1-Qualy",
        apiRoundType: "QUALIFICATION",
      },
      {
        id: "f1",
        apiRoundName: "R2-Final",
        apiRoundType: "FINAL",
      },
    ]);

    expect(selected?.id).toBe("f1");
  });

  it("accepts positive and negative integer bonuses and removes zero values", () => {
    const result = normalizeRaceImportBonuses([
      { driverUuid: "uuid-1", points: 3 },
      { driverUuid: "uuid-2", points: -2 },
      { driverUuid: "uuid-3", points: 0 },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bonuses).toEqual([
        { driverUuid: "uuid-1", points: 3 },
        { driverUuid: "uuid-2", points: -2 },
      ]);
    }
  });

  it("rejects invalid bonus payload with duplicate drivers", () => {
    const result = normalizeRaceImportBonuses([
      { driverUuid: "uuid-1", points: 1 },
      { driverUuid: "uuid-1", points: 2 },
    ]);

    expect(result).toEqual({
      ok: false,
      error: "Piloto duplicado no bônus da corrida",
    });
  });

  it("rejects non-integer bonus values", () => {
    const result = normalizeRaceImportBonuses([
      { driverUuid: "uuid-1", points: 1.5 },
    ]);

    expect(result).toEqual({
      ok: false,
      error: "Bônus deve ser um número inteiro",
    });
  });
});
