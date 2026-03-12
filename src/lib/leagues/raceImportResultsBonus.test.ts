import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/leagues/importActions", () => ({
  calculateStandings: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    race: {
      findUnique: vi.fn(),
    },
    driver: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { importRaceResults } from "@/lib/leagues/raceActions";

const authMock = vi.mocked(auth);

const prismaMock = prisma as unknown as {
  race: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  driver: {
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
};

function buildRaceFixture(overrides?: {
  eventRounds?: Array<{
    id: string;
    apiRoundName: string;
    apiRoundType: string;
    targetHeatName: string | null;
    origin?: "API" | "MANUAL";
    manualKind?: "FINAL" | null;
  }>;
}) {
  return {
    id: "race-1",
    seasonId: "season-1",
    scheduledDate: null,
    apiEventCache: {
      date: 1700000000,
      track_name: "Track",
      rounds: [
        {
          name: "R2-Final",
          type: "FINAL",
          heats: [
            {
              name: "R2F1",
              driver_results: [
                {
                  uuid: "uuid-1",
                  name: "Driver One",
                  position: 1,
                  start_position: 1,
                  finish_time: 12345,
                  laps: [],
                },
              ],
            },
          ],
        },
      ],
    },
    season: {
      id: "season-1",
      pointsSystem: {
        name: "Base",
        positions: { "1": 25 },
        bonuses: {},
        rules: {},
      },
      sprintConfig: null,
      league: {
        id: "league-1",
        ownerId: "owner-1",
        admins: [{ userId: "admin-1" }],
      },
    },
    eventRounds:
      overrides?.eventRounds ??
      [
        {
          id: "round-final",
          apiRoundName: "R2-Final",
          apiRoundType: "FINAL",
          targetHeatName: "R2F1",
          origin: "API",
          manualKind: null,
          specialType: "NONE",
          sprintMode: null,
        },
      ],
  };
}

describe("importRaceResults bonus integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      expires: "2099-01-01T00:00:00.000Z",
    } as never);
    prismaMock.$queryRaw.mockResolvedValue([{ reverseGridEnabled: false }]);
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.driver.upsert.mockResolvedValue({ id: "driver-generated" });
  });

  it("fails before import when bonus payload has non-integer values", async () => {
    prismaMock.race.findUnique.mockResolvedValue(buildRaceFixture());

    const result = await importRaceResults("race-1", {
      bonuses: [{ driverUuid: "uuid-1", points: 1.5 }],
      reason: "invalid",
    });

    expect(result).toEqual({
      success: false,
      error: "Bônus deve ser um número inteiro",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("allows bonuses for drivers outside imported final results", async () => {
    prismaMock.race.findUnique.mockResolvedValue(
      buildRaceFixture({
        eventRounds: [],
      }),
    );
    prismaMock.driver.findMany.mockResolvedValue([]);

    const tx = {
      race: { update: vi.fn() },
      roundResult: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn(),
      },
      eventRound: { update: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn(),
    };

    prismaMock.$transaction.mockImplementation(async (callback: (trx: typeof tx) => Promise<void>) => {
      return callback(tx);
    });

    const result = await importRaceResults("race-1", {
      bonuses: [{ driverUuid: "uuid-1", points: 2 }],
    });

    expect(result.success).toBe(true);
    expect(prismaMock.driver.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("replaces previous race bonuses without mutating round results directly", async () => {
    prismaMock.race.findUnique.mockResolvedValue(buildRaceFixture());
    prismaMock.driver.findMany.mockResolvedValue([{ id: "driver-1", uuid: "uuid-1" }]);

    const tx = {
      race: { update: vi.fn() },
      roundResult: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            {
              driverId: "driver-1",
              disqualified: false,
              fastestLap: false,
              fastestLapTime: null,
              driver: { uuid: "uuid-1" },
            },
          ]),
        upsert: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({ id: "rr-1" }),
      },
      eventRound: { update: vi.fn() },
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          { driverId: "driver-old", points: 3 },
        ])
        .mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    prismaMock.$transaction.mockImplementation(async (callback: (trx: typeof tx) => Promise<void>) => {
      return callback(tx);
    });

    const result = await importRaceResults("race-1", {
      bonuses: [{ driverUuid: "uuid-1", points: 2 }],
      reason: "compensação",
    });

    expect(result.success).toBe(true);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.roundResult.update).not.toHaveBeenCalled();
  });
});
