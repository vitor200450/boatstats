"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Link2,
  Unlink,
  RefreshCw,
  Download,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Zap,
  Trophy,
  UserPlus,
  Users,
  Loader2,
  X,
} from "lucide-react";
import {
  linkApiEvent,
  unlinkApiEvent,
  importRaceResults,
  configureRound,
  updateRace,
  applyManualFinalRoundPositions,
  createManualFinalRound,
  addManualRoundDriver,
  registerDriverFromEvent,
  setRoundResultDisqualification,
  setRoundResultFastestLap,
  saveRaceTeamRoster,
} from "@/lib/leagues/raceActions";
import { getSprintModeLabel } from "@/lib/leagues/roundRules";
import { searchDriverSuggestions } from "@/lib/leagues/driverActions";

interface RaceDetailsClientProps {
  race: RaceClient;
  isAdmin: boolean;
  leagueId: string;
  seasonId: string;
  seasonStatus: string;
  seasonReverseGridEnabled?: boolean;
  reverseGridDisplay?: {
    enabled: boolean;
    displayRoundId: string | null;
    pointsByDriverId: Record<string, number>;
  };
  teamScoringMode?: "STANDARD" | "DEPTH_CHART" | "SLOT_MULLIGAN";
  slotRosterConfig?: {
    enabled: boolean;
    teams: Array<{
      teamId: string;
      teamName: string;
      drivers: Array<{ id: string; uuid: string; currentName: string | null }>;
      mainDriverIds: string[];
      reserveDriverIds: string[];
      lastRosterUpdatedAt: Date | string | null;
      lastRosterRound: number | null;
      lastRosterRaceName: string | null;
    }>;
  };
  unregisteredPlayers?: { uuid: string; name: string }[];
  roundPreviewByName?: Record<
    string,
    Array<{ uuid: string; name: string; position: number; finish_time: number }>
  >;
  existingRaceBonuses?: Array<{
    driverId: string;
    driverUuid: string;
    driverName: string;
    points: number;
    reason: string | null;
  }>;
  seasonAssignedDrivers?: Array<{
    id: string;
    uuid: string;
    name: string;
  }>;
  seasonRounds?: number[];
  seasonRoundOptions?: Array<{ round: number; raceName: string }>;
}

type ImportedResult = {
  id: string;
  position: number;
  manualPositionOverride?: number | null;
  manualPreviousPosition?: number | null;
  manualOriginalPosition?: number | null;
  manualEditedAt?: Date | string | null;
  manualEditReason?: string | null;
  finishTimeMs: number | null;
  points: number;
  disqualified: boolean;
  fastestLap: boolean;
  fastestLapTime: number | null;
  driver: {
    id: string;
    uuid: string | null;
    currentName: string | null;
  } | null;
};

type DriverSuggestion = {
  id: string;
  uuid: string;
  currentName: string | null;
};

type EventRoundClient = {
  id: string;
  apiRoundName: string;
  apiRoundType: string;
  origin?: "API" | "MANUAL" | string;
  manualKind?: "FINAL" | string | null;
  targetHeatName: string | null;
  status: string;
  countsForStandings: boolean;
  specialType: "NONE" | "SPRINT";
  sprintMode: "CLASSIFICATION" | "POINTS" | null;
  results: ImportedResult[];
};

type RaceClient = {
  id: string;
  seasonId: string;
  round: number;
  name?: string;
  apiEventId: string | null;
  reverseGridEnabled?: boolean;
  eventRounds: EventRoundClient[];
};

type ImportRaceResultsPayload = {
  importedCount: number;
  skippedCount: number;
};

type BonusCandidateDriver = {
  uuid: string;
  name: string;
  pointsBeforeBonus: number | null;
};

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  }
  return `${seconds}.${millis.toString().padStart(3, "0")}`;
}

function isFinalRound(round: { apiRoundName: string; apiRoundType: string }): boolean {
  if (/RACE|FINAL/i.test(round.apiRoundType)) return true;
  return /race|final/i.test(round.apiRoundName);
}

function isQualifyingRound(round: {
  apiRoundName: string;
  apiRoundType: string;
}): boolean {
  if (/QUAL|CLASSIF/i.test(round.apiRoundType)) return true;
  return /qualy|quali|qualifying|classifica|\bQ\d+\b/i.test(
    round.apiRoundName.trim(),
  );
}

function isManualFinalRound(round: {
  origin?: string;
  manualKind?: string | null;
}): boolean {
  return round.origin === "MANUAL" && round.manualKind === "FINAL";
}

function getRoundTotalPoints(round: EventRoundClient): number {
  return round.results.reduce((sum, result) => sum + (result.points ?? 0), 0);
}

function selectPrimaryScoringRound(rounds: EventRoundClient[]): EventRoundClient | null {
  if (rounds.length === 0) return null;

  const scoredRounds = rounds.filter(
    (round) => round.countsForStandings && !isQualifyingRound(round),
  );
  const scoredRoundsWithPoints = scoredRounds.filter(
    (round) => getRoundTotalPoints(round) > 0,
  );

  if (scoredRoundsWithPoints.length > 0) {
    return [...scoredRoundsWithPoints].sort((a, b) => {
      const pointsDiff = getRoundTotalPoints(b) - getRoundTotalPoints(a);
      if (pointsDiff !== 0) return pointsDiff;

      const aFinal = isFinalRound(a) ? 1 : 0;
      const bFinal = isFinalRound(b) ? 1 : 0;
      if (aFinal !== bFinal) return bFinal - aFinal;

      return a.apiRoundName.localeCompare(b.apiRoundName);
    })[0];
  }

  const final = scoredRounds.find((round) => isFinalRound(round));
  if (final) return final;

  const manualFinal = rounds.find((round) =>
    isManualFinalRound(round) && getRoundTotalPoints(round) > 0,
  );
  if (manualFinal) return manualFinal;

  const latestScoring = [...scoredRounds]
    .reverse()
    .find((round) =>
      !(round.specialType === "SPRINT" && round.sprintMode === "CLASSIFICATION"),
    );

  return latestScoring ?? scoredRounds[0] ?? rounds[rounds.length - 1] ?? null;
}

function RoundStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "CONFIGURED":
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          Configurada
        </span>
      );
    case "IMPORTED":
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
          Importada
        </span>
      );
    case "CANCELLED":
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
          Cancelada
        </span>
      );
    default:
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
          Pendente
        </span>
      );
  }
}

