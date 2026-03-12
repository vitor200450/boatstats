"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createLeague } from "@/lib/leagues";
import { ArrowLeft, Trophy, Check, ImageIcon, Upload, Loader2 } from "lucide-react";

export default function NewLeaguePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logoUrl, setLogoUrl] = useState("");
  const [logoError, setLogoError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const currentYear = new Date().getFullYear();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Por favor, selecione uma imagem válida.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 2MB.");
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.url) {
        setLogoUrl(data.url);
        setLogoError(false);
      } else {
        throw new Error(data.error || "Erro no upload");
      }
    } catch (uploadError) {
      console.error("Upload error:", uploadError);
      setError("Falha ao carregar imagem para o storage.");
      setLogoError(true);
    } finally {
      setIsUploading(false);
    }
  };

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await createLeague({
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      logoUrl,
      seasonName: formData.get("seasonName") as string,
    });

    if (result.success && result.data) {
      router.push(`/admin/leagues/${result.data.id}`);
    } else {
      setError(result.error || "Erro ao criar liga");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-32">
      <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
        <Link
          href="/admin/leagues"
          className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors group"
        >
          <ArrowLeft
            size={20}
            className="text-zinc-400 group-hover:text-white transition-colors"
          />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight font-mono">
            Nova Liga
          </h1>
          <p className="text-zinc-400 mt-1">
            Crie uma nova liga e sua primeira temporada
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-red-400 text-lg">
              error
            </span>
          </div>
          <span className="text-red-400">{error}</span>
        </div>
      )}

      <form action={handleSubmit} className="space-y-8">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-zinc-800/80 bg-gradient-to-r from-cyan-500/10 to-cyan-600/5">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/20">
              <Trophy className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-mono">
                Informações da Liga
              </h2>
              <p className="text-xs text-cyan-400/70">Dados básicos da liga</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-zinc-300 mb-2"
              >
                Nome da Liga <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                placeholder="Ex: Campeonato W4FC"
                className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-zinc-300 mb-2"
              >
                Descrição
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Descrição opcional da liga..."
                className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Logo da Liga
              </label>
              <div className="flex gap-4">
                <div className="w-20 h-20 rounded-xl bg-zinc-900 border-2 border-dashed border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden relative group">
                  {logoUrl && !logoError ? (
                    <>
                      <img
                        src={logoUrl}
                        alt="Logo preview"
                        className="w-full h-full object-contain"
                        onError={() => setLogoError(true)}
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Upload size={16} className="text-white" />
                      </div>
                    </>
                  ) : isUploading ? (
                    <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-zinc-700" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                <div className="flex-1 space-y-3">
                  <div className="relative group">
                    <input
                      type="text"
                      id="logoUrl"
                      name="logoUrl"
                      placeholder="Upload ou cole uma URL direta..."
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <label className="cursor-pointer p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-cyan-400">
                        <Upload size={14} />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <Check size={10} className="text-green-500" />
                      Upload automático para R2
                    </p>
                    <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <Check size={10} className="text-green-500" />
                      PNG, JPG ou WEBP (Max 2MB)
                    </p>
                  </div>

                  {logoError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">
                        error
                      </span>
                      Erro com a imagem. Tente fazer upload novamente.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-zinc-800/80 bg-gradient-to-r from-purple-500/10 to-purple-600/5">
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
              <span className="material-symbols-outlined text-purple-400">
                calendar_month
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-mono">
                Primeira Temporada
              </h2>
              <p className="text-xs text-purple-400/70">
                O sistema de pontos será configurado dentro da temporada
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label
                htmlFor="seasonName"
                className="block text-sm font-medium text-zinc-300 mb-2"
              >
                Nome da Temporada <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="seasonName"
                name="seasonName"
                required
                defaultValue={currentYear.toString()}
                placeholder="Ex: 2026"
                className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
              <p className="text-xs text-zinc-500 mt-1.5">
                Normalmente o ano da temporada. Depois de criar a liga, acesse a
                temporada para configurar o sistema de pontuação.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 pb-8 px-6 -mx-6 sticky bottom-0 bg-neutral-950/80 backdrop-blur-sm border-t border-zinc-800 py-4">
          <Link
            href="/admin/leagues"
            className="px-6 py-2.5 text-zinc-400 hover:text-white transition-colors font-medium"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-cyan-500/20"
          >
            {isSubmitting ? "Criando..." : "Criar Liga"}
          </button>
        </div>
      </form>
    </div>
  );
}
