"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  MessageCircle,
  Plus,
  Target,
  Wrench,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { buildWhatsAppUrl } from "@/lib/domain/whatsapp";
import { formatBRL } from "@/lib/utils";
import type { IncidentCategory } from "@/types/domain";

export type OperationsSubTab = "maintenance" | "incidents" | "plans";

interface OperationsTabProps {
  initialSubTab?: string | null;
  onClearSubTab?: () => void;
  onOpenQuickAction: (mode: "incident" | "maintenance") => void;
}

const INCIDENT_CAT_LABELS: Record<IncidentCategory, string> = {
  team: "Equipe / RH",
  customer: "Cliente",
  supplier: "Fornecedor",
  delivery: "Delivery",
  equipment: "Equipamento",
  food_safety: "Qualidade",
  cashier: "Caixa",
  other: "Outro",
};

export function OperationsTab({
  initialSubTab,
  onClearSubTab,
  onOpenQuickAction,
}: OperationsTabProps) {
  const {
    state,
    activeUser,
    addEquipment,
    updateMaintenanceStatus,
    updateIncidentStatus,
    createActionPlan,
    updateActionPlanStatus,
  } = useApp();

  const [subTab, setSubTab] = useState<OperationsSubTab>(
    (initialSubTab as OperationsSubTab) || "maintenance"
  );
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [showNewEquip, setShowNewEquip] = useState(false);

  // Novo Plano 5W2H
  const [planTitle, setPlanTitle] = useState("");
  const [planWhy, setPlanWhy] = useState("");
  const [planHow, setPlanHow] = useState("");
  const [planOwner, setPlanOwner] = useState(activeUser.name);
  const [planDue, setPlanDue] = useState(new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));
  const [planCost, setPlanCost] = useState("0");

  // Novo Equipamento
  const [eqName, setEqName] = useState("");
  const [eqArea, setEqArea] = useState("Cozinha Quente");
  const [eqModel, setEqModel] = useState("");
  const [eqInterval, setEqInterval] = useState("30");
  const [eqTechName, setEqTechName] = useState("");
  const [eqTechPhone, setEqTechPhone] = useState("5511");

  useEffect(() => {
    if (initialSubTab === "maintenance" || initialSubTab === "incidents" || initialSubTab === "plans") {
      setSubTab(initialSubTab);
      onClearSubTab?.();
    }
  }, [initialSubTab, onClearSubTab]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-stone-900">Manutenção, Ocorrências & Planos</h2>
        <p className="text-xs text-stone-500">
          Nada perdido no WhatsApp: tudo vira histórico, responsável e prazo.
        </p>
      </div>

      {/* Sub-abas */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[#EAE4D9] p-1">
        {[
          {
            id: "maintenance",
            label: `Manutenção (${state.maintenanceTasks.filter((m) => m.status !== "done").length})`,
            icon: Wrench,
          },
          {
            id: "incidents",
            label: `Ocorrências (${state.incidents.filter((i) => i.status !== "resolved").length})`,
            icon: AlertTriangle,
          },
          {
            id: "plans",
            label: `Planos (${state.actionPlans.filter((p) => p.status !== "done").length})`,
            icon: Target,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as OperationsSubTab)}
              className={`flex items-center justify-center gap-1 rounded-xl py-2 px-1 text-[11px] font-extrabold transition ${
                active ? "bg-white text-stone-900 shadow-xs" : "text-stone-600"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-orange-600" : ""}`} />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===================== MANUTENÇÃO ===================== */}
      {subTab === "maintenance" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenQuickAction("maintenance")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-red-600 text-white py-3 text-xs font-extrabold active:scale-[0.99]"
            >
              <Wrench className="h-4 w-4" />
              Abrir Chamado Corretivo
            </button>
            {activeUser.role !== "staff" && (
              <button
                type="button"
                onClick={() => setShowNewEquip(true)}
                className="rounded-2xl bg-white border border-[#E5DFD4] px-3.5 py-3 text-xs font-extrabold text-stone-800"
              >
                + Máquina
              </button>
            )}
          </div>

          {/* Chamados ativos */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 px-1">
              Chamados & Preventivas
            </h3>
            {state.maintenanceTasks.map((task) => {
              const eq = state.equipments.find((e) => e.id === task.equipmentId);
              const wppMsg = `Olá ${eq?.technicianName || "técnico"}! Chamado da ${state.store.name}: ${task.equipmentName} — ${task.title}. ${task.description}`;
              return (
                <div
                  key={task.id}
                  className={`rounded-2xl border p-4 bg-white space-y-2.5 ${
                    task.status === "done"
                      ? "border-emerald-200 opacity-75"
                      : task.priority === "stopped_operation"
                        ? "border-red-300 bg-red-50/40"
                        : "border-[#E5DFD4]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                          task.type === "preventive"
                            ? "bg-sky-100 text-sky-800"
                            : task.priority === "stopped_operation"
                              ? "bg-red-600 text-white"
                              : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {task.type === "preventive"
                          ? "Preventiva"
                          : task.priority === "stopped_operation"
                            ? "PAROU OPERAÇÃO"
                            : "Corretiva Urgente"}
                      </span>
                      <span className="text-[11px] font-mono text-stone-500">Prazo {task.dueDate}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-stone-700">
                      {task.cost > 0 ? formatBRL(task.cost) : "Sem custo"}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-orange-700">{task.equipmentName}</p>
                    <h4 className="text-sm font-extrabold text-stone-900">{task.title}</h4>
                    <p className="mt-0.5 text-xs text-stone-600">{task.description}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                    {eq?.technicianWhatsapp ? (
                      <a
                        href={buildWhatsAppUrl(eq.technicianWhatsapp, wppMsg)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1.5 text-[11px] font-bold"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        {eq.technicianName}
                      </a>
                    ) : (
                      <span />
                    )}

                    {task.status !== "done" ? (
                      <div className="flex gap-1.5">
                        {task.status === "open" && (
                          <button
                            type="button"
                            onClick={() => updateMaintenanceStatus(task.id, "in_progress")}
                            className="rounded-xl bg-stone-100 text-stone-800 px-2.5 py-1.5 text-[11px] font-bold"
                          >
                            Em execução
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => updateMaintenanceStatus(task.id, "done")}
                          className="rounded-xl bg-emerald-600 text-white px-3 py-1.5 text-[11px] font-bold"
                        >
                          Concluir
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" /> Resolvido
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Inventário de Equipamentos + Agenda Preventiva */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 px-1">
              Equipamentos da Loja & Agenda Preventiva
            </h3>
            {state.equipments.map((eq) => {
              const overdue = eq.nextMaintenanceAt <= today;
              return (
                <div
                  key={eq.id}
                  className="rounded-2xl bg-white border border-[#E5DFD4] p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          eq.status === "down"
                            ? "bg-red-600"
                            : eq.status === "attention"
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }`}
                      />
                      <p className="text-sm font-extrabold text-stone-900 truncate">{eq.name}</p>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      {eq.area} · {eq.model} · Custo acum.:{" "}
                      <span className="font-mono font-bold text-stone-700">
                        {formatBRL(eq.accumulatedCost)}
                      </span>
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono font-bold ${
                        overdue ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-700"
                      }`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {eq.nextMaintenanceAt}
                    </span>
                    <p className="text-[10px] text-stone-400 mt-0.5">a cada {eq.preventiveIntervalDays}d</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================== OCORRÊNCIAS ===================== */}
      {subTab === "incidents" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onOpenQuickAction("incident")}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-600 text-white py-3 text-xs font-extrabold active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            Registrar Ocorrência no Diário de Bordo
          </button>

          {state.incidents.map((inc) => (
            <div key={inc.id} className="rounded-2xl bg-white border border-[#E5DFD4] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-stone-100 text-stone-800 px-2.5 py-0.5 text-[10px] font-bold">
                    {INCIDENT_CAT_LABELS[inc.category]}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                      inc.severity === "critical" || inc.severity === "high"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {inc.severity === "critical"
                      ? "Crítica"
                      : inc.severity === "high"
                        ? "Alta"
                        : inc.severity === "medium"
                          ? "Média"
                          : "Baixa"}
                  </span>
                </div>
                <span className="text-[11px] text-stone-400">Por {inc.createdBy}</span>
              </div>

              <h4 className="text-sm font-extrabold text-stone-900">{inc.title}</h4>
              <p className="text-xs text-stone-600 leading-relaxed">{inc.description}</p>

              {inc.photoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={inc.photoDataUrl}
                  alt="Foto da ocorrência"
                  className="h-28 w-full object-cover rounded-xl border border-stone-200"
                />
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => {
                    createActionPlan({
                      title: `Plano p/ ocorrência: ${inc.title.slice(0, 50)}`,
                      whyReason: inc.description,
                      howSteps: "Definir ação corretiva definitiva com a equipe.",
                      originType: "incident",
                      originId: inc.id,
                      ownerName: activeUser.name,
                      dueDate: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
                      estimatedCost: 0,
                    });
                    setSubTab("plans");
                  }}
                  className="text-xs font-bold text-orange-700 flex items-center gap-1"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Virar Plano 5W2H
                </button>

                {inc.status !== "resolved" ? (
                  <button
                    type="button"
                    onClick={() => updateIncidentStatus(inc.id, "resolved")}
                    className="rounded-xl bg-emerald-600 text-white px-3 py-1.5 text-[11px] font-bold"
                  >
                    Marcar Resolvida
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolvida
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===================== PLANOS DE AÇÃO 5W2H ===================== */}
      {subTab === "plans" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowNewPlan(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-stone-900 text-white py-3 text-xs font-extrabold active:scale-[0.99]"
          >
            <Plus className="h-4 w-4 text-orange-400" />
            Criar Plano de Ação (5W2H)
          </button>

          {state.actionPlans.map((plan) => {
            const late = plan.status !== "done" && plan.dueDate < today;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-4 bg-white space-y-2.5 ${
                  plan.status === "done"
                    ? "border-emerald-200 opacity-75"
                    : late
                      ? "border-red-300 bg-red-50/30"
                      : "border-[#E5DFD4]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-orange-100 text-orange-800 px-2.5 py-0.5 text-[10px] font-bold uppercase">
                    Origem: {plan.originType}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                      late ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-700"
                    }`}
                  >
                    Até {plan.dueDate}
                  </span>
                </div>

                <h4 className="text-sm font-extrabold text-stone-900">{plan.title}</h4>
                {plan.whyReason && (
                  <p className="text-xs text-stone-600">
                    <strong>Por quê:</strong> {plan.whyReason}
                  </p>
                )}
                {plan.howSteps && (
                  <p className="text-xs text-stone-600">
                    <strong>Como:</strong> {plan.howSteps}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs">
                  <span className="text-stone-500">
                    Dono: <strong className="text-stone-800">{plan.ownerName}</strong>
                    {plan.estimatedCost > 0 ? ` · ${formatBRL(plan.estimatedCost)}` : ""}
                  </span>

                  <div className="flex gap-1.5">
                    {plan.status === "todo" && (
                      <button
                        type="button"
                        onClick={() => updateActionPlanStatus(plan.id, "doing")}
                        className="rounded-xl bg-amber-100 text-amber-900 px-2.5 py-1.5 text-[11px] font-bold"
                      >
                        Iniciar
                      </button>
                    )}
                    {plan.status !== "done" ? (
                      <button
                        type="button"
                        onClick={() => updateActionPlanStatus(plan.id, "done")}
                        className="rounded-xl bg-emerald-600 text-white px-3 py-1.5 text-[11px] font-bold"
                      >
                        Concluir
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Feito
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Novo Plano 5W2H */}
      {showNewPlan && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-stone-900">Novo Plano de Ação (5W2H)</h3>
              <button
                type="button"
                onClick={() => setShowNewPlan(false)}
                className="p-2 rounded-xl bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!planTitle.trim()) return;
                createActionPlan({
                  title: planTitle.trim(),
                  whyReason: planWhy.trim(),
                  howSteps: planHow.trim(),
                  originType: "manual",
                  ownerName: planOwner,
                  dueDate: planDue,
                  estimatedCost: Number(planCost) || 0,
                });
                setPlanTitle("");
                setPlanWhy("");
                setPlanHow("");
                setShowNewPlan(false);
              }}
            >
              <input
                required
                placeholder="O quê será feito? (Meta clara)"
                value={planTitle}
                onChange={(e) => setPlanTitle(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
              <input
                placeholder="Por quê? (Problema ou indicador)"
                value={planWhy}
                onChange={(e) => setPlanWhy(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
              <textarea
                rows={2}
                placeholder="Como executar (passo a passo)?"
                value={planHow}
                onChange={(e) => setPlanHow(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={planOwner}
                  onChange={(e) => setPlanOwner(e.target.value)}
                  className="rounded-xl border border-stone-300 px-2 py-2.5 text-xs bg-white"
                >
                  {state.team.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={planDue}
                  onChange={(e) => setPlanDue(e.target.value)}
                  className="rounded-xl border border-stone-300 px-2 py-2.5 text-xs font-mono"
                />
                <input
                  type="number"
                  placeholder="Custo R$"
                  value={planCost}
                  onChange={(e) => setPlanCost(e.target.value)}
                  className="rounded-xl border border-stone-300 px-2 py-2.5 text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-2xl bg-orange-600 text-white py-3 text-sm font-extrabold"
              >
                Salvar Plano de Ação
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo Equipamento */}
      {showNewEquip && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-stone-900">Cadastrar Equipamento</h3>
              <button
                type="button"
                onClick={() => setShowNewEquip(false)}
                className="p-2 rounded-xl bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!eqName.trim()) return;
                const interval = Math.max(1, Number(eqInterval) || 30);
                const next = new Date();
                next.setDate(next.getDate() + interval);
                addEquipment({
                  name: eqName.trim(),
                  area: eqArea,
                  model: eqModel.trim() || "Padrão",
                  status: "operational",
                  preventiveIntervalDays: interval,
                  lastMaintenanceAt: today,
                  nextMaintenanceAt: next.toISOString().slice(0, 10),
                  technicianName: eqTechName.trim() || "Técnico Parceiro",
                  technicianWhatsapp: eqTechPhone.replace(/\D/g, ""),
                });
                setEqName("");
                setEqModel("");
                setShowNewEquip(false);
              }}
            >
              <input
                required
                placeholder="Nome do equipamento (Ex.: Prensa de Pão)"
                value={eqName}
                onChange={(e) => setEqName(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Área (Ex.: Cozinha Quente)"
                  value={eqArea}
                  onChange={(e) => setEqArea(e.target.value)}
                  className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
                />
                <input
                  placeholder="Modelo"
                  value={eqModel}
                  onChange={(e) => setEqModel(e.target.value)}
                  className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  placeholder="Preventiva (dias)"
                  value={eqInterval}
                  onChange={(e) => setEqInterval(e.target.value)}
                  className="rounded-xl border border-stone-300 px-2.5 py-2.5 text-xs font-mono"
                />
                <input
                  placeholder="Técnico"
                  value={eqTechName}
                  onChange={(e) => setEqTechName(e.target.value)}
                  className="rounded-xl border border-stone-300 px-2.5 py-2.5 text-xs"
                />
                <input
                  placeholder="WhatsApp"
                  value={eqTechPhone}
                  onChange={(e) => setEqTechPhone(e.target.value)}
                  className="rounded-xl border border-stone-300 px-2.5 py-2.5 text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-2xl bg-stone-900 text-white py-3 text-sm font-extrabold"
              >
                Salvar Equipamento
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
