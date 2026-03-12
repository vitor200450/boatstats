import Link from "next/link";
import { unstable_cache } from "next/cache";
import { notFound, permanentRedirect } from "next/navigation";
import { Trophy, Users, UsersRound, Flag, ChevronDown } from "lucide-react";
import { SeasonFinalSummary } from "@/components/SeasonFinalSummary";
import { Badge } from "@/components/Badge";
import { LeagueAccentScope } from "@/components/LeagueAccentScope";
import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import { getRequestLocale } from "@/i18n/request";
import { F1_STANDARD_POINTS, PointsSystem } from "@/lib/leagues/pointsSystem";
import { getSeasonSprintConfig } from "@/lib/leagues/roundRules";
import { getTeamScoringConfig } from "@/lib/leagues/teamScoringConfig";
import { calculateTeamRaceContributorsByMode } from "@/lib/leagues/teamScoringStrategies";
import { fillMissingSlotRosters } from "@/lib/leagues/slotRosterUtils";
import { prisma } from "@/lib/prisma";
import { PublicStandingsTableClient } from "./PublicStandingsTableClient";
import { RaceRoundsPanel } from "./RaceRoundsPanel";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string; tab?: "drivers" | "teams" | "rosters" | "races" }>;
}

interface TeamInfo {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  logoScale: number | null;
  logoPosX: number | null;
  logoPosY: number | null;
}

const getLeagueBaseData = unstable_cache(
  async (leagueSlug: string) => {
    return prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        logoUrl: true,
        seasons: {
          where: { status: { in: ["ACTIVE", "COMPLETED"] } },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
            pointsSystem: true,
            sprintConfig: true,
          },
        },
      },
    });
  },
  ["public-league-base-v2"],
  { revalidate: 60 },
);

const getLeagueSlugById = unstable_cache(
  async (leagueId: string) => {
    return prisma.league.findUnique({
      where: { id: leagueId },
      select: { slug: true },
    });
  },
  ["public-league-slug-by-id-v1"],
  { revalidate: 60 },
);

const getSeasonStandingsBundle = unstable_cache(
  async (seasonId: string) => {
    const [driverStandings, teamStandings, racesCount, completedRacesCount] =
      await prisma.$transaction([
        prisma.standing.findMany({
          where: { seasonId, type: "DRIVER" },
          orderBy: { position: "asc" },
          select: {
            id: true,
            position: true,
            totalPoints: true,
            wins: true,
            podiums: true,
            racePoints: true,
            driver: {
              select: {
                id: true,
                uuid: true,
                currentName: true,
              },
            },
          },
        }),
        prisma.standing.findMany({
          where: { seasonId, type: "TEAM" },
          orderBy: { position: "asc" },
          select: {
            id: true,
            position: true,
            totalPoints: true,
            wins: true,
            podiums: true,
            racePoints: true,
            team: {
              select: {
                id: true,
                name: true,
                color: true,
                logoUrl: true,
                logoScale: true,
                logoPosX: true,
                logoPosY: true,
              },
            },
          },
        }),
        prisma.race.count({ where: { seasonId } }),
        prisma.race.count({ where: { seasonId, status: "COMPLETED" } }),
      ]);

    return { driverStandings, teamStandings, racesCount, completedRacesCount };
  },
  ["public-season-standings-v2"],
  { revalidate: 60 },
);

const getSeasonTeamAssignments = unstable_cache(
  async (seasonId: string) => {
    return prisma.seasonTeamAssignment.findMany({
      where: { seasonId, leftAt: null, teamId: { not: null } },
      select: {
        teamId: true,
        driverId: true,
        team: {
          select: {
            id: true,
            name: true,
            color: true,
            logoUrl: true,
            logoScale: true,
            logoPosX: true,
            logoPosY: true,
          },
        },
        driver: {
          select: {
            id: true,
            uuid: true,
            currentName: true,
          },
        },
      },
    });
  },
  ["public-season-assignments-v1"],
  { revalidate: 60 },
);

const getSeasonDriverAssignments = unstable_cache(
  async (seasonId: string, driverIds: string[]) => {
    return prisma.seasonTeamAssignment.findMany({
      where: {
        seasonId,
        leftAt: null,
        teamId: { not: null },
        driverId: { in: driverIds },
      },
      select: {
        driverId: true,
        team: {
          select: {
            id: true,
            name: true,
            color: true,
            logoUrl: true,
            logoScale: true,
            logoPosX: true,
            logoPosY: true,
          },
        },
      },
    });
  },
  ["public-season-driver-assignments-v1"],
  { revalidate: 60 },
);

