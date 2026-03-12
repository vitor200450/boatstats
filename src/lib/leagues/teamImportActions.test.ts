import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    league: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    team: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  getImportableTeams,
  importTeamToLeague,
} from "@/lib/leagues/teamActions";

const authMock = vi.mocked(auth);
const revalidatePathMock = vi.mocked(revalidatePath);

const prismaMock = prisma as unknown as {
  league: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  team: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

describe("team import actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists importable teams only from allowed leagues excluding target", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      expires: "2099-01-01T00:00:00.000Z",
    } as never);

    prismaMock.league.findFirst.mockResolvedValueOnce({ id: "league-target" });
    prismaMock.league.findMany.mockResolvedValueOnce([
      {
        id: "league-a",
        name: "Liga A",
        teams: [
          {
            id: "team-a",
            name: "Alpha",
            color: "#FF0000",
            logoUrl: null,
            logoScale: 1,
            logoPosX: 0,
            logoPosY: 0,
          },
        ],
      },
      {
        id: "league-b",
        name: "Liga B",
        teams: [],
      },
    ]);

    const result = await getImportableTeams("league-target");

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        id: "league-a",
        name: "Liga A",
        teams: [
          {
            id: "team-a",
            name: "Alpha",
            color: "#FF0000",
            logoUrl: null,
            logoScale: 1,
            logoPosX: 0,
            logoPosY: 0,
          },
        ],
      },
    ]);

    expect(prismaMock.league.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: "league-target" } }),
      }),
    );
  });

  it("imports team visual identity successfully", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      expires: "2099-01-01T00:00:00.000Z",
    } as never);

    prismaMock.league.findFirst
      .mockResolvedValueOnce({ id: "league-target" })
      .mockResolvedValueOnce({ id: "league-source" });

    prismaMock.team.findUnique.mockResolvedValueOnce({
      id: "team-source",
      leagueId: "league-source",
      name: "Team Legacy",
      color: "#123456",
      logoUrl: "https://cdn.example.com/logo.png",
      logoScale: 1.2,
      logoPosX: 10,
      logoPosY: -5,
    });

    prismaMock.team.findFirst.mockResolvedValueOnce(null);
    prismaMock.team.create.mockResolvedValueOnce({
      id: "team-imported",
      leagueId: "league-target",
      name: "Team Legacy",
    });

    const result = await importTeamToLeague({
      targetLeagueId: "league-target",
      sourceTeamId: "team-source",
    });

    expect(result.success).toBe(true);
    expect(prismaMock.team.create).toHaveBeenCalledWith({
      data: {
        leagueId: "league-target",
        name: "Team Legacy",
        color: "#123456",
        logoUrl: "https://cdn.example.com/logo.png",
        logoScale: 1.2,
        logoPosX: 10,
        logoPosY: -5,
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/leagues/league-target/teams",
    );
  });

  it("blocks import from same league", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      expires: "2099-01-01T00:00:00.000Z",
    } as never);

    prismaMock.league.findFirst.mockResolvedValueOnce({ id: "league-target" });
    prismaMock.team.findUnique.mockResolvedValueOnce({
      id: "team-source",
      leagueId: "league-target",
      name: "Same Team",
      color: null,
      logoUrl: null,
      logoScale: 1,
      logoPosX: 0,
      logoPosY: 0,
    });

    const result = await importTeamToLeague({
      targetLeagueId: "league-target",
      sourceTeamId: "team-source",
    });

    expect(result).toEqual({
      success: false,
      error: "Não é possível importar da mesma liga",
    });
    expect(prismaMock.team.create).not.toHaveBeenCalled();
  });

  it("blocks import when team name already exists in target league", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      expires: "2099-01-01T00:00:00.000Z",
    } as never);

    prismaMock.league.findFirst
      .mockResolvedValueOnce({ id: "league-target" })
      .mockResolvedValueOnce({ id: "league-source" });

    prismaMock.team.findUnique.mockResolvedValueOnce({
      id: "team-source",
      leagueId: "league-source",
      name: "Duplicated Name",
      color: null,
      logoUrl: null,
      logoScale: 1,
      logoPosX: 0,
      logoPosY: 0,
    });

    prismaMock.team.findFirst.mockResolvedValueOnce({ id: "existing-team" });

    const result = await importTeamToLeague({
      targetLeagueId: "league-target",
      sourceTeamId: "team-source",
    });

    expect(result).toEqual({
      success: false,
      error: "Já existe uma equipe com este nome na liga de destino",
    });
    expect(prismaMock.team.create).not.toHaveBeenCalled();
  });

  it("allows SUPER_ADMIN to import without source league membership", async () => {
    authMock.mockResolvedValue({
      user: { id: "super-1", role: "SUPER_ADMIN" },
      expires: "2099-01-01T00:00:00.000Z",
    } as never);

    prismaMock.team.findUnique.mockResolvedValueOnce({
      id: "team-source",
      leagueId: "league-foreign",
      name: "Cross League",
      color: "#111111",
      logoUrl: null,
      logoScale: 1,
      logoPosX: 0,
      logoPosY: 0,
    });
    prismaMock.team.findFirst.mockResolvedValueOnce(null);
    prismaMock.team.create.mockResolvedValueOnce({
      id: "team-imported",
      leagueId: "league-target",
      name: "Cross League",
    });

    const result = await importTeamToLeague({
      targetLeagueId: "league-target",
      sourceTeamId: "team-source",
    });

    expect(result.success).toBe(true);
    expect(prismaMock.league.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.team.create).toHaveBeenCalledTimes(1);
  });
});
