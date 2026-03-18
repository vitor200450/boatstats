import { PrismaClient } from "@prisma/client";

import { reprocessSeasonStandings } from "@/lib/leagues/importActions";

type CliOptions = {
  seasonId: string;
  individualCsvPath: string;
  teamCsvPath: string;
  teamsCsvPath: string;
  apply: boolean;
};

type CsvMatrix = string[][];

type ParsedToken = {
  teamCode: string;
  slot: number;
  isKnownCode: boolean;
};

type RoundRow = {
  round: number;
  placement: number;
  driverNameRaw: string;
  teamCode: string | null;
  slot: number | null;
};

type ResolvedRoundRow = RoundRow & {
  driverId: string;
  teamId: string | null;
};

type RoundPositionDriverMap = Map<number, Map<number, string>>;

type AssignmentInterval = {
  driverId: string;
  teamId: string | null;
  fromRound: number;
  toRound: number | null;
};

type DepthVersion = {
  teamId: string;
  fromRound: number;
  toRound: number | null;
  slots: Array<{ driverId: string; priority: number }>;
};

type PendingDriverCreation = {
  id: string;
  uuid: string;
  name: string;
};

const TEAM_PLACEHOLDER_PREFIX = "__create_team__";

const MANUAL_TEAM_CODE_NAME_ALIASES: Record<string, string> = {
  bio: "BIOM Racing",
  mer: "Mercedes",
  tkd: "Taszkent Dragons",
  hyg: "Hyper Markers",
};

const MANUAL_DRIVER_NAME_ALIASES: Record<string, string> = {
  spookyjimmy: "SpookySeal14",
  ctcuberhd: "DJCurtiis21",
};

const MANUAL_IGNORED_TEAM_CODES = new Set(["iak"]);

function placeholderTeamIdForCode(code: string): string {
  return `${TEAM_PLACEHOLDER_PREFIX}${code}`;
}

function isPlaceholderTeamId(teamId: string): boolean {
  return teamId.startsWith(TEAM_PLACEHOLDER_PREFIX);
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
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
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      map.set(key, "true");
      continue;
    }
    map.set(key, next);
    i++;
  }

  const seasonId = map.get("seasonId") ?? "";
  const individualCsvPath = map.get("individual") ?? "";
  const teamCsvPath = map.get("team") ?? "";
  const teamsCsvPath = map.get("teams") ?? "";

  if (!seasonId || !individualCsvPath || !teamCsvPath || !teamsCsvPath) {
    throw new Error(
      "Uso: bun scripts/rebuild-season-from-fc2-csv.ts --seasonId <id> --individual <path> --team <path> --teams <path> [--apply]",
    );
  }

  return {
    seasonId,
    individualCsvPath,
    teamCsvPath,
    teamsCsvPath,
    apply: map.get("apply") === "true",
  };
}

async function readCsv(filePath: string): Promise<CsvMatrix> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const text = await file.text();
  return parseCsv(text);
}

function parseCsv(content: string): CsvMatrix {
  const rows: string[][] = [];
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

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array.from<number>({ length: b.length + 1 }).fill(0),
  );

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function buildRoundColumns(matrix: CsvMatrix): Array<{ round: number; columnIndex: number }> {
  const header = matrix.find((row) => row[0]?.toLowerCase() === "race number");
  if (!header) throw new Error("Linha 'Race Number' não encontrada.");

  const result: Array<{ round: number; columnIndex: number }> = [];
  for (let i = 1; i < header.length; i++) {
    const value = header[i];
    if (!/^\d+$/.test(value)) continue;
    result.push({ round: Number(value), columnIndex: i });
  }

  if (result.length === 0) throw new Error("Nenhuma coluna de rodada encontrada.");
  return result;
}

function parseTeamCodeToken(
  rawToken: string,
  validCodes: Set<string>,
): ParsedToken | null {
  const token = rawToken.trim().toLowerCase();
  if (!token) return null;

  const direct = token.match(/^([a-z]{3})(\d{1,2})$/);
  if (!direct) return null;

  let code = direct[1];
  const slot = Number(direct[2]);
  if (!Number.isFinite(slot) || slot <= 0) return null;

  if (!validCodes.has(code)) {
    const aliases: Record<string, string> = {
      grj: "gjr",
      fox: "fxr",
    };
    code = aliases[code] ?? code;
  }

  return { teamCode: code, slot, isKnownCode: validCodes.has(code) };
}

function extractTeamCodeMap(teamsMatrix: CsvMatrix): Map<string, string> {
  const teamNameRow = teamsMatrix.find((row) => row[0]?.toLowerCase() === "team name");
  const teamCodeRow = teamsMatrix.find((row) => row[0]?.toLowerCase() === "team code");

  if (!teamNameRow || !teamCodeRow) {
    throw new Error("Linhas 'Team Name' e/ou 'Team Code' não encontradas no FC2 Teams CSV.");
  }

  const map = new Map<string, string>();
  const maxLength = Math.max(teamNameRow.length, teamCodeRow.length);
  for (let i = 1; i < maxLength; i++) {
    const name = teamNameRow[i]?.trim();
    const code = teamCodeRow[i]?.trim().toLowerCase();
    if (!name || !code) continue;
    map.set(code, name);
  }

  if (map.size === 0) throw new Error("Nenhum mapeamento de equipe encontrado em FC2 Teams CSV.");
  return map;
}

