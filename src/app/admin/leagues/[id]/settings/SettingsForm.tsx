"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeague } from "@/lib/leagues";
import { LogoImage } from "@/components/LogoImage";
import { Save, CheckCircle, ImageIcon, X, Upload, Loader2, Lock } from "lucide-react";

interface League {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  ownerId: string;
  owner: {
    id: string;
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
}

interface SettingsFormProps {
  league: League;
  isOwner: boolean;
  isSuperAdmin: boolean;
}

export function SettingsForm({
  league,
  isOwner,
  isSuperAdmin,
}: SettingsFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: league.name,
    description: league.description || "",
    logoUrl: league.logoUrl || "",
  });
  const [logoPreview, setLogoPreview] = useState(league.logoUrl);
  const [logoError, setLogoError] = useState(false);

  const canEdit = isOwner || isSuperAdmin;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    setIsSaving(true);

    try {
      const result = await updateLeague(league.id, {
        name: formData.name,
        description: formData.description || undefined,
        logoUrl: formData.logoUrl || undefined,
      });

      if (result.success) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        router.refresh();
      }
    } catch (error) {
      console.error("Error updating league:", error);
    } finally {
      setIsSaving(false);
    }
  }

  function handleLogoUrlChange(url: string) {
    setFormData({ ...formData, logoUrl: url });
    setLogoPreview(url || null);
    setLogoError(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
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

    const uploadData = new FormData();
    uploadData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadData,
      });

      const data = await response.json();

      if (response.ok && data.url) {
        handleLogoUrlChange(data.url);
      } else {
        throw new Error(data.error || "Erro no upload");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setError("Falha ao carregar imagem para o storage.");
    } finally {
      setIsUploading(false);
    }
  }

  async function clearLogo() {
    setFormData({ ...formData, logoUrl: "" });
    setLogoPreview(null);
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {/* Success Message */}
      {showSuccess && (
        <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">
          <CheckCircle size={18} />
          <span className="text-sm">Alterações salvas com sucesso!</span>
        </div>
      )}

      {/* Logo Section */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-zinc-300">
          Logo da Liga
        </label>

        <div className="flex gap-4">
          {/* Logo Preview */}
          <div className="w-20 h-20 rounded-xl bg-zinc-900 border-2 border-dashed border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden relative group">
            {logoPreview && !logoError ? (
              <>
                <img
                  src={logoPreview}
                  alt="Preview"
                  className="w-full h-full object-contain p-2"
                  onError={() => setLogoError(true)}
                />
                {canEdit && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload size={16} className="text-white" />
                  </div>
                )}
              </>
            ) : isUploading ? (
              <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
            ) : (
              <ImageIcon className="w-8 h-8 text-zinc-700" />
            )}
            {canEdit && (
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            )}
          </div>

          {/* URL Input */}
          <div className="flex-1 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 relative group">
                <input
                  type="text"
                  value={formData.logoUrl}
                  readOnly
                  placeholder="Nenhuma logo enviada"
                  disabled
                  className="w-full pl-4 pr-10 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm disabled:opacity-50"
                />
                {canEdit && (
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
                )}
              </div>
              {formData.logoUrl && canEdit && (
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
                <Lock size={10} className="text-cyan-500" />
                Link protegido: edição manual desativada
              </p>
              <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                <CheckCircle size={10} className="text-green-500" />
                PNG, JPG ou WEBP (Max 2MB)
              </p>
            </div>

            {error || logoError ? (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>
                {error || "Erro com a imagem. Tente fazer upload novamente."}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="h-px bg-zinc-800" />

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Nome da Liga
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          disabled={!canEdit}
          className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all disabled:opacity-50"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Descrição
        </label>
        <textarea
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          rows={3}
          disabled={!canEdit}
          className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none transition-all disabled:opacity-50"
        />
        <p className="text-xs text-zinc-500 mt-1.5">
          Uma breve descrição sobre o propósito e objetivos da sua liga
        </p>
      </div>

      {/* Submit Button */}
      {canEdit && (
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-cyan-500/20"
          >
            {isSaving ? (
              <>
                <span className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save size={18} />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
}
