"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  Camera,
  Check,
  CheckCircle2,
  ClipboardPlus,
  Clock,
  Sparkles,
  Thermometer,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { PhotoPicker } from "@/components/PhotoPicker";
import {
  calculateRoutineScore,
  evaluateRoutineTrafficStatus,
  isNumericAnswerOutOfRange,
} from "@/lib/domain/calculations";
import type { RoutineCategory } from "@/types/domain";

interface RoutinesTabProps {
  initialRoutineId?: string | null;
  onClearInitialRoutine?: () => void;
}

const CATEGORY_LABELS: Record<RoutineCategory, string> = {
  opening: "Abertura",
  pre_service: "Troca Turno",
  operation: "Operação",
  closing: "Fechamento",
  "5s_cleaning": "Organização 5S",
  temperature_pvps: "Temp & PVPS",
  periodic: "Periódica",
};

export function RoutinesTab({ initialRoutineId, onClearInitialRoutine }: RoutinesTabProps) {
  const {
    state,
    activeUser,
    toggleRoutineItem,
    updateRoutineItemNumeric,
    updateRoutineItemPhoto,
    toggleRoutineItemNonCompliant,
    completeRoutineRun,
    createRoutineTemplate,
    createActionPlan,
  } = useApp();

  const [filter, setFilter] = useState<"all" | "pending" | "temperature_pvps" | "5s_cleaning" | "periodic">("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRoutineId || null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Estado do formulário de criação de nova rotina
  const [newTitle, setNewTitle] = useState("");
  const [newStation, setNewStation] = useState("Cozinha Quente");
  const [newDueTime, setNewDueTime] = useState("15:00");
  const [newCategory, setNewCategory] = useState<RoutineCategory>("5s_cleaning");
  const [newRecurrence, setNewRecurrence] = useState<"daily" | "weekly" | "biweekly" | "monthly">("daily");
  const [newStepsText, setNewStepsText] = useState(
    "Verificar organização das bancadas\nLimpar geladeira e conferir validades (PVPS)\nTirar foto final da praça limpa"
  );
  const [requirePhotoOnLast, setRequirePhotoOnLast] = useState(true);

  useEffect(() => {
    if (initialRoutineId) {
      setSelectedRunId(initialRoutineId);
      onClearInitialRoutine?.();
    }
  }, [initialRoutineId, onClearInitialRoutine]);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const filteredRoutines = useMemo(() => {
    return state.routines.filter((r) => {
      if (filter === "pending") return r.status !== "completed";
      if (filter === "all") return true;
      return r.category === filter;
    });
  }, [state.routines, filter]);

  const selectedRun = useMemo(
    () => state.routines.find((r) => r.id === selectedRunId) || null,
    [state.routines, selectedRunId]
  );

  function handleCreateRoutine(e: React.FormEvent) {
    e.preventDefault();
    const lines = newStepsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!newTitle.trim() || lines.length === 0) return;

    createRoutineTemplate({
      title: newTitle.trim(),
      description: `Rotina ${newRecurrence} criada para ${newStation}.`,
      category: newCategory,
      station: newStation,
      dueTime: newDueTime,
      recurrence: newRecurrence,
      items: lines.map((label, idx) => ({
        label,
        photoRequired: requirePhotoOnLast && idx === lines.length - 1,
      })),
    });
    setNewTitle("");
    setShowCreateModal(false);
  }

  // Tela de Execução do Checklist Selecionado
  if (selectedRun) {
    const score = calculateRoutineScore(selectedRun.items);
    const doneCount = selectedRun.items.filter((i) => i.checked).length;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelectedRunId(null)}
            className="rounded-xl bg-white border border-[#E5DFD4] px-3 py-2 text-xs font-bold text-stone-800"
          >
            ← Voltar às Rotinas
          </button>
          <span className="font-mono text-xs font-bold bg-stone-900 text-white px-2.5 py-1 rounded-lg">
            Prazo {selectedRun.dueTime} · {score}%
          </span>
        </div>

        <div className="rounded-3xl bg-white border border-[#E5DFD4] p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-orange-100 text-orange-800 px-2.5 py-0.5 text-[11px] font-bold">
              {CATEGORY_LABELS[selectedRun.category]}
            </span>
            <span className="text-xs text-stone-500">{selectedRun.station}</span>
          </div>
          <h2 className="mt-2 text-lg font-extrabold text-stone-900">{selectedRun.title}</h2>
          <p className="mt-1 text-xs text-stone-600">{selectedRun.description}</p>
          <div className="mt-3 h-2 w-full rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round((doneCount / Math.max(1, selectedRun.items.length)) * 100)}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {selectedRun.items.map((item, idx) => {
            const tempOutOfRange = isNumericAnswerOutOfRange(item, item.numericValue);

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 transition ${
                  item.isNonCompliant || tempOutOfRange
                    ? "bg-red-50/70 border-red-300"
                    : item.checked
                      ? "bg-emerald-50/40 border-emerald-200"
                      : "bg-white border-[#E5DFD4]"
                }`}
              >
                <div className="flex items-start gap-3">
                  {item.inputType !== "number_range" ? (
                    <button
                      type="button"
                      onClick={() => toggleRoutineItem(selectedRun.id, item.id)}
                      className={`mt-0.5 h-7 w-7 rounded-xl border-2 flex items-center justify-center shrink-0 transition active:scale-90 ${
                        item.checked
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "bg-white border-stone-300 text-transparent"
                      }`}
                      aria-label="Marcar passo"
                    >
                      <Check className="h-4 w-4 stroke-[3]" />
                    </button>
                  ) : (
                    <div className="mt-0.5 h-7 w-7 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                      <Thermometer className="h-4 w-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-stone-400">
                        #{idx + 1}
                      </span>
                      {item.photoRequired && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 text-[10px] font-bold">
                          <Camera className="h-2.5 w-2.5" /> Foto obrigatória
                        </span>
                      )}
                      {item.isNonCompliant && (
                        <span className="rounded-full bg-red-600 text-white px-2 py-0.5 text-[10px] font-bold">
                          Não Conforme
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm font-bold text-stone-900">{item.label}</p>
                    {item.instructions && (
                      <p className="mt-0.5 text-xs text-stone-500">{item.instructions}</p>
                    )}

                    {/* Campo numérico (Temperaturas / PVPS) */}
                    {item.inputType === "number_range" && (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          placeholder={`Ex.: ${item.minValue ?? 2}`}
                          value={item.numericValue ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateRoutineItemNumeric(
                              selectedRun.id,
                              item.id,
                              raw === "" ? null : Number(raw)
                            );
                          }}
                          className="w-28 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-mono font-bold text-stone-900"
                        />
                        <span className="text-sm font-bold text-stone-600">{item.unit || "°C"}</span>
                        <span className="text-xs text-stone-500">
                          (Faixa: {item.minValue} a {item.maxValue}
                          {item.unit})
                        </span>
                      </div>
                    )}

                    {tempOutOfRange && (
                      <div className="mt-2 rounded-xl bg-red-100 border border-red-200 p-2.5 text-xs text-red-900 font-semibold">
                        Temperatura FORA do padrão sanitário! Acione a manutenção e gere um Plano de Ação.
                      </div>
                    )}

                    {/* Evidência fotográfica */}
                    {(item.photoRequired || item.photoDataUrl) && (
                      <div className="mt-3">
                        <PhotoPicker
                          compact
                          required={item.photoRequired}
                          value={item.photoDataUrl}
                          label="Tirar foto de evidência"
                          onChange={(url) => updateRoutineItemPhoto(selectedRun.id, item.id, url)}
                        />
                      </div>
                    )}

                    {/* Ações de Não Conformidade -> Plano 5W2H */}
                    <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                      <button
                        type="button"
                        onClick={() => toggleRoutineItemNonCompliant(selectedRun.id, item.id)}
                        className={`text-xs font-bold flex items-center gap-1 ${
                          item.isNonCompliant ? "text-red-700" : "text-stone-500 hover:text-red-600"
                        }`}
                      >
                        <AlertOctagon className="h-3.5 w-3.5" />
                        {item.isNonCompliant ? "Remover Não Conformidade" : "Marcar Não Conforme"}
                      </button>

                      {(item.isNonCompliant || tempOutOfRange) && (
                        <button
                          type="button"
                          onClick={() => {
                            createActionPlan({
                              title: `Corrigir: ${item.label.slice(0, 60)}`,
                              whyReason: `Item não conforme na rotina "${selectedRun.title}"${
                                item.numericValue !== null && item.numericValue !== undefined
                                  ? ` (medição: ${item.numericValue}${item.unit || ""})`
                                  : ""
                              }.`,
                              howSteps: "Verificar causa imediata, corrigir na praça e registrar foto de validação.",
                              originType: "checklist",
                              originId: selectedRun.id,
                              ownerName: activeUser.name,
                              dueDate: new Date().toISOString().slice(0, 10),
                              estimatedCost: 0,
                            });
                          }}
                          className="rounded-lg bg-red-600 text-white px-2.5 py-1 text-[11px] font-bold active:scale-95"
                        >
                          + Criar Plano 5W2H
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            if (completeRoutineRun(selectedRun.id)) {
              setSelectedRunId(null);
            }
          }}
          className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 text-sm font-extrabold shadow-md active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="h-5 w-5" />
          Concluir e Assinar Rotina ({doneCount}/{selectedRun.items.length})
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-stone-900">Rotinas, Checklists & 5S</h2>
          <p className="text-xs text-stone-500">
            Recorrência automática diária, semanal e mensal com prova fotográfica.
          </p>
        </div>
        {activeUser.role !== "staff" && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 text-white px-3 py-2 text-xs font-bold shadow-xs active:scale-95 shrink-0"
          >
            <ClipboardPlus className="h-4 w-4" />
            Nova
          </button>
        )}
      </div>

      {/* Filtros horizontais */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: "all", label: "Todas" },
          { id: "pending", label: "Pendentes" },
          { id: "temperature_pvps", label: "Temp & PVPS" },
          { id: "5s_cleaning", label: "Organização 5S" },
          { id: "periodic", label: "Semanais / Periódicas" },
        ].map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id as typeof filter)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition ${
              filter === chip.id
                ? "bg-stone-900 text-white"
                : "bg-white border border-[#E5DFD4] text-stone-700"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Lista de rotinas */}
      <div className="space-y-2.5">
        {filteredRoutines.map((routine) => {
          const traffic = evaluateRoutineTrafficStatus(routine, nowMinutes);
          const done = routine.items.filter((i) => i.checked).length;
          const total = routine.items.length;
          const score = calculateRoutineScore(routine.items);
          const photoCount = routine.items.filter((i) => i.photoRequired).length;

          return (
            <button
              key={routine.id}
              type="button"
              onClick={() => setSelectedRunId(routine.id)}
              className="w-full rounded-2xl bg-white border border-[#E5DFD4] p-4 text-left shadow-xs hover:border-orange-300 transition active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="rounded-lg bg-stone-100 text-stone-800 px-2 py-0.5 text-[11px] font-bold">
                    {CATEGORY_LABELS[routine.category]}
                  </span>
                  <span className="rounded-lg bg-orange-50 text-orange-700 px-2 py-0.5 text-[11px] font-semibold capitalize">
                    {routine.recurrence === "daily"
                      ? "Diária"
                      : routine.recurrence === "weekly"
                        ? "Semanal"
                        : routine.recurrence === "biweekly"
                          ? "Quinzenal"
                          : "Mensal"}
                  </span>
                </div>

                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    traffic === "completed"
                      ? "bg-emerald-100 text-emerald-800"
                      : traffic === "late"
                        ? "bg-red-100 text-red-700"
                        : traffic === "due_soon"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-stone-100 text-stone-700"
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  {routine.dueTime}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-extrabold text-stone-900">{routine.title}</h3>
              <p className="mt-0.5 text-xs text-stone-500 line-clamp-2">{routine.description}</p>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-stone-600 font-medium">
                  {done}/{total} itens
                  {photoCount > 0 ? ` · ${photoCount} foto(s)` : ""}
                </span>
                <span className="inline-flex items-center gap-1 font-mono font-bold text-stone-900">
                  <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                  {score}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Modal Criar Nova Rotina */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-stone-900">Nova Rotina / Checklist</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl bg-stone-100 text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRoutine} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-700">Nome da rotina</label>
                <input
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex.: Limpeza de Câmara Fria & PVPS"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-stone-700">Categoria</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as RoutineCategory)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700">Recorrência</label>
                  <select
                    value={newRecurrence}
                    onChange={(e) => setNewRecurrence(e.target.value as typeof newRecurrence)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
                  >
                    <option value="daily">Diária</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quinzenal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-stone-700">Praça / Área</label>
                  <input
                    value={newStation}
                    onChange={(e) => setNewStation(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700">Horário Limite</label>
                  <input
                    type="time"
                    value={newDueTime}
                    onChange={(e) => setNewDueTime(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700">Passos do checklist (1 por linha)</label>
                <textarea
                  rows={4}
                  required
                  value={newStepsText}
                  onChange={(e) => setNewStepsText(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                <input
                  type="checkbox"
                  checked={requirePhotoOnLast}
                  onChange={(e) => setRequirePhotoOnLast(e.target.checked)}
                  className="rounded"
                />
                Exigir foto obrigatória no último passo
              </label>

              <button
                type="submit"
                className="w-full rounded-2xl bg-orange-600 text-white py-3 text-sm font-extrabold active:scale-[0.99]"
              >
                Salvar e Agendar Rotina
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
