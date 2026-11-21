"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Flame,
  PauseCircle,
  Send,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { PhotoPicker } from "@/components/PhotoPicker";
import { formatBRL } from "@/lib/utils";
import type { IncidentCategory, MaintenanceTask, ShiftName, WasteReason } from "@/types/domain";

export type QuickActionMode = "menu" | "waste" | "incident" | "maintenance" | "pause" | "handover";

interface QuickActionSheetProps {
  open: boolean;
  mode: QuickActionMode;
  onChangeMode: (mode: QuickActionMode) => void;
  onClose: () => void;
}

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  burn_prep_error: "Queima / Erro de preparo",
  expired_pvps: "Vencimento / PVPS",
  dropped_damaged: "Queda / Avaria interna",
  supplier_quality: "Qualidade / Avaria fornecedor",
  staff_meal_comp: "Consumo equipe / Cortesia",
  closing_leftover: "Sobra de fechamento",
};

export function QuickActionSheet({ open, mode, onChangeMode, onClose }: QuickActionSheetProps) {
  const {
    state,
    logWaste,
    createIncident,
    createMaintenanceTask,
    toggleMenuProductAvailability,
    createShiftHandover,
  } = useApp();

  // Desperdício rápido
  const [wasteItemId, setWasteItemId] = useState(state.inventory[0]?.id || "");
  const [wasteQty, setWasteQty] = useState("1");
  const [wasteReason, setWasteReason] = useState<WasteReason>("burn_prep_error");
  const [wasteShift, setWasteShift] = useState<ShiftName>("night");
  const [wasteNotes, setWasteNotes] = useState("");
  const [wastePhoto, setWastePhoto] = useState<string | null>(null);

  // Ocorrência rápida
  const [incCategory, setIncCategory] = useState<IncidentCategory>("team");
  const [incSeverity, setIncSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [incTitle, setIncTitle] = useState("");
  const [incDesc, setIncDesc] = useState("");
  const [incPhoto, setIncPhoto] = useState<string | null>(null);
  const [incAlsoPlan, setIncAlsoPlan] = useState(true);

  // Manutenção rápida
  const [mntEqId, setMntEqId] = useState(state.equipments[0]?.id || "");
  const [mntPriority, setMntPriority] = useState<MaintenanceTask["priority"]>("urgent");
  const [mntTitle, setMntTitle] = useState("");
  const [mntDesc, setMntDesc] = useState("");
  const [mntPhoto, setMntPhoto] = useState<string | null>(null);

  // Passagem de turno
  const [hndShift, setHndShift] = useState<ShiftName>("morning");
  const [hndSummary, setHndSummary] = useState("");
  const [hndAlerts, setHndAlerts] = useState("");
  const [hndCashOk, setHndCashOk] = useState(true);

  if (!open) return null;

  const selectedWasteItem = state.inventory.find((i) => i.id === wasteItemId) || state.inventory[0];
  const wastePreviewCost = (Number(wasteQty) || 0) * (selectedWasteItem?.unitaryPrice || 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 pb-safe max-h-[90dvh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            {mode !== "menu" && (
              <button
                type="button"
                onClick={() => onChangeMode("menu")}
                className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-700"
              >
                ←
              </button>
            )}
            <h3 className="text-base font-extrabold text-stone-900">
              {mode === "menu" && "Ação Rápida no Turno"}
              {mode === "waste" && "Registrar Desperdício (10s)"}
              {mode === "incident" && "Abrir Ocorrência no Diário"}
              {mode === "maintenance" && "Abrir Chamado de Manutenção"}
              {mode === "pause" && "Pausar Item no Cardápio Takeat"}
              {mode === "handover" && "Registrar Passagem de Turno"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-stone-100 text-stone-600"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Menu principal de ações rápidas */}
        {mode === "menu" && (
          <div className="mt-4 grid grid-cols-1 gap-2.5">
            <button
              type="button"
              onClick={() => onChangeMode("waste")}
              className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-left active:scale-[0.99]"
            >
              <div className="rounded-xl bg-amber-500 text-white p-2.5">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-stone-900">Lançar Desperdício / Perda</p>
                <p className="text-xs text-stone-600">Calcula o R$ perdido na hora com o custo do Takeat</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeMode("incident")}
              className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-3.5 text-left active:scale-[0.99]"
            >
              <div className="rounded-xl bg-orange-600 text-white p-2.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-stone-900">Abrir Ocorrência do Turno</p>
                <p className="text-xs text-stone-600">Equipe, cliente, fornecedor, delivery ou caixa + plano 5W2H</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeMode("maintenance")}
              className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-3.5 text-left active:scale-[0.99]"
            >
              <div className="rounded-xl bg-red-600 text-white p-2.5">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-stone-900">Chamar Manutenção de Equipamento</p>
                <p className="text-xs text-stone-600">Chapa, fritadeira, câmara fria ou coifa com foto</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeMode("pause")}
              className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5 text-left active:scale-[0.99]"
            >
              <div className="rounded-xl bg-stone-900 text-orange-400 p-2.5">
                <PauseCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-stone-900">Pausar / Reativar Item no Takeat</p>
                <p className="text-xs text-stone-600">Acabou insumo? Pausa salão e delivery em 1 toque</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeMode("handover")}
              className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-left active:scale-[0.99]"
            >
              <div className="rounded-xl bg-emerald-600 text-white p-2.5">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-stone-900">Registrar Passagem de Turno</p>
                <p className="text-xs text-stone-600">Resumo e pendências para o próximo gerente não esquecer</p>
              </div>
            </button>
          </div>
        )}

        {/* 1) Formulário Desperdício */}
        {mode === "waste" && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const qty = Number(wasteQty);
              if (!selectedWasteItem || qty <= 0) return;
              logWaste({
                inventoryItemId: selectedWasteItem.id,
                quantity: qty,
                reason: wasteReason,
                shift: wasteShift,
                notes: wasteNotes.trim() || undefined,
                photoDataUrl: wastePhoto,
              });
              setWasteQty("1");
              setWasteNotes("");
              setWastePhoto(null);
              onClose();
            }}
          >
            <div>
              <label className="text-xs font-bold text-stone-700">Insumo ou Intermediário (Takeat)</label>
              <select
                value={wasteItemId}
                onChange={(e) => setWasteItemId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
              >
                {state.inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.unit} · {formatBRL(item.unitaryPrice)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-stone-700">
                  Quantidade ({selectedWasteItem?.unit || "un"})
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.01"
                  required
                  value={wasteQty}
                  onChange={(e) => setWasteQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-700">Turno</label>
                <select
                  value={wasteShift}
                  onChange={(e) => setWasteShift(e.target.value as ShiftName)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
                >
                  <option value="morning">Almoço / Manhã</option>
                  <option value="night">Jantar / Noite</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700">Motivo da perda</label>
              <select
                value={wasteReason}
                onChange={(e) => setWasteReason(e.target.value as WasteReason)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
              >
                {Object.entries(WASTE_REASON_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700">Observação (opcional)</label>
              <input
                value={wasteNotes}
                onChange={(e) => setWasteNotes(e.target.value)}
                placeholder="Ex.: Queimou na chapa durante pico das 20h"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>

            <PhotoPicker compact value={wastePhoto} onChange={setWastePhoto} label="Foto da perda (opcional)" />

            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900">Custo calculado da perda:</span>
              <span className="text-base font-mono font-extrabold text-red-700 tabular-nums">
                -{formatBRL(wastePreviewCost)}
              </span>
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl bg-amber-600 hover:bg-amber-700 text-white py-3.5 text-sm font-extrabold active:scale-[0.99]"
            >
              Confirmar Registro de Desperdício
            </button>
          </form>
        )}

        {/* 2) Formulário Ocorrência */}
        {mode === "incident" && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!incTitle.trim()) return;
              createIncident({
                category: incCategory,
                severity: incSeverity,
                title: incTitle.trim(),
                description: incDesc.trim() || incTitle.trim(),
                shift: "night",
                photoDataUrl: incPhoto,
                alsoCreateActionPlan: incAlsoPlan,
              });
              setIncTitle("");
              setIncDesc("");
              setIncPhoto(null);
              onClose();
            }}
          >
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-stone-700">Categoria</label>
                <select
                  value={incCategory}
                  onChange={(e) => setIncCategory(e.target.value as IncidentCategory)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
                >
                  <option value="team">Equipe / RH</option>
                  <option value="customer">Cliente / Reclamação</option>
                  <option value="supplier">Fornecedor / Entrega</option>
                  <option value="delivery">Delivery / Motoboy</option>
                  <option value="equipment">Equipamento</option>
                  <option value="food_safety">Qualidade / Alimento</option>
                  <option value="cashier">Caixa / Financeiro</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-stone-700">Gravidade</label>
                <select
                  value={incSeverity}
                  onChange={(e) => setIncSeverity(e.target.value as typeof incSeverity)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700">O que aconteceu?</label>
              <input
                required
                value={incTitle}
                onChange={(e) => setIncTitle(e.target.value)}
                placeholder="Ex.: Falta de motoboy / Cliente reclamou do ponto"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700">Detalhes e ação imediata</label>
              <textarea
                rows={3}
                value={incDesc}
                onChange={(e) => setIncDesc(e.target.value)}
                placeholder="O que foi feito na hora e quem acompanhou?"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>

            <PhotoPicker compact value={incPhoto} onChange={setIncPhoto} label="Anexar foto (opcional)" />

            <label className="flex items-center gap-2 text-xs font-bold text-stone-800 bg-orange-50 border border-orange-200 rounded-xl p-2.5">
              <input
                type="checkbox"
                checked={incAlsoPlan}
                onChange={(e) => setIncAlsoPlan(e.target.checked)}
              />
              Já gerar Plano de Ação (5W2H) vinculado a esta ocorrência
            </label>

            <button
              type="submit"
              className="w-full rounded-2xl bg-orange-600 text-white py-3.5 text-sm font-extrabold"
            >
              Registrar Ocorrência
            </button>
          </form>
        )}

        {/* 3) Formulário Manutenção */}
        {mode === "maintenance" && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!mntTitle.trim() || !mntEqId) return;
              createMaintenanceTask({
                equipmentId: mntEqId,
                type: "corrective",
                priority: mntPriority,
                title: mntTitle.trim(),
                description: mntDesc.trim() || "Chamado corretivo aberto pelo celular.",
                dueDate: new Date().toISOString().slice(0, 10),
                cost: 0,
                photoDataUrl: mntPhoto,
              });
              setMntTitle("");
              setMntDesc("");
              setMntPhoto(null);
              onClose();
            }}
          >
            <div>
              <label className="text-xs font-bold text-stone-700">Equipamento</label>
              <select
                value={mntEqId}
                onChange={(e) => setMntEqId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
              >
                {state.equipments.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name} ({eq.area})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700">Urgência</label>
              <select
                value={mntPriority}
                onChange={(e) => setMntPriority(e.target.value as MaintenanceTask["priority"])}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
              >
                <option value="stopped_operation">CRÍTICA — Parou operação!</option>
                <option value="urgent">Urgente (Resolver hoje)</option>
                <option value="normal">Programável (Esta semana)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700">Sintoma / Defeito</label>
              <input
                required
                value={mntTitle}
                onChange={(e) => setMntTitle(e.target.value)}
                placeholder="Ex.: Borracha da câmara fria rasgada / Queimador falhando"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700">Observações para o técnico</label>
              <textarea
                rows={2}
                value={mntDesc}
                onChange={(e) => setMntDesc(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>

            <PhotoPicker compact value={mntPhoto} onChange={setMntPhoto} label="Foto do defeito" />

            <button
              type="submit"
              className="w-full rounded-2xl bg-red-600 text-white py-3.5 text-sm font-extrabold"
            >
              Abrir Chamado de Manutenção
            </button>
          </form>
        )}

        {/* 4) Pausar / Reativar no Takeat */}
        {mode === "pause" && (
          <div className="mt-4 space-y-2.5">
            <p className="text-xs text-stone-600">
              Aciona <code className="font-mono bg-stone-100 px-1 rounded">PATCH /v1/products/&#123;id&#125;/availability</code> para evitar vendas sem insumo.
            </p>
            {state.menuProducts.map((prod) => (
              <div
                key={prod.id}
                className="rounded-2xl border border-[#E5DFD4] p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-900 truncate">{prod.name}</p>
                  <p className="text-xs text-stone-500">{prod.category}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void toggleMenuProductAvailability(prod.id, "available")}
                    className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold ${
                      prod.available
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-700 line-through"
                    }`}
                  >
                    Salão
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleMenuProductAvailability(prod.id, "availableInDelivery")}
                    className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold ${
                      prod.availableInDelivery
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-700 line-through"
                    }`}
                  >
                    Delivery
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 5) Passagem de Turno */}
        {mode === "handover" && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!hndSummary.trim()) return;
              createShiftHandover({
                fromShift: hndShift,
                summary: hndSummary.trim(),
                pendingAlerts: hndAlerts
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
                cashOk: hndCashOk,
              });
              setHndSummary("");
              setHndAlerts("");
              onClose();
            }}
          >
            <div>
              <label className="text-xs font-bold text-stone-700">Qual turno está encerrando?</label>
              <select
                value={hndShift}
                onChange={(e) => setHndShift(e.target.value as ShiftName)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white"
              >
                <option value="morning">Almoço / Manhã → Passando para Noite</option>
                <option value="night">Noite → Passando para Manhã seguinte</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-stone-700">Resumo do movimento e observações</label>
              <textarea
                required
                rows={3}
                value={hndSummary}
                onChange={(e) => setHndSummary(e.target.value)}
                placeholder="Ex.: Movimento forte no almoço, 2 caixas de batata restantes, entrega da padaria prevista às 16h..."
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-stone-700">Alertas obrigatórios para o próximo gerente (1 por linha)</label>
              <textarea
                rows={3}
                value={hndAlerts}
                onChange={(e) => setHndAlerts(e.target.value)}
                placeholder="Ex.: Conferir temperatura da fritadeira 2&#10;Receber NF-e de bebidas"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-stone-800">
              <input
                type="checkbox"
                checked={hndCashOk}
                onChange={(e) => setHndCashOk(e.target.checked)}
              />
              Caixa conferido e sem divergência no Takeat
            </label>
            <button
              type="submit"
              className="w-full rounded-2xl bg-emerald-600 text-white py-3.5 text-sm font-extrabold flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              Publicar Passagem de Turno
            </button>
          </form>
        )}

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
          <Flame className="h-3 w-3 text-orange-500" />
          BrassaOps · Tudo sincronizado e auditado
        </div>
      </div>
    </div>
  );
}