function splitRosterCellNames(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized
    .split(/[\n,]/g)
    .map((part) => part.replace(/\(.*?\)/g, "").replace(/^"|"$/g, "").trim())
    .map((part) => part.replace(/\s+/g, " "))
    .filter((part) => part.length > 0);

  return [...new Set(parts)];
}

function extractTeamRosterNamesByCode(teamsMatrix: CsvMatrix): Map<string, string[]> {
  const teamCodeRowIndex = teamsMatrix.findIndex((row) => row[0]?.toLowerCase() === "team code");
  if (teamCodeRowIndex < 0) return new Map<string, string[]>();

  const teamCodeRow = teamsMatrix[teamCodeRowIndex] ?? [];
  const startIndex = teamsMatrix.findIndex((row) => row[0]?.toLowerCase().startsWith("drivers"));
  if (startIndex < 0) return new Map<string, string[]>();

  const rosterByCode = new Map<string, string[]>();
  for (let rowIndex = startIndex; rowIndex < teamsMatrix.length; rowIndex++) {
    const label = teamsMatrix[rowIndex]?.[0]?.trim().toLowerCase() ?? "";
    if (!(label.startsWith("drivers") || /^\d+$/.test(label))) break;

    for (let i = 1; i < teamCodeRow.length; i++) {
      const code = teamCodeRow[i]?.trim().toLowerCase();
      const rawName = teamsMatrix[rowIndex]?.[i]?.trim() ?? "";
      if (!code || !rawName || rawName === "0") continue;
      const list = rosterByCode.get(code) ?? [];
      list.push(...splitRosterCellNames(rawName));
      rosterByCode.set(code, list);
    }
  }

  return rosterByCode;
}

function resolveTeamCodeToId(
  teamCodeToName: Map<string, string>,
  seasonTeams: Array<{ id: string; name: string }>,
): { map: Map<string, string>; unresolved: string[] } {
  const teamNameToId = new Map(
    seasonTeams.map((team) => [normalizeName(team.name), team.id] as const),
  );

  const aliasByCode: Record<string, string> = {
    ssr: "Skibidi Force India",
  };

  const resolved = new Map<string, string>();
  const unresolved: string[] = [];

  for (const [code, name] of teamCodeToName.entries()) {
    const targetName = aliasByCode[code] ?? name;
    const id = teamNameToId.get(normalizeName(targetName));
    if (!id) {
      unresolved.push(`${code} -> ${name}`);
      continue;
    }
    resolved.set(code, id);
  }

  return { map: resolved, unresolved };
}

function extractRoundRows(
  individualMatrix: CsvMatrix,
  teamMatrix: CsvMatrix,
  roundColumns: Array<{ round: number; columnIndex: number }>,
  validCodes: Set<string>,
): { rows: RoundRow[]; invalidTokens: Array<{ round: number; placement: number; token: string }> } {
  const placementsIndex = individualMatrix.findIndex(
    (row) => row[0]?.toLowerCase() === "placements",
  );
  if (placementsIndex < 0) throw new Error("Seção 'Placements' não encontrada no Individual Results CSV.");

  const teamPlacementsIndex = teamMatrix.findIndex(
    (row) => row[0]?.toLowerCase() === "placements",
  );
  if (teamPlacementsIndex < 0) {
    throw new Error("Seção 'Placements' não encontrada no Team Results CSV.");
  }

  const teamRowByPlacement = new Map<number, string[]>();
  for (let rowIndex = teamPlacementsIndex + 1; rowIndex < teamMatrix.length; rowIndex++) {
    const placementLabel = teamMatrix[rowIndex]?.[0]?.trim() ?? "";
    if (!placementLabel) break;
    const placementMatch = placementLabel.match(/^(\d+)(st|nd|rd|th)$/i);
    if (!placementMatch) continue;
    const placement = Number(placementMatch[1]);
    teamRowByPlacement.set(placement, teamMatrix[rowIndex] ?? []);
  }

  const rows: RoundRow[] = [];
  const invalidTokens: Array<{ round: number; placement: number; token: string }> = [];

  for (let rowIndex = placementsIndex + 1; rowIndex < individualMatrix.length; rowIndex++) {
    const placementLabel = individualMatrix[rowIndex]?.[0]?.trim() ?? "";
    if (!placementLabel) break;
    const placementMatch = placementLabel.match(/^(\d+)(st|nd|rd|th)$/i);
    if (!placementMatch) continue;
    const placement = Number(placementMatch[1]);

    for (const { round, columnIndex } of roundColumns) {
      const driverNameRaw = individualMatrix[rowIndex]?.[columnIndex]?.trim() ?? "";
      if (!driverNameRaw || driverNameRaw === "0") continue;

      const teamRow = teamRowByPlacement.get(placement) ?? [];
      const teamTokenRaw = teamRow[columnIndex]?.trim() ?? "";
      const parsed = parseTeamCodeToken(teamTokenRaw, validCodes);
      if (teamTokenRaw && (!parsed || !parsed.isKnownCode)) {
        invalidTokens.push({ round, placement, token: teamTokenRaw });
      }

      rows.push({
        round,
        placement,
        driverNameRaw,
        teamCode: parsed?.teamCode ?? null,
        slot: parsed?.slot ?? null,
      });
    }
  }

  return { rows, invalidTokens };
}

