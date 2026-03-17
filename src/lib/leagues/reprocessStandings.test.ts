import { describe, expect, it } from "vitest";

import { reprocessSeasonStandingsWithLock } from "@/lib/leagues/reprocessStandings";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("reprocessSeasonStandings", () => {
  it("returns success metadata when calculation succeeds", async () => {
    const result = await reprocessSeasonStandingsWithLock("season-success", "MANUAL", {
      calculateStandingsFn: async () => ({ success: true }),
    });

    expect(result.success).toBe(true);
    expect(result.reason).toBe("MANUAL");
    expect(typeof result.durationMs).toBe("number");
    expect((result.durationMs ?? 0) >= 0).toBe(true);
  });

  it("propagates calculation errors", async () => {
    const result = await reprocessSeasonStandingsWithLock("season-fail", "RACE_UPDATE", {
      calculateStandingsFn: async () => ({
        success: false,
        error: "Erro controlado de cálculo",
      }),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Erro controlado de cálculo");
    expect(result.reason).toBe("RACE_UPDATE");
  });

  it("rejects concurrent reprocess for same season", async () => {
    const pending = deferred<{ success: boolean; error?: string }>();

    const firstCall = reprocessSeasonStandingsWithLock("season-lock", "MANUAL", {
      calculateStandingsFn: () => pending.promise,
    });

    const secondCall = await reprocessSeasonStandingsWithLock("season-lock", "TRANSFER", {
      calculateStandingsFn: async () => ({ success: true }),
    });

    expect(secondCall.success).toBe(false);
    expect(secondCall.error).toContain("já está em reprocessamento");

    pending.resolve({ success: true });
    const firstResult = await firstCall;
    expect(firstResult.success).toBe(true);

    const thirdCall = await reprocessSeasonStandingsWithLock("season-lock", "TRANSFER", {
      calculateStandingsFn: async () => ({ success: true }),
    });
    expect(thirdCall.success).toBe(true);
  });
});
