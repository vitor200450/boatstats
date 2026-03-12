"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Edit2, Trash2, Plus, GripVertical } from "lucide-react";
import { createPortal } from "react-dom";

import { deleteRace } from "@/lib/leagues/raceActions";
import { RaceModal } from "./RaceModal";

interface RaceListClientProps {
  leagueId: string;
  seasonId: string;
  seasonStatus: string;
  races: RaceItem[];
}

type RaceItem = {
  id: string;
  round: number;
  name: string;
  trackApiName: string | null;
  scheduledDate: Date | string | null;
  status: string;
  _count?: {
    eventRounds?: number;
  };
};

interface DropdownPosition {
  top: number;
  left: number;
}

export default function RaceListClient({
  leagueId,
  seasonId,
  seasonStatus,
  races,
}: RaceListClientProps) {
  const isSeasonActive = seasonStatus === "ACTIVE";
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [raceToEdit, setRaceToEdit] = useState<RaceItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition>({
    top: 0,
    left: 0,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleOpenModal = (race: RaceItem | null = null) => {
    setRaceToEdit(race);
    setIsModalOpen(true);
    setOpenDropdownId(null);
  };

  const handleCloseModal = () => {
    setRaceToEdit(null);
    setIsModalOpen(false);
  };

  const toggleDropdown = (
    id: string,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    if (openDropdownId === id) {
      setOpenDropdownId(null);
      return;
    }
    // Calculate fixed-position menu from viewport coords.
    // Do NOT add window.scrollY/window.scrollX here.
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 192; // w-48
    const menuHeight = 120; // estimated height for 2 actions
    const viewportPadding = 8;

    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding,
    );

    const hasSpaceBelow = rect.bottom + 4 + menuHeight <= window.innerHeight;
    const top = hasSpaceBelow
      ? rect.bottom + 4
      : Math.max(viewportPadding, rect.top - menuHeight - 4);

    setDropdownPos({
      top,
      left,
    });
    setOpenDropdownId(id);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = () => setOpenDropdownId(null);
    if (openDropdownId) {
      document.addEventListener("click", handleClick);
    }
    return () => document.removeEventListener("click", handleClick);
  }, [openDropdownId]);

  // Close on scroll
  useEffect(() => {
    const handleScroll = () => setOpenDropdownId(null);
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  const handleDelete = async (raceId: string, eventRoundsCount: number) => {
    setOpenDropdownId(null);

    if (eventRoundsCount > 0) {
      toast.error(
        "Não é possível excluir corridas que já possuem rodadas importadas.",
      );
      return;
    }

    if (!confirm("Tem certeza que deseja excluir esta corrida?")) {
      return;
    }

    setIsDeleting(raceId);
    try {
      const result = await deleteRace(raceId);
      if (result.success) {
        toast.success("Corrida excluída com sucesso");
        router.refresh();
      } else {
        toast.error(result.error || "Erro ao excluir corrida");
      }
    } catch {
      toast.error("Erro inesperado ao excluir");
    } finally {
      setIsDeleting(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SCHEDULED":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            Agendada
          </span>
        );
      case "PENDING":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            Configuração Pendente
          </span>
        );
      case "COMPLETED":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
            Finalizada
          </span>
        );
      case "CANCELLED":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
            Cancelada
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-zinc-800 text-zinc-400">
            {status}
          </span>
        );
    }
  };

  // Find the race that currently has the dropdown open
  const openRace = races.find((r) => r.id === openDropdownId);

  const dropdown =
    mounted && openRace
      ? createPortal(
          <div
            className="fixed w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              zIndex: 9999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isSeasonActive ? (
              <>
                <button
                  onClick={() => handleOpenModal(openRace)}
                  className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar Detalhes
                </button>
                <div className="h-px bg-zinc-800 my-1" />
                <button
                  onClick={() =>
                    handleDelete(openRace.id, openRace._count?.eventRounds || 0)
                  }
                  disabled={
                    isDeleting === openRace.id ||
                    (openRace._count?.eventRounds || 0) > 0
                  }
                  className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDeleting === openRace.id ? "Excluindo..." : "Excluir Corrida"}
                </button>
              </>
            ) : (
              <p className="px-4 py-2.5 text-xs text-zinc-500">
                Ative a temporada para editar corridas
              </p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-6">
      {!isSeasonActive && (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl text-sm text-yellow-400">
          <span className="shrink-0 text-yellow-500">⚠</span>
          <span>
            {seasonStatus === "DRAFT"
              ? "Ative a temporada para adicionar corridas e registrar resultados."
              : "Esta temporada não está ativa. Apenas visualização disponível."}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end">
        {isSeasonActive && (
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 active:bg-cyan-700 text-zinc-950 font-semibold rounded-xl flex items-center gap-2 transition-colors"
          >
            <Plus size={18} />
            Nova Corrida
          </button>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-400 bg-zinc-900/50 uppercase font-mono border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4 font-medium">Round</th>
                <th className="px-6 py-4 font-medium">Nome da Etapa</th>
                <th className="px-6 py-4 font-medium">Pista</th>
                <th className="px-6 py-4 font-medium">Data</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {races.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-zinc-500"
                  >
                    Nenhuma corrida agendada para esta temporada.
                  </td>
                </tr>
              ) : (
                races.map((race) => (
                  <tr
                    key={race.id}
                    className="hover:bg-zinc-800/20 transition-colors group"
                  >
                    <td className="px-6 py-4 font-mono font-medium text-cyan-400">
                      #{race.round}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">
                        {race.name}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {race._count?.eventRounds || 0} rodadas
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-300">
                      {race.trackApiName || (
                        <span className="text-zinc-600">Não definida</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-zinc-300">
                      {race.scheduledDate ? (
                        new Date(race.scheduledDate).toLocaleDateString(
                          "pt-BR",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
                      ) : (
                        <span className="text-zinc-600">TBD</span>
                      )}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(race.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/leagues/${leagueId}/seasons/${seasonId}/races/${race.id}`}
                          className="p-2 text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Gerenciar Etapa"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Eye size={18} />
                        </Link>

                        <button
                          onClick={(e) => toggleDropdown(race.id, e)}
                          className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                          title="Mais ações"
                        >
                          <GripVertical size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Portal-based dropdown — renders directly in document.body, escaping all overflow clipping */}
      {dropdown}

      <RaceModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        seasonId={seasonId}
        raceToEdit={raceToEdit}
        nextRound={
          races.length > 0 ? Math.max(...races.map((r) => r.round)) + 1 : 1
        }
      />
    </div>
  );
}
