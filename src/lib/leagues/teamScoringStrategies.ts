import { TeamScoringMode } from "@/lib/leagues/pointsSystem";
import { roundCountsForStandings, SeasonSprintConfig } from "@/lib/leagues/roundRules";

export type TeamStats = {
  totalPoints: number;
  wins: number;
  podiums: number;
  bestFinishes: Record<string, number>;
  racePoints: Record<string, Record<string, number>>;
};

export type TeamRaceContributors = Map<string, Record<string, string[]>>;

type AssignmentLike = {
  id?: string;
  teamId: string;
  driverId: string;
  effectiveFromRound?: number;
  effectiveToRound?: number | null;
  joinedAt: Date;
  leftAt: Date | null;
  updatedAt?: Date;
};

type RoundResultLike = {
  driverId: string;
  position: number;
  points: number;
  disqualified?: boolean | null;
};

type EventRoundLike = {
  apiRoundName: string;
  apiRoundType: string;
  specialType?: string;
  sprintMode?: string | null;
  pointsSystem?: unknown;
  countsForStandings?: boolean;
  results: RoundResultLike[];
};

type RaceLike = {
  id: string;
  round: number;
  createdAt: Date;
  scheduledDate: Date | null;
  eventRounds: EventRoundLike[];
};

type DepthChartEntryLike = {
  seasonId: string;
  teamId: string;
  driverId: string;
  priority: number;
  effectiveFromRound?: number;
  effectiveToRound?: number | null;
};

type SlotRosterEntryLike = {
  seasonId: string;
  raceId: string;
  teamId: string;
  driverId: string;
  role: "MAIN" | "RESERVE";
  priority: number;
};

function isReverseGridRound(round: EventRoundLike): boolean {
  return round.apiRoundType === "REVERSE_GRID_QUALI";
}

function isAssignmentActiveAtRound(
  assignment: AssignmentLike,
  roundNumber: number,
  raceReferenceDate: Date,
): boolean {
  if (typeof assignment.effectiveFromRound === "number") {
    const fromRound = assignment.effectiveFromRound;
    const toRound = assignment.effectiveToRound ?? null;
    return fromRound <= roundNumber && (toRound === null || toRound >= roundNumber);
  }

  return (
    assignment.joinedAt <= raceReferenceDate &&
    (!assignment.leftAt || assignment.leftAt > raceReferenceDate)
  );
}

function isCandidateAssignmentNewer(
  current: AssignmentLike | undefined,
  candidate: AssignmentLike,
): boolean {
  if (!current) return true;

  const currentUpdatedAt = (current.updatedAt ?? current.joinedAt).getTime();
  const candidateUpdatedAt = (candidate.updatedAt ?? candidate.joinedAt).getTime();
  if (candidateUpdatedAt !== currentUpdatedAt) {
    return candidateUpdatedAt > currentUpdatedAt;
  }

  const currentId = current.id ?? "";
  const candidateId = candidate.id ?? "";
  return candidateId.localeCompare(currentId) > 0;
}

function resolveRaceDriverTeams(
  teamAssignments: AssignmentLike[],
  raceRound: number,
  raceReferenceDate: Date,
): Map<string, string> {
  const activeAssignmentByDriver = new Map<string, AssignmentLike>();

  for (const assignment of teamAssignments) {
    if (!isAssignmentActiveAtRound(assignment, raceRound, raceReferenceDate)) continue;

    const current = activeAssignmentByDriver.get(assignment.driverId);
    if (isCandidateAssignmentNewer(current, assignment)) {
      activeAssignmentByDriver.set(assignment.driverId, assignment);
    }
  }

  const raceDriverTeams = new Map<string, string>();
  for (const [driverId, assignment] of activeAssignmentByDriver.entries()) {
    raceDriverTeams.set(driverId, assignment.teamId);
  }

  return raceDriverTeams;
}

