"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { inviteAdmin, removeAdmin } from "@/lib/leagues";
import { Trash2, CheckCircle2, AlertCircle } from "lucide-react";

type AdminsManagerProps = {
  leagueId: string;
  owner: {
    name: string | null;
    email: string;
    image?: string | null;
  };
  admins: Array<{
    id: string;
    user: {
      id: string;
      name: string | null;
      email: string;
      image?: string | null;
    };
  }>;
};

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

export function AdminsManager({ leagueId, owner, admins }: AdminsManagerProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    userId: string;
    nameOrEmail: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function handleAddAdmin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setFeedback({ type: "error", message: "Informe um email para adicionar." });
      return;
    }

    setIsAdding(true);
    setFeedback(null);

    const result = await inviteAdmin(leagueId, normalizedEmail);

    if (!result.success) {
      setFeedback({
        type: "error",
        message: result.error || "Não foi possível adicionar o administrador.",
      });
      setIsAdding(false);
      return;
    }

    setFeedback({
      type: "success",
      message:
        "Administrador adicionado com sucesso. Ele já pode acessar esta liga em Minhas Ligas.",
    });
    setEmail("");
    setIsAdding(false);
    router.refresh();
  }

  async function handleRemoveAdmin(userId: string, nameOrEmail: string) {
    setRemovingUserId(userId);
    setFeedback(null);

    const result = await removeAdmin(leagueId, userId);

    if (!result.success) {
      setFeedback({
        type: "error",
        message: result.error || "Não foi possível remover o administrador.",
      });
      setRemovingUserId(null);
      return;
    }

    setFeedback({ type: "success", message: "Administrador removido com sucesso." });
    setRemovingUserId(null);
    setPendingRemoval(null);
    router.refresh();
  }

  return (
    <div className="p-6 space-y-6">
      {feedback && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
            feedback.type === "success"
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/20 overflow-hidden flex items-center justify-center text-base font-medium text-cyan-400">
              {owner.image ? (
                <img
                  src={owner.image}
                  alt={owner.name || owner.email}
                  className="w-full h-full object-cover"
                />
              ) : (
                (owner.name || owner.email).charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{owner.name || owner.email}</p>
              <p className="text-[10px] uppercase font-mono tracking-wider text-cyan-400">Proprietário</p>
            </div>
          </div>
        </div>

        {admins.map((admin) => {
          const nameOrEmail = admin.user.name || admin.user.email;

          return (
            <div
              key={admin.id}
              className="flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center text-base font-medium text-zinc-400">
                  {admin.user.image ? (
                    <img
                      src={admin.user.image}
                      alt={nameOrEmail}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    nameOrEmail.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{nameOrEmail}</p>
                  <p className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">Administrador</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPendingRemoval({
                    userId: admin.user.id,
                    nameOrEmail,
                  })
                }
                disabled={removingUserId === admin.user.id}
                className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                title="Remover administrador"
              >
                <Trash2 size={18} />
              </button>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleAddAdmin} className="flex gap-3 pt-4 border-t border-zinc-800/50">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email do usuário"
          className="flex-1 px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
        />
        <button
          type="submit"
          disabled={isAdding}
          className="px-5 py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-purple-500/20 disabled:opacity-50"
        >
          {isAdding ? "Adicionando..." : "Adicionar"}
        </button>
      </form>

      {pendingRemoval && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="p-5 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white font-mono">
                Confirmar remoção de administrador
              </h3>
              <p className="text-sm text-zinc-400 mt-2">
                Remover {pendingRemoval.nameOrEmail} da administração desta liga?
              </p>
            </div>

            <div className="p-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingRemoval(null)}
                disabled={removingUserId !== null}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() =>
                  handleRemoveAdmin(
                    pendingRemoval.userId,
                    pendingRemoval.nameOrEmail,
                  )
                }
                disabled={removingUserId !== null}
                className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {removingUserId === pendingRemoval.userId
                  ? "Removendo..."
                  : "Confirmar remoção"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
