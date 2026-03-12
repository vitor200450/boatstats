import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SmartLogoImage } from "@/components/SmartLogoImage";
import ImportTeamDialog from "@/components/ImportTeamDialog";
import { Plus, ArrowLeft, Users, ChevronRight } from "lucide-react";

interface TeamsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function TeamsPage({ params }: TeamsPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

  const { id } = await params;

  const league = await prisma.league.findFirst({
    where:
      session.user.role === "SUPER_ADMIN"
        ? { id }
        : {
            id,
            OR: [{ ownerId: session.user.id }, { admins: { some: { userId: session.user.id } } }],
          },
    select: {
      id: true,
      name: true,
      logoUrl: true,
    },
  });

  if (!league) {
    notFound();
  }

  const [activeSeason, draftSeason] = await prisma.$transaction([
    prisma.season.findFirst({
      where: { leagueId: id, status: "ACTIVE" },
      select: { id: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.season.findFirst({
      where: { leagueId: id, status: "DRAFT" },
      select: { id: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const referenceSeason = activeSeason ?? draftSeason;

  const teams = await prisma.team.findMany({
    where: { leagueId: id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      logoUrl: true,
      logoScale: true,
      logoPosX: true,
      logoPosY: true,
      assignments: {
        where: {
          leftAt: null,
          ...(referenceSeason ? { seasonId: referenceSeason.id } : {}),
        },
        select: {
          id: true,
          driver: {
            select: {
              uuid: true,
              currentName: true,
            },
          },
        },
      },
    },
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/leagues/${id}`}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-zinc-400" />
        </Link>
        <div className="w-12 h-12 rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center border border-zinc-700">
          <SmartLogoImage
            src={league.logoUrl}
            alt={league.name}
            className="w-full h-full p-1.5"
            fallbackClassName="w-full h-full bg-cyan-500/10 rounded-xl"
          />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
            <span>{league.name}</span>
            <ChevronRight size={14} />
            <span>Equipes</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono">
            Equipes
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ImportTeamDialog
            targetLeagueId={id}
            triggerLabel="Importar Equipe"
            triggerClassName="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors border border-zinc-700"
          />
          <Link
            href={`/admin/leagues/${id}/teams/new`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-lg transition-colors"
          >
            <Plus size={20} />
            Nova Equipe
          </Link>
        </div>
      </div>

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <Users className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            Nenhuma equipe cadastrada
          </h3>
          <p className="text-zinc-400 mb-6">
            Crie equipes para organizar os pilotos da sua liga
          </p>
          <Link
            href={`/admin/leagues/${id}/teams/new`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-lg transition-colors"
          >
            <Plus size={20} />
            Nova Equipe
          </Link>
          <div className="mt-3">
            <ImportTeamDialog
              targetLeagueId={id}
              triggerLabel="Importar Equipe"
              triggerClassName="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors border border-zinc-700"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
            {referenceSeason
              ? `Pilotos ativos na temporada: ${referenceSeason.name}`
              : "Pilotos ativos em todas as temporadas (nenhuma temporada ativa/rascunho)"}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/admin/leagues/${id}/teams/${team.id}`}
              className="group bg-zinc-900 border border-zinc-800 hover:border-cyan-500/50 rounded-xl p-6 transition-colors flex flex-col justify-between aspect-video"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div
                    className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center border border-zinc-700"
                    style={{
                      backgroundColor: team.color ? `${team.color}20` : "#27272a",
                    }}
                  >
                    <SmartLogoImage
                      src={team.logoUrl}
                      alt={team.name}
                      className="w-full h-full"
                      fallbackClassName="w-full h-full flex items-center justify-center"
                      fallbackIconClassName="w-8 h-8"
                      scale={(team as { logoScale?: number }).logoScale ?? 1}
                      posX={(team as { logoPosX?: number }).logoPosX ?? 0}
                      posY={(team as { logoPosY?: number }).logoPosY ?? 0}
                      autoBackground
                    />
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 border border-zinc-800 px-2 py-0.5 rounded bg-zinc-950">
                    {team.assignments.length} PILOTO(S)
                  </span>
                </div>

                <h3 className="text-white text-xl font-bold mb-1 truncate">
                  {team.name}
                </h3>

                <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider mb-6">
                  {team.assignments.length} ativo(s){referenceSeason ? ` em ${referenceSeason.name}` : ""}
                </p>
              </div>

              {team.assignments.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {team.assignments.slice(0, 3).map((assignment) => (
                    <span
                      key={assignment.id}
                      className="inline-flex items-center px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300"
                    >
                      {assignment.driver.currentName || assignment.driver.uuid.slice(0, 8)}
                    </span>
                  ))}
                  {team.assignments.length > 3 && (
                    <span className="inline-flex items-center px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-500">
                      +{team.assignments.length - 3}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Sem pilotos ativos</p>
              )}
            </Link>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
