import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMyLeagues } from "@/lib/leagues";
import { prisma } from "@/lib/prisma";
import { AdminLeagueCard } from "@/components/admin/AdminLeagueCard";
import { CheckCircle2, Circle, ChevronRight, ArrowRight } from "lucide-react";

type ChecklistStep = {
  id: string;
  label: string;
  help: string;
  cta: string;
  href: string;
  completed: boolean;
};

function buildFallbackSteps(): ChecklistStep[] {
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

export default async function AdminDashboard() {
  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

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
            name: true,
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
          (targetSeason.pointsSystem as { rules?: { configuredByAdmin?: boolean } })
            ?.rules?.configuredByAdmin,
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
          help: "Ajuste o sistema de pontuacao na temporada para refletir as regras atuais.",
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
          help: "Importe os resultados da API para atualizar a classificacao.",
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
  const showCompletedSeasonView = hasCompletedOrArchivedSeason && !hasOpenSeason;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="pb-4 border-b border-zinc-800">
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono mb-2">
          Painel Administrativo
        </h1>
        <p className="text-zinc-400">
          Siga os proximos passos para configurar e operar seu campeonato com clareza.
        </p>
      </div>

      <section className="bg-gradient-to-br from-zinc-900 to-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white font-mono">Checklist de configuracao</h2>
            <p className="text-sm text-zinc-500 mt-1">
              {showCompletedSeasonView
                ? "Temporada encerrada detectada. Inicie uma nova temporada para continuar o campeonato."
                : "Use esta lista como guia principal de navegacao."}
            </p>
          </div>
          {showCompletedSeasonView ? (
            <span className="text-xs font-mono uppercase tracking-wider px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Temporada concluida
            </span>
          ) : (
            <span className="text-xs font-mono uppercase tracking-wider px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              {steps.filter((step) => step.completed).length}/{steps.length} concluido
            </span>
          )}
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => {
            const isCurrent = index === primaryStepIndex && !step.completed;

            return (
              <div
                key={step.id}
                className={`rounded-xl border p-4 ${
                  step.completed
                    ? "border-green-500/20 bg-green-500/5"
                    : isCurrent
                      ? "border-cyan-500/30 bg-cyan-500/5"
                      : "border-zinc-800 bg-zinc-900/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {step.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : (
                      <Circle className={`w-5 h-5 ${isCurrent ? "text-cyan-400" : "text-zinc-600"}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-semibold">{step.label}</p>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                          Proximo passo
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{step.help}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-zinc-800">
          <p className="text-xs uppercase tracking-wider font-mono text-zinc-500 mb-3">Acoes recomendadas</p>
          <div className="flex flex-wrap gap-3">
            {showCompletedSeasonView && checklistLeagueId ? (
              <>
                <Link
                  href={`/admin/leagues/${checklistLeagueId}/seasons`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold transition-colors"
                >
                  Criar nova temporada
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href={`/admin/leagues/${checklistLeagueId}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                >
                  Ver resumo da liga
                  <ChevronRight size={16} />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={primaryStep.href}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold transition-colors"
                >
                  {primaryStep.cta}
                  <ArrowRight size={16} />
                </Link>

                {secondarySteps.map((step) => (
                  <Link
                    key={step.id}
                    href={step.href}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    {step.cta}
                    <ChevronRight size={16} />
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>
      </section>

      {leagues.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h3 className="text-lg font-bold text-white font-mono">Ligas recentes</h3>
            <Link
              href="/admin/leagues"
              className="text-sm text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
            >
              Ver todas
              <ChevronRight size={16} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {leagues.slice(0, 3).map((league) => (
              <AdminLeagueCard key={league.id} league={league} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