function getDepthChartSnapshotByTeam(
  depthChartEntries: DepthChartEntryLike[],
  roundNumber: number,
): Map<string, DepthChartEntryLike[]> {
  const latestVersionByTeam = new Map<string, number>();

  for (const entry of depthChartEntries) {
    const fromRound = entry.effectiveFromRound ?? 1;
    const toRound = entry.effectiveToRound ?? null;
    if (fromRound > roundNumber) continue;
    if (toRound !== null && toRound < roundNumber) continue;

    const current = latestVersionByTeam.get(entry.teamId) ?? Number.MIN_SAFE_INTEGER;
    if (fromRound > current) {
      latestVersionByTeam.set(entry.teamId, fromRound);
    }
  }

  const snapshotByTeam = new Map<string, DepthChartEntryLike[]>();
  for (const entry of depthChartEntries) {
    const fromRound = entry.effectiveFromRound ?? 1;
    if (latestVersionByTeam.get(entry.teamId) !== fromRound) continue;

    const list = snapshotByTeam.get(entry.teamId) ?? [];
    list.push(entry);
    snapshotByTeam.set(entry.teamId, list);
  }

  for (const [teamId, entries] of snapshotByTeam.entries()) {
    entries.sort((a, b) => a.priority - b.priority || a.driverId.localeCompare(b.driverId));
    snapshotByTeam.set(teamId, entries);
  }

  return snapshotByTeam;
}

export function calculateTeamStatsByMode(params: {
  mode: TeamScoringMode;
  races: RaceLike[];
  teamAssignments: AssignmentLike[];
  depthChartEntries?: DepthChartEntryLike[];
  slotRosterEntries?: SlotRosterEntryLike[];
  teamSlotMulliganCount?: number;
  seasonSprintConfig: SeasonSprintConfig;
  seasonCompleted?: boolean;
}): Map<string, TeamStats> {
  const {
    mode,
    races,
    teamAssignments,
    depthChartEntries = [],
    slotRosterEntries = [],
    teamSlotMulliganCount = 3,
    seasonSprintConfig,
    seasonCompleted = false,
  } = params;

  if (mode === "SLOT_MULLIGAN") {
    return calculateSlotMulliganTeamStats({
      races,
      teamAssignments,
      slotRosterEntries,
      teamSlotMulliganCount,
      seasonSprintConfig,
      seasonCompleted,
    });
  }

  if (mode === "DEPTH_CHART") {
    return calculateDepthChartTeamStats({
      races,
      teamAssignments,
      depthChartEntries,
      seasonSprintConfig,
    });
  }

  if (mode !== "STANDARD") {
    console.warn(
      `[TeamScoring] mode '${mode}' not implemented yet, falling back to STANDARD`,
    );
  }

  return calculateStandardTeamStats({
    races,
    teamAssignments,
    seasonSprintConfig,
  });
}

