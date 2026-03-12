"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, ArrowRight, ListChecks } from "lucide-react";
import type { AdminChecklistSummary } from "@/lib/adminChecklistSummary";

export function AdminChecklistToast({ summary }: { summary: AdminChecklistSummary }) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/30 bg-zinc-900/95 text-cyan-300 shadow-lg shadow-black/30"
      >
        <ListChecks size={14} />
        Checklist
      </button>
    );
  }

  const isCompletedView = summary.showCompletedSeasonView;

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-800 bg-zinc-900/95 backdrop-blur p-4 shadow-2xl shadow-black/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider font-mono text-zinc-500">Checklist rapido</p>
          <p className="text-sm text-white font-semibold mt-1">{summary.primaryStep.label}</p>
          <p className="text-xs text-zinc-500 mt-1">{summary.primaryStep.help}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs font-mono text-zinc-500">
        {summary.primaryStep.completed ? (
          <CheckCircle2 size={14} className="text-green-400" />
        ) : (
          <Circle size={14} className="text-cyan-400" />
        )}
        <span>
          {summary.completedCount}/{summary.totalCount} concluido
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={
            isCompletedView && summary.checklistLeagueId
              ? `/admin/leagues/${summary.checklistLeagueId}/seasons`
              : summary.primaryStep.href
          }
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-zinc-950 text-sm font-semibold"
        >
          {isCompletedView && summary.checklistLeagueId
            ? "Criar nova temporada"
            : summary.primaryStep.cta}
          <ArrowRight size={14} />
        </Link>
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm"
        >
          Ver checklist completo
        </Link>
      </div>
    </div>
  );
}
