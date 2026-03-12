import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  activateSeason,
  completeSeason,
  cloneSeasonForTesting,
  archiveSeason,
  restoreSeason,
  deleteSeason,
} from "@/lib/leagues/seasonActions";
import {
  ArrowLeft,
  Trophy,
  Flag,
  Users,
  Play,
  CheckCircle,
  Archive,
  RotateCcw,
  Copy,
  Trash2,
  Settings,
  ChevronRight,
} from "lucide-react";
import { SeasonFinalSummary } from "@/components/SeasonFinalSummary";
import { ConfirmActionButton } from "@/components/ConfirmActionButton";
import { RecalculateStandingsButton } from "./RecalculateStandingsButton";

interface SeasonPageProps {
  params: Promise<{
    id: string;
    seasonId: string;
  }>;
}

export default async function SeasonPage({ params }: SeasonPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

  const { id, seasonId } = await params;

  const season = await prisma.season.findFirst({
    where:
      session.user.role === "SUPER_ADMIN"
        ? { id: seasonId, leagueId: id }
        : {
            id: seasonId,
            leagueId: id,
            league: {
              OR: [
                { ownerId: session.user.id },
                { admins: { some: { userId: session.user.id } } },
              ],
            },
          },
    select: {
      id: true,
      name: true,
      status: true,
      year: true,
      pointsSystem: true,
      league: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          admins: {
            select: { userId: true },
          },
        },
      },
      _count: {
        select: {
          races: true,
          teamAssignments: true,
        },
      },
    },
  });

  if (!season) {
    notFound();
  }

  const [recentRaces, completedRacesCount, driverStandingsCount, driverStandingsTop3, teamStandingsTop3] =
    await prisma.$transaction([
      prisma.race.findMany({
        where: { seasonId },
        orderBy: [{ scheduledDate: "desc" }, { round: "desc" }],
        take: 3,
        select: {
          id: true,
          name: true,
          round: true,
          status: true,
          scheduledDate: true,
          _count: {
            select: { eventRounds: true },
          },
        },
      }),
      prisma.race.count({
        where: { seasonId, status: "COMPLETED" },
      }),
      prisma.standing.count({
        where: { seasonId, type: "DRIVER" },
      }),
      prisma.standing.findMany({
        where: { seasonId, type: "DRIVER" },
        orderBy: { position: "asc" },
        take: 3,
        select: {
          id: true,
          position: true,
          totalPoints: true,
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
        take: 3,
        select: {
          id: true,
          position: true,
          totalPoints: true,
          team: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              color: true,
              logoScale: true,
              logoPosX: true,
              logoPosY: true,
            },
          },
        },
      }),
    ]);

  const league = season.league;
  const hasConfiguredPointsSystem = Boolean(
    (season.pointsSystem as { rules?: { configuredByAdmin?: boolean } } | null)?.rules
      ?.configuredByAdmin,
  );

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const isOwner = league.ownerId === session.user.id;
  const isAdmin =
    isSuperAdmin ||
    isOwner ||
    league.admins.some((a) => a.userId === session.user.id);

  const normalizedDriverStandings = driverStandingsTop3
    .flatMap((standing) =>
      standing.driver
        ? [
            {
              id: standing.driver.id,
              name: standing.driver.currentName ?? "Piloto desconhecido",
              points: standing.totalPoints,
              position: standing.position,
              imageUrl: `https://mc-heads.net/avatar/${standing.driver.uuid}/32`,
              imageVariant: "avatar" as const,
            },
          ]
        : [],
    )
    .sort((a, b) => a.position - b.position);

  const normalizedTeamStandings = teamStandingsTop3
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

  const getStatusBadge = (status: string) => {
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
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
        <Link
          href={`/admin/leagues/${id}/seasons`}
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
              href={`/admin/leagues/${id}`}
              className="hover:text-cyan-400 transition-colors"
            >
              {league.name}
            </Link>
            <ChevronRight size={14} />
            <Link
              href={`/admin/leagues/${id}/seasons`}
              className="hover:text-cyan-400 transition-colors"
            >
              Temporadas
            </Link>
            <ChevronRight size={14} />
            <span className="text-zinc-300">{season.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono">
              {season.name}
            </h1>
            {getStatusBadge(season.status)}
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider border ${
                hasConfiguredPointsSystem
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              }`}
            >
              {hasConfiguredPointsSystem
                ? "Pontuação configurada"
                : "Pontuação pendente"}
            </span>
          </div>
        </div>

        {isAdmin && (
          <Link
            href={`/admin/leagues/${id}/seasons/${seasonId}/settings`}
            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors group"
            title="Configurações"
          >
            <Settings
              size={20}
              className="text-zinc-400 group-hover:text-white transition-colors"
            />
          </Link>
        )}
      </div>

      {/* Stats Grid - Estilo Compacto com Borda Esquerda */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 border-l-4 border-cyan-500 rounded-r-xl p-4 hover:bg-zinc-900 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                <Flag className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <div className="text-xl font-bold text-white font-mono">
                  {season._count.races}
                </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Corridas
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 border-l-4 border-purple-500 rounded-r-xl p-4 hover:bg-zinc-900 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
              <div>
                <div className="text-xl font-bold text-white font-mono">
                  {season._count.teamAssignments}
                </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Pilotos cadastrados
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 border-l-4 border-yellow-500 rounded-r-xl p-4 hover:bg-zinc-900 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/15 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
              <div>
                <div className="text-xl font-bold text-white font-mono">
                  {driverStandingsCount}
                </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Pilotos classificados
              </div>
            </div>
          </div>
        </div>

      </div>

      {season.status === "COMPLETED" && (
        <SeasonFinalSummary
          driverChampion={driverChampion}
          teamChampion={teamChampion}
          topDrivers={topDrivers}
          topTeams={topTeams}
          completedRacesCount={completedRacesCount}
          standingsHref={`/admin/leagues/${id}/seasons/${seasonId}/standings`}
          racesHref={`/admin/leagues/${id}/seasons/${seasonId}/races`}
        />
      )}

      {/* Quick Actions - Estilo de Cards de Navegação */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <Link
          href={`/admin/leagues/${id}/seasons/${seasonId}/races`}
          className="group relative bg-gradient-to-br from-zinc-900 to-zinc-900/80 border border-zinc-800 hover:border-cyan-500/40 rounded-2xl p-6 transition-all hover:shadow-xl hover:shadow-cyan-500/5 overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative">
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center group-hover:from-cyan-500/30 group-hover:to-cyan-600/20 transition-all duration-300">
                <Flag className="w-7 h-7 text-cyan-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors">
              Corridas
            </h3>
            <p className="text-sm text-zinc-500">
              Gerencie o calendário de corridas da temporada
            </p>
          </div>
        </Link>

        <Link
          href={`/admin/leagues/${id}/seasons/${seasonId}/drivers`}
          className="group relative bg-gradient-to-br from-zinc-900 to-zinc-900/80 border border-zinc-800 hover:border-purple-500/40 rounded-2xl p-6 transition-all hover:shadow-xl hover:shadow-purple-500/5 overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative">
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center group-hover:from-purple-500/30 group-hover:to-purple-600/20 transition-all duration-300">
                <Users className="w-7 h-7 text-purple-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-purple-400 transition-colors">
              Pilotos
            </h3>
            <p className="text-sm text-zinc-500">
              Gerencie pilotos e equipes participantes
            </p>
          </div>
        </Link>

        <Link
          href={`/admin/leagues/${id}/seasons/${seasonId}/standings`}
          className="group relative bg-gradient-to-br from-zinc-900 to-zinc-900/80 border border-zinc-800 hover:border-yellow-500/40 rounded-2xl p-6 transition-all hover:shadow-xl hover:shadow-yellow-500/5 overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative">
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 flex items-center justify-center group-hover:from-yellow-500/30 group-hover:to-yellow-600/20 transition-all duration-300">
                <Trophy className="w-7 h-7 text-yellow-400" />
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-yellow-400 transition-colors" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-yellow-400 transition-colors">
              Classificação
            </h3>
            <p className="text-sm text-zinc-500">
              Visualize a classificação atual da temporada
            </p>
          </div>
        </Link>
      </div>

      {/* Recent Races */}
      {recentRaces.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <h2 className="text-xl font-bold text-white tracking-tight font-mono">
              Corridas Recentes
            </h2>
            <Link
              href={`/admin/leagues/${id}/seasons/${seasonId}/races`}
              className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-cyan-500/10 transition-colors"
            >
              Ver todas
              <ChevronRight size={16} />
            </Link>
          </div>

          <div className="space-y-3">
            {recentRaces.map(
                (race: {
                  id: string;
                  name: string;
                  round: number;
                  status: string;
                  _count?: { eventRounds?: number };
                }) => (
                  <Link
                    key={race.id}
                    href={`/admin/leagues/${id}/seasons/${seasonId}/races/${race.id}`}
                    className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-cyan-500/50 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-cyan-400 font-mono uppercase tracking-wider">
                        R{race.round}
                      </span>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-white group-hover:text-cyan-400 transition-colors">
                          {race.name}
                        </h3>
                        {race.status === "COMPLETED" && (
                          <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                            Finalizada
                          </span>
                        )}
                        {race.status === "ACTIVE" && (
                          <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            Ativa
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-500 font-mono">
                        Round {race.round} • {race._count?.eventRounds || 0} baterias
                      </p>
                    </div>

                    <ChevronRight
                      size={20}
                      className="text-zinc-600 group-hover:text-cyan-400 transition-colors"
                    />
                  </Link>
                ),
              )}
          </div>
        </div>
      )}

      {/* Admin Actions */}
      {isAdmin && (
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-5 border-b border-zinc-800/80 bg-gradient-to-r from-purple-500/10 to-purple-600/5">
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
              <Settings className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-mono">
                Ações Administrativas
              </h2>
              <p className="text-xs text-purple-400/70">
                Gerenciamento da temporada
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {season.status === "DRAFT" && (
              <div className="flex items-center justify-between p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Play className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Ativar Temporada</h3>
                    <p className="text-sm text-zinc-400">
                      Inicia a temporada e permite adicionar resultados
                    </p>
                  </div>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await activateSeason(seasonId);
                  }}
                >
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-green-500 hover:bg-green-600 text-zinc-950 font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-green-500/20"
                  >
                    Ativar
                  </button>
                </form>
              </div>
            )}

            {season.status === "ACTIVE" && (
              <div className="flex items-center justify-between p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">
                      Finalizar Temporada
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Encerra a temporada ativa sem arquivá-la
                    </p>
                  </div>
                </div>
                <ConfirmActionButton
                  action={async () => {
                    "use server";
                    await completeSeason(seasonId);
                  }}
                  triggerLabel="Finalizar"
                  triggerClassName="px-5 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium rounded-xl transition-all"
                  title="Confirmar finalizacao da temporada"
                  message="Ao finalizar, a temporada sai do estado ativo. Voce ainda podera consultar os dados, mas novas operacoes devem ser feitas em outra temporada."
                  confirmLabel="Sim, finalizar temporada"
                  confirmClassName="px-5 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                />
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Recalcular Classificação</h3>
                  <p className="text-sm text-zinc-400">
                    Reprocessa os pontos de pilotos e equipes da temporada
                  </p>
                </div>
              </div>
              <RecalculateStandingsButton seasonId={seasonId} />
            </div>

            {season.status !== "ARCHIVED" && season.status !== "DRAFT" && (
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-700 flex items-center justify-center">
                    <Archive className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">
                      Arquivar Temporada
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Move a temporada para o arquivo histórico
                    </p>
                  </div>
                </div>
                <ConfirmActionButton
                  action={async () => {
                    "use server";
                    await archiveSeason(seasonId);
                  }}
                  triggerLabel="Arquivar"
                  triggerClassName="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl transition-colors"
                  title="Confirmar arquivamento da temporada"
                  message="Ao arquivar, a temporada sera movida para historico e deixara de aparecer no fluxo principal de operacao."
                  confirmLabel="Sim, arquivar temporada"
                  confirmClassName="px-5 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                />
              </div>
            )}

            {(season.status === "COMPLETED" || season.status === "ARCHIVED") && (
              <div className="flex items-center justify-between p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                    <RotateCcw className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Restaurar Temporada</h3>
                    <p className="text-sm text-zinc-400">
                      Reabre esta temporada como ativa para continuar ajustes
                    </p>
                  </div>
                </div>
                <ConfirmActionButton
                  action={async () => {
                    "use server";
                    await restoreSeason(seasonId);
                  }}
                  triggerLabel="Restaurar"
                  triggerClassName="px-5 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-medium rounded-xl transition-all"
                  title="Confirmar restauracao da temporada"
                  message="A temporada voltara ao estado ativo. Se houver outra temporada ativa nesta liga, ela sera marcada como finalizada automaticamente."
                  confirmLabel="Sim, restaurar temporada"
                  confirmClassName="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-zinc-950 text-sm font-semibold transition-colors disabled:opacity-50"
                />
              </div>
            )}

            {(season.status === "COMPLETED" || season.status === "ARCHIVED") && (
              <div className="flex items-center justify-between p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                    <Copy className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Clonar para Testes</h3>
                    <p className="text-sm text-zinc-400">
                      Cria uma nova temporada em rascunho com os mesmos dados para testar regras de pontuação sem afetar o histórico.
                    </p>
                  </div>
                </div>
                <ConfirmActionButton
                  action={async () => {
                    "use server";
                    const result = await cloneSeasonForTesting(seasonId);
                    if (!result.success || !result.data?.id) {
                      throw new Error(result.error || "Não foi possível clonar a temporada.");
                    }

                    redirect(`/admin/leagues/${id}/seasons/${result.data.id}`);
                  }}
                  triggerLabel="Clonar"
                  triggerClassName="px-5 py-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-medium rounded-xl transition-all"
                  title="Confirmar clonagem da temporada"
                  message="Uma cópia em rascunho será criada com corridas, rounds e resultados para testes. A temporada original não será alterada."
                  confirmLabel="Sim, clonar temporada"
                  confirmClassName="px-5 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-zinc-950 text-sm font-semibold transition-colors disabled:opacity-50"
                  errorMessage="Falha ao clonar a temporada"
                />
              </div>
            )}

            {season.status === "DRAFT" && season._count.races === 0 && (
              <div className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">
                      Deletar Temporada
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Remove permanentemente esta temporada (apenas rascunhos
                      sem corridas)
                    </p>
                  </div>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await deleteSeason(seasonId);
                  }}
                >
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl transition-all"
                  >
                    Deletar
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
