"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { recalculatePoints } from "@/lib/leagues";

type RecalculateStandingsButtonProps = {
  seasonId: string;
};

export function RecalculateStandingsButton({
  seasonId,
}: RecalculateStandingsButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleClick() {
    setIsSubmitting(true);
    setStatus(null);

    const result = await recalculatePoints(seasonId);

    if (result.success) {
      setStatus({
        type: "success",
        message: "Pontos dos resultados e classificação recalculados com sucesso.",
      });
    } else {
      setStatus({
        type: "error",
        message: result.error || "Erro ao recalcular pontos e classificação.",
      });
    }

    setIsSubmitting(false);
  }

  return (
    <div className="flex items-center gap-3">
      {status && (
        <span
          className={`text-sm ${
            status.type === "success" ? "text-green-400" : "text-red-400"
          }`}
        >
          {status.message}
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isSubmitting}
        className="px-5 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-400 border border-cyan-500/30 font-medium rounded-xl transition-all inline-flex items-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Recalculando...
          </>
        ) : (
          <>
            <RotateCcw className="w-4 h-4" />
            Recalcular pontos + classificação
          </>
        )}
      </button>
    </div>
  );
}