export function calculateTeamRaceContributorsByMode(params: {
  mode: TeamScoringMode;
  races: RaceLike[];
  teamAssignments: AssignmentLike[];
  depthChartEntries?: DepthChartEntryLike[];
  slotRosterEntries?: SlotRosterEntryLike[];
  teamSlotMulliganCount?: number;
  seasonSprintConfig: SeasonSprintConfig;
}): TeamRaceContributors {
  const {
    mode,
    races,
    teamAssignments,
    depthChartEntries = [],
    slotRosterEntries = [],
    seasonSprintConfig,
  } = params;

  const contributors = new Map<string, Map<string, Set<string>>>();

  const addContributor = (teamId: string, raceId: string, driverId: string) => {
    const byRace = contributors.get(teamId) ?? new Map<string, Set<string>>();
    const names = byRace.get(raceId) ?? new Set<string>();
    names.add(driverId);
    byRace.set(raceId, names);
    contributors.set(teamId, byRace);
  };

  if (mode === "SLOT_MULLIGAN") {
    const rosterByRaceTeam = new Map<string, SlotRosterEntryLike[]>();
    const allTeamIds = new Set(teamAssignments.map((assignment) => assignment.teamId));
    for (const entry of slotRosterEntries) {
      const key = `${entry.raceId}:${entry.teamId}`;
      const list = rosterByRaceTeam.get(key) ?? [];
      list.push(entry);
      rosterByRaceTeam.set(key, list);
    }

    for (const race of races) {
      const raceReferenceDate = race.scheduledDate ?? race.createdAt;
      const raceDriverTeams = resolveRaceDriverTeams(
        teamAssignments,
        race.round,
        raceReferenceDate,
      );

      const raceParticipants = new Set<string>();
      const racePointsByDriver = new Map<string, number>();
      for (const round of race.eventRounds) {
        if (!roundCountsForStandings(round, seasonSprintConfig)) continue;
        for (const result of round.results) {
          if (result.disqualified) continue;
          raceParticipants.add(result.driverId);
          racePointsByDriver.set(
            result.driverId,
            (racePointsByDriver.get(result.driverId) ?? 0) + result.points,
          );
        }
      }

      const aggregatedByDriver = new Map<string, { points: number; bestPosition: number }>();
      for (const round of race.eventRounds) {
        if (!roundCountsForStandings(round, seasonSprintConfig)) continue;
        for (const result of round.results) {
          if (result.disqualified) continue;
          const current = aggregatedByDriver.get(result.driverId) ?? {
            points: 0,
            bestPosition: Number.MAX_SAFE_INTEGER,
          };
          current.points += result.points;
          if (!isReverseGridRound(round)) {
            current.bestPosition = Math.min(current.bestPosition, result.position);
          }
          aggregatedByDriver.set(result.driverId, current);
        }
      }

      const teamIdsInRace = new Set<string>(allTeamIds);
      for (const rosterEntry of slotRosterEntries) {
        if (rosterEntry.raceId === race.id) {
          teamIdsInRace.add(rosterEntry.teamId);
        }
      }

      for (const teamId of teamIdsInRace) {
        const roster = [...(rosterByRaceTeam.get(`${race.id}:${teamId}`) ?? [])].sort((a, b) => {
          if (a.role !== b.role) {
            return a.role === "MAIN" ? -1 : 1;
          }
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.driverId.localeCompare(b.driverId);
        });

        const compareDriverPerformance = (driverIdA: string, driverIdB: string) => {
          const statsA = aggregatedByDriver.get(driverIdA);
          const statsB = aggregatedByDriver.get(driverIdB);
          const bestA = statsA?.bestPosition ?? Number.MAX_SAFE_INTEGER;
          const bestB = statsB?.bestPosition ?? Number.MAX_SAFE_INTEGER;
          if (bestA !== bestB) return bestA - bestB;
          const pointsA = statsA?.points ?? 0;
          const pointsB = statsB?.points ?? 0;
          if (pointsB !== pointsA) return pointsB - pointsA;
          return driverIdA.localeCompare(driverIdB);
        };

        const participatingRoster = roster.filter((entry) =>
          raceParticipants.has(entry.driverId),
        );
        const mainDriverIds = participatingRoster
          .filter((entry) => entry.role === "MAIN")
          .map((entry) => entry.driverId);
        const reserveEntries = participatingRoster.filter(
          (entry) => entry.role === "RESERVE",
        );
        reserveEntries.sort((a, b) => {
          const performance = compareDriverPerformance(a.driverId, b.driverId);
          if (performance !== 0) return performance;
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.driverId.localeCompare(b.driverId);
        });
        const reserveDriverIds = reserveEntries.map((entry) => entry.driverId);

        const eligibleDriversFromRoster: string[] = [];
        for (const driverId of [...mainDriverIds, ...reserveDriverIds]) {
          if (eligibleDriversFromRoster.includes(driverId)) continue;
          eligibleDriversFromRoster.push(driverId);
          if (eligibleDriversFromRoster.length >= 3) break;
        }

        const fallbackEligibleDrivers = [...raceParticipants]
          .filter((driverId) => raceDriverTeams.get(driverId) === teamId)
          .sort((a, b) => compareDriverPerformance(a, b))
          .slice(0, 3);

        const eligibleDrivers = [...eligibleDriversFromRoster];
        if (eligibleDrivers.length < 3) {
          for (const fallbackDriverId of fallbackEligibleDrivers) {
            if (eligibleDrivers.includes(fallbackDriverId)) continue;
            eligibleDrivers.push(fallbackDriverId);
            if (eligibleDrivers.length >= 3) break;
          }
        }

        const slotCandidates = eligibleDrivers.map((driverId) => {
          const raceStats = aggregatedByDriver.get(driverId);
          return {
            driverId,
            points: raceStats?.points ?? 0,
            bestPosition: raceStats?.bestPosition ?? Number.MAX_SAFE_INTEGER,
          };
        });

        slotCandidates.sort((a, b) => {
          if (a.bestPosition !== b.bestPosition) return a.bestPosition - b.bestPosition;
          if (b.points !== a.points) return b.points - a.points;
          return a.driverId.localeCompare(b.driverId);
        });

        for (const candidate of slotCandidates.slice(0, 3)) {
          addContributor(teamId, race.id, candidate.driverId);
        }
      }
    }
  } else if (mode === "DEPTH_CHART") {
    const hasTemporalAssignments = teamAssignments.length > 0;

    for (const race of races) {
      const raceReferenceDate = race.scheduledDate ?? race.createdAt;
      const raceDriverTeams = hasTemporalAssignments
        ? resolveRaceDriverTeams(teamAssignments, race.round, raceReferenceDate)
        : null;

      const depthChartByTeam = getDepthChartSnapshotByTeam(depthChartEntries, race.round);

      const raceParticipants = new Set<string>();
      const racePointsByDriver = new Map<string, number>();
      for (const round of race.eventRounds) {
        if (!roundCountsForStandings(round, seasonSprintConfig)) continue;
        for (const result of round.results) {
          if (result.disqualified) continue;
          raceParticipants.add(result.driverId);
          racePointsByDriver.set(
            result.driverId,
            (racePointsByDriver.get(result.driverId) ?? 0) + result.points,
          );
        }
      }

      const countingDriverToTeam = new Map<string, string>();
      const selectedByTeam = new Map<string, string[]>();
      for (const [teamId, entries] of depthChartByTeam.entries()) {
        let selectedCount = 0;
        for (const entry of entries) {
          if (selectedCount >= 3) break;
          if (raceDriverTeams && raceDriverTeams.get(entry.driverId) !== teamId) continue;
          if (!raceParticipants.has(entry.driverId)) continue;
          if ((racePointsByDriver.get(entry.driverId) ?? 0) <= 0) continue;
          if (!countingDriverToTeam.has(entry.driverId)) {
            countingDriverToTeam.set(entry.driverId, teamId);
            const selected = selectedByTeam.get(teamId) ?? [];
            selected.push(entry.driverId);
            selectedByTeam.set(teamId, selected);
            selectedCount++;
          }
        }
      }

      for (const [teamId, selectedDrivers] of selectedByTeam.entries()) {
        for (const driverId of selectedDrivers) {
          addContributor(teamId, race.id, driverId);
        }
      }

    }
  } else {
    const currentActiveTeamByDriver = new Map<string, AssignmentLike>();
    for (const assignment of teamAssignments) {
      if (!assignment.leftAt && (assignment.effectiveToRound ?? null) === null) {
        const existing = currentActiveTeamByDriver.get(assignment.driverId);
        if (isCandidateAssignmentNewer(existing, assignment)) {
          currentActiveTeamByDriver.set(assignment.driverId, assignment);
        }
      }
    }

    for (const race of races) {
      const raceReferenceDate = race.scheduledDate ?? race.createdAt;
      const raceDriverTeams = resolveRaceDriverTeams(
        teamAssignments,
        race.round,
        raceReferenceDate,
      );

      for (const round of race.eventRounds) {
        if (!roundCountsForStandings(round, seasonSprintConfig)) continue;
        for (const result of round.results) {
          if (result.disqualified || result.points <= 0) continue;
          const teamId =
            raceDriverTeams.get(result.driverId) ??
            currentActiveTeamByDriver.get(result.driverId)?.teamId;
          if (!teamId) continue;
          addContributor(teamId, race.id, result.driverId);
        }
      }
    }
  }

  const normalized: TeamRaceContributors = new Map();
  for (const [teamId, byRace] of contributors.entries()) {
    const raceMap: Record<string, string[]> = {};
    for (const [raceId, drivers] of byRace.entries()) {
      raceMap[raceId] = [...drivers].sort((a, b) => a.localeCompare(b));
    }
    normalized.set(teamId, raceMap);
  }

  return normalized;
}

