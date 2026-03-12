"use client";

import { useTransition } from "react";
import { createPortal } from "react-dom";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export default function CustomConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "CONFIRM",
  cancelLabel = "CANCEL",
  isDestructive = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await onConfirm();
        onClose();
      } catch (error: unknown) {
        alert(error instanceof Error ? error.message : "An action error occurred");
      }
    });
  };

  const modal = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-6 md:p-8">
      <div className="bg-neutral-900 border border-neutral-800 w-[95%] max-w-sm rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden p-6 relative">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center border ${
              isDestructive
                ? "bg-red-500/10 border-red-500/20"
                : "bg-cyan-500/10 border-cyan-500/20"
            }`}
          >
            <span
              className={`material-symbols-outlined ${
                isDestructive ? "text-red-400" : "text-cyan-400"
              }`}
            >
              {isDestructive ? "warning" : "info"}
            </span>
          </div>
          <h3 className="text-lg font-bold font-mono tracking-tight text-white">
            {title}
          </h3>
        </div>

        <p className="text-sm text-neutral-400 mb-6">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm font-bold text-neutral-400 hover:text-white transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className={`px-6 py-2 font-bold text-sm rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 ${
              isDestructive
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-cyan-500 hover:bg-cyan-400 text-neutral-950"
            }`}
          >
            {isPending ? "PROCESSING..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
