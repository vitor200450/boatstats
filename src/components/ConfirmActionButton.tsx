"use client";

import { useState } from "react";
import { toast } from "sonner";

type ActionResult =
  | void
  | {
      success?: boolean;
      error?: string;
    };

type ConfirmActionButtonProps = {
  action: () => Promise<ActionResult>;
  triggerLabel: string;
  triggerClassName: string;
  title: string;
  message: string;
  confirmLabel: string;
  confirmClassName?: string;
  cancelLabel?: string;
  successMessage?: string;
  errorMessage?: string;
};

export function ConfirmActionButton({
  action,
  triggerLabel,
  triggerClassName,
  title,
  message,
  confirmLabel,
  confirmClassName,
  cancelLabel = "Cancelar",
  successMessage,
  errorMessage,
}: ConfirmActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const result = await action();

      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        result.success === false
      ) {
        toast.error(result.error || errorMessage || "Não foi possível concluir a ação.");
        return;
      }

      if (successMessage) {
        toast.success(successMessage);
      }

      setIsOpen(false);
    } catch (error) {
      if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : errorMessage || "Não foi possível concluir a ação.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="p-5 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white font-mono">{title}</h3>
              <p className="text-sm text-zinc-400 mt-2">{message}</p>
            </div>

            <div className="p-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              >
                {cancelLabel}
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className={
                  confirmClassName ??
                  "px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                }
              >
                {isSubmitting ? "Processando..." : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
