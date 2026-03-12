"use client";

import { useTransition } from "react";
import { createPortal } from "react-dom";
import { inviteUser } from "./actions";

export default function InviteAdminModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await inviteUser(formData);
        onClose(); // close modal on success
      } catch (error: unknown) {
        alert(error instanceof Error ? error.message : "Failed to invite user");
      }
    });
  }

  const modal = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-6 md:p-8">
      <div className="bg-neutral-900 border border-neutral-800 w-[95%] max-w-md rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden p-6 md:p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-cyan-400">
              person_add
            </span>
          </div>
          <div>
            <h3 className="text-lg font-bold font-mono tracking-tight text-white">
              INVITE ADMIN
            </h3>
            <p className="text-xs text-neutral-500">
              Provide an email associated with their Discord account
            </p>
          </div>
        </div>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold font-mono text-neutral-400 mb-2 uppercase">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              placeholder="operator@league.com"
              required
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold font-mono text-neutral-400 mb-2 uppercase">
              Role Clearances
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="relative flex cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  value="ADMIN"
                  className="peer sr-only"
                  defaultChecked
                />
                <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 peer-checked:border-neutral-500 peer-checked:bg-neutral-800/50 transition-all">
                  <div className="font-bold text-sm text-white mb-1">
                    Standard Admin
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    Manage leagues and import tracks.
                  </div>
                </div>
              </label>

              <label className="relative flex cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  value="SUPER_ADMIN"
                  className="peer sr-only"
                />
                <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 peer-checked:border-cyan-500/50 peer-checked:bg-cyan-500/10 transition-all">
                  <div className="font-bold text-sm text-cyan-400 mb-1">
                    Super Admin
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    Full domain override plus user access control.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-neutral-400 hover:text-white transition-colors"
              disabled={isPending}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2 bg-white hover:bg-neutral-200 text-black font-bold text-sm rounded-lg transition-colors flex items-center gap-2 group disabled:opacity-50"
            >
              {isPending ? "SENDING..." : "DISPATCH INVITE"}
              {!isPending && (
                <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                  send
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