function buildDriverResolver(
  seasonDrivers: Array<{ id: string; currentName: string | null; uuid: string; previousNames: string[] }>,
): {
  resolve: (raw: string) => string | null;
  ambiguous: Set<string>;
} {
  const byNormalized = new Map<string, Set<string>>();

  const push = (key: string, driverId: string): void => {
    if (!key) return;
    const current = byNormalized.get(key) ?? new Set<string>();
    current.add(driverId);
    byNormalized.set(key, current);
  };

  for (const driver of seasonDrivers) {
    push(normalizeName(driver.uuid), driver.id);
    if (driver.currentName) push(normalizeName(driver.currentName), driver.id);
    for (const previous of driver.previousNames ?? []) {
      push(normalizeName(previous), driver.id);
    }
  }

  const ambiguous = new Set<string>();

  const resolve = (raw: string): string | null => {
    const key = normalizeName(raw);
    const candidates = byNormalized.get(key);
    if (!candidates || candidates.size === 0) return null;
    if (candidates.size > 1) {
      ambiguous.add(raw);
      return null;
    }
    return [...candidates][0] ?? null;
  };

  const allKeys = [...byNormalized.keys()];

  const resolveWithFuzzy = (raw: string): string | null => {
    const aliasTarget = MANUAL_DRIVER_NAME_ALIASES[normalizeName(raw)];
    if (aliasTarget) {
      const aliasResolved = resolve(aliasTarget);
      if (aliasResolved) return aliasResolved;
    }

    const exact = resolve(raw);
    if (exact) return exact;

    const key = normalizeName(raw);
    if (!key) return null;

    let bestDistance = Number.MAX_SAFE_INTEGER;
    let bestKey: string | null = null;
    let ties = 0;

    for (const candidateKey of allKeys) {
      const distance = levenshtein(key, candidateKey);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestKey = candidateKey;
        ties = 1;
      } else if (distance === bestDistance) {
        ties++;
      }
    }

    if (!bestKey || bestDistance > 2 || ties > 1) return null;
    const candidateSet = byNormalized.get(bestKey);
    if (!candidateSet || candidateSet.size !== 1) return null;
    return [...candidateSet][0] ?? null;
  };

  return { resolve: resolveWithFuzzy, ambiguous };
}

function buildAssignmentIntervals(rows: ResolvedRoundRow[], maxRound: number): AssignmentInterval[] {
  const byDriver = new Map<string, Array<{ round: number; teamId: string | null }>>();
  for (const row of rows) {
    const list = byDriver.get(row.driverId) ?? [];
    list.push({ round: row.round, teamId: row.teamId });
    byDriver.set(row.driverId, list);
  }

  const intervals: AssignmentInterval[] = [];

  for (const [driverId, entries] of byDriver.entries()) {
    const byRound = new Map<number, string | null>();
    for (const entry of entries) {
      byRound.set(entry.round, entry.teamId);
    }

    const explicitRounds = [...byRound.keys()].sort((a, b) => a - b);
    if (explicitRounds.length === 0) continue;

    let currentFrom = explicitRounds[0];
    let currentTeam = byRound.get(currentFrom) ?? null;

    for (let i = 1; i < explicitRounds.length; i++) {
      const round = explicitRounds[i];
      const team = byRound.get(round) ?? null;
      if (team === currentTeam) continue;

      intervals.push({
        driverId,
        teamId: currentTeam,
        fromRound: currentFrom,
        toRound: round - 1,
      });

      currentFrom = round;
      currentTeam = team;
    }

    intervals.push({
      driverId,
      teamId: currentTeam,
      fromRound: currentFrom,
      toRound: null,
    });
  }

  return intervals.filter((interval) => interval.fromRound <= maxRound);
}

