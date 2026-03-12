import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LogoImage } from "@/components/LogoImage";
import { Plus, ArrowLeft, Calendar, ChevronRight } from "lucide-react";

interface SeasonsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function SeasonsPage({ params }: SeasonsPageProps) {
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
      seasons: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          year: true,
          _count: {
            select: {
              races: true,
              teamAssignments: true,
            },
          },
        },
      },
    },
  });

  if (!league) {
    notFound();
  }

  const seasons = league.seasons;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
            Ativa
          </span>
        );
      case "DRAFT":
        return (
          <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            Rascunho
          </span>
        );
      case "COMPLETED":
        return (
          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Finalizada
          </span>
        );
      case "ARCHIVED":
        return (
          <span className="px-2 py-1 rounded text-xs font-medium bg-neutral-700 text-neutral-400">
            Arquivada
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/leagues/${id}`}
          className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-neutral-400" />
        </Link>
        <div className="w-12 h-12 rounded-xl bg-neutral-800 overflow-hidden flex items-center justify-center border border-neutral-700">
          <LogoImage
            src={league.logoUrl}
            alt={league.name}
            className="w-full h-full object-contain p-1.5"
            fallbackClassName="w-full h-full bg-cyan-500/10 rounded-xl"
          />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-neutral-400 mb-1">
            <span>{league.name}</span>
            <ChevronRight size={14} />
            <span>Temporadas</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Temporadas</h1>
        </div>
        <Link
          href={`/admin/leagues/${id}/seasons/new`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-neutral-950 font-semibold rounded-lg transition-colors"
        >
          <Plus size={20} />
          Nova Temporada
        </Link>
      </div>

      {/* Seasons List */}
      {seasons.length === 0 ? (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-12 text-center">
          <Calendar className="w-16 h-16 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            Nenhuma temporada
          </h3>
          <p className="text-neutral-400 mb-6">
            Crie a primeira temporada desta liga
          </p>
          <Link
            href={`/admin/leagues/${id}/seasons/new`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-neutral-950 font-semibold rounded-lg transition-colors"
          >
            <Plus size={20} />
            Nova Temporada
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {seasons.map((season) => (
            <Link
              key={season.id}
              href={`/admin/leagues/${id}/seasons/${season.id}`}
              className="flex items-center gap-4 p-4 bg-neutral-900/50 border border-neutral-800 hover:border-cyan-500/50 rounded-xl transition-all group"
            >
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-cyan-400" />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-semibold text-white group-hover:text-cyan-400 transition-colors">
                    {season.name}
                  </h3>
                  {getStatusBadge(season.status)}
                </div>
                <div className="flex items-center gap-4 text-sm text-neutral-400">
                  <span>{season._count.races} corridas</span>
                  <span>{season._count.teamAssignments} pilotos</span>
                  {season.year && <span>Ano: {season.year}</span>}
                </div>
              </div>

              <ChevronRight
                size={20}
                className="text-neutral-600 group-hover:text-cyan-400 transition-colors"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
