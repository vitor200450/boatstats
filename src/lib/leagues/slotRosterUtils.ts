// Pure utility function - can be imported in both server and client components

export function fillMissingSlotRosters(
  races: Array<{ id: string; round: number }>,
  slotRosterEntries: Array<{
    seasonId: string;
    raceId: string;
    teamId: string;
    driverId: string;
    role: "MAIN" | "RESERVE";
    priority: number;
  }>,
  teamAssignments: Array<{
    teamId: string;
    driverId: string;
    joinedAt: Date;
    leftAt: Date | null;
  }>,
): Array<{
  seasonId: string;
  raceId: string;
  teamId: string;
  driverId: string;
  role: "MAIN" | "RESERVE";
  priority: number;
}> {
  // Filter out races without round number and sort by round
  const racesWithRound = races
    .filter((r): r is { id: string; round: number } => 
      typeof r.round === 'number' && !isNaN(r.round)
    )
    .sort((a, b) => a.round - b.round);
  
  const rosterByRace = new Map<string, typeof slotRosterEntries>();

  // Group existing rosters by race
  for (const entry of slotRosterEntries) {
    const list = rosterByRace.get(entry.raceId) ?? [];
    list.push(entry);
    rosterByRace.set(entry.raceId, list);
  }

  const filledEntries = [...slotRosterEntries];
  let lastRoster: typeof slotRosterEntries | null = null;

  for (const race of racesWithRound) {
    const currentRoster = rosterByRace.get(race.id);

    if (currentRoster && currentRoster.length > 0) {
      // This race has its own roster - use it as base for next races
      lastRoster = currentRoster;
    } else if (lastRoster && lastRoster.length > 0) {
      // No roster for this race - inherit from previous race
      // But also add any team assignments that might be missing
      const inheritedRoster = lastRoster.map((entry) => ({
        ...entry,
        raceId: race.id,
      }));
      
      // Find drivers in team assignments that are not in the inherited roster
      const rosterDriverIds = new Set(lastRoster.map(e => e.driverId));
      const missingAssignments = teamAssignments.filter(
        a => !rosterDriverIds.has(a.driverId) && !a.leftAt
      );
      
      // Add missing drivers as RESERVE with high priority
      let nextPriority = Math.max(...lastRoster.map(e => e.priority), 0) + 1;
      for (const assignment of missingAssignments) {
        const alreadyAdded = inheritedRoster.some(
          e => e.driverId === assignment.driverId && e.teamId === assignment.teamId
        );
        if (!alreadyAdded) {
          inheritedRoster.push({
            seasonId: lastRoster[0]?.seasonId ?? '',
            raceId: race.id,
            teamId: assignment.teamId,
            driverId: assignment.driverId,
            role: 'RESERVE',
            priority: nextPriority++,
          });
        }
      }
      
      filledEntries.push(...inheritedRoster);
    }
  }

  return filledEntries;
}