import { describe, expect, it } from "vitest";

import { F1_STANDARD_POINTS, PointsSystem } from "@/lib/leagues/pointsSystem";
import { getTeamScoringConfig } from "@/lib/leagues/teamScoringConfig";

describe("getTeamScoringConfig", () => {
  it("uses safe defaults for legacy configurations", () => {
    const config = getTeamScoringConfig(F1_STANDARD_POINTS);

    expect(config).toEqual({
      mode: "STANDARD",
      driverMulliganCount: 0,
      teamSlotMulliganCount: 0,
    });
  });

  it("normalizes mulligan counts and keeps explicit mode", () => {
    const custom: PointsSystem = {
      ...F1_STANDARD_POINTS,
      rules: {
        teamScoringMode: "SLOT_MULLIGAN",
        driverMulliganCount: -3,
        teamSlotMulliganCount: 2.9,
      },
    };

    const config = getTeamScoringConfig(custom);

    expect(config).toEqual({
      mode: "SLOT_MULLIGAN",
      driverMulliganCount: 0,
      teamSlotMulliganCount: 2,
    });
  });
});
