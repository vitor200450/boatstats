import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import {
  Trophy,
  Flag,
  Calendar,
  MapPin,
  Clock,
  Zap,
  Info,
  ChevronUp,
  ChevronDown,
  Target,
  AlertCircle,
} from "lucide-react";

import { t } from "@/i18n/messages";
import { addLocalePrefix } from "@/i18n/navigation";
import { getRequestLocale } from "@/i18n/request";
import { fetchPlayerDataByUUID, formatUUID } from "@/lib/minecraft-api";
import { prisma } from "@/lib/prisma";
import { getTracks, getTrackTimeTrial } from "@/services/frosthexAPI";

import { DriverDashboardFilters } from "./DriverDashboardFilters";

// Cache for 5 minutes (FrostHex API consistency)
export const revalidate = 300;

interface PageProps {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{
    league?: string;
    season?: string;
    countDnfs?: string;
    tab?: string;
    allHistory?: string;
  }>;
}

function normalizeUuidValue(value: string): string {
  return value.replace(/-/g, "").toLowerCase();
}

async function getDriverRacesData(driverId: string) {
  return prisma.race.findMany({
    where: {
      season: { status: { in: ["ACTIVE", "COMPLETED"] } },
      eventRounds: {
        some: {
          results: {
            some: {
              driverId,
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      round: true,
      trackApiName: true,
      scheduledDate: true,
      season: {
        select: {
          id: true,
          name: true,
          year: true,
          league: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
            },
          },
        },
      },
      eventRounds: {
        orderBy: {
          apiRoundType: "asc",
        },
        select: {
          id: true,
          apiRoundName: true,
          apiRoundType: true,
          specialType: true,
          countsForStandings: true,
          results: {
            where: {
              driverId,
            },
            take: 1,
              select: {
                position: true,
                finishTimeMs: true,
                startPosition: true,
                fastestLap: true,
                fastestLapTime: true,
                points: true,
                disqualified: true,
              },
          },
        },
      },
    },
    orderBy: {
      scheduledDate: "desc",
    },
  });
}

const getDriverRacesDataCached = unstable_cache(
  async (driverId: string) => getDriverRacesData(driverId),
  ["driver-races-data"],
  { revalidate: 300 },
);

export default async function DriverProfilePage({
  params,
  searchParams,
}: PageProps) {
  const locale = await getRequestLocale();
  const { uuid: rawUuid } = await params;
  const filters = await searchParams;
  const searchTerm = decodeURIComponent(rawUuid);
  const formattedUuid = formatUUID(searchTerm);
  const cleanUuid = searchTerm.replace(/-/g, "");
  const isUuidSearch = /^[a-f0-9]{32}$/i.test(cleanUuid);

  // Find driver
  let driver = await prisma.driver.findFirst({
    where: {
      OR: [
        { uuid: searchTerm },
        { uuid: formattedUuid },
        { currentName: { equals: searchTerm, mode: "insensitive" } },
      ],
    },
  });

  if (!driver && isUuidSearch) {
    try {
      const playerData = await fetchPlayerDataByUUID(formattedUuid);

      if (playerData) {
        driver = await prisma.driver.upsert({
          where: { uuid: playerData.uuid },
          update: {
            currentName: playerData.name,
            colorCode: playerData.colorCode,
            boatType: playerData.boatType,
            boatMaterial: playerData.boatMaterial,
          },
          create: {
            uuid: playerData.uuid,
            currentName: playerData.name,
            colorCode: playerData.colorCode,
            boatType: playerData.boatType,
            boatMaterial: playerData.boatMaterial,
          },
        });
      }
    } catch (error) {
      console.error("Error creating driver on public profile access:", error);
    }
  }

  if (!driver) {
    notFound();
  }

  const racesDataRaw = await getDriverRacesDataCached(driver.id);

  type DriverRoundResult = {
    position: number;
    finishTimeMs: number | null;
    startPosition: number | null;
    fastestLap: boolean;
    fastestLapTime?: number | null;
    points: number;
    disqualified?: boolean;
  };

  type DriverEventRound = (typeof racesDataRaw)[number]["eventRounds"][number];

  const isDidNotFinish = (result: DriverRoundResult | undefined): boolean => {
    if (!result) return false;
    if (result.disqualified) return true;
    return result.position <= 0 || result.finishTimeMs === null;
  };

  const isQualyRound = (round: DriverEventRound): boolean => {
    const roundType = round.apiRoundType?.toUpperCase();
    const roundName = round.apiRoundName?.toLowerCase() ?? "";
    return (
      roundType === "QUALIFICATION" ||
      roundName.includes("qualy") ||
      roundName.includes("quali")
    );
  };

  const isSprintRound = (round: DriverEventRound): boolean => {
    if (round.specialType === "SPRINT") return true;
    const roundType = round.apiRoundType?.toUpperCase();
    const roundName = round.apiRoundName?.toLowerCase() ?? "";
    return roundType === "SPRINT_RACE" || roundName.includes("sprint");
  };

  const isMainRaceRoundCandidate = (round: DriverEventRound): boolean => {
    const roundType = round.apiRoundType?.toUpperCase();
    const roundName = round.apiRoundName?.toLowerCase() ?? "";
    return (
      roundType === "FINAL" ||
      roundType === "RACE" ||
      roundName.includes("final") ||
      roundName.includes("race") ||
      roundName.includes("corrida")
    );
  };

  const selectMainRaceRound = (
    eventRounds: DriverEventRound[],
  ): DriverEventRound | undefined => {
    const raceRounds = eventRounds.filter(isMainRaceRoundCandidate);
    return (
      raceRounds.find((round) => round.countsForStandings && round.results.length > 0) ??
      raceRounds.find((round) => round.countsForStandings) ??
      raceRounds.find((round) => round.results.length > 0) ??
      raceRounds[0]
    );
  };

  const racesData = racesDataRaw.filter((race) => {
    const mainRaceRound = selectMainRaceRound(race.eventRounds);
    return Boolean(mainRaceRound?.results?.[0]);
  });

  const leagueMap = new Map<string, { id: string; name: string }>();
  for (const race of racesData) {
    leagueMap.set(race.season.league.id, {
      id: race.season.league.id,
      name: race.season.league.name,
    });
  }
  const leagueOptions = Array.from(leagueMap.values());

  const defaultLeagueId = leagueOptions[0]?.id ?? "";
  const selectedLeagueId = leagueOptions.some((league) => league.id === filters.league)
    ? (filters.league as string)
    : defaultLeagueId;

  const seasonMap = new Map<string, { id: string; name: string; year: number | null }>();
  for (const race of racesData) {
    if (race.season.league.id !== selectedLeagueId) continue;
    seasonMap.set(race.season.id, {
      id: race.season.id,
      name: race.season.name,
      year: race.season.year,
    });
  }

  const seasonOptions = Array.from(seasonMap.values()).sort((a, b) => {
    const yearA = a.year ?? 0;
    const yearB = b.year ?? 0;
    if (yearA !== yearB) return yearB - yearA;
    return b.name.localeCompare(a.name);
  });

  const defaultSeasonId = seasonOptions[0]?.id ?? "";
  const selectedSeasonId = seasonOptions.some((season) => season.id === filters.season)
    ? (filters.season as string)
    : defaultSeasonId;

  const countDnfs = filters.countDnfs === "yes";
  const showAllHistory = filters.allHistory === "yes";
  const historyLimit = 30;

  const raceSummaries = racesData.map((race) => {
    const qualyRound = race.eventRounds.find(isQualyRound);
    const sprintRound = race.eventRounds.find(isSprintRound);
    const mainRaceRound = selectMainRaceRound(race.eventRounds);

    const qualyResult = (qualyRound?.results[0] as DriverRoundResult | undefined) ?? undefined;
    const sprintResult = (sprintRound?.results[0] as DriverRoundResult | undefined) ?? undefined;
    const mainRaceResult =
      (mainRaceRound?.results[0] as DriverRoundResult | undefined) ?? undefined;

    const eventPoints = race.eventRounds
      .filter((round) => round.countsForStandings)
      .reduce((sum, round) => sum + (round.results[0]?.points ?? 0), 0);

    return {
      leagueId: race.season.league.id,
      leagueName: race.season.league.name,
      seasonId: race.season.id,
      seasonName: race.season.name,
      qualyResult,
      sprintResult,
      mainRaceResult,
      eventPoints,
    };
  });

  type CareerAggregateStats = {
    racesDisputadas: number;
    pontosTotais: number;
    pontosPorCorrida: number;
    melhorChegada: number | null;
    top10Rate: number;
    mediaPosicaoChegada: number | null;
    taxaCorridasPontuando: number;
    top5Rate: number;
    top1Total: number;
    top3Total: number;
    top5Total: number;
    top10Total: number;
    corridasComPontos: number;
    streakPontuandoAtual: number;
    melhorFase: { leagueName: string; seasonName: string; points: number; top10Rate: number } | null;
    insights: string[];
  };

  const calculateCareerAggregateStats = (
    summaries: typeof raceSummaries,
  ): CareerAggregateStats => {
    const raceResults = summaries
      .map((summary) => summary.mainRaceResult)
      .filter((result): result is DriverRoundResult => Boolean(result));

    const racesDisputadas = raceResults.length;
    const pontosTotais = summaries.reduce((sum, summary) => sum + summary.eventPoints, 0);
    const corridasComPontos = summaries.filter((summary) => summary.eventPoints > 0).length;

    const finishesWithPosition = raceResults.filter(
      (result) => !isDidNotFinish(result) && result.position > 0,
    );
    const melhorChegada =
      finishesWithPosition.length > 0
        ? Math.min(...finishesWithPosition.map((result) => result.position))
        : null;
    const mediaPosicaoChegada =
      finishesWithPosition.length >= 3
        ? finishesWithPosition.reduce((sum, result) => sum + result.position, 0) /
          finishesWithPosition.length
        : null;

    const top1Total = finishesWithPosition.filter((result) => result.position === 1).length;
    const top3Total = finishesWithPosition.filter((result) => result.position <= 3).length;
    const top5Total = finishesWithPosition.filter((result) => result.position <= 5).length;
    const top10Total = finishesWithPosition.filter((result) => result.position <= 10).length;

    const ratio = (value: number, total: number): number =>
      total > 0 ? (value * 100) / total : 0;

    const top10Rate = ratio(top10Total, racesDisputadas);
    const top5Rate = ratio(top5Total, racesDisputadas);
    const taxaCorridasPontuando = ratio(corridasComPontos, racesDisputadas);
    const pontosPorCorrida = racesDisputadas > 0 ? pontosTotais / racesDisputadas : 0;

    let streakPontuandoAtual = 0;
    for (const summary of summaries) {
      if (summary.eventPoints > 0) {
        streakPontuandoAtual += 1;
      } else {
        break;
      }
    }

    const bySeason = new Map<
      string,
      { leagueName: string; seasonName: string; races: number; points: number; top10: number }
    >();
    for (const summary of summaries) {
      const season = bySeason.get(summary.seasonId) ?? {
        leagueName: summary.leagueName,
        seasonName: summary.seasonName,
        races: 0,
        points: 0,
        top10: 0,
      };
      season.races += 1;
      season.points += summary.eventPoints;
      if (
        summary.mainRaceResult &&
        summary.mainRaceResult.position > 0 &&
        summary.mainRaceResult.position <= 10
      ) {
        season.top10 += 1;
      }
      bySeason.set(summary.seasonId, season);
    }

    const melhorFaseRaw = Array.from(bySeason.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.top10 / Math.max(1, b.races) - a.top10 / Math.max(1, a.races);
    })[0];

    const melhorFase = melhorFaseRaw
      ? {
          leagueName: melhorFaseRaw.leagueName,
          seasonName: melhorFaseRaw.seasonName,
          points: melhorFaseRaw.points,
          top10Rate: ratio(melhorFaseRaw.top10, melhorFaseRaw.races),
        }
      : null;

    const insights: string[] = [];
    if (racesDisputadas >= 10) {
      if (top10Rate >= 60) {
        insights.push(t(locale, "public.driverPage.insightTop10"));
      }
      if (taxaCorridasPontuando >= 50) {
        insights.push(t(locale, "public.driverPage.insightScoring"));
      }
      if (streakPontuandoAtual >= 3) {
        insights.push(t(locale, "public.driverPage.insightStreak", { count: streakPontuandoAtual }));
      }
      if (insights.length === 0) {
        insights.push(t(locale, "public.driverPage.insightBuilding"));
      }
    }

    return {
      racesDisputadas,
      pontosTotais,
      pontosPorCorrida,
      melhorChegada,
      top10Rate,
      mediaPosicaoChegada,
      taxaCorridasPontuando,
      top5Rate,
      top1Total,
      top3Total,
      top5Total,
      top10Total,
      corridasComPontos,
      streakPontuandoAtual,
      melhorFase,
      insights,
    };
  };

  type ScopeStats = {
    totalRaces: number;
    avgQualiPosition: number;
    avgRacePosition: number;
    avgGainLoss: number;
    fastestLapRate: number;
    avgPointsPerRace: number;
    winRate: number;
    podiumRate: number;
    poleRate: number;
    totalWins: number;
    totalPodiums: number;
    totalPoints: number;
    totalFastestLaps: number;
    totalGainLoss: number;
    totalDnfs: number;
    dnfRate: number;
  };

  const calculateScopeStats = (
    summaries: typeof raceSummaries,
    includeDnfsInAverages: boolean,
  ): ScopeStats => {
    const raceResults = summaries
      .map((summary) => summary.mainRaceResult)
      .filter((result): result is DriverRoundResult => Boolean(result));

    const qualyResults = summaries
      .map((summary) => summary.qualyResult)
      .filter((result): result is DriverRoundResult => Boolean(result));

    const raceResultsForAverages = includeDnfsInAverages
      ? raceResults
      : raceResults.filter((result) => !isDidNotFinish(result));

    const qualyResultsForAverages = includeDnfsInAverages
      ? qualyResults
      : qualyResults.filter((result) => !isDidNotFinish(result));

    const validGainLossResults = raceResultsForAverages.filter(
      (result) => result.startPosition !== null && result.startPosition > 0,
    );

    const totalGainLoss = validGainLossResults.reduce((sum, result) => {
      return sum + (result.startPosition as number) - result.position;
    }, 0);

    const totalRacesCount = raceResults.length;
    const totalWinsCount = raceResults.filter((result) => result.position === 1).length;
    const totalPodiumsCount = raceResults.filter(
      (result) => result.position > 0 && result.position <= 3,
    ).length;
    const totalPolesCount = qualyResults.filter((result) => result.position === 1).length;
    const totalFastestLapsCount = raceResults.filter((result) => result.fastestLap).length;
    const totalDnfsCount = raceResults.filter((result) => isDidNotFinish(result)).length;
    const totalPointsCount = summaries.reduce((sum, summary) => sum + summary.eventPoints, 0);

    const average = (total: number, count: number): number =>
      count > 0 ? total / count : 0;

    return {
      totalRaces: totalRacesCount,
      avgQualiPosition: average(
        qualyResultsForAverages.reduce((sum, result) => sum + result.position, 0),
        qualyResultsForAverages.length,
      ),
      avgRacePosition: average(
        raceResultsForAverages.reduce((sum, result) => sum + result.position, 0),
        raceResultsForAverages.length,
      ),
      avgGainLoss: average(totalGainLoss, validGainLossResults.length),
      fastestLapRate: average(totalFastestLapsCount * 100, totalRacesCount),
      avgPointsPerRace: average(totalPointsCount, totalRacesCount),
      winRate: average(totalWinsCount * 100, totalRacesCount),
      podiumRate: average(totalPodiumsCount * 100, totalRacesCount),
      poleRate: average(totalPolesCount * 100, qualyResults.length),
      totalWins: totalWinsCount,
      totalPodiums: totalPodiumsCount,
      totalPoints: totalPointsCount,
      totalFastestLaps: totalFastestLapsCount,
      totalGainLoss,
      totalDnfs: totalDnfsCount,
      dnfRate: average(totalDnfsCount * 100, totalRacesCount),
    };
  };

  const selectedSeasonSummaries = raceSummaries.filter(
    (summary) =>
      summary.leagueId === selectedLeagueId && summary.seasonId === selectedSeasonId,
  );
  const selectedLeagueSummaries = raceSummaries.filter(
    (summary) => summary.leagueId === selectedLeagueId,
  );

  const selectedSeasonStats = calculateScopeStats(selectedSeasonSummaries, countDnfs);
  const selectedLeagueStats = calculateScopeStats(selectedLeagueSummaries, countDnfs);
  const careerStats = calculateScopeStats(raceSummaries, countDnfs);
  const careerAggregateStats = calculateCareerAggregateStats(raceSummaries);

  // Format date/time helper
  const formatDateTime = (date: Date | null) => {
    if (!date) return { date: "--", time: "" };
    const d = new Date(date);
    return {
      date: d.toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      time: d.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  const formatDecimal = (value: number, digits = 2): string => value.toFixed(digits);
  const formatRate = (value: number): string => `${value.toFixed(1)}%`;
  const formatSigned = (value: number): string =>
    `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
  const formatLapTime = (ms: number | null | undefined): string => {
    if (!ms || ms <= 0) return t(locale, "public.driverPage.fastestLapOnly");
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, "0");
    const milliseconds = (ms % 1000).toString().padStart(3, "0");
    const time = `${minutes}:${seconds}.${milliseconds}`;
    return t(locale, "public.driverPage.fastestLapWithTime", { time });
  };

  const formatTimeTrialTime = (ms: number): string => {
    if (!ms || ms <= 0) return "--:--.---";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, "0");
    const milliseconds = (ms % 1000).toString().padStart(3, "0");
    return `${minutes}:${seconds}.${milliseconds}`;
  };

  const selectedLeagueName =
    leagueOptions.find((league) => league.id === selectedLeagueId)?.name ??
    t(locale, "public.driverPage.league");
  const selectedSeasonName =
    seasonOptions.find((season) => season.id === selectedSeasonId)?.name ??
    t(locale, "public.driverPage.season");

  const dashboardRows: {
    label: string;
    key: string;
    format: (stats: ScopeStats) => string;
  }[] = [
    {
      label: t(locale, "public.driverPage.metricTotalRaces"),
      key: "totalRaces",
      format: (stats) => String(stats.totalRaces),
    },
    {
      label: t(locale, "public.driverPage.metricAvgQuali"),
      key: "avgQualiPosition",
      format: (stats) => formatDecimal(stats.avgQualiPosition),
    },
    {
      label: t(locale, "public.driverPage.metricAvgRace"),
      key: "avgRacePosition",
      format: (stats) => formatDecimal(stats.avgRacePosition),
    },
    {
      label: t(locale, "public.driverPage.metricAvgGainLoss"),
      key: "avgGainLoss",
      format: (stats) => formatSigned(stats.avgGainLoss),
    },
    {
      label: t(locale, "public.driverPage.metricFastestLapRate"),
      key: "fastestLapRate",
      format: (stats) => formatRate(stats.fastestLapRate),
    },
    {
      label: t(locale, "public.driverPage.metricAvgPointsRace"),
      key: "avgPointsPerRace",
      format: (stats) => formatDecimal(stats.avgPointsPerRace),
    },
    {
      label: t(locale, "public.driverPage.metricWinRate"),
      key: "winRate",
      format: (stats) => formatRate(stats.winRate),
    },
    {
      label: t(locale, "public.driverPage.metricPodiumRate"),
      key: "podiumRate",
      format: (stats) => formatRate(stats.podiumRate),
    },
    {
      label: t(locale, "public.driverPage.metricPoleRate"),
      key: "poleRate",
      format: (stats) => formatRate(stats.poleRate),
    },
    {
      label: t(locale, "public.driverPage.metricTotalWins"),
      key: "totalWins",
      format: (stats) => String(stats.totalWins),
    },
    {
      label: t(locale, "public.driverPage.metricTotalPodiums"),
      key: "totalPodiums",
      format: (stats) => String(stats.totalPodiums),
    },
    {
      label: t(locale, "public.driverPage.metricTotalPoints"),
      key: "totalPoints",
      format: (stats) => String(stats.totalPoints),
    },
    {
      label: t(locale, "public.driverPage.metricTotalFastestLaps"),
      key: "totalFastestLaps",
      format: (stats) => String(stats.totalFastestLaps),
    },
    {
      label: t(locale, "public.driverPage.metricTotalGainLoss"),
      key: "totalGainLoss",
      format: (stats) => String(stats.totalGainLoss),
    },
    {
      label: t(locale, "public.driverPage.metricTotalDnfs"),
      key: "totalDnfs",
      format: (stats) => String(stats.totalDnfs),
    },
    {
      label: t(locale, "public.driverPage.metricDnfRate"),
      key: "dnfRate",
      format: (stats) => formatRate(stats.dnfRate),
    },
  ];

  const metricGroups: { title: string; keys: string[] }[] = [
    {
      title: t(locale, "public.driverPage.groupPerformance"),
      keys: ["totalRaces", "avgQualiPosition", "avgRacePosition", "avgGainLoss"],
    },
    {
      title: t(locale, "public.driverPage.groupConsistency"),
      keys: ["winRate", "podiumRate", "poleRate", "fastestLapRate", "dnfRate"],
    },
    {
      title: t(locale, "public.driverPage.groupResults"),
      keys: [
        "avgPointsPerRace",
        "totalPoints",
        "totalWins",
        "totalPodiums",
        "totalFastestLaps",
        "totalGainLoss",
        "totalDnfs",
      ],
    },
  ];

  const metricByKey = new Map(dashboardRows.map((row) => [row.key, row]));

  const activeTab =
    filters.tab === "performance"
      ? "performance"
      : filters.tab === "timetrial"
        ? "timetrial"
        : "history";

  const performanceTabParams = new URLSearchParams();
  performanceTabParams.set("tab", "performance");
  if (selectedLeagueId) performanceTabParams.set("league", selectedLeagueId);
  if (selectedSeasonId) performanceTabParams.set("season", selectedSeasonId);
  performanceTabParams.set("countDnfs", countDnfs ? "yes" : "no");

  const historyTabParams = new URLSearchParams();
  historyTabParams.set("tab", "history");
  if (selectedLeagueId) historyTabParams.set("league", selectedLeagueId);
  if (selectedSeasonId) historyTabParams.set("season", selectedSeasonId);
  historyTabParams.set("countDnfs", countDnfs ? "yes" : "no");
  if (showAllHistory) historyTabParams.set("allHistory", "yes");

  const timeTrialTabParams = new URLSearchParams();
  timeTrialTabParams.set("tab", "timetrial");
  if (selectedLeagueId) timeTrialTabParams.set("league", selectedLeagueId);
  if (selectedSeasonId) timeTrialTabParams.set("season", selectedSeasonId);
  timeTrialTabParams.set("countDnfs", countDnfs ? "yes" : "no");

  const visibleHistoryRaces = showAllHistory
    ? racesData
    : racesData.slice(0, historyLimit);

  type DriverTimeTrialEntry = {
    trackName: string;
    commandName: string;
    rank: number;
    time: number;
    totalEntries: number;
  };

  const driverTimeTrialEntries: DriverTimeTrialEntry[] = [];
  const normalizedDriverUuid = normalizeUuidValue(driver.uuid);

  if (activeTab === "timetrial") {
    try {
      const tracksResponse = await getTracks();
      const tracks = Array.isArray(tracksResponse?.tracks) ? tracksResponse.tracks : [];
      const batchSize = 10;

      for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (track) => {
            try {
              const entries = await getTrackTimeTrial(track.commandName);
              if (!Array.isArray(entries) || entries.length === 0) return;

              const driverEntries = entries.filter(
                (entry) => normalizeUuidValue(entry.uuid) === normalizedDriverUuid,
              );
              if (driverEntries.length === 0) return;

              const bestEntry = driverEntries.reduce((best, current) =>
                current.time < best.time ? current : best,
              );

              driverTimeTrialEntries.push({
                trackName: track.name,
                commandName: track.commandName,
                rank: bestEntry.rank,
                time: bestEntry.time,
                totalEntries: entries.length,
              });
            } catch {
              // Ignore individual track failures for this optional section.
            }
          }),
        );
      }

      driverTimeTrialEntries.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.time - b.time;
      });
    } catch {
      // Hide section gracefully when Frosthex data is unavailable.
    }
  }

  const bestTimeTrialResult = driverTimeTrialEntries[0] ?? null;
  const averageTimeTrialRank =
    driverTimeTrialEntries.length > 0
      ? driverTimeTrialEntries.reduce((sum, item) => sum + item.rank, 0) /
        driverTimeTrialEntries.length
      : 0;

  return (
    <div className="animate-in fade-in duration-500 max-w-6xl mx-auto">
      {/* Profile Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 mb-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-32 h-32 rounded-2xl bg-zinc-800 border-2 border-zinc-700 overflow-hidden shadow-lg">
              <Image
                alt={driver.currentName || t(locale, "public.driverPage.unknownDriver")}
                className="w-full h-full object-cover"
                src={`https://mc-heads.net/avatar/${driver.uuid}/128`}
                width={128}
                height={128}
                unoptimized
              />
            </div>
          </div>

          {/* Info */}
          <div className="flex-grow text-center md:text-left w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono mb-1">
                  {driver.currentName || t(locale, "public.driverPage.unknownDriver")}
                </h1>
                <p className="text-zinc-400 text-sm flex items-center justify-center md:justify-start gap-2">
                  <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded">
                    {driver.uuid}
                  </span>
                </p>
              </div>
            </div>

            {/* Carreira */}
            <div className="space-y-4">
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3">
                  {t(locale, "public.driverPage.careerInNumbers")}
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(locale, "public.driverPage.races")}</p>
                    <p className="text-lg font-mono font-bold text-white">{careerAggregateStats.racesDisputadas}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(locale, "public.driverPage.points")}</p>
                    <p className="text-lg font-mono font-bold text-white">{careerAggregateStats.pontosTotais.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(locale, "public.driverPage.pointsPerRace")}</p>
                    <p className="text-lg font-mono font-bold text-cyan-300">{careerAggregateStats.pontosPorCorrida.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(locale, "public.driverPage.bestFinish")}</p>
                    <p className="text-lg font-mono font-bold text-zinc-100">
                      {careerAggregateStats.melhorChegada ? `P${careerAggregateStats.melhorChegada}` : "--"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
                    <p className="text-[11px] text-cyan-400/80 uppercase tracking-wider">{t(locale, "public.driverPage.top10Rate")}</p>
                    <p className="text-lg font-mono font-bold text-cyan-300">{careerAggregateStats.top10Rate.toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3">
                    {t(locale, "public.driverPage.consistency")}
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                      <span className="text-zinc-400">{t(locale, "public.driverPage.avgFinishCompleted")}</span>
                      <span className="text-zinc-100 font-mono">
                        {careerAggregateStats.mediaPosicaoChegada !== null
                          ? careerAggregateStats.mediaPosicaoChegada.toFixed(2)
                          : "--"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                      <span className="text-zinc-400">{t(locale, "public.driverPage.scoringRaceRate")}</span>
                      <span className="text-zinc-100 font-mono">{careerAggregateStats.taxaCorridasPontuando.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                      <span className="text-zinc-400">{t(locale, "public.driverPage.top5Rate")}</span>
                      <span className="text-zinc-100 font-mono">{careerAggregateStats.top5Rate.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                      <span className="text-zinc-400">{t(locale, "public.driverPage.scoringStreak")}</span>
                      <span className="text-zinc-100 font-mono">{careerAggregateStats.streakPontuandoAtual}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3">
                    {t(locale, "public.driverPage.careerMilestones")}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(locale, "public.driverPage.top1")}</p>
                      <p className="text-lg font-mono text-zinc-100">{careerAggregateStats.top1Total}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(locale, "public.driverPage.top3")}</p>
                      <p className="text-lg font-mono text-zinc-100">{careerAggregateStats.top3Total}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(locale, "public.driverPage.top5")}</p>
                      <p className="text-lg font-mono text-zinc-100">{careerAggregateStats.top5Total}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(locale, "public.driverPage.top10")}</p>
                      <p className="text-lg font-mono text-zinc-100">{careerAggregateStats.top10Total}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{t(locale, "public.driverPage.racesWithPoints")}</p>
                      <p className="text-lg font-mono text-zinc-100">{careerAggregateStats.corridasComPontos}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm">
                    <span className="text-zinc-500">{t(locale, "public.driverPage.bestPhase")} </span>
                    {careerAggregateStats.melhorFase ? (
                      <span className="text-zinc-200">
                        {careerAggregateStats.melhorFase.leagueName} - {careerAggregateStats.melhorFase.seasonName} ({careerAggregateStats.melhorFase.points} pts, {careerAggregateStats.melhorFase.top10Rate.toFixed(1)}% {t(locale, "public.driverPage.top10")})
                      </span>
                    ) : (
                      <span className="text-zinc-500">{t(locale, "public.driverPage.insufficientData")}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">
                    {t(locale, "public.driverPage.careerInsights")}
                  </p>
                  <details className="relative inline-flex items-center group/insights-help">
                    <summary
                      title={t(locale, "public.driverPage.careerInsightsTooltip")}
                      className="list-none [&::-webkit-details-marker]:hidden cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5 text-zinc-500" />
                    </summary>
                    <span className="pointer-events-none absolute left-1/2 top-0 z-20 w-72 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-[11px] normal-case tracking-normal text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover/insights-help:opacity-100 group-open/insights-help:opacity-100">
                      {t(locale, "public.driverPage.careerInsightsTooltip")}
                    </span>
                  </details>
                </div>
                {careerAggregateStats.racesDisputadas < 10 ? (
                  <p className="text-sm text-zinc-500">
                    {t(locale, "public.driverPage.insightsAfterTenRaces")}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {careerAggregateStats.insights.map((insight) => (
                      <li key={insight} className="text-sm text-zinc-300">
                        - {insight}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 p-1 bg-zinc-900 border border-zinc-800 rounded-xl max-w-full overflow-x-auto">
        <div className="flex items-center gap-2 w-max min-w-full">
        <Link
          href={`?${historyTabParams.toString()}`}
          scroll={false}
          className={`px-4 py-2 text-sm font-mono rounded-lg transition-colors ${
            activeTab === "history"
              ? "bg-zinc-800 text-cyan-300 border border-zinc-700"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {t(locale, "public.driverPage.tabHistory")}
        </Link>
        <Link
          href={`?${performanceTabParams.toString()}`}
          scroll={false}
          className={`px-4 py-2 text-sm font-mono rounded-lg transition-colors ${
            activeTab === "performance"
              ? "bg-zinc-800 text-cyan-300 border border-zinc-700"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {t(locale, "public.driverPage.tabPerformance")}
        </Link>
        <Link
          href={`?${timeTrialTabParams.toString()}`}
          scroll={false}
          className={`px-4 py-2 text-sm font-mono rounded-lg transition-colors ${
            activeTab === "timetrial"
              ? "bg-zinc-800 text-cyan-300 border border-zinc-700"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {t(locale, "public.driverPage.tabTimeTrial")}
        </Link>
        </div>
      </div>

      {activeTab === "performance" && (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white font-mono mb-1">
              {t(locale, "public.driverPage.performanceTitle")}
            </h2>
            <p className="text-sm text-zinc-500">
              {t(locale, "public.driverPage.performanceSubtitle")}
            </p>
          </div>

          <DriverDashboardFilters
            locale={locale}
            leagueOptions={leagueOptions}
            seasonOptions={seasonOptions.map((season) => ({
              id: season.id,
              name: season.name,
            }))}
            selectedLeagueId={selectedLeagueId}
            selectedSeasonId={selectedSeasonId}
            countDnfs={countDnfs}
          />
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                {t(locale, "public.driverPage.season")}
              </p>
              <p className="text-sm text-white font-mono">{selectedSeasonName}</p>
            </div>
            <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                {t(locale, "public.driverPage.league")}
              </p>
              <p className="text-sm text-zinc-100 font-mono">{selectedLeagueName}</p>
            </div>
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-cyan-400/80 mb-1">
                {t(locale, "public.driverPage.scope")}
              </p>
              <p className="text-sm text-cyan-300 font-mono">{t(locale, "public.driverPage.scopeComparison")}</p>
            </div>
          </div>

          {metricGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3">
                {group.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {group.keys.map((metricKey) => {
                  const row = metricByKey.get(metricKey);
                  if (!row) return null;

                  return (
                    <article
                      key={row.key}
                      className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
                    >
                      <p className="text-sm text-zinc-300 mb-3">{row.label}</p>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                          <span className="text-zinc-500">{t(locale, "public.driverPage.season")}</span>
                          <span className="text-zinc-100 font-mono">
                            {row.format(selectedSeasonStats)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                          <span className="text-zinc-500">{t(locale, "public.driverPage.league")}</span>
                          <span className="text-zinc-100 font-mono">
                            {row.format(selectedLeagueStats)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-2">
                          <span className="text-cyan-400/80">{t(locale, "public.driverPage.career")}</span>
                          <span className="text-cyan-300 font-mono">
                            {row.format(careerStats)}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Time Trial */}
      {activeTab === "timetrial" && (
        <div className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="text-cyan-400" size={20} />
              {t(locale, "public.driverPage.timeTrialOverview")}
            </h2>
            <span className="text-sm text-zinc-500 font-mono">Frosthex</span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
            {driverTimeTrialEntries.length === 0 ? (
              <p className="text-zinc-500 text-sm">
                {t(locale, "public.driverPage.noTimeTrial")}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-lg p-3">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                      {t(locale, "public.driverPage.tracksWithTime")}
                    </div>
                    <div className="text-xl font-mono text-cyan-300 font-bold">
                      {driverTimeTrialEntries.length}
                    </div>
                  </div>
                  <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-lg p-3">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                      {t(locale, "public.driverPage.bestRank")}
                    </div>
                    <div className="text-xl font-mono text-white font-bold">
                      {bestTimeTrialResult ? `#${bestTimeTrialResult.rank}` : "-"}
                    </div>
                  </div>
                  <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-lg p-3">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
                      {t(locale, "public.driverPage.averageRank")}
                    </div>
                    <div className="text-xl font-mono text-white font-bold">
                      {averageTimeTrialRank > 0 ? `#${averageTimeTrialRank.toFixed(1)}` : "-"}
                    </div>
                  </div>
                </div>

                <div className="md:hidden space-y-2">
                  {driverTimeTrialEntries.slice(0, 10).map((entry) => (
                    <div
                      key={entry.commandName}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                    >
                      <Link
                        href={addLocalePrefix(`/tracks/${encodeURIComponent(entry.commandName)}`, locale)}
                        className="text-cyan-400 hover:underline font-medium"
                      >
                        {entry.trackName}
                      </Link>
                      <div className="mt-2 flex items-center justify-between text-sm">
                        <span className="text-zinc-500">{t(locale, "public.driverPage.rank")}</span>
                        <span className="text-zinc-200 font-mono">#{entry.rank}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-zinc-500">{t(locale, "public.driverPage.time")}</span>
                        <span className="text-zinc-200 font-mono">{formatTimeTrialTime(entry.time)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[620px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                        <th className="py-2 pr-4">{t(locale, "public.driverPage.track")}</th>
                        <th className="py-2 pr-4">{t(locale, "public.driverPage.rank")}</th>
                        <th className="py-2 pr-4">{t(locale, "public.driverPage.time")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverTimeTrialEntries.slice(0, 10).map((entry) => (
                        <tr key={entry.commandName} className="border-b border-zinc-800/60">
                          <td className="py-3 pr-4">
                            <Link
                              href={addLocalePrefix(`/tracks/${encodeURIComponent(entry.commandName)}`, locale)}
                              className="text-cyan-400 hover:underline"
                            >
                              {entry.trackName}
                            </Link>
                          </td>
                          <td className="py-3 pr-4 text-zinc-200 font-mono">#{entry.rank}</td>
                          <td className="py-3 pr-4 text-zinc-200 font-mono">
                            {formatTimeTrialTime(entry.time)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Race History */}
      {activeTab === "history" && (
      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="text-cyan-400" size={20} />
            {t(locale, "public.driverPage.tabHistory")}
          </h2>
          <div className="text-sm text-zinc-500 font-mono text-right">
            <div>{t(locale, "public.driverPage.racesCount", { count: racesData.length })}</div>
            {!showAllHistory && racesData.length > historyLimit && (
              <div className="text-xs text-zinc-600">
                {t(locale, "public.driverPage.showingLatest", { count: historyLimit })}
              </div>
            )}
          </div>
        </div>

        {!showAllHistory && racesData.length > historyLimit && (
          <div className="mb-4 text-right">
            <Link
              href={`?${new URLSearchParams({
                ...Object.fromEntries(historyTabParams.entries()),
                allHistory: "yes",
              }).toString()}`}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-mono"
            >
              {t(locale, "public.driverPage.showFullHistory", { count: racesData.length })}
            </Link>
          </div>
        )}

        {/* Race Cards Grid */}
        <div className="grid gap-4">
          {racesData.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
              <Trophy className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
              <p>{t(locale, "public.driverPage.noRacesFound")}</p>
            </div>
          ) : (
            visibleHistoryRaces.map((race) => {
              const dateTime = formatDateTime(race.scheduledDate);
              const raceRound = selectMainRaceRound(race.eventRounds);
              const sprintRound = race.eventRounds.find(isSprintRound);

              // Find all qualifying rounds and sort them
              const qualyRounds = race.eventRounds
                .filter(isQualyRound)
                .sort((a, b) => {
                  // Sort by round name to maintain order (R1-Qualy, R2-Qualy, etc.)
                  const nameA = a.apiRoundName || "";
                  const nameB = b.apiRoundName || "";
                  return nameA.localeCompare(nameB);
                });

              const raceResult = raceRound?.results[0];
              const sprintResult = sprintRound?.results[0];

              const getFinalPosition = (
                result: DriverRoundResult | undefined,
              ) => {
                if (!result || isDidNotFinish(result)) return t(locale, "public.driverPage.dnfShort");
                return `P${result.position}`;
              };

              const getPositionChange = (start: number | null, finish: number) => {
                if (!start) return null;
                const change = start - finish;
                if (change > 0) {
                  return (
                    <span className="inline-flex items-center gap-0.5 text-emerald-400 text-xs font-medium">
                      <ChevronUp size={12} />
                      {change}
                    </span>
                  );
                } else if (change < 0) {
                  return (
                    <span className="inline-flex items-center gap-0.5 text-rose-400 text-xs font-medium">
                      <ChevronDown size={12} />
                      {Math.abs(change)}
                    </span>
                  );
                }
                return <span className="text-zinc-500 text-xs font-medium">-</span>;
              };

              // Calculate total points
              const racePoints = race.eventRounds.reduce(
                (sum, er) => sum + (er.results[0]?.points || 0),
                0
              );

              return (
                <details
                  key={race.id}
                  className="group bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-all"
                >
                  <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer p-4 bg-zinc-900/50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {race.season.league.logoUrl ? (
                          <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0">
                            <Image
                              src={race.season.league.logoUrl}
                              alt={race.season.league.name}
                              width={40}
                              height={40}
                              className="w-full h-full object-contain p-1"
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                            <Trophy size={18} className="text-zinc-500" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-white truncate">
                            {race.name}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                            <span className="truncate">{race.season.league.name}</span>
                            <span className="text-zinc-700">|</span>
                            <span className="truncate">{race.season.name}</span>
                            <span className="text-zinc-700">|</span>
                            <span className="font-mono">
                              {t(locale, "public.driverPage.raceNumber", { round: race.round })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3 text-xs sm:text-sm text-zinc-400">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Clock size={14} className="text-zinc-500" />
                          <span>{dateTime.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5 max-w-[180px] sm:max-w-[220px] min-w-0">
                          <MapPin size={14} className="text-zinc-500 shrink-0" />
                          <span className="truncate">
                            {race.trackApiName || t(locale, "public.driverPage.unknownTrack")}
                          </span>
                        </div>
                        <div className="text-right ml-auto sm:ml-0 shrink-0">
                          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                            {t(locale, "public.driverPage.points")}
                          </div>
                          <div className="text-cyan-400 font-mono font-bold">
                            +{racePoints}
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-zinc-500 transition-transform group-open:rotate-180" />
                      </div>
                    </div>
                  </summary>

                  <div className="px-4 pb-4 border-t border-zinc-800/50">
                    <div className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Qualifying */}
                      <div className="bg-zinc-800/30 rounded-lg p-3 border border-zinc-800">
                        <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-zinc-500 font-semibold">
                          <Target size={14} />
                          {t(locale, "public.driverPage.qualifying")}
                        </div>
                        {qualyRounds.length === 1 ? (
                          // Single qualifying round - show normal block
                          qualyRounds[0]?.results[0] ? (
                            <>
                              <div className="flex items-baseline gap-2">
                                <span
                                  className={`text-2xl font-bold font-mono ${
                                    qualyRounds[0].results[0].position === 1
                                      ? "text-yellow-400"
                                      : qualyRounds[0].results[0].position <= 3
                                        ? "text-zinc-300"
                                        : "text-white"
                                  }`}
                                >
                                  {getFinalPosition(qualyRounds[0].results[0])}
                                </span>
                                {qualyRounds[0].results[0].fastestLap && (
                                  <span className="relative inline-flex items-center group/fastlap">
                                    <Zap size={16} className="text-purple-400" />
                                    <span className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover/fastlap:opacity-100">
                                      {formatLapTime(qualyRounds[0].results[0].fastestLapTime)}
                                    </span>
                                  </span>
                                )}
                              </div>
                              {isDidNotFinish(qualyRounds[0].results[0]) && (
                                <div className="mt-1 flex items-center gap-1 text-rose-400 text-xs">
                                  <AlertCircle size={12} />
                                  <span>{t(locale, "public.driverPage.didNotFinish")}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-zinc-600 text-sm">-</span>
                          )
                        ) : qualyRounds.length > 1 ? (
                          // Multiple qualifying rounds - show divided list
                          <div className="space-y-2">
                            {qualyRounds.map((round, idx) => {
                              const result = round.results[0];
                              if (!result) return null;
                              
                              // Extract stage number from round name (R1-Qualy -> Q1, R2-Qualy -> Q2, etc.)
                              const stageName = round.apiRoundName 
                                ? round.apiRoundName.replace(/R(\d+)-Qualy/i, 'Q$1').replace(/R(\d+)-Quali/i, 'Q$1').replace(/Qualy\s*(\d+)/i, 'Q$1')
                                : `Q${idx + 1}`;
                              
                              return (
                                <div key={round.id} className="flex items-center justify-between">
                                  <span className="text-xs text-zinc-400 font-mono">{stageName}</span>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-lg font-bold font-mono ${
                                        result.position === 1
                                          ? "text-yellow-400"
                                          : result.position <= 3
                                            ? "text-zinc-300"
                                            : "text-white"
                                      }`}
                                    >
                                      {getFinalPosition(result)}
                                    </span>
                                    {result.fastestLap && (
                                      <span className="relative inline-flex items-center group/fastlap">
                                        <Zap size={14} className="text-purple-400" />
                                        <span className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover/fastlap:opacity-100">
                                          {formatLapTime(result.fastestLapTime)}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-sm">-</span>
                        )}
                      </div>

                      {/* Sprint (if exists) */}
                      {sprintResult && (
                        <div className="bg-zinc-800/30 rounded-lg p-3 border border-zinc-800">
                          <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-zinc-500 font-semibold">
                            <Zap size={14} />
                            {t(locale, "public.driverPage.sprint")}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-baseline gap-2">
                              <span
                                className={`text-2xl font-bold font-mono ${
                                  sprintResult.position === 1
                                    ? "text-yellow-400"
                                    : sprintResult.position <= 3
                                      ? "text-zinc-300"
                                      : "text-white"
                                }`}
                              >
                                {getFinalPosition(sprintResult)}
                              </span>
                              {sprintResult.fastestLap && (
                                <span className="relative inline-flex items-center group/fastlap">
                                  <Zap size={16} className="text-purple-400" />
                                  <span className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover/fastlap:opacity-100">
                                    {formatLapTime(sprintResult.fastestLapTime)}
                                  </span>
                                </span>
                              )}
                            </div>
                            {sprintResult.startPosition && (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-zinc-500">
                                  {t(locale, "public.driverPage.start")} P{sprintResult.startPosition}
                                </span>
                                {getPositionChange(
                                  sprintResult.startPosition,
                                  sprintResult.position
                                )}
                              </div>
                            )}
                            {isDidNotFinish(sprintResult) && (
                              <div className="flex items-center gap-1 text-rose-400 text-xs">
                                <AlertCircle size={12} />
                                <span>{t(locale, "public.driverPage.didNotFinish")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Main Race */}
                      <div
                        className={`rounded-lg p-3 border ${
                          raceResult?.position === 1
                            ? "bg-yellow-500/10 border-yellow-500/30"
                            : raceResult && raceResult.position <= 3
                              ? "bg-zinc-800/50 border-zinc-700"
                              : "bg-zinc-800/30 border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-zinc-500 font-semibold">
                          <Flag size={14} />
                          {t(locale, "public.driverPage.mainRace")}
                        </div>
                        {raceResult ? (
                          <div className="space-y-1">
                            <div className="flex items-baseline gap-2">
                              <span
                                className={`text-3xl font-bold font-mono ${
                                  raceResult.position === 1
                                    ? "text-yellow-400"
                                    : raceResult.position === 2
                                      ? "text-zinc-300"
                                      : raceResult.position === 3
                                        ? "text-amber-600"
                                        : "text-white"
                                }`}
                              >
                                {getFinalPosition(raceResult)}
                              </span>
                              {raceResult.fastestLap && (
                                <div className="relative inline-flex items-center group/fastlap">
                                  <div
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                    style={{
                                      background:
                                        "linear-gradient(135deg, #8B5CF6 0%, #A855F7 50%, #C084FC 100%)",
                                    }}
                                  >
                                    <Zap size={12} className="text-white" />
                                      <span className="text-white">{t(locale, "public.driverPage.fastestLapBadge")}</span>
                                    </div>
                                  <span className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover/fastlap:opacity-100">
                                    {formatLapTime(raceResult.fastestLapTime)}
                                  </span>
                                </div>
                              )}
                            </div>
                            {raceResult.startPosition && (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-zinc-500">
                                  {t(locale, "public.driverPage.start")} P{raceResult.startPosition}
                                </span>
                                {getPositionChange(
                                  raceResult.startPosition,
                                  raceResult.position
                                )}
                              </div>
                            )}
                            {isDidNotFinish(raceResult) && (
                              <div className="flex items-center gap-1 text-rose-400 text-sm font-medium">
                                <AlertCircle size={14} />
                                <span>{t(locale, "public.driverPage.didNotFinish")}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-sm">-</span>
                        )}
                      </div>
                    </div>

                    {/* Footer: Points Summary */}
                    <div className="mt-4 pt-3 border-t border-zinc-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        {/* Calculate total qualifying points from all rounds */}
                        {(() => {
                          const totalQualyPoints = qualyRounds.reduce(
                            (sum, round) => sum + (round.results[0]?.points || 0),
                            0
                          );
                          return totalQualyPoints > 0 ? (
                            <div className="text-xs text-zinc-500">
                              {t(locale, "public.driverPage.qualy")}:{" "}
                              <span className="text-cyan-400 font-mono">
                                +{totalQualyPoints}
                              </span>
                            </div>
                          ) : null;
                        })()}
                        {sprintResult && sprintResult.points > 0 && (
                          <div className="text-xs text-zinc-500">
                            {t(locale, "public.driverPage.sprint")}:{" "}
                            <span className="text-cyan-400 font-mono">
                              +{sprintResult.points}
                            </span>
                          </div>
                        )}
                        {raceResult && raceResult.points > 0 && (
                          <div className="text-xs text-zinc-500">
                            {t(locale, "public.driverPage.race")}:{" "}
                            <span className="text-cyan-400 font-mono">
                              +{raceResult.points}
                            </span>
                          </div>
                        )}
                      </div>

                      {racePoints > 0 && (
                        <div className="self-start sm:self-auto text-left sm:text-right">
                          <div className="text-xs text-zinc-500 mb-0.5">
                            {t(locale, "public.driverPage.totalEvent")}
                          </div>
                          <div className="text-xl font-bold text-cyan-400 font-mono">
                            +{racePoints}
                          </div>
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </div>
      </div>
      )}
    </div>
  );
}