function calculateSlotMulliganTeamStats(params: {
  races: RaceLike[];
  teamAssignments: AssignmentLike[];
  slotRosterEntries: SlotRosterEntryLike[];
  teamSlotMulliganCount: number;
  seasonSprintConfig: SeasonSprintConfig;
  seasonCompleted?: boolean;
}): Map<string, TeamStats> {
  const {
    races,
    teamAssignments,
    slotRosterEntries,
    teamSlotMulliganCount,
    seasonSprintConfig,
    seasonCompleted = false,
  } = params;

  const teamStats = new Map<string, TeamStats>();
  const slotHistoryByTeam = new Map<
    string,
    { D1: Array<{ raceId: string; points: number }>; D2: Array<{ raceId: string; points: number }>; D3: Array<{ raceId: string; points: number }> }
  >();

  const rosterByRaceTeam = new Map<string, SlotRosterEntryLike[]>();
  const allTeamIds = new Set(teamAssignments.map((assignment) => assignment.teamId));
  for (const entry of slotRosterEntries) {
    const key = `${entry.raceId}:${entry.teamId}`;
    const list = rosterByRaceTeam.get(key) ?? [];
    list.push(entry);
    rosterByRaceTeam.set(key, list);
  }

  for (const race of races) {
    const raceReferenceDate = race.scheduledDate ?? race.createdAt;
    const raceDriverTeams = resolveRaceDriverTeams(
      teamAssignments,
      race.round,
      raceReferenceDate,
    );

    const raceParticipants = new Set<string>();
    const racePointsByDriver = new Map<string, number>();
    for (const round of race.eventRounds) {
      if (!roundCountsForStandings(round, seasonSprintConfig)) continue;
      for (const result of round.results) {
        if (result.disqualified) continue;
        raceParticipants.add(result.driverId);
        racePointsByDriver.set(
          result.driverId,
          (racePointsByDriver.get(result.driverId) ?? 0) + result.points,
        );
      }
    }

    const aggregatedByDriver = new Map<string, { points: number; bestPosition: number; hasResult: boolean }>();
    for (const round of race.eventRounds) {
      if (!roundCountsForStandings(round, seasonSprintConfig)) continue;

      for (const result of round.results) {
        if (result.disqualified) continue;
        const current = aggregatedByDriver.get(result.driverId) ?? {
          points: 0,
          bestPosition: Number.MAX_SAFE_INTEGER,
          hasResult: false,
        };
        current.points += result.points;
        if (!isReverseGridRound(round)) {
          current.bestPosition = Math.min(current.bestPosition, result.position);
          current.hasResult = true;
        }
        aggregatedByDriver.set(result.driverId, current);
      }
    }

    const teamIdsInRace = new Set<string>(allTeamIds);
    for (const rosterEntry of slotRosterEntries) {
      if (rosterEntry.raceId === race.id) {
        teamIdsInRace.add(rosterEntry.teamId);
      }
    }

    for (const teamId of teamIdsInRace) {
      const rosterKey = `${race.id}:${teamId}`;
      const rosterList = rosterByRaceTeam.get(rosterKey);
      const roster = [...(rosterList ?? [])].sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === "MAIN" ? -1 : 1;
        }
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.driverId.localeCompare(b.driverId);
      });

      const compareDriverPerformance = (driverIdA: string, driverIdB: string) => {
        const statsA = aggregatedByDriver.get(driverIdA);
        const statsB = aggregatedByDriver.get(driverIdB);
        const bestA = statsA?.bestPosition ?? Number.MAX_SAFE_INTEGER;
        const bestB = statsB?.bestPosition ?? Number.MAX_SAFE_INTEGER;
        if (bestA !== bestB) return bestA - bestB;
        const pointsA = statsA?.points ?? 0;
        const pointsB = statsB?.points ?? 0;
        if (pointsB !== pointsA) return pointsB - pointsA;
        return driverIdA.localeCompare(driverIdB);
      };

      const participatingRoster = roster.filter((entry) =>
        raceParticipants.has(entry.driverId),
      );
      const mainDriverIds = participatingRoster
        .filter((entry) => entry.role === "MAIN")
        .map((entry) => entry.driverId);
      const reserveEntries = participatingRoster.filter(
        (entry) => entry.role === "RESERVE",
      );
      reserveEntries.sort((a, b) => {
        const performance = compareDriverPerformance(a.driverId, b.driverId);
        if (performance !== 0) return performance;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.driverId.localeCompare(b.driverId);
      });
      const reserveDriverIds = reserveEntries.map((entry) => entry.driverId);

      const eligibleDriversFromRoster: string[] = [];
      for (const driverId of [...mainDriverIds, ...reserveDriverIds]) {
        if (eligibleDriversFromRoster.includes(driverId)) continue;
        eligibleDriversFromRoster.push(driverId);
        if (eligibleDriversFromRoster.length >= 3) break;
      }

      const fallbackEligibleDrivers = [...raceParticipants]
        .filter((driverId) => raceDriverTeams.get(driverId) === teamId)
        .sort((a, b) => compareDriverPerformance(a, b))
        .slice(0, 3);

      const eligibleDrivers = [...eligibleDriversFromRoster];
      if (eligibleDrivers.length < 3) {
        for (const fallbackDriverId of fallbackEligibleDrivers) {
          if (eligibleDrivers.includes(fallbackDriverId)) continue;
          eligibleDrivers.push(fallbackDriverId);
          if (eligibleDrivers.length >= 3) break;
        }
      }

      const slotCandidates = eligibleDrivers.map((driverId) => {
        const raceStats = aggregatedByDriver.get(driverId);
        return {
          driverId,
          points: raceStats?.points ?? 0,
          bestPosition: raceStats?.bestPosition ?? Number.MAX_SAFE_INTEGER,
          hasResult: raceStats?.hasResult ?? false,
        };
      });

      slotCandidates.sort((a, b) => {
        if (a.bestPosition !== b.bestPosition) return a.bestPosition - b.bestPosition;
        if (b.points !== a.points) return b.points - a.points;
        return a.driverId.localeCompare(b.driverId);
      });

      const d1 = slotCandidates[0]?.points ?? 0;
      const d2 = slotCandidates[1]?.points ?? 0;
      const d3 = slotCandidates[2]?.points ?? 0;

      const stats = teamStats.get(teamId) || {
        totalPoints: 0,
        wins: 0,
        podiums: 0,
        bestFinishes: {},
        racePoints: {},
      };

      stats.totalPoints += d1 + d2 + d3;

      const validFinishers = slotCandidates.filter((c) => c.hasResult);
      for (const finisher of validFinishers) {
        if (finisher.bestPosition === 1) stats.wins++;
        if (finisher.bestPosition <= 3) stats.podiums++;
        const posKey = finisher.bestPosition.toString();
        stats.bestFinishes[posKey] = (stats.bestFinishes[posKey] || 0) + 1;
      }

      stats.racePoints[race.id] = {
        D1: d1,
        D2: d2,
        D3: d3,
        total: d1 + d2 + d3,
      };

      teamStats.set(teamId, stats);

      const history = slotHistoryByTeam.get(teamId) ?? { D1: [], D2: [], D3: [] };
      history.D1.push({ raceId: race.id, points: d1 });
      history.D2.push({ raceId: race.id, points: d2 });
      history.D3.push({ raceId: race.id, points: d3 });
      slotHistoryByTeam.set(teamId, history);
    }
  }

  // Only apply mulligans when season is completed and there are enough races
  // Don't remove results if number of races is less than mulligan count
  const canApplyMulligans = seasonCompleted && teamSlotMulliganCount > 0 && races.length >= teamSlotMulliganCount;
  
  if (canApplyMulligans) {
    for (const [teamId, history] of slotHistoryByTeam.entries()) {
      const stats = teamStats.get(teamId);
      if (!stats) continue;

      const removedD1 = sumLowest(history.D1, teamSlotMulliganCount);
      const removedD2 = sumLowest(history.D2, teamSlotMulliganCount);
      const removedD3 = sumLowest(history.D3, teamSlotMulliganCount);
      const removedTotal = removedD1 + removedD2 + removedD3;

      stats.totalPoints -= removedTotal;
      teamStats.set(teamId, stats);
    }
  }

  return teamStats;
}

