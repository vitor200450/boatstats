import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const seasonId = process.argv[2];
const csvPath = process.argv[3];

if (!seasonId || !csvPath) {
  console.error("Uso: bun scripts/compare-team-standings.ts <seasonId> <csvPath>");
  process.exit(1);
}

const aliasToDb = new Map<string, string>([
  ["Guaraná Juniors", "Guarana Juniors"],
]);

type OfficialTeamRow = {
  total: number;
  byRound: number[];
};

function parseOfficial(csvText: string): Map<string, OfficialTeamRow> {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const official = new Map<string, OfficialTeamRow>();

  for (const line of lines.slice(4)) {
    const cols = line.split(",");
    const position = Number(cols[0]);
    const name = (cols[1] ?? "").trim();
    const total = Number(cols[2]);
    const byRound = cols.slice(3).map((value) => Number(value)).filter((value) => !Number.isNaN(value));

    if (!name || Number.isNaN(position) || Number.isNaN(total)) continue;
    official.set(name, { total, byRound });
  }

  return official;
}

function extractDbRoundPoints(
  racePoints: unknown,
  raceOrder: Array<{ id: string; round: number }>,
): number[] {
  const perRace = (racePoints ?? {}) as Record<string, Record<string, number>>;

  return raceOrder.map((race) => {
    const payload = perRace[race.id] ?? {};
    return Object.values(payload).reduce((sum, value) => sum + Number(value || 0), 0);
  });
}

async function main(): Promise<void> {
  const csvText = await Bun.file(csvPath).text();
  const official = parseOfficial(csvText);

  const races = await prisma.race.findMany({
    where: { seasonId },
    select: { id: true, round: true },
    orderBy: { round: "asc" },
  });

  const dbRows = await prisma.standing.findMany({
    where: { seasonId, type: "TEAM" },
    select: {
      totalPoints: true,
      racePoints: true,
      team: { select: { name: true } },
    },
  });

  const db = new Map(dbRows.map((row) => [row.team?.name ?? "", row]));

  const mismatches: Array<{ name: string; official: number; dbName: string; db: number; diff: number }> = [];
  const missingInDb: Array<{ name: string; official: number }> = [];

  for (const [name, officialRow] of official.entries()) {
    const dbName = aliasToDb.get(name) ?? name;
    const dbRow = db.get(dbName);

    if (dbRow === undefined) {
      missingInDb.push({ name, official: officialRow.total });
      continue;
    }

    if (dbRow.totalPoints !== officialRow.total) {
      mismatches.push({
        name,
        official: officialRow.total,
        dbName,
        db: dbRow.totalPoints,
        diff: dbRow.totalPoints - officialRow.total,
      });

      const dbByRound = extractDbRoundPoints(dbRow.racePoints, races);
      const maxRounds = Math.max(officialRow.byRound.length, dbByRound.length);
      const perRoundDiffs: Array<{ round: number; official: number; db: number; diff: number }> = [];

      for (let i = 0; i < maxRounds; i++) {
        const officialPoints = officialRow.byRound[i] ?? 0;
        const dbPoints = dbByRound[i] ?? 0;
        if (officialPoints !== dbPoints) {
          perRoundDiffs.push({
            round: i + 1,
            official: officialPoints,
            db: dbPoints,
            diff: dbPoints - officialPoints,
          });
        }
      }

      if (perRoundDiffs.length > 0) {
        console.log(`ROUND_DIFFS ${name} (${perRoundDiffs.length})`);
        for (const item of perRoundDiffs) console.log(item);
      }
    }
  }

  const officialDbNames = new Set([...official.keys()].map((name) => aliasToDb.get(name) ?? name));
  const extraInDb = [...db.entries()]
    .filter(([name]) => !officialDbNames.has(name))
    .map(([name, row]) => ({ name, total: row.totalPoints }));

  console.log(`MISMATCHES (${mismatches.length})`);
  for (const row of mismatches) console.log(row);

  console.log(`MISSING_IN_DB (${missingInDb.length})`);
  for (const row of missingInDb) console.log(row);

  console.log(`EXTRA_IN_DB (${extraInDb.length})`);
  for (const row of extraInDb) console.log(row);
}

main()
  .catch((error) => {
    console.error("Erro na comparação:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
