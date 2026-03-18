import { Prisma, PrismaClient, type RosterDriverRole } from "@prisma/client";

import { reprocessSeasonStandings } from "@/lib/leagues/importActions";

type CliOptions = {
  seasonId: string;
  individualResultsCsvPath: string;
  individualStandingsCsvPath: string;
  teamResultsCsvPath: string;
  teamStandingsCsvPath?: string;
  teamsDriversCsvPath?: string;
  apply: boolean;
};

type CsvMatrix = string[][];

type PendingDriverCreation = {
  id: string;
  uuid: string;
  name: string;
};

type PendingTeamCreation = {
  id: string;
  name: string;
};

type TeamSlotRow = {
  slot: number;
  picksByRound: string[];
};

type TeamDriverListEntry = {
  slot: number;
  driverName: string;
  role: RosterDriverRole;
  priority: number;
};

type TeamStandingRow = {
  name: string;
  total: number;
};

const TEAM_PLACEHOLDER_PREFIX = "__create_team__";

const MANUAL_TEAM_ALIASES: Record<string, string> = {
  biom: "BIOM",
};

const MANUAL_DRIVER_ALIASES: Record<string, string> = {
  nidothe1st: "NidoThe1st",
  doggo34: "Doggo34",
};

const TEAMS_DRIVERS_DRIVER_ALIASES: Record<string, string> = {
  thelifenetwork: "lifenetwork",
  thosetwogay: "ThoseTwoGuy",
  hockeyfan: "hockeyfan17",
  shelljoexd: "Shelljoe",
  "67faxeo": "56Faxeo",
  deceptivemc: "DeceptiveXD",
  alliedgalaxy: "allied_galaxy7",
  oiledupfeetpics: "0iledUp_FeetPics",
};

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function placeholderTeamIdForName(name: string): string {
  return `${TEAM_PLACEHOLDER_PREFIX}${normalizeName(name) || hashString(name)}`;
}

function isPlaceholderTeamId(teamId: string): boolean {
  return teamId.startsWith(TEAM_PLACEHOLDER_PREFIX);
}

function placeholderDriverIdForName(name: string): string {
  const key = normalizeName(name) || name.toLowerCase();
  return `legacydrv_${hashString(key)}`;
}

function placeholderDriverUuidForName(name: string): string {
  const key = normalizeName(name) || name.toLowerCase();
  return `legacy-${hashString(`uuid:${key}`)}`;
}

function parseArgs(argv: string[]): CliOptions {
  const map = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;

    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      map.set(key, "true");
      continue;
    }

    map.set(key, next);
    i++;
  }

  const individualResultsCsvPath = map.get("individualResults") ?? "";
  const seasonId = map.get("seasonId") ?? "";
  const individualStandingsCsvPath = map.get("individualStandings") ?? "";
  const teamResultsCsvPath = map.get("teamResults") ?? "";

  if (!seasonId || !individualResultsCsvPath || !individualStandingsCsvPath || !teamResultsCsvPath) {
    throw new Error(
      "Uso: bun scripts/rebuild-season-from-fc1-csv.ts --seasonId <id> --individualResults <path> --individualStandings <path> --teamResults <path> [--teamStandings <path>] [--teamsDrivers <path>] [--apply]",
    );
  }

  return {
    seasonId,
    individualResultsCsvPath,
    individualStandingsCsvPath,
    teamResultsCsvPath,
    teamStandingsCsvPath: map.get("teamStandings") ?? undefined,
    teamsDriversCsvPath: map.get("teamsDrivers") ?? undefined,
    apply: map.get("apply") === "true",
  };
}

function parseBonusPointsFromIndividualResults(
  matrix: CsvMatrix,
  maxRound: number,
  bonusConfig: { fastestLap: number; polePosition: number },
): Map<string, number[]> {
  const byDriver = new Map<string, number[]>();

  const addBonus = (driverNameRaw: string, roundIndex: number, points: number): void => {
    if (!driverNameRaw || points === 0 || roundIndex < 0 || roundIndex >= maxRound) return;
    const key = normalizeName(driverNameRaw);
    if (!key) return;
    const arr = byDriver.get(key) ?? Array.from({ length: maxRound }, () => 0);
    arr[roundIndex] += points;
    byDriver.set(key, arr);
  };

  const parseCategory = (label: string, bonusPoints: number): void => {
    const rowIndex = matrix.findIndex((row) => (row[2] ?? "").trim().toLowerCase() === label);
    if (rowIndex < 0) return;
    const namesRow = matrix[rowIndex + 1] ?? [];
    const maxCol = Math.min(namesRow.length, 4 + maxRound);

    for (let col = 4; col < maxCol; col++) {
      const driverName = namesRow[col]?.trim() ?? "";
      if (!driverName) continue;
      addBonus(driverName, col - 4, bonusPoints);
    }
  };

  parseCategory("fastest lap", bonusConfig.fastestLap);
  parseCategory("pole position", bonusConfig.polePosition);
  return byDriver;
}