function sumLowest(
  entries: Array<{ raceId: string; points: number }>,
  count: number,
): number {
  if (count <= 0 || entries.length === 0) return 0;
  if (entries.length <= 1) return 0;

  const effectiveCount = Math.min(count, entries.length - 1);
  if (effectiveCount <= 0) return 0;

  return [...entries]
    .sort((a, b) => a.points - b.points || a.raceId.localeCompare(b.raceId))
    .slice(0, effectiveCount)
    .reduce((acc, current) => acc + current.points, 0);
}

function calculateDepthChartTeamStats(params: {
  races: RaceLike[];
  teamAssignments: AssignmentLike[];
  depthChartEntries: DepthChartEntryLike[];
  seasonSprintConfig: SeasonSprintConfig;
}): Map<string, TeamStats> {
  const { races, teamAssignments, depthChartEntries, seasonSprintConfig } = params;
  const hasTemporalAssignments = teamAssignments.length > 0;

  const teamStats = new Map<string, TeamStats>();

  for (const race of races) {
    const raceReferenceDate = race.scheduledDate ?? race.createdAt;
    const raceDriverTeams = hasTemporalAssignments
      ? resolveRaceDriverTeams(teamAssignments, race.round, raceReferenceDate)
      : null;

    const depthChartByTeam = getDepthChartSnapshotByTeam(depthChartEntries, race.round);
    const raceParticipants = new Set<string>();
    const racePointsByDriver = new Map<string, number>();
    for (const round of race.eventRounds) {
      if (!roundCountsForStandings(round, seasonSprintConfig)) continue;
      for (const result of round.results) {
        if (result.disqualified) continue;
        raceParticipants.add(result.driverId);
        racePointsByDriver.set(
          result.driverId,
          (racePointsByDriver.get(result.driverId) ?? 0) + result.points,
        );
      }
    }

    const countingDriverToTeam = new Map<string, string>();
    for (const [teamId, entries] of depthChartByTeam.entries()) {
      let selectedCount = 0;

      for (const entry of entries) {
        if (selectedCount >= 3) break;
        if (raceDriverTeams && raceDriverTeams.get(entry.driverId) !== teamId) continue;
        if (!raceParticipants.has(entry.driverId)) continue;
        if ((racePointsByDriver.get(entry.driverId) ?? 0) <= 0) continue;

        if (!countingDriverToTeam.has(entry.driverId)) {
          countingDriverToTeam.set(entry.driverId, teamId);
          selectedCount++;
        }
      }
    }

    for (const round of race.eventRounds) {
      if (!roundCountsForStandings(round, seasonSprintConfig)) continue;

      for (const result of round.results) {
        if (result.disqualified) continue;

        const teamId = countingDriverToTeam.get(result.driverId);
        if (!teamId) continue;

        const stats = teamStats.get(teamId) || {
          totalPoints: 0,
          wins: 0,
          podiums: 0,
          bestFinishes: {},
          racePoints: {},
        };

        stats.totalPoints += result.points;

        if (!isReverseGridRound(round)) {
          if (result.position === 1) stats.wins++;
          if (result.position <= 3) stats.podiums++;

          const posKey = result.position.toString();
          stats.bestFinishes[posKey] = (stats.bestFinishes[posKey] || 0) + 1;
        }

        if (!stats.racePoints[race.id]) {
          stats.racePoints[race.id] = {};
        }
        stats.racePoints[race.id][round.apiRoundName] =
          (stats.racePoints[race.id][round.apiRoundName] || 0) + result.points;

        teamStats.set(teamId, stats);
      }
    }
  }

  return teamStats;
}