const getSeasonDepthChartEntries = unstable_cache(
  async (seasonId: string) => {
    return prisma.seasonTeamDepthChartEntry.findMany({
      where: { seasonId },
      select: {
        teamId: true,
        driverId: true,
        priority: true,
      },
    });
  },
  ["public-season-depth-chart-v1"],
  { revalidate: 60 },
);

const getSeasonRaceTeamRosters = unstable_cache(
  async (seasonId: string) => {
    return prisma.seasonRaceTeamRoster.findMany({
      where: { seasonId },
      select: {
        raceId: true,
        teamId: true,
        items: {
          where: { role: "MAIN" },
          orderBy: { priority: "asc" },
          select: {
            priority: true,
            driver: {
              select: {
                currentName: true,
              },
            },
          },
        },
      },
    });
  },
  ["public-season-race-team-rosters-v1"],
  { revalidate: 60 },
);

const getSeasonRacesOverview = unstable_cache(
  async (seasonId: string) => {
    return prisma.race.findMany({
      where: { seasonId },
      select: {
        id: true,
        round: true,
        name: true,
        trackApiName: true,
        scheduledDate: true,
        status: true,
        eventRounds: {
          orderBy: { apiRoundName: "asc" },
          select: {
            id: true,
            apiRoundName: true,
            specialType: true,
            sprintMode: true,
            countsForStandings: true,
            _count: {
              select: { results: true },
            },
            results: {
              orderBy: { position: "asc" },
              take: 10,
              select: {
                id: true,
                position: true,
                points: true,
                driver: {
                  select: {
                    uuid: true,
                    currentName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { round: "asc" },
    });
  },
  ["public-season-races-overview-v1"],
  { revalidate: 60 },
);

const getSeasonRaceLabels = unstable_cache(
  async (seasonId: string) => {
    return prisma.race.findMany({
      where: { seasonId },
      select: {
        id: true,
        round: true,
        name: true,
      },
      orderBy: { round: "asc" },
    });
  },
  ["public-season-race-labels-v1"],
  { revalidate: 60 },
);

const getSeasonDriverRacePositions = unstable_cache(
  async (seasonId: string) => {
    return prisma.roundResult.findMany({
      where: {
        disqualified: false,
        eventRound: {
          countsForStandings: true,
          race: { seasonId },
        },
      },
      select: {
        driverId: true,
        position: true,
        eventRound: {
          select: {
            raceId: true,
          },
        },
      },
    });
  },
  ["public-season-driver-race-positions-v1"],
  { revalidate: 60 },
);

const getSeasonTeamRoundContributors = unstable_cache(
  async (seasonId: string) => {
    const [season, races, roundResults, allAssignments, depthChartEntries, slotRosterEntries] =
      await prisma.$transaction([
        prisma.season.findUnique({
          where: { id: seasonId },
          select: {
            pointsSystem: true,
            sprintConfig: true,
          },
        }),
        prisma.race.findMany({
          where: { seasonId },
          select: {
            id: true,
            round: true,
            name: true,
            createdAt: true,
            scheduledDate: true,
          },
          orderBy: { round: "asc" },
        }),
        prisma.roundResult.findMany({
          where: {
            disqualified: false,
            eventRound: {
              countsForStandings: true,
              race: { seasonId },
            },
          },
          select: {
            driverId: true,
            position: true,
            points: true,
            eventRound: {
              select: {
                raceId: true,
              },
            },
          },
        }),
        prisma.seasonTeamAssignment.findMany({
          where: { seasonId, teamId: { not: null } },
          select: {
            teamId: true,
            driverId: true,
            joinedAt: true,
            leftAt: true,
            driver: {
              select: {
                uuid: true,
                currentName: true,
              },
            },
          },
        }),
        prisma.$queryRaw`
          SELECT "seasonId", "teamId", "driverId", "priority"
          FROM "SeasonTeamDepthChartEntry"
          WHERE "seasonId" = ${seasonId}
          ORDER BY "teamId" ASC, "priority" ASC
        `,
        prisma.$queryRaw`
          SELECT r."seasonId", r."raceId", r."teamId", i."driverId", i."role", i."priority"
          FROM "SeasonRaceTeamRoster" r
          INNER JOIN "SeasonRaceTeamRosterItem" i ON i."rosterId" = r."id"
          WHERE r."seasonId" = ${seasonId}
          ORDER BY r."raceId" ASC, r."teamId" ASC, i."role" ASC, i."priority" ASC
        `,
      ]);

    const raceDriverStatsByRaceId: Record<
      string,
      Record<string, { points: number; bestPosition: number }>
    > = {};
    for (const row of roundResults) {
      const raceId = row.eventRound.raceId;
      const byDriver = raceDriverStatsByRaceId[raceId] ?? {};
      const current = byDriver[row.driverId];

      byDriver[row.driverId] = current
        ? {
            points: current.points + row.points,
            bestPosition: Math.min(current.bestPosition, row.position),
          }
        : {
            points: row.points,
            bestPosition: row.position,
          };

      raceDriverStatsByRaceId[raceId] = byDriver;
    }

    const driverPointsByRaceId: Record<string, Record<string, number>> = {};
    for (const [raceId, byDriver] of Object.entries(raceDriverStatsByRaceId)) {
      const pointsByDriver: Record<string, number> = {};
      for (const [driverId, stats] of Object.entries(byDriver)) {
        pointsByDriver[driverId] = stats.points;
      }
      driverPointsByRaceId[raceId] = pointsByDriver;
    }

    const seasonPointsSystem =
      (season?.pointsSystem as unknown as PointsSystem | null) ?? F1_STANDARD_POINTS;
    const teamConfig = getTeamScoringConfig(seasonPointsSystem);
    const seasonSprintConfig = getSeasonSprintConfig(season?.sprintConfig ?? null);

    const driverMetaById = new Map<string, { name: string; uuid: string | null }>();
    const teamAssignmentsForScoring = allAssignments.flatMap((assignment) => {
      if (!driverMetaById.has(assignment.driverId)) {
        driverMetaById.set(assignment.driverId, {
          name: assignment.driver.currentName ?? assignment.driverId,
          uuid: assignment.driver.uuid,
        });
      }

      return assignment.teamId
        ? [
            {
              teamId: assignment.teamId,
              driverId: assignment.driverId,
              joinedAt: assignment.joinedAt,
              leftAt: assignment.leftAt,
            },
          ]
        : [];
    });

    const normalizedDepthChartEntries = depthChartEntries as Array<{
      seasonId: string;
      teamId: string;
      driverId: string;
      priority: number;
    }>;
    const normalizedSlotRosterEntries = slotRosterEntries as Array<{
      seasonId: string;
      raceId: string;
      teamId: string;
      driverId: string;
      role: "MAIN" | "RESERVE";
      priority: number;
    }>;

    const filledSlotRosterEntries =
      teamConfig.mode === "SLOT_MULLIGAN"
        ? fillMissingSlotRosters(
            races,
            normalizedSlotRosterEntries,
            teamAssignmentsForScoring,
          )
        : normalizedSlotRosterEntries;

    const racesForContributors = races.map((race) => {
      const byDriver = raceDriverStatsByRaceId[race.id] ?? {};

      return {
        ...race,
        eventRounds: [
          {
            apiRoundName: "TOTAL",
            apiRoundType: "RACE",
            countsForStandings: true,
            results: Object.entries(byDriver).map(([driverId, stats]) => ({
              driverId,
              position: stats.bestPosition,
              points: stats.points,
              disqualified: false,
            })),
          },
        ],
      };
    });

    const contributorsByMode = calculateTeamRaceContributorsByMode({
      mode: teamConfig.mode,
      races: racesForContributors,
      teamAssignments: teamAssignmentsForScoring,
      depthChartEntries: normalizedDepthChartEntries,
      slotRosterEntries: filledSlotRosterEntries,
      teamSlotMulliganCount: teamConfig.teamSlotMulliganCount,
      seasonSprintConfig,
    });

    const teamRaceContributors: Record<
      string,
      Record<string, Record<string, Array<{ name: string; uuid: string | null; points: number }>>>
    > = {};

    for (const [teamId, byRace] of contributorsByMode.entries()) {
      const raceMap: Record<
        string,
        Record<string, Array<{ name: string; uuid: string | null; points: number }>>
      >
        = {};

      for (const [raceId, driverIds] of Object.entries(byRace)) {
        const contributors = driverIds
          .map((driverId) => {
            const meta = driverMetaById.get(driverId) ?? {
              name: driverId,
              uuid: null,
            };
            return {
              name: meta.name,
              uuid: meta.uuid,
              points: driverPointsByRaceId[raceId]?.[driverId] ?? 0,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        raceMap[raceId] = {
          TOTAL: contributors,
        };
      }

      teamRaceContributors[teamId] = raceMap;
    }

    return teamRaceContributors;
  },
  ["public-season-team-round-contributors-v2"],
  { revalidate: 60 },
);

function TeamLogo({
  team,
  size = "sm",
  square = false,
}: {
  team: TeamInfo;
  size?: "sm" | "lg";
  square?: boolean;
}) {
  const dim = size === "sm" ? "w-7 h-7" : "w-12 h-12";
  const radius = square ? "rounded-md" : size === "sm" ? "rounded-md" : "rounded-full";
  const scale = team.logoScale ?? 1;
  const posX = team.logoPosX ?? 0;
  const posY = team.logoPosY ?? 0;

  return (
    <div
      className={`${dim} ${radius} shrink-0 overflow-hidden border border-white/10 flex items-center justify-center`}
      style={{ backgroundColor: team.color ?? "#3f3f46" }}
    >
      {team.logoUrl && (
        <img
          src={team.logoUrl}
          alt={team.name}
          className="w-full h-full object-contain"
          style={{
            transform: `scale(${scale}) translate(${posX}%, ${posY}%)`,
            transformOrigin: "center",
          }}
        />
      )}
    </div>
  );
}

export default async function LeagueStandingsPage({ params, searchParams }: PageProps) {
  const locale = await getRequestLocale();
  const { id: leagueIdentifier } = await params;
  const { season: seasonId, tab = "drivers" } = await searchParams;

  const league = await getLeagueBaseData(leagueIdentifier);

  if (!league) {
    const legacyLeague = await getLeagueSlugById(leagueIdentifier);
    if (!legacyLeague) {
      notFound();
    }

    const query = new URLSearchParams();
    if (seasonId) query.set("season", seasonId);
    if (tab) query.set("tab", tab);
    const queryString = query.toString();
    permanentRedirect(
      queryString
        ? addLocalePrefix(`/leagues/${legacyLeague.slug}?${queryString}`, locale)
        : addLocalePrefix(`/leagues/${legacyLeague.slug}`, locale),
    );
  }

  const canonicalLeagueSlug = league.slug;

  // Determine which season to display
  const selectedSeason = seasonId
    ? league.seasons.find((s) => s.id === seasonId)
    : league.seasons.find((s) => s.status === "ACTIVE") || league.seasons[0];

  if (!selectedSeason) {
    return (
      <div className="animate-in fade-in duration-500">
        <div className="text-center py-20">
          <Trophy className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">{league.name}</h1>
          <p className="text-zinc-500">
            {t(locale, "public.leagueDetail.noSeasons")}
          </p>
        </div>
      </div>
    );
  }

  const shouldLoadRaceDetails = tab === "races";

  const { driverStandings, teamStandings, racesCount, completedRacesCount } =
    await getSeasonStandingsBundle(selectedSeason.id);

  const scoringDriverIds = driverStandings
    .flatMap((standing) =>
      standing.totalPoints > 0 && standing.driver ? [standing.driver.id] : [],
    );

  const teamAssignments =
    tab === "rosters" ? await getSeasonTeamAssignments(selectedSeason.id) : [];
  const depthChartEntries =
    tab === "rosters" ? await getSeasonDepthChartEntries(selectedSeason.id) : [];

  const driverAssignments =
    tab === "drivers" && scoringDriverIds.length > 0
      ? await getSeasonDriverAssignments(selectedSeason.id, scoringDriverIds)
      : [];

  const races = shouldLoadRaceDetails
    ? await getSeasonRacesOverview(selectedSeason.id)
    : [];
  const raceTeamRosters =
    tab === "teams" ? await getSeasonRaceTeamRosters(selectedSeason.id) : [];
  const teamRoundContributors =
    tab === "teams" || tab === "rosters"
      ? await getSeasonTeamRoundContributors(selectedSeason.id)
      : {};
  const raceLabelsRows = await getSeasonRaceLabels(selectedSeason.id);
  const driverRacePositionRows = await getSeasonDriverRacePositions(selectedSeason.id);

  // Build driver-team map
  const driverTeamMap: Record<string, TeamInfo> = {};
  driverAssignments.forEach((assignment) => {
    if (!assignment.team) return;
    driverTeamMap[assignment.driverId] = {
      id: assignment.team.id,
      name: assignment.team.name,
      color: assignment.team.color,
      logoUrl: assignment.team.logoUrl,
      logoScale: assignment.team.logoScale,
      logoPosX: assignment.team.logoPosX,
      logoPosY: assignment.team.logoPosY,
    };
  });

  const raceLabels: Record<string, string> = {};
  for (const race of raceLabelsRows) {
    raceLabels[race.id] = `R${race.round} - ${race.name}`;
  }

  const driverRacePositions: Record<string, Record<string, number>> = {};
  for (const row of driverRacePositionRows) {
    const raceId = row.eventRound.raceId;
    const currentByRace = driverRacePositions[row.driverId] ?? {};
    const currentPosition = currentByRace[raceId];
    if (currentPosition === undefined || row.position < currentPosition) {
      currentByRace[raceId] = row.position;
    }
    driverRacePositions[row.driverId] = currentByRace;
  }

  const teamSlotNamesByTeamRace: Record<
    string,
    Record<string, { D1?: string; D2?: string; D3?: string }>
  > = {};

  const priorityToSlot = (priority: number): "D1" | "D2" | "D3" | null => {
    const normalizedPriority = priority <= 0 ? priority + 1 : priority;
    if (normalizedPriority === 1) return "D1";
    if (normalizedPriority === 2) return "D2";
    if (normalizedPriority === 3) return "D3";
    return null;
  };

  for (const roster of raceTeamRosters) {
    if (!teamSlotNamesByTeamRace[roster.teamId]) {
      teamSlotNamesByTeamRace[roster.teamId] = {};
    }

    const byRace = teamSlotNamesByTeamRace[roster.teamId];
    if (!byRace[roster.raceId]) {
      byRace[roster.raceId] = {};
    }

    for (const item of roster.items) {
      const slot = priorityToSlot(item.priority);
      if (!slot) continue;

      const name = item.driver.currentName?.trim();
      if (!name) continue;

      byRace[roster.raceId][slot] = name;
    }
  }

  const scoringDriverStandings = driverStandings.filter(
    (standing) => standing.totalPoints > 0,
  );

  const normalizedDriverStandings = driverStandings
    .flatMap((standing) =>
      standing.driver
        ? [
            {
              id: standing.driver.id,
              name: standing.driver.currentName || "Unknown",
              points: standing.totalPoints,
              position: standing.position,
              imageUrl: `https://mc-heads.net/avatar/${standing.driver.uuid}/32`,
              imageVariant: "avatar" as const,
            },
          ]
        : [],
    )
    .sort((a, b) => a.position - b.position);

  const normalizedTeamStandings = teamStandings
    .flatMap((standing) =>
      standing.team
        ? [
            {
              id: standing.team.id,
              name: standing.team.name,
              points: standing.totalPoints,
              position: standing.position,
              imageUrl: standing.team.logoUrl,
              imageBgColor: standing.team.color,
              imageVariant: "teamLogo" as const,
              imageScale: standing.team.logoScale,
              imagePosX: standing.team.logoPosX,
              imagePosY: standing.team.logoPosY,
            },
          ]
        : [],
    )
    .sort((a, b) => a.position - b.position);

  const driverChampion =
    normalizedDriverStandings.length > 0
      ? {
          id: normalizedDriverStandings[0].id,
          name: normalizedDriverStandings[0].name,
          points: normalizedDriverStandings[0].points,
          imageUrl: normalizedDriverStandings[0].imageUrl,
        }
      : null;

  const teamChampion =
    normalizedTeamStandings.length > 0
      ? {
          id: normalizedTeamStandings[0].id,
          name: normalizedTeamStandings[0].name,
          points: normalizedTeamStandings[0].points,
          imageUrl: normalizedTeamStandings[0].imageUrl,
          imageBgColor: normalizedTeamStandings[0].imageBgColor,
          imageVariant: normalizedTeamStandings[0].imageVariant,
          imageScale: normalizedTeamStandings[0].imageScale,
          imagePosX: normalizedTeamStandings[0].imagePosX,
          imagePosY: normalizedTeamStandings[0].imagePosY,
        }
      : null;

  const topDrivers = normalizedDriverStandings.slice(0, 3).map((standing) => ({
    id: standing.id,
    name: standing.name,
    points: standing.points,
    imageUrl: standing.imageUrl,
    imageVariant: standing.imageVariant,
  }));

  const topTeams = normalizedTeamStandings.slice(0, 3).map((standing) => ({
    id: standing.id,
    name: standing.name,
    points: standing.points,
    imageUrl: standing.imageUrl,
    imageBgColor: standing.imageBgColor,
    imageVariant: standing.imageVariant,
    imageScale: standing.imageScale,
    imagePosX: standing.imagePosX,
    imagePosY: standing.imagePosY,
  }));

  const driverLeader = scoringDriverStandings[0];
  const teamLeader = teamStandings[0];

  return (
    <LeagueAccentScope logoUrl={league.logoUrl} seed={league.name}>
      <div className="animate-in fade-in duration-500">
      {/* Banner */}
      <div className="relative mb-8">
        {league.logoUrl && (
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              backgroundImage: `url(${league.logoUrl})`,
              backgroundSize: "100%",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              opacity: 0.55,
            }}
          ></div>
        )}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              "linear-gradient(to bottom right, rgb(var(--league-accent-rgb) / 0.08), rgb(23 23 23 / 0.28), transparent)",
          }}
        ></div>
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              "linear-gradient(to right, rgb(var(--league-accent-rgb) / 0.03), transparent, rgb(var(--league-accent-rgb) / 0.03))",
          }}
        ></div>

        <div className="relative bg-neutral-900/58 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-[1px]">
          <div
            className="h-1 w-full"
            style={{
              background:
                "linear-gradient(to right, rgb(var(--league-accent-rgb) / 0.45), rgb(var(--league-accent-rgb) / 0.9), rgb(var(--league-accent-rgb) / 0.45))",
            }}
          ></div>

          <div className="p-6 md:p-8">
            <nav className="flex items-center gap-2 text-xs font-mono text-neutral-500 mb-4 uppercase tracking-wide">
              <Link href={addLocalePrefix("/leagues", locale)} className="hover:text-cyan-400 transition-colors">
                {t(locale, "public.leagueDetail.breadcrumbLeagues")}
              </Link>
              <span className="text-neutral-700">/</span>
              <span style={{ color: "rgb(var(--league-accent-rgb))" }}>{league.name}</span>
            </nav>

            <div className="flex flex-col gap-4">
              <div className="flex-1">
                <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono mb-2">
                  {league.name}
                </h1>
                {league.description && (
                  <p className="text-neutral-400 max-w-2xl">{league.description}</p>
                )}

                {/* Season Selector */}
                {league.seasons.length > 1 && (
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-mono">
                      {t(locale, "public.leagueDetail.seasonLabel")}
                    </span>
                    {league.seasons.map((season) => (
                      <Link
                        key={season.id}
                        href={addLocalePrefix(`/leagues/${canonicalLeagueSlug}?season=${season.id}&tab=${tab}`, locale)}
                        scroll={false}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          season.id === selectedSeason.id
                            ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                        }`}
                      >
                        {season.name}
                        {season.status === "ACTIVE" && (
                          <span className="ml-2 text-[10px] text-green-400">●</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedSeason.status === "COMPLETED" ? (
        <div className="mb-6">
          <SeasonFinalSummary
            driverChampion={driverChampion}
            teamChampion={teamChampion}
            topDrivers={topDrivers}
            topTeams={topTeams}
            completedRacesCount={completedRacesCount}
            standingsHref={addLocalePrefix(`/leagues/${canonicalLeagueSlug}?season=${selectedSeason.id}&tab=drivers`, locale)}
            racesHref={addLocalePrefix(`/leagues/${canonicalLeagueSlug}?season=${selectedSeason.id}&tab=races`, locale)}
            showLinks={false}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Driver Leader */}
          <div className="p-5 rounded-2xl bg-zinc-900 border border-yellow-500/20 flex items-center gap-4 relative overflow-hidden">
            {driverLeader?.driver ? (
                <img
                  src={`https://mc-heads.net/avatar/${driverLeader.driver.uuid}/48`}
                  alt={driverLeader.driver.currentName || t(locale, "public.leagueDetail.unknownDriver")}
                  className="w-12 h-12 rounded-md shrink-0 bg-zinc-800 border border-yellow-500/30"
                />
            ) : (
              <div className="w-12 h-12 rounded-md bg-yellow-500/15 flex items-center justify-center shrink-0 border border-yellow-500/30">
                <Trophy className="w-6 h-6 text-yellow-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Leader — Drivers</p>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                {t(locale, "public.leagueDetail.leaderDrivers")}
              </p>
              <p className="text-lg font-bold text-white font-mono truncate">
                {driverLeader?.driver?.currentName || t(locale, "public.leagueDetail.noData")}
              </p>
              <p className="text-sm text-yellow-400 font-mono font-semibold">
                {driverLeader?.totalPoints || 0} pts
              </p>
            </div>
            <Trophy className="absolute -right-4 -bottom-4 w-24 h-24 text-yellow-500/5" />
          </div>

          {/* Team Leader */}
          <div className="p-5 rounded-2xl bg-zinc-900 border border-cyan-500/20 flex items-center gap-4 relative overflow-hidden">
            {teamLeader?.team ? (
              <TeamLogo team={teamLeader.team as TeamInfo} size="lg" square />
            ) : (
              <div className="w-12 h-12 rounded-md shrink-0 bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-cyan-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                {t(locale, "public.leagueDetail.leaderTeams")}
              </p>
              <p className="text-lg font-bold text-white font-mono truncate">
                {teamLeader?.team?.name || t(locale, "public.leagueDetail.noData")}
              </p>
              <p className="text-sm text-cyan-400 font-mono font-semibold">
                {teamLeader?.totalPoints || 0} pts
              </p>
            </div>
            <Users className="absolute -right-4 -bottom-4 w-24 h-24 text-cyan-500/5" />
          </div>
        </div>
      )}

      {/* Tabs + Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {/* Tab Header */}
        <div className="border-b border-zinc-800 bg-zinc-950/30 overflow-x-auto">
          <div className="flex w-max items-center gap-1 p-2 min-w-full">
            <Link
            href={addLocalePrefix(`/leagues/${canonicalLeagueSlug}?season=${selectedSeason.id}&tab=drivers`, locale)}
            scroll={false}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === "drivers"
                ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            <Trophy size={15} />
            {t(locale, "public.leagueDetail.tabDrivers")}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-500">{scoringDriverStandings.length}</span>
            </Link>
            <Link
            href={addLocalePrefix(`/leagues/${canonicalLeagueSlug}?season=${selectedSeason.id}&tab=teams`, locale)}
            scroll={false}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === "teams"
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            <Users size={15} />
            {t(locale, "public.leagueDetail.tabTeams")}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-500">{teamStandings.length}</span>
            </Link>
            <Link
            href={addLocalePrefix(`/leagues/${canonicalLeagueSlug}?season=${selectedSeason.id}&tab=rosters`, locale)}
            scroll={false}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === "rosters"
                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            <UsersRound size={15} />
            {t(locale, "public.leagueDetail.tabRosters")}
            </Link>
            <Link
            href={addLocalePrefix(`/leagues/${canonicalLeagueSlug}?season=${selectedSeason.id}&tab=races`, locale)}
            scroll={false}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === "races"
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            <Flag size={15} />
            {t(locale, "public.leagueDetail.tabRaces")}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-500">{racesCount}</span>
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {tab === "rosters" ? (
            <div className="p-6">
              {(() => {
                const normalizePriority = (priority: number): number =>
                  priority <= 0 ? priority + 1 : priority;

                const depthChartPriorityByTeamDriver: Record<string, Record<string, number>> = {};
                for (const entry of depthChartEntries) {
                  if (!depthChartPriorityByTeamDriver[entry.teamId]) {
                    depthChartPriorityByTeamDriver[entry.teamId] = {};
                  }

                  depthChartPriorityByTeamDriver[entry.teamId][entry.driverId] =
                    normalizePriority(entry.priority);
                }

                const teamDriverPoints: Record<string, Record<string, number>> = {};

                for (const [teamId, byRace] of Object.entries(teamRoundContributors)) {
                  if (!teamDriverPoints[teamId]) teamDriverPoints[teamId] = {};

                  for (const byRound of Object.values(byRace)) {
                    for (const contributors of Object.values(byRound)) {
                      for (const contributor of contributors) {
                        const driverKey =
                          (contributor.uuid || contributor.name).trim().toLowerCase();
                        teamDriverPoints[teamId][driverKey] =
                          (teamDriverPoints[teamId][driverKey] ?? 0) + contributor.points;
                      }
                    }
                  }
                }

                // Group assignments by team
                const teamRosters = new Map<
                  string,
                  {
                    team: TeamInfo;
                    drivers: Array<{
                      id: string;
                      uuid: string;
                      currentName: string | null;
                      teamPoints: number;
                      depthChartPriority: number | null;
                    }>;
                  }
                >();
                
                teamAssignments.forEach((assignment) => {
                  if (!assignment.team || !assignment.teamId) return;
                  const teamId = assignment.teamId;
                  if (!teamRosters.has(teamId)) {
                    teamRosters.set(teamId, {
                      team: {
                        id: assignment.team.id,
                        name: assignment.team.name,
                        color: assignment.team.color,
                        logoUrl: assignment.team.logoUrl,
                        logoScale: assignment.team.logoScale,
                        logoPosX: assignment.team.logoPosX,
                        logoPosY: assignment.team.logoPosY,
                      },
                      drivers: [],
                    });
                  }
                  const driverKey = (assignment.driver.uuid || assignment.driver.currentName || "")
                    .trim()
                    .toLowerCase();
                  const points = teamDriverPoints[teamId]?.[driverKey] ?? 0;

                  teamRosters.get(teamId)?.drivers.push({
                    id: assignment.driver.id,
                    uuid: assignment.driver.uuid,
                    currentName: assignment.driver.currentName,
                    teamPoints: points,
                    depthChartPriority:
                      depthChartPriorityByTeamDriver[teamId]?.[assignment.driver.id] ?? null,
                  });
                });

                const rostersArray = Array.from(teamRosters.values());

                if (rostersArray.length === 0) {
                  return (
                    <div className="text-center py-12 text-zinc-500">
                      <UsersRound className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
                      <p>{t(locale, "public.leagueDetail.noRosters")}</p>
                    </div>
                  );
                }

                return (
                  <div className="columns-1 md:columns-2 lg:columns-3 gap-6">
                    {rostersArray.map(({ team, drivers }) => (
                      <div
                        key={team.id}
                        className="inline-block w-full mb-6 break-inside-avoid bg-zinc-950/30 border border-zinc-800 rounded-xl overflow-hidden"
                      >
                        {/* Team Header */}
                        <div
                          className="p-4 border-b border-zinc-800"
                          style={{ backgroundColor: team.color ? `${team.color}15` : undefined }}
                        >
                          <div className="flex items-center gap-3">
                            <TeamLogo team={team} size="sm" />
                            <h3 className="text-lg font-bold text-white">{team.name}</h3>
                          </div>
                        </div>

                        {/* Drivers List */}
                        <div className="p-4 space-y-3">
                          {drivers
                            .sort((a, b) => {
                              const aHasPriority = typeof a.depthChartPriority === "number";
                              const bHasPriority = typeof b.depthChartPriority === "number";

                              if (aHasPriority && bHasPriority) {
                                return (
                                  (a.depthChartPriority as number) -
                                  (b.depthChartPriority as number)
                                );
                              }

                              if (aHasPriority) return -1;
                              if (bHasPriority) return 1;

                              if (b.teamPoints !== a.teamPoints) {
                                return b.teamPoints - a.teamPoints;
                              }

                              return (a.currentName || "").localeCompare(b.currentName || "");
                            })
                            .map((driver) => (
                            <Link
                              key={driver.id}
                              href={addLocalePrefix(`/driver/${driver.uuid}`, locale)}
                              className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <img
                                  src={`https://mc-heads.net/avatar/${driver.uuid}/32`}
                                  alt={driver.currentName || t(locale, "public.leagueDetail.unknownDriver")}
                                  className="w-8 h-8 rounded-md"
                                />
                                <span className="truncate text-zinc-300 group-hover:text-cyan-400 transition-colors">
                                  {driver.currentName || t(locale, "public.leagueDetail.unknownDriver")}
                                </span>
                              </div>
                              <Badge className="shrink-0">{driver.teamPoints} pts</Badge>
                            </Link>
                          ))}
                        </div>

                        {/* Driver Count */}
                        <div className="px-4 py-2 bg-zinc-950/50 border-t border-zinc-800">
                          <span className="text-xs text-zinc-500 font-mono">
                            {drivers.length !== 1
                              ? t(locale, "public.leagueDetail.driversCount", { count: drivers.length })
                              : t(locale, "public.leagueDetail.driversCountSingular", { count: drivers.length })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : tab === "races" ? (
            <div className="p-6">
              {races.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <Flag className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
                  <p>{t(locale, "public.leagueDetail.noRaces")}</p>
                </div>
              ) : (
                <>
                  {races.map((race) => (
                    <details
                      key={race.id}
                      className="group bg-zinc-950/30 border border-zinc-800 rounded-xl overflow-hidden mb-3 last:mb-0"
                    >
                      <summary className="p-4 bg-zinc-900/50 cursor-pointer list-none hover:bg-zinc-900/70 transition-colors flex items-center justify-between gap-4">
                        <span className="min-w-0">
                          <span className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-zinc-500 font-mono">R{race.round}</span>
                            <span className="truncate">{race.name}</span>
                          </span>
                          <span className="block text-zinc-500 text-sm mt-1">
                            {race.trackApiName || t(locale, "public.leagueDetail.unknownTrack")}
                            {race.scheduledDate && (
                              <span className="ml-2 text-zinc-600">
                                • {new Date(race.scheduledDate).toLocaleDateString(locale)}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="flex items-center gap-3 shrink-0">
                          <Badge
                            variant={
                              race.status === "COMPLETED"
                                ? "success"
                                : race.status === "PENDING"
                                ? "warning"
                                : "neutral"
                            }
                            className="uppercase font-mono px-3 py-1"
                          >
                            {race.status}
                          </Badge>
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-zinc-700/60 text-zinc-500 transition-transform duration-200 group-open:rotate-180">
                            <ChevronDown size={14} />
                          </span>
                        </span>
                      </summary>

                      {/* Race Results */}
                      {race.eventRounds.length > 0 ? (
                        <RaceRoundsPanel
                          locale={locale}
                          leagueId={canonicalLeagueSlug}
                          raceId={race.id}
                          rounds={race.eventRounds}
                        />
                      ) : (
                        <div className="p-4 text-center text-zinc-600">
                          {t(locale, "public.leagueDetail.noResultsImported")}
                        </div>
                      )}
                    </details>
                  ))}
                </>
              )}
            </div>
          ) : (
            <PublicStandingsTableClient
              tab={tab as "drivers" | "teams"}
              driverStandings={scoringDriverStandings}
              teamStandings={teamStandings}
              driverTeamMap={driverTeamMap}
              raceLabels={raceLabels}
              driverRacePositions={driverRacePositions}
              teamSlotNamesByTeamRace={teamSlotNamesByTeamRace}
              teamRoundContributors={teamRoundContributors}
            />
          )}
        </div>
      </div>
      </div>
    </LeagueAccentScope>
  );
}
