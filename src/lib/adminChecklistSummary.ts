import { getMyLeagues } from "@/lib/leagues";
import { prisma } from "@/lib/prisma";

export type ChecklistStepSummary = {
  id: string;
  label: string;
  help: string;
  cta: string;
  href: string;
  completed: boolean;
};

export type AdminChecklistSummary = {
  completedCount: number;
  totalCount: number;
  primaryStep: ChecklistStepSummary;
  secondarySteps: ChecklistStepSummary[];
  showCompletedSeasonView: boolean;
  checklistLeagueId: string | null;
};

function buildFallbackSteps(): ChecklistStepSummary[] {
  return [
    {
      id: "create-league",
      label: "Criar liga",
      help: "Comece criando a primeira liga para organizar o campeonato.",
      cta: "Criar liga",
      href: "/admin/leagues/new",
      completed: false,
    },
    {
      id: "create-season",
      label: "Criar temporada",
      help: "Depois da liga, configure uma temporada para iniciar o fluxo.",
      cta: "Abrir ligas",
      href: "/admin/leagues",
      completed: false,
    },
    {
      id: "configure-points-system",
      label: "Configurar sistema de pontos",
      help: "Defina a pontuacao da temporada antes de cadastrar equipes e corridas.",
      cta: "Abrir temporadas",
      href: "/admin/leagues",
      completed: false,
    },
    {
      id: "register-roster",
      label: "Cadastrar equipes e pilotos",
      help: "Cadastre quem vai disputar antes de abrir corridas.",
      cta: "Abrir ligas",
      href: "/admin/leagues",
      completed: false,
    },
    {
      id: "create-races",
      label: "Criar corridas",
      help: "Monte o calendario da temporada para receber resultados.",
      cta: "Abrir ligas",
      href: "/admin/leagues",
      completed: false,
    },
    {
      id: "import-results",
      label: "Importar resultados",
      help: "Importe dados da API para gerar classificacao automaticamente.",
      cta: "Importar resultados",
      href: "/admin/events/import",
      completed: false,
    },
    {
      id: "complete-season",
      label: "Finalizar temporada",
      help: "Feche oficialmente a temporada quando tudo estiver concluido.",
      cta: "Abrir ligas",
      href: "/admin/leagues",
      completed: false,
    },
  ];
}

