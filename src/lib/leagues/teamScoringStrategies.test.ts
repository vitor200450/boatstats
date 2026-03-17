import { describe, expect, it } from "vitest";

import { calculateTeamStatsByMode } from "@/lib/leagues/teamScoringStrategies";
import sampleEvent from "../../../W4FC-response.json";
import { FrosthexEventResultResponse } from "@/services/frosthexAPI";

const seasonSprintConfig = { defaultMode: "CLASSIFICATION" as const };
const event = sampleEvent as FrosthexEventResultResponse;

function toMapStats(stats: ReturnType<typeof calculateTeamStatsByMode>, teamId: string) {
  const value = stats.get(teamId);
  expect(value).toBeDefined();
  return value!;
}

describe("calculateTeamStatsByMode", () => {
  it("processes data converted from Frosthex API event model", () => {
    const qualifyingRound = event.rounds.find((round) => round.type === "QUALIFICATION");
    const finalRound = event.rounds.find((round) => round.type === "FINAL");

    expect(qualifyingRound).toBeDefined();
    expect(finalRound).toBeDefined();

    const qualifyingHeat = qualifyingRound!.heats[0];
    const finalHeat = finalRound!.heats[0];
    const topFinalDrivers = finalHeat.driver_results.slice(0, 6);

    const pointsByPosition: Record<number, number> = {
      1: 25,
      2: 18,
      3: 15,
      4: 12,
      5: 10,
      6: 8,
    };

    const raceDate = new Date(event.date * 1000);

    const stats = calculateTeamStatsByMode({
      mode: "STANDARD",
      seasonSprintConfig,
      depthChartEntries: [],
      slotRosterEntries: [],
      teamAssignments: [
        {
          teamId: "team-a",
          driverId: topFinalDrivers[0].uuid,
          joinedAt: raceDate,
          leftAt: null,
        },
        {
          teamId: "team-a",
          driverId: topFinalDrivers[1].uuid,
          joinedAt: raceDate,
          leftAt: null,
        },
        {
          teamId: "team-a",
          driverId: topFinalDrivers[2].uuid,
          joinedAt: raceDate,
          leftAt: null,
        },
        {
          teamId: "team-b",
          driverId: topFinalDrivers[3].uuid,
          joinedAt: raceDate,
          leftAt: null,
        },
        {
          teamId: "team-b",
          driverId: topFinalDrivers[4].uuid,
          joinedAt: raceDate,
          leftAt: null,
        },
        {
          teamId: "team-b",
          driverId: topFinalDrivers[5].uuid,
          joinedAt: raceDate,
          leftAt: null,
        },
      ],
      races: [
        {
          id: "api-race-monaco",
          round: 1,
          createdAt: raceDate,
          scheduledDate: raceDate,
          eventRounds: [
            {
              apiRoundName: qualifyingRound!.name,
              apiRoundType: qualifyingRound!.type,
              countsForStandings: false,
              results: qualifyingHeat.driver_results.map((driverResult) => ({
                driverId: driverResult.uuid,
                position: driverResult.position,
                points: 0,
              })),
            },
            {
              apiRoundName: finalRound!.name,
              apiRoundType: finalRound!.type,
              countsForStandings: true,
              results: topFinalDrivers.map((driverResult) => ({
                driverId: driverResult.uuid,
                position: driverResult.position,
                points: pointsByPosition[driverResult.position] ?? 0,
              })),
            },
          ],
        },
      ],
    });

    const teamA = toMapStats(stats, "team-a");
    const teamB = toMapStats(stats, "team-b");

    expect(teamA.totalPoints).toBe(58);
    expect(teamB.totalPoints).toBe(30);
    expect(teamA.totalPoints).toBeGreaterThan(teamB.totalPoints);
  });

  it("applies DEPTH_CHART using real API qualification participation", () => {
    const qualifyingRound = event.rounds.find((round) => round.type === "QUALIFICATION");
    const finalRound = event.rounds.find((round) => round.type === "FINAL");

    expect(qualifyingRound).toBeDefined();
    expect(finalRound).toBeDefined();

    const qualifyingHeat = qualifyingRound!.heats[0];
    const finalHeat = finalRound!.heats[0];
    const topFourFinalDrivers = finalHeat.driver_results.slice(0, 4);

    const stats = calculateTeamStatsByMode({
      mode: "DEPTH_CHART",
      seasonSprintConfig,
      teamAssignments: [],
      slotRosterEntries: [],
      depthChartEntries: [
        { seasonId: "s", teamId: "team-a", driverId: topFourFinalDrivers[0].uuid, priority: 1 },
        // fake/non-qualified driver should be ignored by qualification gating
        { seasonId: "s", teamId: "team-a", driverId: "00000000-0000-0000-0000-000000000001", priority: 2 },
        { seasonId: "s", teamId: "team-a", driverId: topFourFinalDrivers[1].uuid, priority: 3 },
        { seasonId: "s", teamId: "team-a", driverId: topFourFinalDrivers[2].uuid, priority: 4 },
        { seasonId: "s", teamId: "team-a", driverId: topFourFinalDrivers[3].uuid, priority: 5 },
      ],
      races: [
        {
          id: "api-depth-race",
          round: 1,
          createdAt: new Date(event.date * 1000),
          scheduledDate: new Date(event.date * 1000),
          eventRounds: [
            {
              apiRoundName: qualifyingRound!.name,
              apiRoundType: qualifyingRound!.type,
              countsForStandings: false,
              results: qualifyingHeat.driver_results.map((driverResult) => ({
                driverId: driverResult.uuid,
                position: driverResult.position,
                points: 0,
              })),
            },
            {
              apiRoundName: finalRound!.name,
              apiRoundType: finalRound!.type,
              countsForStandings: true,
              results: topFourFinalDrivers.map((driverResult) => ({
                driverId: driverResult.uuid,
                position: driverResult.position,
                points: ({ 1: 25, 2: 18, 3: 15, 4: 12 }[driverResult.position] ?? 0),
              })),
            },
          ],
        },
      ],
    });

    const teamA = toMapStats(stats, "team-a");
    // counts top 3 eligible from depth chart = P1 + P2 + P3
    expect(teamA.totalPoints).toBe(58);
  });

  it("applies SLOT_MULLIGAN slots with API rounds and missing eligible driver", () => {
    const qualifyingRound = event.rounds.find((round) => round.type === "QUALIFICATION");
    const finalRound = event.rounds.find((round) => round.type === "FINAL");

    expect(qualifyingRound).toBeDefined();
    expect(finalRound).toBeDefined();

    const qualifyingHeat = qualifyingRound!.heats[0];
    const finalHeat = finalRound!.heats[0];
    const topTwoFinalDrivers = finalHeat.driver_results.slice(0, 2);

    const stats = calculateTeamStatsByMode({
      mode: "SLOT_MULLIGAN",
      seasonSprintConfig,
      teamSlotMulliganCount: 0,
      depthChartEntries: [],
      teamAssignments: [
        {
          teamId: "team-a",
          driverId: topTwoFinalDrivers[0].uuid,
          joinedAt: new Date(event.date * 1000),
          leftAt: null,
        },
        {
          teamId: "team-a",
          driverId: topTwoFinalDrivers[1].uuid,
          joinedAt: new Date(event.date * 1000),
          leftAt: null,
        },
      ],
      slotRosterEntries: [
        {
          seasonId: "s",
          raceId: "api-slot-race",
          teamId: "team-a",
          driverId: topTwoFinalDrivers[0].uuid,
          role: "MAIN",
          priority: 1,
        },
        {
          seasonId: "s",
          raceId: "api-slot-race",
          teamId: "team-a",
          driverId: "00000000-0000-0000-0000-000000000002",
          role: "MAIN",
          priority: 2,
        },
        {
          seasonId: "s",
          raceId: "api-slot-race",
          teamId: "team-a",
          driverId: topTwoFinalDrivers[1].uuid,
          role: "RESERVE",
          priority: 1,
        },
      ],
      races: [
        {
          id: "api-slot-race",
          round: 1,
          createdAt: new Date(event.date * 1000),
          scheduledDate: new Date(event.date * 1000),
          eventRounds: [
            {
              apiRoundName: qualifyingRound!.name,
              apiRoundType: qualifyingRound!.type,
              countsForStandings: false,
              results: qualifyingHeat.driver_results.map((driverResult) => ({
                driverId: driverResult.uuid,
                position: driverResult.position,
                points: 0,
              })),
            },
            {
              apiRoundName: finalRound!.name,
              apiRoundType: finalRound!.type,
              countsForStandings: true,
              results: topTwoFinalDrivers.map((driverResult) => ({
                driverId: driverResult.uuid,
                position: driverResult.position,
                points: ({ 1: 25, 2: 18 }[driverResult.position] ?? 0),
              })),
            },
          ],
        },
      ],
    });

    const teamA = toMapStats(stats, "team-a");
    expect(teamA.racePoints["api-slot-race"]).toEqual({ D1: 25, D2: 18, D3: 0, total: 43 });
    expect(teamA.totalPoints).toBe(43);
  });

  it("fills missing SLOT_MULLIGAN slots with fallback drivers when MAIN < 3", () => {
    const stats = calculateTeamStatsByMode({
      mode: "SLOT_MULLIGAN",
      seasonSprintConfig,
      teamSlotMulliganCount: 0,
      depthChartEntries: [],
      teamAssignments: [
        {
          teamId: "team-a",
          driverId: "d1",
          joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          leftAt: null,
        },
        {
          teamId: "team-a",
          driverId: "d2",
          joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          leftAt: null,
        },
        {
          teamId: "team-a",
          driverId: "d3",
          joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          leftAt: null,
        },
      ],
      slotRosterEntries: [
        {
          seasonId: "s",
          raceId: "race-1",
          teamId: "team-a",
          driverId: "d1",
          role: "MAIN",
          priority: 1,
        },
      ],
      races: [
        {
          id: "race-1",
          round: 1,
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          scheduledDate: new Date("2026-02-01T00:00:00.000Z"),
          eventRounds: [
            {
              apiRoundName: "Main Race",
              apiRoundType: "RACE",
              countsForStandings: true,
              results: [
                { driverId: "d1", position: 1, points: 25 },
                { driverId: "d2", position: 2, points: 18 },
                { driverId: "d3", position: 3, points: 15 },
              ],
            },
          ],
        },
      ],
    });

    const teamA = toMapStats(stats, "team-a");
    expect(teamA.racePoints["race-1"]).toEqual({ D1: 25, D2: 18, D3: 15, total: 58 });
    expect(teamA.totalPoints).toBe(58);
  });

  it("uses highest-scoring RESERVE when MAIN slot is missing", () => {
    const stats = calculateTeamStatsByMode({
      mode: "SLOT_MULLIGAN",
      seasonSprintConfig,
      teamSlotMulliganCount: 0,
      depthChartEntries: [],
      teamAssignments: [
        { teamId: "team-a", driverId: "m1", joinedAt: new Date("2026-01-01"), leftAt: null },
        { teamId: "team-a", driverId: "m2", joinedAt: new Date("2026-01-01"), leftAt: null },
        { teamId: "team-a", driverId: "m3", joinedAt: new Date("2026-01-01"), leftAt: null },
        { teamId: "team-a", driverId: "r1", joinedAt: new Date("2026-01-01"), leftAt: null },
        { teamId: "team-a", driverId: "r2", joinedAt: new Date("2026-01-01"), leftAt: null },
      ],
      slotRosterEntries: [
        { seasonId: "s", raceId: "race-1", teamId: "team-a", driverId: "m1", role: "MAIN", priority: 1 },
        { seasonId: "s", raceId: "race-1", teamId: "team-a", driverId: "m2", role: "MAIN", priority: 2 },
        { seasonId: "s", raceId: "race-1", teamId: "team-a", driverId: "m3", role: "MAIN", priority: 3 },
        { seasonId: "s", raceId: "race-1", teamId: "team-a", driverId: "r1", role: "RESERVE", priority: 1 },
        { seasonId: "s", raceId: "race-1", teamId: "team-a", driverId: "r2", role: "RESERVE", priority: 2 },
      ],
      races: [
        {
          id: "race-1",
          round: 1,
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          scheduledDate: new Date("2026-02-01T00:00:00.000Z"),
          eventRounds: [
            {
              apiRoundName: "Main Race",
              apiRoundType: "RACE",
              countsForStandings: true,
              results: [
                { driverId: "m1", position: 1, points: 25 },
                { driverId: "m2", position: 2, points: 18 },
                // m3 missing
                { driverId: "r1", position: 7, points: 6 },
                { driverId: "r2", position: 3, points: 15 },
              ],
            },
          ],
        },
      ],
    });

    const teamA = toMapStats(stats, "team-a");
    expect(teamA.racePoints["race-1"]).toEqual({ D1: 25, D2: 18, D3: 15, total: 58 });
    expect(teamA.totalPoints).toBe(58);
  });

  it("calculates STANDARD mode using assignment date windows", () => {
    const stats = calculateTeamStatsByMode({
      mode: "STANDARD",
      seasonSprintConfig,
      depthChartEntries: [],
      slotRosterEntries: [],
      teamAssignments: [
        {
          teamId: "team-a",
          driverId: "driver-1",
          joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          leftAt: null,
        },
      ],
      races: [
        {
          id: "race-1",
          round: 1,
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          scheduledDate: new Date("2026-02-01T00:00:00.000Z"),
          eventRounds: [
            {
              apiRoundName: "Main Race",
              apiRoundType: "RACE",
              countsForStandings: true,
              results: [
                { driverId: "driver-1", position: 1, points: 25 },
                { driverId: "driver-x", position: 2, points: 18 },
              ],
            },
          ],
        },
      ],
    });

    const teamA = toMapStats(stats, "team-a");
    expect(teamA.totalPoints).toBe(25);
    expect(teamA.wins).toBe(1);
    expect(teamA.podiums).toBe(1);
    expect(teamA.racePoints["race-1"]["Main Race"]).toBe(25);
  });

  it("calculates DEPTH_CHART mode by fallback to next active priority", () => {
    const stats = calculateTeamStatsByMode({
      mode: "DEPTH_CHART",
      seasonSprintConfig,
      teamAssignments: [],
      slotRosterEntries: [],
      depthChartEntries: [
        { seasonId: "s", teamId: "team-a", driverId: "d1", priority: 1 },
        { seasonId: "s", teamId: "team-a", driverId: "d2", priority: 2 },
        { seasonId: "s", teamId: "team-a", driverId: "d3", priority: 3 },
        { seasonId: "s", teamId: "team-a", driverId: "d4", priority: 4 },
      ],
      races: [
        {
          id: "race-1",
          round: 1,
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          scheduledDate: new Date("2026-03-01T00:00:00.000Z"),
          eventRounds: [
            {
              apiRoundName: "Qualifying",
              apiRoundType: "QUALIFICATION",
              countsForStandings: false,
              results: [
                { driverId: "d1", position: 1, points: 0 },
                { driverId: "d3", position: 2, points: 0 },
                { driverId: "d4", position: 3, points: 0 },
              ],
            },
            {
              apiRoundName: "Main Race",
              apiRoundType: "RACE",
              countsForStandings: true,
              results: [
                { driverId: "d1", position: 1, points: 25 },
                { driverId: "d2", position: 2, points: 18 },
                { driverId: "d3", position: 3, points: 15 },
                { driverId: "d4", position: 4, points: 12 },
              ],
            },
          ],
        },
      ],
    });

    const teamA = toMapStats(stats, "team-a");
    // d2 did not run qualifying but raced in scoring round, so it replaces missing top priority slot
    expect(teamA.totalPoints).toBe(25 + 18 + 15);
    expect(teamA.racePoints["race-1"]["Main Race"]).toBe(58);
  });

  it("calculates SLOT_MULLIGAN mode with deterministic mulligan removal", () => {
    const stats = calculateTeamStatsByMode({
      mode: "SLOT_MULLIGAN",
      seasonSprintConfig,
      depthChartEntries: [],
      teamAssignments: [
        { teamId: "team-a", driverId: "d1", joinedAt: new Date("2026-01-01"), leftAt: null },
        { teamId: "team-a", driverId: "d2", joinedAt: new Date("2026-01-01"), leftAt: null },
        { teamId: "team-a", driverId: "d3", joinedAt: new Date("2026-01-01"), leftAt: null },
      ],
      slotRosterEntries: [
        { seasonId: "s", raceId: "r1", teamId: "team-a", driverId: "d1", role: "MAIN", priority: 1 },
        { seasonId: "s", raceId: "r1", teamId: "team-a", driverId: "d2", role: "MAIN", priority: 2 },
        { seasonId: "s", raceId: "r1", teamId: "team-a", driverId: "d3", role: "MAIN", priority: 3 },
        { seasonId: "s", raceId: "r2", teamId: "team-a", driverId: "d1", role: "MAIN", priority: 1 },
        { seasonId: "s", raceId: "r2", teamId: "team-a", driverId: "d2", role: "MAIN", priority: 2 },
        { seasonId: "s", raceId: "r2", teamId: "team-a", driverId: "d3", role: "MAIN", priority: 3 },
        { seasonId: "s", raceId: "r3", teamId: "team-a", driverId: "d1", role: "MAIN", priority: 1 },
        { seasonId: "s", raceId: "r3", teamId: "team-a", driverId: "d2", role: "MAIN", priority: 2 },
        { seasonId: "s", raceId: "r3", teamId: "team-a", driverId: "d3", role: "MAIN", priority: 3 },
      ],
      teamSlotMulliganCount: 1,
      seasonCompleted: true,
      races: [
        {
          id: "r1",
          round: 1,
          createdAt: new Date("2026-01-01"),
          scheduledDate: new Date("2026-01-01"),
          eventRounds: [
            {
              apiRoundName: "Qualifying",
              apiRoundType: "QUALIFICATION",
              countsForStandings: false,
              results: [
                { driverId: "d1", position: 1, points: 0 },
                { driverId: "d2", position: 2, points: 0 },
                { driverId: "d3", position: 3, points: 0 },
              ],
            },
            {
              apiRoundName: "Race",
              apiRoundType: "RACE",
              countsForStandings: true,
              results: [
                { driverId: "d1", position: 2, points: 18 },
                { driverId: "d2", position: 1, points: 25 },
                { driverId: "d3", position: 3, points: 15 },
              ],
            },
          ],
        },
        {
          id: "r2",
          round: 2,
          createdAt: new Date("2026-01-08"),
          scheduledDate: new Date("2026-01-08"),
          eventRounds: [
            {
              apiRoundName: "Qualifying",
              apiRoundType: "QUALIFICATION",
              countsForStandings: false,
              results: [
                { driverId: "d1", position: 1, points: 0 },
                { driverId: "d2", position: 2, points: 0 },
                { driverId: "d3", position: 3, points: 0 },
              ],
            },
            {
              apiRoundName: "Race",
              apiRoundType: "RACE",
              countsForStandings: true,
              results: [
                { driverId: "d1", position: 4, points: 12 },
                { driverId: "d2", position: 5, points: 10 },
                { driverId: "d3", position: 6, points: 8 },
              ],
            },
          ],
        },
        {
          id: "r3",
          round: 3,
          createdAt: new Date("2026-01-15"),
          scheduledDate: new Date("2026-01-15"),
          eventRounds: [
            {
              apiRoundName: "Qualifying",
              apiRoundType: "QUALIFICATION",
              countsForStandings: false,
              results: [
                { driverId: "d1", position: 1, points: 0 },
                { driverId: "d2", position: 2, points: 0 },
                { driverId: "d3", position: 3, points: 0 },
              ],
            },
            {
              apiRoundName: "Race",
              apiRoundType: "RACE",
              countsForStandings: true,
              results: [
                { driverId: "d1", position: 4, points: 12 },
                { driverId: "d2", position: 4, points: 12 },
                { driverId: "d3", position: 4, points: 12 },
              ],
            },
          ],
        },
      ],
    });

    const teamA = toMapStats(stats, "team-a");

    // Raw totals: r1(58) + r2(30) + r3(36) = 124
    // Mulligan 1 per slot removes: D1=12 (r2 by raceId tie-break), D2=10, D3=8 => 30
    expect(teamA.totalPoints).toBe(94);
    expect(teamA.racePoints.r1).toEqual({ D1: 25, D2: 18, D3: 15, total: 58 });
    expect(teamA.racePoints.r2).toEqual({ D1: 12, D2: 10, D3: 8, total: 30 });
    expect(teamA.racePoints.r3).toEqual({ D1: 12, D2: 12, D3: 12, total: 36 });
  });

  it("ignores disqualified drivers in team scoring", () => {
    const stats = calculateTeamStatsByMode({
      mode: "STANDARD",
      seasonSprintConfig,
      depthChartEntries: [],
      slotRosterEntries: [],
      teamAssignments: [
        {
          teamId: "team-a",
          driverId: "driver-1",
          joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          leftAt: null,
        },
      ],
      races: [
        {
          id: "race-1",
          round: 1,
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          scheduledDate: new Date("2026-02-01T00:00:00.000Z"),
          eventRounds: [
            {
              apiRoundName: "Main Race",
              apiRoundType: "RACE",
              countsForStandings: true,
              results: [
                { driverId: "driver-1", position: 1, points: 25, disqualified: true },
              ],
            },
          ],
        },
      ],
    });

    expect(stats.has("team-a")).toBe(false);
  });
});
