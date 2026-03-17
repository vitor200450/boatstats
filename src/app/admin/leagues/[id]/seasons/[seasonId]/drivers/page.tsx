"use client";

import { use, useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LogoImage } from "@/components/LogoImage";
import {
  ArrowLeft,
  Users,
  Trophy,
  Plus,
  Search,
  X,
  Loader2,
  UserPlus,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ArrowRightLeft,
  Settings,
  RefreshCw,
  List,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  getSeasonDrivers,
  saveTeamDepthChart,
  assignDriverToTeam,
  assignDriverWithoutTeam,
  removeDriverFromTeam,
  transferDriver,
  searchDrivers,
  createDriverFromAPI,
  createDriverManually,
  syncDriverFromAPI,
  searchDriverByPreviousName,
} from "@/lib/leagues";

interface DriversPageProps {
  params: Promise<{
    id: string;
    seasonId: string;
  }>;
}

interface Driver {
  id: string;
  uuid: string;
  currentName: string | null;
  colorCode?: string | null;
  boatType?: string | null;
  boatMaterial?: string | null;
  seasonPoints?: number;
  depthPriority?: number | null;
}

interface Assignment {
  id: string;
  driver: Driver;
  joinedAt: Date;
  leftAt: Date | null;
  effectiveFromRound: number;
  effectiveToRound: number | null;
}

interface Team {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  teamSeasonPoints?: number;
  lastDepthChartUpdatedAt?: Date | string | null;
  lastDepthChartRound?: number | null;
  lastDepthChartRaceName?: string | null;
  assignments: Assignment[];
  activeAssignments: Assignment[];
}

interface Season {
  id: string;
  name: string;
  status: string;
  leagueId: string;
  leagueName: string;
  teamScoringMode: "STANDARD" | "DEPTH_CHART" | "SLOT_MULLIGAN";
  rounds: Array<{
    id: string;
    round: number;
    name: string;
    status: string;
  }>;
}

interface FoundPlayer {
  uuid: string;
  name: string;
  colorCode?: string;
  boatType?: string;
  boatMaterial?: string;
  source: "frosthex" | "mojang";
  previousNames?: string[];
  searchedName?: string; // The name the user searched for
}

type PreviousNameSearchData = {
  driver: Driver;
  currentName: string;
  nameHistory: Array<{ name: string }>;
  searchedName?: string;
};