export async function getAdminChecklistSummary(): Promise<AdminChecklistSummary> {
  try {
  const leaguesResult = await getMyLeagues();
  const leagues = leaguesResult.success && leaguesResult.data ? leaguesResult.data : [];
  const primaryLeague = leagues[0] ?? null;

  let steps = buildFallbackSteps();
  let standingsCount = 0;
  let checklistLeagueId: string | null = null;
  let hasCompletedOrArchivedSeason = false;
  let hasOpenSeason = false;

  if (primaryLeague) {
    const league = await prisma.league.findUnique({
      where: { id: primaryLeague.id },
      select: {
        id: true,
        seasons: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            pointsSystem: true,
            _count: {
              select: {
                teamAssignments: true,
                races: true,
              },
            },
          },
        },
        _count: {
          select: {
            teams: true,
          },
        },
      },
    });

    if (league) {
      checklistLeagueId = league.id;
      const activeSeason = league.seasons.find((season) => season.status === "ACTIVE");
      const draftSeason = league.seasons.find((season) => season.status === "DRAFT");
      const targetSeason = activeSeason ?? draftSeason ?? league.seasons[0] ?? null;
      hasOpenSeason = Boolean(activeSeason || draftSeason);
      hasCompletedOrArchivedSeason =
        targetSeason?.status === "COMPLETED" || targetSeason?.status === "ARCHIVED";

      if (targetSeason) {
        standingsCount = await prisma.standing.count({
          where: { seasonId: targetSeason.id },
        });
      }

      const hasLeague = leagues.length > 0;
      const hasSeason = targetSeason !== null;
      const hasConfiguredPointsSystem =
        targetSeason !== null &&
        Boolean(
          (targetSeason.pointsSystem as { rules?: { configuredByAdmin?: boolean } })?.rules
            ?.configuredByAdmin,
        );
      const hasRoster =
        targetSeason !== null &&
        league._count.teams > 0 &&
        targetSeason._count.teamAssignments > 0;
      const hasRaces = targetSeason !== null && targetSeason._count.races > 0;
      const hasImportedResults = standingsCount > 0;
      const hasCompletedSeason = targetSeason?.status === "COMPLETED";

      steps = [
        {
          id: "create-league",
          label: "Criar liga",
          help: "Defina o espaco onde voce vai gerenciar o campeonato.",
          cta: hasLeague ? "Gerenciar ligas" : "Criar liga",
          href: hasLeague ? "/admin/leagues" : "/admin/leagues/new",
          completed: hasLeague,
        },
        {
          id: "create-season",
          label: "Criar temporada",
          help: "Crie a temporada para agrupar corridas e classificacao.",
          cta: "Configurar temporadas",
          href: `/admin/leagues/${league.id}/seasons`,
          completed: hasSeason,
        },
        {
          id: "configure-points-system",
          label: "Configurar sistema de pontos",
          help: "Ajuste a pontuacao da temporada para refletir as regras atuais.",
          cta: "Configurar pontuacao",
          href: targetSeason
            ? `/admin/leagues/${league.id}/seasons/${targetSeason.id}/settings`
            : `/admin/leagues/${league.id}/seasons`,
          completed: hasConfiguredPointsSystem,
        },
        {
          id: "register-roster",
          label: "Cadastrar equipes e pilotos",
          help: "Associe participantes antes de operar as corridas.",
          cta: "Cadastrar equipes",
          href: `/admin/leagues/${league.id}/teams`,
          completed: hasRoster,
        },
        {
          id: "create-races",
          label: "Criar corridas",
          help: "Defina o calendario da temporada para liberar a operacao.",
          cta: "Criar corridas",
          href: targetSeason
            ? `/admin/leagues/${league.id}/seasons/${targetSeason.id}/races`
            : `/admin/leagues/${league.id}/seasons`,
          completed: hasRaces,
        },
        {
          id: "import-results",
          label: "Importar resultados",
          help: "Importe resultados da API para atualizar a classificacao.",
          cta: "Importar resultados",
          href: "/admin/events/import",
          completed: hasImportedResults,
        },
        {
          id: "complete-season",
          label: "Finalizar temporada",
          help: "Conclua oficialmente a temporada quando o campeonato acabar.",
          cta: "Finalizar temporada",
          href: targetSeason
            ? `/admin/leagues/${league.id}/seasons/${targetSeason.id}`
            : `/admin/leagues/${league.id}/seasons`,
          completed: hasCompletedSeason,
        },
      ];
    }
  }

  const firstPendingStepIndex = steps.findIndex((step) => !step.completed);
  const primaryStepIndex = firstPendingStepIndex >= 0 ? firstPendingStepIndex : steps.length - 1;
  const primaryStep = steps[primaryStepIndex];
  const secondarySteps = steps
    .filter((_, index) => index !== primaryStepIndex)
    .filter((step) => !step.completed)
    .slice(0, 2);

  return {
    completedCount: steps.filter((step) => step.completed).length,
    totalCount: steps.length,
    primaryStep,
    secondarySteps,
    showCompletedSeasonView: hasCompletedOrArchivedSeason && !hasOpenSeason,
    checklistLeagueId,
  };
  } catch (error) {
    console.error("Error building admin checklist summary:", error);

    const steps = buildFallbackSteps();
    const primaryStep = steps[0];
    return {
      completedCount: 0,
      totalCount: steps.length,
      primaryStep,
      secondarySteps: steps.slice(1, 3),
      showCompletedSeasonView: false,
      checklistLeagueId: null,
    };
  }
}
