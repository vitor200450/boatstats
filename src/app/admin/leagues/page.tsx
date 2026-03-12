import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMyLeagues } from "@/lib/leagues";
import { AdminLeagueCard } from "@/components/admin/AdminLeagueCard";
import { Plus, Trophy } from "lucide-react";

export default async function LeaguesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

  const result = await getMyLeagues();

  if (!result.success) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {result.error}
        </div>
      </div>
    );
  }

  const leagues = result.data || [];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-mono">
            Minhas Ligas
          </h1>
          <p className="text-zinc-400 mt-2">
            Gerencie suas ligas de boat racing
          </p>
        </div>
        <Link
          href="/admin/leagues/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-cyan-500/20"
        >
          <Plus size={20} />
          Nova Liga
        </Link>
      </div>

      {/* Leagues Grid */}
      {leagues.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-16 text-center">
          <div className="w-20 h-20 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-zinc-500" />
          </div>
          <h3 className="text-2xl font-semibold text-white mb-3">
            Nenhuma liga encontrada
          </h3>
          <p className="text-zinc-400 mb-8 max-w-md mx-auto">
            Crie sua primeira liga para começar a gerenciar campeonatos de boat racing
          </p>
          <Link
            href="/admin/leagues/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-cyan-500/20"
          >
            <Plus size={20} />
            Criar Liga
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {leagues.map((league) => (
            <AdminLeagueCard key={league.id} league={league} />
          ))}
        </div>
      )}
    </div>
  );
}
