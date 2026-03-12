import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LogoImage } from "@/components/LogoImage";
import { LeagueAccentScope } from "@/components/LeagueAccentScope";
import {
  Trophy,
  Users,
  Calendar,
  Settings,
  ChevronRight,
  Plus,
  Flag,
} from "lucide-react";

interface LeaguePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function LeaguePage({ params }: LeaguePageProps) {
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
      description: true,
      logoUrl: true,
      owner: {
        select: { name: true, email: true },
      },
      admins: {
        select: {
          id: true,
          user: {
            select: { name: true, email: true },
          },
        },
      },
      seasons: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          _count: {
            select: {
              races: true,
              teamAssignments: true,
            },
          },
        },
      },
      _count: {
        select: {
          seasons: true,
          teams: true,
        },
      },
    },
  });

  if (!league) {
    notFound();
  }
  const activeSeason = league.seasons.find((s) => s.status === "ACTIVE");
  const draftSeason = league.seasons.find((s) => s.status === "DRAFT");
  const latestSeason = league.seasons[0];
  const seasonForStats = activeSeason ?? latestSeason;

  return (
    <LeagueAccentScope logoUrl={league.logoUrl} seed={league.name}>
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Banner Header */}
      <div className="relative">
        {/* Background gradient effects */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              "linear-gradient(to bottom right, rgb(var(--league-accent-rgb) / 0.14), rgb(24 24 27 / 0.5), transparent)",
          }}
        ></div>
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              "linear-gradient(to right, rgb(var(--league-accent-rgb) / 0.08), transparent, rgb(var(--league-accent-rgb) / 0.08))",
          }}
        ></div>

        <div className="relative bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden backdrop-blur-sm">
          {/* Top gradient line */}
          <div
            className="h-1 w-full"
            style={{
              background:
                "linear-gradient(to right, rgb(var(--league-accent-rgb) / 0.45), rgb(var(--league-accent-rgb) / 0.9), rgb(var(--league-accent-rgb) / 0.45))",
            }}
          ></div>

          <div className="p-6 md:p-10">
            {/* Settings button - absolute positioning */}
            <Link
              href={`/admin/leagues/${league.id}/settings`}
              className="absolute top-6 right-6 md:top-8 md:right-8 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors group border border-zinc-700 hover:border-zinc-600 z-10"
              title="Configurações"
            >
              <Settings size={22} className="text-zinc-400 group-hover:text-white transition-colors" />
            </Link>

            {/* Centered Content */}
            <div className="flex flex-col items-center text-center">
              {/* Logo - Centralizada sem formato */}
              <div className="shrink-0 mb-6">
                <LogoImage
                  src={league.logoUrl}
                  alt={league.name}
                  className="max-w-[200px] max-h-[200px] md:max-w-[240px] md:max-h-[240px] w-auto h-auto object-contain"
                  fallbackClassName="w-32 h-32 md:w-40 md:h-40 bg-gradient-to-br from-cyan-500/30 to-cyan-600/10 flex items-center justify-center"
                  fallbackIconClassName="w-20 h-20 text-cyan-400"
                />
              </div>

              {/* League Info */}
              <div className="max-w-2xl">
                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight font-mono mb-3">
                  {league.name}
                </h1>
                {league.description ? (
                  <p className="text-zinc-400 text-lg">{league.description}</p>
                ) : (
                  <p className="text-zinc-500 italic text-lg">Sem descrição</p>
                )}
                <div className="flex items-center justify-center gap-4 mt-4">
                  {activeSeason && (
                    <span className="text-[10px] uppercase font-mono tracking-wider px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                      Temporada Ativa: {activeSeason.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom decorative line */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-zinc-700 to-transparent"></div>
        </div>
      </div>

      {/* Quick Stats - Cards Compactos com Borda Esquerda */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          className="bg-zinc-900/60 border-l-4 rounded-r-xl p-4 hover:bg-zinc-900 transition-colors"
          style={{ borderLeftColor: "rgb(var(--league-accent-rgb))" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "rgb(var(--league-accent-rgb) / 0.2)" }}
            >
              <Calendar className="w-5 h-5" style={{ color: "rgb(var(--league-accent-rgb))" }} />
            </div>
            <div>
              <div className="text-xl font-bold text-white font-mono">{league._count.seasons}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Temporadas</div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 border-l-4 border-purple-500 rounded-r-xl p-4 hover:bg-zinc-900 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-white font-mono">{league._count.teams}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Equipes</div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 border-l-4 border-green-500 rounded-r-xl p-4 hover:bg-zinc-900 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center">
              <Flag className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-white font-mono">
                {seasonForStats?._count?.races || 0}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Corridas</div>
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
                {seasonForStats?._count?.teamAssignments || 0}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Pilotos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Season Section */}
      {activeSeason ? (
        <div
          className="rounded-xl p-6 transition-colors"
          style={{
            background:
              "linear-gradient(to bottom right, rgb(var(--league-accent-rgb) / 0.14), rgb(59 130 246 / 0.06))",
            border: "1px solid rgb(var(--league-accent-rgb) / 0.3)",
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "rgb(var(--league-accent-rgb) / 0.2)" }}
              >
                <span
                  className="material-symbols-outlined text-3xl"
                  style={{ color: "rgb(var(--league-accent-rgb))" }}
                >
                  play_circle
                </span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white font-mono mb-1">
                  Temporada Ativa: {activeSeason.name}
                </h2>
                <p className="text-zinc-400">Gerencie a temporada em andamento</p>
              </div>
            </div>
            <Link
              href={`/admin/leagues/${league.id}/seasons/${activeSeason.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-zinc-950 font-semibold rounded-xl transition-all hover:shadow-lg"
              style={{
                backgroundColor: "rgb(var(--league-accent-rgb))",
                boxShadow: "0 10px 30px rgb(var(--league-accent-rgb) / 0.2)",
              }}
            >
              Acessar
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      ) : draftSeason ? (
        <div className="bg-zinc-900 border border-yellow-500/20 rounded-xl p-6 hover:border-yellow-500/40 transition-colors">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-yellow-400 text-3xl">edit</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white font-mono mb-1">
                  Temporada em Rascunho: {draftSeason.name}
                </h2>
                <p className="text-zinc-400">
                  Configure a temporada antes de ativá-la
                </p>
              </div>
            </div>
            <Link
              href={`/admin/leagues/${league.id}/seasons/${draftSeason.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 font-semibold rounded-xl transition-colors"
            >
              Configurar
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-cyan-500/30 transition-colors">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-zinc-500 text-3xl">add_circle</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white font-mono mb-1">Criar Nova Temporada</h2>
                <p className="text-zinc-400">
                  Inicie uma nova temporada para esta liga
                </p>
              </div>
            </div>
            <Link
              href={`/admin/leagues/${league.id}/seasons/new`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-cyan-500/20"
            >
              <Plus size={18} />
              Nova Temporada
            </Link>
          </div>
        </div>
      )}

      {/* Navigation Grid - Cards com Ícone Grande */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link
          href={`/admin/leagues/${league.id}/seasons`}
          className="group relative bg-gradient-to-br from-zinc-900 to-zinc-900/80 border border-zinc-800 hover:border-cyan-500/40 rounded-2xl p-6 transition-all hover:shadow-xl hover:shadow-cyan-500/5 overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative">
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center group-hover:from-cyan-500/30 group-hover:to-cyan-600/20 transition-all duration-300">
                <Calendar className="w-7 h-7 text-cyan-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors">Temporadas</h3>
            <p className="text-sm text-zinc-500">
              Gerencie temporadas, corridas e calendários
            </p>
          </div>
        </Link>

        <Link
          href={`/admin/leagues/${league.id}/teams`}
          className="group relative bg-gradient-to-br from-zinc-900 to-zinc-900/80 border border-zinc-800 hover:border-purple-500/40 rounded-2xl p-6 transition-all hover:shadow-xl hover:shadow-purple-500/5 overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative">
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center group-hover:from-purple-500/30 group-hover:to-purple-600/20 transition-all duration-300">
                <Users className="w-7 h-7 text-purple-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-purple-400 transition-colors">Equipes</h3>
            <p className="text-sm text-zinc-500">
              Cadastre equipes e gerencie pilotos
            </p>
          </div>
        </Link>

        <Link
          href={`/admin/leagues/${league.id}/settings`}
          className="group relative bg-gradient-to-br from-zinc-900 to-zinc-900/80 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-6 transition-all hover:shadow-xl overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-zinc-700/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative">
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-zinc-700/50 to-zinc-800/30 flex items-center justify-center group-hover:from-zinc-700/70 group-hover:to-zinc-800/50 transition-all duration-300">
                <Settings className="w-7 h-7 text-zinc-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-zinc-300 transition-colors">Configurações</h3>
            <p className="text-sm text-zinc-500">
              Configure admins e detalhes da liga
            </p>
          </div>
        </Link>
      </div>

      {/* Admins Section - Estilo de Lista */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-zinc-800/80 bg-zinc-900/80">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white font-mono">Administradores</h3>
            <p className="text-xs text-zinc-500">Gerencie o acesso à liga</p>
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap gap-3">
            {/* Owner Badge - Destaque Especial */}
            <div
              className="flex items-center gap-3 px-4 py-3 border rounded-xl shadow-sm"
              style={{
                background:
                  "linear-gradient(to right, rgb(var(--league-accent-rgb) / 0.16), rgb(var(--league-accent-rgb) / 0.06))",
                borderColor: "rgb(var(--league-accent-rgb) / 0.35)",
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-zinc-950"
                style={{ backgroundColor: "rgb(var(--league-accent-rgb))" }}
              >
                {(league.owner.name || league.owner.email).charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-white font-medium">
                {league.owner.name || league.owner.email}
              </span>
              <span
                className="text-[10px] uppercase font-mono tracking-wider px-2.5 py-1 rounded-full border"
                style={{
                  backgroundColor: "rgb(var(--league-accent-rgb) / 0.2)",
                  color: "rgb(var(--league-accent-rgb))",
                  borderColor: "rgb(var(--league-accent-rgb) / 0.25)",
                }}
              >
                Proprietário
              </span>
            </div>

            {/* Admin Badges */}
            {league.admins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl hover:bg-zinc-800 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-400">
                  {(admin.user.name || admin.user.email).charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-zinc-300">
                  {admin.user.name || admin.user.email}
                </span>
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 bg-zinc-900/50 px-2.5 py-1 rounded-full">
                  Admin
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </LeagueAccentScope>
  );
}