export default function SeasonDriversPage({ params }: DriversPageProps) {
  const { id: leagueId, seasonId } = use(params);
  const searchParams = useSearchParams();
  const [highlightedDriverId, setHighlightedDriverId] = useState<string | null>(
    null,
  );
  const [season, setSeason] = useState<Season | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamlessDrivers, setTeamlessDrivers] = useState<Driver[]>([]);
  const [totalDrivers, setTotalDrivers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatDepthChartUpdatedAt = (value?: Date | string | null): string => {
    if (!value) return "Nunca";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "Nunca";

    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatAssignmentRoundRange = (assignment: Assignment): string => {
    const fromRound = assignment.effectiveFromRound;
    const toRound = assignment.effectiveToRound;

    const getRoundLabel = (round: number): string => {
      const roundEntry = season?.rounds.find((entry) => entry.round === round);
      return roundEntry?.name ?? `R${round}`;
    };

    const fromLabel = getRoundLabel(fromRound);

    if (toRound !== null && toRound !== fromRound) {
      return `${fromLabel} a ${getRoundLabel(toRound)}`;
    }

    if (toRound !== null) {
      return fromLabel;
    }

    return `desde ${fromLabel}`;
  };

  // Add driver modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "batch" | "manual">(
    "single",
  );
  const [selectedTeamForAdd, setSelectedTeamForAdd] = useState<string>("");
  const [manualUUID, setManualUUID] = useState("");
  const [manualName, setManualName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Driver[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [effectiveRoundForAdd, setEffectiveRoundForAdd] = useState<number | "">("");
  const [isCreating, setIsCreating] = useState(false);
  const [foundPlayer, setFoundPlayer] = useState<FoundPlayer | null>(null);
  const [createStatus, setCreateStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
    nameMCQuery?: string;
  } | null>(null);

  // Batch add state
  const [batchUsernames, setBatchUsernames] = useState("");
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchResults, setBatchResults] = useState<{
    success: number;
    failed: number;
    total: number;
    errors: string[];
    notFoundUsernames: string[];
  }>({ success: 0, failed: 0, total: 0, errors: [], notFoundUsernames: [] });

  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferringAssignment, setTransferringAssignment] =
    useState<Assignment | null>(null);
  const [transferFromTeam, setTransferFromTeam] = useState<Team | null>(null);
  const [selectedTeamForTransfer, setSelectedTeamForTransfer] =
    useState<string>("");
  const [effectiveRoundForTransfer, setEffectiveRoundForTransfer] = useState<number | "">("");
  const [transferring, setTransferring] = useState(false);

  // Sync state
  const [syncingDriverId, setSyncingDriverId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    type: "success" | "error";
    message: string;
    driverName?: string;
  } | null>(null);
  const [showDepthBulkModal, setShowDepthBulkModal] = useState(false);
  const [depthBulkTeam, setDepthBulkTeam] = useState<Team | null>(null);
  const [depthBulkInput, setDepthBulkInput] = useState("");
  const [depthBulkError, setDepthBulkError] = useState<string | null>(null);
  const [draggingDepth, setDraggingDepth] = useState<{
    teamId: string;
    driverId: string;
  } | null>(null);
  const [dragOverDepthDriverId, setDragOverDepthDriverId] = useState<string | null>(null);
  const pendingDepthChartOrderRef = useRef(new Map<string, string[]>());
  const [dirtyDepthChartTeamIds, setDirtyDepthChartTeamIds] = useState<string[]>(
    [],
  );
  const [savingDepthChartTeamIds, setSavingDepthChartTeamIds] = useState<
    string[]
  >([]);
  const [showDepthRoundModal, setShowDepthRoundModal] = useState(false);
  const [depthRoundTeamId, setDepthRoundTeamId] = useState<string | null>(null);
  const [depthRoundValue, setDepthRoundValue] = useState<number | "">("");
  const [depthRoundError, setDepthRoundError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const result = await getSeasonDrivers(seasonId);
      if (result.success && result.data) {
        setSeason(result.data.season);
        setTeams(result.data.teams);
        setTeamlessDrivers(result.data.teamlessDrivers ?? []);
        setTotalDrivers(result.data.totalDrivers);
      } else {
        setError(result.error || "Erro ao carregar dados");
      }
    } catch {
      setError("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const driverId = searchParams.get("highlight");
    if (!driverId || teams.length === 0) return;

    setHighlightedDriverId(driverId);

    const el = document.getElementById(`driver-${driverId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    const timer = setTimeout(() => setHighlightedDriverId(null), 3000);
    return () => clearTimeout(timer);
  }, [searchParams, teams]);

  useEffect(() => {
    const pendingOrders = pendingDepthChartOrderRef.current;
    return () => {
      pendingOrders.clear();
    };
  }, []);

  useEffect(() => {
    if (!season || season.rounds.length === 0) return;

    if (effectiveRoundForAdd === "") {
      setEffectiveRoundForAdd(season.rounds[0].round);
    }

    if (effectiveRoundForTransfer === "") {
      setEffectiveRoundForTransfer(season.rounds[0].round);
    }
  }, [season, effectiveRoundForAdd, effectiveRoundForTransfer]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      setFoundPlayer(null);
      setCreateStatus(null);

      if (searchQuery.length >= 3) {
        setSearching(true);
        try {
          const localResult = await searchDrivers(searchQuery);
          if (localResult.success && localResult.data) {
            const drivers = localResult.data as Driver[];
            setSearchResults(drivers);

            if (drivers.length === 0) {
              setIsCreating(true);
              setCreateStatus({
                type: "info",
                message: "Buscando jogador nas APIs...",
              });

              const createResult = await createDriverFromAPI(searchQuery);

              if (createResult.success && createResult.data) {
                const newDriver = createResult.data as Driver;
                setSearchResults([newDriver]);
                setSelectedDriver(newDriver);
                setCreateStatus({
                  type: "success",
                  message:
                    createResult.message || "Piloto encontrado e criado!",
                });
                setFoundPlayer({
                  uuid: newDriver.uuid,
                  name: newDriver.currentName || searchQuery,
                  colorCode: newDriver.colorCode || undefined,
                  boatType: newDriver.boatType || undefined,
                  boatMaterial: newDriver.boatMaterial || undefined,
                  source: newDriver.colorCode ? "frosthex" : "mojang",
                });
              } else {
                // Try searching by previous name
                setCreateStatus({
                  type: "info",
                  message: "Buscando no histórico de nomes...",
                });

                const historyResult =
                  await searchDriverByPreviousName(searchQuery);

                if (historyResult.success && "data" in historyResult) {
                  // Player found by previous name
                  const data = historyResult.data as PreviousNameSearchData;
                  const { driver, currentName, nameHistory } = data;

                  // Use the existing driver from database
                  const driverData = driver as Driver;
                  setSearchResults([driverData]);
                  setSelectedDriver(driverData);

                  const previousNames = nameHistory
                    .map((entry: { name: string }) => entry.name)
                    .filter(
                      (name: string) =>
                        name.toLowerCase() !== currentName.toLowerCase(),
                    );

                  setCreateStatus({
                    type: "success",
                    message: `Piloto encontrado! Nome atual: ${currentName}`,
                  });
                  setFoundPlayer({
                    uuid: driverData.uuid,
                    name: driverData.currentName || currentName,
                    colorCode: driverData.colorCode || undefined,
                    boatType: driverData.boatType || undefined,
                    boatMaterial: driverData.boatMaterial || undefined,
                    source: driverData.colorCode ? "frosthex" : "mojang",
                    previousNames,
                    searchedName: searchQuery,
                  });
                } else {
                  setCreateStatus({
                    type: "error",
                    message:
                      createResult.error ||
                      "Jogador não encontrado. Se o player mudou de nome recentemente, use o nome atual do Minecraft.",
                    nameMCQuery: searchQuery,
                  });
                }
              }
              setIsCreating(false);
            }
          }
        } catch {
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  async function handleAssignDriver() {
    if (!selectedDriver) return;
    if (effectiveRoundForAdd === "") {
      setError("Selecione a rodada de vigência");
      return;
    }

    setAssigning(true);
    const result = selectedTeamForAdd
      ? await assignDriverToTeam(
          seasonId,
          selectedTeamForAdd,
          selectedDriver.id,
          Number(effectiveRoundForAdd),
        )
      : await assignDriverWithoutTeam(
          seasonId,
          selectedDriver.id,
          Number(effectiveRoundForAdd),
        );

    if (result.success) {
      setShowAddModal(false);
      resetAddModal();
      loadData();
    } else {
      setError(result.error || "Erro ao vincular piloto");
    }
    setAssigning(false);
  }

  function resetAddModal() {
    setAddMode("single");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedDriver(null);
    setSelectedTeamForAdd("");
    setEffectiveRoundForAdd(season?.rounds[0]?.round ?? "");
    setFoundPlayer(null);
    setCreateStatus(null);
    setIsCreating(false);
    setBatchUsernames("");
    setBatchProgress({ current: 0, total: 0 });
    setBatchResults({
      success: 0,
      failed: 0,
      total: 0,
      errors: [],
      notFoundUsernames: [],
    });
    setManualUUID("");
    setManualName("");
  }

  async function handleCreateManualDriver() {
    if (!manualUUID.trim()) {
      setCreateStatus({
        type: "error",
        message: "Digite o UUID do jogador",
      });
      return;
    }

    setIsCreating(true);
    setCreateStatus({
      type: "info",
      message: "Criando piloto...",
    });

    const result = await createDriverManually(
      manualUUID.trim(),
      manualName.trim() || undefined,
    );

    if (result.success && result.data) {
      const newDriver = result.data as Driver;
      setSearchResults([newDriver]);
      setSelectedDriver(newDriver);
      setCreateStatus({
        type: "success",
        message: result.message || "Piloto criado com sucesso!",
      });
    } else {
      setCreateStatus({
        type: "error",
        message: result.error || "Erro ao criar piloto",
      });
    }
    setIsCreating(false);
  }

  async function handleBatchAdd() {
    if (!batchUsernames.trim()) return;
    if (effectiveRoundForAdd === "") {
      setCreateStatus({
        type: "error",
        message: "Selecione a rodada de vigência antes de processar em lote.",
      });
      return;
    }

    // Parse usernames (one per line, comma, or space separated)
    const usernames = batchUsernames
      .split(/[\n,\s]+/)
      .map((u) => u.trim())
      .filter((u) => u.length >= 3);

    if (usernames.length === 0) {
      setCreateStatus({
        type: "error",
        message: "Nenhum username válido encontrado. Mínimo 3 caracteres.",
      });
      return;
    }

    setBatchProcessing(true);
    setBatchProgress({ current: 0, total: usernames.length });
    setBatchResults({
      success: 0,
      failed: 0,
      total: 0,
      errors: [],
      notFoundUsernames: [],
    });

    const results = {
      success: 0,
      failed: 0,
      total: usernames.length,
      errors: [] as string[],
      notFoundUsernames: [] as string[],
    };

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      setBatchProgress({ current: i + 1, total: usernames.length });

      try {
        // Create or get driver from API
        const createResult = await createDriverFromAPI(username);

        if (!createResult.success || !createResult.data) {
          results.failed++;
          results.errors.push(
            `${username}: ${createResult.error || "Não encontrado"}`,
          );
          if (!createResult.data) results.notFoundUsernames.push(username);
          continue;
        }

        const driver = createResult.data as Driver;

        // Assign to team or keep teamless
        const assignResult = selectedTeamForAdd
          ? await assignDriverToTeam(
              seasonId,
              selectedTeamForAdd,
              driver.id,
              Number(effectiveRoundForAdd),
            )
          : await assignDriverWithoutTeam(
              seasonId,
              driver.id,
              Number(effectiveRoundForAdd),
            );

        if (assignResult.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(
            `${username}: ${assignResult.error || "Erro ao vincular"}`,
          );
        }
      } catch {
        results.failed++;
        results.errors.push(`${username}: Erro inesperado`);
      }
    }

    setBatchResults(results);
    setBatchProcessing(false);

    if (results.success > 0) {
      loadData();
    }

    // Show summary
    if (results.failed === 0) {
      setCreateStatus({
        type: "success",
        message: `${results.success} de ${usernames.length} pilotos adicionados com sucesso!`,
      });
    } else {
      setCreateStatus({
        type: "error",
        message: `${results.success} adicionados, ${results.failed} falharam.`,
      });
    }
  }

  async function handleRemoveDriver(assignmentId: string) {
    if (!confirm("Tem certeza que deseja remover este piloto da temporada?"))
      return;

    const suggestedRound = season?.rounds[0]?.round ?? 1;
    const roundInput = window.prompt(
      "Rodada de vigência (aplica a partir desta rodada, inclusive):",
      String(suggestedRound),
    );

    if (!roundInput) return;
    const parsedRound = Number(roundInput);
    if (!Number.isInteger(parsedRound) || parsedRound < 1) {
      setError("Rodada de vigência inválida");
      return;
    }

    const result = await removeDriverFromTeam(assignmentId, parsedRound);
    if (result.success) {
      loadData();
    } else {
      setError(result.error || "Erro ao remover piloto");
    }
  }

  function openTransferModal(assignment: Assignment, fromTeam: Team) {
    setTransferringAssignment(assignment);
    setTransferFromTeam(fromTeam);
    setSelectedTeamForTransfer("");
    setEffectiveRoundForTransfer(season?.rounds[0]?.round ?? "");
    setShowTransferModal(true);
  }

  async function handleTransfer() {
    if (!transferringAssignment || !selectedTeamForTransfer) return;
    if (effectiveRoundForTransfer === "") {
      setError("Selecione a rodada de vigência");
      return;
    }

    setTransferring(true);
    const targetTeamId =
      selectedTeamForTransfer === "__TEAMLESS__"
        ? null
        : selectedTeamForTransfer;

    const result = await transferDriver(
      seasonId,
      transferringAssignment.driver.id,
      targetTeamId,
      Number(effectiveRoundForTransfer),
    );

    if (result.success) {
      setShowTransferModal(false);
      setTransferringAssignment(null);
      setTransferFromTeam(null);
      setSelectedTeamForTransfer("");
      setEffectiveRoundForTransfer(season?.rounds[0]?.round ?? "");
      loadData();
    } else {
      setError(result.error || "Erro ao transferir piloto");
    }
    setTransferring(false);
  }

  function openAssignTeamlessDriverModal(driver: Driver) {
    setAddMode("single");
    setSelectedTeamForAdd("");
    setSearchQuery("");
    setSearchResults([driver]);
    setSelectedDriver(driver);
    setFoundPlayer(null);
    setCreateStatus(null);
    setEffectiveRoundForAdd(season?.rounds[0]?.round ?? "");
    setShowAddModal(true);
  }

  async function handleSyncDriver(driverId: string, driverName?: string) {
    setSyncingDriverId(driverId);
    setSyncStatus(null);
    const result = await syncDriverFromAPI(driverId);

    if (result.success) {
      setSyncStatus({
        type: "success",
        message: result.message || "Dados sincronizados com sucesso!",
        driverName,
      });
      loadData();
      // Clear success message after 5 seconds
      setTimeout(() => setSyncStatus(null), 5000);
    } else {
      setSyncStatus({
        type: "error",
        message: result.error || "Erro ao sincronizar piloto",
        driverName,
      });
    }
    setSyncingDriverId(null);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
            Ativa
          </span>
        );
      case "DRAFT":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            Rascunho
          </span>
        );
      case "COMPLETED":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Finalizada
          </span>
        );
      case "ARCHIVED":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider bg-zinc-700 text-zinc-400 border border-zinc-600">
            Arquivada
          </span>
        );
      default:
        return null;
    }
  }

  function getOrderedAssignments(team: Team): Assignment[] {
    if (season?.teamScoringMode !== "DEPTH_CHART") {
      return team.activeAssignments;
    }

    return [...team.activeAssignments].sort((a, b) => {
      const aPriority = a.driver.depthPriority ?? Number.MAX_SAFE_INTEGER;
      const bPriority = b.driver.depthPriority ?? Number.MAX_SAFE_INTEGER;
      if (aPriority !== bPriority) return aPriority - bPriority;

      return (a.driver.currentName || a.driver.uuid).localeCompare(
        b.driver.currentName || b.driver.uuid,
      );
    });
  }

  const flushDepthChartSave = useCallback(
    async (
      teamId: string,
      parsedRound: number,
    ): Promise<{ success: boolean; error?: string }> => {
      const orderedDriverIds = pendingDepthChartOrderRef.current.get(teamId);
      if (!orderedDriverIds) {
        return { success: false, error: "Nenhuma alteração pendente para salvar." };
      }

      if (!Number.isInteger(parsedRound) || parsedRound < 1) {
        const errorMessage = "Rodada de vigência inválida para depth chart";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      pendingDepthChartOrderRef.current.delete(teamId);
      setSavingDepthChartTeamIds((current) =>
        current.includes(teamId) ? current : [...current, teamId],
      );

      try {
        const result = await Promise.race([
          saveTeamDepthChart(seasonId, teamId, orderedDriverIds, parsedRound),
          new Promise<{ success: false; error: string }>((resolve) => {
            setTimeout(() => {
              resolve({
                success: false,
                error:
                  "A operação demorou demais para responder. Tente novamente.",
              });
            }, 12000);
          }),
        ]);

        if (!result.success) {
          const errorMessage = result.error || "Erro ao salvar depth chart";
          setError(errorMessage);
          loadData();
          return { success: false, error: errorMessage };
        } else if (!pendingDepthChartOrderRef.current.has(teamId)) {
          setDirtyDepthChartTeamIds((current) =>
            current.filter((id) => id !== teamId),
          );
        }

        await loadData();
        return { success: true };
      } catch {
        const errorMessage = "Erro ao salvar depth chart";
        setError(errorMessage);
        loadData();
        return { success: false, error: errorMessage };
      } finally {
        setSavingDepthChartTeamIds((current) =>
          current.filter((id) => id !== teamId),
        );
      }
    },
    [seasonId, loadData],
  );

  function openDepthRoundModal(teamId: string) {
    const orderedDriverIds = pendingDepthChartOrderRef.current.get(teamId);
    if (!orderedDriverIds) return;

    const suggestedRound = season?.rounds.at(-1)?.round ?? season?.rounds[0]?.round ?? 1;
    setDepthRoundTeamId(teamId);
    setDepthRoundValue(suggestedRound);
    setDepthRoundError(null);
    setShowDepthRoundModal(true);
  }

  function closeDepthRoundModal() {
    if (depthRoundTeamId && savingDepthChartTeamIds.includes(depthRoundTeamId)) return;
    setShowDepthRoundModal(false);
    setDepthRoundTeamId(null);
    setDepthRoundError(null);
  }

  async function handleConfirmDepthRound() {
    if (!depthRoundTeamId || depthRoundValue === "") return;
    const round = Number(depthRoundValue);
    if (!Number.isInteger(round) || round < 1) {
      setDepthRoundError("Rodada de vigência inválida para depth chart");
      return;
    }

    const result = await flushDepthChartSave(depthRoundTeamId, round);
    if (!result.success) {
      setDepthRoundError(result.error || "Não foi possível salvar a ordem com a rodada selecionada.");
      return;
    }

    setShowDepthRoundModal(false);
    setDepthRoundTeamId(null);
    setDepthRoundError(null);
  }

  function applyDepthChartOrder(teamId: string, orderedDriverIds: string[]) {
    const nextPriorityByDriverId = new Map(
      orderedDriverIds.map((driverId, idx) => [driverId, idx + 1]),
    );

    setTeams((currentTeams) =>
      currentTeams.map((currentTeam) => {
        if (currentTeam.id !== teamId) return currentTeam;

        return {
          ...currentTeam,
          activeAssignments: currentTeam.activeAssignments.map((assignment) => ({
            ...assignment,
            driver: {
              ...assignment.driver,
              depthPriority:
                nextPriorityByDriverId.get(assignment.driver.id) ??
                assignment.driver.depthPriority ??
                null,
            },
          })),
        };
      }),
    );

    pendingDepthChartOrderRef.current.set(teamId, orderedDriverIds);
    setDirtyDepthChartTeamIds((current) =>
      current.includes(teamId) ? current : [...current, teamId],
    );
  }

  async function handleMoveDepthChart(
    team: Team,
    assignmentId: string,
    direction: "up" | "down",
  ) {
    if (season?.teamScoringMode !== "DEPTH_CHART") return;

    const assignmentByDriverId = new Map(
      team.activeAssignments.map((assignment) => [assignment.driver.id, assignment]),
    );

    const pendingOrder = pendingDepthChartOrderRef.current.get(team.id);
    const baseOrder =
      pendingOrder && pendingOrder.length === team.activeAssignments.length
        ? pendingOrder.filter((driverId) => assignmentByDriverId.has(driverId))
        : getOrderedAssignments(team).map((assignment) => assignment.driver.id);

    const assignmentIdsInOrder = baseOrder
      .map((driverId) => assignmentByDriverId.get(driverId))
      .filter((assignment): assignment is Assignment => Boolean(assignment))
      .map((assignment) => assignment.id);

    const index = assignmentIdsInOrder.indexOf(assignmentId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= baseOrder.length) return;

    const newOrder = [...baseOrder];
    const [movedDriverId] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, movedDriverId);

    applyDepthChartOrder(team.id, newOrder);
  }

  function handleDepthDragStart(team: Team, driverId: string) {
    if (season?.teamScoringMode !== "DEPTH_CHART" || isArchived) return;
    setDraggingDepth({ teamId: team.id, driverId });
    setDragOverDepthDriverId(driverId);
  }

  function handleDepthDragEnd() {
    setDraggingDepth(null);
    setDragOverDepthDriverId(null);
  }

  function handleDepthDragOver(event: DragEvent<HTMLDivElement>, team: Team, driverId: string) {
    if (!draggingDepth) return;
    if (draggingDepth.teamId !== team.id) return;
    event.preventDefault();
    if (dragOverDepthDriverId !== driverId) {
      setDragOverDepthDriverId(driverId);
    }
  }

  function handleDepthDrop(team: Team, targetDriverId: string) {
    if (!draggingDepth) return;
    if (draggingDepth.teamId !== team.id) {
      handleDepthDragEnd();
      return;
    }
    if (draggingDepth.driverId === targetDriverId) {
      handleDepthDragEnd();
      return;
    }

    const assignmentByDriverId = new Map(
      team.activeAssignments.map((assignment) => [assignment.driver.id, assignment]),
    );

    const pendingOrder = pendingDepthChartOrderRef.current.get(team.id);
    const baseOrder =
      pendingOrder && pendingOrder.length === team.activeAssignments.length
        ? pendingOrder.filter((driverId) => assignmentByDriverId.has(driverId))
        : getOrderedAssignments(team).map((assignment) => assignment.driver.id);

    const draggedIndex = baseOrder.indexOf(draggingDepth.driverId);
    const targetIndex = baseOrder.indexOf(targetDriverId);
    if (draggedIndex === -1 || targetIndex === -1) {
      handleDepthDragEnd();
      return;
    }

    const newOrder = [...baseOrder];
    const [movedDriverId] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, movedDriverId);
    applyDepthChartOrder(team.id, newOrder);
    handleDepthDragEnd();
  }

  function openDepthBulkModal(team: Team) {
    const ordered = getOrderedAssignments(team);
    const lines = ordered.map((assignment) =>
      assignment.driver.currentName || assignment.driver.uuid,
    );

    setDepthBulkTeam(team);
    setDepthBulkInput(lines.join("\n"));
    setDepthBulkError(null);
    setShowDepthBulkModal(true);
  }

  function handleApplyDepthBulkOrder() {
    if (!depthBulkTeam) return;

    const orderedAssignments = getOrderedAssignments(depthBulkTeam);
    const tokens = depthBulkInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (tokens.length === 0) {
      setDepthBulkError("Informe ao menos um nome/UUID por linha.");
      return;
    }

    const selectedDriverIds: string[] = [];
    const selectedSet = new Set<string>();
    const uuidMap = new Map<string, Assignment>();
    const nameMap = new Map<string, Assignment[]>();

    for (const assignment of orderedAssignments) {
      uuidMap.set(assignment.driver.uuid.toLowerCase(), assignment);
      const nameKey = (assignment.driver.currentName || "").toLowerCase();
      if (nameKey) {
        const list = nameMap.get(nameKey) ?? [];
        list.push(assignment);
        nameMap.set(nameKey, list);
      }
    }

    for (const token of tokens) {
      const key = token.toLowerCase();
      const byUuid = uuidMap.get(key);
      if (byUuid) {
        if (!selectedSet.has(byUuid.driver.id)) {
          selectedSet.add(byUuid.driver.id);
          selectedDriverIds.push(byUuid.driver.id);
        }
        continue;
      }

      const byName = nameMap.get(key) ?? [];
      if (byName.length === 1) {
        const assignment = byName[0];
        if (!selectedSet.has(assignment.driver.id)) {
          selectedSet.add(assignment.driver.id);
          selectedDriverIds.push(assignment.driver.id);
        }
        continue;
      }

      if (byName.length > 1) {
        setDepthBulkError(
          `Nome duplicado na equipe: \"${token}\". Use UUID para desambiguar.`,
        );
        return;
      }

      setDepthBulkError(
        `Piloto não encontrado na equipe: \"${token}\".`,
      );
      return;
    }

    const remainingDriverIds = orderedAssignments
      .map((assignment) => assignment.driver.id)
      .filter((driverId) => !selectedSet.has(driverId));

    const finalOrder = [...selectedDriverIds, ...remainingDriverIds];
    applyDepthChartOrder(depthBulkTeam.id, finalOrder);

    setShowDepthBulkModal(false);
    setDepthBulkTeam(null);
    setDepthBulkInput("");
    setDepthBulkError(null);
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (!season) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <p className="text-zinc-400">Temporada não encontrada</p>
      </div>
    );
  }

  const activeTeams = teams.filter((t) => t.activeAssignments.length > 0);
  const isArchived = season.status === "ARCHIVED";
  const getTeamTotalPoints = (team: Team): number =>
    team.teamSeasonPoints ??
    team.activeAssignments.reduce(
      (acc, assignment) => acc + (assignment.driver.seasonPoints ?? 0),
      0,
    );
  const teamlessTotalPoints = teamlessDrivers.reduce(
    (acc, driver) => acc + (driver.seasonPoints ?? 0),
    0,
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
        <Link
          href={`/admin/leagues/${leagueId}/seasons/${seasonId}`}
          className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors group"
        >
          <ArrowLeft
            size={20}
            className="text-zinc-400 group-hover:text-white transition-colors"
          />
        </Link>

        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
            <Link
              href={`/admin/leagues/${leagueId}`}
              className="hover:text-cyan-400 transition-colors"
            >
              {season.leagueName}
            </Link>
            <ChevronRight size={14} />
            <Link
              href={`/admin/leagues/${leagueId}/seasons`}
              className="hover:text-cyan-400 transition-colors"
            >
              Temporadas
            </Link>
            <ChevronRight size={14} />
            <Link
              href={`/admin/leagues/${leagueId}/seasons/${seasonId}`}
              className="hover:text-cyan-400 transition-colors"
            >
              {season.name}
            </Link>
            <ChevronRight size={14} />
            <span className="text-zinc-300">Pilotos</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono">
              Pilotos da Temporada
            </h1>
            {getStatusBadge(season.status)}
          </div>
        </div>

        <Link
          href={`/admin/leagues/${leagueId}/seasons/${seasonId}/settings`}
          className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors group"
          title="Configurações"
        >
          <Settings
            size={20}
            className="text-zinc-400 group-hover:text-white transition-colors"
          />
        </Link>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 flex items-center gap-2">
          <X size={18} />
          {error}
        </div>
      )}

      {/* Sync Status Message */}
      {syncStatus && (
        <div
          className={`rounded-lg p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
            syncStatus.type === "success"
              ? "bg-green-500/10 border border-green-500/30 text-green-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {syncStatus.type === "success" ? (
            <CheckCircle size={20} />
          ) : (
            <AlertCircle size={20} />
          )}
          <div className="flex-1">
            <p className="font-medium">
              {syncStatus.type === "success"
                ? "Sincronização concluída"
                : "Erro na sincronização"}
            </p>
            <p className="text-sm opacity-90">
              {syncStatus.driverName && (
                <span className="font-medium">{syncStatus.driverName}: </span>
              )}
              {syncStatus.message}
            </p>
          </div>
          <button
            onClick={() => setSyncStatus(null)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Total de Pilotos
              </p>
              <p className="text-white font-mono text-lg">{totalDrivers}</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Equipes com Pilotos
              </p>
              <p className="text-white font-mono text-lg">
                {activeTeams.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Média por Equipe
              </p>
              <p className="text-white font-mono text-lg">
                {activeTeams.length > 0
                  ? (totalDrivers / activeTeams.length).toFixed(1)
                  : "0"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Driver Button */}
      {!isArchived && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-cyan-500/20"
          >
            <UserPlus size={20} />
            Adicionar Piloto
          </button>
        </div>
      )}

      {/* Teams with Drivers */}
      <div className="space-y-6">
        {teams.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
            <Trophy className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">
              Nenhuma equipe cadastrada nesta liga
            </p>
            <Link
              href={`/admin/leagues/${leagueId}/teams/new`}
              className="inline-flex items-center gap-2 mt-4 text-cyan-400 hover:text-cyan-300"
            >
              <Plus size={16} />
              Criar primeira equipe
            </Link>
          </div>
        ) : activeTeams.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
            <Users className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">
              Nenhuma equipe com pilotos cadastrados nesta temporada
            </p>
          </div>
        ) : (
          activeTeams.map((team) => {
            const orderedAssignments = getOrderedAssignments(team);

            return (
              <div
                key={team.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
              >
              {/* Team Header */}
              <div
                className="flex items-center justify-between p-5 border-b border-zinc-800"
                style={{
                  backgroundColor: team.color ? `${team.color}10` : undefined,
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center border border-zinc-700"
                    style={{
                      backgroundColor: team.color
                        ? `${team.color}20`
                        : "#27272a",
                    }}
                  >
                    <LogoImage
                      src={team.logoUrl}
                      alt={team.name}
                      className="w-full h-full object-cover"
                      fallbackClassName="w-full h-full flex items-center justify-center"
                      fallbackIconClassName="w-8 h-8"
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white font-mono">
                      {team.name}
                    </h3>
                    <p className="text-sm text-zinc-500 flex items-center gap-2">
                      {team.activeAssignments.length} piloto(s) ativo(s)
                      <span className="text-cyan-400 font-mono">
                        • {getTeamTotalPoints(team)} pts
                      </span>
                    </p>
                    {season.teamScoringMode === "DEPTH_CHART" && (
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-zinc-500">
                          Ordem da hierarquia define os 3 pilotos que pontuam por equipe
                        </p>
                        <p className="text-xs text-zinc-500">
                          Ultima atualizacao do depth chart: {formatDepthChartUpdatedAt(team.lastDepthChartUpdatedAt)}
                          {team.lastDepthChartRaceName
                            ? ` (${team.lastDepthChartRaceName})`
                            : team.lastDepthChartRound
                              ? ` (rodada ${team.lastDepthChartRound})`
                              : ""}
                        </p>
                      </div>
                    )}
                    {season.teamScoringMode === "SLOT_MULLIGAN" && (
                      <p className="text-xs text-zinc-500 mt-1">
                        Ordem D1/D2/D3 e reservas e configurada por corrida (Rosters)
                      </p>
                    )}
                  </div>
                </div>

                {!isArchived && (
                  <div className="flex items-center gap-2">
                    {season.teamScoringMode === "DEPTH_CHART" && (
                      <>
                        <button
                          onClick={() => openDepthBulkModal(team)}
                          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors"
                        >
                          <List size={16} />
                          Ordenar por Lista
                        </button>

                        <button
                          onClick={() => openDepthRoundModal(team.id)}
                          disabled={
                            !dirtyDepthChartTeamIds.includes(team.id) ||
                            savingDepthChartTeamIds.includes(team.id)
                          }
                          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg transition-colors"
                        >
                          {savingDepthChartTeamIds.includes(team.id) ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Salvando...
                            </>
                          ) : (
                            <>
                              <CheckCircle size={16} />
                              Salvar Ordem
                            </>
                          )}
                        </button>
                      </>
                    )}

                    {season.teamScoringMode === "SLOT_MULLIGAN" && (
                      <Link
                        href={`/admin/leagues/${leagueId}/seasons/${seasonId}/races`}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors"
                        title="Definir D1/D2/D3 por corrida"
                      >
                        <Settings size={16} />
                        Configurar Slots
                      </Link>
                    )}

                    <button
                      onClick={() => {
                        setSelectedTeamForAdd(team.id);
                        setShowAddModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                    >
                      <Plus size={16} />
                      Adicionar
                    </button>
                  </div>
                )}
              </div>

              {/* Drivers List */}
              <div className="p-5">
                {team.activeAssignments.length === 0 ? (
                  <p className="text-zinc-500 text-sm italic">
                    Nenhum piloto vinculado a esta equipe
                  </p>
                ) : (
                  <div className="space-y-2">
                    {orderedAssignments.map((assignment, index) => (
                      <div
                        key={assignment.id}
                        id={`driver-${assignment.driver.id}`}
                        draggable={season.teamScoringMode === "DEPTH_CHART" && !isArchived}
                        onDragStart={() =>
                          handleDepthDragStart(team, assignment.driver.id)
                        }
                        onDragEnd={handleDepthDragEnd}
                        onDragOver={(event) =>
                          handleDepthDragOver(event, team, assignment.driver.id)
                        }
                        onDrop={() => handleDepthDrop(team, assignment.driver.id)}
                        className={`bg-zinc-950/60 border rounded-lg transition-all duration-700 ${
                          highlightedDriverId === assignment.driver.id
                            ? "border-cyan-400 ring-2 ring-cyan-400/50 bg-cyan-500/5"
                            : dragOverDepthDriverId === assignment.driver.id &&
                                draggingDepth?.teamId === team.id
                              ? "border-cyan-500/70"
                              : "border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          {season.teamScoringMode === "DEPTH_CHART" && !isArchived && (
                            <span
                              aria-hidden="true"
                              className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 cursor-grab active:cursor-grabbing"
                              title="Arraste para reordenar"
                            >
                              <GripVertical size={14} />
                            </span>
                          )}

                          <span className="w-8 shrink-0 text-center text-xs font-mono text-zinc-500">
                            {season.teamScoringMode === "DEPTH_CHART"
                              ? `#${assignment.driver.depthPriority ?? index + 1}`
                              : `#${index + 1}`}
                          </span>

                          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-zinc-700">
                            <img
                              src={`https://minotar.net/helm/${assignment.driver.uuid}/32.png`}
                              alt={assignment.driver.currentName || "Driver"}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-white font-medium leading-tight truncate">
                              {assignment.driver.currentName ||
                                assignment.driver.uuid.slice(0, 8)}
                            </p>
                            <p className="text-xs text-zinc-500 font-mono truncate">
                              {assignment.driver.uuid}
                            </p>
                            <p className="text-[11px] text-zinc-400 mt-1 font-mono">
                              Na equipe {formatAssignmentRoundRange(assignment)}
                            </p>
                          </div>
                          <span className="px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono whitespace-nowrap">
                            {assignment.driver.seasonPoints ?? 0} pts
                          </span>

                          <div className="flex items-center gap-1">
                            {season.teamScoringMode === "DEPTH_CHART" && !isArchived && (
                              <>
                                <button
                                  onClick={() =>
                                    handleMoveDepthChart(team, assignment.id, "up")
                                  }
                                  disabled={index === 0}
                                  className="p-1.5 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-500 hover:text-zinc-300 rounded transition-colors"
                                  title="Subir na hierarquia"
                                >
                                  <ChevronUp size={14} />
                                </button>
                                <button
                                  onClick={() =>
                                    handleMoveDepthChart(team, assignment.id, "down")
                                  }
                                  disabled={index === orderedAssignments.length - 1}
                                  className="p-1.5 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-500 hover:text-zinc-300 rounded transition-colors"
                                  title="Descer na hierarquia"
                                >
                                  <ChevronDown size={14} />
                                </button>
                              </>
                            )}

                            {!assignment.driver.colorCode && (
                              <button
                                onClick={() =>
                                  handleSyncDriver(
                                    assignment.driver.id,
                                    assignment.driver.currentName || undefined,
                                  )
                                }
                                disabled={syncingDriverId === assignment.driver.id}
                                className="p-1.5 hover:bg-purple-500/10 text-zinc-500 hover:text-purple-400 rounded transition-colors"
                                title="Sincronizar dados com API FrostHex"
                              >
                                {syncingDriverId === assignment.driver.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <RefreshCw size={14} />
                                )}
                              </button>
                            )}

                            {!isArchived && (
                              <>
                                <button
                                  onClick={() => openTransferModal(assignment, team)}
                                  className="p-1.5 hover:bg-blue-500/10 text-zinc-400 hover:text-blue-400 rounded transition-colors"
                                  title="Transferir para outra equipe"
                                >
                                  <ArrowRightLeft size={14} />
                                </button>
                                <button
                                  onClick={() => handleRemoveDriver(assignment.id)}
                                  className="p-1.5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 rounded transition-colors"
                                  title="Remover da temporada"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
            );
          })
        )}

        {/* Teamless drivers */}
        {teamlessDrivers.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center border border-zinc-700 bg-zinc-800">
                  <Users size={28} className="text-zinc-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-mono">
                    Sem Equipe
                  </h3>
                  <p className="text-sm text-zinc-500 flex items-center gap-2">
                    {teamlessDrivers.length} piloto(s) sem equipe — participaram de corridas desta temporada
                    <span className="text-cyan-400 font-mono">
                      • {teamlessTotalPoints} pts
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {teamlessDrivers.map((driver) => (
                  <div
                    key={driver.id}
                    id={`driver-${driver.id}`}
                    className={`flex items-center gap-3 p-3 bg-zinc-950/50 border rounded-lg transition-all duration-700 group ${
                      highlightedDriverId === driver.id
                        ? "border-cyan-400 ring-2 ring-cyan-400/50 bg-cyan-500/5"
                        : "border-zinc-800"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden">
                      <img
                        src={`https://minotar.net/helm/${driver.uuid}/32.png`}
                        alt={driver.currentName || "Driver"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {driver.currentName || driver.uuid.slice(0, 8)}
                      </p>
                      <p className="text-xs text-zinc-500 font-mono truncate">
                        {driver.uuid}
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono whitespace-nowrap">
                      {driver.seasonPoints ?? 0} pts
                    </span>
                    {!isArchived && (
                      <button
                        onClick={() => openAssignTeamlessDriverModal(driver)}
                        className="p-1.5 hover:bg-cyan-500/10 text-zinc-400 hover:text-cyan-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title="Vincular a uma equipe"
                      >
                        <ArrowRightLeft size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showDepthRoundModal && depthRoundTeamId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div>
                <h3 className="text-lg font-bold text-white">Vigência do Depth Chart</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  {teams.find((team) => team.id === depthRoundTeamId)?.name ?? "Equipe"}
                </p>
              </div>
              <button
                onClick={closeDepthRoundModal}
                disabled={savingDepthChartTeamIds.includes(depthRoundTeamId)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
              >
                <X size={20} className="text-zinc-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-zinc-300">
                Escolha a corrida a partir da qual esta nova ordem deve valer
                (inclusive). Resultados anteriores não serão alterados.
              </p>

              <div>
                <label className="block text-xs uppercase tracking-wide font-semibold text-zinc-500 mb-2">
                  Corrida de vigência
                </label>
                <select
                  value={depthRoundValue}
                  onChange={(event) => setDepthRoundValue(Number(event.target.value))}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                >
                  {(season?.rounds ?? []).map((roundEntry) => (
                    <option key={roundEntry.id} value={roundEntry.round}>
                      Rodada {roundEntry.round} - {roundEntry.name}
                    </option>
                  ))}
                </select>
              </div>

              {depthRoundError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {depthRoundError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-zinc-800">
              <button
                onClick={closeDepthRoundModal}
                disabled={savingDepthChartTeamIds.includes(depthRoundTeamId)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleConfirmDepthRound()}
                disabled={savingDepthChartTeamIds.includes(depthRoundTeamId)}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {savingDepthChartTeamIds.includes(depthRoundTeamId) ? "Salvando..." : "Salvar ordem"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Depth Chart Bulk Order Modal */}
      {showDepthBulkModal && depthBulkTeam && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Ordenar Depth Chart por Lista
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Equipe: {depthBulkTeam.name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDepthBulkModal(false);
                  setDepthBulkTeam(null);
                  setDepthBulkInput("");
                  setDepthBulkError(null);
                }}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} className="text-zinc-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-zinc-400">
                Informe um piloto por linha (nome exato ou UUID). Os pilotos não
                listados serão mantidos no final, na ordem atual.
              </p>

              <textarea
                value={depthBulkInput}
                onChange={(e) => {
                  setDepthBulkInput(e.target.value);
                  if (depthBulkError) setDepthBulkError(null);
                }}
                rows={14}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 resize-y font-mono text-sm"
                placeholder="playerA\nplayerB\nplayerC"
              />

              {depthBulkError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {depthBulkError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowDepthBulkModal(false);
                    setDepthBulkTeam(null);
                    setDepthBulkInput("");
                    setDepthBulkError(null);
                  }}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleApplyDepthBulkOrder}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-lg transition-colors"
                >
                  Aplicar Ordem
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Driver Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white">
                Adicionar Piloto à Temporada
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetAddModal();
                }}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} className="text-zinc-400" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto max-h-[60vh]">
              {/* Mode Selection Tabs */}
              <div className="flex bg-zinc-950 rounded-lg p-1">
                <button
                  onClick={() => setAddMode("single")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    addMode === "single"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <UserPlus size={16} />
                  Individual
                </button>
                <button
                  onClick={() => setAddMode("batch")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    addMode === "batch"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <List size={16} />
                  Em Lote
                </button>
                <button
                  onClick={() => setAddMode("manual")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    addMode === "manual"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <AlertCircle size={16} />
                  Manual
                </button>
              </div>

              {/* Team Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Equipe (opcional)
                </label>
                <select
                  value={selectedTeamForAdd}
                  onChange={(e) => setSelectedTeamForAdd(e.target.value)}
                  className={`w-full px-4 py-2.5 bg-zinc-950 border rounded-lg text-white focus:outline-none focus:border-cyan-500/50 ${
                    !selectedTeamForAdd &&
                    (selectedDriver || addMode === "batch")
                      ? "border-red-500/50"
                      : "border-zinc-800"
                  }`}
                >
                  <option value="">Sem equipe</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1.5">
                  Deixe sem equipe para adicionar o piloto como avulso nesta temporada.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Rodada de Vigência
                </label>
                <select
                  value={effectiveRoundForAdd}
                  onChange={(e) =>
                    setEffectiveRoundForAdd(
                      e.target.value ? Number(e.target.value) : "",
                    )
                  }
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">Selecione a rodada...</option>
                  {season.rounds.map((round) => (
                    <option key={round.id} value={round.round}>
                      R{round.round} - {round.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1.5">
                  Vale a partir desta rodada (inclusive). Rodadas anteriores não são alteradas.
                </p>
              </div>

              {addMode === "single" ? (
                <>
                  {/* Single Mode - Search */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Buscar Piloto
                    </label>
                    <div className="relative">
                      <Search
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Digite o nome do jogador..."
                        className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Digite pelo menos 3 caracteres para buscar
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* Batch Mode - Text Area */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Lista de Usuários
                    </label>
                    <textarea
                      value={batchUsernames}
                      onChange={(e) => setBatchUsernames(e.target.value)}
                      placeholder="Cole a lista de usernames aqui...&#10;Um por linha, ou separados por vírgula&#10;Exemplo:&#10;player1&#10;player2&#10;player3"
                      rows={6}
                      disabled={batchProcessing}
                      className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 resize-none font-mono text-sm"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Separe os usernames por linha, vírgula ou espaço. Mínimo 3
                      caracteres cada.
                    </p>
                  </div>

                  {/* Batch Progress */}
                  {batchProcessing && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-zinc-400">
                          Processando...
                        </span>
                        <span className="text-sm font-mono text-cyan-400">
                          {batchProgress.current} / {batchProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-2">
                        <div
                          className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Batch Results Summary */}
                  {!batchProcessing && batchResults.total > 0 && (
                    <div
                      className={`rounded-lg p-4 ${
                        batchResults.failed === 0
                          ? "bg-green-500/10 border border-green-500/20"
                          : batchResults.success > 0
                            ? "bg-yellow-500/10 border border-yellow-500/20"
                            : "bg-red-500/10 border border-red-500/20"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {batchResults.failed === 0 ? (
                          <CheckCircle size={18} className="text-green-400" />
                        ) : (
                          <AlertCircle size={18} className="text-yellow-400" />
                        )}
                        <span
                          className={`font-medium ${
                            batchResults.failed === 0
                              ? "text-green-400"
                              : "text-yellow-400"
                          }`}
                        >
                          {batchResults.success} de {batchResults.total}{" "}
                          adicionados
                        </span>
                      </div>
                      {batchResults.errors.length > 0 && (
                        <div className="mt-2 max-h-32 overflow-y-auto">
                          <p className="text-xs text-zinc-500 mb-1">Erros:</p>
                          {batchResults.errors.slice(0, 5).map((error, idx) => (
                            <p key={idx} className="text-xs text-red-400">
                              • {error}
                            </p>
                          ))}
                          {batchResults.errors.length > 5 && (
                            <p className="text-xs text-zinc-500">
                              ... e mais {batchResults.errors.length - 5} erros
                            </p>
                          )}
                        </div>
                      )}
                      {batchResults.notFoundUsernames.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-zinc-700">
                          <p className="text-xs text-zinc-400 mb-2">
                            Buscar nomes não encontrados no NameMC:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {batchResults.notFoundUsernames.map((name) => (
                              <a
                                key={name}
                                href={`https://namemc.com/search?q=${encodeURIComponent(name)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300 transition-colors"
                              >
                                {name} →
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Searching indicator */}
              {(searching || isCreating) && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 text-cyan-500 animate-spin mr-2" />
                  <span className="text-zinc-400 text-sm">
                    {isCreating ? "Buscando nas APIs..." : "Buscando..."}
                  </span>
                </div>
              )}

              {/* Status message */}
              {createStatus && !isCreating && (
                <div
                  className={`flex items-start gap-2 p-3 rounded-lg ${
                    createStatus.type === "success"
                      ? "bg-green-500/10 border border-green-500/20"
                      : createStatus.type === "error"
                        ? "bg-red-500/10 border border-red-500/20"
                        : "bg-blue-500/10 border border-blue-500/20"
                  }`}
                >
                  {createStatus.type === "success" ? (
                    <CheckCircle size={18} className="text-green-400 mt-0.5" />
                  ) : createStatus.type === "error" ? (
                    <AlertCircle size={18} className="text-red-400 mt-0.5" />
                  ) : (
                    <Loader2
                      size={18}
                      className="text-blue-400 mt-0.5 animate-spin"
                    />
                  )}
                  <div
                    className={`text-sm ${
                      createStatus.type === "success"
                        ? "text-green-400"
                        : createStatus.type === "error"
                          ? "text-red-400"
                          : "text-blue-400"
                    }`}
                  >
                    <p>{createStatus.message}</p>
                    {createStatus.nameMCQuery && (
                      <a
                        href={`https://namemc.com/search?q=${encodeURIComponent(createStatus.nameMCQuery)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1.5 text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
                      >
                        Buscar &quot;{createStatus.nameMCQuery}&quot; no NameMC →
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Found Player Preview */}
              {foundPlayer && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden">
                      <img
                        src={`https://minotar.net/helm/${foundPlayer.uuid}/48.png`}
                        alt={foundPlayer.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-white font-medium text-lg">
                        {foundPlayer.name}
                      </p>
                      <p className="text-xs text-zinc-500 font-mono">
                        {foundPlayer.uuid}
                      </p>
                    </div>
                  </div>

                  {foundPlayer.source === "frosthex" && (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {foundPlayer.colorCode && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">Cor:</span>
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-4 h-4 rounded border border-zinc-700"
                              style={{ backgroundColor: foundPlayer.colorCode }}
                            />
                            <span className="text-zinc-300 font-mono text-xs">
                              {foundPlayer.colorCode}
                            </span>
                          </div>
                        </div>
                      )}
                      {foundPlayer.boatType && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">Barco:</span>
                          <span className="text-zinc-300">
                            {foundPlayer.boatType.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Previous Names Warning */}
                  {foundPlayer.previousNames &&
                    foundPlayer.previousNames.length > 0 && (
                      <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <p className="text-sm text-yellow-400 mb-1">
                          <strong>⚠ Nome alterado detectado</strong>
                        </p>
                        <p className="text-xs text-zinc-400">
                          Você buscou por:{" "}
                          <span className="text-zinc-300">
                            {foundPlayer.searchedName}
                          </span>
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Nomes anteriores:{" "}
                          <span className="text-zinc-300">
                            {foundPlayer.previousNames.join(", ")}
                          </span>
                        </p>
                      </div>
                    )}

                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <span
                      className={`text-[10px] uppercase font-mono tracking-wider px-2 py-1 rounded ${
                        foundPlayer.source === "frosthex"
                          ? "bg-purple-500/10 text-purple-400"
                          : "bg-blue-500/10 text-blue-400"
                      }`}
                    >
                      Fonte:{" "}
                      {foundPlayer.source === "frosthex"
                        ? "Frosthex"
                        : "Mojang"}
                    </span>
                  </div>
                </div>
              )}

              {/* Local Search Results */}
              {searchResults.length > 0 && !foundPlayer && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Resultados do Sistema
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {searchResults.map((driver) => (
                      <button
                        key={driver.id}
                        onClick={() => setSelectedDriver(driver)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          selectedDriver?.id === driver.id
                            ? "bg-cyan-500/10 border-cyan-500/50"
                            : "bg-zinc-950 border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden">
                          <img
                            src={`https://minotar.net/helm/${driver.uuid}/32.png`}
                            alt={driver.currentName || "Driver"}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="text-left flex-1">
                          <p className="text-white font-medium">
                            {driver.currentName || "Sem nome"}
                          </p>
                          <p className="text-xs text-zinc-500 font-mono">
                            {driver.uuid}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Driver from local results */}
              {selectedDriver && !foundPlayer && addMode === "single" && (
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                  <p className="text-sm text-cyan-400">
                    Piloto selecionado:{" "}
                    <strong>{selectedDriver.currentName}</strong>
                  </p>
                </div>
              )}

              {/* Manual Mode - UUID Input */}
              {addMode === "manual" && (
                <>
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-sm text-blue-400 mb-2">
                      <strong>Busca por nome antigo</strong>
                    </p>
                    <p className="text-xs text-zinc-400">
                      Se o jogador mudou de nome e você só tem o nome antigo,
                      procure no NameMC pelo nome antigo, copie o UUID do perfil
                      e cole abaixo.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      UUID do Jogador <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={manualUUID}
                      onChange={(e) => setManualUUID(e.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 font-mono text-sm"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Formato: com ou sem hífens. Ex:
                      069a79f4-44e9-4726-a5be-fca90e38aaf5
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Nome Atual (opcional)
                    </label>
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Nome que aparece no NameMC"
                      className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Se informado, será usado como nome inicial. Senão,
                      buscaremos na Mojang API.
                    </p>
                  </div>

                  {/* Create Status */}
                  {createStatus && addMode === "manual" && (
                    <div
                      className={`rounded-lg p-3 flex items-center gap-2 ${
                        createStatus.type === "success"
                          ? "bg-green-500/10 border border-green-500/20 text-green-400"
                          : createStatus.type === "error"
                            ? "bg-red-500/10 border border-red-500/20 text-red-400"
                            : "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                      }`}
                    >
                      {createStatus.type === "success" ? (
                        <CheckCircle size={16} />
                      ) : createStatus.type === "error" ? (
                        <AlertCircle size={16} />
                      ) : (
                        <Loader2 size={16} className="animate-spin" />
                      )}
                      <span className="text-sm">{createStatus.message}</span>
                    </div>
                  )}

                  {/* Selected Driver from manual creation */}
                  {selectedDriver && addMode === "manual" && (
                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                      <p className="text-sm text-cyan-400">
                        Piloto criado:{" "}
                        <strong>{selectedDriver.currentName}</strong>
                      </p>
                      <p className="text-xs text-zinc-500 font-mono mt-1">
                        {selectedDriver.uuid}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-zinc-800">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetAddModal();
                }}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              {addMode === "single" ? (
                <button
                  onClick={handleAssignDriver}
                  disabled={!selectedDriver || assigning || effectiveRoundForAdd === ""}
                  className="flex items-center gap-2 px-6 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg transition-colors"
                >
                  {assigning ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Vinculando...
                    </>
                  ) : (
                    <>
                      <Plus size={18} />
                      Adicionar Piloto
                    </>
                  )}
                </button>
              ) : addMode === "batch" ? (
                <button
                  onClick={handleBatchAdd}
                  disabled={
                    !batchUsernames.trim() ||
                    batchProcessing ||
                    effectiveRoundForAdd === ""
                  }
                  className="flex items-center gap-2 px-6 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg transition-colors"
                >
                  {batchProcessing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <List size={18} />
                      Adicionar em Lote
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleCreateManualDriver}
                  disabled={
                    !manualUUID.trim() ||
                    isCreating ||
                    !!selectedDriver
                  }
                  className="flex items-center gap-2 px-6 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg transition-colors"
                >
                  {isCreating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Criando...
                    </>
                  ) : selectedDriver ? (
                    <>
                      <CheckCircle size={18} />
                      Piloto Criado
                    </>
                  ) : (
                    <>
                      <Plus size={18} />
                      Criar Piloto
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && transferringAssignment && transferFromTeam && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white">
                Transferir Piloto
              </h3>
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferringAssignment(null);
                  setTransferFromTeam(null);
                  setSelectedTeamForTransfer("");
                  setEffectiveRoundForTransfer(season?.rounds[0]?.round ?? "");
                }}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} className="text-zinc-400" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Current Info */}
              <div className="flex items-center gap-3 p-3 bg-zinc-950 rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden">
                  <img
                    src={`https://minotar.net/helm/${transferringAssignment.driver.uuid}/32.png`}
                    alt={transferringAssignment.driver.currentName || "Driver"}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-white font-medium">
                    {transferringAssignment.driver.currentName}
                  </p>
                  <p className="text-xs text-zinc-500">
                    De:{" "}
                    <span
                      style={{ color: transferFromTeam.color || "#8b5cf6" }}
                    >
                      {transferFromTeam.name}
                    </span>
                  </p>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <ArrowRightLeft className="w-6 h-6 text-zinc-600" />
              </div>

              {/* Target Team Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Destino
                </label>
                <select
                  value={selectedTeamForTransfer}
                  onChange={(e) => setSelectedTeamForTransfer(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">Selecione o destino...</option>
                  <option value="__TEAMLESS__">Sem equipe (avulso)</option>
                  {teams
                    .filter((t) => t.id !== transferFromTeam.id)
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Rodada de Vigência
                </label>
                <select
                  value={effectiveRoundForTransfer}
                  onChange={(e) =>
                    setEffectiveRoundForTransfer(
                      e.target.value ? Number(e.target.value) : "",
                    )
                  }
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">Selecione a rodada...</option>
                  {season.rounds.map((round) => (
                    <option key={round.id} value={round.round}>
                      R{round.round} - {round.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1.5">
                  Aplica nesta rodada e nas seguintes (inclusive).
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-zinc-800">
              <button
                onClick={() => {
                    setShowTransferModal(false);
                    setTransferringAssignment(null);
                    setTransferFromTeam(null);
                    setSelectedTeamForTransfer("");
                    setEffectiveRoundForTransfer(season?.rounds[0]?.round ?? "");
                  }}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleTransfer}
                disabled={!selectedTeamForTransfer || transferring || effectiveRoundForTransfer === ""}
                className="flex items-center gap-2 px-6 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg transition-colors"
              >
                {transferring ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Transferindo...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft size={18} />
                    Transferir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
