import { describe, expect, it } from "vitest";

import { calculateTeamStatsByMode } from "@/lib/leagues/teamScoringStrategies";

const seasonSprintConfig = { defaultMode: "CLASSIFICATION" as const };

function serializeTeamStats(
  map: ReturnType<typeof calculateTeamStatsByMode>,
): Array<{
  teamId: string;
  totalPoints: number;
  wins: number;
  podiums: number;
  bestFinishes: Record<string, number>;
  racePoints: Record<string, Record<string, number>>;
}> {
  return [...map.entries()]
    .map(([teamId, stats]) => ({ teamId, ...stats }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId));
}

describe("team scoring regression snapshots", () => {
  it("keeps STANDARD standings output stable", () => {
    const result = calculateTeamStatsByMode({
      mode: "STANDARD",
      seasonSprintConfig,
      depthChartEntries: [],
      slotRosterEntries: [],
      teamAssignments: [
        { teamId: "team-a", driverId: "d1", joinedAt: new Date("2026-01-01"), leftAt: null },
        { teamId: "team-a", driverId: "d2", joinedAt: new Date("2026-01-01"), leftAt: null },
        { teamId: "team-b", driverId: "d3", joinedAt: new Date("2026-01-01"), leftAt: null },
        { teamId: "team-b", driverId: "d4", joinedAt: new Date("2026-01-01"), leftAt: null },
      ],
      races: [
        {
          id: "race-1",
          round: 1,
          createdAt: new Date("2026-01-01"),
          scheduledDate: new Date("2026-01-01"),
          eventRounds: [
            {
              apiRoundName: "Race",
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

    expect(serializeTeamStats(result)).toMatchInlineSnapshot(`
      [
        {
          "bestFinishes": {
            "1": 1,
            "2": 1,
          },
          "podiums": 2,
          "racePoints": {
            "race-1": {
              "Race": 43,
            },
          },
          "teamId": "team-a",
          "totalPoints": 43,
          "wins": 1,
        },
        {
          "bestFinishes": {
            "3": 1,
            "4": 1,
          },
          "podiums": 1,
          "racePoints": {
            "race-1": {
              "Race": 27,
            },
          },
          "teamId": "team-b",
          "totalPoints": 27,
          "wins": 0,
        },
      ]
    `);
  });

  it("keeps DEPTH_CHART standings output stable", () => {
    const result = calculateTeamStatsByMode({
      mode: "DEPTH_CHART",
      seasonSprintConfig,
      teamAssignments: [],
      slotRosterEntries: [],
      depthChartEntries: [
        { seasonId: "s", teamId: "team-a", driverId: "d1", priority: 1 },
        { seasonId: "s", teamId: "team-a", driverId: "d2", priority: 2 },
        { seasonId: "s", teamId: "team-a", driverId: "d5", priority: 3 },
        { seasonId: "s", teamId: "team-b", driverId: "d3", priority: 1 },
        { seasonId: "s", teamId: "team-b", driverId: "d4", priority: 2 },
      ],
      races: [
        {
          id: "race-1",
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
                { driverId: "d4", position: 4, points: 0 },
              ],
            },
            {
              apiRoundName: "Race",
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

    expect(serializeTeamStats(result)).toMatchInlineSnapshot(`
      [
        {
          "bestFinishes": {
            "1": 1,
            "2": 1,
          },
          "podiums": 2,
          "racePoints": {
            "race-1": {
              "Race": 43,
            },
          },
          "teamId": "team-a",
          "totalPoints": 43,
          "wins": 1,
        },
        {
          "bestFinishes": {
            "3": 1,
            "4": 1,
          },
          "podiums": 1,
          "racePoints": {
            "race-1": {
              "Race": 27,
            },
          },
          "teamId": "team-b",
          "totalPoints": 27,
          "wins": 0,
        },
      ]
    `);
  });

  it("keeps SLOT_MULLIGAN standings output stable", () => {
    const result = calculateTeamStatsByMode({
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
      ],
      teamSlotMulliganCount: 1,
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
                { driverId: "d1", position: 1, points: 25 },
                { driverId: "d2", position: 2, points: 18 },
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
      ],
    });

    expect(serializeTeamStats(result)).toMatchInlineSnapshot(`
      [
        {
          "bestFinishes": {
            "1": 1,
            "2": 1,
            "3": 1,
            "4": 1,
            "5": 1,
            "6": 1,
          },
          "podiums": 3,
          "racePoints": {
            "r1": {
              "D1": 25,
              "D2": 18,
              "D3": 15,
              "total": 58,
            },
            "r2": {
              "D1": 12,
              "D2": 10,
              "D3": 8,
              "total": 30,
            },
          },
          "teamId": "team-a",
          "totalPoints": 88,
          "wins": 1,
        },
      ]
    `);
  });
});
