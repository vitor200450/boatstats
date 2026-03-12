import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ArrowLeft, ChevronRight, Plus, Calendar } from "lucide-react";
import RaceListClient from "./RaceListClient";

interface RacesPageProps {
  params: Promise<{
    id: string;
    seasonId: string;
  }>;
}

export default async function RacesPage({ params }: RacesPageProps) {
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
    },
  });

  if (!season) {
    notFound();
  }

  const races = await prisma.race.findMany({
    where: { seasonId },
    orderBy: { round: "asc" },
    select: {
      id: true,
      name: true,
      round: true,
      status: true,
      trackApiName: true,
      scheduledDate: true,
      _count: {
        select: {
          eventRounds: true,
        },
      },
    },
  });

  const league = season.league;

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const isOwner = league.ownerId === session.user.id;
  const isAdmin =
    isSuperAdmin ||
    isOwner ||
    league.admins.some((a) => a.userId === session.user.id);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
        <Link
          href={`/admin/leagues/${id}/seasons/${seasonId}`}
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
              href={`/admin/leagues/${id}/seasons/${seasonId}`}
              className="hover:text-cyan-400 transition-colors"
            >
              {season.name}
            </Link>
            <ChevronRight size={14} />
            <span className="text-zinc-300">Calendário de Corridas</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl md:text-3xl font-bold text-white tracking-tight font-mono">
              Calendário de Corridas
            </h1>
            <span className="px-3 py-1 rounded-lg text-xs font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
              {races?.length || 0} Etapas
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-zinc-400">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-zinc-400" />
          </div>
          <p className="text-sm">Gerencie todas as etapas desta temporada.</p>
        </div>

        {isAdmin && season.status !== "ARCHIVED" && (
          // O RaceListClient irá renderizar o botão para abrir o Modal, então precisamos renderizar aquele componente wrapper que criamos mas com o botão em cima
          // Porém como RaceListClient cuida do Form State, faz sentido passarmos um botão ou colocar o botão lá dentro.
          // Vamos colocar aqui um label para orientar
          <div className="hidden" />
        )}
      </div>

      {/* Main Table Content wrapped in Client component with its own Add Button for Modal Control */}
      <div className="relative">
        {isAdmin && season.status !== "ARCHIVED" && (
          <div className="absolute -top-[72px] right-0 z-10">
            {/* This relies on a small trick, we need to move the open modal state to be accessible or just let RaceListClient handle the Add Button */}
          </div>
        )}
        {/* We will let RaceListClient render the "Add Race" Header/Button to keep modal state collocated */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white font-mono mb-1">
              Corridas
            </h2>
            <p className="text-zinc-400 text-sm">
              Lista de todas as corridas agendadas e importadas
            </p>
          </div>

          {/* The actual Add feature is injected into the Client component */}
        </div>

        <RaceListClient leagueId={id} seasonId={seasonId} seasonStatus={season.status} races={races || []} />
      </div>
    </div>
  );
}
