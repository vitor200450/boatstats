import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LogoImage } from "@/components/LogoImage";
import { SettingsForm } from "./SettingsForm";
import { AdminsManager } from "./AdminsManager";
import { ArrowLeft, Settings, Users } from "lucide-react";

interface SettingsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function LeagueSettingsPage({ params }: SettingsPageProps) {
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
      ownerId: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      admins: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
    },
  });

  if (!league) {
    notFound();
  }
  const isOwner = league.ownerId === session.user.id;
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
        <Link
          href={`/admin/leagues/${id}`}
          className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors group"
        >
          <ArrowLeft size={20} className="text-zinc-400 group-hover:text-white transition-colors" />
        </Link>
        <div className="w-14 h-14 rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center border border-zinc-700">
          <LogoImage
            src={league.logoUrl}
            alt={league.name}
            className="w-full h-full object-contain p-2"
            fallbackClassName="w-full h-full bg-cyan-500/10 rounded-xl"
          />
        </div>
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono">
            Configurações
          </h1>
          <p className="text-zinc-400">{league.name}</p>
        </div>
      </div>

      {/* League Info - Form com Header Colorido */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-6 border-b border-zinc-800/80 bg-gradient-to-r from-cyan-500/10 to-cyan-600/5">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/20">
            <Settings className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white font-mono">
              Informações da Liga
            </h2>
            <p className="text-xs text-cyan-400/70">Dados básicos da liga</p>
          </div>
        </div>

        <SettingsForm
          league={league}
          isOwner={isOwner}
          isSuperAdmin={isSuperAdmin}
        />
      </div>

      {/* Admins Management */}
      {(isOwner || isSuperAdmin) && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-zinc-800/80 bg-gradient-to-r from-purple-500/10 to-purple-600/5">
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-mono">
                Administradores
              </h2>
              <p className="text-xs text-purple-400/70">Gerencie quem pode administrar a liga</p>
            </div>
          </div>

          <AdminsManager
            leagueId={league.id}
            owner={league.owner}
            admins={league.admins}
          />
        </div>
      )}

      {/* Danger Zone */}
      {(isOwner || isSuperAdmin) && (
        <div className="bg-gradient-to-br from-red-500/5 to-red-600/5 border border-red-500/25 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-red-500/20 bg-gradient-to-r from-red-500/10 to-red-600/5">
            <div className="w-11 h-11 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/20">
              <span className="material-symbols-outlined text-red-400">warning</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-400 font-mono">
                Zona de Perigo
              </h2>
              <p className="text-xs text-red-400/70">Ações irreversíveis</p>
            </div>
          </div>

          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-white font-medium mb-1">Deletar Liga</h3>
                <p className="text-sm text-zinc-400">
                  Esta ação não pode ser desfeita. Todos os dados, temporadas, equipes e resultados serão permanentemente excluídos.
                </p>
              </div>
              <button className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl transition-all hover:shadow-lg hover:shadow-red-500/10 whitespace-nowrap">
                Deletar Liga
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