async function readCsv(path: string): Promise<CsvMatrix> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Arquivo não encontrado: ${path}`);
  }

  const text = await file.text();
  return parseCsv(text);
}

function parseCsv(content: string): CsvMatrix {
  const rows: CsvMatrix = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows;
}

function parseIndividualPoints(
  matrix: CsvMatrix,
  maxRound: number,
): Map<string, { displayName: string; pointsByRound: number[]; scoreAdjustment: number }> {
  const headerRowIndex = matrix.findIndex((row) =>
    row.some((cell) => cell.toLowerCase() === "driver name"),
  );
  if (headerRowIndex < 0) {
    throw new Error("Cabeçalho de 'Driver name' não encontrado no Individual Standings CSV.");
  }

  const header = matrix[headerRowIndex] ?? [];
  const driverNameCol = header.findIndex((cell) => cell.toLowerCase() === "driver name");
  const scoreCol = header.findIndex((cell) => cell.toLowerCase() === "score");

  if (driverNameCol < 0 || scoreCol < 0) {
    throw new Error("Colunas 'Driver name'/'Score' não encontradas no Individual Standings CSV.");
  }

  const startRoundCol = scoreCol + 1;
  const byDriver = new Map<string, { displayName: string; pointsByRound: number[]; scoreAdjustment: number }>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex++) {
    const row = matrix[rowIndex] ?? [];
    const driverNameRaw = row[driverNameCol]?.trim() ?? "";
    if (!driverNameRaw) continue;

    const key = normalizeName(driverNameRaw);
    if (!key) continue;

    const pointsByRound = Array.from({ length: maxRound }, (_, idx) => {
      const raw = row[startRoundCol + idx] ?? "0";
      const parsed = Number(raw.trim() || 0);
      return Number.isFinite(parsed) ? parsed : 0;
    });
    const pointsByRoundSum = pointsByRound.reduce((sum, value) => sum + value, 0);
    const totalScore = Number((row[scoreCol] ?? "0").trim() || 0);
    const scoreAdjustment = Number.isFinite(totalScore) ? totalScore - pointsByRoundSum : 0;

    const existing = byDriver.get(key);
    if (!existing) {
      byDriver.set(key, {
        displayName: driverNameRaw,
        pointsByRound,
        scoreAdjustment,
      });
      continue;
    }

    const existingSum = existing.pointsByRound.reduce((sum, value) => sum + value, 0);
    const candidateSum = pointsByRound.reduce((sum, value) => sum + value, 0);
    const normalizedExistingScore = Number.isFinite(existingSum) ? existingSum : 0;
    const normalizedCandidateScore = Number.isFinite(totalScore) && totalScore > 0 ? totalScore : candidateSum;

    if (normalizedCandidateScore > normalizedExistingScore) {
      byDriver.set(key, {
        displayName: driverNameRaw,
        pointsByRound,
        scoreAdjustment,
      });
    }
  }

  return byDriver;
}

function parseTeamSlotRows(
  matrix: CsvMatrix,
  maxRound: number,
): Map<string, TeamSlotRow[]> {
  const roundHeaderIndex = matrix.findIndex((row) => {
    const numeric = row.filter((cell) => /^\d+$/.test(cell.trim())).length;
    return numeric >= maxRound;
  });
  if (roundHeaderIndex < 0) {
    throw new Error("Linha de rounds não encontrada no Team Results CSV.");
  }

  const roundHeader = matrix[roundHeaderIndex] ?? [];
  const roundCols = new Map<number, number>();
  for (let col = 0; col < roundHeader.length; col++) {
    const raw = roundHeader[col]?.trim() ?? "";
    if (!/^\d+$/.test(raw)) continue;
    const round = Number(raw);
    if (!Number.isFinite(round) || round <= 0 || round > maxRound) continue;
    if (!roundCols.has(round)) roundCols.set(round, col);
  }

  const byTeam = new Map<string, TeamSlotRow[]>();

  for (let rowIndex = roundHeaderIndex + 2; rowIndex < matrix.length; rowIndex++) {
    const row = matrix[rowIndex] ?? [];
    const teamName = row[2]?.trim() ?? "";
    const slotRaw = row[1]?.trim() ?? "";

    if (!teamName || !/^\d+$/.test(slotRaw)) continue;

    const slot = Number(slotRaw);
    if (!Number.isFinite(slot) || slot < 1 || slot > 3) continue;

    const picksByRound = Array.from({ length: maxRound }, (_, idx) => {
      const col = roundCols.get(idx + 1);
      if (!col) return "";
      return row[col]?.trim() ?? "";
    });

    const rows = byTeam.get(teamName) ?? [];
    rows.push({ slot, picksByRound });
    byTeam.set(teamName, rows);
  }

  return byTeam;
}

function parseTeamStandingsRows(matrix: CsvMatrix): TeamStandingRow[] {
  const rows: TeamStandingRow[] = [];

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
    const row = matrix[rowIndex] ?? [];
    const teamName = row[2]?.trim() ?? "";
    const totalRaw = row[3]?.trim() ?? "";
    if (!teamName) continue;
    const total = Number(totalRaw || 0);
    if (!Number.isFinite(total)) continue;
    rows.push({ name: teamName, total });
  }

  return rows;
}

function parseTeamsDriversList(
  matrix: CsvMatrix,
): Map<string, TeamDriverListEntry[]> {
  const byTeam = new Map<string, TeamDriverListEntry[]>();

  const headerIndex = matrix.findIndex(
    (row) => (row[2] ?? "").trim().toLowerCase() === "team name",
  );
  if (headerIndex < 0) return byTeam;

  const headerRow = matrix[headerIndex] ?? [];
  const teamCols: Array<{ col: number; teamName: string }> = [];
  for (let col = 3; col < headerRow.length; col++) {
    const teamName = headerRow[col]?.trim() ?? "";
    if (!teamName) continue;
    teamCols.push({ col, teamName });
  }

  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex++) {
    const row = matrix[rowIndex] ?? [];
    const label = row[2]?.trim() ?? "";
    const match = /^driver\s+(\d+)$/i.exec(label);
    if (!match) continue;

    const slot = Number(match[1]);
    if (!Number.isFinite(slot) || slot < 1 || slot > 5) continue;

    for (const { col, teamName } of teamCols) {
      const driverName = row[col]?.trim() ?? "";
      if (!driverName || driverName === "#ERROR!") continue;

      const teamKey = normalizeName(teamName);
      const entries = byTeam.get(teamKey) ?? [];
      entries.push({
        slot,
        driverName,
        role: slot <= 3 ? "MAIN" : "RESERVE",
        priority: slot <= 3 ? slot : slot - 3,
      });
      byTeam.set(teamKey, entries);
    }
  }

  return byTeam;
}

function resolveDriver(
  nameRaw: string,
  driverIndex: Map<string, string[]>,
  driverActivityById: Map<string, { results: number; points: number }>,
  pendingDriverCreations: Map<string, PendingDriverCreation>,
): { id: string; created: boolean; ambiguous: boolean } {
  const isLegacyDriverId = (driverId: string): boolean =>
    driverId.startsWith("legacydrv_");

  const normalizedRaw = normalizeName(nameRaw);
  if (!normalizedRaw) {
    const id = placeholderDriverIdForName(nameRaw || "unknown");
    const pending = pendingDriverCreations.get(id) ?? {
      id,
      uuid: placeholderDriverUuidForName(nameRaw || "unknown"),
      name: nameRaw || "Unknown",
    };
    pendingDriverCreations.set(id, pending);
    return { id, created: true, ambiguous: false };
  }

  const aliasTarget = MANUAL_DRIVER_ALIASES[normalizedRaw];
  const directCandidates = driverIndex.get(normalizedRaw) ?? [];
  const aliasCandidates = aliasTarget ? driverIndex.get(normalizeName(aliasTarget)) ?? [] : [];
  const candidates = aliasCandidates.length > 0 ? aliasCandidates : directCandidates;
  const nonLegacyCandidates = candidates.filter((candidateId) =>
    !isLegacyDriverId(candidateId),
  );
  const prioritizedCandidates =
    nonLegacyCandidates.length > 0 ? nonLegacyCandidates : candidates;

  if (prioritizedCandidates.length === 1) {
    return { id: prioritizedCandidates[0], created: false, ambiguous: false };
  }

  if (prioritizedCandidates.length > 1) {
    const selected = [...prioritizedCandidates].sort((a, b) => {
      const aStats = driverActivityById.get(a) ?? { results: 0, points: 0 };
      const bStats = driverActivityById.get(b) ?? { results: 0, points: 0 };
      if (bStats.results !== aStats.results) return bStats.results - aStats.results;
      if (bStats.points !== aStats.points) return bStats.points - aStats.points;
      return a.localeCompare(b);
    })[0];
    return { id: selected, created: false, ambiguous: true };
  }

  const id = placeholderDriverIdForName(nameRaw);
  const pending = pendingDriverCreations.get(id) ?? {
    id,
    uuid: placeholderDriverUuidForName(nameRaw),
    name: nameRaw,
  };
  pendingDriverCreations.set(id, pending);
  return { id, created: true, ambiguous: candidates.length > 1 };
}

function resolveTeamId(
  teamNameRaw: string,
  teamIndex: Map<string, string>,
  pendingTeamCreations: Map<string, PendingTeamCreation>,
): string {
  const normalized = normalizeName(teamNameRaw);
  const aliasTarget = MANUAL_TEAM_ALIASES[normalized];
  const resolved = teamIndex.get(normalizeName(aliasTarget ?? teamNameRaw));
  if (resolved) return resolved;

  const placeholderId = placeholderTeamIdForName(teamNameRaw);
  if (!pendingTeamCreations.has(placeholderId)) {
    pendingTeamCreations.set(placeholderId, {
      id: placeholderId,
      name: aliasTarget ?? teamNameRaw,
    });
  }
  return placeholderId;
}

function updateSeasonPointsSystemForNoMulligan(pointsSystem: unknown): unknown {
  if (!pointsSystem || typeof pointsSystem !== "object" || Array.isArray(pointsSystem)) {
    return pointsSystem;
  }

  const cloned = structuredClone(pointsSystem as Record<string, unknown>);
  const rulesValue = (cloned.rules ?? {}) as Record<string, unknown>;
  rulesValue.teamScoringMode = "SLOT_MULLIGAN";
  rulesValue.teamSlotMulliganCount = 0;
  rulesValue.driverMulliganCount = 0;
  rulesValue.reverseGridEnabled = false;
  cloned.rules = rulesValue;
  return cloned;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const [individualResultsMatrix, individualMatrix, teamResultsMatrix, teamStandingsMatrix, teamsDriversMatrix] = await Promise.all([
      readCsv(options.individualResultsCsvPath),
      readCsv(options.individualStandingsCsvPath),
      readCsv(options.teamResultsCsvPath),
      options.teamStandingsCsvPath
        ? readCsv(options.teamStandingsCsvPath)
        : Promise.resolve<CsvMatrix>([]),
      options.teamsDriversCsvPath
        ? readCsv(options.teamsDriversCsvPath)
        : Promise.resolve<CsvMatrix>([]),
    ]);

    const season = await prisma.season.findUnique({
      where: { id: options.seasonId },
      select: {
        id: true,
        name: true,
        status: true,
        pointsSystem: true,
        league: {
          select: {
            id: true,
            teams: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        races: {
          select: {
            id: true,
            round: true,
          },
          orderBy: { round: "asc" },
        },
      },
    });

    if (!season) throw new Error("Temporada não encontrada.");

    const maxRound = Math.max(
      1,
      ...season.races
        .map((race) => race.round)
        .filter((round): round is number => typeof round === "number" && Number.isFinite(round)),
    );

    void individualResultsMatrix;

    const individualPointsByDriver = parseIndividualPoints(individualMatrix, maxRound);
    const teamSlotRowsByTeamAll = parseTeamSlotRows(teamResultsMatrix, maxRound);
    const teamStandingsRows = parseTeamStandingsRows(teamStandingsMatrix);
    const teamsDriversByTeam = parseTeamsDriversList(teamsDriversMatrix);
    const allowedTeams = new Set(teamStandingsRows.map((row) => normalizeName(row.name)));
    const shouldFilterTeams = allowedTeams.size > 0;
    const teamSlotRowsByTeam = new Map<string, TeamSlotRow[]>();
    for (const [teamName, rows] of teamSlotRowsByTeamAll.entries()) {
      if (shouldFilterTeams && !allowedTeams.has(normalizeName(teamName))) continue;
      teamSlotRowsByTeam.set(teamName, rows);
    }

    const allDrivers = await prisma.driver.findMany({
      select: {
        id: true,
        uuid: true,
        currentName: true,
        previousNames: true,
      },
    });

    const driverIndex = new Map<string, string[]>();
    const currentDriverNameById = new Map<string, string>();
    const pushDriverIndex = (key: string, driverId: string): void => {
      if (!key) return;
      const list = driverIndex.get(key) ?? [];
      if (!list.includes(driverId)) list.push(driverId);
      driverIndex.set(key, list);
    };

    for (const driver of allDrivers) {
      if (driver.currentName) {
        currentDriverNameById.set(driver.id, driver.currentName);
      }
      pushDriverIndex(normalizeName(driver.uuid), driver.id);
      if (driver.currentName) pushDriverIndex(normalizeName(driver.currentName), driver.id);
      for (const previousName of driver.previousNames ?? []) {
        pushDriverIndex(normalizeName(previousName), driver.id);
      }
    }

    const teamIndex = new Map<string, string>();
    for (const team of season.league.teams) {
      teamIndex.set(normalizeName(team.name), team.id);
    }

    const raceIdByRound = new Map<number, string>();
    for (const race of season.races) {
      if (typeof race.round !== "number" || !Number.isFinite(race.round)) continue;
      raceIdByRound.set(race.round, race.id);
    }

    const seasonCountedResultsForResolver = await prisma.roundResult.findMany({
      where: {
        disqualified: false,
        eventRound: {
          countsForStandings: true,
          race: { seasonId: options.seasonId },
        },
      },
      select: {
        driverId: true,
        points: true,
      },
    });

    const driverActivityById = new Map<string, { results: number; points: number }>();
    for (const row of seasonCountedResultsForResolver) {
      const current = driverActivityById.get(row.driverId) ?? { results: 0, points: 0 };
      current.results += 1;
      current.points += row.points;
      driverActivityById.set(row.driverId, current);
    }

    const pendingDriverCreations = new Map<string, PendingDriverCreation>();
    const pendingTeamCreations = new Map<string, PendingTeamCreation>();
    const unresolvedAmbiguousDrivers = new Set<string>();
    const depthChartRows: Array<{
      teamId: string;
      driverId: string;
      priority: number;
    }> = [];
    const depthChartSeen = new Set<string>();

    const slotRosterRows: Array<{
      raceId: string;
      teamId: string;
      driverId: string;
      role: RosterDriverRole;
      priority: number;
    }> = [];

    const resolvedTeams: Array<{ teamName: string; teamId: string }> = [];

    for (const [teamName, slotRows] of teamSlotRowsByTeam.entries()) {
      const teamId = resolveTeamId(teamName, teamIndex, pendingTeamCreations);
      resolvedTeams.push({ teamName, teamId });
      const bySlot = [...slotRows].sort((a, b) => a.slot - b.slot);
      const staticRoster =
        teamsDriversByTeam.get(normalizeName(teamName)) ??
        teamsDriversByTeam.get(normalizeName(MANUAL_TEAM_ALIASES[normalizeName(teamName)] ?? teamName)) ??
        [];

      for (const staticEntry of staticRoster) {
        const normalizedStaticName = normalizeName(staticEntry.driverName);
        const aliasedStaticName =
          TEAMS_DRIVERS_DRIVER_ALIASES[normalizedStaticName] ?? staticEntry.driverName;
        const resolvedStatic = resolveDriver(
          aliasedStaticName,
          driverIndex,
          driverActivityById,
          pendingDriverCreations,
        );
        if (resolvedStatic.ambiguous) unresolvedAmbiguousDrivers.add(staticEntry.driverName);

        const depthKey = `${teamId}:${resolvedStatic.id}`;
        if (!depthChartSeen.has(depthKey)) {
          depthChartSeen.add(depthKey);
          depthChartRows.push({
            teamId,
            driverId: resolvedStatic.id,
            priority: staticEntry.slot,
          });
        }
      }

      for (let round = 1; round <= maxRound; round++) {
        const raceId = raceIdByRound.get(round);
        if (!raceId) continue;

        const seenDrivers = new Set<string>();
        for (const slotRow of bySlot) {
          const driverName = slotRow.picksByRound[round - 1]?.trim() ?? "";
          if (!driverName) continue;

          const resolved = resolveDriver(
            driverName,
            driverIndex,
            driverActivityById,
            pendingDriverCreations,
          );
          if (resolved.ambiguous) unresolvedAmbiguousDrivers.add(driverName);
          if (seenDrivers.has(resolved.id)) continue;

          slotRosterRows.push({
            raceId,
            teamId,
            driverId: resolved.id,
            role: "MAIN",
            priority: slotRow.slot,
          });
          seenDrivers.add(resolved.id);
        }

      }
    }

    const existingRosterRaceTeam = new Set(
      slotRosterRows.map((row) => `${row.raceId}:${row.teamId}`),
    );

    for (const { teamName, teamId } of resolvedTeams) {
      for (let round = 1; round <= maxRound; round++) {
        const raceId = raceIdByRound.get(round);
        if (!raceId) continue;
        const key = `${raceId}:${teamId}`;
        if (existingRosterRaceTeam.has(key)) continue;

        const dummyName = `__fc1_dummy_${teamName}`;
        const dummyDriver = resolveDriver(
          dummyName,
          driverIndex,
          driverActivityById,
          pendingDriverCreations,
        );

        slotRosterRows.push({
          raceId,
          teamId,
          driverId: dummyDriver.id,
          role: "MAIN",
          priority: 1,
        });
        existingRosterRaceTeam.add(key);
      }
    }

    const assignmentIntervals: Array<{
      driverId: string;
      teamId: string;
      fromRound: number;
      toRound: number | null;
    }> = [];

    const countedEventRounds = await prisma.eventRound.findMany({
      where: {
        countsForStandings: true,
        race: { seasonId: options.seasonId },
      },
      select: {
        id: true,
        race: {
          select: {
            id: true,
            round: true,
          },
        },
      },
    });

    const eventRoundIdByRound = new Map<number, string>();
    for (const eventRound of countedEventRounds) {
      if (typeof eventRound.race.round !== "number" || !Number.isFinite(eventRound.race.round)) continue;
      eventRoundIdByRound.set(eventRound.race.round, eventRound.id);
    }

    const individualTargetByEventRoundDriver = new Map<string, number>();
    const scoreAdjustmentByDriverId = new Map<string, number>();
    const desiredDriverNameById = new Map<string, string>();
    for (const [normalizedDriverName, payload] of individualPointsByDriver.entries()) {
      const resolved = resolveDriver(
        payload.displayName,
        driverIndex,
        driverActivityById,
        pendingDriverCreations,
      );
      if (resolved.ambiguous) unresolvedAmbiguousDrivers.add(payload.displayName);
      for (let round = 1; round <= maxRound; round++) {
        const eventRoundId = eventRoundIdByRound.get(round);
        if (!eventRoundId) continue;
        const basePoints = payload.pointsByRound[round - 1] ?? 0;
        const points = basePoints;
        const key = `${eventRoundId}:${resolved.id}`;
        individualTargetByEventRoundDriver.set(
          key,
          (individualTargetByEventRoundDriver.get(key) ?? 0) + points,
        );
      }

      if (payload.scoreAdjustment !== 0) {
        scoreAdjustmentByDriverId.set(
          resolved.id,
          (scoreAdjustmentByDriverId.get(resolved.id) ?? 0) + payload.scoreAdjustment,
        );
      }

      if (payload.displayName) {
        const currentName = currentDriverNameById.get(resolved.id) ?? "";
        const isLegacyDriver = resolved.id.startsWith("legacydrv_");
        const aliasTarget = MANUAL_DRIVER_ALIASES[normalizedDriverName];
        const usesCrossAlias =
          aliasTarget !== undefined &&
          normalizeName(aliasTarget) !== normalizedDriverName;
        const safeToSync =
          (isLegacyDriver ||
          (currentName.length > 0 &&
            normalizeName(currentName) === normalizeName(payload.displayName))) &&
          !usesCrossAlias;

        if (safeToSync) {
          desiredDriverNameById.set(resolved.id, payload.displayName);
        }
      }
    }

    const countedEventRoundIds = countedEventRounds.map((row) => row.id);
    const countedRoundResults = await prisma.roundResult.findMany({
      where: {
        eventRoundId: { in: countedEventRoundIds },
      },
      select: {
        id: true,
        disqualified: true,
        position: true,
        points: true,
        driverId: true,
        eventRoundId: true,
      },
    });

    const baseByEventRoundDriver = new Map<string, number>();
    for (const result of countedRoundResults) {
      const key = `${result.eventRoundId}:${result.driverId}`;
      baseByEventRoundDriver.set(key, (baseByEventRoundDriver.get(key) ?? 0) + result.points);
    }

    const roundResultUpdates: Array<{ id: string; points: number; disqualified?: boolean }> = [];
    const roundResultCreates: Array<{
      eventRoundId: string;
      driverId: string;
      position: number;
      points: number;
    }> = [];

    const existingByEventRoundDriver = new Map<
      string,
      Array<(typeof countedRoundResults)[number]>
    >();
    for (const row of countedRoundResults) {
      const key = `${row.eventRoundId}:${row.driverId}`;
      const list = existingByEventRoundDriver.get(key) ?? [];
      list.push(row);
      existingByEventRoundDriver.set(key, list);
    }

    const unionKeys = new Set<string>([
      ...baseByEventRoundDriver.keys(),
      ...individualTargetByEventRoundDriver.keys(),
    ]);

    const maxPositionByEventRound = new Map<string, number>();
    for (const row of countedRoundResults) {
      maxPositionByEventRound.set(
        row.eventRoundId,
        Math.max(maxPositionByEventRound.get(row.eventRoundId) ?? 0, row.position),
      );
    }

    for (const key of unionKeys) {
      const [eventRoundId, driverId] = key.split(":");
      if (!eventRoundId || !driverId) continue;
      const target = individualTargetByEventRoundDriver.get(key) ?? 0;
      const base = baseByEventRoundDriver.get(key) ?? 0;
      const existingRows = existingByEventRoundDriver.get(key) ?? [];

      if (existingRows.length > 0) {
        const sortedRows = [...existingRows].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
          return a.id.localeCompare(b.id);
        });

        const keeper = sortedRows[0];
        if (keeper.points !== target) {
          roundResultUpdates.push({
            id: keeper.id,
            points: target,
          });
        }

        for (const duplicate of sortedRows.slice(1)) {
          if (duplicate.points === 0 && Boolean(duplicate.disqualified)) continue;
          roundResultUpdates.push({
            id: duplicate.id,
            points: 0,
            disqualified: true,
          });
        }
        continue;
      }

      if (target <= 0) continue;

      const nextPosition = (maxPositionByEventRound.get(eventRoundId) ?? 0) + 1;
      maxPositionByEventRound.set(eventRoundId, nextPosition);
      roundResultCreates.push({
        eventRoundId,
        driverId,
        position: nextPosition,
        points: target,
      });
    }

    const rosterCountByRaceTeam = new Map<string, number>();
    for (const row of slotRosterRows) {
      const key = `${row.raceId}:${row.teamId}`;
      rosterCountByRaceTeam.set(key, (rosterCountByRaceTeam.get(key) ?? 0) + 1);
    }

    console.log("--- FC1 Rebuild Dry Run ---");
    console.log("Temporada:", season.name, season.id);
    console.log("Rounds considerados:", maxRound);
    console.log("Pilotos no Individual Standings:", individualPointsByDriver.size);
    console.log("Times no Team Results:", teamSlotRowsByTeam.size);
    console.log("Rosters (slot entries) gerados:", slotRosterRows.length);
    console.log("Depth chart entries gerados:", depthChartRows.length);
    console.log("Assignments gerados:", assignmentIntervals.length);
    console.log("RoundResult updates:", roundResultUpdates.length);
    console.log("RoundResult creates:", roundResultCreates.length);
    console.log("Ajustes de score (bonus manual):", scoreAdjustmentByDriverId.size);
    console.log("Nomes de drivers a sincronizar:", desiredDriverNameById.size);
    console.log("Times a criar:", pendingTeamCreations.size);
    console.log("Drivers legacy a criar:", pendingDriverCreations.size);
    console.log("Nomes ambíguos de driver:", unresolvedAmbiguousDrivers.size);

    if (unresolvedAmbiguousDrivers.size > 0) {
      console.log(
        "Drivers ambíguos:",
        [...unresolvedAmbiguousDrivers].slice(0, 20),
      );
    }

    if (!options.apply) {
      console.log("Modo dry-run finalizado. Use --apply para persistir.");
      return;
    }

    await prisma.$transaction(
      async (tx) => {
        const placeholderTeamToReal = new Map<string, string>();

        for (const pending of pendingTeamCreations.values()) {
          const existing = await tx.team.findFirst({
            where: {
              leagueId: season.league.id,
              name: pending.name,
            },
            select: { id: true },
          });

          if (existing) {
            placeholderTeamToReal.set(pending.id, existing.id);
            continue;
          }

          const created = await tx.team.create({
            data: {
              leagueId: season.league.id,
              name: pending.name,
            },
            select: { id: true },
          });

          placeholderTeamToReal.set(pending.id, created.id);
        }

        const remapTeamId = (teamId: string): string => {
          if (!isPlaceholderTeamId(teamId)) return teamId;
          const real = placeholderTeamToReal.get(teamId);
          if (!real) {
            throw new Error(`Team placeholder sem ID real: ${teamId}`);
          }
          return real;
        };

        if (pendingDriverCreations.size > 0) {
          await tx.driver.createMany({
            data: [...pendingDriverCreations.values()].map((driver) => ({
              id: driver.id,
              uuid: driver.uuid,
              currentName: driver.name,
            })),
            skipDuplicates: true,
          });
        }

        for (const [driverId, desiredName] of desiredDriverNameById.entries()) {
          await tx.driver.update({
            where: { id: driverId },
            data: { currentName: desiredName },
          });
        }

        await tx.seasonRaceTeamRoster.deleteMany({ where: { seasonId: options.seasonId } });
        await tx.seasonTeamAssignment.deleteMany({ where: { seasonId: options.seasonId } });
        await tx.seasonTeamDepthChartEntry.deleteMany({ where: { seasonId: options.seasonId } });
        await tx.standing.deleteMany({ where: { seasonId: options.seasonId } });

        const seasonRaceIds = season.races.map((race) => race.id);
        await tx.raceResultBonus.deleteMany({
          where: {
            raceId: { in: seasonRaceIds },
          },
        });

        const adjustmentBonusRows: Array<{
          raceId: string;
          driverId: string;
          points: number;
          reason: string;
        }> = [];

        const adjustmentRaceId = raceIdByRound.get(maxRound) ?? season.races[season.races.length - 1]?.id;
        if (adjustmentRaceId) {
          for (const [driverId, adjustment] of scoreAdjustmentByDriverId.entries()) {
            const points = Math.trunc(adjustment);
            if (points === 0) continue;
            adjustmentBonusRows.push({
              raceId: adjustmentRaceId,
              driverId,
              points,
              reason: "FC1 CSV score adjustment",
            });
          }
        }

        const rosterIds = new Set<string>();
        const rosterRows: Array<{ id: string; seasonId: string; raceId: string; teamId: string }> = [];
        const rosterItems: Array<{
          id: string;
          rosterId: string;
          driverId: string;
          role: RosterDriverRole;
          priority: number;
        }> = [];

        for (const row of slotRosterRows) {
          const teamId = remapTeamId(row.teamId);
          const rosterId = `srt_${options.seasonId}_${row.raceId}_${teamId}`;

          if (!rosterIds.has(rosterId)) {
            rosterIds.add(rosterId);
            rosterRows.push({
              id: rosterId,
              seasonId: options.seasonId,
              raceId: row.raceId,
              teamId,
            });
          }

          rosterItems.push({
            id: `sri_${rosterId}_${row.driverId}_${row.role}_${row.priority}`,
            rosterId,
            driverId: row.driverId,
            role: row.role,
            priority: row.priority,
          });
        }

        if (rosterRows.length > 0) {
          await tx.seasonRaceTeamRoster.createMany({ data: rosterRows });
        }

        if (rosterItems.length > 0) {
          await tx.seasonRaceTeamRosterItem.createMany({ data: rosterItems, skipDuplicates: true });
        }

        if (assignmentIntervals.length > 0) {
          await tx.seasonTeamAssignment.createMany({
            data: assignmentIntervals.map((interval) => ({
              id: `asg_${options.seasonId}_${interval.driverId}_${interval.fromRound}_${interval.teamId}`,
              seasonId: options.seasonId,
              driverId: interval.driverId,
              teamId: remapTeamId(interval.teamId),
              effectiveFromRound: interval.fromRound,
              effectiveToRound: interval.toRound,
              joinedAt: new Date(),
              leftAt: interval.toRound === null ? null : new Date(),
            })),
          });
        }

        if (depthChartRows.length > 0) {
          await tx.seasonTeamDepthChartEntry.createMany({
            data: depthChartRows.map((entry) => ({
              id: `dce_${options.seasonId}_${entry.teamId}_${entry.driverId}_${entry.priority}`,
              seasonId: options.seasonId,
              teamId: remapTeamId(entry.teamId),
              driverId: entry.driverId,
              priority: entry.priority,
              effectiveFromRound: 1,
              effectiveToRound: null,
            })),
            skipDuplicates: true,
          });
        }

        if (roundResultUpdates.length > 0) {
          for (const updateRow of roundResultUpdates) {
            await tx.roundResult.update({
              where: { id: updateRow.id },
              data: {
                points: updateRow.points,
                ...(typeof updateRow.disqualified === "boolean"
                  ? { disqualified: updateRow.disqualified }
                  : {}),
              },
            });
          }
        }

        if (roundResultCreates.length > 0) {
          await tx.roundResult.createMany({
            data: roundResultCreates.map((row) => ({
              eventRoundId: row.eventRoundId,
              driverId: row.driverId,
              position: row.position,
              points: row.points,
              disqualified: false,
            })),
            skipDuplicates: true,
          });
        }

        if (adjustmentBonusRows.length > 0) {
          await tx.raceResultBonus.createMany({
            data: adjustmentBonusRows,
            skipDuplicates: true,
          });
        }

        await tx.season.update({
          where: { id: options.seasonId },
          data: {
            pointsSystem: updateSeasonPointsSystemForNoMulligan(
              season.pointsSystem,
            ) as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 60_000, maxWait: 20_000 },
    );

    const reprocess = await reprocessSeasonStandings(options.seasonId, "MANUAL");
    console.log("Reprocessamento:", reprocess);
    console.log("Apply concluído.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Falha na reconstrução FC1:", error);
  process.exit(1);
});