export function RaceDetailsClient({
  race,
  isAdmin,
  seasonStatus,
  seasonReverseGridEnabled = false,
  reverseGridDisplay,
  teamScoringMode = "STANDARD",
  slotRosterConfig,
  unregisteredPlayers = [],
  roundPreviewByName = {},
  existingRaceBonuses = [],
  seasonAssignedDrivers = [],
  seasonRounds = [],
  seasonRoundOptions = [],
}: RaceDetailsClientProps) {
  const isSeasonActive = seasonStatus === "ACTIVE";
  const router = useRouter();

  const [eventId, setEventId] = useState(race.apiEventId || "");
  const [linkedEventId, setLinkedEventId] = useState<string | null>(
    race.apiEventId || null,
  );
  const [linkFeedback, setLinkFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isUpdatingReverseGridFlag, setIsUpdatingReverseGridFlag] =
    useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCreatingManualFinalRound, setIsCreatingManualFinalRound] = useState(false);
  const [togglingRound, setTogglingRound] = useState<string | null>(null);
  const [registeringUuid, setRegisteringUuid] = useState<string | null>(null);
  const [isRegisteringAll, setIsRegisteringAll] = useState(false);
  const [registerAllProgress, setRegisterAllProgress] = useState({
    current: 0,
    total: 0,
    success: 0,
  });
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());
  const [updatingDsqResultId, setUpdatingDsqResultId] = useState<string | null>(null);
  const [updatingFastestResultId, setUpdatingFastestResultId] = useState<string | null>(null);
  const [updatingSpecialRoundId, setUpdatingSpecialRoundId] = useState<string | null>(null);
  const [editingFinalRoundId, setEditingFinalRoundId] = useState<string | null>(null);
  const [savingFinalRoundId, setSavingFinalRoundId] = useState<string | null>(null);
  const [savingManualDriverRoundId, setSavingManualDriverRoundId] =
    useState<string | null>(null);
  const [manualDriverDraftByRound, setManualDriverDraftByRound] = useState<
    Record<string, { uuid: string; name: string }>
  >({});
  const [manualDriverSearchRoundId, setManualDriverSearchRoundId] = useState<string | null>(
    null,
  );
  const [manualDriverSuggestionsByRound, setManualDriverSuggestionsByRound] =
    useState<Record<string, DriverSuggestion[]>>({});
  const [manualDriverSuggestionsOpenByRound, setManualDriverSuggestionsOpenByRound] =
    useState<Record<string, boolean>>({});
  const [manualDriverSuggestionIndexByRound, setManualDriverSuggestionIndexByRound] =
    useState<Record<string, number>>({});
  const [manualDriverLoadingByRound, setManualDriverLoadingByRound] = useState<
    Record<string, boolean>
  >({});
  const [finalRoundReason, setFinalRoundReason] = useState<string>("");
  const [finalRoundPositionDraft, setFinalRoundPositionDraft] = useState<
    Record<string, number>
  >({});
  const [savedFinalRoundPositionsByRound, setSavedFinalRoundPositionsByRound] =
    useState<Record<string, Record<string, number>>>(() => {
      const initial: Record<string, Record<string, number>> = {};
      for (const round of race.eventRounds) {
        initial[round.id] = Object.fromEntries(
          (round.results ?? []).map((result) => [result.id, result.position]),
        );
      }
      return initial;
    });
  const [savingRosterTeamId, setSavingRosterTeamId] = useState<string | null>(null);
  const [isRosterRoundModalOpen, setIsRosterRoundModalOpen] = useState(false);
  const [pendingRosterTeamId, setPendingRosterTeamId] = useState<string | null>(null);
  const [pendingRosterRound, setPendingRosterRound] = useState<number>(race.round);
  const [isImportingResults, setIsImportingResults] = useState(false);
  const [showBonusConfig, setShowBonusConfig] = useState(false);
  const [importBonusReason, setImportBonusReason] = useState("");
  const [importBonusSearch, setImportBonusSearch] = useState("");
  const [importBonusDraftByUuid, setImportBonusDraftByUuid] = useState<
    Record<string, string>
  >({});
  const [rosterDraft, setRosterDraft] = useState<
    Record<string, { mainDriverIds: string[]; reserveDriverIds: string[] }>
  >(() => {
    const draft: Record<
      string,
      { mainDriverIds: string[]; reserveDriverIds: string[] }
    > = {};

    for (const team of slotRosterConfig?.teams ?? []) {
      draft[team.teamId] = {
        mainDriverIds: [...team.mainDriverIds],
        reserveDriverIds: [...team.reserveDriverIds],
      };
    }

    return draft;
  });
  const [isRefreshing, startRefreshTransition] = useTransition();

  const hasImportedRounds = race.eventRounds.some(
    (r) => Array.isArray(r.results) && r.results.length > 0,
  );
  const hasConfiguredRounds = race.eventRounds.some(
    (r) => r.status === "CONFIGURED",
  );
  const isLinked = !!linkedEventId;
  const hasQualifyingWithResults = race.eventRounds.some(
    (round) => isQualifyingRound(round) && (round.results?.length ?? 0) > 0,
  );
  const hasQualifyingPreview = race.eventRounds.some(
    (round) =>
      isQualifyingRound(round) &&
      (roundPreviewByName[round.apiRoundName]?.length ?? 0) > 0,
  );
  const canCreateManualFinalRound = hasQualifyingWithResults || hasQualifyingPreview;

  const isSlotMulliganMode =
    teamScoringMode === "SLOT_MULLIGAN" && slotRosterConfig?.enabled;

  const formatRosterUpdatedAt = (value: Date | string | null): string => {
    if (!value) return "Nunca definido";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "Nunca definido";
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getRosterBaseLabel = (team: {
    lastRosterRaceName: string | null;
    lastRosterRound: number | null;
  }): string => {
    if (team.lastRosterRaceName) {
      return `Roster base: ${team.lastRosterRaceName}`;
    }
    if (team.lastRosterRound) {
      return `Roster base: rodada ${team.lastRosterRound}`;
    }
    return "Roster base: ainda nao definido";
  };
  const isReverseGridActive = Boolean(race.reverseGridEnabled);
  const canToggleReverseGrid = isAdmin && isSeasonActive && seasonReverseGridEnabled;

  const resolvedSeasonRoundOptions =
    seasonRoundOptions.length > 0
      ? [...seasonRoundOptions].sort((a, b) => a.round - b.round)
      : seasonRounds.length > 0
        ? [...seasonRounds].sort((a, b) => a - b).map((round) => ({
            round,
            raceName: `Rodada ${round}`,
          }))
        : [{ round: race.round, raceName: race.name ?? `Rodada ${race.round}` }];

  const openRosterRoundModal = (teamId: string) => {
    setPendingRosterTeamId(teamId);
    setPendingRosterRound(race.round);
    setIsRosterRoundModalOpen(true);
  };

  const closeRosterRoundModal = () => {
    if (savingRosterTeamId) return;
    setIsRosterRoundModalOpen(false);
    setPendingRosterTeamId(null);
  };

  const pendingRosterTeamName =
    pendingRosterTeamId
      ? slotRosterConfig?.teams.find((team) => team.teamId === pendingRosterTeamId)?.teamName ??
        "Equipe"
      : "Equipe";
  const selectedScoringRound = selectPrimaryScoringRound(race.eventRounds);
  const scoringRoundPreview = selectedScoringRound
    ? roundPreviewByName[selectedScoringRound.apiRoundName] ?? []
    : [];
  const scoringRoundResultDrivers: BonusCandidateDriver[] = selectedScoringRound
    ? selectedScoringRound.results
        .filter((result) => result.driver?.uuid)
        .map((result) => ({
          uuid: result.driver!.uuid!,
          name: result.driver?.currentName || result.driver?.uuid || "Piloto",
          pointsBeforeBonus: result.points,
        }))
    : [];
  const bonusCandidatesUnsorted: BonusCandidateDriver[] =
    scoringRoundResultDrivers.length > 0
      ? scoringRoundResultDrivers
      : scoringRoundPreview.map((previewRow) => ({
          uuid: previewRow.uuid,
          name: previewRow.name,
          pointsBeforeBonus: null,
        }));

  const bonusCandidatesFromSeasonAssignments: BonusCandidateDriver[] =
    seasonAssignedDrivers.map((driver) => ({
      uuid: driver.uuid,
      name: driver.name,
      pointsBeforeBonus: null,
    }));

  const bonusCandidatesFromExistingBonuses: BonusCandidateDriver[] =
    existingRaceBonuses.map((bonus) => ({
      uuid: bonus.driverUuid,
      name: bonus.driverName,
      pointsBeforeBonus: null,
    }));

  const bonusCandidates = [
    ...bonusCandidatesUnsorted,
    ...bonusCandidatesFromSeasonAssignments,
    ...bonusCandidatesFromExistingBonuses,
  ]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((candidate, index, array) => array.findIndex((row) => row.uuid === candidate.uuid) === index);
  const bonusPointsByDriverUuid = new Map(
    existingRaceBonuses.map((bonus) => [bonus.driverUuid, bonus.points] as const),
  );
  const raceResultDriverUuids = new Set(
    race.eventRounds.flatMap((round) =>
      round.results
        .filter((result) => result.driver?.uuid)
        .map((result) => result.driver!.uuid!),
    ),
  );
  const nonParticipatingDriverBonuses = existingRaceBonuses.filter(
    (bonus) => !raceResultDriverUuids.has(bonus.driverUuid),
  );
  const filteredBonusCandidates = bonusCandidates.filter((candidate) => {
    const query = importBonusSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      candidate.name.toLowerCase().includes(query) ||
      candidate.uuid.toLowerCase().includes(query)
    );
  });

  const formatManualEditAt = (value: Date | string | null | undefined): string | null => {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    if (!manualDriverSearchRoundId) return;

    const roundId = manualDriverSearchRoundId;
    const draft = manualDriverDraftByRound[roundId] ?? { uuid: "", name: "" };
    const nameQuery = draft.name.trim();
    const uuidQuery = draft.uuid.trim();
    const query = nameQuery.length >= 2 ? nameQuery : uuidQuery.length >= 2 ? uuidQuery : "";

    if (!query) {
      setManualDriverSuggestionsByRound((prev) => ({ ...prev, [roundId]: [] }));
      setManualDriverSuggestionsOpenByRound((prev) => ({ ...prev, [roundId]: false }));
      setManualDriverSuggestionIndexByRound((prev) => ({ ...prev, [roundId]: -1 }));
      setManualDriverLoadingByRound((prev) => ({ ...prev, [roundId]: false }));
      return;
    }

    let cancelled = false;
    setManualDriverLoadingByRound((prev) => ({ ...prev, [roundId]: true }));

    const timer = setTimeout(async () => {
      const response = await searchDriverSuggestions(query, 8);
      if (cancelled) return;

      const suggestions = response.success
        ? ((response.data as DriverSuggestion[] | undefined) ?? [])
        : [];

      setManualDriverSuggestionsByRound((prev) => ({ ...prev, [roundId]: suggestions }));
      setManualDriverSuggestionsOpenByRound((prev) => ({
        ...prev,
        [roundId]: suggestions.length > 0,
      }));
      setManualDriverSuggestionIndexByRound((prev) => ({ ...prev, [roundId]: -1 }));
      setManualDriverLoadingByRound((prev) => ({ ...prev, [roundId]: false }));
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [manualDriverDraftByRound, manualDriverSearchRoundId]);

  const toggleRosterDriver = (
    teamId: string,
    driverId: string,
    role: "main" | "reserve",
  ) => {
    setRosterDraft((current) => {
      const existing = current[teamId] ?? { mainDriverIds: [], reserveDriverIds: [] };
      let mainDriverIds = existing.mainDriverIds.filter((id) => id !== driverId);
      let reserveDriverIds = existing.reserveDriverIds.filter((id) => id !== driverId);

      if (role === "main") {
        if (existing.mainDriverIds.includes(driverId)) {
          return { ...current, [teamId]: { mainDriverIds, reserveDriverIds } };
        }
        mainDriverIds = [...mainDriverIds, driverId].slice(0, 3);
      } else {
        if (existing.reserveDriverIds.includes(driverId)) {
          return { ...current, [teamId]: { mainDriverIds, reserveDriverIds } };
        }
        reserveDriverIds = [...reserveDriverIds, driverId].slice(0, 2);
      }

      return { ...current, [teamId]: { mainDriverIds, reserveDriverIds } };
    });
  };

  const handleSaveRoster = async () => {
    if (!pendingRosterTeamId) return;
    try {
      const draft = rosterDraft[pendingRosterTeamId] ?? {
        mainDriverIds: [],
        reserveDriverIds: [],
      };
      const parsedRound = Number(pendingRosterRound);
      if (!Number.isInteger(parsedRound) || parsedRound < 1) {
        toast.error("Rodada de vigência inválida");
        return;
      }

      if (seasonRounds.length > 0 && !seasonRounds.includes(parsedRound)) {
        toast.error("Rodada de vigência inválida para esta temporada");
        return;
      }

      setSavingRosterTeamId(pendingRosterTeamId);

      const result = await saveRaceTeamRoster(
        race.seasonId,
        race.id,
        pendingRosterTeamId,
        draft.mainDriverIds,
        draft.reserveDriverIds,
        parsedRound,
      );

      if (result.success) {
        toast.success("Roster salvo com sucesso");
        setIsRosterRoundModalOpen(false);
        setPendingRosterTeamId(null);
        router.refresh();
      } else {
        toast.error(result.error || "Erro ao salvar roster");
      }
    } catch {
      toast.error("Erro inesperado ao salvar roster");
    } finally {
      setSavingRosterTeamId(null);
    }
  };

  const handleRegisterOne = async (uuid: string, name: string) => {
    try {
      setRegisteringUuid(uuid);
      const result = await registerDriverFromEvent(uuid, name);
      if (result.success) {
        toast.success(`${name} registrado com sucesso!`);
        router.refresh();
      } else {
        toast.error(result.error || "Erro ao registrar piloto");
      }
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setRegisteringUuid(null);
    }
  };

  const handleRegisterAll = async () => {
    if (unregisteredPlayers.length === 0) return;
    try {
      setIsRegisteringAll(true);
      setRegisterAllProgress({
        current: 0,
        total: unregisteredPlayers.length,
        success: 0,
      });
      let success = 0;
      for (let i = 0; i < unregisteredPlayers.length; i++) {
        const p = unregisteredPlayers[i];
        const result = await registerDriverFromEvent(p.uuid, p.name);
        if (result.success) success++;
        setRegisterAllProgress({
          current: i + 1,
          total: unregisteredPlayers.length,
          success,
        });
      }
      toast.success(`${success} piloto(s) registrado(s) com sucesso!`);
      router.refresh();
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setIsRegisteringAll(false);
      setRegisterAllProgress((prev) => ({
        ...prev,
        current: 0,
        total: 0,
      }));
    }
  };

  const handleToggleCounts = async (
    e: React.MouseEvent,
    roundId: string,
    current: boolean,
  ) => {
    e.stopPropagation();
    try {
      setTogglingRound(roundId);
      const result = await configureRound(roundId, {
        countsForStandings: !current,
      });
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error || "Erro ao atualizar rodada");
      }
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setTogglingRound(null);
    }
  };

  const handleToggleReverseGrid = async () => {
    try {
      setIsUpdatingReverseGridFlag(true);
      const response = await updateRace(race.id, {
        reverseGridEnabled: !isReverseGridActive,
      });

      if (!response.success) {
        toast.error(response.error || "Erro ao atualizar reverse grid");
        return;
      }

      toast.success(
        !isReverseGridActive
          ? "Reverse grid habilitado para esta corrida"
          : "Reverse grid desabilitado para esta corrida",
      );
      router.refresh();
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setIsUpdatingReverseGridFlag(false);
    }
  };

  const toggleRound = (roundId: string) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(roundId)) next.delete(roundId);
      else next.add(roundId);
      return next;
    });
  };

  const handleLinkEvent = async () => {
    if (!eventId.trim()) {
      toast.error("Informe o ID do Evento no FrostHex");
      setLinkFeedback({
        type: "error",
        message: "Informe o ID do evento para vincular.",
      });
      return;
    }
    try {
      setIsLinking(true);
      setLinkFeedback(null);
      const result = await linkApiEvent(race.id, eventId);
      if (result.success) {
        const normalizedEventId = eventId.trim();
        setLinkedEventId(normalizedEventId);
        setEventId(normalizedEventId);
        setLinkFeedback({
          type: "success",
          message: `Evento ${normalizedEventId} vinculado com sucesso.`,
        });
        toast.success("Evento vinculado com sucesso!");
        router.refresh();
      } else {
        setLinkFeedback({
          type: "error",
          message: result.error || "Erro ao vincular evento.",
        });
        toast.error(result.error || "Erro ao vincular evento");
      }
    } catch {
      setLinkFeedback({
        type: "error",
        message: "Erro inesperado ao tentar vincular o evento.",
      });
      toast.error("Erro inesperado");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkEvent = async () => {
    if (hasImportedRounds) {
      toast.error(
        "Não é possível desvincular um evento que já possui rodadas importadas.",
      );
      return;
    }
    if (
      !confirm("Isso removerá todas as rodadas pendentes dessa etapa. Continuar?")
    ) {
      return;
    }
    try {
      setIsUnlinking(true);
      setLinkFeedback(null);
      const result = await unlinkApiEvent(race.id);
      if (result.success) {
        setLinkedEventId(null);
        setLinkFeedback({
          type: "success",
          message: "Evento desvinculado com sucesso.",
        });
        toast.success("Evento desvinculado com sucesso");
        setEventId("");
        router.refresh();
      } else {
        setLinkFeedback({
          type: "error",
          message: result.error || "Erro ao desvincular evento.",
        });
        toast.error(result.error || "Erro ao desvincular evento");
      }
    } catch {
      setLinkFeedback({
        type: "error",
        message: "Erro inesperado ao tentar desvincular o evento.",
      });
      toast.error("Erro inesperado");
    } finally {
      setIsUnlinking(false);
    }
  };

  const openImportModal = () => {
    const allowedUuids = new Set(bonusCandidates.map((candidate) => candidate.uuid));
    const initialDraft: Record<string, string> = {};
    for (const bonus of existingRaceBonuses) {
      if (!allowedUuids.has(bonus.driverUuid)) continue;
      initialDraft[bonus.driverUuid] = String(bonus.points);
    }

    setImportBonusDraftByUuid(initialDraft);
    setImportBonusReason(existingRaceBonuses[0]?.reason ?? "");
    setImportBonusSearch("");
    setShowBonusConfig(false);
    setIsImportModalOpen(true);
  };

  const handleImport = async () => {
    try {
      const bonusEntries: Array<{ driverUuid: string; points: number }> = [];
      for (const candidate of bonusCandidates) {
        const driverUuid = candidate.uuid;
        const value = importBonusDraftByUuid[driverUuid] ?? "";
        const trimmed = value.trim();
        if (!trimmed) continue;

        if (!/^-?\d+$/.test(trimmed)) {
          toast.error("Bônus deve ser um número inteiro");
          return;
        }

        bonusEntries.push({
          driverUuid,
          points: Number.parseInt(trimmed, 10),
        });
      }

      setIsImportingResults(true);

      const result = await importRaceResults(race.id, {
        bonuses: bonusEntries,
        reason: importBonusReason.trim() || undefined,
      });
      if (result.success) {
        const payload = (result.data ?? {
          importedCount: 0,
          skippedCount: 0,
        }) as ImportRaceResultsPayload;
        const { importedCount, skippedCount } = payload;
        const appliedBonusCount = bonusEntries.length;
        toast.success(
          `${importedCount} rodada(s) importada(s) com sucesso!${skippedCount > 0 ? ` (${skippedCount} ignorada(s))` : ""}${appliedBonusCount > 0 ? ` • ${appliedBonusCount} bônus aplicado(s)` : ""}`,
        );
        setIsImportModalOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || "Erro ao importar resultados");
      }
    } catch {
      toast.error("Erro inesperado ao importar");
    } finally {
      setIsImportingResults(false);
    }
  };

  const handleCreateManualFinalRound = async () => {
    try {
      setIsCreatingManualFinalRound(true);
      const response = await createManualFinalRound({ raceId: race.id });
      if (!response.success) {
        toast.error(response.error || "Erro ao criar round final manual");
        return;
      }

      toast.success(
        `Round manual criado: ${response.data?.apiRoundName ?? "Manual Final"}`,
      );
      router.refresh();
    } catch {
      toast.error("Erro inesperado ao criar round manual");
    } finally {
      setIsCreatingManualFinalRound(false);
    }
  };

  const handleManualDriverDraftChange = (
    roundId: string,
    field: "uuid" | "name",
    value: string,
  ) => {
    setManualDriverDraftByRound((prev) => ({
      ...prev,
      [roundId]: {
        uuid: prev[roundId]?.uuid ?? "",
        name: prev[roundId]?.name ?? "",
        [field]: value,
      },
    }));
    setManualDriverSearchRoundId(roundId);
  };

  const handleSelectManualDriverSuggestion = (
    roundId: string,
    suggestion: DriverSuggestion,
  ) => {
    setManualDriverDraftByRound((prev) => ({
      ...prev,
      [roundId]: {
        uuid: suggestion.uuid,
        name: suggestion.currentName ?? suggestion.uuid,
      },
    }));
    setManualDriverSuggestionsOpenByRound((prev) => ({ ...prev, [roundId]: false }));
    setManualDriverSuggestionIndexByRound((prev) => ({ ...prev, [roundId]: -1 }));
  };

  const handleManualDriverSuggestionKeyDown = (
    roundId: string,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const suggestions = manualDriverSuggestionsByRound[roundId] ?? [];
    const isOpen = manualDriverSuggestionsOpenByRound[roundId] ?? false;
    const selectedIndex = manualDriverSuggestionIndexByRound[roundId] ?? -1;

    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setManualDriverSuggestionIndexByRound((prev) => ({
        ...prev,
        [roundId]: Math.min(selectedIndex + 1, suggestions.length - 1),
      }));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setManualDriverSuggestionIndexByRound((prev) => ({
        ...prev,
        [roundId]: Math.max(selectedIndex - 1, -1),
      }));
      return;
    }

    if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectManualDriverSuggestion(roundId, suggestions[selectedIndex]);
      return;
    }

    if (e.key === "Escape") {
      setManualDriverSuggestionsOpenByRound((prev) => ({ ...prev, [roundId]: false }));
    }
  };

  const handleAddManualRoundDriver = async (roundId: string) => {
    const draft = manualDriverDraftByRound[roundId] ?? { uuid: "", name: "" };
    const uuid = draft.uuid.trim();
    const name = draft.name.trim();

    if (!uuid || !name) {
      toast.error("Informe UUID e nome do piloto");
      return;
    }

    try {
      setSavingManualDriverRoundId(roundId);
      const response = await addManualRoundDriver({
        eventRoundId: roundId,
        uuid,
        name,
      });

      if (!response.success) {
        toast.error(response.error || "Erro ao adicionar piloto");
        return;
      }

      toast.success("Piloto adicionado ao round manual");
      setManualDriverDraftByRound((prev) => ({
        ...prev,
        [roundId]: { uuid: "", name: "" },
      }));
      setManualDriverSuggestionsByRound((prev) => ({ ...prev, [roundId]: [] }));
      setManualDriverSuggestionsOpenByRound((prev) => ({ ...prev, [roundId]: false }));
      setManualDriverSuggestionIndexByRound((prev) => ({ ...prev, [roundId]: -1 }));
      router.refresh();
    } catch {
      toast.error("Erro inesperado ao adicionar piloto");
    } finally {
      setSavingManualDriverRoundId(null);
    }
  };

  const handleToggleDisqualification = async (
    resultId: string,
    isCurrentlyDisqualified: boolean,
  ) => {
    try {
      setUpdatingDsqResultId(resultId);
      const response = await setRoundResultDisqualification(
        resultId,
        !isCurrentlyDisqualified,
      );

      if (response.success) {
        toast.success(
          isCurrentlyDisqualified
            ? "Desqualificação removida e pontos recalculados"
            : "Piloto desqualificado e pontos compensados",
        );
        router.refresh();
      } else {
        toast.error(response.error || "Erro ao atualizar desqualificação");
      }
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setUpdatingDsqResultId(null);
    }
  };

  const handleToggleFastestLap = async (
    resultId: string,
    isCurrentlyFastestLap: boolean,
  ) => {
    try {
      setUpdatingFastestResultId(resultId);
      const response = await setRoundResultFastestLap(resultId, !isCurrentlyFastestLap);

      if (response.success) {
        toast.success(
          isCurrentlyFastestLap
            ? "Bônus de volta rápida removido"
            : "Bônus de volta rápida aplicado",
        );
        router.refresh();
      } else {
        toast.error(response.error || "Erro ao atualizar volta rápida");
      }
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setUpdatingFastestResultId(null);
    }
  };

  const startEditFinalRound = (roundId: string, results: ImportedResult[]) => {
    const savedRoundPositions = savedFinalRoundPositionsByRound[roundId] ?? {};
    const draft: Record<string, number> = {};
    for (const result of results) {
      draft[result.id] = savedRoundPositions[result.id] ?? result.position;
    }
    setFinalRoundPositionDraft(draft);
    setFinalRoundReason("");
    setEditingFinalRoundId(roundId);
  };

  const handleCancelFinalRoundEdits = () => {
    setEditingFinalRoundId(null);
    setFinalRoundPositionDraft({});
    setFinalRoundReason("");
  };

  const handleSaveFinalRoundEdits = async (roundId: string) => {
    const positions = Object.entries(finalRoundPositionDraft).map(
      ([roundResultId, position]) => ({ roundResultId, position }),
    );

    if (positions.length === 0) {
      toast.error("Nenhuma posição para salvar");
      return;
    }

    const hasInvalid = positions.some(
      (item) => !Number.isInteger(item.position) || item.position < 1,
    );
    if (hasInvalid) {
      toast.error("Todas as posições devem ser inteiros maiores que zero");
      return;
    }

    const hasDuplicate =
      new Set(positions.map((item) => item.position)).size !== positions.length;
    if (hasDuplicate) {
      toast.error("Não é permitido repetir posições");
      return;
    }

    try {
      setSavingFinalRoundId(roundId);
      const response = await applyManualFinalRoundPositions({
        eventRoundId: roundId,
        reason: finalRoundReason.trim() || undefined,
        positions,
      });

      if (!response.success) {
        toast.error(response.error || "Erro ao salvar edição manual");
        return;
      }

      setSavedFinalRoundPositionsByRound((prev) => ({
        ...prev,
        [roundId]: Object.fromEntries(
          Object.entries(finalRoundPositionDraft).map(([resultId, position]) => [
            resultId,
            position,
          ]),
        ),
      }));
      toast.success("Posições finais atualizadas e classificação recalculada");
      setEditingFinalRoundId(null);
      setFinalRoundPositionDraft({});
      setFinalRoundReason("");
      router.refresh();
    } catch {
      toast.error("Erro inesperado ao salvar edição manual");
    } finally {
      setSavingFinalRoundId(null);
    }
  };

  const moveFinalRoundPosition = (
    roundId: string,
    results: ImportedResult[],
    roundResultId: string,
    direction: "up" | "down",
  ) => {
    const savedRoundPositions = savedFinalRoundPositionsByRound[roundId] ?? {};
    const ordered = results
      .map((result) => ({
        id: result.id,
        position:
          finalRoundPositionDraft[result.id] ??
          savedRoundPositions[result.id] ??
          result.position,
      }))
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

    const currentIndex = ordered.findIndex((item) => item.id === roundResultId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;

    const current = ordered[currentIndex];
    const target = ordered[targetIndex];

    setFinalRoundPositionDraft((prev) => ({
      ...prev,
      [current.id]: target.position,
      [target.id]: current.position,
    }));
  };

  const handleSpecialRoundChange = async (
    round: EventRoundClient,
    value: "NONE" | "SPRINT_CLASSIFICATION" | "SPRINT_POINTS",
  ) => {
    const loadingToastId = toast.loading("Atualizando tipo da rodada...");

    try {
      setUpdatingSpecialRoundId(round.id);

      if (value === "NONE") {
        const response = await configureRound(round.id, {
          specialType: "NONE",
          sprintMode: null,
        });

        if (!response.success) {
          toast.dismiss(loadingToastId);
          toast.error(response.error || "Erro ao atualizar tipo da rodada");
          return;
        }

        toast.dismiss(loadingToastId);
        toast.success("Rodada definida como normal");
        startRefreshTransition(() => {
          router.refresh();
        });
        return;
      }

      const sprintMode =
        value === "SPRINT_POINTS" ? "POINTS" : "CLASSIFICATION";
      const response = await configureRound(round.id, {
        specialType: "SPRINT",
        sprintMode,
      });

      if (!response.success) {
        toast.dismiss(loadingToastId);
        toast.error(response.error || "Erro ao atualizar sprint");
        return;
      }

      toast.dismiss(loadingToastId);
      toast.success(
        sprintMode === "POINTS"
          ? "Rodada marcada como sprint pontuavel"
          : "Rodada marcada como sprint classificatoria",
      );
      startRefreshTransition(() => {
        router.refresh();
      });
    } catch {
      toast.dismiss(loadingToastId);
      toast.error("Erro inesperado");
    } finally {
      setUpdatingSpecialRoundId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Season inactive warning */}
      {isAdmin && !isSeasonActive && (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl text-sm text-yellow-400">
          <span className="shrink-0 text-yellow-500">⚠</span>
          <span>
            {seasonStatus === "DRAFT"
              ? "Ative a temporada para vincular eventos e registrar resultados."
              : "Esta temporada não está ativa. Apenas visualização disponível."}
          </span>
        </div>
      )}

      {isRefreshing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/70 text-xs text-zinc-400 w-fit">
          <RefreshCw size={12} className="animate-spin" />
          Atualizando dados da corrida...
        </div>
      )}

      {isAdmin && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-200 font-medium">Reverse Grid</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Aplica pontos da qualificação (round mais recente) nesta corrida.
            </p>
            {!seasonReverseGridEnabled && (
              <p className="text-[11px] text-zinc-600 mt-1">
                Habilite o reverse grid nas configurações da temporada para ativar este toggle.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleReverseGrid}
            disabled={!canToggleReverseGrid || isUpdatingReverseGridFlag}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
              isReverseGridActive
                ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                : "bg-zinc-900 border-zinc-700 text-zinc-400"
            }`}
          >
            {isUpdatingReverseGridFlag
              ? "Salvando..."
              : isReverseGridActive
                ? "Ativado"
                : "Desativado"}
          </button>
        </div>
      )}

      {isAdmin && isSeasonActive && isSlotMulliganMode && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white font-mono">
              Roster da Corrida (Slots + Mulligans)
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Defina até 3 principais e até 2 reservas por equipe. Somente pilotos
              que participam da QUALIFICATION serão elegíveis.
            </p>
          </div>

          <div className="space-y-4">
            {(slotRosterConfig?.teams ?? []).map((team) => {
              const draft = rosterDraft[team.teamId] ?? {
                mainDriverIds: [],
                reserveDriverIds: [],
              };

              const rosterWarning =
                draft.mainDriverIds.length < 3
                  ? "Recomendado: cadastrar 3 principais para evitar slots com 0"
                  : null;

              return (
                <div
                  key={team.teamId}
                  className="border border-zinc-800 rounded-xl overflow-hidden"
                >
                  <div className="px-4 py-3 bg-zinc-950/50 border-b border-zinc-800 flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{team.teamName}</p>
                      <p className="text-xs text-zinc-500">{getRosterBaseLabel(team)}</p>
                      <p className="text-xs text-zinc-500">
                        Ultima edicao: {formatRosterUpdatedAt(team.lastRosterUpdatedAt)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Main: {draft.mainDriverIds.length}/3 • Reserve: {draft.reserveDriverIds.length}/2
                      </p>
                      {rosterWarning && (
                        <p className="text-xs text-yellow-400 mt-1">{rosterWarning}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => openRosterRoundModal(team.teamId)}
                      disabled={savingRosterTeamId === team.teamId}
                      className="px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 rounded-lg text-xs font-semibold disabled:opacity-50"
                    >
                      {savingRosterTeamId === team.teamId ? "Salvando..." : "Salvar roster"}
                    </button>
                  </div>

                  <div className="divide-y divide-zinc-800/60">
                    {team.drivers.map((driver) => {
                      const isMain = draft.mainDriverIds.includes(driver.id);
                      const isReserve = draft.reserveDriverIds.includes(driver.id);
                      const canSelectMain =
                        isMain || draft.mainDriverIds.length < 3;
                      const canSelectReserve =
                        isReserve || draft.reserveDriverIds.length < 2;

                      return (
                        <div
                          key={driver.id}
                          className="px-4 py-2.5 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={`https://minotar.net/helm/${driver.uuid}/24.png`}
                              alt={driver.currentName || "Driver"}
                              className="w-6 h-6 rounded"
                            />
                            <span className="text-sm text-zinc-200 truncate">
                              {driver.currentName || driver.uuid.slice(0, 8)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleRosterDriver(team.teamId, driver.id, "main")}
                              disabled={!canSelectMain}
                              title={
                                !canSelectMain
                                  ? "Limite de 3 pilotos MAIN atingido"
                                  : undefined
                              }
                              className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                                isMain
                                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                                  : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              MAIN
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                toggleRosterDriver(team.teamId, driver.id, "reserve")
                              }
                              disabled={!canSelectReserve}
                              title={
                                !canSelectReserve
                                  ? "Limite de 2 pilotos RESERVE atingido"
                                  : undefined
                              }
                              className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                                isReserve
                                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                                  : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              RESERVE
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FrostHex Integration */}
      {isAdmin && isSeasonActive && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white font-mono">
                Integração FrostHex
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                Vincule o ID do evento para importar dados e resultados das
                rodadas automaticamente.
              </p>
              {isLinked && (
                <p className="text-xs text-cyan-400 mt-2 font-mono">
                  Evento vinculado: {linkedEventId}
                </p>
              )}
              {existingRaceBonuses.length > 0 && (
                <p className="text-xs text-amber-300 mt-1 font-mono">
                  Bônus ativos: {existingRaceBonuses.length}
                </p>
              )}
              {linkFeedback && (
                <p
                  className={`text-xs mt-2 font-medium ${
                    linkFeedback.type === "success"
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {linkFeedback.message}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                placeholder="Ex: FC2-25-R1-Australia"
                value={eventId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEventId(e.target.value)
                }
                disabled={isLinked || isLinking}
                className="w-[220px] h-10 px-3 bg-zinc-950 border border-zinc-800 rounded-md focus-visible:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-white text-sm"
              />
              {!isLinked ? (
                <button
                  type="button"
                  onClick={handleLinkEvent}
                  disabled={isLinking || !eventId.trim()}
                  className="bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold h-10 px-4 rounded-md flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  {isLinking ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Link2 size={16} className="mr-2" />
                      Vincular
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleUnlinkEvent}
                  disabled={isUnlinking || hasImportedRounds}
                  title={
                    hasImportedRounds
                      ? "Não é possível desvincular evento com rodadas importadas"
                      : "Desvincular evento"
                  }
                  className="border border-zinc-700 bg-transparent text-red-400 hover:text-red-300 hover:bg-red-500/10 h-10 px-4 rounded-md flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  {isUnlinking ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Unlink size={16} className="mr-2" />
                      Desvincular
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {nonParticipatingDriverBonuses.length > 0 && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-300 font-mono">
                Bônus Sem Participação na Corrida
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Pilotos abaixo não aparecem nos resultados da corrida, mas recebem bônus na classificação.
              </p>
            </div>
            <span className="text-xs font-mono text-amber-300 border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 rounded-full">
              {nonParticipatingDriverBonuses.length} bônus
            </span>
          </div>

          <div className="divide-y divide-zinc-800/60">
            {nonParticipatingDriverBonuses.map((bonus) => (
              <div key={bonus.driverUuid} className="px-6 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-100 truncate">{bonus.driverName}</p>
                  <p className="text-[11px] text-zinc-500 font-mono truncate">{bonus.driverUuid}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold font-mono ${bonus.points >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {bonus.points >= 0 ? `+${bonus.points}` : bonus.points}
                  </p>
                  {bonus.reason && (
                    <p className="text-[11px] text-zinc-500 truncate max-w-[240px]">{bonus.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unregistered players */}
      {isAdmin && unregisteredPlayers.length > 0 && (
        <div className="bg-zinc-900 border border-orange-500/20 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <Users size={16} className="text-orange-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {unregisteredPlayers.length} piloto
                  {unregisteredPlayers.length > 1 ? "s" : ""} não registrado
                  {unregisteredPlayers.length > 1 ? "s" : ""}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Registre-os para que sejam incluídos na importação dos resultados
                </p>
              </div>
            </div>
            <button
              onClick={handleRegisterAll}
              disabled={isRegisteringAll}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              {isRegisteringAll ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <UserPlus size={12} />
              )}
              Registrar todos
            </button>
          </div>

          <div className="divide-y divide-zinc-800/50">
            {isRegisteringAll && registerAllProgress.total > 0 && (
              <div className="px-5 py-3 bg-zinc-950/70 border-b border-zinc-800/70">
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className="text-zinc-400">Registrando pilotos...</span>
                  <span className="text-orange-300">
                    {registerAllProgress.current}/{registerAllProgress.total}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 transition-all duration-200"
                    style={{
                      width: `${
                        registerAllProgress.total > 0
                          ? (registerAllProgress.current / registerAllProgress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}
            {unregisteredPlayers.map((p) => (
              <div
                key={p.uuid}
                className="flex items-center justify-between px-5 py-3 hover:bg-zinc-800/20 transition-colors"
              >
                <div>
                  <p className="text-sm text-white font-medium">{p.name}</p>
                  <p className="text-xs text-zinc-600 font-mono mt-0.5">
                    {p.uuid}
                  </p>
                </div>
                <button
                  onClick={() => handleRegisterOne(p.uuid, p.name)}
                  disabled={
                    registeringUuid === p.uuid || isRegisteringAll
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
                >
                  {registeringUuid === p.uuid ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <UserPlus size={12} />
                  )}
                  Registrar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rounds Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white font-mono">
              Rodadas do Evento
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Clique em uma rodada para ver os resultados.
            </p>
          </div>

          {isAdmin && isSeasonActive && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreateManualFinalRound}
                disabled={!canCreateManualFinalRound || isCreatingManualFinalRound}
                title={
                  !canCreateManualFinalRound
                    ? "É necessário ter ao menos uma qualificação com dados disponíveis"
                    : undefined
                }
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                <Zap size={16} />
                {isCreatingManualFinalRound
                  ? "Criando..."
                  : "Criar round final manual"}
              </button>

              {isLinked && race.eventRounds.length > 0 && (
                <button
                  onClick={openImportModal}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-zinc-950 font-semibold rounded-xl transition-colors"
                >
                  <Download size={16} />
                  {hasImportedRounds && !hasConfiguredRounds
                    ? "Reimportar + Bônus"
                    : "Importar + Bônus"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-400 bg-zinc-900/50 uppercase font-mono border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4 font-medium">Sessão</th>
                <th className="px-6 py-4 font-medium">Bateria</th>
                <th className="px-6 py-4 font-medium">Pilotos</th>
                <th className="px-6 py-4 font-medium">Tipo especial</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-center" title="Conta para a classificação">Pontos</th>
                <th className="px-6 py-4 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {race.eventRounds.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-zinc-500"
                  >
                    Nenhuma rodada encontrada.{" "}
                    {isLinked ? "Vincule novamente o evento." : "Vincule um evento acima."}
                  </td>
                </tr>
              ) : (
                race.eventRounds.map((round) => {
                  const isExpanded = expandedRounds.has(round.id);
                  const isRoundFinal =
                    isFinalRound(round) || isManualFinalRound(round);
                  const results = round.results ?? [];
                  const savedRoundPositions =
                    savedFinalRoundPositionsByRound[round.id] ?? {};
                  const editOrder =
                    editingFinalRoundId === round.id
                      ? results
                          .map((result) => ({
                            id: result.id,
                            position:
                              finalRoundPositionDraft[result.id] ??
                              savedRoundPositions[result.id] ??
                              result.position,
                          }))
                          .sort(
                            (a, b) =>
                              a.position - b.position ||
                              a.id.localeCompare(b.id),
                          )
                      : [];
                  const resultsById = new Map(results.map((result) => [result.id, result]));
                  const displayResults =
                    editingFinalRoundId === round.id
                      ? editOrder
                          .map((item) => resultsById.get(item.id))
                          .filter((result): result is ImportedResult => Boolean(result))
                      : results;

                  const previewResults = roundPreviewByName[round.apiRoundName] ?? [];
                  const driverCount =
                    results.length || previewResults.length || 0;
                  const canExpand = driverCount > 0;

                  return (
                    <Fragment key={round.id}>
                      <tr
                        onClick={() => canExpand && toggleRound(round.id)}
                        className={`transition-colors ${round.countsForStandings ? "hover:bg-zinc-800/20" : "opacity-50 hover:opacity-70"} ${canExpand ? "cursor-pointer" : ""}`}
                      >
                        <td className="px-6 py-4 text-white font-mono font-medium">
                          <div className="flex items-center gap-2">
                            <span>{round.apiRoundName}</span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border ${
                                round.origin === "MANUAL"
                                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                                  : "border-zinc-700 bg-zinc-800/60 text-zinc-400"
                              }`}
                            >
                              {round.origin === "MANUAL" ? "Manual" : "API"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-300">
                          {round.targetHeatName || (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-zinc-400 font-mono text-xs">
                          {driverCount > 0 ? `${driverCount} pilotos` : "—"}
                        </td>
                        <td className="px-6 py-4">
                          {isAdmin && isSeasonActive ? (
                            <select
                              value={
                                round.specialType === "SPRINT"
                                  ? round.sprintMode === "POINTS"
                                    ? "SPRINT_POINTS"
                                    : "SPRINT_CLASSIFICATION"
                                  : "NONE"
                              }
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                handleSpecialRoundChange(
                                  round,
                                  e.target.value as
                                    | "NONE"
                                    | "SPRINT_CLASSIFICATION"
                                    | "SPRINT_POINTS",
                                )
                              }
                              disabled={updatingSpecialRoundId === round.id}
                              className="h-8 px-2 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-200"
                            >
                              <option value="NONE">Normal</option>
                              <option value="SPRINT_CLASSIFICATION">
                                Sprint - Classificatoria
                              </option>
                              <option value="SPRINT_POINTS">
                                Sprint - Pontuavel
                              </option>
                            </select>
                          ) : round.specialType === "SPRINT" ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] uppercase tracking-wider border border-purple-500/30 bg-purple-500/10 text-purple-300">
                              {getSprintModeLabel(round.sprintMode)}
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-xs">Normal</span>
                          )}
                          {updatingSpecialRoundId === round.id && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-zinc-400">
                              <RefreshCw size={10} className="animate-spin" />
                              Salvando
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <RoundStatusBadge status={round.status} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isAdmin && isSeasonActive ? (
                            <button
                              onClick={(e) =>
                                handleToggleCounts(
                                  e,
                                  round.id,
                                  round.countsForStandings,
                                )
                              }
                              disabled={
                                togglingRound === round.id ||
                                round.specialType === "SPRINT"
                              }
                              title={
                                  round.specialType === "SPRINT"
                                    ? "Controlado pelo modo sprint"
                                    : round.countsForStandings
                                      ? "Clique para excluir dos pontos"
                                      : "Clique para incluir nos pontos"
                              }
                              className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {togglingRound === round.id ? (
                                <RefreshCw size={14} className="animate-spin text-zinc-500" />
                              ) : round.countsForStandings ? (
                                <Trophy size={14} className="text-yellow-400" />
                              ) : (
                                <Trophy size={14} className="text-zinc-600" />
                              )}
                            </button>
                          ) : (
                            <Trophy
                              size={14}
                              className={`mx-auto ${round.countsForStandings ? "text-yellow-400" : "text-zinc-700"}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-4 text-zinc-500">
                          {canExpand &&
                            (isExpanded ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronRight size={16} />
                            ))}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-0 py-0 border-t border-zinc-800/50"
                          >
                            <div className="bg-zinc-950/40">
                              {isAdmin &&
                                isSeasonActive &&
                                isManualFinalRound(round) && (
                                  <div className="px-6 py-3 border-b border-zinc-800/60 flex flex-wrap items-center gap-2">
                                    <input
                                      type="text"
                                      value={manualDriverDraftByRound[round.id]?.uuid ?? ""}
                                      onChange={(e) =>
                                        handleManualDriverDraftChange(
                                          round.id,
                                          "uuid",
                                          e.target.value,
                                        )
                                      }
                                      onFocus={() => {
                                        const hasSuggestions =
                                          (manualDriverSuggestionsByRound[round.id]?.length ?? 0) > 0;
                                        if (hasSuggestions) {
                                          setManualDriverSuggestionsOpenByRound((prev) => ({
                                            ...prev,
                                            [round.id]: true,
                                          }));
                                        }
                                      }}
                                      onBlur={() => {
                                        setTimeout(() => {
                                          setManualDriverSuggestionsOpenByRound((prev) => ({
                                            ...prev,
                                            [round.id]: false,
                                          }));
                                        }, 120);
                                      }}
                                      onKeyDown={(e) =>
                                        handleManualDriverSuggestionKeyDown(round.id, e)
                                      }
                                      placeholder="UUID do piloto"
                                      className="h-8 px-3 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 min-w-[220px]"
                                    />
                                    <div className="relative min-w-[240px]">
                                      <input
                                        type="text"
                                        value={manualDriverDraftByRound[round.id]?.name ?? ""}
                                        onChange={(e) =>
                                          handleManualDriverDraftChange(
                                            round.id,
                                            "name",
                                            e.target.value,
                                          )
                                        }
                                        onFocus={() => {
                                          const hasSuggestions =
                                            (manualDriverSuggestionsByRound[round.id]?.length ?? 0) > 0;
                                          if (hasSuggestions) {
                                            setManualDriverSuggestionsOpenByRound((prev) => ({
                                              ...prev,
                                              [round.id]: true,
                                            }));
                                          }
                                        }}
                                        onBlur={() => {
                                          setTimeout(() => {
                                            setManualDriverSuggestionsOpenByRound((prev) => ({
                                              ...prev,
                                              [round.id]: false,
                                            }));
                                          }, 120);
                                        }}
                                        onKeyDown={(e) =>
                                          handleManualDriverSuggestionKeyDown(round.id, e)
                                        }
                                        placeholder="Nome do piloto"
                                        className="h-8 px-3 pr-8 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 w-full"
                                      />
                                      {manualDriverLoadingByRound[round.id] && (
                                        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 animate-spin" />
                                      )}

                                      {(manualDriverSuggestionsOpenByRound[round.id] ?? false) &&
                                        (manualDriverSuggestionsByRound[round.id]?.length ?? 0) > 0 && (
                                          <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl overflow-hidden">
                                            {(manualDriverSuggestionsByRound[round.id] ?? []).map(
                                              (suggestion, index) => {
                                                const selectedIndex =
                                                  manualDriverSuggestionIndexByRound[round.id] ?? -1;
                                                return (
                                                  <button
                                                    key={suggestion.id}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() =>
                                                      handleSelectManualDriverSuggestion(
                                                        round.id,
                                                        suggestion,
                                                      )
                                                    }
                                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                                                      index === selectedIndex
                                                        ? "bg-cyan-500/10 text-cyan-200"
                                                        : "text-zinc-200 hover:bg-zinc-800"
                                                    }`}
                                                  >
                                                    <span className="truncate">
                                                      {suggestion.currentName ?? suggestion.uuid}
                                                    </span>
                                                    <span className="text-zinc-500 font-mono text-[10px] truncate max-w-[120px]">
                                                      {suggestion.uuid}
                                                    </span>
                                                  </button>
                                                );
                                              },
                                            )}
                                          </div>
                                        )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleAddManualRoundDriver(round.id)}
                                      disabled={savingManualDriverRoundId === round.id}
                                      className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md disabled:opacity-50"
                                    >
                                      {savingManualDriverRoundId === round.id
                                        ? "Adicionando..."
                                        : "Adicionar piloto"}
                                    </button>
                                  </div>
                                )}

                              {isAdmin && isSeasonActive && isRoundFinal && results.length > 0 && (
                                <div className="px-6 py-3 border-b border-zinc-800/60 flex flex-wrap items-center gap-2 justify-between">
                                  <div className="text-xs text-zinc-400">
                                    {isManualFinalRound(round)
                                      ? "Edição manual do round final manual"
                                      : "Edição manual do round final (manual sempre vence em reimportações)"}
                                  </div>
                                  {editingFinalRoundId === round.id ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={finalRoundReason}
                                        onChange={(e) => setFinalRoundReason(e.target.value)}
                                        placeholder="Motivo da edição (opcional)"
                                        className="h-8 px-3 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 min-w-[220px]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleSaveFinalRoundEdits(round.id)}
                                        disabled={savingFinalRoundId === round.id}
                                        className="h-8 px-3 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-zinc-950 text-xs font-semibold rounded-md"
                                      >
                                        {savingFinalRoundId === round.id ? "Salvando..." : "Salvar"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleCancelFinalRoundEdits}
                                        disabled={savingFinalRoundId === round.id}
                                        className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => startEditFinalRound(round.id, results)}
                                      className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md"
                                    >
                                      Editar posições finais
                                    </button>
                                  )}
                                </div>
                              )}

                              {results.length > 0 ? (
                                // Imported results with points
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-zinc-800/60">
                                      <th className="px-8 py-2.5 text-left text-zinc-500 font-mono uppercase">
                                        Pos
                                      </th>
                                      <th className="px-4 py-2.5 text-left text-zinc-500 font-mono uppercase">
                                        Piloto
                                      </th>
                                      <th className="px-4 py-2.5 text-left text-zinc-500 font-mono uppercase">
                                        Tempo
                                      </th>
                                      <th className="px-4 py-2.5 text-right text-zinc-500 font-mono uppercase pr-8">
                                        Pts
                                      </th>
                                      {isAdmin && isSeasonActive && (
                                        <th className="px-4 py-2.5 text-right text-zinc-500 font-mono uppercase pr-8">
                                          Ações
                                        </th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {displayResults.map((r, visualIndex) => {
                                      const currentDraftPosition =
                                        finalRoundPositionDraft[r.id] ??
                                        savedRoundPositions[r.id] ??
                                        r.position;
                                      const canMoveUp =
                                        editingFinalRoundId === round.id
                                          ? visualIndex > 0
                                          : false;
                                      const canMoveDown =
                                        editingFinalRoundId === round.id
                                          ? visualIndex < displayResults.length - 1
                                          : false;
                                      const reverseGridPoints =
                                        reverseGridDisplay?.enabled &&
                                        round.id ===
                                          reverseGridDisplay.displayRoundId &&
                                        r.driver?.id
                                          ? (reverseGridDisplay.pointsByDriverId[
                                              r.driver.id
                                            ] ?? 0)
                                          : 0;
                                      const totalDisplayedPoints =
                                        r.points + reverseGridPoints;
                                      const raceBonusPoints =
                                        isRoundFinal && r.driver?.uuid
                                          ? (bonusPointsByDriverUuid.get(r.driver.uuid) ?? 0)
                                          : 0;
                                      const finalPointsWithBonus =
                                        totalDisplayedPoints + raceBonusPoints;

                                      return (
                                      <tr
                                        key={r.id}
                                        className={`border-b border-zinc-800/20 hover:bg-zinc-800/10 ${r.disqualified ? "bg-red-500/5" : ""}`}
                                      >
                                        <td className="px-8 py-2 font-mono font-bold text-cyan-400">
                                          {r.disqualified ? (
                                            <span className="text-red-400">DSQ</span>
                                          ) : editingFinalRoundId === round.id && isRoundFinal ? (
                                            <div className="inline-flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  moveFinalRoundPosition(
                                                    round.id,
                                                    results,
                                                    r.id,
                                                    "up",
                                                  )
                                                }
                                                disabled={!canMoveUp}
                                                className="h-7 w-7 inline-flex items-center justify-center bg-zinc-900 border border-zinc-700 rounded text-zinc-300 hover:text-cyan-300 disabled:opacity-40"
                                                title="Mover para cima"
                                              >
                                                <ArrowUp size={12} />
                                              </button>
                                              <span className="inline-flex items-center justify-center min-w-[52px] h-7 px-2 bg-zinc-900 border border-zinc-700 rounded text-cyan-300 text-center">
                                                #{currentDraftPosition}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  moveFinalRoundPosition(
                                                    round.id,
                                                    results,
                                                    r.id,
                                                    "down",
                                                  )
                                                }
                                                disabled={!canMoveDown}
                                                className="h-7 w-7 inline-flex items-center justify-center bg-zinc-900 border border-zinc-700 rounded text-zinc-300 hover:text-cyan-300 disabled:opacity-40"
                                                title="Mover para baixo"
                                              >
                                                <ArrowDown size={12} />
                                              </button>
                                            </div>
                                          ) : (
                                            `#${savedRoundPositions[r.id] ?? r.position}`
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-zinc-200">
                                          <span>
                                            {r.driver?.currentName ??
                                              r.driver?.uuid ??
                                              "?"}
                                          </span>
                                          {raceBonusPoints !== 0 && (
                                            <span
                                              className={`ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                                raceBonusPoints > 0
                                                  ? "border-green-500/30 text-green-300 bg-green-500/10"
                                                  : "border-red-500/30 text-red-300 bg-red-500/10"
                                              }`}
                                              title="Bônus manual aplicado nesta corrida"
                                            >
                                              Bônus {raceBonusPoints > 0 ? `+${raceBonusPoints}` : raceBonusPoints}
                                            </span>
                                          )}
                                          {r.manualPositionOverride !== null &&
                                            r.manualPositionOverride !== undefined && (
                                              <span
                                                className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-300 bg-cyan-500/10"
                                                title={
                                                  r.manualEditReason
                                                    ? `Motivo: ${r.manualEditReason}`
                                                    : undefined
                                                }
                                              >
                                                Manual
                                              </span>
                                            )}
                                          {r.manualEditedAt && (
                                            <div className="text-[10px] text-zinc-500 mt-0.5">
                                              Editado em {formatManualEditAt(r.manualEditedAt)}
                                              {r.manualPreviousPosition &&
                                              r.manualOriginalPosition &&
                                              r.manualPreviousPosition !==
                                                r.manualOriginalPosition
                                                ? ` (orig #${r.manualOriginalPosition})`
                                                : ""}
                                            </div>
                                          )}
                                          {r.disqualified && (
                                            <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 bg-red-500/10">
                                              Desqualificado
                                            </span>
                                          )}
                                          {r.fastestLap && (
                                            <span className="relative inline-flex items-center group/fastlap">
                                              <Zap
                                                size={12}
                                                className="inline ml-1.5 text-purple-400"
                                              />
                                              <span className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover/fastlap:opacity-100">
                                                {r.fastestLapTime && r.fastestLapTime > 0
                                                  ? `Volta mais rápida: ${formatTime(r.fastestLapTime)}`
                                                  : "Volta mais rápida"}
                                              </span>
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 font-mono text-zinc-500">
                                          {r.finishTimeMs
                                            ? formatTime(r.finishTimeMs)
                                            : "—"}
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono font-bold text-yellow-400 pr-8">
                                          {reverseGridPoints > 0 || raceBonusPoints !== 0 ? (
                                            <div className="inline-flex items-center gap-2">
                                              <span>{finalPointsWithBonus}</span>
                                              <span className="text-[10px] font-normal text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 rounded px-1.5 py-0.5">
                                                {r.points}
                                                {reverseGridPoints > 0 ? ` + RG ${reverseGridPoints}` : ""}
                                                {raceBonusPoints !== 0
                                                  ? ` ${raceBonusPoints > 0 ? "+" : "-"} Bonus ${Math.abs(raceBonusPoints)}`
                                                  : ""}
                                              </span>
                                            </div>
                                          ) : (
                                            r.points
                                          )}
                                        </td>
                                        {isAdmin && isSeasonActive && (
                                          <td className="px-4 py-2 text-right pr-8">
                                            <div className="inline-flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleToggleFastestLap(r.id, !!r.fastestLap)
                                                }
                                                disabled={updatingFastestResultId === r.id}
                                                className={`h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                                                  r.fastestLap
                                                    ? "border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                                                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                                                }`}
                                                title={
                                                  r.fastestLap
                                                    ? "Remover volta mais rápida"
                                                    : "Marcar volta mais rápida"
                                                }
                                              >
                                                {updatingFastestResultId === r.id ? (
                                                  <Loader2 size={12} className="animate-spin" />
                                                ) : (
                                                  <Zap size={12} />
                                                )}
                                              </button>

                                              <button
                                                onClick={() =>
                                                  handleToggleDisqualification(
                                                    r.id,
                                                    !!r.disqualified,
                                                  )
                                                }
                                                disabled={updatingDsqResultId === r.id}
                                                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                                                  r.disqualified
                                                    ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                                                    : "border-red-500/40 text-red-300 hover:bg-red-500/10"
                                                }`}
                                              >
                                                {updatingDsqResultId === r.id
                                                  ? "..."
                                                  : r.disqualified
                                                    ? "Restaurar"
                                                    : "DSQ"}
                                              </button>
                                            </div>
                                          </td>
                                        )}
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                // Preview from API cache (pre-import)
                                <>
                                  <div className="px-6 py-2 flex items-center gap-2 text-xs text-yellow-500/80 border-b border-zinc-800/50">
                                    <span>
                                      Pré-visualização — pontos serão calculados
                                      ao importar
                                    </span>
                                  </div>
                                  {isAdmin && isSeasonActive && isRoundFinal && (
                                    <div className="px-6 py-2 flex items-center gap-2 text-xs text-cyan-400/80 border-b border-zinc-800/50 bg-cyan-500/5">
                                      <span>
                                        Edição manual do round final fica disponível
                                        após a primeira importação dos resultados.
                                      </span>
                                    </div>
                                  )}
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-zinc-800/60">
                                        <th className="px-8 py-2.5 text-left text-zinc-500 font-mono uppercase">
                                          Pos
                                        </th>
                                        <th className="px-4 py-2.5 text-left text-zinc-500 font-mono uppercase">
                                          Piloto
                                        </th>
                                        <th className="px-4 py-2.5 text-left text-zinc-500 font-mono uppercase">
                                          Tempo
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {previewResults.map((dr) => (
                                        <tr
                                          key={dr.uuid}
                                          className="border-b border-zinc-800/20 hover:bg-zinc-800/10"
                                        >
                                          <td className="px-8 py-2 font-mono font-bold text-zinc-400">
                                            #{dr.position}
                                          </td>
                                          <td className="px-4 py-2 text-zinc-300">
                                            {dr.name}
                                          </td>
                                          <td className="px-4 py-2 font-mono text-zinc-500">
                                            {dr.finish_time
                                              ? formatTime(dr.finish_time)
                                              : "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {isRosterRoundModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white font-mono">Vigência do Roster</h3>
                <p className="text-sm text-zinc-400 mt-1">{pendingRosterTeamName}</p>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                onClick={closeRosterRoundModal}
                disabled={Boolean(savingRosterTeamId)}
              >
                <X size={18} className="text-zinc-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-zinc-300">
                Escolha a partir de qual corrida este roster deve valer. A alteração será
                aplicada de forma inclusiva dessa rodada em diante.
              </p>

              <label className="block">
                <span className="text-xs font-semibold tracking-wide uppercase text-zinc-500">
                  Rodada de vigência
                </span>
                <select
                  value={pendingRosterRound}
                  onChange={(event) => setPendingRosterRound(Number(event.target.value))}
                  className="mt-2 w-full px-3 py-2.5 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-cyan-500/50"
                >
                  {resolvedSeasonRoundOptions.map((option) => (
                    <option key={option.round} value={option.round}>
                      Rodada {option.round} - {option.raceName}
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-xs text-zinc-500">
                Dica: use a rodada da corrida atual para mudanças imediatas, ou selecione uma
                rodada futura para deixar a alteração programada.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeRosterRoundModal}
                disabled={Boolean(savingRosterTeamId)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveRoster}
                disabled={Boolean(savingRosterTeamId)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {savingRosterTeamId ? <Loader2 size={16} className="animate-spin" /> : null}
                {savingRosterTeamId ? "Salvando..." : "Salvar roster"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[88vh] rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white font-mono">Importar Resultados</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Os resultados serão importados e a classificação da temporada será recalculada.
                </p>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                onClick={() => !isImportingResults && setIsImportModalOpen(false)}
              >
                <X size={18} className="text-zinc-400" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-zinc-200 font-medium">Bônus por corrida (opcional)</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Use apenas se precisar compensar bug/remarcação.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBonusConfig((prev) => !prev)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-colors"
                  >
                    {showBonusConfig ? "Ocultar" : "Configurar"}
                  </button>
                </div>

                {!showBonusConfig && (
                  <p className="mt-3 text-xs text-zinc-500">
                    {existingRaceBonuses.length > 0
                      ? `${existingRaceBonuses.length} bônus já configurado(s) para esta corrida.`
                      : "Nenhum bônus configurado para esta corrida."}
                  </p>
                )}

                {showBonusConfig && (
                  <>
                    <p className="text-xs text-zinc-500 mt-3">
                      Informe pontos extras (ou negativos para punição) para qualquer piloto da temporada
                      {selectedScoringRound ? ` (referência: ${selectedScoringRound.apiRoundName})` : ""}.
                    </p>

                    <div className="mt-3">
                      <input
                        value={importBonusSearch}
                        onChange={(event) => setImportBonusSearch(event.target.value)}
                        placeholder="Buscar piloto por nome ou UUID"
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>

                    <div className="mt-3 max-h-56 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                      {filteredBonusCandidates.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-zinc-500 text-center">
                          Nenhum piloto elegível para bônus nesta corrida.
                        </div>
                      ) : (
                        filteredBonusCandidates.map((candidate) => (
                          <div key={candidate.uuid} className="px-4 py-2.5 flex items-center gap-3">
                            {(() => {
                              const draftValue = importBonusDraftByUuid[candidate.uuid] ?? "";
                              const trimmedDraft = draftValue.trim();
                              const bonusDelta =
                                trimmedDraft === ""
                                  ? 0
                                  : /^-?\d+$/.test(trimmedDraft)
                                    ? Number.parseInt(trimmedDraft, 10)
                                    : null;
                              const pointsAfterBonus =
                                candidate.pointsBeforeBonus !== null && bonusDelta !== null
                                  ? candidate.pointsBeforeBonus + bonusDelta
                                  : null;

                              return (
                                <>
                                  <img
                                    src={`https://minotar.net/helm/${candidate.uuid}/24.png`}
                                    alt={candidate.name}
                                    className="w-6 h-6 rounded"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm text-zinc-100 truncate">{candidate.name}</p>
                                    <p className="text-[11px] text-zinc-500 font-mono truncate">{candidate.uuid}</p>
                                    <p className="text-[11px] text-zinc-400 font-mono">
                                      Pontos antes do bônus: {candidate.pointsBeforeBonus ?? "—"}
                                    </p>
                                    <p className="text-[11px] text-cyan-300 font-mono">
                                      Pós-bônus: {pointsAfterBonus ?? "—"}
                                    </p>
                                  </div>
                                  <input
                                    inputMode="numeric"
                                    value={importBonusDraftByUuid[candidate.uuid] ?? ""}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      if (value === "" || /^-?\d*$/.test(value)) {
                                        setImportBonusDraftByUuid((prev) => ({
                                          ...prev,
                                          [candidate.uuid]: value,
                                        }));
                                      }
                                    }}
                                    placeholder="0"
                                    className="w-20 px-2 py-1.5 text-right bg-zinc-900 border border-zinc-800 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
                                  />
                                </>
                              );
                            })()}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-3">
                      <label className="text-xs text-zinc-500">Motivo (opcional)</label>
                      <input
                        value={importBonusReason}
                        onChange={(event) => setImportBonusReason(event.target.value)}
                        maxLength={160}
                        placeholder="Ex: compensação por remarcação"
                        className="mt-1 w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImportingResults}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImportingResults}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-zinc-950 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {isImportingResults ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {isImportingResults ? "Importando..." : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
