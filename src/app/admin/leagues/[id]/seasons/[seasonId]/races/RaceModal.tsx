"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { createRace, updateRace } from "@/lib/leagues/raceActions";

type EditableRace = {
  id: string;
  name: string;
  round: number;
  trackApiName: string | null;
  scheduledDate: Date | string | null;
};

interface RaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  seasonId: string;
  raceToEdit?: EditableRace | null;
  nextRound: number;
}

export function RaceModal({
  isOpen,
  onClose,
  seasonId,
  raceToEdit,
  nextRound,
}: RaceModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [round, setRound] = useState(String(nextRound));
  const [trackApiName, setTrackApiName] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  const formatDateForInput = (dateValue: string | Date): string => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  useEffect(() => {
    if (isOpen) {
      if (raceToEdit) {
        setName(raceToEdit.name);
        setRound(String(raceToEdit.round));
        setTrackApiName(raceToEdit.trackApiName || "");
        setScheduledDate(
          raceToEdit.scheduledDate
            ? formatDateForInput(raceToEdit.scheduledDate)
            : "",
        );
      } else {
        setName("");
        setRound(String(nextRound));
        setTrackApiName("");
        setScheduledDate("");
      }
    }
  }, [isOpen, raceToEdit, nextRound]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nome da corrida é obrigatório");
      return;
    }

    if (!round || parseInt(round, 10) < 1) {
      toast.error("Rodada deve ser maior que 0");
      return;
    }

    try {
      setIsSubmitting(true);

      const parsedRound = parseInt(round, 10);
      const dataToSubmit = {
        name,
        round: parsedRound,
        trackApiName: trackApiName || undefined,
        scheduledDate: scheduledDate
          ? new Date(scheduledDate).toISOString()
          : undefined,
      };

      if (raceToEdit) {
        const result = await updateRace(raceToEdit.id, dataToSubmit);
        if (result.success) {
          toast.success("Corrida atualizada com sucesso!");
          onClose();
          router.refresh();
        } else {
          toast.error(result.error || "Erro ao atualizar a corrida");
        }
      } else {
        const result = await createRace(seasonId, dataToSubmit);
        if (result.success) {
          toast.success("Corrida adicionada com sucesso!");
          onClose();
          router.refresh();
        } else {
          toast.error(result.error || "Erro ao adicionar a corrida");
        }
      }
    } catch (error) {
      toast.error("Erro inesperado ocorreu");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isEditing = !!raceToEdit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={() => !isSubmitting && onClose()}
      />

      <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-bold text-white font-mono">
              {isEditing ? "Editar Corrida" : "Nova Corrida"}
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {isEditing
                ? "Atualize as informações da etapa"
                : "Adicione uma nova etapa ao calendário"}
            </p>
          </div>
          <button
            title="Fechar"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Round</label>
              <input
                type="number"
                min="1"
                className="w-full h-10 px-3 bg-zinc-900 border border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-white"
                value={round}
                onChange={(e) => setRound(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">
                Data (Opcional)
              </label>
              <div className="relative">
                <input
                  type="datetime-local"
                  className="w-full h-10 px-3 bg-zinc-900 border border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 [color-scheme:dark] text-white"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              Nome da Corrida *
            </label>
            <input
              type="text"
              placeholder="Ex: Bahrain Grand Prix"
              className="w-full h-10 px-3 bg-zinc-900 border border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              Nome da Pista (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Bahrain"
              className="w-full h-10 px-3 bg-zinc-900 border border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
              value={trackApiName}
              onChange={(e) => setTrackApiName(e.target.value)}
            />
            <p className="text-xs text-zinc-500">
              Geralmente a pista é definida automaticamente ao importar o
              evento.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="w-full h-10 flex items-center justify-center bg-transparent border border-zinc-700 text-zinc-300 rounded-md hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50 font-medium"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10 flex items-center justify-center bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-md transition-colors disabled:opacity-50 gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting
                ? "Salvando..."
                : isEditing
                  ? "Salvar Alterações"
                  : "Criar Corrida"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
