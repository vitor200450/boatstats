"use client";

import { use, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTeam } from "@/lib/leagues";
import ImportTeamDialog from "@/components/ImportTeamDialog";
import { ArrowLeft, Users, ImageIcon, X, Upload, Loader2, CheckCircle, ArrowUpDown, Plus, Minus } from "lucide-react";
import { RGBColorPicker } from "@/components/RGBColorPicker";

interface NewTeamPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function NewTeamPage({ params }: NewTeamPageProps) {
  const { id: leagueId } = use(params);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState("#FF0000");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoError, setLogoError] = useState(false);

  // Logo adjustment state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [logoScale, setLogoScale] = useState(1);
  const [logoPosX, setLogoPosX] = useState(0);
  const [logoPosY, setLogoPosY] = useState(0);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStartValues, setDragStartValues] = useState<{ x: number; y: number } | null>(null);


  async function deleteOldImage(imageUrl: string) {
    if (!imageUrl) return;
    try {
      await fetch("/api/upload/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
    } catch (err) {
      console.error("Failed to delete old image:", err);
    }
  }

  async function handleFileUpload(file: File) {
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

    const uploadData = new FormData();
    uploadData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadData,
      });

      const data = await response.json();

      if (response.ok && data.url) {
        // Delete old image before setting new one
        if (logoUrl) {
          await deleteOldImage(logoUrl);
        }
        setLogoUrl(data.url);
        setLogoError(false);
      } else {
        throw new Error(data.error || "Erro no upload");
      }
    } catch {
      setError("Falha ao carregar imagem para o storage.");
    } finally {
      setIsUploading(false);
    }
  }

  async function clearLogo() {
    if (logoUrl) {
      await deleteOldImage(logoUrl);
    }
    setLogoUrl("");
    setLogoError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await createTeam(leagueId, {
      name: formData.get("name") as string,
      color: formData.get("color") as string,
      logoUrl: logoUrl || undefined,
      logoScale: logoUrl ? logoScale : undefined,
      logoPosX: logoUrl ? logoPosX : undefined,
      logoPosY: logoUrl ? logoPosY : undefined,
    });

    if (result.success) {
      router.push(`/admin/leagues/${leagueId}/teams`);
    } else {
      setError(result.error || "Erro ao criar equipe");
      setIsSubmitting(false);
    }
  }

  // Logo adjustment functions
  function openAdjustModal() {
    setShowAdjustModal(true);
  }

  function closeAdjustModal() {
    setShowAdjustModal(false);
    setDragStartPos(null);
    setDragStartValues(null);
  }

  function resetLogoSettings() {
    setLogoScale(1);
    setLogoPosX(0);
    setLogoPosY(0);
  }

  function handleLogoDragStart(clientX: number, clientY: number) {
    setDragStartPos({ x: clientX, y: clientY });
    setDragStartValues({ x: logoPosX, y: logoPosY });
  }

  function handleLogoDragMove(clientX: number, clientY: number) {
    if (!dragStartPos || !dragStartValues) return;
    const newX = dragStartValues.x + (clientX - dragStartPos.x) * 0.25;
    const newY = dragStartValues.y + (clientY - dragStartPos.y) * 0.25;
    setLogoPosX(Math.max(-50, Math.min(50, Math.round(newX))));
    setLogoPosY(Math.max(-50, Math.min(50, Math.round(newY))));
  }

  function handleLogoDragEnd() {
    setDragStartPos(null);
    setDragStartValues(null);
  }

  function handleLogoWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setLogoScale((prev) =>
      Math.max(0.5, Math.min(3, Math.round((prev + delta) * 10) / 10))
    );
  }

  function adjustZoom(delta: number) {
    setLogoScale((prev) =>
      Math.max(0.5, Math.min(3, Math.round((prev + delta) * 10) / 10))
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/leagues/${leagueId}/teams`}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-zinc-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Nova Equipe</h1>
          <p className="text-zinc-400">Adicione uma equipe à liga</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-200 font-medium">Já existe essa equipe em outra liga?</p>
          <p className="text-xs text-zinc-500 mt-1">Importe nome, cor e logo sem recriar tudo manualmente.</p>
        </div>
        <ImportTeamDialog
          targetLeagueId={leagueId}
          triggerLabel="Importar de outra liga"
          onImported={() => router.push(`/admin/leagues/${leagueId}/teams`)}
          triggerClassName="inline-flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-colors border border-zinc-700"
        />
      </div>

      <form action={handleSubmit} className="space-y-6">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              Informações da Equipe
            </h2>
          </div>

          {/* Logo Section */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-zinc-300">
              Logo da Equipe
            </label>

            <div className="flex gap-4">
              {/* Logo Preview */}
              <div className="w-20 h-20 rounded-xl bg-zinc-900 border-2 border-dashed border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden relative group"
                   style={{ backgroundColor: logoUrl ? undefined : `${selectedColor}15` }}>
                {logoUrl && !logoError ? (
                  <>
                    <img
                      src={logoUrl}
                      alt="Preview"
                      className="w-full h-full object-contain p-2 transition-transform duration-200"
                      style={{
                        transform: `scale(${logoScale}) translate(${logoPosX}%, ${logoPosY}%)`,
                        transformOrigin: "center center",
                      }}
                      onError={() => setLogoError(true)}
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Upload size={16} className="text-white" />
                    </div>
                  </>
                ) : isUploading ? (
                  <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
                ) : (
                  <Users className="w-8 h-8" style={{ color: selectedColor }} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  disabled={isUploading}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              {/* URL Input */}
              <div className="flex-1 space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 relative group">
                    <input
                      type="url"
                      name="logoUrl"
                      value={logoUrl}
                      onChange={(e) => {
                        setLogoUrl(e.target.value);
                        setLogoError(false);
                      }}
                      placeholder="Upload ou cole uma URL direta..."
                      disabled={isUploading}
                      className="w-full pl-4 pr-10 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm disabled:opacity-50"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <label className="cursor-pointer p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-cyan-400">
                        <Upload size={14} />
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                          disabled={isUploading}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={clearLogo}
                      disabled={isUploading}
                      className="p-2.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg transition-colors disabled:opacity-50"
                      title="Remover logo"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                    <CheckCircle size={10} className="text-green-500" />
                    Upload automático para R2
                  </p>
                  <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                    <CheckCircle size={10} className="text-green-500" />
                    PNG, JPG ou WEBP (Max 2MB)
                  </p>
                </div>

                {/* Adjust Logo Button */}
                {logoUrl && (
                  <button
                    type="button"
                    onClick={openAdjustModal}
                    className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm mt-2"
                  >
                    <ArrowUpDown size={14} />
                    Ajustar posição e zoom
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="h-px bg-zinc-800" />

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Nome da Equipe *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              placeholder="Ex: Red Bull Racing"
              className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              Cor da Equipe
            </label>
            <RGBColorPicker
              value={selectedColor}
              onChange={setSelectedColor}
              disabled={isSubmitting || isUploading}
            />
            <input type="hidden" name="color" value={selectedColor} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-4">
          <Link
            href={`/admin/leagues/${leagueId}/teams`}
            className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || isUploading}
            className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-cyan-500/20"
          >
            {isSubmitting ? "Criando..." : "Criar Equipe"}
          </button>
        </div>

        {/* Logo Adjustment Modal */}
        {showAdjustModal && logoUrl && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onMouseMove={(e) => handleLogoDragMove(e.clientX, e.clientY)}
            onMouseUp={handleLogoDragEnd}
            onMouseLeave={handleLogoDragEnd}
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm">
              <div className="flex items-center justify-between p-5 border-b border-zinc-800">
                <h3 className="text-lg font-bold text-white">Ajustar Logo</h3>
                <button
                  type="button"
                  onClick={closeAdjustModal}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X size={20} className="text-zinc-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Draggable preview */}
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`w-64 h-64 rounded-xl overflow-hidden border-2 border-zinc-700 select-none ${
                      dragStartPos ? "cursor-grabbing" : "cursor-grab"
                    }`}
                    style={{ backgroundColor: `${selectedColor}20` }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleLogoDragStart(e.clientX, e.clientY);
                    }}
                    onTouchStart={(e) => {
                      const t = e.touches[0];
                      handleLogoDragStart(t.clientX, t.clientY);
                    }}
                    onTouchMove={(e) => {
                      const t = e.touches[0];
                      handleLogoDragMove(t.clientX, t.clientY);
                    }}
                    onTouchEnd={handleLogoDragEnd}
                    onWheel={handleLogoWheel}
                  >
                    <img
                      src={logoUrl}
                      alt="Preview"
                      className="w-full h-full object-contain"
                      style={{
                        transform: `scale(${logoScale}) translate(${logoPosX}%, ${logoPosY}%)`,
                        transformOrigin: "center center",
                        pointerEvents: "none",
                      }}
                      draggable={false}
                    />
                  </div>
                  <p className="text-xs text-zinc-500">
                    Arraste para reposicionar · Scroll para zoom
                  </p>
                </div>

                {/* Zoom controls */}
                <div className="flex items-center gap-3 bg-zinc-950 rounded-xl px-4 py-3">
                  <span className="text-sm font-medium text-zinc-400 flex-shrink-0">Zoom</span>
                  <button
                    type="button"
                    onClick={() => adjustZoom(-0.1)}
                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex-1 text-center font-mono text-white text-sm">
                    {logoScale.toFixed(1)}x
                  </div>
                  <button
                    type="button"
                    onClick={() => adjustZoom(0.1)}
                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Quick actions */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setLogoPosX(0); setLogoPosY(0); }}
                    className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm"
                  >
                    Centralizar
                  </button>
                  <button
                    type="button"
                    onClick={resetLogoSettings}
                    className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm"
                  >
                    Resetar tudo
                  </button>
                </div>
              </div>

              <div className="flex gap-3 p-5 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={closeAdjustModal}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={closeAdjustModal}
                  className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold rounded-lg transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
