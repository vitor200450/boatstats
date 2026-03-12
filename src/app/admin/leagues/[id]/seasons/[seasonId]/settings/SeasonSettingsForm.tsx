"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, Save } from "lucide-react";

import { updateSeason } from "@/lib/leagues/seasonActions";

type SeasonStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

type SeasonSettingsFormProps = {
  leagueId: string;
  seasonId: string;
  season: {
    name: string;
    year: number | null;
    status: SeasonStatus;
  };
  isAdmin: boolean;
};

export function SeasonSettingsForm({
  leagueId,
  seasonId,
  season,
  isAdmin,
}: SeasonSettingsFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(season.name);
  const [year, setYear] = useState(season.year?.toString() ?? "");
  const [status, setStatus] = useState<SeasonStatus>(season.status);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || isSaving) return;

    setIsSaving(true);
    setError(null);
    setSaved(false);

    const parsedYear = year.trim() ? Number(year) : undefined;
    if (parsedYear !== undefined && Number.isNaN(parsedYear)) {
      setError("Ano invalido");
      setIsSaving(false);
      return;
    }

    const result = await updateSeason(seasonId, {
      name: name.trim(),
      year: parsedYear,
      status,
    });

    if (!result.success) {
      setError(result.error ?? "Erro ao atualizar temporada");
      setIsSaving(false);
      return;
    }

    setSaved(true);
    setIsSaving(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div>
        <h1 className="font-mono text-xl font-bold text-white">Configuracoes da Temporada</h1>
        <p className="mt-1 text-sm text-zinc-400">Liga: {leagueId}</p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          <CheckCircle size={16} />
          Alteracoes salvas com sucesso.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="season-name" className="text-sm text-zinc-300">
            Nome
          </label>
          <input
            id="season-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!isAdmin || isSaving}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-cyan-500 disabled:opacity-60"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="season-year" className="text-sm text-zinc-300">
            Ano
          </label>
          <input
            id="season-year"
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(event) => setYear(event.target.value)}
            disabled={!isAdmin || isSaving}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-cyan-500 disabled:opacity-60"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="season-status" className="text-sm text-zinc-300">
            Status
          </label>
          <select
            id="season-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as SeasonStatus)}
            disabled={!isAdmin || isSaving}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-cyan-500 disabled:opacity-60"
          >
            <option value="DRAFT">Rascunho</option>
            <option value="ACTIVE">Ativa</option>
            <option value="COMPLETED">Concluida</option>
            <option value="ARCHIVED">Arquivada</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={!isAdmin || isSaving}
        className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Salvar
      </button>
    </form>
  );
}
