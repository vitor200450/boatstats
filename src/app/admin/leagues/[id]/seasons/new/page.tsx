"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createSeason,
  deletePointsTemplate,
  getMyPointsTemplates,
  incrementTemplateUsage,
  savePointsTemplate,
  updatePointsTemplate,
} from "@/lib/leagues";
import {
  EVERYONE_SCORES_POINTS,
  F1_SPRINT_POINTS,
  F1_STANDARD_POINTS,
  type PointsSystem,
} from "@/lib/leagues/pointsSystem";
import {
  ArrowLeft,
  Bookmark,
  Calendar,
  Check,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

interface NewSeasonPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface PointsTemplate {
  id: string;
  name: string;
  description: string | null;
  pointsData: PointsSystem;
  usageCount: number;
  createdAt: string | Date;
}

type TemplateFormMode = "create" | "edit";

type PositionInput = {
  position: number;
  points: number;
};

const DEFAULT_CUSTOM_POSITIONS: PositionInput[] = [
  { position: 1, points: 25 },
  { position: 2, points: 18 },
  { position: 3, points: 15 },
  { position: 4, points: 12 },
  { position: 5, points: 10 },
  { position: 6, points: 8 },
  { position: 7, points: 6 },
  { position: 8, points: 4 },
  { position: 9, points: 2 },
  { position: 10, points: 1 },
];

export default function NewSeasonPage({ params }: NewSeasonPageProps) {
  const { id: leagueId } = use(params);
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPointsSystem, setSelectedPointsSystem] = useState("f1");

  const [customName, setCustomName] = useState("Sistema Personalizado");
  const [customPositions, setCustomPositions] = useState<PositionInput[]>(
    DEFAULT_CUSTOM_POSITIONS,
  );
  const [customBonuses, setCustomBonuses] = useState({
    fastestLap: 1,
    polePosition: 0,
    mostLapsLed: 0,
    finishRace: 0,
  });

  const [templates, setTemplates] = useState<PointsTemplate[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateFormMode, setTemplateFormMode] = useState<TemplateFormMode>("create");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  async function loadTemplates() {
    const result = await getMyPointsTemplates();
    if (result.success && result.data) {
      const parsedTemplates = result.data.map((template) => ({
        ...template,
        pointsData: template.pointsData as unknown as PointsSystem,
      }));
      setTemplates(parsedTemplates);
    }
  }

  const handleSelectPointsSystem = async (id: string) => {
    setSelectedPointsSystem(id);
    if (id === "custom" && templates.length === 0) {
      await loadTemplates();
    }
  };

  const buildCustomPointsSystem = (): PointsSystem => {
    const positions: Record<string, number> = {};
    customPositions.forEach((position) => {
      if (position.points > 0) {
        positions[position.position.toString()] = position.points;
      }
    });

    const bonuses: PointsSystem["bonuses"] = {};
    if (customBonuses.fastestLap > 0) bonuses.fastestLap = customBonuses.fastestLap;
    if (customBonuses.polePosition > 0) bonuses.polePosition = customBonuses.polePosition;
    if (customBonuses.mostLapsLed > 0) bonuses.mostLapsLed = customBonuses.mostLapsLed;
    if (customBonuses.finishRace > 0) bonuses.finishRace = customBonuses.finishRace;

    return {
      name: customName,
      positions,
      bonuses,
      rules: {},
    };
  };

  const getPointsSystem = (id: string): PointsSystem => {
    switch (id) {
      case "f1":
        return F1_STANDARD_POINTS;
      case "sprint":
        return F1_SPRINT_POINTS;
      case "everyone":
        return EVERYONE_SCORES_POINTS;
      case "custom":
        return buildCustomPointsSystem();
      default:
        return F1_STANDARD_POINTS;
    }
  };

  const applyTemplate = (template: PointsTemplate) => {
    const data = template.pointsData;
    setCustomName(data.name || template.name);

    const positions = Object.entries(data.positions)
      .map(([pos, pts]) => ({ position: parseInt(pos, 10), points: pts }))
      .sort((a, b) => a.position - b.position);

    setCustomPositions(positions.length > 0 ? positions : DEFAULT_CUSTOM_POSITIONS);
    setCustomBonuses({
      fastestLap: data.bonuses?.fastestLap || 0,
      polePosition: data.bonuses?.polePosition || 0,
      mostLapsLed: data.bonuses?.mostLapsLed || 0,
      finishRace: data.bonuses?.finishRace || 0,
    });

    void incrementTemplateUsage(template.id);
  };

  const openCreateTemplateForm = () => {
    setTemplateFormMode("create");
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateDescription("");
    setShowSaveTemplate(true);
  };

  const openEditTemplateForm = (template: PointsTemplate) => {
    setTemplateFormMode("edit");
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setShowSaveTemplate(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;

    setSavingTemplate(true);
    const payload = {
      name: templateName,
      description: templateDescription,
      pointsData: buildCustomPointsSystem(),
    };
    const result =
      templateFormMode === "edit" && editingTemplateId
        ? await updatePointsTemplate({ templateId: editingTemplateId, ...payload })
        : await savePointsTemplate(payload);
    setSavingTemplate(false);

    if (result.success) {
      setShowSaveTemplate(false);
      setTemplateName("");
      setTemplateDescription("");
      setTemplateFormMode("create");
      setEditingTemplateId(null);
      await loadTemplates();
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Deseja realmente excluir este template?")) return;
    const result = await deletePointsTemplate(templateId);
    if (result.success) {
      if (editingTemplateId === templateId) {
        setShowSaveTemplate(false);
        setTemplateFormMode("create");
        setEditingTemplateId(null);
      }
      await loadTemplates();
    }
  };

  const addPosition = () => {
    const nextPosition = customPositions.length + 1;
    setCustomPositions([...customPositions, { position: nextPosition, points: 0 }]);
  };

  const removePosition = (index: number) => {
    if (customPositions.length <= 1) return;
    const next = customPositions.filter((_, i) => i !== index);
    next.forEach((position, i) => {
      position.position = i + 1;
    });
    setCustomPositions(next);
  };

  const updatePositionPoints = (index: number, points: number) => {
    const next = [...customPositions];
    next[index].points = points;
    setCustomPositions(next);
  };

  const pointsSystemOptions = [
    {
      id: "f1",
      name: "F1 Padrão",
      description: "25-18-15-12-10-8-6-4-2-1 + 1 FL",
    },
    { id: "sprint", name: "F1 Sprint", description: "8-7-6-5-4-3-2-1" },
    {
      id: "everyone",
      name: "Todos Pontuam",
      description: "40-35-34-33... + bônus",
    },
    {
      id: "custom",
      name: "Personalizado",
      description: "Configure pontos e bônus manualmente",
    },
  ];

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const rawYear = (formData.get("year") as string | null)?.trim();
    const parsedYear = rawYear ? parseInt(rawYear, 10) : undefined;

    const result = await createSeason(leagueId, {
      name: formData.get("name") as string,
      year: Number.isNaN(parsedYear) ? undefined : parsedYear,
      pointsSystem: getPointsSystem(selectedPointsSystem),
    });

    if (result.success && result.data) {
      router.push(`/admin/leagues/${leagueId}/seasons/${result.data.id}`);
    } else {
      setError(result.error || "Erro ao criar temporada");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-32">
      <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
        <Link
          href={`/admin/leagues/${leagueId}/seasons`}
          className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors group"
        >
          <ArrowLeft
            size={20}
            className="text-zinc-400 group-hover:text-white transition-colors"
          />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight font-mono">
            Nova Temporada
          </h1>
          <p className="text-zinc-400 mt-1">
            Defina os dados da temporada e o sistema de pontuação
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
          <div className="flex items-center gap-3 p-6 border-b border-zinc-800/80 bg-gradient-to-r from-purple-500/10 to-purple-600/5">
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
              <Calendar className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-mono">Informações da Temporada</h2>
              <p className="text-xs text-purple-400/70">Dados básicos da temporada</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-zinc-300 mb-2">
                Nome da Temporada <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                defaultValue={currentYear.toString()}
                placeholder="Ex: 2026"
                className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
            </div>

            <div>
              <label htmlFor="year" className="block text-sm font-medium text-zinc-300 mb-2">
                Ano
              </label>
              <input
                type="number"
                id="year"
                name="year"
                min={2020}
                max={2100}
                defaultValue={currentYear}
                className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-zinc-800/80 bg-gradient-to-r from-green-500/10 to-green-600/5">
            <div className="w-11 h-11 rounded-xl bg-green-500/20 flex items-center justify-center border border-green-500/20">
              <span className="material-symbols-outlined text-green-400">emoji_events</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-mono">Sistema de Pontos</h2>
              <p className="text-xs text-green-400/70">Como os pontos serão distribuídos</p>
            </div>
          </div>

          <div className="p-6 space-y-3">
            {pointsSystemOptions.map((option) => (
              <label
                key={option.id}
                className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedPointsSystem === option.id
                    ? "border-cyan-500/50 bg-cyan-500/5"
                    : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/30"
                }`}
              >
                <input
                  type="radio"
                  name="pointsSystem"
                  value={option.id}
                  checked={selectedPointsSystem === option.id}
                  onChange={(e) => {
                    void handleSelectPointsSystem(e.target.value);
                  }}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedPointsSystem === option.id ? "border-cyan-500" : "border-zinc-600"
                  }`}
                >
                  {selectedPointsSystem === option.id && (
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">{option.name}</div>
                  <div className="text-sm text-zinc-400">{option.description}</div>
                </div>
                {selectedPointsSystem === option.id && <Check size={18} className="text-cyan-400" />}
              </label>
            ))}
          </div>

          {selectedPointsSystem === "custom" && (
            <div className="p-6 pt-2 border-t border-zinc-800 space-y-6">
              <div className="flex items-center gap-3 text-yellow-400 mb-4">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                  <Settings2 className="w-5 h-5" />
                </div>
                <span className="font-medium">Configuração Personalizada</span>
              </div>

              {templates.length > 0 && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-zinc-300">Templates Salvos</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => applyTemplate(template)}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left hover:text-cyan-300 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                              <Bookmark className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{template.name}</p>
                              {template.description && (
                                <p className="text-xs text-zinc-500 truncate">{template.description}</p>
                              )}
                            </div>
                          </button>
                          <div className="flex flex-col gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditTemplateForm(template)}
                              className="px-2 py-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteTemplate(template.id)}
                              className="px-2 py-1 text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded"
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-zinc-300">Nome do Sistema</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (showSaveTemplate) {
                        setShowSaveTemplate(false);
                        setTemplateFormMode("create");
                        setEditingTemplateId(null);
                        return;
                      }
                      openCreateTemplateForm();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-sm bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {showSaveTemplate ? "Fechar" : "Novo Template"}
                  </button>
                </div>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
                  placeholder="Ex: Meu Sistema de Pontos"
                />
              </div>

              {showSaveTemplate && (
                <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-lg space-y-4">
                  <h4 className="text-sm font-medium text-cyan-400">
                    {templateFormMode === "edit" ? "Editar Template" : "Salvar como Template"}
                  </h4>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Nome do template"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                  <input
                    type="text"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Descrição (opcional)"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveTemplate}
                      disabled={!templateName.trim() || savingTemplate}
                      className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-medium rounded-lg transition-colors text-sm"
                    >
                      {savingTemplate
                        ? "Salvando..."
                        : templateFormMode === "edit"
                          ? "Atualizar"
                          : "Salvar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSaveTemplate(false);
                        setTemplateFormMode("create");
                        setEditingTemplateId(null);
                      }}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-zinc-300">Pontos por Posição</label>
                  <button
                    type="button"
                    onClick={addPosition}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                  >
                    <Plus size={16} />
                    Adicionar Posição
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {customPositions.map((position, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl"
                    >
                      <span className="text-sm font-medium text-zinc-500 w-10">{position.position}º</span>
                      <input
                        type="number"
                        min={0}
                        value={position.points}
                        onChange={(e) => updatePositionPoints(index, parseInt(e.target.value, 10) || 0)}
                        className="flex-1 min-w-0 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-center focus:outline-none focus:border-cyan-500/50 text-base"
                      />
                      <button
                        type="button"
                        onClick={() => removePosition(index)}
                        className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                        disabled={customPositions.length <= 1}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">Bônus</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                    <span className="text-sm text-zinc-400">Volta mais rápida</span>
                    <input
                      type="number"
                      min={0}
                      value={customBonuses.fastestLap}
                      onChange={(e) =>
                        setCustomBonuses({
                          ...customBonuses,
                          fastestLap: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-20 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-center focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                    <span className="text-sm text-zinc-400">Pole Position</span>
                    <input
                      type="number"
                      min={0}
                      value={customBonuses.polePosition}
                      onChange={(e) =>
                        setCustomBonuses({
                          ...customBonuses,
                          polePosition: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-20 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-center focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                    <span className="text-sm text-zinc-400">Mais voltas na frente</span>
                    <input
                      type="number"
                      min={0}
                      value={customBonuses.mostLapsLed}
                      onChange={(e) =>
                        setCustomBonuses({
                          ...customBonuses,
                          mostLapsLed: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-20 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-center focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                    <span className="text-sm text-zinc-400">Completar corrida</span>
                    <input
                      type="number"
                      min={0}
                      value={customBonuses.finishRace}
                      onChange={(e) =>
                        setCustomBonuses({
                          ...customBonuses,
                          finishRace: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-20 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-center focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 pb-8 px-6 -mx-6 sticky bottom-0 bg-neutral-950/80 backdrop-blur-sm border-t border-zinc-800 py-4">
          <Link
            href={`/admin/leagues/${leagueId}/seasons`}
            className="px-6 py-2.5 text-zinc-400 hover:text-white transition-colors font-medium"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-cyan-500/20"
          >
            {isSubmitting ? "Criando..." : "Criar Temporada"}
          </button>
        </div>
      </form>
    </div>
  );
}
