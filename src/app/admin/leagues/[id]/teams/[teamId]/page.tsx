"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SmartLogoImage } from "@/components/SmartLogoImage";
import {
  ArrowLeft,
  Users,
  Calendar,
  Trophy,
  Plus,
  Minus,
  Search,
  X,
  Loader2,
  UserPlus,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  List,
  Upload,
  ImageIcon,
  Settings,
} from "lucide-react";
import {
  getTeamById,
  assignDriverToTeam,
  removeDriverFromTeam,
  searchDrivers,
  createDriverFromAPI,
  createDriverManually,
  getSeasons,
  syncDriverFromAPI,
  searchDriverByPreviousName,
  updateTeam,
  updateTeamLogoSettings,
} from "@/lib/leagues";

interface TeamPageProps {
  params: Promise<{
    id: string;
    teamId: string;
  }>;
}

interface Driver {
  id: string;
  uuid: string;
  currentName: string | null;
  colorCode?: string | null;
  boatType?: string | null;
  boatMaterial?: string | null;
}

interface Season {
  id: string;
  name: string;
  status: string;
}

interface Assignment {
  id: string;
  driver: Driver;
  season: Season;
  leftAt: Date | null;
  joinedAt: Date;
  source?: "assignment" | "depth-final";
  depthPriority?: number;
}

interface DepthChartEntry {
  id: string;
  driver: Driver;
  season: Season;
  priority: number;
}

interface Team {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  logoScale: number;
  logoPosX: number;
  logoPosY: number;
  league: {
    id: string;
    ownerId: string;
    admins: { userId: string }[];
  };
  assignments: Assignment[];
  depthChartEntries?: DepthChartEntry[];
  standings: {
    id: string;
    position: number;
    wins: number;
    season: { name: string };
  }[];
}

type SeasonAssignmentGroup = {
  season: Season;
  assignments: Assignment[];
};

interface FoundPlayer {
  uuid: string;
  name: string;
  colorCode?: string;
  boatType?: string;
  boatMaterial?: string;
  source: "frosthex" | "mojang";
  previousNames?: string[];
  searchedName?: string;
}