function calculateStandardTeamStats(params: {
  races: RaceLike[];
  teamAssignments: AssignmentLike[];
  seasonSprintConfig: SeasonSprintConfig;
}): Map<string, TeamStats> {
  const { races, teamAssignments, seasonSprintConfig } = params;

  const teamStats = new Map<string, TeamStats>();

  const currentActiveTeamByDriver = new Map<string, AssignmentLike>();
  for (const assignment of teamAssignments) {
    if (!assignment.leftAt && (assignment.effectiveToRound ?? null) === null) {
      const existing = currentActiveTeamByDriver.get(assignment.driverId);
      if (isCandidateAssignmentNewer(existing, assignment)) {
        currentActiveTeamByDriver.set(assignment.driverId, assignment);
      }
    }
  }

  for (const race of races) {
    const raceReferenceDate = race.scheduledDate ?? race.createdAt;
    const raceDriverTeams = resolveRaceDriverTeams(
      teamAssignments,
      race.round,
      raceReferenceDate,
    );

    for (const round of race.eventRounds) {
      if (!roundCountsForStandings(round, seasonSprintConfig)) continue;

      for (const result of round.results) {
        if (result.disqualified) continue;

        const teamId =
          raceDriverTeams.get(result.driverId) ??
          currentActiveTeamByDriver.get(result.driverId)?.teamId;
        if (!teamId) continue;

        const stats = teamStats.get(teamId) || {
          totalPoints: 0,
          wins: 0,
          podiums: 0,
          bestFinishes: {},
          racePoints: {},
        };

        stats.totalPoints += result.points;

        if (!isReverseGridRound(round)) {
          if (result.position === 1) stats.wins++;
          if (result.position <= 3) stats.podiums++;

          const posKey = result.position.toString();
          stats.bestFinishes[posKey] = (stats.bestFinishes[posKey] || 0) + 1;
        }

        if (!stats.racePoints[race.id]) {
          stats.racePoints[race.id] = {};
        }
        stats.racePoints[race.id][round.apiRoundName] =
          (stats.racePoints[race.id][round.apiRoundName] || 0) + result.points;

        teamStats.set(teamId, stats);
      }
    }
  }

  return teamStats;
}