function buildDepthVersions(rows: ResolvedRoundRow[], maxRound: number): DepthVersion[] {
  const byRoundTeam = new Map<string, Array<{ driverId: string; slot: number; placement: number }>>();

  for (const row of rows) {
    if (!row.teamId || !row.slot) continue;
    const key = `${row.round}:${row.teamId}`;
    const list = byRoundTeam.get(key) ?? [];
    list.push({ driverId: row.driverId, slot: row.slot, placement: row.placement });
    byRoundTeam.set(key, list);
  }

  const teams = new Set<string>();
  for (const key of byRoundTeam.keys()) {
    teams.add(key.split(":")[1] ?? "");
  }

  const versions: DepthVersion[] = [];

  for (const teamId of teams) {
    let active: {
      fromRound: number;
      slotsKey: string;
      slots: Array<{ driverId: string; priority: number }>;
      slotMap: Map<number, string>;
    } | null = null;

    for (let round = 1; round <= maxRound; round++) {
      const key = `${round}:${teamId}`;
      const roundRows = byRoundTeam.get(key);
      if (!roundRows || roundRows.length === 0) continue;

      const dedup = new Map<number, string>();
      const bySlot = new Map<number, Array<{ driverId: string; placement: number }>>();
      for (const entry of roundRows) {
        const list = bySlot.get(entry.slot) ?? [];
        list.push({ driverId: entry.driverId, placement: entry.placement });
        bySlot.set(entry.slot, list);
      }

      for (const [slot, entries] of bySlot.entries()) {
        const byDriver = new Map<string, { count: number; bestPlacement: number }>();
        for (const entry of entries) {
          const current = byDriver.get(entry.driverId) ?? {
            count: 0,
            bestPlacement: Number.MAX_SAFE_INTEGER,
          };
          current.count += 1;
          current.bestPlacement = Math.min(current.bestPlacement, entry.placement);
          byDriver.set(entry.driverId, current);
        }

        const sorted = [...byDriver.entries()].sort((a, b) => {
          if (b[1].count !== a[1].count) return b[1].count - a[1].count;
          if (a[1].bestPlacement !== b[1].bestPlacement) {
            return a[1].bestPlacement - b[1].bestPlacement;
          }
          return a[0].localeCompare(b[0]);
        });

        const winner = sorted[0]?.[0];
        if (winner) dedup.set(slot, winner);
      }

      const nextSlotMap = new Map<number, string>();
      for (const [slot, driverId] of dedup.entries()) {
        // Keep one slot per driver by removing previous slot before assigning new slot
        for (const [existingSlot, existingDriverId] of nextSlotMap.entries()) {
          if (existingDriverId === driverId && existingSlot !== slot) {
            nextSlotMap.delete(existingSlot);
          }
        }
        nextSlotMap.set(slot, driverId);
      }

      const slots = [...nextSlotMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([priority, driverId]) => ({ driverId, priority }));

      const slotsKey = slots.map((s) => `${s.priority}:${s.driverId}`).join("|");
      if (!slotsKey) continue;

      if (!active) {
        active = { fromRound: round, slotsKey, slots, slotMap: nextSlotMap };
        continue;
      }

      if (slotsKey === active.slotsKey) continue;

      versions.push({
        teamId,
        fromRound: active.fromRound,
        toRound: round - 1,
        slots: active.slots,
      });

      active = { fromRound: round, slotsKey, slots, slotMap: nextSlotMap };
    }

    if (active) {
      versions.push({
        teamId,
        fromRound: active.fromRound,
        toRound: null,
        slots: active.slots,
      });
    }
  }

  return versions;
}

function buildFinalRosterDepthVersions(
  assignmentIntervals: AssignmentInterval[],
  depthVersions: DepthVersion[],
  maxRound: number,
  additionalRosterByTeam: Map<string, Set<string>>,
): DepthVersion[] {
  const minPriorityByTeamDriver = new Map<string, number>();
  for (const version of depthVersions) {
    for (const slot of version.slots) {
      const key = `${version.teamId}:${slot.driverId}`;
      const current = minPriorityByTeamDriver.get(key);
      if (current === undefined || slot.priority < current) {
        minPriorityByTeamDriver.set(key, slot.priority);
      }
    }
  }

  const byTeam = new Map<string, Map<string, number>>();
  for (const interval of assignmentIntervals) {
    if (!interval.teamId) continue;
    const teamMap = byTeam.get(interval.teamId) ?? new Map<string, number>();
    const current = teamMap.get(interval.driverId);
    if (current === undefined || interval.fromRound < current) {
      teamMap.set(interval.driverId, interval.fromRound);
    }
    byTeam.set(interval.teamId, teamMap);
  }

  for (const [teamId, drivers] of additionalRosterByTeam.entries()) {
    if (drivers.size === 0) continue;

    const csvTeamMap = new Map<string, number>();
    for (const driverId of drivers) {
      csvTeamMap.set(driverId, 1);
    }

    // If CSV roster exists for a team, it is the source of truth for final snapshot.
    byTeam.set(teamId, csvTeamMap);
  }

  const finalVersions: DepthVersion[] = [];
  for (const [teamId, driverRounds] of byTeam.entries()) {
    const sorted = [...driverRounds.entries()].sort((a, b) => {
      const [driverA, fromA] = a;
      const [driverB, fromB] = b;
      const pA = minPriorityByTeamDriver.get(`${teamId}:${driverA}`) ?? Number.MAX_SAFE_INTEGER;
      const pB = minPriorityByTeamDriver.get(`${teamId}:${driverB}`) ?? Number.MAX_SAFE_INTEGER;
      if (pA !== pB) return pA - pB;
      if (fromA !== fromB) return fromA - fromB;
      return driverA.localeCompare(driverB);
    });

    const slots = sorted.map(([driverId], index) => ({
      driverId,
      priority: index + 1,
    }));

    if (slots.length === 0) continue;

    finalVersions.push({
      teamId,
      fromRound: maxRound + 1,
      toRound: null,
      slots,
    });
  }

  return finalVersions;
}

