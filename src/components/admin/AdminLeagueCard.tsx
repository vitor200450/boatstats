import Link from "next/link";
import { Calendar, Trophy, Users } from "lucide-react";
import { LogoImage } from "@/components/LogoImage";

type LeagueCardData = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  owner: {
    name: string | null;
    email: string;
  };
  admins: Array<{
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
  _count: {
    seasons: number;
    teams: number;
  };
  seasons: Array<{
    id: string;
    name: string;
    status: string;
  }>;
};

type AdminLeagueCardProps = {
  league: LeagueCardData;
};

function getStatusLabel(status: string): string {
  if (status === "ACTIVE") return "ATIVA";
  if (status === "DRAFT") return "RASCUNHO";
  if (status === "COMPLETED") return "FINALIZADA";
  if (status === "ARCHIVED") return "ARQUIVADA";
  return status;
}

function getStatusClasses(status: string): string {
  if (status === "ACTIVE") {
    return "bg-green-500/90 text-zinc-950 shadow-green-500/20";
  }
  if (status === "DRAFT") {
    return "bg-yellow-500/90 text-zinc-950 shadow-yellow-500/20";
  }
  if (status === "COMPLETED") {
    return "bg-blue-500/90 text-zinc-950 shadow-blue-500/20";
  }
  return "bg-zinc-700 text-zinc-300";
}

export function AdminLeagueCard({ league }: AdminLeagueCardProps) {
  const season = league.seasons[0] ?? null;
  const ownerName = league.owner.name || league.owner.email;

  return (
    <Link
      href={`/admin/leagues/${league.id}`}
      className="group bg-gradient-to-b from-zinc-800/50 to-zinc-900/80 border border-zinc-700/50 hover:border-cyan-500/40 rounded-2xl transition-all hover:shadow-xl hover:shadow-cyan-500/5 flex flex-col overflow-hidden"
    >
      <div className="relative h-36 bg-gradient-to-br from-zinc-700/30 via-zinc-800/50 to-zinc-900/80 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <LogoImage
            src={league.logoUrl}
            alt={league.name}
            className="max-w-full max-h-full object-contain drop-shadow-2xl group-hover:scale-110 transition-transform duration-500"
            fallbackClassName="w-20 h-20 rounded-2xl bg-zinc-800/80"
          />
        </div>

        {season && (
          <div className="absolute top-4 right-4">
            <span
              className={`text-[10px] uppercase font-mono tracking-wider px-3 py-1.5 rounded-full shadow-lg ${getStatusClasses(season.status)}`}
            >
              {getStatusLabel(season.status)}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent" />
      </div>

      <div className="p-6 flex flex-col flex-1 justify-between gap-4">
        <div>
          <h3 className="text-white text-xl font-bold mb-2 truncate group-hover:text-cyan-400 transition-colors">
            {league.name}
          </h3>

          {league.description ? (
            <p className="text-zinc-500 text-sm mb-4 line-clamp-2 leading-relaxed">
              {league.description}
            </p>
          ) : (
            <p className="text-zinc-600 text-sm mb-4 italic">Sem descrição</p>
          )}

          <div className="flex items-center gap-5 text-xs">
            <div className="flex items-center gap-2 text-zinc-400">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Calendar size={14} className="text-cyan-500" />
              </div>
              <span>{league._count.seasons} temporadas</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-400">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Users size={14} className="text-purple-500" />
              </div>
              <span>{league._count.teams} equipes</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Trophy size={13} className="text-zinc-500" />
            <span className="text-zinc-400">Proprietário: {ownerName}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              {ownerName}
            </span>
            {league.admins.map((admin) => (
              <span
                key={admin.user.id}
                className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700"
              >
                {admin.user.name || admin.user.email}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
