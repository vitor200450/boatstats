import { describe, expect, it, vi } from "vitest";

import sampleEvent from "../../../W4FC-response.json";
import { F1_STANDARD_POINTS } from "@/lib/leagues/pointsSystem";
import { FrosthexEventResultResponse } from "@/services/frosthexAPI";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { importRoundResultsWithDeps } from "@/lib/leagues/importActions";

const event = sampleEvent as FrosthexEventResultResponse;

describe("importRoundResultsWithDeps", () => {
  it("imports round results from cached Frosthex payload and triggers recalculation", async () => {
    const finalRound = event.rounds.find((round) => round.name === "R4-Final");
    expect(finalRound).toBeDefined();
    const finalHeat = finalRound!.heats.find((heat) => heat.name === "R4F1");
    expect(finalHeat).toBeDefined();

    const drivers = new Map<string, { id: string; uuid: string; currentName: string }>();
    let nextDriverId = 1;

    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const createMany = vi.fn().mockResolvedValue({ count: finalHeat!.driver_results.length });
    const updateRound = vi.fn().mockResolvedValue({ id: "round-1" });
    const updateRace = vi.fn().mockResolvedValue({ id: "race-1", status: "COMPLETED" });
    const calculateStandingsFn = vi.fn().mockResolvedValue({ success: true });
    const revalidateFn = vi.fn();

    const result = await importRoundResultsWithDeps("round-1", {
      authFn: async () => ({
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          id: "user-1",
          role: "SUPER_ADMIN",
        },
      }),
      calculateStandingsFn,
      revalidateFn,
      prismaClient: {
        eventRound: {
          findUnique: vi.fn().mockResolvedValue({
            id: "round-1",
            raceId: "race-1",
            apiRoundName: "R4-Final",
            targetHeatName: "R4F1",
            race: {
              seasonId: "season-1",
              apiEventCache: event,
              season: {
                id: "season-1",
                sprintConfig: null,
                pointsSystem: F1_STANDARD_POINTS,
                league: {
                  id: "league-1",
                  ownerId: "owner-1",
                  admins: [],
                },
              },
            },
          }),
          findMany: vi.fn().mockResolvedValue([{ status: "IMPORTED" }]),
          update: updateRound,
        },
        driver: {
          findUnique: vi.fn().mockImplementation(async ({ where }: { where: { uuid: string } }) => {
            return drivers.get(where.uuid) ?? null;
          }),
          create: vi.fn().mockImplementation(async ({ data }: { data: { uuid: string; currentName: string } }) => {
            const created = {
              id: `driver-${nextDriverId++}`,
              uuid: data.uuid,
              currentName: data.currentName,
            };
            drivers.set(data.uuid, created);
            return created;
          }),
          update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: { currentName: string } }) => {
            const existing = [...drivers.values()].find((driver) => driver.id === where.id);
            if (!existing) throw new Error("driver not found");
            const updated = { ...existing, currentName: data.currentName };
            drivers.set(updated.uuid, updated);
            return updated;
          }),
        },
        roundResult: {
          deleteMany,
          createMany,
        },
        race: {
          update: updateRace,
        },
        $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.imported).toBe(finalHeat!.driver_results.length);

    expect(deleteMany).toHaveBeenCalledWith({ where: { eventRoundId: "round-1" } });
    expect(createMany).toHaveBeenCalledTimes(1);

    const createManyPayload = createMany.mock.calls[0][0] as {
      data: Array<{ points: number; fastestLap: boolean; pitstops: number; finishTimeMs: number }>;
    };
    expect(createManyPayload.data).toHaveLength(finalHeat!.driver_results.length);
    expect(createManyPayload.data[0].points).toBe(0);
    expect(createManyPayload.data[0].fastestLap).toBe(false);
    expect(createManyPayload.data[0].pitstops).toBe(2);
    expect(createManyPayload.data[0].finishTimeMs).toBe(1767550);

    const hasFastestLap = createManyPayload.data.some((row) => row.fastestLap);
    expect(hasFastestLap).toBe(true);

    expect(updateRound).toHaveBeenCalled();
    expect(updateRace).toHaveBeenCalledWith({ where: { id: "race-1" }, data: { status: "COMPLETED" } });
    expect(calculateStandingsFn).toHaveBeenCalledWith("season-1");
    expect(revalidateFn).toHaveBeenCalledTimes(2);
  });

  it("blocks import when user has no permission", async () => {
    const createMany = vi.fn();

    const result = await importRoundResultsWithDeps("round-1", {
      authFn: async () => ({
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          id: "user-2",
          role: "USER",
        },
      }),
      calculateStandingsFn: vi.fn().mockResolvedValue({ success: true }),
      revalidateFn: vi.fn(),
      prismaClient: {
        eventRound: {
          findUnique: vi.fn().mockResolvedValue({
            id: "round-1",
            raceId: "race-1",
            apiRoundName: "R4-Final",
            targetHeatName: "R4F1",
            race: {
              seasonId: "season-1",
              apiEventCache: event,
              season: {
                id: "season-1",
                sprintConfig: null,
                pointsSystem: F1_STANDARD_POINTS,
                league: {
                  id: "league-1",
                  ownerId: "owner-1",
                  admins: [{ userId: "other-admin" }],
                },
              },
            },
          }),
          findMany: vi.fn(),
          update: vi.fn(),
        },
        driver: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        roundResult: {
          deleteMany: vi.fn(),
          createMany,
        },
        race: {
          update: vi.fn(),
        },
        $transaction: vi.fn(),
      },
    });

    expect(result).toEqual({ success: false, error: "Acesso negado" });
    expect(createMany).not.toHaveBeenCalled();
  });
});
