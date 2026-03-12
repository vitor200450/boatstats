"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CopyPlus, Loader2, ShieldAlert, Users, X } from "lucide-react";
import { getImportableTeams, importTeamToLeague } from "@/lib/leagues";

type ImportTeamDialogProps = {
  targetLeagueId: string;
  triggerLabel?: string;
  triggerClassName?: string;
  onImported?: () => void;
};

type ImportableLeague = {
  id: string;
  name: string;
  teams: Array<{
    id: string;
    name: string;
    color: string | null;
    logoUrl: string | null;
  }>;
};

export default function ImportTeamDialog({
  targetLeagueId,
  triggerLabel = "Importar Equipe",
  triggerClassName,
  onImported,
}: ImportTeamDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<ImportableLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const selectedLeague = useMemo(
    () => leagues.find((league) => league.id === selectedLeagueId),
    [leagues, selectedLeagueId],
  );

  async function openDialog(): Promise<void> {
    setOpen(true);
    setError(null);
    setSuccess(null);
    setSelectedLeagueId("");
    setSelectedTeamId("");
    setIsLoading(true);

    const result = await getImportableTeams(targetLeagueId);

    if (!result.success || !result.data) {
      setError(result.error || "Erro ao carregar equipes importáveis");
      setLeagues([]);
      setIsLoading(false);
      return;
    }

    setLeagues(result.data);
    setIsLoading(false);
  }

  function closeDialog(): void {
    if (isImporting) return;
    setOpen(false);
  }

  async function handleImport(): Promise<void> {
    setError(null);
    setSuccess(null);

    if (!selectedTeamId) {
      setError("Selecione uma equipe para importar");
      return;
    }

    setIsImporting(true);

    const result = await importTeamToLeague({
      targetLeagueId,
      sourceTeamId: selectedTeamId,
    });

    if (!result.success) {
      setError(result.error || "Falha ao importar equipe");
      setIsImporting(false);
      return;
    }

    setSuccess("Equipe importada com sucesso");
    setIsImporting(false);

    if (onImported) {
      onImported();
      return;
    }

    router.refresh();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={
          triggerClassName ||
          "inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors border border-zinc-700"
        }
      >
        <CopyPlus size={18} />
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">Importar Equipe</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Copia nome, cor e logo de outra liga
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X size={18} className="text-zinc-400" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {isLoading ? (
                <div className="py-12 flex items-center justify-center gap-3 text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Carregando equipes...</span>
                </div>
              ) : leagues.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
                  <Users className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400">Nenhuma equipe disponível para importação</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm text-zinc-300 mb-2">Liga de origem</label>
                    <select
                      value={selectedLeagueId}
                      onChange={(event) => {
                        setSelectedLeagueId(event.target.value);
                        setSelectedTeamId("");
                        setError(null);
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-100 focus:outline-none focus:border-cyan-500/50"
                    >
                      <option value="">Selecione uma liga</option>
                      {leagues.map((league) => (
                        <option key={league.id} value={league.id}>
                          {league.name} ({league.teams.length} equipe{league.teams.length > 1 ? "s" : ""})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-300 mb-2">Equipe</label>
                    <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800 bg-zinc-950">
                      {!selectedLeague ? (
                        <div className="p-4 text-sm text-zinc-500">Selecione uma liga primeiro</div>
                      ) : (
                        selectedLeague.teams.map((team) => (
                          <button
                            key={team.id}
                            type="button"
                            onClick={() => setSelectedTeamId(team.id)}
                            className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-zinc-900 transition-colors ${
                              selectedTeamId === team.id ? "bg-cyan-500/10" : ""
                            }`}
                          >
                            <div
                              className="w-9 h-9 rounded-lg border border-zinc-700 bg-zinc-800 flex items-center justify-center overflow-hidden"
                              style={{ backgroundColor: team.color ? `${team.color}20` : undefined }}
                            >
                              {team.logoUrl ? (
                                <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain p-1" />
                              ) : (
                                <Users className="w-4 h-4 text-zinc-400" />
                              )}
                            </div>
                            <span className="text-zinc-100 flex-1 truncate">{team.name}</span>
                            {selectedTeamId === team.id && <Check className="w-4 h-4 text-cyan-400" />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                <p>
                  A importação copia somente identidade visual. Pilotos e vínculos de temporada não são importados.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
                  {success}
                </div>
              )}
            </div>

            <div className="border-t border-zinc-800 px-6 py-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isLoading || isImporting || leagues.length === 0 || !selectedTeamId}
                className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg transition-colors"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CopyPlus size={16} />}
                {isImporting ? "Importando..." : "Importar Equipe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