function buildRoundPositionDriverMap(
  rows: Array<{
    driverId: string;
    position: number;
    raceRound: number;
    points: number;
  }>,
): RoundPositionDriverMap {
  const aggregate = new Map<string, { round: number; driverId: string; bestPosition: number; points: number }>();

  for (const row of rows) {
    const key = `${row.raceRound}:${row.driverId}`;
    const current = aggregate.get(key);
    if (!current) {
      aggregate.set(key, {
        round: row.raceRound,
        driverId: row.driverId,
        bestPosition: row.position,
        points: row.points,
      });
      continue;
    }

    current.bestPosition = Math.min(current.bestPosition, row.position);
    current.points += row.points;
    aggregate.set(key, current);
  }

  const byRound = new Map<number, Map<number, string[]>>();
  for (const value of aggregate.values()) {
    const roundMap = byRound.get(value.round) ?? new Map<number, string[]>();
    const list = roundMap.get(value.bestPosition) ?? [];
    list.push(value.driverId);
    roundMap.set(value.bestPosition, list);
    byRound.set(value.round, roundMap);
  }

  const resolved = new Map<number, Map<number, string>>();
  for (const [round, roundMap] of byRound.entries()) {
    const map = new Map<number, string>();
    for (const [position, drivers] of roundMap.entries()) {
      if (drivers.length === 1) {
        map.set(position, drivers[0]);
      }
    }
    resolved.set(round, map);
  }

  return resolved;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const [individualMatrix, teamMatrix, teamsMatrix] = await Promise.all([
      readCsv(options.individualCsvPath),
      readCsv(options.teamCsvPath),
      readCsv(options.teamsCsvPath),
    ]);

    const season = await prisma.season.findUnique({
      where: { id: options.seasonId },
      select: {
        id: true,
        name: true,
        league: {
          select: {
            id: true,
            teams: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!season) throw new Error("Temporada não encontrada.");

    const seasonDrivers = await prisma.driver.findMany({
      where: {
        OR: [
          { assignments: { some: { seasonId: options.seasonId } } },
          { roundResults: { some: { eventRound: { race: { seasonId: options.seasonId } } } } },
        ],
      },
      select: {
        id: true,
        uuid: true,
        currentName: true,
        previousNames: true,
      },
    });

    const allDrivers = await prisma.driver.findMany({
      select: {
        id: true,
        uuid: true,
        currentName: true,
        previousNames: true,
      },
    });

    const roundResults = await prisma.roundResult.findMany({
      where: {
        disqualified: false,
        eventRound: {
          countsForStandings: true,
          race: { seasonId: options.seasonId },
        },
      },
      select: {
        driverId: true,
        position: true,
        points: true,
        eventRound: {
          select: {
            race: {
              select: {
                round: true,
              },
            },
          },
        },
      },
    });

    const roundPositionMap = buildRoundPositionDriverMap(
      roundResults.map((row) => ({
        driverId: row.driverId,
        position: row.position,
        points: row.points,
        raceRound: row.eventRound.race.round,
      })),
    );

    const teamCodeToName = extractTeamCodeMap(teamsMatrix);
    const teamRosterNamesByCode = extractTeamRosterNamesByCode(teamsMatrix);
    for (const [code, name] of Object.entries(MANUAL_TEAM_CODE_NAME_ALIASES)) {
      if (!teamCodeToName.has(code)) {
        teamCodeToName.set(code, name);
      }
    }

    const validCodes = new Set(teamCodeToName.keys());
    const resolvedCodes = resolveTeamCodeToId(teamCodeToName, season.league.teams);
    const teamCodeToId = resolvedCodes.map;

    const roundColumns = buildRoundColumns(individualMatrix);
    const maxRound = Math.max(...roundColumns.map((c) => c.round));

    const extracted = extractRoundRows(individualMatrix, teamMatrix, roundColumns, validCodes);
    const combinedDrivers = new Map<string, (typeof allDrivers)[number]>();
    for (const driver of allDrivers) {
      combinedDrivers.set(driver.id, driver);
    }
    const resolver = buildDriverResolver([...combinedDrivers.values()]);
    const unresolvedCodeNames = [...resolvedCodes.unresolved];
    const unresolvedCodes = new Set<string>();

    const unresolvedDrivers = new Set<string>();
    const unresolvedTeamRows: Array<{ code: string; round: number; driverId: string }> = [];
    const resolvedRows: ResolvedRoundRow[] = [];

    for (const row of extracted.rows) {
      const byPosition = roundPositionMap.get(row.round);
      const positionMappedDriverId = byPosition?.get(row.placement);
      const nameMappedDriverId = resolver.resolve(row.driverNameRaw);
      const driverId = nameMappedDriverId ?? positionMappedDriverId;

      if (!driverId) {
        unresolvedDrivers.add(row.driverNameRaw);
        continue;
      }

      const teamId = row.teamCode ? teamCodeToId.get(row.teamCode) ?? null : null;
      if (row.teamCode && !teamId && !MANUAL_IGNORED_TEAM_CODES.has(row.teamCode)) {
        unresolvedTeamRows.push({ code: row.teamCode, round: row.round, driverId });
      }

      resolvedRows.push({ ...row, driverId, teamId });
    }

    const allAssignments = await prisma.seasonTeamAssignment.findMany({
      where: { seasonId: options.seasonId },
      select: {
        driverId: true,
        teamId: true,
        effectiveFromRound: true,
        effectiveToRound: true,
      },
    });

    const inferTeamAtRound = (driverId: string, round: number): string | null => {
      const candidates = allAssignments.filter(
        (a) =>
          a.driverId === driverId &&
          (a.effectiveFromRound ?? 1) <= round &&
          (a.effectiveToRound === null || a.effectiveToRound >= round),
      );
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => (b.effectiveFromRound ?? 1) - (a.effectiveFromRound ?? 1));
      return candidates[0]?.teamId ?? null;
    };

    const teamIdToName = new Map(season.league.teams.map((t) => [t.id, t.name] as const));
    const votes = new Map<string, Map<string, number>>();
    for (const row of unresolvedTeamRows) {
      const inferredTeamId = inferTeamAtRound(row.driverId, row.round);
      if (!inferredTeamId) continue;
      const byTeam = votes.get(row.code) ?? new Map<string, number>();
      byTeam.set(inferredTeamId, (byTeam.get(inferredTeamId) ?? 0) + 1);
      votes.set(row.code, byTeam);
    }

    const inferredCodeToTeamId = new Map<string, string>();
    for (const [code, byTeam] of votes.entries()) {
      const ranked = [...byTeam.entries()].sort((a, b) => b[1] - a[1]);
      const best = ranked[0];
      const second = ranked[1];
      if (!best) continue;
      const bestVotes = best[1];
      const secondVotes = second?.[1] ?? 0;
      if (bestVotes >= 2 && bestVotes > secondVotes) {
        inferredCodeToTeamId.set(code, best[0]);
      }
    }

    for (let i = 0; i < resolvedRows.length; i++) {
      const row = resolvedRows[i];
      if (!row.teamCode || row.teamId) continue;
      const inferredTeamId = inferredCodeToTeamId.get(row.teamCode);
      if (!inferredTeamId) continue;

      resolvedRows[i] = {
        ...row,
        teamId: inferredTeamId,
      };
    }

    const pendingTeamCreations = new Map<string, { code: string; name: string }>();
    for (let i = 0; i < resolvedRows.length; i++) {
      const row = resolvedRows[i];
      if (!row.teamCode || row.teamId) continue;

      const teamName = teamCodeToName.get(row.teamCode);
      if (!teamName) continue;

      const placeholderTeamId = placeholderTeamIdForCode(row.teamCode);
      pendingTeamCreations.set(placeholderTeamId, { code: row.teamCode, name: teamName });
      resolvedRows[i] = {
        ...row,
        teamId: placeholderTeamId,
      };
    }

    const additionalRosterByTeam = new Map<string, Set<string>>();
    const pendingDriverCreations = new Map<string, PendingDriverCreation>();
    for (const [code, names] of teamRosterNamesByCode.entries()) {
      const targetTeamId =
        teamCodeToId.get(code) ??
        inferredCodeToTeamId.get(code) ??
        (teamCodeToName.has(code) ? placeholderTeamIdForCode(code) : null);
      if (!targetTeamId) continue;

      if (isPlaceholderTeamId(targetTeamId) && !pendingTeamCreations.has(targetTeamId)) {
        const name = teamCodeToName.get(code);
        if (name) {
          pendingTeamCreations.set(targetTeamId, { code, name });
        }
      }

      const set = additionalRosterByTeam.get(targetTeamId) ?? new Set<string>();
      for (const rawName of names) {
        const driverId = resolver.resolve(rawName);
        if (driverId) {
          set.add(driverId);
          continue;
        }

        const placeholderId = placeholderDriverIdForName(rawName);
        const placeholderUuid = placeholderDriverUuidForName(rawName);
        pendingDriverCreations.set(placeholderId, {
          id: placeholderId,
          uuid: placeholderUuid,
          name: rawName,
        });
        set.add(placeholderId);
      }
      additionalRosterByTeam.set(targetTeamId, set);
    }

    const byDriverKnownTeams = new Map<string, Array<{ round: number; teamId: string }>>();
    for (const row of resolvedRows) {
      if (!row.teamId) continue;
      const list = byDriverKnownTeams.get(row.driverId) ?? [];
      list.push({ round: row.round, teamId: row.teamId });
      byDriverKnownTeams.set(row.driverId, list);
    }

    const inferByDriverTimeline = (driverId: string, round: number): string | null => {
      const entries = byDriverKnownTeams.get(driverId);
      if (!entries || entries.length === 0) return null;

      const sameRound = entries.filter((entry) => entry.round === round);
      if (sameRound.length > 0) {
        const byTeam = new Map<string, number>();
        for (const entry of sameRound) {
          byTeam.set(entry.teamId, (byTeam.get(entry.teamId) ?? 0) + 1);
        }
        const ranked = [...byTeam.entries()].sort((a, b) => b[1] - a[1]);
        return ranked[0]?.[0] ?? null;
      }

      const sorted = [...entries].sort((a, b) => a.round - b.round);
      let best: { teamId: string; distance: number } | null = null;
      for (const entry of sorted) {
        const distance = Math.abs(entry.round - round);
        if (!best || distance < best.distance) {
          best = { teamId: entry.teamId, distance };
        }
      }

      if (!best || best.distance > 2) return null;
      return best.teamId;
    };

    for (let i = 0; i < resolvedRows.length; i++) {
      const row = resolvedRows[i];
      if (!row.teamCode || row.teamId) continue;
      if (MANUAL_IGNORED_TEAM_CODES.has(row.teamCode)) continue;
      const inferred = inferByDriverTimeline(row.driverId, row.round);
      if (!inferred) continue;

      resolvedRows[i] = {
        ...row,
        teamId: inferred,
      };
    }

    for (const unresolved of unresolvedCodeNames) {
      const code = unresolved.split(" -> ")[0]?.trim();
      if (!code) continue;
      if (MANUAL_IGNORED_TEAM_CODES.has(code)) continue;
      if (teamCodeToId.has(code) || inferredCodeToTeamId.has(code)) continue;
      if (teamCodeToName.has(code)) continue;
      unresolvedCodes.add(unresolved);
    }

    for (const row of resolvedRows) {
      if (!row.teamCode || row.teamId) continue;
      if (MANUAL_IGNORED_TEAM_CODES.has(row.teamCode)) continue;
      unresolvedCodes.add(`${row.teamCode} (usado em round ${row.round})`);
    }

    const assignmentIntervals = buildAssignmentIntervals(resolvedRows, maxRound);
    const depthVersions = buildDepthVersions(resolvedRows, maxRound);
    const boundedDepthVersions = depthVersions.map((version) =>
      version.toRound === null
        ? {
            ...version,
            toRound: maxRound,
          }
        : version,
    );
    const finalRosterDepthVersions = buildFinalRosterDepthVersions(
      assignmentIntervals,
      boundedDepthVersions,
      maxRound,
      additionalRosterByTeam,
    );
    const depthVersionsWithFinal = [...boundedDepthVersions, ...finalRosterDepthVersions];

    const duplicateSlotConflicts = new Set<string>();
    for (const row of resolvedRows) {
      if (!row.teamId || !row.slot) continue;
      const key = `${row.round}:${row.teamId}:${row.slot}`;
      if (duplicateSlotConflicts.has(key)) continue;
      const count = resolvedRows.filter(
        (candidate) =>
          candidate.round === row.round &&
          candidate.teamId === row.teamId &&
          candidate.slot === row.slot,
      ).length;
      if (count > 1) duplicateSlotConflicts.add(key);
    }

    console.log("--- FC2 Rebuild Dry Run ---");
    console.log("Temporada:", season.name, season.id);
    console.log("Rounds detectados:", roundColumns.length, "(max:", maxRound, ")");
    console.log("Linhas extraídas:", extracted.rows.length);
    console.log("Linhas resolvidas:", resolvedRows.length);
    console.log("Assignments gerados:", assignmentIntervals.length);
    console.log("Versões de depth geradas:", boundedDepthVersions.length);
    console.log("Versões finais de roster:", finalRosterDepthVersions.length);
    console.log("Tokens de time inválidos:", extracted.invalidTokens.length);
    console.log("Drivers não resolvidos:", unresolvedDrivers.size);
    console.log("Mapeamentos de time não resolvidos:", unresolvedCodes.size);
    console.log("Conflitos de slot duplicado:", duplicateSlotConflicts.size);
    console.log("Team codes inferidos por voto:", inferredCodeToTeamId.size);
    console.log("Times a criar automaticamente:", pendingTeamCreations.size);
    console.log("Drivers legacy a criar:", pendingDriverCreations.size);

    if (extracted.invalidTokens.length > 0) {
      console.log(
        "Exemplos token inválido:",
        extracted.invalidTokens.slice(0, 15).map((item) => item.token),
      );
    }

    if (unresolvedDrivers.size > 0) {
      console.log("Drivers não resolvidos:", [...unresolvedDrivers].slice(0, 40));
    }

    if (unresolvedCodes.size > 0) {
      console.log("Team codes não resolvidos:", [...unresolvedCodes].slice(0, 30));

      const unresolvedRowsPreview = resolvedRows
        .filter((row) => row.teamCode && !row.teamId)
        .slice(0, 25)
        .map((row) => {
          const driver = allDrivers.find((d) => d.id === row.driverId);
          return {
            code: row.teamCode,
            round: row.round,
            placement: row.placement,
            driver: driver?.currentName ?? driver?.uuid ?? row.driverId,
          };
        });

      if (unresolvedRowsPreview.length > 0) {
        console.log("Linhas sem mapeamento (amostra):", unresolvedRowsPreview);
      }

      const suggestions = [...votes.entries()].map(([code, byTeam]) => {
        const ranked = [...byTeam.entries()].sort((a, b) => b[1] - a[1]);
        const [teamId, count] = ranked[0] ?? ["", 0];
        return {
          code,
          suggestedTeam: teamIdToName.get(teamId) ?? teamId,
          votes: count,
        };
      });

      if (suggestions.length > 0) {
        console.log("Sugestões de mapeamento por voto:", suggestions);
      }
    }

    if (inferredCodeToTeamId.size > 0) {
      const resolvedInferred = [...inferredCodeToTeamId.entries()].map(([code, teamId]) => ({
        code,
        team: teamIdToName.get(teamId) ?? teamId,
      }));
      console.log("Mapeamentos inferidos aplicados:", resolvedInferred);
    }

    if (pendingTeamCreations.size > 0) {
      console.log(
        "Times novos previstos:",
        [...pendingTeamCreations.values()].map((value) => `${value.code} -> ${value.name}`),
      );
    }

    if (duplicateSlotConflicts.size > 0) {
      console.log("Conflitos slot:", [...duplicateSlotConflicts].slice(0, 30));
    }

    if (!options.apply) {
      console.log("Modo dry-run finalizado. Use --apply para persistir.");
      return;
    }

    if (unresolvedDrivers.size > 0 || unresolvedCodes.size > 0) {
      throw new Error("Apply bloqueado: há pendências de resolução (drivers/códigos/conflitos).");
    }

    await prisma.$transaction(async (tx) => {
      const placeholderToRealTeamId = new Map<string, string>();

      for (const [placeholder, pending] of pendingTeamCreations.entries()) {
        const existing = await tx.team.findFirst({
          where: {
            leagueId: season.league.id,
            name: pending.name,
          },
          select: { id: true },
        });

        if (existing) {
          placeholderToRealTeamId.set(placeholder, existing.id);
          continue;
        }

        const created = await tx.team.create({
          data: {
            leagueId: season.league.id,
            name: pending.name,
          },
          select: { id: true },
        });

        placeholderToRealTeamId.set(placeholder, created.id);
      }

      const remapTeamId = (teamId: string | null): string | null => {
        if (!teamId) return null;
        if (!isPlaceholderTeamId(teamId)) return teamId;
        return placeholderToRealTeamId.get(teamId) ?? null;
      };

      await tx.seasonTeamDepthChartEntry.deleteMany({ where: { seasonId: options.seasonId } });
      await tx.seasonTeamAssignment.deleteMany({ where: { seasonId: options.seasonId } });
      await tx.standing.deleteMany({ where: { seasonId: options.seasonId } });

      if (pendingDriverCreations.size > 0) {
        await tx.driver.createMany({
          data: [...pendingDriverCreations.values()].map((pendingDriver) => ({
            id: pendingDriver.id,
            uuid: pendingDriver.uuid,
            currentName: pendingDriver.name,
          })),
          skipDuplicates: true,
        });
      }

      if (assignmentIntervals.length > 0) {
        await tx.seasonTeamAssignment.createMany({
          data: assignmentIntervals.map((interval) => ({
            id: `asg_${options.seasonId}_${interval.driverId}_${interval.fromRound}_${interval.teamId ?? "teamless"}`,
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

      const depthRowsWithFinal = depthVersionsWithFinal.flatMap((version) =>
        version.slots.map((slot) => ({
          id: `dc_${options.seasonId}_${version.teamId}_${slot.driverId}_${version.fromRound}_${slot.priority}`,
          seasonId: options.seasonId,
          teamId: remapTeamId(version.teamId),
          driverId: slot.driverId,
          priority: slot.priority,
          effectiveFromRound: version.fromRound,
          effectiveToRound: version.toRound,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );

      if (depthRowsWithFinal.length > 0) {
        await tx.seasonTeamDepthChartEntry.createMany({ data: depthRowsWithFinal });
      }
    }, { timeout: 60_000, maxWait: 20_000 });

    const reprocess = await reprocessSeasonStandings(options.seasonId, "MANUAL");
    console.log("Reprocessamento:", reprocess);
    console.log("Apply concluído.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Falha na reconstrução FC2:", error);
  process.exit(1);
});