export default function TeamPage({ params }: TeamPageProps) {
  const { id: leagueId, teamId } = use(params);
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [availableSeasons, setAvailableSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add driver modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "batch" | "manual">("single");
  const [manualUUID, setManualUUID] = useState("");
  const [manualName, setManualName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Driver[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  // On-the-fly creation state
  const [isCreating, setIsCreating] = useState(false);
  const [foundPlayer, setFoundPlayer] = useState<FoundPlayer | null>(null);
  const [createStatus, setCreateStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
    nameMCQuery?: string;
    transferLink?: string;
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

  // Sync state
  const [syncingDriverId, setSyncingDriverId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    type: "success" | "error";
    message: string;
    driverName?: string;
  } | null>(null);

  // Sort state
  const [sortBy, setSortBy] = useState<"name" | "joined">("joined");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Logo upload state
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [colorPreview, setColorPreview] = useState<string>(team?.color || "#8b5cf6");

  // Logo adjustment state
  const [showLogoAdjustModal, setShowLogoAdjustModal] = useState(false);
  const [logoScale, setLogoScale] = useState(1);
  const [logoPosX, setLogoPosX] = useState(0);
  const [logoPosY, setLogoPosY] = useState(0);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStartValues, setDragStartValues] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    loadTeam();
  }, [teamId]);

  async function loadTeam() {
    try {
      const [teamResult, seasonsResult] = await Promise.all([
        getTeamById(teamId),
        getSeasons(leagueId),
      ]);

      if (teamResult.success && teamResult.data) {
        setTeam(teamResult.data as Team);
      } else {
        setError(teamResult.error || "Erro ao carregar equipe");
      }

      if (seasonsResult.success && seasonsResult.data) {
        const activeSeasons = (seasonsResult.data as Season[]).filter(
          (s) => s.status === "ACTIVE" || s.status === "DRAFT"
        );
        setAvailableSeasons(activeSeasons);
      }
    } catch {
      setError("Erro ao carregar equipe");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      // Reset states when query changes
      setFoundPlayer(null);
      setCreateStatus(null);

      if (searchQuery.length >= 3) {
        setSearching(true);
        try {
          // First, search in local database
          const localResult = await searchDrivers(searchQuery);
          if (localResult.success && localResult.data) {
            const drivers = localResult.data as Driver[];
            setSearchResults(drivers);

            // If no local results, trigger API search
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
                  message: createResult.message || "Piloto encontrado e criado!",
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
                // Try searching by previous name (local database + Mojang API)
                setCreateStatus({
                  type: "info",
                  message: "Buscando no histórico de nomes...",
                });

                const historyResult = await searchDriverByPreviousName(searchQuery);

                if (historyResult.success && 'data' in historyResult && historyResult.data) {
                  // Player found by previous name
                  const { driver, currentName, nameHistory } = historyResult.data;

                  // Use the existing driver from database
                  const driverData = driver as Driver;
                  setSearchResults([driverData]);
                  setSelectedDriver(driverData);

                  const previousNames = nameHistory
                    .map((entry: { name: string }) => entry.name)
                    .filter((name: string) => name.toLowerCase() !== currentName.toLowerCase());

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
    if (!selectedDriver || !selectedSeason) return;

    setAssigning(true);
    const result = await assignDriverToTeam(
      selectedSeason,
      teamId,
      selectedDriver.id
    );

    if (result.success) {
      setShowAddModal(false);
      resetModal();
      loadTeam();
      router.refresh();
    } else {
      setCreateStatus({
        type: "error",
        message: result.error || "Erro ao vincular piloto",
        transferLink:
          result.error?.includes("já está ativo") && selectedDriver && selectedSeason
            ? `/admin/leagues/${leagueId}/seasons/${selectedSeason}/drivers?highlight=${selectedDriver.id}`
            : undefined,
      });
    }
    setAssigning(false);
  }

  function resetModal() {
    setAddMode("single");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedDriver(null);
    setSelectedSeason("");
    setFoundPlayer(null);
    setCreateStatus(null);
    setIsCreating(false);
    setBatchUsernames("");
    setBatchProgress({ current: 0, total: 0 });
    setBatchResults({ success: 0, failed: 0, total: 0, errors: [], notFoundUsernames: [] });
    setManualUUID("");
    setManualName("");
    setError(null);
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
      manualName.trim() || undefined
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
    if (!selectedSeason || !batchUsernames.trim()) return;

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
    setBatchResults({ success: 0, failed: 0, total: usernames.length, errors: [], notFoundUsernames: [] });

    const results = { success: 0, failed: 0, total: usernames.length, errors: [] as string[], notFoundUsernames: [] as string[] };

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      setBatchProgress({ current: i + 1, total: usernames.length });

      try {
        // Create or get driver from API
        const createResult = await createDriverFromAPI(username);

        if (!createResult.success || !createResult.data) {
          results.failed++;
          results.errors.push(`${username}: ${createResult.error || "Não encontrado"}`);
          if (!createResult.data) results.notFoundUsernames.push(username);
          continue;
        }

        const driver = createResult.data as Driver;

        // Assign to team
        const assignResult = await assignDriverToTeam(selectedSeason, teamId, driver.id);

        if (assignResult.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(`${username}: ${assignResult.error || "Erro ao vincular"}`);
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`${username}: Erro inesperado`);
      }
    }

    setBatchResults(results);
    setBatchProcessing(false);

    if (results.success > 0) {
      loadTeam();
      router.refresh();
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
    if (!confirm("Tem certeza que deseja remover este piloto da equipe?"))
      return;

    const result = await removeDriverFromTeam(assignmentId);
    if (result.success) {
      loadTeam();
      router.refresh();
    } else {
      setError(result.error || "Erro ao remover piloto");
    }
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
      loadTeam();
      router.refresh();
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

  // Logo upload functions
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Por favor, selecione uma imagem válida.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 2MB.");
      return;
    }

    setIsUploadingLogo(true);
    setError(null);

    const uploadData = new FormData();
    uploadData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadData,
      });

      const data = await response.json();

      if (response.ok && data.url) {
        setLogoPreview(data.url);
      } else {
        throw new Error(data.error || "Erro no upload");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setError("Falha ao carregar imagem para o storage.");
    } finally {
      setIsUploadingLogo(false);
    }
  }

  function openLogoModal() {
    setLogoPreview(team?.logoUrl || null);
    setColorPreview(team?.color || "#8b5cf6");
    setShowLogoModal(true);
  }

  function closeLogoModal() {
    setShowLogoModal(false);
    setLogoPreview(null);
  }

  async function handleSaveTeamSettings() {
    const result = await updateTeam(teamId, {
      logoUrl: logoPreview || undefined,
      color: colorPreview,
    });

    if (result.success) {
      setTeam((prev) =>
        prev
          ? { ...prev, logoUrl: logoPreview || null, color: colorPreview }
          : null
      );
      setShowLogoModal(false);
      setLogoPreview(null);
      router.refresh();
    } else {
      setError(result.error || "Erro ao atualizar equipe");
    }
  }

  // Logo adjustment functions
  function openLogoAdjustModal() {
    setLogoScale(team?.logoScale ?? 1);
    setLogoPosX(team?.logoPosX ?? 0);
    setLogoPosY(team?.logoPosY ?? 0);
    setShowLogoAdjustModal(true);
  }

  function closeLogoAdjustModal() {
    setShowLogoAdjustModal(false);
    setDragStartPos(null);
    setDragStartValues(null);
  }

  async function handleSaveLogoSettings() {
    const result = await updateTeamLogoSettings(teamId, {
      logoScale: logoScale,
      logoPosX: logoPosX,
      logoPosY: logoPosY,
    });

    if (result.success) {
      setTeam((prev) =>
        prev
          ? { ...prev, logoScale, logoPosX, logoPosY }
          : null
      );
      setShowLogoAdjustModal(false);
      router.refresh();
    } else {
      setError(result.error || "Erro ao salvar configurações do logo");
    }
  }

  function resetLogoSettings() {
    setLogoScale(1);
    setLogoPosX(0);
    setLogoPosY(0);
  }

  function handleLogoDragStart(clientX: number, clientY: number) {
    setDragStartPos({ x: clientX, y: clientY });
    setDragStartValues({ x: logoPosX, y: logoPosY });
  }

  function handleLogoDragMove(clientX: number, clientY: number) {
    if (!dragStartPos || !dragStartValues) return;
    // 0.25 converts pixel delta to position % (feels natural in a 256px preview)
    const newX = dragStartValues.x + (clientX - dragStartPos.x) * 0.25;
    const newY = dragStartValues.y + (clientY - dragStartPos.y) * 0.25;
    setLogoPosX(Math.max(-50, Math.min(50, Math.round(newX))));
    setLogoPosY(Math.max(-50, Math.min(50, Math.round(newY))));
  }

  function handleLogoDragEnd() {
    setDragStartPos(null);
    setDragStartValues(null);
  }

  function handleLogoWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setLogoScale((prev) =>
      Math.max(0.5, Math.min(3, Math.round((prev + delta) * 10) / 10))
    );
  }

  function adjustZoom(delta: number) {
    setLogoScale((prev) =>
      Math.max(0.5, Math.min(3, Math.round((prev + delta) * 10) / 10))
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-zinc-400">Equipe não encontrada</p>
      </div>
    );
  }

  const liveAssignments: Assignment[] = team.assignments
    .filter(
      (a) =>
        !a.leftAt &&
        (a.season.status === "ACTIVE" || a.season.status === "DRAFT"),
    )
    .map((a) => ({ ...a, source: "assignment" }));

  const completedDepthAssignments: Assignment[] = (team.depthChartEntries ?? [])
    .filter(
      (entry) =>
        (entry.season.status === "COMPLETED" || entry.season.status === "ARCHIVED"),
    )
    .map((entry) => ({
      id: `depth-${entry.id}`,
      driver: entry.driver,
      season: entry.season,
      leftAt: null,
      joinedAt: new Date(0),
      source: "depth-final",
      depthPriority: entry.priority,
    }));

  const activeAssignments = [...liveAssignments, ...completedDepthAssignments];

  // Sort assignments based on current sort settings (inside each season group)
  const sortAssignments = (assignments: Assignment[]) =>
    [...assignments].sort((a, b) => {
    if (a.depthPriority != null && b.depthPriority != null) {
      return a.depthPriority - b.depthPriority;
    }

    if (sortBy === "name") {
      const nameA = a.driver.currentName || "";
      const nameB = b.driver.currentName || "";
      return sortOrder === "asc"
        ? nameA.localeCompare(nameB)
        : nameB.localeCompare(nameA);
    } else {
      // sortBy === "joined"
      const dateA = new Date(a.joinedAt).getTime();
      const dateB = new Date(b.joinedAt).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    }
  });

  const statusWeight: Record<string, number> = {
    ACTIVE: 0,
    DRAFT: 1,
    COMPLETED: 2,
    ARCHIVED: 3,
  };

  const assignmentGroupsBySeason: SeasonAssignmentGroup[] = Object.values(
    activeAssignments.reduce<Record<string, SeasonAssignmentGroup>>((acc, assignment) => {
      const key = assignment.season.id;
      if (!acc[key]) {
        acc[key] = {
          season: assignment.season,
          assignments: [],
        };
      }
      acc[key].assignments.push(assignment);
      return acc;
    }, {}),
  )
    .map((group) => ({
      ...group,
      assignments: sortAssignments(group.assignments),
    }))
    .sort((a, b) => {
      const statusDiff =
        (statusWeight[a.season.status] ?? 99) -
        (statusWeight[b.season.status] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      return a.season.name.localeCompare(b.season.name);
    });

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/leagues/${leagueId}/teams`}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-zinc-400" />
        </Link>
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={openLogoModal}
            className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center border border-zinc-700 hover:border-cyan-500/50 transition-colors group relative"
            style={{
              backgroundColor: team.color ? `${team.color}20` : "#27272a",
            }}
            title="Clique para trocar o logo"
          >
            <SmartLogoImage
              src={team.logoUrl}
              alt={team.name}
              className="w-full h-full"
              fallbackClassName="w-full h-full flex items-center justify-center"
              fallbackIconClassName="w-10 h-10"
              scale={team.logoScale}
              posX={team.logoPosX}
              posY={team.logoPosY}
              autoBackground
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Upload size={20} className="text-white" />
            </div>
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white tracking-tight font-mono">
              {team.name}
            </h1>
            <p className="text-zinc-400 text-sm">Detalhes da equipe</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openLogoAdjustModal}
              disabled={!team.logoUrl}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg transition-colors"
              title="Ajustar posição e zoom do logo"
            >
              <ArrowUpDown size={18} />
              <span className="hidden sm:inline">Ajustar Logo</span>
            </button>
            <button
              onClick={openLogoModal}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              <Settings size={18} />
              <span className="hidden sm:inline">Configurar</span>
            </button>
          </div>
        </div>
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
              {syncStatus.type === "success" ? "Sincronização concluída" : "Erro na sincronização"}
            </p>
            <p className="text-sm opacity-90">
              {syncStatus.driverName && <span className="font-medium">{syncStatus.driverName}: </span>}
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

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: team.color
                  ? `${team.color}20`
                  : "rgba(139, 92, 246, 0.2)",
              }}
            >
              <div
                className="w-5 h-5 rounded-full"
                style={{ backgroundColor: team.color || "#8b5cf6" }}
              />
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Cor
              </p>
              <p className="text-white font-mono text-sm">
                {team.color?.toUpperCase() || "N/A"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Pilotos Ativos
              </p>
              <p className="text-white font-mono text-lg">
                {activeAssignments.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">
                Histórico Total
              </p>
              <p className="text-white font-mono text-lg">
                {team.assignments.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Drivers */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-mono">
                Pilotos Ativos
              </h3>
              <p className="text-xs text-zinc-500">
                Pilotos atualmente vinculados, agrupados por temporada
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Sort Controls */}
            <div className="flex items-center gap-2 bg-zinc-950 rounded-lg p-1">
              <button
                onClick={() => setSortBy("joined")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  sortBy === "joined"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="Ordenar por data de inserção"
              >
                <Calendar size={14} />
                Inserção
                {sortBy === "joined" &&
                  (sortOrder === "asc" ? (
                    <ArrowUp size={12} />
                  ) : (
                    <ArrowDown size={12} />
                  ))}
              </button>
              <button
                onClick={() => setSortBy("name")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  sortBy === "name"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="Ordenar por nome"
              >
                <Users size={14} />
                Nome
                {sortBy === "name" &&
                  (sortOrder === "asc" ? (
                    <ArrowUp size={12} />
                  ) : (
                    <ArrowDown size={12} />
                  ))}
              </button>
              <div className="w-px h-4 bg-zinc-800 mx-1" />
              <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-md transition-colors"
                title={sortOrder === "asc" ? "Ordem crescente" : "Ordem decrescente"}
              >
                <ArrowUpDown size={14} />
              </button>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-lg transition-colors"
            >
              <UserPlus size={18} />
              Adicionar Piloto
            </button>
          </div>
        </div>

        <div className="p-5">
          {assignmentGroupsBySeason.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">
                Nenhum piloto ativo nesta equipe
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                Clique em &quot;Adicionar Piloto&quot; para vincular um piloto
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {assignmentGroupsBySeason.map((group) => (
                <div
                  key={group.season.id}
                  className="border border-zinc-800/70 rounded-xl overflow-hidden"
                >
                  <div className="px-4 py-3 bg-zinc-950/70 border-b border-zinc-800/70 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-zinc-100 font-semibold">{group.season.name}</p>
                      <p className="text-xs text-zinc-500">
                        {group.assignments.length} piloto(s)
                      </p>
                    </div>
                    <span
                      className={`text-[10px] uppercase font-mono tracking-wider px-2.5 py-1 rounded-full ${
                        group.season.status === "ACTIVE"
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : group.season.status === "DRAFT"
                            ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                            : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {group.season.status}
                    </span>
                  </div>

                  <div className="p-3 space-y-3">
                    {group.assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-center gap-4 p-4 bg-zinc-950/50 border border-zinc-800/50 rounded-xl"
                      >
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden">
                          <img
                            src={`https://minotar.net/helm/${assignment.driver.uuid}/32.png`}
                            alt={assignment.driver.currentName || "Driver"}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium">
                            {assignment.driver.currentName ||
                              assignment.driver.uuid.slice(0, 8)}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {assignment.source === "depth-final" && assignment.depthPriority != null
                              ? `Depth final: P${assignment.depthPriority}`
                              : `Inserido em ${new Date(assignment.joinedAt).toLocaleDateString("pt-BR")}`}
                          </p>
                        </div>

                        {!assignment.driver.colorCode && (
                          <button
                            onClick={() => handleSyncDriver(assignment.driver.id, assignment.driver.currentName || undefined)}
                            disabled={syncingDriverId === assignment.driver.id}
                            className="p-2 hover:bg-purple-500/10 text-zinc-500 hover:text-purple-400 rounded-lg transition-colors"
                            title="Sincronizar dados com API FrostHex"
                          >
                            {syncingDriverId === assignment.driver.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <RefreshCw size={16} />
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => handleRemoveDriver(assignment.id)}
                          className="p-2 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 rounded-lg transition-colors"
                          title="Remover piloto"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Standings History */}
      {team.standings.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-5 border-b border-zinc-800/80">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-mono">
                Histórico de Classificação
              </h3>
              <p className="text-xs text-zinc-500">
                Desempenho em temporadas anteriores
              </p>
            </div>
          </div>

          <div className="p-5">
            <div className="space-y-2">
              {team.standings.map((standing) => (
                <div
                  key={standing.id}
                  className="flex items-center justify-between p-3 bg-zinc-950/50 rounded-lg"
                >
                  <span className="text-zinc-400 text-sm">
                    {standing.season.name}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-zinc-500 text-xs">
                      {standing.wins} vitórias
                    </span>
                    <span className="text-white font-mono font-bold">
                      {standing.position}º
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Logo Upload Modal */}
      {showLogoModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white">Configurar Equipe</h3>
              <button
                onClick={closeLogoModal}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} className="text-zinc-400" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Logo Preview */}
              <div className="flex justify-center">
                <div
                  className="w-32 h-32 rounded-xl overflow-hidden flex items-center justify-center border-2 border-dashed border-zinc-700"
                  style={{
                    backgroundColor: team?.color ? `${team.color}20` : "#27272a",
                  }}
                >
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Preview"
                      className="w-full h-full object-contain p-2"
                    />
                  ) : (
                    <ImageIcon className="w-12 h-12 text-zinc-600" />
                  )}
                </div>
              </div>

              {/* Upload Button */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-300">
                  Upload de Imagem
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={isUploadingLogo}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors disabled:opacity-50">
                    {isUploadingLogo ? (
                      <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
                    ) : (
                      <Upload className="w-5 h-5 text-zinc-400" />
                    )}
                    <span className="text-zinc-300">
                      {isUploadingLogo ? "Enviando..." : "Selecionar imagem"}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500">
                  PNG, JPG ou WEBP (Max 2MB)
                </p>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-300">
                  Ou cole uma URL
                </label>
                <input
                  type="url"
                  value={logoPreview || ""}
                  onChange={(e) => setLogoPreview(e.target.value || null)}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm"
                />
              </div>

              <div className="h-px bg-zinc-800" />

              {/* Color Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-300">
                  Cor da Equipe
                </label>
                <div className="flex gap-3">
                  <input
                    type="color"
                    value={colorPreview}
                    onChange={(e) => setColorPreview(e.target.value)}
                    className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                  <input
                    type="text"
                    value={colorPreview}
                    onChange={(e) => setColorPreview(e.target.value)}
                    placeholder="#8b5cf6"
                    className="flex-1 px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm font-mono uppercase"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-zinc-800">
              <button
                onClick={closeLogoModal}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTeamSettings}
                disabled={isUploadingLogo}
                className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg transition-colors"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logo Adjustment Modal */}
      {showLogoAdjustModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onMouseMove={(e) => handleLogoDragMove(e.clientX, e.clientY)}
          onMouseUp={handleLogoDragEnd}
          onMouseLeave={handleLogoDragEnd}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white">Ajustar Logo</h3>
              <button
                onClick={closeLogoAdjustModal}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} className="text-zinc-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Draggable preview */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-64 h-64 rounded-xl overflow-hidden border-2 border-zinc-700 select-none ${
                    dragStartPos ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{
                    backgroundColor: team?.color ? `${team.color}20` : "#27272a",
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleLogoDragStart(e.clientX, e.clientY);
                  }}
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    handleLogoDragStart(t.clientX, t.clientY);
                  }}
                  onTouchMove={(e) => {
                    const t = e.touches[0];
                    handleLogoDragMove(t.clientX, t.clientY);
                  }}
                  onTouchEnd={handleLogoDragEnd}
                  onWheel={handleLogoWheel}
                >
                  {team?.logoUrl && (
                    <img
                      src={team.logoUrl}
                      alt="Preview"
                      className="w-full h-full object-contain"
                      style={{
                        transform: `scale(${logoScale}) translate(${logoPosX}%, ${logoPosY}%)`,
                        transformOrigin: "center center",
                        pointerEvents: "none",
                      }}
                      draggable={false}
                    />
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  Arraste para reposicionar · Scroll para zoom
                </p>
              </div>

              {/* Zoom controls */}
              <div className="flex items-center gap-3 bg-zinc-950 rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-zinc-400 flex-shrink-0">Zoom</span>
                <button
                  onClick={() => adjustZoom(-0.1)}
                  className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <Minus size={14} />
                </button>
                <div className="flex-1 text-center font-mono text-white text-sm">
                  {logoScale.toFixed(1)}x
                </div>
                <button
                  onClick={() => adjustZoom(0.1)}
                  className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setLogoPosX(0); setLogoPosY(0); }}
                  className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm"
                >
                  Centralizar
                </button>
                <button
                  onClick={resetLogoSettings}
                  className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm"
                >
                  Resetar tudo
                </button>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-zinc-800">
              <button
                onClick={closeLogoAdjustModal}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveLogoSettings}
                className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-lg transition-colors"
              >
                Salvar
              </button>
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
                Adicionar Piloto à Equipe
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetModal();
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

              {/* Season Selection */}
              {availableSeasons.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Temporada <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(e.target.value)}
                    className={`w-full px-4 py-2.5 bg-zinc-950 border rounded-lg text-white focus:outline-none focus:border-cyan-500/50 ${
                      !selectedSeason && (selectedDriver || addMode === "batch")
                        ? "border-red-500/50"
                        : "border-zinc-800"
                    }`}
                  >
                    <option value="">Selecione uma temporada...</option>
                    {availableSeasons.map((season) => (
                      <option key={season.id} value={season.id}>
                        {season.name} ({season.status})
                      </option>
                    ))}
                  </select>
                  {!selectedSeason && (selectedDriver || addMode === "batch") && (
                    <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={12} />
                      Selecione uma temporada para continuar
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-sm text-yellow-400">
                    Não há temporadas ativas ou em rascunho para vincular
                    pilotos.
                  </p>
                </div>
              )}

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
                      <div className={`text-sm ${
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
                        {createStatus.transferLink && (
                          <Link
                            href={createStatus.transferLink}
                            className="inline-flex items-center gap-1 mt-1.5 text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
                          >
                            Ir para transferências →
                          </Link>
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

                      {/* Extra data from Frosthex */}
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
                      {foundPlayer.previousNames && foundPlayer.previousNames.length > 0 && (
                        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                          <p className="text-sm text-yellow-400 mb-1">
                            <strong>⚠ Nome alterado detectado</strong>
                          </p>
                          <p className="text-xs text-zinc-400">
                            Você buscou por: <span className="text-zinc-300">{foundPlayer.searchedName}</span>
                          </p>
                          <p className="text-xs text-zinc-400 mt-1">
                            Nomes anteriores: <span className="text-zinc-300">{foundPlayer.previousNames.join(", ")}</span>
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
                          Fonte: {foundPlayer.source === "frosthex" ? "Frosthex" : "Mojang"}
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
                  {selectedDriver && !foundPlayer && (
                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                      <p className="text-sm text-cyan-400">
                        Piloto selecionado: <strong>{selectedDriver.currentName}</strong>
                      </p>
                    </div>
                  )}
                </>
              ) : addMode === "batch" ? (
                <>
                  {/* Batch Mode - Text Area */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Lista de Usuários
                    </label>
                    <textarea
                      value={batchUsernames}
                      onChange={(e) => setBatchUsernames(e.target.value)}
                      placeholder="Cole a lista de usernames aqui...
Um por linha, ou separados por vírgula
Exemplo:
player1
player2
player3"
                      rows={6}
                      disabled={batchProcessing}
                      className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 resize-none font-mono text-sm"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Separe os usernames por linha, vírgula ou espaço. Mínimo 3 caracteres cada.
                    </p>
                  </div>

                  {/* Batch Progress */}
                  {batchProcessing && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-zinc-400">Processando...</span>
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
                            batchResults.failed === 0 ? "text-green-400" : "text-yellow-400"
                          }`}
                        >
                          {batchResults.success} de {batchResults.total} adicionados
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
              ) : addMode === "manual" ? (
                <>
                  {/* Manual Mode - UUID Input */}
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-sm text-blue-400 mb-2">
                      <strong>Busca por nome antigo</strong>
                    </p>
                    <p className="text-xs text-zinc-400">
                      Se o jogador mudou de nome e você só tem o nome antigo, procure no NameMC
                      pelo nome antigo, copie o UUID do perfil e cole abaixo.
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
                      Formato: com ou sem hífens. Ex: 069a79f4-44e9-4726-a5be-fca90e38aaf5
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
                      Se informado, será usado como nome inicial. Senão, buscaremos na Mojang API.
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
                        Piloto criado: <strong>{selectedDriver.currentName}</strong>
                      </p>
                      <p className="text-xs text-zinc-500 font-mono mt-1">
                        {selectedDriver.uuid}
                      </p>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-zinc-800">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetModal();
                }}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              {addMode === "single" ? (
                <button
                  onClick={handleAssignDriver}
                  disabled={!selectedDriver || !selectedSeason || assigning}
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
                  disabled={!selectedSeason || !batchUsernames.trim() || batchProcessing}
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
                  disabled={!selectedSeason || !manualUUID.trim() || isCreating || !!selectedDriver}
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
    </div>
  );
}
